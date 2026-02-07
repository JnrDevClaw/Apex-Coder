const auditLogger = require('../services/audit-logger');

async function auditRoutes(fastify, options) {
  // Get audit log for a project
  fastify.get('/projects/:projectId/audit', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: { type: 'string' }
        },
        required: ['projectId']
      },
      querystring: {
        type: 'object',
        properties: {
          startTime: { type: 'string', format: 'date-time' },
          endTime: { type: 'string', format: 'date-time' },
          actor: { type: 'string' },
          event: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { projectId } = request.params;
      const { startTime, endTime, actor, event, limit } = request.query;

      // Check if user has access to this project
      const project = await fastify.projectService.getProject(projectId, request.user.userId);
      if (!project) {
        return reply.code(404).send({ error: 'Project not found' });
      }

      const auditEvents = await auditLogger.getProjectAuditLog(projectId, {
        startTime,
        endTime,
        actor,
        event,
        limit
      });

      return {
        projectId,
        events: auditEvents,
        count: auditEvents.length
      };
    } catch (error) {
      fastify.log.error('Error fetching audit log:', error);
      return reply.code(500).send({ error: 'Failed to fetch audit log' });
    }
  });

  // Get audit events by correlation ID
  fastify.get('/audit/correlation/:correlationId', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          correlationId: { type: 'string' }
        },
        required: ['correlationId']
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { correlationId } = request.params;
      const { limit } = request.query;

      const events = await auditLogger.getEventsByCorrelationId(correlationId, limit);

      return {
        correlationId,
        events,
        count: events.length
      };
    } catch (error) {
      fastify.log.error('Error fetching events by correlation ID:', error);
      return reply.code(500).send({ error: 'Failed to fetch events' });
    }
  });

  // Get audit statistics for a project
  fastify.get('/projects/:projectId/audit/stats', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: { type: 'string' }
        },
        required: ['projectId']
      },
      querystring: {
        type: 'object',
        properties: {
          timeRange: { 
            type: 'string', 
            enum: ['1h', '24h', '7d', '30d'],
            default: '24h'
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { projectId } = request.params;
      const { timeRange } = request.query;

      // Check if user has access to this project
      const project = await fastify.projectService.getProject(projectId, request.user.userId);
      if (!project) {
        return reply.code(404).send({ error: 'Project not found' });
      }

      const stats = await auditLogger.getAuditStats(projectId, timeRange);

      return {
        projectId,
        timeRange,
        stats
      };
    } catch (error) {
      fastify.log.error('Error fetching audit stats:', error);
      return reply.code(500).send({ error: 'Failed to fetch audit statistics' });
    }
  });

  // Manual audit event logging (for testing/admin purposes)
  fastify.post('/audit/log', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          event: { type: 'string' },
          action: { type: 'string' },
          details: { type: 'object' },
          projectId: { type: 'string' },
          buildId: { type: 'string' },
          resourceId: { type: 'string' }
        },
        required: ['event', 'action']
      }
    }
  }, async (request, reply) => {
    try {
      const { event, action, details, projectId, buildId, resourceId } = request.body;

      const eventId = await auditLogger.logUserAction(
        request.user.userId,
        action,
        {
          event,
          details,
          projectId,
          buildId,
          resourceId
        }
      );

      return {
        success: true,
        eventId
      };
    } catch (error) {
      fastify.log.error('Error logging audit event:', error);
      return reply.code(500).send({ error: 'Failed to log audit event' });
    }
  });
}

module.exports = auditRoutes;