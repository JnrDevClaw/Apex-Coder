const gdprComplianceService = require('../services/gdpr-compliance');
const auditLogger = require('../services/audit-logger');

async function gdprRoutes(fastify, options) {
  // Data subject access request (Article 15)
  fastify.post('/gdpr/access-request', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          requestId: { type: 'string' },
          format: { type: 'string', enum: ['json', 'csv'], default: 'json' }
        },
        required: ['requestId']
      }
    }
  }, async (request, reply) => {
    try {
      const { requestId, format } = request.body;
      const userId = request.user.userId;

      // Validate request
      gdprComplianceService.validateGDPRRequest('access', userId, requestId);

      // Process access request
      const accessData = await gdprComplianceService.handleAccessRequest(userId, requestId);

      // Log the request
      request.logger.info('GDPR access request processed', {
        userId,
        requestId,
        format
      });

      return {
        success: true,
        requestId,
        message: 'Access request processed successfully',
        data: accessData
      };
    } catch (error) {
      request.logger.error('Failed to process GDPR access request', {
        error: error.message,
        requestId: request.body.requestId
      });
      
      return reply.code(500).send({
        error: 'Failed to process access request',
        requestId: request.body.requestId
      });
    }
  });

  // Right to erasure request (Article 17)
  fastify.post('/gdpr/erasure-request', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          requestId: { type: 'string' },
          reason: { 
            type: 'string', 
            enum: ['user_request', 'consent_withdrawn', 'unlawful_processing', 'legal_obligation'],
            default: 'user_request'
          },
          confirmDeletion: { type: 'boolean' }
        },
        required: ['requestId', 'confirmDeletion']
      }
    }
  }, async (request, reply) => {
    try {
      const { requestId, reason, confirmDeletion } = request.body;
      const userId = request.user.userId;

      if (!confirmDeletion) {
        return reply.code(400).send({
          error: 'Deletion confirmation required',
          requestId
        });
      }

      // Validate request
      gdprComplianceService.validateGDPRRequest('erasure', userId, requestId);

      // Process erasure request
      const erasureResult = await gdprComplianceService.handleErasureRequest(userId, requestId, reason);

      // Log the request
      request.logger.info('GDPR erasure request processed', {
        userId,
        requestId,
        reason,
        deletedRecords: erasureResult.deletedData
      });

      return {
        success: true,
        requestId,
        message: 'Erasure request processed successfully',
        summary: erasureResult
      };
    } catch (error) {
      request.logger.error('Failed to process GDPR erasure request', {
        error: error.message,
        requestId: request.body.requestId
      });
      
      return reply.code(500).send({
        error: 'Failed to process erasure request',
        requestId: request.body.requestId
      });
    }
  });

  // Data portability request (Article 20)
  fastify.post('/gdpr/portability-request', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          requestId: { type: 'string' },
          format: { type: 'string', enum: ['json', 'csv'], default: 'json' }
        },
        required: ['requestId']
      }
    }
  }, async (request, reply) => {
    try {
      const { requestId, format } = request.body;
      const userId = request.user.userId;

      // Validate request
      gdprComplianceService.validateGDPRRequest('portability', userId, requestId);

      // Process portability request
      const portabilityData = await gdprComplianceService.handlePortabilityRequest(userId, requestId, format);

      // Log the request
      request.logger.info('GDPR portability request processed', {
        userId,
        requestId,
        format
      });

      return {
        success: true,
        requestId,
        message: 'Portability request processed successfully',
        data: portabilityData
      };
    } catch (error) {
      request.logger.error('Failed to process GDPR portability request', {
        error: error.message,
        requestId: request.body.requestId
      });
      
      return reply.code(500).send({
        error: 'Failed to process portability request',
        requestId: request.body.requestId
      });
    }
  });

  // Get GDPR compliance status
  fastify.get('/gdpr/compliance-status', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const userId = request.user.userId;

      const complianceStatus = await gdprComplianceService.getComplianceStatus(userId);

      return {
        success: true,
        userId,
        complianceStatus
      };
    } catch (error) {
      request.logger.error('Failed to get GDPR compliance status', {
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to get compliance status'
      });
    }
  });

  // Admin: Get GDPR request statistics
  fastify.get('/admin/gdpr/statistics', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          timeRange: { 
            type: 'string', 
            enum: ['24h', '7d', '30d', '90d'],
            default: '30d'
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { timeRange } = request.query;

      // Get GDPR-related audit events
      const gdprStats = await auditLogger.getAuditStats('global', timeRange);

      // Filter for GDPR events
      const gdprEvents = {
        accessRequests: gdprStats.eventsByType['gdpr_access_request'] || 0,
        erasureRequests: gdprStats.eventsByType['gdpr_erasure_request'] || 0,
        portabilityRequests: gdprStats.eventsByType['gdpr_portability_request'] || 0,
        totalRequests: 0
      };

      gdprEvents.totalRequests = gdprEvents.accessRequests + 
                                gdprEvents.erasureRequests + 
                                gdprEvents.portabilityRequests;

      return {
        success: true,
        timeRange,
        statistics: gdprEvents
      };
    } catch (error) {
      request.logger.error('Failed to get GDPR statistics', {
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to get GDPR statistics'
      });
    }
  });

  // Admin: Process pending GDPR requests
  fastify.get('/admin/gdpr/pending-requests', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { limit } = request.query;

      // Get recent GDPR-related audit events that might need follow-up
      const recentEvents = await auditLogger.getProjectAuditLog('global', {
        limit,
        event: 'gdpr_access_request'
      });

      const pendingRequests = recentEvents.map(event => ({
        requestId: event.details.requestId,
        userId: event.actor,
        requestType: event.action,
        timestamp: event.timestamp,
        status: 'completed' // All requests are processed immediately in this implementation
      }));

      return {
        success: true,
        pendingRequests,
        count: pendingRequests.length
      };
    } catch (error) {
      request.logger.error('Failed to get pending GDPR requests', {
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to get pending requests'
      });
    }
  });
}

module.exports = gdprRoutes;