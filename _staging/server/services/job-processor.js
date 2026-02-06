const jobQueueService = require('./job-queue');

// Job payload schemas for validation
const JOB_SCHEMAS = {
  'task-planning': {
    required: ['projectId', 'specJson', 'userId'],
    optional: ['buildId', 'options']
  },
  'code-generation': {
    required: ['projectId', 'buildId', 'tasks', 'agentRole'],
    optional: ['iteration', 'previousAttempt']
  },
  'deployment': {
    required: ['projectId', 'buildId', 'deployTarget', 'artifacts'],
    optional: ['environment', 'rollbackVersion']
  }
};

class JobProcessor {
  constructor() {
    this.processors = new Map();
    this.metrics = {
      jobsProcessed: 0,
      jobsSucceeded: 0,
      jobsFailed: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0
    };
  }

  async initialize() {
    // Register default processors
    await this.registerProcessor('task-planning', this.processTaskPlanning.bind(this));
    await this.registerProcessor('code-generation', this.processCodeGeneration.bind(this));
    await this.registerProcessor('deployment', this.processDeployment.bind(this));

    console.log('Job processor initialized with default processors');
  }

  async registerProcessor(queueName, processorFunction, options = {}) {
    if (this.processors.has(queueName)) {
      console.log(`Processor for queue '${queueName}' already registered`);
      return;
    }

    // Wrap processor with error handling and metrics
    const wrappedProcessor = async (job) => {
      const startTime = Date.now();
      
      try {
        // Validate job payload
        this.validateJobPayload(queueName, job.data);
        
        // Update job progress
        await job.updateProgress(10);
        
        // Process the job
        const result = await processorFunction(job);
        
        // Update metrics
        const processingTime = Date.now() - startTime;
        this.updateMetrics(true, processingTime);
        
        // Update job progress to complete
        await job.updateProgress(100);
        
        console.log(`Job ${job.id} processed successfully in ${processingTime}ms`);
        return result;
        
      } catch (error) {
        // Update metrics
        const processingTime = Date.now() - startTime;
        this.updateMetrics(false, processingTime);
        
        console.error(`Job ${job.id} failed after ${processingTime}ms:`, error);
        
        // Check if this is a transient failure that should be retried
        if (this.isTransientFailure(error) && job.attemptsMade < 3) {
          throw error; // Let BullMQ handle the retry
        } else {
          // Escalate to human-in-loop
          await this.escalateToHuman(job, error);
          throw error;
        }
      }
    };

    // Create worker for this queue
    await jobQueueService.createWorker(queueName, wrappedProcessor, {
      concurrency: options.concurrency || 1,
      ...options
    });

    this.processors.set(queueName, processorFunction);
    console.log(`Processor registered for queue '${queueName}'`);
  }

  validateJobPayload(queueName, payload) {
    const schema = JOB_SCHEMAS[queueName];
    if (!schema) {
      throw new Error(`No schema defined for queue '${queueName}'`);
    }

    // Check required fields
    for (const field of schema.required) {
      if (!(field in payload)) {
        throw new Error(`Missing required field '${field}' in job payload`);
      }
    }

    // Validate specific field types
    if (payload.projectId && typeof payload.projectId !== 'string') {
      throw new Error('projectId must be a string');
    }

    if (payload.specJson && typeof payload.specJson !== 'object') {
      throw new Error('specJson must be an object');
    }

    if (payload.tasks && !Array.isArray(payload.tasks)) {
      throw new Error('tasks must be an array');
    }

    console.log(`Job payload validated for queue '${queueName}'`);
  }

  isTransientFailure(error) {
    // Define patterns for transient failures that should be retried
    const transientPatterns = [
      /network/i,
      /timeout/i,
      /connection/i,
      /rate limit/i,
      /service unavailable/i,
      /temporary/i
    ];

    const errorMessage = error.message || error.toString();
    return transientPatterns.some(pattern => pattern.test(errorMessage));
  }

  async escalateToHuman(job, error) {
    try {
      // Create escalation record
      const escalation = {
        jobId: job.id,
        queueName: job.queueName,
        jobData: job.data,
        error: {
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        },
        attemptsMade: job.attemptsMade,
        escalatedAt: new Date().toISOString(),
        status: 'pending_human_review'
      };

      // In a real implementation, this would:
      // 1. Store escalation in database
      // 2. Send notification to administrators
      // 3. Create ticket in support system
      // 4. Update job status to escalated
      
      console.log('Job escalated to human-in-loop:', escalation);
      
      // For now, just log the escalation
      // TODO: Implement actual escalation mechanism
      
    } catch (escalationError) {
      console.error('Failed to escalate job to human:', escalationError);
    }
  }

  updateMetrics(success, processingTime) {
    this.metrics.jobsProcessed++;
    this.metrics.totalProcessingTime += processingTime;
    this.metrics.averageProcessingTime = this.metrics.totalProcessingTime / this.metrics.jobsProcessed;
    
    if (success) {
      this.metrics.jobsSucceeded++;
    } else {
      this.metrics.jobsFailed++;
    }
  }

  // Default processor implementations
  async processTaskPlanning(job) {
    const { projectId, specJson, userId, buildId } = job.data;
    
    console.log(`Processing task planning for project ${projectId}`);
    
    // Update progress
    await job.updateProgress(25);
    
    // Use the actual task planner service
    const taskPlanner = require('./task-planner');
    
    await job.updateProgress(50);
    
    // Generate the complete project plan
    const plan = await taskPlanner.planProject(specJson);
    
    await job.updateProgress(90);
    
    const result = {
      projectId,
      buildId,
      userId,
      plan,
      generatedAt: new Date().toISOString()
    };
    
    console.log(`Task planning completed for project ${projectId}: ${plan.tasks.length} tasks generated`);
    return result;
  }

  async processCodeGeneration(job) {
    const { projectId, buildId, tasks, agentRole, iteration = 1 } = job.data;
    
    console.log(`Processing code generation for build ${buildId}, iteration ${iteration}`);
    
    await job.updateProgress(20);
    
    // Simulate code generation logic
    // In real implementation, this would:
    // 1. Route to appropriate LLM based on agentRole
    // 2. Generate code based on tasks
    // 3. Run tests in sandboxed environment
    // 4. Apply self-fix loop if tests fail
    
    const generatedFiles = [
      {
        path: 'src/models/user.js',
        content: '// Generated user model\nclass User {\n  constructor(data) {\n    this.id = data.id;\n    this.email = data.email;\n  }\n}\n\nmodule.exports = User;',
        type: 'model'
      },
      {
        path: 'src/routes/users.js',
        content: '// Generated user routes\nconst express = require("express");\nconst router = express.Router();\n\nrouter.get("/", (req, res) => {\n  res.json({ users: [] });\n});\n\nmodule.exports = router;',
        type: 'route'
      }
    ];
    
    await job.updateProgress(60);
    
    // Simulate test results
    const testResults = {
      passed: true,
      testsRun: 5,
      testsPassed: 5,
      testsFailed: 0,
      coverage: 85
    };
    
    await job.updateProgress(80);
    
    const result = {
      generatedFiles,
      testResults,
      iteration,
      agentRole,
      generatedAt: new Date().toISOString()
    };
    
    console.log(`Code generation completed for build ${buildId}`);
    return result;
  }

  async processDeployment(job) {
    const { projectId, buildId, deployTarget, artifacts } = job.data;
    
    console.log(`Processing deployment for build ${buildId} to ${deployTarget}`);
    
    await job.updateProgress(30);
    
    // Simulate deployment logic
    // In real implementation, this would:
    // 1. Validate artifacts
    // 2. Deploy to specified target (S3, ECS, Lambda)
    // 3. Run health checks
    // 4. Update deployment status
    
    const deploymentResult = {
      deploymentId: `deploy-${Date.now()}`,
      status: 'success',
      endpoint: `https://${projectId}.example.com`,
      deployedAt: new Date().toISOString(),
      artifacts: artifacts.map(artifact => ({
        ...artifact,
        deployed: true
      }))
    };
    
    await job.updateProgress(90);
    
    console.log(`Deployment completed for build ${buildId}`);
    return deploymentResult;
  }

  // Utility methods
  async addJob(queueName, jobName, data, options = {}) {
    return await jobQueueService.addJob(queueName, jobName, data, options);
  }

  async getJobStatus(queueName, jobId) {
    return await jobQueueService.getJobStatus(queueName, jobId);
  }

  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.jobsProcessed > 0 
        ? (this.metrics.jobsSucceeded / this.metrics.jobsProcessed) * 100 
        : 0
    };
  }

  getRegisteredProcessors() {
    return Array.from(this.processors.keys());
  }
}

module.exports = new JobProcessor();