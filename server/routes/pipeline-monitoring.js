/**
 * Pipeline Monitoring Routes
 * 
 * Provides endpoints for monitoring the new pipeline orchestrator:
 * - Pipeline mode status
 * - Active builds and their stages
 * - Provider health status
 * - Performance metrics
 * - Error rates
 */

module.exports = async function (fastify, opts) {
  const PipelineOrchestrator = require('../services/pipeline-orchestrator');
  const { verifyAllProviders } = require('../services/provider-verification');
  const Build = require('../models/build');

  /**
   * Get pipeline mode and configuration
   */
  fastify.get('/api/pipeline/status', async (request, reply) => {
    try {
      const pipelineMode = process.env.PIPELINE_MODE || 'new';
      const providers = await verifyAllProviders();
      
      const providerStatus = {};
      for (const [name, result] of Object.entries(providers)) {
        providerStatus[name] = {
          available: result.available,
          models: result.models || [],
          error: result.error || null
        };
      }

      return {
        pipelineMode,
        timestamp: new Date().toISOString(),
        providers: providerStatus,
        features: {
          stageBasedRouting: pipelineMode === 'new',
          agentRoleSystem: pipelineMode === 'old',
          backwardCompatibility: true
        }
      };
    } catch (error) {
      fastify.log.error('Error getting pipeline status:', error);
      return reply.code(500).send({
        error: 'Failed to get pipeline status',
        message: error.message
      });
    }
  });

  /**
   * Get active builds and their current stages
   */
  fastify.get('/api/pipeline/builds/active', async (request, reply) => {
    try {
      // Get all running builds
      const builds = await Build.findAll({
        where: { status: 'running' }
      });

      const activeBuilds = builds.map(build => ({
        buildId: build.buildId,
        projectId: build.projectId,
        currentStage: build.currentStage,
        stageStatuses: build.stageStatuses || {},
        startedAt: build.startedAt,
        duration: Date.now() - new Date(build.startedAt).getTime()
      }));

      return {
        count: activeBuilds.length,
        builds: activeBuilds
      };
    } catch (error) {
      fastify.log.error('Error getting active builds:', error);
      return reply.code(500).send({
        error: 'Failed to get active builds',
        message: error.message
      });
    }
  });

  /**
   * Get detailed status for a specific build
   */
  fastify.get('/api/pipeline/builds/:buildId', async (request, reply) => {
    try {
      const { buildId } = request.params;
      
      const build = await Build.findOne({ buildId });
      
      if (!build) {
        return reply.code(404).send({
          error: 'Build not found',
          buildId
        });
      }

      return {
        buildId: build.buildId,
        projectId: build.projectId,
        status: build.status,
        currentStage: build.currentStage,
        stageStatuses: build.stageStatuses || {},
        artifacts: build.artifacts || {},
        failedAt: build.failedAt,
        errorMessage: build.errorMessage,
        createdAt: build.createdAt,
        startedAt: build.startedAt,
        completedAt: build.completedAt,
        duration: build.completedAt 
          ? new Date(build.completedAt).getTime() - new Date(build.startedAt).getTime()
          : Date.now() - new Date(build.startedAt).getTime()
      };
    } catch (error) {
      fastify.log.error('Error getting build status:', error);
      return reply.code(500).send({
        error: 'Failed to get build status',
        message: error.message
      });
    }
  });

  /**
   * Get pipeline performance metrics
   */
  fastify.get('/api/pipeline/metrics', async (request, reply) => {
    try {
      const { timeRange = '24h' } = request.query;
      
      // Calculate time range
      const now = Date.now();
      const ranges = {
        '1h': 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000
      };
      
      const rangeMs = ranges[timeRange] || ranges['24h'];
      const startTime = new Date(now - rangeMs);

      // Get builds in time range
      const builds = await Build.findAll({
        where: {
          createdAt: { $gte: startTime }
        }
      });

      // Calculate metrics
      const totalBuilds = builds.length;
      const completedBuilds = builds.filter(b => b.status === 'completed').length;
      const failedBuilds = builds.filter(b => b.status === 'failed').length;
      const runningBuilds = builds.filter(b => b.status === 'running').length;

      // Calculate average stage durations
      const stageDurations = {};
      const stageFailures = {};
      
      for (const build of builds) {
        if (build.stageStatuses) {
          for (const [stage, status] of Object.entries(build.stageStatuses)) {
            if (!stageDurations[stage]) {
              stageDurations[stage] = [];
              stageFailures[stage] = 0;
            }
            
            if (status.duration) {
              stageDurations[stage].push(status.duration);
            }
            
            if (status.status === 'failed') {
              stageFailures[stage]++;
            }
          }
        }
      }

      const averageStageDurations = {};
      for (const [stage, durations] of Object.entries(stageDurations)) {
        if (durations.length > 0) {
          averageStageDurations[stage] = {
            average: durations.reduce((a, b) => a + b, 0) / durations.length,
            min: Math.min(...durations),
            max: Math.max(...durations),
            count: durations.length
          };
        }
      }

      // Calculate success rate
      const successRate = totalBuilds > 0 
        ? (completedBuilds / totalBuilds * 100).toFixed(2)
        : 0;

      return {
        timeRange,
        period: {
          start: startTime.toISOString(),
          end: new Date(now).toISOString()
        },
        summary: {
          totalBuilds,
          completedBuilds,
          failedBuilds,
          runningBuilds,
          successRate: parseFloat(successRate)
        },
        stages: {
          durations: averageStageDurations,
          failures: stageFailures
        }
      };
    } catch (error) {
      fastify.log.error('Error getting pipeline metrics:', error);
      return reply.code(500).send({
        error: 'Failed to get pipeline metrics',
        message: error.message
      });
    }
  });

  /**
   * Get error logs for failed builds
   */
  fastify.get('/api/pipeline/errors', async (request, reply) => {
    try {
      const { limit = 50, stage } = request.query;
      
      const query = { status: 'failed' };
      if (stage) {
        query.failedAt = stage;
      }

      const failedBuilds = await Build.findAll({
        where: query,
        limit: parseInt(limit),
        order: [['createdAt', 'DESC']]
      });

      const errors = failedBuilds.map(build => ({
        buildId: build.buildId,
        projectId: build.projectId,
        failedAt: build.failedAt,
        errorMessage: build.errorMessage,
        timestamp: build.createdAt,
        stageStatuses: build.stageStatuses || {}
      }));

      return {
        count: errors.length,
        errors
      };
    } catch (error) {
      fastify.log.error('Error getting pipeline errors:', error);
      return reply.code(500).send({
        error: 'Failed to get pipeline errors',
        message: error.message
      });
    }
  });

  /**
   * Health check endpoint
   */
  fastify.get('/api/pipeline/health', async (request, reply) => {
    try {
      const pipelineMode = process.env.PIPELINE_MODE || 'new';
      const providers = await verifyAllProviders();
      
      // Check if all required providers are available
      const requiredProviders = [
        'huggingface',
        'zukijourney',
        'github-models',
        'deepseek',
        'gemini'
      ];
      
      const unavailableProviders = requiredProviders.filter(
        name => !providers[name]?.available
      );

      const healthy = unavailableProviders.length === 0;

      return {
        status: healthy ? 'healthy' : 'degraded',
        pipelineMode,
        timestamp: new Date().toISOString(),
        checks: {
          providers: {
            status: healthy ? 'pass' : 'warn',
            unavailable: unavailableProviders
          }
        }
      };
    } catch (error) {
      fastify.log.error('Error checking pipeline health:', error);
      return reply.code(503).send({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
};
