const fastifyPlugin = require('fastify-plugin');

async function deploymentsRoutes(fastify, options) {
  // Get all deployments for the authenticated user
  fastify.get('/', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      const { Deployment } = require('../models');
      const userId = request.user.userId;
      
      // Get deployments for this user
      const deployments = await Deployment.findByUserId(userId, 100);
      
      reply.send(deployments);
    } catch (error) {
      fastify.log.error('Failed to fetch user deployments:', error);
      reply.code(500).send({
        error: 'Failed to fetch deployments',
        message: error.message
      });
    }
  });

  // Get specific deployment by ID
  fastify.get('/:deploymentId', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      const { Deployment } = require('../models');
      const { deploymentId } = request.params;
      const userId = request.user.userId;
      
      const deployment = await Deployment.findById(deploymentId);
      
      if (!deployment) {
        return reply.code(404).send({
          error: 'Deployment not found'
        });
      }
      
      // Check if user owns this deployment
      if (deployment.userId !== userId) {
        return reply.code(403).send({
          error: 'Access denied'
        });
      }
      
      reply.send(deployment);
    } catch (error) {
      fastify.log.error('Failed to fetch deployment:', error);
      reply.code(500).send({
        error: 'Failed to fetch deployment',
        message: error.message
      });
    }
  });

  // Get deployment statistics for the user
  fastify.get('/stats', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      const { Deployment } = require('../models');
      const userId = request.user.userId;
      
      // Get all deployments for stats
      const deployments = await Deployment.findByUserId(userId, 1000);
      
      const stats = {
        total: deployments.length,
        success: deployments.filter(d => d.status === 'success').length,
        failed: deployments.filter(d => d.status === 'failed').length,
        pending: deployments.filter(d => d.status === 'pending').length,
        in_progress: deployments.filter(d => d.status === 'in_progress').length,
        recent: deployments.slice(0, 5) // Last 5 deployments
      };
      
      reply.send(stats);
    } catch (error) {
      fastify.log.error('Failed to fetch deployment stats:', error);
      reply.code(500).send({
        error: 'Failed to fetch deployment statistics',
        message: error.message
      });
    }
  });
  
  // Update deployment status (called by workers - no auth required)
  fastify.put('/api/deployments/:deploymentId/status', {
    schema: {
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { 
            type: 'string',
            enum: ['pending', 'creating_repo', 'pushing_code', 'triggering_workflow', 'deploying', 'completed', 'failed']
          },
          result: { type: 'object' },
          error: { type: 'string' },
          repoUrl: { type: 'string' },
          commitSha: { type: 'string' },
          deploymentUrl: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { deploymentId } = request.params;
      const { status, result, error, repoUrl, commitSha, deploymentUrl } = request.body;
      
      fastify.log.info(`Updating deployment ${deploymentId} status to ${status}`);
      
      const { Deployment } = require('../models');
      const deployment = await Deployment.findById(deploymentId);
      
      if (!deployment) {
        fastify.log.warn(`Deployment ${deploymentId} not found`);
        return reply.code(404).send({
          error: 'Deployment not found'
        });
      }
      
      // Update deployment
      const updateData = { status };
      if (result) updateData.result = result;
      if (error) updateData.error = error;
      if (repoUrl) updateData.repo_url = repoUrl;
      if (commitSha) updateData.commit_sha = commitSha;
      if (deploymentUrl) updateData.deployment_url = deploymentUrl;
      if (status === 'completed') updateData.deployed_at = new Date();
      
      await deployment.update(updateData);
      
      // Send notification if completed or failed
      if (status === 'completed' || status === 'failed') {
        try {
          const emailService = require('../services/email-notifications');
          await emailService.sendDeploymentNotification(deployment);
        } catch (emailError) {
          fastify.log.error('Failed to send notification:', emailError);
        }
      }
      
      // Log audit event
      try {
        const auditLogger = require('../services/audit-logger');
        await auditLogger.logDeploymentEvent(
          deploymentId,
          deployment.projectId,
          null,
          'status_updated',
          {
            oldStatus: deployment.status,
            newStatus: status,
            updatedBy: 'worker',
            error
          }
        );
      } catch (auditError) {
        fastify.log.error('Failed to log audit event:', auditError);
      }
      
      fastify.log.info(`Deployment ${deploymentId} status updated successfully`);
      
      reply.send({ success: true, data: deployment });
    } catch (error) {
      fastify.log.error('Error updating deployment status:', error);
      reply.code(500).send({
        error: 'Internal server error',
        message: error.message
      });
    }
  });
}

module.exports = fastifyPlugin(deploymentsRoutes);