/**
 * AI Workers Service
 * Handles code generation and processing tasks with Docker worker pool
 */

const Fastify = require('fastify');
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const fetch = require('node-fetch');
const JobExecutor = require('./services/job-executor');
const ArtifactStorage = require('./services/artifact-storage');
const LogStreaming = require('./services/log-streaming');
const PipelineStageHandlers = require('./services/pipeline-stage-handlers');

const fastify = Fastify({
  logger: true
});

// Initialize services
let jobExecutor;
let artifactStorage;
let logStreaming;
let pipelineStageHandlers;

// Queue workers
let redisConnection;
let deploymentWorker;
let codeGenWorker;
let taskPlanningWorker;

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  const health = {
    status: 'ok',
    service: 'ai-workers',
    timestamp: new Date().toISOString(),
    services: {
      jobExecutor: jobExecutor ? 'initialized' : 'not_initialized',
      artifactStorage: artifactStorage ? 'initialized' : 'not_initialized',
      logStreaming: logStreaming ? 'initialized' : 'not_initialized'
    }
  };

  if (jobExecutor) {
    try {
      const stats = await jobExecutor.getExecutorStats();
      health.stats = stats;
    } catch (error) {
      health.services.jobExecutor = 'error';
    }
  }

  return health;
});

// Execute job endpoint
fastify.post('/api/jobs/execute', async (request, reply) => {
  try {
    const jobPayload = request.body;
    
    // Validate required fields
    if (!jobPayload.jobId || !jobPayload.projectId || !jobPayload.task) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required fields: jobId, projectId, task'
      });
    }

    // Create log stream
    logStreaming.createLogStream(jobPayload.jobId, jobPayload.projectId, jobPayload.buildId);
    
    // Execute job
    const result = await jobExecutor.executeJob(jobPayload);
    
    return {
      success: true,
      data: result
    };
    
  } catch (error) {
    fastify.log.error('Job execution failed:', error);
    
    // Update log stream with error
    if (request.body.jobId) {
      logStreaming.updateStreamStatus(request.body.jobId, 'failed', {
        error: error.message
      });
    }
    
    return reply.code(500).send({
      success: false,
      error: error.message
    });
  }
});

// Get job status endpoint
fastify.get('/api/jobs/:jobId/status', async (request, reply) => {
  try {
    const { jobId } = request.params;
    const status = await jobExecutor.getJobStatus(jobId);
    
    if (!status) {
      return reply.code(404).send({
        success: false,
        error: 'Job not found'
      });
    }

    // Include log stream summary
    const logSummary = logStreaming.getStreamSummary(jobId);
    if (logSummary) {
      status.logStream = logSummary;
    }

    return {
      success: true,
      data: status
    };
    
  } catch (error) {
    fastify.log.error('Failed to get job status:', error);
    return reply.code(500).send({
      success: false,
      error: error.message
    });
  }
});

// List active jobs endpoint
fastify.get('/api/jobs/active', async (request, reply) => {
  try {
    const activeJobs = await jobExecutor.listActiveJobs();
    return {
      success: true,
      data: activeJobs
    };
    
  } catch (error) {
    fastify.log.error('Failed to list active jobs:', error);
    return reply.code(500).send({
      success: false,
      error: error.message
    });
  }
});

// Get executor stats endpoint
fastify.get('/api/stats', async (request, reply) => {
  try {
    const stats = await jobExecutor.getExecutorStats();
    const logStats = logStreaming.getConnectionStats();
    const selfFixStats = await jobExecutor.getSelfFixStats();
    
    return {
      success: true,
      data: {
        executor: stats,
        logging: logStats,
        selfFix: selfFixStats
      }
    };
    
  } catch (error) {
    fastify.log.error('Failed to get stats:', error);
    return reply.code(500).send({
      success: false,
      error: error.message
    });
  }
});

// Get active self-fix sessions endpoint
fastify.get('/api/self-fix/active', async (request, reply) => {
  try {
    const activeSessions = await jobExecutor.getActiveSelfFixSessions();
    return {
      success: true,
      data: activeSessions
    };
    
  } catch (error) {
    fastify.log.error('Failed to get active self-fix sessions:', error);
    return reply.code(500).send({
      success: false,
      error: error.message
    });
  }
});

// Get self-fix history for a job endpoint
fastify.get('/api/jobs/:jobId/self-fix/history', async (request, reply) => {
  try {
    const { jobId } = request.params;
    const history = await jobExecutor.getSelfFixHistory(jobId);
    
    if (!history) {
      return reply.code(404).send({
        success: false,
        error: 'Self-fix history not found for this job'
      });
    }

    return {
      success: true,
      data: history
    };
    
  } catch (error) {
    fastify.log.error('Failed to get self-fix history:', error);
    return reply.code(500).send({
      success: false,
      error: error.message
    });
  }
});

// Get logs endpoint
fastify.get('/api/jobs/:jobId/logs', async (request, reply) => {
  try {
    const { jobId } = request.params;
    const { limit, offset, level, since, until } = request.query;
    
    const logs = logStreaming.getStreamLogs(jobId, {
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
      level,
      since,
      until
    });
    
    if (!logs) {
      return reply.code(404).send({
        success: false,
        error: 'Log stream not found'
      });
    }

    return {
      success: true,
      data: logs
    };
    
  } catch (error) {
    fastify.log.error('Failed to get logs:', error);
    return reply.code(500).send({
      success: false,
      error: error.message
    });
  }
});

// Search logs endpoint
fastify.get('/api/jobs/:jobId/logs/search', async (request, reply) => {
  try {
    const { jobId } = request.params;
    const { q: query, limit, caseSensitive } = request.query;
    
    if (!query) {
      return reply.code(400).send({
        success: false,
        error: 'Query parameter "q" is required'
      });
    }

    const results = logStreaming.searchLogs(jobId, query, {
      limit: limit ? parseInt(limit) : undefined,
      caseSensitive: caseSensitive === 'true'
    });
    
    if (!results) {
      return reply.code(404).send({
        success: false,
        error: 'Log stream not found'
      });
    }

    return {
      success: true,
      data: results
    };
    
  } catch (error) {
    fastify.log.error('Failed to search logs:', error);
    return reply.code(500).send({
      success: false,
      error: error.message
    });
  }
});

// Download artifacts endpoint
fastify.get('/api/jobs/:jobId/artifacts/download', async (request, reply) => {
  try {
    const { jobId } = request.params;
    const { s3Url } = request.query;
    
    if (!s3Url) {
      return reply.code(400).send({
        success: false,
        error: 'S3 URL is required'
      });
    }

    const presignedUrl = await artifactStorage.generatePresignedUrl(s3Url, 3600);
    
    return {
      success: true,
      data: {
        downloadUrl: presignedUrl,
        expiresIn: 3600
      }
    };
    
  } catch (error) {
    fastify.log.error('Failed to generate download URL:', error);
    return reply.code(500).send({
      success: false,
      error: error.message
    });
  }
});

// Pipeline Stage Endpoints

// Stage 6: Empty file creation
fastify.post('/api/pipeline/stage-6/empty-files', async (request, reply) => {
  try {
    if (!pipelineStageHandlers) {
      return reply.code(503).send({
        success: false,
        error: 'Pipeline stage handlers not initialized'
      });
    }
    
    const params = request.body;
    
    if (!params.buildId || !params.projectId || !params.validatedStructure || !params.projectDir) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required fields: buildId, projectId, validatedStructure, projectDir'
      });
    }

    const result = await pipelineStageHandlers.handleEmptyFileCreation(params);
    
    return {
      success: true,
      data: result
    };
    
  } catch (error) {
    fastify.log.error('Stage 6 (empty file creation) failed:', error);
    return reply.code(500).send({
      success: false,
      error: error.message
    });
  }
});

// Stage 7: Code generation
fastify.post('/api/pipeline/stage-7/code-generation', async (request, reply) => {
  try {
    if (!pipelineStageHandlers) {
      return reply.code(503).send({
        success: false,
        error: 'Pipeline stage handlers not initialized'
      });
    }
    
    const params = request.body;
    
    if (!params.buildId || !params.projectId || !params.validatedStructure || 
        !params.docsMd || !params.schemaJson || !params.projectDir) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required fields: buildId, projectId, validatedStructure, docsMd, schemaJson, projectDir'
      });
    }

    const result = await pipelineStageHandlers.handleCodeGeneration(params);
    
    return {
      success: true,
      data: result
    };
    
  } catch (error) {
    fastify.log.error('Stage 7 (code generation) failed:', error);
    return reply.code(500).send({
      success: false,
      error: error.message
    });
  }
});

// Stage 8: Repository creation
fastify.post('/api/pipeline/stage-8/repo-creation', async (request, reply) => {
  try {
    if (!pipelineStageHandlers) {
      return reply.code(503).send({
        success: false,
        error: 'Pipeline stage handlers not initialized'
      });
    }
    
    const params = request.body;
    
    if (!params.buildId || !params.projectId || !params.projectDir || 
        !params.repoName || !params.githubToken) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required fields: buildId, projectId, projectDir, repoName, githubToken'
      });
    }

    const result = await pipelineStageHandlers.handleRepoCreation(params);
    
    return {
      success: true,
      data: result
    };
    
  } catch (error) {
    fastify.log.error('Stage 8 (repo creation) failed:', error);
    return reply.code(500).send({
      success: false,
      error: error.message
    });
  }
});

// Helper function to update backend deployment status
async function updateBackendDeploymentStatus(deploymentId, status, result = null, error = null) {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/deployments/${deploymentId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        status, 
        result, 
        error,
        repoUrl: result?.repoUrl,
        commitSha: result?.commitSha,
        deploymentUrl: result?.deploymentUrl
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update deployment status: ${response.statusText}`);
    }
    
    fastify.log.info(`Updated deployment ${deploymentId} status to ${status}`);
  } catch (error) {
    fastify.log.error(`Failed to update backend deployment status:`, error);
  }
}

// Helper function to update backend build status
async function updateBackendBuildStatus(buildId, status, result = null, error = null) {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/builds/${buildId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, result, error })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update build status: ${response.statusText}`);
    }
    
    fastify.log.info(`Updated build ${buildId} status to ${status}`);
  } catch (error) {
    fastify.log.error(`Failed to update backend build status:`, error);
  }
}

// Initialize queue workers
async function initializeQueueWorkers() {
  try {
    // Check if Redis is available
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    // Skip Redis initialization if not available
    if (!process.env.REDIS_URL) {
      fastify.log.warn('⚠️  Redis not configured - queue workers disabled');
      fastify.log.warn('⚠️  Configure REDIS_URL to enable queue functionality');
      return;
    }
    
    redisConnection = new Redis(redisUrl);
    
    fastify.log.info(`Connecting to Redis at ${redisUrl}`);
    
    // Deployment queue worker
    deploymentWorker = new Worker('deployment', async (job) => {
      fastify.log.info(`Processing deployment job: ${job.id}`);
      
      try {
        const result = await jobExecutor.executeDeploymentJob(job.data);
        
        // Update backend status
        await updateBackendDeploymentStatus(job.data.deploymentId, 'completed', result);
        
        return result;
      } catch (error) {
        fastify.log.error(`Deployment job ${job.id} failed:`, error);
        
        // Update backend with error
        await updateBackendDeploymentStatus(job.data.deploymentId, 'failed', null, error.message);
        
        throw error;
      }
    }, { 
      connection: redisConnection,
      concurrency: 2
    });
    
    // Code generation queue worker
    codeGenWorker = new Worker('code-generation', async (job) => {
      fastify.log.info(`Processing code generation job: ${job.id}`);
      
      try {
        const result = await jobExecutor.executeJob(job.data);
        
        // Update backend status
        await updateBackendBuildStatus(job.data.buildId, 'completed', result);
        
        return result;
      } catch (error) {
        fastify.log.error(`Code generation job ${job.id} failed:`, error);
        
        // Update backend with error
        await updateBackendBuildStatus(job.data.buildId, 'failed', null, error.message);
        
        throw error;
      }
    }, { 
      connection: redisConnection,
      concurrency: 3
    });
    
    // Task planning queue worker
    taskPlanningWorker = new Worker('task-planning', async (job) => {
      fastify.log.info(`Processing task planning job: ${job.id}`);
      
      try {
        const result = await jobExecutor.executeJob(job.data);
        
        // Update backend status
        await updateBackendBuildStatus(job.data.buildId, 'planning_complete', result);
        
        return result;
      } catch (error) {
        fastify.log.error(`Task planning job ${job.id} failed:`, error);
        
        // Update backend with error
        await updateBackendBuildStatus(job.data.buildId, 'failed', null, error.message);
        
        throw error;
      }
    }, { 
      connection: redisConnection,
      concurrency: 5
    });
    
    fastify.log.info('Queue workers initialized successfully');
    
  } catch (error) {
    fastify.log.error('Failed to initialize queue workers:', error);
    throw error;
  }
}

// Initialize services
const initializeServices = async () => {
  try {
    // Initialize artifact storage (skip if AWS is disabled)
    const awsEnabled = process.env.AWS_ENABLED !== 'false';
    
    if (awsEnabled && process.env.AWS_REGION) {
      artifactStorage = new ArtifactStorage({
        region: process.env.AWS_REGION,
        bucketName: process.env.ARTIFACTS_BUCKET,
        logsBucketName: process.env.LOGS_BUCKET
      });
      await artifactStorage.initialize();
      fastify.log.info('Artifact storage initialized with AWS S3');
    } else {
      // Use mock artifact storage for local development
      artifactStorage = {
        initialize: async () => {},
        uploadArtifacts: async () => ({ s3Url: 'mock://local-storage' }),
        downloadArtifacts: async () => ({ localPath: '/tmp/mock' }),
        generatePresignedUrl: async () => 'mock://presigned-url'
      };
      fastify.log.info('Using mock artifact storage (AWS disabled)');
    }
    
    // Initialize log streaming
    logStreaming = new LogStreaming({
      port: process.env.LOG_STREAMING_PORT || 3004
    });
    await logStreaming.initialize();
    
    // Initialize ModelRouter for workers (optional for local dev)
    let modelRouterService = null;
    const skipModelRouter = process.env.SKIP_MODEL_ROUTER === 'true';
    
    if (!skipModelRouter) {
      try {
        const { getModelRouterService } = require('../server/services/model-router-service');
        const modelRouterConfig = require('../server/config/model-router-config');
        
        // Initialize configuration
        const config = modelRouterConfig.initialize();
        
        // Get ModelRouter service instance
        modelRouterService = getModelRouterService(config);
        
        // Initialize the service
        await modelRouterService.initialize();
        fastify.log.info('ModelRouter initialized successfully');
      } catch (error) {
        fastify.log.warn('⚠️  ModelRouter initialization skipped:', error.message);
        fastify.log.info('Workers will operate without AI model routing');
      }
    } else {
      fastify.log.info('⚠️  ModelRouter disabled via SKIP_MODEL_ROUTER flag');
    }
    
    // Initialize job executor (optional for local dev)
    const skipJobExecutor = process.env.SKIP_JOB_EXECUTOR === 'true';
    
    if (!skipJobExecutor) {
      try {
        jobExecutor = new JobExecutor({
          maxConcurrentJobs: process.env.MAX_CONCURRENT_JOBS || 3,
          maxWorkers: process.env.MAX_WORKERS || 5,
          modelRouter: modelRouterService
        });
        await jobExecutor.initialize();
        
        // Set ModelRouter on job executor if available
        if (modelRouterService) {
          jobExecutor.setModelRouter(modelRouterService);
        }
        
        fastify.log.info('Job executor initialized successfully');
      } catch (error) {
        fastify.log.warn('⚠️  Job executor initialization skipped:', error.message);
        fastify.log.info('Workers will operate in minimal mode');
      }
    } else {
      fastify.log.info('⚠️  Job executor disabled via SKIP_JOB_EXECUTOR flag');
    }
    
    // Initialize pipeline stage handlers (optional for local dev)
    const skipPipelineHandlers = process.env.SKIP_PIPELINE_HANDLERS === 'true';
    
    if (!skipPipelineHandlers) {
      try {
        pipelineStageHandlers = new PipelineStageHandlers({
          artifactStorage,
          codeGenerator: jobExecutor ? jobExecutor.codeGenerator : null,
          githubClient: require('../server/services/github-client'),
          workDir: process.env.WORK_DIR || path.resolve(process.cwd(), 'work')
        });
        fastify.log.info('Pipeline stage handlers initialized');
      } catch (error) {
        fastify.log.warn('⚠️  Pipeline stage handlers initialization skipped:', error.message);
        fastify.log.info('Workers will operate without pipeline stage handlers');
      }
    } else {
      fastify.log.info('⚠️  Pipeline stage handlers disabled via SKIP_PIPELINE_HANDLERS flag');
    }
    
    // Set up event handlers
    jobExecutor.on('jobStarted', ({ jobId, executionContext }) => {
      logStreaming.appendLog(jobId, {
        level: 'info',
        message: `Job started: ${executionContext.task} (${executionContext.agentRole})`,
        source: 'executor',
        metadata: { executionContext }
      });
    });
    
    jobExecutor.on('jobCompleted', ({ jobId, result }) => {
      logStreaming.appendLog(jobId, {
        level: 'info',
        message: `Job completed successfully`,
        source: 'executor',
        metadata: { result }
      });
      logStreaming.updateStreamStatus(jobId, 'completed');
    });
    
    jobExecutor.on('jobFailed', ({ jobId, error }) => {
      logStreaming.appendLog(jobId, {
        level: 'error',
        message: `Job failed: ${error.message}`,
        source: 'executor',
        metadata: { error: error.message }
      });
      logStreaming.updateStreamStatus(jobId, 'failed', { error: error.message });
    });
    
    console.log('All services initialized successfully');
    
  } catch (error) {
    console.error('Failed to initialize services:', error);
    throw error;
  }
};

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('Received shutdown signal, starting graceful shutdown...');
  
  try {
    // Close queue workers
    if (deploymentWorker) {
      await deploymentWorker.close();
      console.log('Deployment worker closed');
    }
    if (codeGenWorker) {
      await codeGenWorker.close();
      console.log('Code generation worker closed');
    }
    if (taskPlanningWorker) {
      await taskPlanningWorker.close();
      console.log('Task planning worker closed');
    }
    
    // Close Redis connection
    if (redisConnection) {
      await redisConnection.quit();
      console.log('Redis connection closed');
    }
    
    if (jobExecutor) {
      await jobExecutor.shutdown();
    }
    
    if (logStreaming) {
      await logStreaming.shutdown();
    }
    
    await fastify.close();
    console.log('Graceful shutdown completed');
    process.exit(0);
    
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const start = async () => {
  try {
    // Initialize services first
    await initializeServices();
    
    // Initialize queue workers (optional)
    try {
      await initializeQueueWorkers();
      fastify.log.info('Queue workers initialized and consuming jobs');
    } catch (error) {
      fastify.log.warn('Queue workers not initialized:', error.message);
      fastify.log.info('Workers will operate in HTTP-only mode');
    }
    
    const port = process.env.PORT || 3002;
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`AI Workers service listening on port ${port}`);
    
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();