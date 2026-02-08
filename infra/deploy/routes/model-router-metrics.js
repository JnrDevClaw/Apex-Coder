/**
 * Model Router Metrics Routes
 * API endpoints for accessing model router metrics
 * 
 * Requirements: 6.7
 */

const metricsCollector = require('../services/model-router/metrics-collector');
const costTracker = require('../services/model-router/cost-tracker');
const tokenTracker = require('../services/model-router/token-tracker');
const MetricsAggregator = require('../services/model-router/metrics-aggregator');
const { getCacheManager } = require('../services/model-router');
const { performanceMonitor } = require('../services/model-router/performance-monitor');

// Create aggregator instance
const metricsAggregator = new MetricsAggregator(
  metricsCollector,
  costTracker,
  tokenTracker
);

/**
 * Model Router Metrics Routes
 * @param {FastifyInstance} fastify
 * @param {Object} options
 */
async function modelRouterMetricsRoutes(fastify, options) {
  // Register routes under /api/model-router prefix
  fastify.register(async function (fastify) {
  /**
   * GET /api/model-router/metrics
   * Get aggregated metrics with optional filters
   */
  fastify.get('/metrics', {
    schema: {
      description: 'Get aggregated model router metrics',
      tags: ['model-router', 'metrics'],
      querystring: {
        type: 'object',
        properties: {
          provider: { type: 'string', description: 'Filter by provider' },
          model: { type: 'string', description: 'Filter by model' },
          role: { type: 'string', description: 'Filter by agent role' },
          projectId: { type: 'string', description: 'Filter by project ID' },
          status: { type: 'string', enum: ['success', 'error'], description: 'Filter by status' },
          startDate: { type: 'string', format: 'date-time', description: 'Filter by start date' },
          endDate: { type: 'string', format: 'date-time', description: 'Filter by end date' },
          groupBy: { type: 'string', enum: ['provider', 'model', 'role', 'project', 'none'], description: 'Group results by' }
        }
      },
      response: {
        200: {
          type: 'object',
          description: 'Aggregated metrics'
        }
      }
    }
  }, async (request, reply) => {
    try {
      const filters = {
        provider: request.query.provider,
        model: request.query.model,
        role: request.query.role,
        projectId: request.query.projectId,
        status: request.query.status,
        startDate: request.query.startDate ? new Date(request.query.startDate) : undefined,
        endDate: request.query.endDate ? new Date(request.query.endDate) : undefined,
        groupBy: request.query.groupBy || 'none'
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => 
        filters[key] === undefined && delete filters[key]
      );

      const metrics = metricsAggregator.getAggregatedMetrics(filters);

      return reply.send({
        success: true,
        data: metrics,
        filters
      });
    } catch (error) {
      fastify.log.error('Error fetching metrics:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch metrics',
        message: error.message
      });
    }
  });

  /**
   * GET /api/model-router/metrics/by-provider
   * Get metrics grouped by provider
   */
  fastify.get('/metrics/by-provider', {
    schema: {
      description: 'Get metrics grouped by provider',
      tags: ['model-router', 'metrics'],
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' }
        }
      },
      response: {
        200: {
          type: 'object',
          description: 'Provider-grouped metrics'
        }
      }
    }
  }, async (request, reply) => {
    try {
      const filters = {
        startDate: request.query.startDate ? new Date(request.query.startDate) : undefined,
        endDate: request.query.endDate ? new Date(request.query.endDate) : undefined
      };

      Object.keys(filters).forEach(key => 
        filters[key] === undefined && delete filters[key]
      );

      const metrics = metricsAggregator.getByProvider(filters);

      return reply.send({
        success: true,
        data: metrics
      });
    } catch (error) {
      fastify.log.error('Error fetching provider metrics:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch provider metrics',
        message: error.message
      });
    }
  });

  /**
   * GET /api/model-router/metrics/by-role
   * Get metrics grouped by role
   */
  fastify.get('/metrics/by-role', {
    schema: {
      description: 'Get metrics grouped by role',
      tags: ['model-router', 'metrics'],
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' }
        }
      },
      response: {
        200: {
          type: 'object',
          description: 'Role-grouped metrics'
        }
      }
    }
  }, async (request, reply) => {
    try {
      const filters = {
        startDate: request.query.startDate ? new Date(request.query.startDate) : undefined,
        endDate: request.query.endDate ? new Date(request.query.endDate) : undefined
      };

      Object.keys(filters).forEach(key => 
        filters[key] === undefined && delete filters[key]
      );

      const metrics = metricsAggregator.getByRole(filters);

      return reply.send({
        success: true,
        data: metrics
      });
    } catch (error) {
      fastify.log.error('Error fetching role metrics:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch role metrics',
        message: error.message
      });
    }
  });

  /**
   * GET /api/model-router/metrics/by-project
   * Get metrics grouped by project
   */
  fastify.get('/metrics/by-project', {
    schema: {
      description: 'Get metrics grouped by project',
      tags: ['model-router', 'metrics'],
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' }
        }
      },
      response: {
        200: {
          type: 'object',
          description: 'Project-grouped metrics'
        }
      }
    }
  }, async (request, reply) => {
    try {
      const filters = {
        startDate: request.query.startDate ? new Date(request.query.startDate) : undefined,
        endDate: request.query.endDate ? new Date(request.query.endDate) : undefined
      };

      Object.keys(filters).forEach(key => 
        filters[key] === undefined && delete filters[key]
      );

      const metrics = metricsAggregator.getByProject(filters);

      return reply.send({
        success: true,
        data: metrics
      });
    } catch (error) {
      fastify.log.error('Error fetching project metrics:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch project metrics',
        message: error.message
      });
    }
  });

  /**
   * GET /api/model-router/metrics/provider/:provider
   * Get comprehensive metrics for a specific provider
   */
  fastify.get('/metrics/provider/:provider', {
    schema: {
      description: 'Get comprehensive metrics for a specific provider',
      tags: ['model-router', 'metrics'],
      params: {
        type: 'object',
        required: ['provider'],
        properties: {
          provider: { type: 'string', description: 'Provider name' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' }
        }
      },
      response: {
        200: {
          type: 'object',
          description: 'Provider metrics'
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { provider } = request.params;
      const filters = {
        startDate: request.query.startDate ? new Date(request.query.startDate) : undefined,
        endDate: request.query.endDate ? new Date(request.query.endDate) : undefined
      };

      Object.keys(filters).forEach(key => 
        filters[key] === undefined && delete filters[key]
      );

      const metrics = metricsAggregator.getProviderSummary(provider, filters);

      return reply.send({
        success: true,
        data: metrics
      });
    } catch (error) {
      fastify.log.error('Error fetching provider summary:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch provider summary',
        message: error.message
      });
    }
  });

  /**
   * GET /api/model-router/metrics/role/:role
   * Get comprehensive metrics for a specific role
   */
  fastify.get('/metrics/role/:role', {
    schema: {
      description: 'Get comprehensive metrics for a specific role',
      tags: ['model-router', 'metrics'],
      params: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { type: 'string', description: 'Role name' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' }
        }
      },
      response: {
        200: {
          type: 'object',
          description: 'Role metrics'
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { role } = request.params;
      const filters = {
        startDate: request.query.startDate ? new Date(request.query.startDate) : undefined,
        endDate: request.query.endDate ? new Date(request.query.endDate) : undefined
      };

      Object.keys(filters).forEach(key => 
        filters[key] === undefined && delete filters[key]
      );

      const metrics = metricsAggregator.getRoleSummary(role, filters);

      return reply.send({
        success: true,
        data: metrics
      });
    } catch (error) {
      fastify.log.error('Error fetching role summary:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch role summary',
        message: error.message
      });
    }
  });

  /**
   * GET /api/model-router/metrics/time-series
   * Get time-series metrics
   */
  fastify.get('/metrics/time-series', {
    schema: {
      description: 'Get time-series metrics',
      tags: ['model-router', 'metrics'],
      querystring: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['hour', 'day', 'week', 'month'], default: 'day' },
          provider: { type: 'string' },
          role: { type: 'string' },
          projectId: { type: 'string' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' }
        }
      },
      response: {
        200: {
          type: 'object',
          description: 'Time-series metrics'
        }
      }
    }
  }, async (request, reply) => {
    try {
      const period = request.query.period || 'day';
      const filters = {
        provider: request.query.provider,
        role: request.query.role,
        projectId: request.query.projectId,
        startDate: request.query.startDate ? new Date(request.query.startDate) : undefined,
        endDate: request.query.endDate ? new Date(request.query.endDate) : undefined
      };

      Object.keys(filters).forEach(key => 
        filters[key] === undefined && delete filters[key]
      );

      const metrics = metricsAggregator.getTimeSeriesMetrics(period, filters);

      return reply.send({
        success: true,
        data: metrics,
        period
      });
    } catch (error) {
      fastify.log.error('Error fetching time-series metrics:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch time-series metrics',
        message: error.message
      });
    }
  });

  /**
   * GET /api/model-router/metrics/summary
   * Get comprehensive metrics summary
   */
  fastify.get('/metrics/summary', {
    schema: {
      description: 'Get comprehensive metrics summary',
      tags: ['model-router', 'metrics'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' }
        }
      },
      response: {
        200: {
          type: 'object',
          description: 'Metrics summary'
        }
      }
    }
  }, async (request, reply) => {
    try {
      const limit = request.query.limit || 5;
      const filters = {
        startDate: request.query.startDate ? new Date(request.query.startDate) : undefined,
        endDate: request.query.endDate ? new Date(request.query.endDate) : undefined
      };

      Object.keys(filters).forEach(key => 
        filters[key] === undefined && delete filters[key]
      );

      const topPerformers = metricsAggregator.getTopPerformers(limit, filters);
      const performanceSummary = metricsCollector.getSummary();
      const costSummary = costTracker.getSummary();
      const tokenSummary = tokenTracker.getSummary();

      return reply.send({
        success: true,
        data: {
          topPerformers,
          performance: performanceSummary,
          costs: costSummary,
          tokens: tokenSummary
        }
      });
    } catch (error) {
      fastify.log.error('Error fetching metrics summary:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch metrics summary',
        message: error.message
      });
    }
  });

  /**
   * GET /api/model-router/metrics/success-rate
   * Get success rate by provider
   */
  fastify.get('/metrics/success-rate', {
    schema: {
      description: 'Get success rate by provider',
      tags: ['model-router', 'metrics'],
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' }
        }
      },
      response: {
        200: {
          type: 'object',
          description: 'Success rates by provider'
        }
      }
    }
  }, async (request, reply) => {
    try {
      const filters = {
        startDate: request.query.startDate ? new Date(request.query.startDate) : undefined,
        endDate: request.query.endDate ? new Date(request.query.endDate) : undefined
      };

      Object.keys(filters).forEach(key => 
        filters[key] === undefined && delete filters[key]
      );

      const successRates = metricsAggregator.getSuccessRateByProvider(filters);

      return reply.send({
        success: true,
        data: successRates
      });
    } catch (error) {
      fastify.log.error('Error fetching success rates:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch success rates',
        message: error.message
      });
    }
  });

  /**
   * GET /api/model-router/metrics/latency
   * Get average latency by provider
   */
  fastify.get('/metrics/latency', {
    schema: {
      description: 'Get average latency by provider',
      tags: ['model-router', 'metrics'],
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' }
        }
      },
      response: {
        200: {
          type: 'object',
          description: 'Average latencies by provider'
        }
      }
    }
  }, async (request, reply) => {
    try {
      const filters = {
        startDate: request.query.startDate ? new Date(request.query.startDate) : undefined,
        endDate: request.query.endDate ? new Date(request.query.endDate) : undefined
      };

      Object.keys(filters).forEach(key => 
        filters[key] === undefined && delete filters[key]
      );

      const latencies = metricsAggregator.getAverageLatencyByProvider(filters);

      return reply.send({
        success: true,
        data: latencies
      });
    } catch (error) {
      fastify.log.error('Error fetching latencies:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch latencies',
        message: error.message
      });
    }
  });

  /**
   * GET /api/model-router/metrics/costs
   * Get total cost by provider
   */
  fastify.get('/metrics/costs', {
    schema: {
      description: 'Get total cost by provider',
      tags: ['model-router', 'metrics'],
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' }
        }
      },
      response: {
        200: {
          type: 'object',
          description: 'Total costs by provider'
        }
      }
    }
  }, async (request, reply) => {
    try {
      const filters = {
        startDate: request.query.startDate ? new Date(request.query.startDate) : undefined,
        endDate: request.query.endDate ? new Date(request.query.endDate) : undefined
      };

      Object.keys(filters).forEach(key => 
        filters[key] === undefined && delete filters[key]
      );

      const costs = metricsAggregator.getTotalCostByProvider(filters);

      return reply.send({
        success: true,
        data: costs
      });
    } catch (error) {
      fastify.log.error('Error fetching costs:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch costs',
        message: error.message
      });
    }
  });

  /**
   * POST /api/model-router/metrics/export
   * Export metrics data
   */
  fastify.post('/metrics/export', {
    schema: {
      description: 'Export metrics data as JSON',
      tags: ['model-router', 'metrics'],
      body: {
        type: 'object',
        properties: {
          provider: { type: 'string' },
          role: { type: 'string' },
          projectId: { type: 'string' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' }
        }
      },
      response: {
        200: {
          type: 'object',
          description: 'Exported metrics data'
        }
      }
    }
  }, async (request, reply) => {
    try {
      const filters = {
        provider: request.body.provider,
        role: request.body.role,
        projectId: request.body.projectId,
        startDate: request.body.startDate ? new Date(request.body.startDate) : undefined,
        endDate: request.body.endDate ? new Date(request.body.endDate) : undefined
      };

      Object.keys(filters).forEach(key => 
        filters[key] === undefined && delete filters[key]
      );

      const performanceExport = metricsCollector.export(filters);
      const costExport = costTracker.export(filters);
      const tokenExport = tokenTracker.export(filters);

      return reply.send({
        success: true,
        data: {
          performance: JSON.parse(performanceExport),
          costs: JSON.parse(costExport),
          tokens: JSON.parse(tokenExport),
          exportedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      fastify.log.error('Error exporting metrics:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to export metrics',
        message: error.message
      });
    }
  });

  /**
   * GET /api/model-router/cache/stats
   * Get cache statistics
   */
  fastify.get('/cache/stats', {
    schema: {
      description: 'Get cache statistics including hit rate and size',
      tags: ['model-router', 'cache'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                hits: { type: 'number' },
                misses: { type: 'number' },
                sets: { type: 'number' },
                evictions: { type: 'number' },
                expirations: { type: 'number' },
                size: { type: 'number' },
                maxSize: { type: 'number' },
                ttl: { type: 'number' },
                hitRate: { type: 'string' },
                totalRequests: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const cacheManager = getCacheManager();
      const stats = cacheManager.getStats();

      return reply.send({
        success: true,
        data: stats
      });
    } catch (error) {
      fastify.log.error('Error fetching cache stats:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch cache statistics',
        message: error.message
      });
    }
  });

  /**
   * DELETE /api/model-router/cache/:key
   * Invalidate a specific cache entry by key
   */
  fastify.delete('/cache/:key', {
    schema: {
      description: 'Invalidate a specific cache entry',
      tags: ['model-router', 'cache'],
      params: {
        type: 'object',
        required: ['key'],
        properties: {
          key: { type: 'string', description: 'Cache key to invalidate' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            deleted: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { key } = request.params;
      const cacheManager = getCacheManager();
      const deleted = cacheManager.invalidate(key);

      return reply.send({
        success: true,
        deleted
      });
    } catch (error) {
      fastify.log.error('Error invalidating cache entry:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to invalidate cache entry',
        message: error.message
      });
    }
  });

  /**
   * POST /api/model-router/cache/invalidate-pattern
   * Invalidate cache entries matching a pattern
   */
  fastify.post('/cache/invalidate-pattern', {
    schema: {
      description: 'Invalidate cache entries matching a pattern',
      tags: ['model-router', 'cache'],
      body: {
        type: 'object',
        required: ['pattern'],
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to match cache keys' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            count: { type: 'number', description: 'Number of entries invalidated' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { pattern } = request.body;
      const cacheManager = getCacheManager();
      const count = cacheManager.invalidatePattern(pattern);

      return reply.send({
        success: true,
        count
      });
    } catch (error) {
      fastify.log.error('Error invalidating cache by pattern:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to invalidate cache by pattern',
        message: error.message
      });
    }
  });

  /**
   * DELETE /api/model-router/cache
   * Clear all cache entries
   */
  fastify.delete('/cache', {
    schema: {
      description: 'Clear all cache entries',
      tags: ['model-router', 'cache'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const cacheManager = getCacheManager();
      cacheManager.clear();

      return reply.send({
        success: true,
        message: 'Cache cleared successfully'
      });
    } catch (error) {
      fastify.log.error('Error clearing cache:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to clear cache',
        message: error.message
      });
    }
  });

  /**
   * POST /api/model-router/cache/reset-stats
   * Reset cache statistics
   */
  fastify.post('/cache/reset-stats', {
    schema: {
      description: 'Reset cache statistics',
      tags: ['model-router', 'cache'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const cacheManager = getCacheManager();
      cacheManager.resetStats();

      return reply.send({
        success: true,
        message: 'Cache statistics reset successfully'
      });
    } catch (error) {
      fastify.log.error('Error resetting cache stats:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to reset cache statistics',
        message: error.message
      });
    }
  });

  /**
   * GET /api/model-router/performance
   * Get performance metrics including p50, p95, p99 latencies
   * Requirements: 20.5
   */
  fastify.get('/performance', {
    schema: {
      description: 'Get performance metrics with latency percentiles',
      tags: ['model-router', 'performance'],
      querystring: {
        type: 'object',
        properties: {
          provider: { type: 'string', description: 'Filter by provider' }
        }
      },
      response: {
        200: {
          type: 'object',
          description: 'Performance metrics'
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { provider } = request.query;
      
      const metrics = provider 
        ? performanceMonitor.getMetrics(provider)
        : performanceMonitor.getSummary();

      return reply.send({
        success: true,
        data: metrics
      });
    } catch (error) {
      fastify.log.error('Error fetching performance metrics:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch performance metrics',
        message: error.message
      });
    }
  });

  /**
   * GET /api/model-router/performance/health
   * Check latency health against threshold
   * Requirements: 20.5
   */
  fastify.get('/performance/health', {
    schema: {
      description: 'Check latency health',
      tags: ['model-router', 'performance'],
      querystring: {
        type: 'object',
        properties: {
          provider: { type: 'string', description: 'Filter by provider' },
          threshold: { type: 'number', description: 'Latency threshold in ms', default: 5000 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { provider, threshold = 5000 } = request.query;
      
      const health = performanceMonitor.checkLatencyHealth(provider, threshold);

      return reply.send({
        success: true,
        data: health
      });
    } catch (error) {
      fastify.log.error('Error checking latency health:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to check latency health',
        message: error.message
      });
    }
  });

  /**
   * POST /api/model-router/performance/reset
   * Reset performance metrics
   * Requirements: 20.5
   */
  fastify.post('/performance/reset', {
    schema: {
      description: 'Reset performance metrics',
      tags: ['model-router', 'performance'],
      body: {
        type: 'object',
        properties: {
          provider: { type: 'string', description: 'Reset specific provider (optional)' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { provider } = request.body || {};
      
      if (provider) {
        performanceMonitor.resetProvider(provider);
        return reply.send({
          success: true,
          message: `Performance metrics reset for provider: ${provider}`
        });
      } else {
        performanceMonitor.reset();
        return reply.send({
          success: true,
          message: 'All performance metrics reset successfully'
        });
      }
    } catch (error) {
      fastify.log.error('Error resetting performance metrics:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to reset performance metrics',
        message: error.message
      });
    }
  });
  }, { prefix: '/api/model-router' });
}

module.exports = modelRouterMetricsRoutes;
