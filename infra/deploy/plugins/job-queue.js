const fp = require('fastify-plugin');
const jobQueueService = require('../services/job-queue');
const jobProcessor = require('../services/job-processor');
const jobMonitor = require('../services/job-monitor');

async function jobQueuePlugin(fastify, options) {
  // Check if Redis is available (real connection, not mock)
  if (!fastify.isRealRedis) {
    fastify.log.warn('⚠️  Job queue disabled: Redis not available');
    fastify.log.warn('⚠️  Configure Redis (REDIS_URL or REDIS_HOST) to enable job queue functionality');
    
    // Decorate with mock services
    fastify.decorate('jobQueue', null);
    fastify.decorate('jobProcessor', null);
    fastify.decorate('jobMonitor', null);
    fastify.decorate('jobQueueEnabled', false);
    
    return;
  }

  try {
    // Initialize job queue service
    await jobQueueService.initialize();
    
    // Initialize job processor
    await jobProcessor.initialize();
    
    // Start job monitoring
    await jobMonitor.startMonitoring();

    // Decorate fastify instance with services
    fastify.decorate('jobQueue', jobQueueService);
    fastify.decorate('jobProcessor', jobProcessor);
    fastify.decorate('jobMonitor', jobMonitor);
    fastify.decorate('jobQueueEnabled', true);
    
    fastify.log.info('✅ Job queue plugin registered successfully');
  } catch (error) {
    fastify.log.error('❌ Failed to initialize job queue:', error.message);
    
    // Decorate with null services
    fastify.decorate('jobQueue', null);
    fastify.decorate('jobProcessor', null);
    fastify.decorate('jobMonitor', null);
    fastify.decorate('jobQueueEnabled', false);
    
    throw error;
  }

  // Add graceful shutdown
  fastify.addHook('onClose', async (instance, done) => {
    await jobMonitor.stopMonitoring();
    await jobQueueService.shutdown();
    done();
  });

  // Register job queue routes
  fastify.register(async function (fastify) {
    // Middleware to check if job queue is enabled
    const checkJobQueueEnabled = async (request, reply) => {
      if (!fastify.jobQueueEnabled) {
        return reply.code(503).send({
          success: false,
          error: 'Job queue not available - Redis connection required'
        });
      }
    };

    // Get queue statistics
    fastify.get('/api/admin/queues/stats', {
      preHandler: [fastify.authenticate, fastify.requireRole('admin'), checkJobQueueEnabled]
    }, async (request, reply) => {
      try {
        const stats = await jobQueueService.getAllQueueStats();
        return { success: true, data: stats };
      } catch (error) {
        fastify.log.error('Failed to get queue stats:', error);
        return reply.code(500).send({
          success: false,
          error: 'Failed to get queue statistics'
        });
      }
    });

    // Get specific queue status
    fastify.get('/api/admin/queues/:queueName/stats', {
      preHandler: [fastify.authenticate, fastify.requireRole('admin')]
    }, async (request, reply) => {
      try {
        const { queueName } = request.params;
        const stats = await jobQueueService.getQueueStats(queueName);
        return { success: true, data: stats };
      } catch (error) {
        fastify.log.error(`Failed to get stats for queue ${request.params.queueName}:`, error);
        return reply.code(500).send({
          success: false,
          error: `Failed to get statistics for queue ${request.params.queueName}`
        });
      }
    });

    // Get job status
    fastify.get('/api/jobs/:queueName/:jobId/status', {
      preHandler: [fastify.authenticate]
    }, async (request, reply) => {
      try {
        const { queueName, jobId } = request.params;
        const status = await jobQueueService.getJobStatus(queueName, jobId);
        
        if (!status) {
          return reply.code(404).send({
            success: false,
            error: 'Job not found'
          });
        }

        return { success: true, data: status };
      } catch (error) {
        fastify.log.error(`Failed to get job status:`, error);
        return reply.code(500).send({
          success: false,
          error: 'Failed to get job status'
        });
      }
    });

    // Pause queue (admin only)
    fastify.post('/api/admin/queues/:queueName/pause', {
      preHandler: [fastify.authenticate, fastify.requireRole('admin')]
    }, async (request, reply) => {
      try {
        const { queueName } = request.params;
        await jobQueueService.pauseQueue(queueName);
        return { success: true, message: `Queue ${queueName} paused` };
      } catch (error) {
        fastify.log.error(`Failed to pause queue ${request.params.queueName}:`, error);
        return reply.code(500).send({
          success: false,
          error: `Failed to pause queue ${request.params.queueName}`
        });
      }
    });

    // Resume queue (admin only)
    fastify.post('/api/admin/queues/:queueName/resume', {
      preHandler: [fastify.authenticate, fastify.requireRole('admin')]
    }, async (request, reply) => {
      try {
        const { queueName } = request.params;
        await jobQueueService.resumeQueue(queueName);
        return { success: true, message: `Queue ${queueName} resumed` };
      } catch (error) {
        fastify.log.error(`Failed to resume queue ${request.params.queueName}:`, error);
        return reply.code(500).send({
          success: false,
          error: `Failed to resume queue ${request.params.queueName}`
        });
      }
    });

    // Retry failed jobs (admin only)
    fastify.post('/api/admin/queues/:queueName/retry-failed', {
      preHandler: [fastify.authenticate, fastify.requireRole('admin')]
    }, async (request, reply) => {
      try {
        const { queueName } = request.params;
        const { maxJobs = 100 } = request.body || {};
        const retriedCount = await jobQueueService.retryFailedJobs(queueName, maxJobs);
        return { 
          success: true, 
          message: `Retried ${retriedCount} failed jobs in queue ${queueName}`,
          retriedCount 
        };
      } catch (error) {
        fastify.log.error(`Failed to retry failed jobs in queue ${request.params.queueName}:`, error);
        return reply.code(500).send({
          success: false,
          error: `Failed to retry failed jobs in queue ${request.params.queueName}`
        });
      }
    });

    // Clean completed jobs (admin only)
    fastify.post('/api/admin/queues/:queueName/clean', {
      preHandler: [fastify.authenticate, fastify.requireRole('admin')]
    }, async (request, reply) => {
      try {
        const { queueName } = request.params;
        const { grace = 5000, limit = 100 } = request.body || {};
        const cleanedCount = await jobQueueService.cleanQueue(queueName, grace, limit);
        return { 
          success: true, 
          message: `Cleaned ${cleanedCount} completed jobs from queue ${queueName}`,
          cleanedCount 
        };
      } catch (error) {
        fastify.log.error(`Failed to clean queue ${request.params.queueName}:`, error);
        return reply.code(500).send({
          success: false,
          error: `Failed to clean queue ${request.params.queueName}`
        });
      }
    });

    // Get job processing metrics
    fastify.get('/api/admin/jobs/metrics', {
      preHandler: [fastify.authenticate, fastify.requireRole('admin')]
    }, async (request, reply) => {
      try {
        const metrics = jobMonitor.getMetrics();
        return { success: true, data: metrics };
      } catch (error) {
        fastify.log.error('Failed to get job metrics:', error);
        return reply.code(500).send({
          success: false,
          error: 'Failed to get job metrics'
        });
      }
    });

    // Get health status
    fastify.get('/api/admin/jobs/health', {
      preHandler: [fastify.authenticate, fastify.requireRole('admin')]
    }, async (request, reply) => {
      try {
        const health = await jobMonitor.checkHealthStatus();
        return { success: true, data: health };
      } catch (error) {
        fastify.log.error('Failed to get health status:', error);
        return reply.code(500).send({
          success: false,
          error: 'Failed to get health status'
        });
      }
    });

    // Get alerts
    fastify.get('/api/admin/jobs/alerts', {
      preHandler: [fastify.authenticate, fastify.requireRole('admin')]
    }, async (request, reply) => {
      try {
        const { severity, limit = 50 } = request.query;
        const alerts = jobMonitor.getAlerts(severity, parseInt(limit));
        return { success: true, data: alerts };
      } catch (error) {
        fastify.log.error('Failed to get alerts:', error);
        return reply.code(500).send({
          success: false,
          error: 'Failed to get alerts'
        });
      }
    });

    // Clear alerts (admin only)
    fastify.delete('/api/admin/jobs/alerts', {
      preHandler: [fastify.authenticate, fastify.requireRole('admin')]
    }, async (request, reply) => {
      try {
        const clearedCount = jobMonitor.clearAlerts();
        return { 
          success: true, 
          message: `Cleared ${clearedCount} alerts`,
          clearedCount 
        };
      } catch (error) {
        fastify.log.error('Failed to clear alerts:', error);
        return reply.code(500).send({
          success: false,
          error: 'Failed to clear alerts'
        });
      }
    });

    // Add job to queue
    fastify.post('/api/jobs/:queueName', {
      preHandler: [fastify.authenticate]
    }, async (request, reply) => {
      try {
        const { queueName } = request.params;
        const { jobName, data, options = {} } = request.body;
        
        if (!jobName || !data) {
          return reply.code(400).send({
            success: false,
            error: 'jobName and data are required'
          });
        }

        const job = await jobProcessor.addJob(queueName, jobName, data, options);
        return { 
          success: true, 
          data: { 
            jobId: job.id, 
            queueName, 
            status: 'queued' 
          } 
        };
      } catch (error) {
        fastify.log.error('Failed to add job:', error);
        return reply.code(500).send({
          success: false,
          error: 'Failed to add job to queue'
        });
      }
    });
  });
}

module.exports = fp(jobQueuePlugin, {
  name: 'job-queue',
  dependencies: ['auth']
});