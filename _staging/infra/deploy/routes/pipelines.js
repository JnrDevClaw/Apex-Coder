/**
 * Pipeline Management Routes
 * Provides comprehensive pipeline management endpoints
 * Implements Requirements 1.1, 1.2, 3.2, 6.1, 6.2, 7.2, 7.4
 */

const { sendErrorResponse } = require('../utils/error-responses');

async function pipelineRoutes(fastify, options) {
  const { Build, Project } = require('../models');

  /**
   * Get all pipelines for current user
   * Implements Requirements 6.1, 6.2
   */
  fastify.get('/api/pipelines', {
    preHandler: fastify.auth([fastify.verifyJWT])
  }, async (request, reply) => {
    try {
      const { status, sortBy = 'createdAt', sortOrder = 'desc' } = request.query;
      const userId = request.user.userId;
      const orgId = request.user.orgId;

      // Get all projects for user
      const projects = await Project.findByOrg(orgId);
      const projectIds = projects.map(p => p.projectId);

      // Get all builds for these projects
      let builds = [];
      for (const projectId of projectIds) {
        const projectBuilds = await Build.findByProject(orgId, projectId);
        builds = builds.concat(projectBuilds);
      }

      // Apply status filter
      if (status && status !== 'all') {
        builds = builds.filter(build => build.status === status);
      }

      // Sort builds
      builds.sort((a, b) => {
        let aValue = a[sortBy];
        let bValue = b[sortBy];

        // Handle date strings
        if (sortBy.includes('At')) {
          aValue = new Date(aValue || 0).getTime();
          bValue = new Date(bValue || 0).getTime();
        }

        if (sortOrder === 'desc') {
          return bValue > aValue ? 1 : -1;
        } else {
          return aValue > bValue ? 1 : -1;
        }
      });

      // Transform builds to pipeline format
      const pipelines = builds.map(build => ({
        id: build.buildId,
        projectName: build.projectName || 'Unknown Project',
        projectId: build.projectId,
        userId,
        status: build.status,
        progress: build.progress || 0,
        createdAt: build.createdAt,
        startedAt: build.startedAt,
        completedAt: build.completedAt,
        stages: transformStages(build.stageStatuses || {}),
        resources: build.resources || [],
        error: build.errorMessage
      }));

      reply.send({
        success: true,
        data: {
          pipelines,
          total: pipelines.length
        }
      });
    } catch (error) {
      fastify.log.error('Error fetching pipelines:', error);
      return sendErrorResponse(reply, 'INTERNAL_ERROR', {
        details: error.message
      });
    }
  });

  /**
   * Get specific pipeline details
   * Implements Requirements 1.1, 1.3
   */
  fastify.get('/api/pipelines/:id', {
    preHandler: fastify.auth([fastify.verifyJWT])
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const userId = request.user.userId;

      const build = await Build.findByIdGlobal(id);

      if (!build) {
        return sendErrorResponse(reply, 'BUILD_NOT_FOUND');
      }

      // Verify user has access to this build
      const project = await Project.findById(build.orgId, build.projectId);
      if (!project || project.orgId !== request.user.orgId) {
        return sendErrorResponse(reply, 'UNAUTHORIZED');
      }

      const pipeline = {
        id: build.buildId,
        projectName: project.name || 'Unknown Project',
        projectId: build.projectId,
        userId,
        status: build.status,
        progress: build.progress || 0,
        createdAt: build.createdAt,
        startedAt: build.startedAt,
        completedAt: build.completedAt,
        stages: transformStages(build.stageStatuses || {}),
        resources: build.resources || [],
        error: build.errorMessage,
        artifacts: build.artifacts || {},
        errorLogs: build.errorLogs || []
      };

      reply.send({
        success: true,
        data: { pipeline }
      });
    } catch (error) {
      fastify.log.error('Error fetching pipeline:', error);
      return sendErrorResponse(reply, 'INTERNAL_ERROR', {
        details: error.message
      });
    }
  });

  /**
   * Cancel a pipeline
   * Implements Requirements 3.2, 6.5
   */
  fastify.post('/api/pipelines/:id/cancel', {
    preHandler: fastify.auth([fastify.verifyJWT])
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      const build = await Build.findByIdGlobal(id);

      if (!build) {
        return sendErrorResponse(reply, 'BUILD_NOT_FOUND');
      }

      // Verify user has access
      const project = await Project.findById(build.orgId, build.projectId);
      if (!project || project.orgId !== request.user.orgId) {
        return sendErrorResponse(reply, 'UNAUTHORIZED');
      }

      // Only allow cancellation of pending or running builds
      if (build.status !== 'pending' && build.status !== 'running' && build.status !== 'queued') {
        return reply.code(400).send({
          success: false,
          error: 'INVALID_STATUS',
          message: 'Can only cancel pending or running pipelines'
        });
      }

      // Update build status
      await build.update({
        status: 'cancelled',
        completedAt: new Date(),
        errorMessage: 'Cancelled by user'
      });

      // Notify pipeline orchestrator to stop processing
      if (fastify.pipelineOrchestrator) {
        fastify.pipelineOrchestrator.cancelPipeline(id);
      }

      // Log audit event
      try {
        const auditLogger = require('../services/audit-logger');
        await auditLogger.logBuildEvent(id, 'cancelled', {
          userId: request.user.userId,
          timestamp: new Date()
        });
      } catch (auditError) {
        fastify.log.error('Failed to log audit event:', auditError);
      }

      reply.send({
        success: true,
        message: 'Pipeline cancelled successfully'
      });
    } catch (error) {
      fastify.log.error('Error cancelling pipeline:', error);
      return sendErrorResponse(reply, 'INTERNAL_ERROR', {
        details: error.message
      });
    }
  });

  /**
   * Retry a failed pipeline
   * Implements Requirements 3.2
   */
  fastify.post('/api/pipelines/:id/retry', {
    preHandler: fastify.auth([fastify.verifyJWT])
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      const build = await Build.findByIdGlobal(id);

      if (!build) {
        return sendErrorResponse(reply, 'BUILD_NOT_FOUND');
      }

      // Verify user has access
      const project = await Project.findById(build.orgId, build.projectId);
      if (!project || project.orgId !== request.user.orgId) {
        return sendErrorResponse(reply, 'UNAUTHORIZED');
      }

      // Only allow retry of failed builds
      if (build.status !== 'failed') {
        return reply.code(400).send({
          success: false,
          error: 'INVALID_STATUS',
          message: 'Can only retry failed pipelines'
        });
      }

      // Create new build with same spec
      const newBuild = new Build({
        projectId: build.projectId,
        orgId: build.orgId,
        status: 'queued',
        specJson: build.specJson,
        buildOptions: build.buildOptions || {},
        currentStage: 0,
        stageStatuses: {},
        artifacts: {}
      });

      await newBuild.save();

      // Start pipeline
      if (fastify.pipelineOrchestrator) {
        fastify.pipelineOrchestrator.startPipeline({
          buildId: newBuild.buildId,
          projectId: build.projectId,
          orgId: build.orgId,
          userId: request.user.userId,
          specJson: newBuild.specJson
        }).catch(error => {
          fastify.log.error(`Pipeline failed for build ${newBuild.buildId}:`, error);
        });
      }

      // Log audit event
      try {
        const auditLogger = require('../services/audit-logger');
        await auditLogger.logBuildEvent(newBuild.buildId, 'retried', {
          userId: request.user.userId,
          originalBuildId: id,
          timestamp: new Date()
        });
      } catch (auditError) {
        fastify.log.error('Failed to log audit event:', auditError);
      }

      reply.send({
        success: true,
        data: {
          buildId: newBuild.buildId,
          message: 'Pipeline retry initiated'
        }
      });
    } catch (error) {
      fastify.log.error('Error retrying pipeline:', error);
      return sendErrorResponse(reply, 'INTERNAL_ERROR', {
        details: error.message
      });
    }
  });

  /**
   * Retry a specific failed stage
   * Implements Requirements 3.2
   */
  fastify.post('/api/pipelines/:id/stages/:stageId/retry', {
    preHandler: fastify.auth([fastify.verifyJWT])
  }, async (request, reply) => {
    try {
      const { id, stageId } = request.params;

      const build = await Build.findByIdGlobal(id);

      if (!build) {
        return sendErrorResponse(reply, 'BUILD_NOT_FOUND');
      }

      // Verify user has access
      const project = await Project.findById(build.orgId, build.projectId);
      if (!project || project.orgId !== request.user.orgId) {
        return sendErrorResponse(reply, 'UNAUTHORIZED');
      }

      // Check if stage exists and failed
      const stageStatus = build.stageStatuses?.[stageId];
      if (!stageStatus) {
        return reply.code(404).send({
          success: false,
          error: 'STAGE_NOT_FOUND',
          message: `Stage '${stageId}' not found`
        });
      }

      if (stageStatus.status !== 'failed' && stageStatus.status !== 'error') {
        return reply.code(400).send({
          success: false,
          error: 'INVALID_STATUS',
          message: 'Can only retry failed stages'
        });
      }

      // Retry stage via pipeline orchestrator
      if (fastify.pipelineOrchestrator) {
        await fastify.pipelineOrchestrator.retryStage(id, stageId);
      } else {
        return reply.code(503).send({
          success: false,
          error: 'SERVICE_UNAVAILABLE',
          message: 'Pipeline orchestrator not available'
        });
      }

      reply.send({
        success: true,
        message: `Stage '${stageId}' retry initiated`
      });
    } catch (error) {
      fastify.log.error('Error retrying stage:', error);
      return sendErrorResponse(reply, 'INTERNAL_ERROR', {
        details: error.message
      });
    }
  });

  /**
   * WebSocket/SSE stream for real-time updates
   * Implements Requirements 1.2, 7.3
   */
  fastify.get('/api/pipelines/:id/stream', {
    websocket: true
  }, (connection, request) => {
    const { id } = request.params;
    
    fastify.log.info(`WebSocket connection established for pipeline ${id}`);

    // Subscribe to pipeline updates
    const unsubscribe = subscribeToPipelineUpdates(id, (event) => {
      try {
        connection.socket.send(JSON.stringify(event));
      } catch (error) {
        fastify.log.error('Error sending WebSocket message:', error);
      }
    });

    connection.socket.on('close', () => {
      fastify.log.info(`WebSocket connection closed for pipeline ${id}`);
      unsubscribe();
    });

    connection.socket.on('error', (error) => {
      fastify.log.error(`WebSocket error for pipeline ${id}:`, error);
      unsubscribe();
    });
  });
}

/**
 * Transform stage statuses to frontend format
 */
function transformStages(stageStatuses) {
  return Object.entries(stageStatuses).map(([id, status]) => ({
    id,
    label: status.label || id,
    description: status.description || '',
    status: status.status || 'pending',
    supportsMultipleEvents: status.supportsMultipleEvents || false,
    allowedStatuses: status.allowedStatuses || [],
    startedAt: status.startedAt,
    completedAt: status.completedAt,
    events: status.events || [],
    error: status.error
  }));
}

/**
 * Subscribe to pipeline updates (placeholder - implement with Redis pub/sub or similar)
 */
function subscribeToPipelineUpdates(pipelineId, callback) {
  // TODO: Implement real-time subscription using Redis pub/sub or similar
  // For now, return a no-op unsubscribe function
  return () => {};
}

module.exports = pipelineRoutes;
