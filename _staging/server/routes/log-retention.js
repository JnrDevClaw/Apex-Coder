const logRetentionService = require('../services/log-retention');
const auditLogger = require('../services/audit-logger');

async function logRetentionRoutes(fastify, options) {
  // Get retention statistics
  fastify.get('/admin/logs/retention/stats', {
    preHandler: [fastify.authenticate, fastify.requireAdmin]
  }, async (request, reply) => {
    try {
      const stats = await logRetentionService.getRetentionStats();

      return {
        success: true,
        retentionStats: stats
      };
    } catch (error) {
      request.logger.error('Failed to get retention stats', {
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to get retention statistics'
      });
    }
  });

  // Manual cleanup of expired logs
  fastify.post('/admin/logs/retention/cleanup', {
    preHandler: [fastify.authenticate, fastify.requireAdmin]
  }, async (request, reply) => {
    try {
      const deletedCount = await logRetentionService.cleanupExpiredLogs();

      // Log the cleanup action
      await auditLogger.logSystemEvent('log_cleanup', 'manual_cleanup', {
        deletedCount,
        triggeredBy: request.user.userId
      });

      return {
        success: true,
        deletedCount,
        message: `Successfully deleted ${deletedCount} expired log entries`
      };
    } catch (error) {
      request.logger.error('Failed to cleanup expired logs', {
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to cleanup expired logs'
      });
    }
  });

  // Export project logs (GDPR compliance)
  fastify.get('/projects/:projectId/logs/export', {
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
          format: { type: 'string', enum: ['json', 'csv'], default: 'json' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { projectId } = request.params;
      const { format } = request.query;

      // Check if user has access to this project
      const project = await fastify.projectService.getProject(projectId, request.user.userId);
      if (!project) {
        return reply.code(404).send({ error: 'Project not found' });
      }

      const exportData = await logRetentionService.exportProjectLogs(projectId, format);

      // Log the export action
      await auditLogger.logUserAction(request.user.userId, 'export_logs', {
        projectId,
        format,
        dataSize: exportData.length
      });

      // Set appropriate headers for download
      const filename = `project-${projectId}-logs-${new Date().toISOString().split('T')[0]}.${format}`;
      const contentType = format === 'csv' ? 'text/csv' : 'application/json';

      reply.header('Content-Type', contentType);
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);

      return exportData;
    } catch (error) {
      request.logger.error('Failed to export project logs', {
        projectId: request.params.projectId,
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to export project logs'
      });
    }
  });

  // Delete project logs (GDPR compliance)
  fastify.delete('/admin/projects/:projectId/logs', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      params: {
        type: 'object',
        properties: {
          projectId: { type: 'string' }
        },
        required: ['projectId']
      },
      body: {
        type: 'object',
        properties: {
          reason: { 
            type: 'string',
            enum: ['user_request', 'gdpr_compliance', 'project_deletion', 'legal_requirement'],
            default: 'user_request'
          },
          confirmDeletion: { type: 'boolean' }
        },
        required: ['confirmDeletion']
      }
    }
  }, async (request, reply) => {
    try {
      const { projectId } = request.params;
      const { reason, confirmDeletion } = request.body;

      if (!confirmDeletion) {
        return reply.code(400).send({
          error: 'Deletion confirmation required'
        });
      }

      const deletedCount = await logRetentionService.deleteProjectLogs(projectId, reason);

      // Log the deletion action
      await auditLogger.logSystemEvent('log_deletion', 'project_logs_deleted', {
        projectId,
        deletedCount,
        reason,
        triggeredBy: request.user.userId
      });

      return {
        success: true,
        projectId,
        deletedCount,
        reason,
        message: `Successfully deleted ${deletedCount} log entries for project ${projectId}`
      };
    } catch (error) {
      request.logger.error('Failed to delete project logs', {
        projectId: request.params.projectId,
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to delete project logs'
      });
    }
  });

  // Delete user logs (GDPR compliance)
  fastify.delete('/admin/users/:userId/logs', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      params: {
        type: 'object',
        properties: {
          userId: { type: 'string' }
        },
        required: ['userId']
      },
      body: {
        type: 'object',
        properties: {
          reason: { 
            type: 'string',
            enum: ['user_request', 'gdpr_compliance', 'account_deletion', 'legal_requirement'],
            default: 'user_request'
          },
          confirmDeletion: { type: 'boolean' }
        },
        required: ['confirmDeletion']
      }
    }
  }, async (request, reply) => {
    try {
      const { userId } = request.params;
      const { reason, confirmDeletion } = request.body;

      if (!confirmDeletion) {
        return reply.code(400).send({
          error: 'Deletion confirmation required'
        });
      }

      const deletedCount = await logRetentionService.deleteUserLogs(userId, reason);

      // Log the deletion action
      await auditLogger.logSystemEvent('log_deletion', 'user_logs_deleted', {
        targetUserId: userId,
        deletedCount,
        reason,
        triggeredBy: request.user.userId
      });

      return {
        success: true,
        userId,
        deletedCount,
        reason,
        message: `Successfully deleted ${deletedCount} log entries for user ${userId}`
      };
    } catch (error) {
      request.logger.error('Failed to delete user logs', {
        userId: request.params.userId,
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to delete user logs'
      });
    }
  });

  // Schedule cleanup job
  fastify.post('/admin/logs/retention/schedule-cleanup', {
    preHandler: [fastify.authenticate, fastify.requireAdmin]
  }, async (request, reply) => {
    try {
      const result = await logRetentionService.scheduleCleanup();

      return {
        success: result.success,
        message: result.success ? 
          `Scheduled cleanup completed. Deleted ${result.deletedCount} records.` :
          `Scheduled cleanup failed: ${result.error}`,
        deletedCount: result.deletedCount || 0
      };
    } catch (error) {
      request.logger.error('Failed to schedule cleanup', {
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to schedule cleanup'
      });
    }
  });

  // Get retention policies
  fastify.get('/admin/logs/retention/policies', {
    preHandler: [fastify.authenticate, fastify.requireAdmin]
  }, async (request, reply) => {
    try {
      const policies = {
        default: logRetentionService.getRetentionPolicy('default'),
        security: logRetentionService.getRetentionPolicy('security'),
        cost: logRetentionService.getRetentionPolicy('cost'),
        audit: logRetentionService.getRetentionPolicy('audit')
      };

      return {
        success: true,
        retentionPolicies: policies,
        description: {
          default: 'Standard application logs',
          security: 'Security-related events and alerts',
          cost: 'Cost tracking and billing events',
          audit: 'Audit trail and compliance logs'
        }
      };
    } catch (error) {
      request.logger.error('Failed to get retention policies', {
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to get retention policies'
      });
    }
  });
}

module.exports = logRetentionRoutes;