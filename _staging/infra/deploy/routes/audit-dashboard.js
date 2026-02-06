const auditDashboardService = require('../services/audit-dashboard');

async function auditDashboardRoutes(fastify, options) {
  // Get comprehensive audit dashboard
  fastify.get('/admin/audit/dashboard', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          timeRange: { 
            type: 'string', 
            enum: ['1h', '24h', '7d', '30d'],
            default: '24h'
          },
          projectId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { timeRange, projectId } = request.query;

      const dashboardData = await auditDashboardService.getDashboardData(timeRange, projectId);

      return {
        success: true,
        dashboard: dashboardData
      };
    } catch (error) {
      request.logger.error('Failed to get audit dashboard', {
        timeRange: request.query.timeRange,
        projectId: request.query.projectId,
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to get audit dashboard'
      });
    }
  });

  // Get project-specific audit dashboard
  fastify.get('/projects/:projectId/audit/dashboard', {
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

      const dashboardData = await auditDashboardService.getDashboardData(timeRange, projectId);

      return {
        success: true,
        projectId,
        dashboard: dashboardData
      };
    } catch (error) {
      request.logger.error('Failed to get project audit dashboard', {
        projectId: request.params.projectId,
        timeRange: request.query.timeRange,
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to get project audit dashboard'
      });
    }
  });

  // Get security events summary
  fastify.get('/admin/audit/security-summary', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          timeRange: { 
            type: 'string', 
            enum: ['1h', '24h', '7d', '30d'],
            default: '24h'
          },
          projectId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { timeRange, projectId } = request.query;

      const dashboardData = await auditDashboardService.getDashboardData(timeRange, projectId);

      return {
        success: true,
        timeRange,
        projectId,
        securitySummary: {
          securityEvents: dashboardData.securityEvents,
          errorAnalysis: dashboardData.errorAnalysis,
          summary: {
            totalSecurityEvents: dashboardData.securityEvents.totalSecurityEvents,
            totalErrors: dashboardData.errorAnalysis.totalErrors,
            errorRate: dashboardData.errorAnalysis.errorRate
          }
        }
      };
    } catch (error) {
      request.logger.error('Failed to get security summary', {
        timeRange: request.query.timeRange,
        projectId: request.query.projectId,
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to get security summary'
      });
    }
  });

  // Get cost analysis summary
  fastify.get('/admin/audit/cost-summary', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          timeRange: { 
            type: 'string', 
            enum: ['1h', '24h', '7d', '30d'],
            default: '24h'
          },
          projectId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { timeRange, projectId } = request.query;

      const dashboardData = await auditDashboardService.getDashboardData(timeRange, projectId);

      return {
        success: true,
        timeRange,
        projectId,
        costSummary: dashboardData.costEvents
      };
    } catch (error) {
      request.logger.error('Failed to get cost summary', {
        timeRange: request.query.timeRange,
        projectId: request.query.projectId,
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to get cost summary'
      });
    }
  });

  // Get AI activity summary
  fastify.get('/admin/audit/ai-summary', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          timeRange: { 
            type: 'string', 
            enum: ['1h', '24h', '7d', '30d'],
            default: '24h'
          },
          projectId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { timeRange, projectId } = request.query;

      const dashboardData = await auditDashboardService.getDashboardData(timeRange, projectId);

      return {
        success: true,
        timeRange,
        projectId,
        aiSummary: dashboardData.aiActivityStats
      };
    } catch (error) {
      request.logger.error('Failed to get AI activity summary', {
        timeRange: request.query.timeRange,
        projectId: request.query.projectId,
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to get AI activity summary'
      });
    }
  });

  // Clear dashboard cache
  fastify.post('/admin/audit/dashboard/clear-cache', {
    preHandler: [fastify.authenticate, fastify.requireAdmin]
  }, async (request, reply) => {
    try {
      auditDashboardService.clearCache();

      return {
        success: true,
        message: 'Dashboard cache cleared successfully'
      };
    } catch (error) {
      request.logger.error('Failed to clear dashboard cache', {
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to clear dashboard cache'
      });
    }
  });

  // Get cache statistics
  fastify.get('/admin/audit/dashboard/cache-stats', {
    preHandler: [fastify.authenticate, fastify.requireAdmin]
  }, async (request, reply) => {
    try {
      const cacheStats = auditDashboardService.getCacheStats();

      return {
        success: true,
        cacheStats
      };
    } catch (error) {
      request.logger.error('Failed to get cache stats', {
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to get cache statistics'
      });
    }
  });

  // Export dashboard data
  fastify.get('/admin/audit/dashboard/export', {
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          timeRange: { 
            type: 'string', 
            enum: ['1h', '24h', '7d', '30d'],
            default: '24h'
          },
          projectId: { type: 'string' },
          format: { type: 'string', enum: ['json', 'csv'], default: 'json' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { timeRange, projectId, format } = request.query;

      const dashboardData = await auditDashboardService.getDashboardData(timeRange, projectId);

      // Set appropriate headers for download
      const filename = `audit-dashboard-${timeRange}-${new Date().toISOString().split('T')[0]}.${format}`;
      const contentType = format === 'csv' ? 'text/csv' : 'application/json';

      reply.header('Content-Type', contentType);
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);

      if (format === 'json') {
        return JSON.stringify(dashboardData, null, 2);
      } else {
        // Convert to CSV format (simplified)
        const csvData = this.convertDashboardToCSV(dashboardData);
        return csvData;
      }
    } catch (error) {
      request.logger.error('Failed to export dashboard data', {
        timeRange: request.query.timeRange,
        projectId: request.query.projectId,
        format: request.query.format,
        error: error.message
      });
      
      return reply.code(500).send({
        error: 'Failed to export dashboard data'
      });
    }
  });

  // Helper method to convert dashboard data to CSV
  function convertDashboardToCSV(dashboardData) {
    const rows = [];
    
    // Add summary row
    rows.push([
      'Metric',
      'Value',
      'Time Range',
      'Generated At'
    ]);
    
    rows.push([
      'Total Events',
      dashboardData.summary.totalEvents,
      dashboardData.timeRange,
      dashboardData.generatedAt
    ]);
    
    rows.push([
      'User Actions',
      dashboardData.summary.userActions,
      dashboardData.timeRange,
      dashboardData.generatedAt
    ]);
    
    rows.push([
      'AI Actions',
      dashboardData.summary.aiActions,
      dashboardData.timeRange,
      dashboardData.generatedAt
    ]);
    
    rows.push([
      'Security Events',
      dashboardData.summary.securityEvents,
      dashboardData.timeRange,
      dashboardData.generatedAt
    ]);
    
    rows.push([
      'Cost Events',
      dashboardData.summary.costEvents,
      dashboardData.timeRange,
      dashboardData.generatedAt
    ]);
    
    return rows.map(row => row.join(',')).join('\n');
  }
}

module.exports = auditDashboardRoutes;