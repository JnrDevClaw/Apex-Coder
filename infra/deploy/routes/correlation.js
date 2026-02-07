const correlationTracker = require('../services/correlation-tracker');

async function correlationRoutes(fastify, options) {
  // Get correlation details
  fastify.get('/correlation/:correlationId', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          correlationId: { type: 'string' }
        },
        required: ['correlationId']
      }
    }
  }, async (request, reply) => {
    try {
      const { correlationId } = request.params;

      const correlation = correlationTracker.getCorrelation(correlationId);
      
      if (!correlation) {
        return reply.code(404).send({
          error: 'Correlation not found',
          correlationId
        });
      }

      const exportedData = correlationTracker.exportCorrelationData(correlationId);

      return {
        success: true,
        correlation: exportedData
      };
    } catch (error) {
      request.logger.error('Failed to get correlation', {
        correlationId: request.params.correlationId,
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to get correlation details'
      });
    }
  });

  // Get correlation tree (parent and children)
  fastify.get('/correlation/:correlationId/tree', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          correlationId: { type: 'string' }
        },
        required: ['correlationId']
      }
    }
  }, async (request, reply) => {
    try {
      const { correlationId } = request.params;

      const tree = correlationTracker.getCorrelationTree(correlationId);
      
      if (!tree) {
        return reply.code(404).send({
          error: 'Correlation tree not found',
          correlationId
        });
      }

      return {
        success: true,
        correlationId,
        tree: {
          root: correlationTracker.exportCorrelationData(tree.root.id),
          children: tree.children.map(child => 
            correlationTracker.exportCorrelationData(child.id)
          )
        }
      };
    } catch (error) {
      request.logger.error('Failed to get correlation tree', {
        correlationId: request.params.correlationId,
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to get correlation tree'
      });
    }
  });

  // Search correlations
  fastify.post('/correlation/search', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          projectId: { type: 'string' },
          eventType: { type: 'string' },
          minDuration: { type: 'number' },
          maxDuration: { type: 'number' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const searchCriteria = request.body;
      const { limit, ...criteria } = searchCriteria;

      const results = correlationTracker.searchCorrelations(criteria);
      
      // Limit results
      const limitedResults = results.slice(0, limit);

      return {
        success: true,
        searchCriteria: criteria,
        results: limitedResults,
        totalFound: results.length,
        returned: limitedResults.length
      };
    } catch (error) {
      request.logger.error('Failed to search correlations', {
        searchCriteria: request.body,
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to search correlations'
      });
    }
  });

  // Get correlation statistics
  fastify.get('/correlation/statistics', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const statistics = correlationTracker.getStatistics();

      return {
        success: true,
        statistics
      };
    } catch (error) {
      request.logger.error('Failed to get correlation statistics', {
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to get correlation statistics'
      });
    }
  });

  // Admin: Cleanup old correlations
  fastify.post('/admin/correlation/cleanup', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          maxAge: { 
            type: 'integer', 
            minimum: 3600000, // 1 hour minimum
            default: 86400000 // 24 hours default
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { maxAge } = request.body;

      const cleanedCount = correlationTracker.cleanup(maxAge);

      request.logger.info('Correlation cleanup completed', {
        cleanedCount,
        maxAge
      });

      return {
        success: true,
        cleanedCount,
        maxAge
      };
    } catch (error) {
      request.logger.error('Failed to cleanup correlations', {
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to cleanup correlations'
      });
    }
  });

  // Create manual correlation (for testing/debugging)
  fastify.post('/correlation/create', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          prefix: { type: 'string', default: 'manual' },
          context: { type: 'object', default: {} }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { prefix, context } = request.body;

      const correlationId = correlationTracker.generateCorrelationId(prefix);
      
      correlationTracker.startCorrelation(correlationId, {
        ...context,
        createdBy: request.user.userId,
        createdManually: true
      });

      return {
        success: true,
        correlationId,
        message: 'Correlation created successfully'
      };
    } catch (error) {
      request.logger.error('Failed to create correlation', {
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to create correlation'
      });
    }
  });

  // Add event to correlation
  fastify.post('/correlation/:correlationId/events', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          correlationId: { type: 'string' }
        },
        required: ['correlationId']
      },
      body: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          data: { type: 'object', default: {} }
        },
        required: ['type']
      }
    }
  }, async (request, reply) => {
    try {
      const { correlationId } = request.params;
      const { type, data } = request.body;

      const success = correlationTracker.addEvent(correlationId, {
        type,
        ...data,
        addedBy: request.user.userId
      });

      if (!success) {
        return reply.code(404).send({
          error: 'Correlation not found or inactive',
          correlationId
        });
      }

      return {
        success: true,
        correlationId,
        message: 'Event added successfully'
      };
    } catch (error) {
      request.logger.error('Failed to add event to correlation', {
        correlationId: request.params.correlationId,
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to add event to correlation'
      });
    }
  });
}

module.exports = correlationRoutes;