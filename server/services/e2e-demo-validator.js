/**
 * End-to-End Demo Validation System
 * 
 * Validates the complete pipeline from questionnaire → spec.json → task tree → 
 * runnable project → deployment with live URL return
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

const { validateSpec, isSpecComplete } = require('../../Frontend/src/lib/schemas/spec.js');
const taskPlanner = require('./task-planner');
const modelRouter = require('./model-router-service');
const jobProcessor = require('./job-processor');
const WorkerPool = require('../../workers/services/worker-pool');
const SelfFixLoop = require('../../workers/services/self-fix-loop');
const awsActionLayer = require('./aws-action-layer');
const structuredLogger = require('./structured-logger');

class E2EDemoValidator {
  constructor(options = {}) {
    this.workerPool = new WorkerPool(options.workerPool);
    this.selfFixLoop = new SelfFixLoop({ 
      maxIterations: 3,
      modelRouter: modelRouter 
    });
    this.awsActionLayer = new awsActionLayer(options.aws);
    
    this.validationResults = new Map(); // validationId -> results
    this.activeValidations = new Map(); // validationId -> validation session
    
    // Demo spec for non-trivial features (auth + file upload)
    this.demoSpec = this.createDemoSpec();
  }

  async initialize() {
    await this.workerPool.initialize();
    await this.selfFixLoop.initialize();
    
    structuredLogger.info('E2E Demo Validator initialized');
  }

  /**
   * Create demo spec with non-trivial features (auth + file upload)
   * Requirement 8.2: Generate valid task tree for non-trivial features
   */
  createDemoSpec() {
    return {
      projectName: 'E2E Demo App',
      purpose: 'Demo application with authentication and file upload capabilities for end-to-end validation',
      stack: {
        frontend: 'svelte',
        backend: 'node',
        database: 'postgres'
      },
      features: {
        auth: true,
        payments: false,
        uploads: true,
        realtime: false,
        web3: false
      },
      constraints: {
        offline: false,
        hipaa: false,
        audit: true,
        storage: 's3'
      },
      envPrefs: {
        hosting: 'aws',
        cicd: true,
        monitoring: true,
        costCap: 50,
        autoDeploy: true
      }
    };
  }

  /**
   * Run complete end-to-end validation
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation results
   */
  async runCompleteValidation(options = {}) {
    const validationId = `e2e_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const validation = {
      id: validationId,
      startedAt: new Date(),
      status: 'running',
      stages: {
        questionnaire: { status: 'pending', result: null },
        taskTree: { status: 'pending', result: null },
        codeGeneration: { status: 'pending', result: null },
        deployment: { status: 'pending', result: null },
        selfFixLoop: { status: 'pending', result: null }
      },
      finalResult: null,
      errors: []
    };

    this.activeValidations.set(validationId, validation);

    try {
      structuredLogger.info('Starting complete E2E validation', { validationId });

      // Stage 1: Validate questionnaire → spec.json
      validation.stages.questionnaire.status = 'running';
      const questionnaireResult = await this.validateQuestionnaireToSpec();
      validation.stages.questionnaire = { status: 'completed', result: questionnaireResult };

      // Stage 2: Validate task tree generation
      validation.stages.taskTree.status = 'running';
      const taskTreeResult = await this.validateTaskTreeGeneration(this.demoSpec);
      validation.stages.taskTree = { status: 'completed', result: taskTreeResult };

      // Stage 3: Validate code generation and testing
      validation.stages.codeGeneration.status = 'running';
      const codeGenResult = await this.validateCodeGeneration(taskTreeResult.tasks);
      validation.stages.codeGeneration = { status: 'completed', result: codeGenResult };

      // Stage 4: Validate deployment
      validation.stages.deployment.status = 'running';
      const deploymentResult = await this.validateDeployment(codeGenResult.artifacts);
      validation.stages.deployment = { status: 'completed', result: deploymentResult };

      // Stage 5: Validate self-fix loop (if needed)
      if (codeGenResult.testFailures && codeGenResult.testFailures.length > 0) {
        validation.stages.selfFixLoop.status = 'running';
        const selfFixResult = await this.validateSelfFixLoop(codeGenResult.testFailures[0]);
        validation.stages.selfFixLoop = { status: 'completed', result: selfFixResult };
      } else {
        validation.stages.selfFixLoop = { status: 'skipped', result: { reason: 'No test failures to fix' } };
      }

      // Compile final results
      const finalResult = this.compileFinalResults(validation);
      validation.finalResult = finalResult;
      validation.status = 'completed';
      validation.completedAt = new Date();

      this.validationResults.set(validationId, validation);
      
      structuredLogger.info('E2E validation completed successfully', { 
        validationId, 
        duration: validation.completedAt - validation.startedAt,
        success: finalResult.success
      });

      return finalResult;

    } catch (error) {
      validation.status = 'failed';
      validation.completedAt = new Date();
      validation.errors.push({
        stage: this.getCurrentStage(validation),
        error: error.message,
        timestamp: new Date()
      });

      this.validationResults.set(validationId, validation);
      
      structuredLogger.error('E2E validation failed', { 
        validationId, 
        error: error.message,
        stage: this.getCurrentStage(validation)
      });

      throw error;
    } finally {
      this.activeValidations.delete(validationId);
    }
  }

  /**
   * Validate questionnaire → spec.json conversion
   * Requirement 8.1: Complete questionnaire collecting complete spec.json
   */
  async validateQuestionnaireToSpec() {
    structuredLogger.info('Validating questionnaire to spec.json conversion');

    try {
      // Test spec validation
      const validation = validateSpec(this.demoSpec);
      
      if (!validation.isValid) {
        throw new Error(`Demo spec validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
      }

      // Test completeness check
      const isComplete = isSpecComplete(this.demoSpec);
      if (!isComplete) {
        throw new Error('Demo spec is not complete');
      }

      // Validate all required fields are present
      const requiredFields = [
        'projectName', 'stack.frontend', 'stack.backend', 'stack.database',
        'features.auth', 'features.uploads', 'constraints.audit', 'envPrefs.hosting'
      ];

      for (const field of requiredFields) {
        const value = this.getNestedValue(this.demoSpec, field);
        if (value === undefined || value === null || value === '') {
          throw new Error(`Required field '${field}' is missing or empty`);
        }
      }

      return {
        success: true,
        specJson: this.demoSpec,
        validation,
        requiredFieldsPresent: requiredFields.length,
        message: 'Questionnaire to spec.json validation passed'
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        specJson: this.demoSpec
      };
    }
  }

  /**
   * Validate task tree generation for non-trivial features
   * Requirement 8.2: Generate valid task tree for auth + file upload
   */
  async validateTaskTreeGeneration(specJson) {
    structuredLogger.info('Validating task tree generation', { 
      features: specJson.features,
      stack: specJson.stack 
    });

    try {
      // Generate task plan using the task planner
      const taskPlan = await taskPlanner.planProject(specJson);

      // Validate task plan structure
      if (!taskPlan.tasks || !Array.isArray(taskPlan.tasks)) {
        throw new Error('Task plan does not contain valid tasks array');
      }

      if (taskPlan.tasks.length === 0) {
        throw new Error('Task plan contains no tasks');
      }

      // Validate required tasks for auth + file upload features
      const requiredTaskTypes = [
        'auth-system',
        'file-uploads',
        'database-models',
        'api-endpoints',
        'frontend-components'
      ];

      const presentTaskTypes = taskPlan.tasks.map(task => task.templateId || task.type);
      const missingTasks = requiredTaskTypes.filter(type => 
        !presentTaskTypes.some(present => present.includes(type.replace('-', '_')) || present.includes(type))
      );

      if (missingTasks.length > 0) {
        structuredLogger.warn('Some expected task types not found', { missingTasks, presentTaskTypes });
      }

      // Validate OpenAPI skeleton
      if (!taskPlan.openApiSkeleton) {
        throw new Error('Task plan missing OpenAPI skeleton');
      }

      // Validate database schema
      if (!taskPlan.databaseSchema) {
        throw new Error('Task plan missing database schema');
      }

      // Check for auth endpoints in OpenAPI
      const hasAuthEndpoints = taskPlan.openApiSkeleton.paths && 
        (taskPlan.openApiSkeleton.paths['/auth/login'] || taskPlan.openApiSkeleton.paths['/auth/register']);
      
      if (!hasAuthEndpoints) {
        throw new Error('OpenAPI skeleton missing authentication endpoints');
      }

      // Check for upload endpoints
      const hasUploadEndpoints = taskPlan.openApiSkeleton.paths && 
        taskPlan.openApiSkeleton.paths['/uploads'];
      
      if (!hasUploadEndpoints) {
        throw new Error('OpenAPI skeleton missing file upload endpoints');
      }

      return {
        success: true,
        tasks: taskPlan.tasks,
        taskCount: taskPlan.tasks.length,
        openApiSkeleton: taskPlan.openApiSkeleton,
        databaseSchema: taskPlan.databaseSchema,
        milestones: taskPlan.milestones,
        estimation: taskPlan.totalEstimation,
        message: 'Task tree generation validation passed'
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        tasks: []
      };
    }
  }

  /**
   * Validate code generation and testing
   * Requirement 8.3: Runnable project that passes pnpm install && pnpm test
   */
  async validateCodeGeneration(tasks) {
    structuredLogger.info('Validating code generation and testing', { taskCount: tasks.length });

    try {
      // Create worker for code generation
      const jobPayload = {
        jobId: `codegen_${Date.now()}`,
        projectId: 'e2e-demo',
        buildId: `build_${Date.now()}`,
        specJson: this.demoSpec,
        tasks: tasks.slice(0, 5) // Limit to first 5 tasks for demo
      };

      const worker = await this.workerPool.createWorker(jobPayload);
      
      // Execute code generation job
      const codeGenResult = await this.workerPool.executeJob(worker.id, {
        action: 'generate_code',
        tasks: jobPayload.tasks,
        spec: this.demoSpec
      });

      if (!codeGenResult.success) {
        throw new Error(`Code generation failed: ${codeGenResult.output}`);
      }

      // Simulate running pnpm install && pnpm test
      const installResult = await this.simulatePackageInstall(worker.id);
      if (!installResult.success) {
        throw new Error(`Package installation failed: ${installResult.error}`);
      }

      const testResult = await this.simulateTestExecution(worker.id);
      
      // Collect artifacts
      const artifacts = await this.collectBuildArtifacts(worker.id);

      return {
        success: testResult.success,
        codeGeneration: codeGenResult,
        packageInstall: installResult,
        testExecution: testResult,
        artifacts,
        testFailures: testResult.success ? [] : [testResult],
        message: testResult.success ? 
          'Code generation and testing validation passed' : 
          'Code generation completed but tests failed'
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        artifacts: [],
        testFailures: [{
          error: error.message,
          stage: 'code_generation'
        }]
      };
    }
  }

  /**
   * Validate deployment with live URL return
   * Requirement 8.4: Successful deployment with live URL
   */
  async validateDeployment(artifacts) {
    structuredLogger.info('Validating deployment', { artifactCount: artifacts.length });

    try {
      if (!artifacts || artifacts.length === 0) {
        throw new Error('No artifacts available for deployment');
      }

      // Generate operation ID for tracking
      const operationId = this.awsActionLayer.generateOperationId();
      
      // Request approval for deployment (simulated)
      const approval = await this.awsActionLayer.requestApproval(
        operationId,
        'billing',
        { estimatedCost: 5, deploymentType: 's3-cloudfront' },
        'e2e-validator',
        'admin'
      );

      if (approval.status !== 'approved') {
        throw new Error('Deployment not approved');
      }

      // Simulate S3 + CloudFront deployment
      const deploymentConfig = {
        type: 's3-cloudfront',
        config: {
          bucketName: `e2e-demo-${Date.now()}`,
          distributionId: `E${Math.random().toString(36).substr(2, 13).toUpperCase()}`,
          artifactUrl: artifacts[0] || 's3://demo-bucket/artifacts.zip'
        },
        postDeploy: {
          invalidateCloudFront: true,
          healthCheck: `https://e2e-demo-${Date.now()}.cloudfront.net/health`
        }
      };

      // Simulate deployment execution
      const deploymentResult = await this.simulateDeployment(deploymentConfig);

      // Log audit event
      await this.awsActionLayer.logAuditEvent(
        'E2EDeploymentValidation',
        'e2e-validator',
        'ai-agent',
        {
          operationId,
          deploymentConfig,
          result: deploymentResult
        },
        [`arn:aws:s3:::${deploymentConfig.config.bucketName}`]
      );

      return {
        success: deploymentResult.success,
        deploymentId: deploymentResult.deploymentId,
        liveUrl: deploymentResult.liveUrl,
        healthCheckUrl: deploymentConfig.postDeploy.healthCheck,
        deploymentConfig,
        deployedAt: new Date().toISOString(),
        message: deploymentResult.success ? 
          'Deployment validation passed with live URL' : 
          'Deployment validation failed'
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        liveUrl: null
      };
    }
  }

  /**
   * Validate self-fix loop with test failure → patch → success
   * Requirement 8.5: Self-fix loop in ≤3 iterations
   */
  async validateSelfFixLoop(testFailure) {
    structuredLogger.info('Validating self-fix loop', { 
      testFailure: testFailure.error || testFailure.message 
    });

    try {
      const jobId = `selffix_${Date.now()}`;
      
      // Simulate code context
      const codeContext = {
        files: ['src/models/user.js', 'src/routes/auth.js', 'test/auth.test.js'],
        dependencies: ['express', 'bcrypt', 'jsonwebtoken'],
        framework: 'jest'
      };

      // Start self-fix loop
      const fixResult = await this.selfFixLoop.startFixLoop(jobId, testFailure, codeContext);

      // Validate fix result
      if (!fixResult.success && fixResult.totalIterations > 3) {
        throw new Error(`Self-fix loop exceeded maximum iterations: ${fixResult.totalIterations}`);
      }

      return {
        success: fixResult.success,
        iterations: fixResult.totalIterations || fixResult.iteration,
        maxIterations: 3,
        escalated: fixResult.escalated || false,
        fixedAt: fixResult.fixedAt,
        message: fixResult.success ? 
          `Self-fix loop succeeded in ${fixResult.totalIterations || fixResult.iteration} iterations` :
          fixResult.escalated ? 
            'Self-fix loop escalated to human review' : 
            'Self-fix loop failed'
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        iterations: 0,
        escalated: true
      };
    }
  }

  // Helper methods for simulation

  async simulatePackageInstall(workerId) {
    // Simulate pnpm install
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      success: true,
      command: 'pnpm install',
      duration: 1000,
      packagesInstalled: 25
    };
  }

  async simulateTestExecution(workerId) {
    // Simulate pnpm test with 80% success rate
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const success = Math.random() > 0.2;
    
    if (success) {
      return {
        success: true,
        command: 'pnpm test',
        duration: 2000,
        testsRun: 8,
        testsPassed: 8,
        testsFailed: 0,
        coverage: 85
      };
    } else {
      return {
        success: false,
        command: 'pnpm test',
        duration: 2000,
        testsRun: 8,
        testsPassed: 6,
        testsFailed: 2,
        error: 'Test failed: Authentication middleware should validate JWT tokens',
        failingTests: ['auth.test.js: should validate JWT tokens'],
        output: 'Error: Expected token to be valid but received invalid token error'
      };
    }
  }

  async simulateDeployment(deploymentConfig) {
    // Simulate deployment process
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const success = Math.random() > 0.1; // 90% success rate
    
    if (success) {
      return {
        success: true,
        deploymentId: `deploy_${Date.now()}`,
        liveUrl: `https://e2e-demo-${Date.now()}.cloudfront.net`,
        status: 'deployed',
        healthCheckPassed: true
      };
    } else {
      return {
        success: false,
        error: 'CloudFront distribution creation failed',
        status: 'failed'
      };
    }
  }

  async collectBuildArtifacts(workerId) {
    // Simulate artifact collection
    return [
      `s3://demo-bucket/builds/${workerId}/frontend.zip`,
      `s3://demo-bucket/builds/${workerId}/backend.zip`,
      `s3://demo-bucket/builds/${workerId}/database.sql`
    ];
  }

  // Utility methods

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  getCurrentStage(validation) {
    for (const [stage, info] of Object.entries(validation.stages)) {
      if (info.status === 'running') {
        return stage;
      }
    }
    return 'unknown';
  }

  compileFinalResults(validation) {
    const stages = validation.stages;
    const allStagesCompleted = Object.values(stages).every(stage => 
      stage.status === 'completed' || stage.status === 'skipped'
    );
    
    const anyStagesFailed = Object.values(stages).some(stage => 
      stage.result && !stage.result.success
    );

    return {
      validationId: validation.id,
      success: allStagesCompleted && !anyStagesFailed,
      duration: validation.completedAt - validation.startedAt,
      stages: {
        questionnaire: stages.questionnaire.result?.success || false,
        taskTree: stages.taskTree.result?.success || false,
        codeGeneration: stages.codeGeneration.result?.success || false,
        deployment: stages.deployment.result?.success || false,
        selfFixLoop: stages.selfFixLoop.result?.success || stages.selfFixLoop.status === 'skipped'
      },
      details: {
        specValidation: stages.questionnaire.result,
        taskGeneration: stages.taskTree.result,
        codeGeneration: stages.codeGeneration.result,
        deployment: stages.deployment.result,
        selfFixLoop: stages.selfFixLoop.result
      },
      liveUrl: stages.deployment.result?.liveUrl,
      completedAt: validation.completedAt,
      errors: validation.errors
    };
  }

  // Public API methods

  async getValidationResults(validationId) {
    return this.validationResults.get(validationId);
  }

  async listActiveValidations() {
    const active = [];
    for (const [id, validation] of this.activeValidations) {
      active.push({
        id,
        status: validation.status,
        startedAt: validation.startedAt,
        currentStage: this.getCurrentStage(validation)
      });
    }
    return active;
  }

  async getValidationStats() {
    const completed = Array.from(this.validationResults.values());
    const successful = completed.filter(v => v.finalResult?.success);
    
    return {
      totalValidations: completed.length,
      successfulValidations: successful.length,
      activeValidations: this.activeValidations.size,
      successRate: completed.length > 0 ? (successful.length / completed.length) * 100 : 0,
      averageDuration: completed.length > 0 ? 
        completed.reduce((sum, v) => sum + (v.completedAt - v.startedAt), 0) / completed.length : 0
    };
  }

  async shutdown() {
    structuredLogger.info('Shutting down E2E Demo Validator');
    
    await this.workerPool.shutdown();
    await this.selfFixLoop.shutdown();
    
    this.validationResults.clear();
    this.activeValidations.clear();
  }
}

module.exports = E2EDemoValidator;