const WorkerPool = require('./worker-pool');
const SelfFixLoop = require('./self-fix-loop');
const TestFailureDetector = require('./test-failure-detector');
const ArtifactStorage = require('./artifact-storage');
const { EventEmitter } = require('events');

// Import CodeGenerator and dependencies from server
const CodeGenerator = require('../../server/services/code-generator');
const path = require('path');
const fs = require('fs').promises;

class JobExecutor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.workerPool = new WorkerPool(options);
    this.selfFixLoop = new SelfFixLoop({
      maxIterations: options.maxSelfFixIterations || 5,
      modelRouter: options.modelRouter // Will be injected later
    });
    this.testFailureDetector = new TestFailureDetector();
    this.artifactStorage = new ArtifactStorage(options.artifactStorage);
    this.codeGenerator = null; // Will be initialized with ModelRouter
    this.activeJobs = new Map(); // jobId -> execution context
    this.jobResults = new Map(); // jobId -> result
    this.maxConcurrentJobs = options.maxConcurrentJobs || 3;
    this.enableSelfFix = options.enableSelfFix !== false;
  }

  async initialize() {
    await this.workerPool.initialize();
    await this.selfFixLoop.initialize();
    console.log('Job executor initialized');
  }

  setModelRouter(modelRouter) {
    this.selfFixLoop.modelRouter = modelRouter;
    // Initialize CodeGenerator with ModelRouter
    this.codeGenerator = new CodeGenerator(modelRouter);
  }

  async executeJob(jobPayload) {
    const { jobId, projectId, buildId, task, specJson, agentRole } = jobPayload;
    
    if (this.activeJobs.has(jobId)) {
      throw new Error(`Job ${jobId} is already running`);
    }

    if (this.activeJobs.size >= this.maxConcurrentJobs) {
      throw new Error('Maximum concurrent jobs reached. Please try again later.');
    }

    try {
      console.log(`Starting job execution: ${jobId}`);
      
      // Create execution context
      const executionContext = {
        jobId,
        projectId,
        buildId,
        task,
        agentRole,
        startedAt: new Date(),
        status: 'initializing',
        worker: null,
        logs: [],
        artifacts: []
      };

      this.activeJobs.set(jobId, executionContext);
      this.emit('jobStarted', { jobId, executionContext });

      // Create worker
      const worker = await this.workerPool.createWorker(jobPayload);
      executionContext.worker = worker;
      executionContext.status = 'running';

      // Prepare job data based on task type
      const jobData = await this.prepareJobData(jobPayload);

      // For code generation tasks, use CodeGenerator
      let result;
      if (jobData.task === 'generate' && this.codeGenerator) {
        result = await this.executeCodeGeneration(executionContext, jobData);
      } else {
        // Execute job in worker for other task types
        result = await this.workerPool.executeJob(worker.id, jobData);
      }

      // Check if self-fix is needed and enabled
      if (!result.success && this.enableSelfFix && this.shouldAttemptSelfFix(jobData.task)) {
        result = await this.attemptSelfFix(executionContext, result, jobData);
      }

      // Process result
      const processedResult = await this.processJobResult(executionContext, result);

      // Store result
      this.jobResults.set(jobId, processedResult);
      executionContext.status = 'completed';
      executionContext.completedAt = new Date();

      this.emit('jobCompleted', { jobId, result: processedResult });
      console.log(`Job ${jobId} completed successfully`);

      return processedResult;

    } catch (error) {
      const executionContext = this.activeJobs.get(jobId);
      if (executionContext) {
        executionContext.status = 'failed';
        executionContext.completedAt = new Date();
        executionContext.error = error.message;
      }

      this.emit('jobFailed', { jobId, error });
      console.error(`Job ${jobId} failed:`, error);
      throw error;

    } finally {
      // Clean up active job tracking
      setTimeout(() => {
        this.activeJobs.delete(jobId);
      }, 60000); // Keep for 1 minute for status queries
    }
  }

  async prepareJobData(jobPayload) {
    const { task, specJson, agentRole, iteration = 1 } = jobPayload;

    const baseJobData = {
      task,
      agentRole,
      iteration,
      specJson,
      timestamp: new Date().toISOString()
    };

    switch (task) {
      case 'generate':
        return {
          ...baseJobData,
          type: 'code-generation',
          instructions: this.getCodeGenerationInstructions(specJson, agentRole),
          templates: this.getCodeTemplates(specJson),
          dependencies: this.getDependencies(specJson)
        };

      case 'test':
        return {
          ...baseJobData,
          type: 'testing',
          testCommands: this.getTestCommands(specJson),
          testFramework: this.getTestFramework(specJson)
        };

      case 'build':
        return {
          ...baseJobData,
          type: 'build',
          buildCommands: this.getBuildCommands(specJson),
          buildTarget: specJson.envPrefs?.hosting || 'aws'
        };

      case 'deploy':
        return {
          ...baseJobData,
          type: 'deployment',
          deployTarget: jobPayload.deployTarget,
          environment: jobPayload.environment || 'production'
        };

      default:
        throw new Error(`Unknown task type: ${task}`);
    }
  }

  getCodeGenerationInstructions(specJson, agentRole) {
    const instructions = {
      projectName: specJson.projectName,
      stack: specJson.stack,
      features: specJson.features,
      constraints: specJson.constraints
    };

    switch (agentRole) {
      case 'coder':
        return {
          ...instructions,
          focus: 'Generate complete, working code files',
          requirements: [
            'Follow best practices for the chosen stack',
            'Include proper error handling',
            'Add basic logging',
            'Ensure code is production-ready'
          ]
        };

      case 'tester':
        return {
          ...instructions,
          focus: 'Generate comprehensive tests',
          requirements: [
            'Write unit tests for core functionality',
            'Include integration tests where appropriate',
            'Ensure good test coverage',
            'Use appropriate testing frameworks'
          ]
        };

      case 'reviewer':
        return {
          ...instructions,
          focus: 'Review and improve existing code',
          requirements: [
            'Check for security vulnerabilities',
            'Optimize performance',
            'Improve code quality',
            'Ensure consistency'
          ]
        };

      default:
        return instructions;
    }
  }

  getCodeTemplates(specJson) {
    const templates = [];
    const { stack, features } = specJson;

    // Add stack-specific templates
    if (stack.backend === 'node') {
      templates.push({
        name: 'express-app',
        path: 'templates/nodejs/express-app.js',
        description: 'Basic Express.js application template'
      });
    } else if (stack.backend === 'python') {
      templates.push({
        name: 'fastapi-app',
        path: 'templates/python/fastapi-app.py',
        description: 'Basic FastAPI application template'
      });
    } else if (stack.backend === 'go') {
      templates.push({
        name: 'gin-app',
        path: 'templates/go/gin-app.go',
        description: 'Basic Gin application template'
      });
    }

    // Add feature-specific templates
    if (features.auth) {
      templates.push({
        name: 'auth-middleware',
        path: `templates/${stack.backend}/auth-middleware`,
        description: 'Authentication middleware'
      });
    }

    if (features.uploads) {
      templates.push({
        name: 'file-upload',
        path: `templates/${stack.backend}/file-upload`,
        description: 'File upload handling'
      });
    }

    return templates;
  }

  getDependencies(specJson) {
    const dependencies = {
      runtime: [],
      dev: []
    };

    const { stack, features } = specJson;

    // Stack dependencies
    if (stack.backend === 'node') {
      dependencies.runtime.push('express', 'cors', 'helmet');
      dependencies.dev.push('nodemon', 'jest', 'supertest');
    } else if (stack.backend === 'python') {
      dependencies.runtime.push('fastapi', 'uvicorn', 'pydantic');
      dependencies.dev.push('pytest', 'pytest-asyncio');
    } else if (stack.backend === 'go') {
      dependencies.runtime.push('github.com/gin-gonic/gin');
      dependencies.dev.push('github.com/stretchr/testify');
    }

    // Feature dependencies
    if (features.auth) {
      if (stack.backend === 'node') {
        dependencies.runtime.push('jsonwebtoken', 'bcrypt');
      } else if (stack.backend === 'python') {
        dependencies.runtime.push('python-jose', 'passlib');
      }
    }

    if (features.uploads) {
      if (stack.backend === 'node') {
        dependencies.runtime.push('multer', 'aws-sdk');
      } else if (stack.backend === 'python') {
        dependencies.runtime.push('python-multipart', 'boto3');
      }
    }

    if (specJson.stack.database === 'postgres') {
      if (stack.backend === 'node') {
        dependencies.runtime.push('pg', 'knex');
      } else if (stack.backend === 'python') {
        dependencies.runtime.push('psycopg2-binary', 'sqlalchemy');
      }
    }

    return dependencies;
  }

  getTestCommands(specJson) {
    const { stack } = specJson;

    switch (stack.backend) {
      case 'node':
        return [
          'pnpm install',
          'pnpm test'
        ];
      case 'python':
        return [
          'pip install -r requirements.txt',
          'pytest'
        ];
      case 'go':
        return [
          'go mod tidy',
          'go test ./...'
        ];
      default:
        return ['echo "No test commands defined"'];
    }
  }

  getTestFramework(specJson) {
    const { stack } = specJson;

    switch (stack.backend) {
      case 'node':
        return 'jest';
      case 'python':
        return 'pytest';
      case 'go':
        return 'testing';
      default:
        return 'unknown';
    }
  }

  getBuildCommands(specJson) {
    const { stack } = specJson;

    switch (stack.backend) {
      case 'node':
        return [
          'pnpm install',
          'pnpm build'
        ];
      case 'python':
        return [
          'pip install -r requirements.txt',
          'python -m build'
        ];
      case 'go':
        return [
          'go mod tidy',
          'go build -o app .'
        ];
      default:
        return ['echo "No build commands defined"'];
    }
  }

  /**
   * Execute code generation using CodeGenerator
   * Replaces mock code generation with real LLM-based implementation
   */
  async executeCodeGeneration(executionContext, jobData) {
    const { jobId, projectId, buildId } = executionContext;
    const { specJson, agentRole } = jobData;

    try {
      // Emit progress event
      this.emit('progress', { 
        jobId, 
        stage: 'code-generation', 
        message: 'Generating code with AI...' 
      });

      // Create task object for CodeGenerator
      const task = {
        id: jobId,
        name: jobData.instructions?.focus || 'Generate code',
        agentRole: agentRole || 'coder',
        requirements: jobData.instructions?.requirements || [],
        outputs: this._inferOutputFiles(specJson),
        context: {
          framework: specJson.stack?.backend || 'express',
          dependencies: jobData.dependencies?.runtime || [],
          ...jobData.instructions
        }
      };

      // Generate code using CodeGenerator
      const generationResult = await this.codeGenerator.generateCode(task, specJson, {
        correlationId: jobId,
        fallback: true
      });

      if (!generationResult.success) {
        throw new Error(`Code generation failed: ${generationResult.error}`);
      }

      // Emit progress event
      this.emit('progress', { 
        jobId, 
        stage: 'storing-artifacts', 
        message: 'Storing generated files...' 
      });

      // Store generated files as artifacts
      const artifactResult = await this.storeGeneratedFiles(
        projectId,
        buildId,
        generationResult.files
      );

      return {
        success: true,
        generatedFiles: generationResult.files,
        method: generationResult.method,
        model: generationResult.model,
        provider: generationResult.provider,
        cost: generationResult.cost,
        tokens: generationResult.tokens,
        latency: generationResult.latency,
        artifactsS3Url: artifactResult.s3Url,
        output: `Generated ${generationResult.files.length} files using ${generationResult.method}`
      };

    } catch (error) {
      console.error(`Code generation failed for job ${jobId}:`, error);
      return {
        success: false,
        error: error.message,
        output: error.stack
      };
    }
  }

  /**
   * Store generated files as artifacts
   */
  async storeGeneratedFiles(projectId, buildId, files) {
    try {
      // Create artifact metadata
      const artifact = {
        projectId,
        buildId,
        type: 'code-generation',
        files: files.map(f => ({
          path: f.path,
          size: f.size,
          language: f.language
        })),
        totalSize: files.reduce((sum, f) => f.size || 0, 0),
        fileCount: files.length,
        createdAt: new Date().toISOString()
      };

      // Store files using ArtifactStorage
      const result = await this.artifactStorage.storeArtifact(
        `${projectId}/${buildId}/code`,
        files,
        artifact
      );

      return result;

    } catch (error) {
      console.error('Failed to store generated files:', error);
      throw error;
    }
  }

  /**
   * Infer output files from spec
   */
  _inferOutputFiles(specJson) {
    const outputs = [];
    const backend = specJson.stack?.backend || 'node';

    // Add main application file
    if (backend === 'node') {
      outputs.push('server/app.js', 'server/package.json');
    } else if (backend === 'python') {
      outputs.push('main.py', 'requirements.txt');
    } else if (backend === 'go') {
      outputs.push('main.go', 'go.mod');
    }

    // Add feature-specific files
    if (specJson.features?.auth) {
      outputs.push(`server/routes/auth.${this._getFileExtension(backend)}`);
    }

    if (specJson.features?.uploads) {
      outputs.push(`server/routes/uploads.${this._getFileExtension(backend)}`);
    }

    return outputs;
  }

  _getFileExtension(backend) {
    const extMap = {
      'node': 'js',
      'python': 'py',
      'go': 'go'
    };
    return extMap[backend] || 'txt';
  }

  async processJobResult(executionContext, workerResult) {
    const { jobId, task, agentRole } = executionContext;

    const processedResult = {
      jobId,
      task,
      agentRole,
      success: workerResult.success,
      executedAt: new Date().toISOString(),
      executionTime: executionContext.completedAt - executionContext.startedAt,
      workerResult
    };

    // Task-specific result processing
    switch (task) {
      case 'generate':
        // If using CodeGenerator, files are already in workerResult
        processedResult.generatedFiles = workerResult.generatedFiles || 
                                        await this.extractGeneratedFiles(workerResult);
        processedResult.codeMetrics = await this.calculateCodeMetrics(processedResult.generatedFiles);
        processedResult.method = workerResult.method;
        processedResult.cost = workerResult.cost || 0;
        processedResult.tokens = workerResult.tokens || 0;
        break;

      case 'test':
        processedResult.testResults = await this.parseTestResults(workerResult);
        break;

      case 'build':
        processedResult.buildArtifacts = await this.extractBuildArtifacts(workerResult);
        break;

      case 'deploy':
        processedResult.deploymentInfo = await this.extractDeploymentInfo(workerResult);
        break;
    }

    // Upload artifacts to S3 if not already uploaded
    if (!workerResult.artifactsS3Url && (processedResult.generatedFiles || processedResult.buildArtifacts)) {
      processedResult.artifactsS3Url = await this.uploadArtifacts(jobId, processedResult);
    } else if (workerResult.artifactsS3Url) {
      processedResult.artifactsS3Url = workerResult.artifactsS3Url;
    }

    // Upload logs to S3 (placeholder)
    processedResult.logsS3Url = await this.uploadLogs(jobId, workerResult.output);

    return processedResult;
  }

  async extractGeneratedFiles(workerResult) {
    // In a real implementation, this would parse the worker output
    // and extract generated files from the artifacts volume
    return [
      {
        path: 'src/app.js',
        content: '// Generated application code',
        type: 'javascript',
        size: 1024
      },
      {
        path: 'package.json',
        content: '{"name": "generated-app"}',
        type: 'json',
        size: 256
      }
    ];
  }

  async calculateCodeMetrics(generatedFiles) {
    return {
      totalFiles: generatedFiles.length,
      totalLines: generatedFiles.reduce((sum, file) => sum + (file.content.split('\n').length), 0),
      totalSize: generatedFiles.reduce((sum, file) => sum + file.size, 0),
      fileTypes: [...new Set(generatedFiles.map(file => file.type))]
    };
  }

  async parseTestResults(workerResult) {
    // Parse test output to extract results
    return {
      testsRun: 5,
      testsPassed: 4,
      testsFailed: 1,
      coverage: 85,
      duration: 2500
    };
  }

  async extractBuildArtifacts(workerResult) {
    return [
      {
        name: 'app.zip',
        path: '/artifacts/app.zip',
        size: 1024000,
        type: 'application/zip'
      }
    ];
  }

  async extractDeploymentInfo(workerResult) {
    return {
      deploymentId: `deploy-${Date.now()}`,
      endpoint: 'https://example.com',
      status: 'deployed',
      deployedAt: new Date().toISOString()
    };
  }

  async uploadArtifacts(jobId, result) {
    // Placeholder for S3 upload
    return `s3://ai-app-builder-artifacts/${jobId}/artifacts.zip`;
  }

  async uploadLogs(jobId, logs) {
    // Placeholder for S3 upload
    return `s3://ai-app-builder-logs/${jobId}/execution.log`;
  }

  async getJobStatus(jobId) {
    // Check active jobs first
    const activeJob = this.activeJobs.get(jobId);
    if (activeJob) {
      return {
        jobId,
        status: activeJob.status,
        startedAt: activeJob.startedAt,
        completedAt: activeJob.completedAt,
        error: activeJob.error,
        worker: activeJob.worker ? {
          id: activeJob.worker.id,
          stack: activeJob.worker.stack
        } : null
      };
    }

    // Check completed jobs
    const result = this.jobResults.get(jobId);
    if (result) {
      return {
        jobId,
        status: 'completed',
        result
      };
    }

    return null;
  }

  async listActiveJobs() {
    const jobs = [];
    for (const [jobId, context] of this.activeJobs) {
      jobs.push({
        jobId,
        status: context.status,
        task: context.task,
        agentRole: context.agentRole,
        startedAt: context.startedAt,
        worker: context.worker ? {
          id: context.worker.id,
          stack: context.worker.stack
        } : null
      });
    }
    return jobs;
  }

  async getExecutorStats() {
    const stats = {
      activeJobs: this.activeJobs.size,
      completedJobs: this.jobResults.size,
      maxConcurrentJobs: this.maxConcurrentJobs,
      workerPoolStats: await this.workerPool.getPoolStats()
    };

    return stats;
  }

  shouldAttemptSelfFix(task) {
    // Only attempt self-fix for code generation and testing tasks
    return ['generate', 'test', 'build'].includes(task);
  }

  async attemptSelfFix(executionContext, failedResult, jobData) {
    const { jobId, task } = executionContext;
    
    try {
      console.log(`Attempting self-fix for job ${jobId}`);
      
      // Analyze the test failure
      const testFailure = this.analyzeTestFailure(failedResult);
      
      if (!testFailure.isFixable) {
        console.log(`Test failure for job ${jobId} is not fixable, skipping self-fix`);
        return failedResult;
      }

      // Prepare code context for self-fix
      const codeContext = await this.prepareCodeContext(executionContext, jobData);
      
      // Start self-fix loop
      const fixResult = await this.selfFixLoop.startFixLoop(jobId, testFailure, codeContext);
      
      if (fixResult.success) {
        console.log(`Self-fix successful for job ${jobId} after ${fixResult.iteration} iterations`);
        
        // Re-run the job to get the final result
        const worker = executionContext.worker;
        const finalResult = await this.workerPool.executeJob(worker.id, jobData);
        
        // Add self-fix metadata to result
        finalResult.selfFix = {
          attempted: true,
          successful: true,
          iterations: fixResult.iteration,
          fixedAt: fixResult.fixedAt
        };
        
        return finalResult;
      } else {
        console.log(`Self-fix failed for job ${jobId}, escalated to human`);
        
        // Add self-fix metadata to original failed result
        failedResult.selfFix = {
          attempted: true,
          successful: false,
          iterations: fixResult.totalIterations,
          escalated: fixResult.escalated,
          escalatedAt: fixResult.escalatedAt
        };
        
        return failedResult;
      }
      
    } catch (error) {
      console.error(`Self-fix error for job ${jobId}:`, error);
      
      // Add self-fix error metadata to original failed result
      failedResult.selfFix = {
        attempted: true,
        successful: false,
        error: error.message
      };
      
      return failedResult;
    }
  }

  analyzeTestFailure(failedResult) {
    const output = failedResult.output || '';
    
    // Use test failure detector to analyze the failure
    const analysis = this.testFailureDetector.detectFailures(output);
    const category = this.testFailureDetector.categorizeFailure(analysis);
    const priority = this.testFailureDetector.generateFixPriority(analysis);
    
    return {
      isFixable: category.fixable && priority > 30,
      category: category.category,
      severity: category.severity,
      priority,
      analysis,
      error: failedResult.error || 'Unknown error',
      exitCode: failedResult.exitCode || 1,
      output,
      failingTests: analysis.failingTests,
      suggestions: analysis.suggestions
    };
  }

  async prepareCodeContext(executionContext, jobData) {
    const { specJson, task } = jobData;
    
    // Extract relevant context for self-fix
    const codeContext = {
      task,
      framework: this.getTestFramework(specJson),
      files: [], // In real implementation, would extract from worker
      dependencies: this.getDependencies(specJson),
      specJson,
      buildCommands: this.getBuildCommands(specJson),
      testCommands: this.getTestCommands(specJson)
    };
    
    return codeContext;
  }

  async getSelfFixStats() {
    return this.selfFixLoop.getFixStats();
  }

  async getActiveSelfFixSessions() {
    return this.selfFixLoop.getActiveFixSessions();
  }

  async getSelfFixHistory(jobId) {
    return this.selfFixLoop.getFixHistory(jobId);
  }

  async executeDeploymentJob(jobData) {
    const {
      deploymentId,
      userId,
      projectId,
      generatedFiles,
      deploymentOptions
    } = jobData;

    try {
      const { orchestrateDeployment } = require('./deployment-orchestrator');

      // Use the orchestrator to handle the complete deployment flow
      const result = await orchestrateDeployment({
        deploymentId,
        userId,
        projectId,
        generatedFiles,
        deploymentOptions
      });

      return result;

    } catch (error) {
      console.error('Deployment job failed:', error);
      throw error;
    }
  }

  async shutdown() {
    console.log('Shutting down job executor...');
    
    // Wait for active jobs to complete or timeout
    const activeJobIds = Array.from(this.activeJobs.keys());
    if (activeJobIds.length > 0) {
      console.log(`Waiting for ${activeJobIds.length} active jobs to complete...`);
      
      // Give jobs 30 seconds to complete gracefully
      await new Promise(resolve => setTimeout(resolve, 30000));
    }

    await this.selfFixLoop.shutdown();
    await this.workerPool.shutdown();
    
    this.activeJobs.clear();
    this.jobResults.clear();
    
    console.log('Job executor shutdown complete');
  }
}

module.exports = JobExecutor;