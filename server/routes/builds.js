const { sendErrorResponse } = require('../utils/error-responses');

async function buildRoutes(fastify, options) {
  // Get pipeline orchestrator and migration service
  const getPipelineOrchestrator = () => {
    if (!fastify.pipelineOrchestrator) {
      const PipelineOrchestrator = require('../services/pipeline-orchestrator');
      const StageRouter = require('../services/stage-router');
      const { Build, Project } = require('../models');

      const stageRouter = new StageRouter(fastify.modelRouter);

      fastify.pipelineOrchestrator = new PipelineOrchestrator({
        stageRouter,
        buildModel: Build,
        projectModel: Project,
        websocket: fastify.websocket,
        emailService: require('../services/email-notifications')
      });
    }
    return fastify.pipelineOrchestrator;
  };

  const getPipelineMigration = () => {
    if (!fastify.pipelineMigration) {
      const PipelineMigration = require('../services/pipeline-migration');
      const { Build, Project } = require('../models');

      fastify.pipelineMigration = new PipelineMigration({
        buildModel: Build,
        projectModel: Project
      });
    }
    return fastify.pipelineMigration;
  };

  // Update build status (called by workers) - backward compatible
  fastify.put('/api/builds/:buildId/status', {
    schema: {
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: {
            type: 'string',
            enum: ['queued', 'planning', 'planning_complete', 'generating', 'testing', 'completed', 'failed', 'running']
          },
          result: { type: 'object' },
          error: { type: 'string' },
          progress: { type: 'number', minimum: 0, maximum: 100 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { buildId } = request.params;
      const { status, result, error, progress } = request.body;

      fastify.log.info(`Updating build ${buildId} status to ${status}`);

      const { Build } = require('../models');

      // Find build by scanning all projects (simplified for now)
      // In production, you'd want a GSI on buildId or pass projectId
      const build = await Build.findByIdGlobal(buildId);

      if (!build) {
        fastify.log.warn(`Build ${buildId} not found`);
        return sendErrorResponse(reply, 'BUILD_NOT_FOUND');
      }

      // Update build
      const updateData = { status };
      if (result) updateData.result = result;
      if (error) updateData.error = error;
      if (progress !== undefined) updateData.progress = progress;
      if (status === 'completed') updateData.completedAt = new Date();
      if (status === 'failed') updateData.failedAt = new Date();

      await build.update(updateData);

      // Log audit event
      try {
        const auditLogger = require('../services/audit-logger');
        await auditLogger.logBuildEvent(buildId, 'status_updated', {
          oldStatus: build.status,
          newStatus: status,
          updatedBy: 'worker',
          error
        });
      } catch (auditError) {
        fastify.log.error('Failed to log audit event:', auditError);
      }

      fastify.log.info(`Build ${buildId} status updated successfully`);

      reply.send({ success: true, data: build });
    } catch (error) {
      fastify.log.error('Error updating build status:', error);
      return sendErrorResponse(reply, 'INTERNAL_ERROR', {
        details: error.message
      });
    }
  });

  // Get build by ID (public endpoint for workers) - backward compatible
  fastify.get('/api/builds/:buildId', async (request, reply) => {
    try {
      const { buildId } = request.params;

      const { Build } = require('../models');
      const build = await Build.findByIdGlobal(buildId);

      if (!build) {
        return sendErrorResponse(reply, 'BUILD_NOT_FOUND');
      }

      reply.send({ success: true, data: build });
    } catch (error) {
      fastify.log.error('Error fetching build:', error);
      return sendErrorResponse(reply, 'INTERNAL_ERROR', {
        details: error.message
      });
    }
  });

  // Get pipeline status for a build (NEW - Requirements 1.1, 1.2)
  fastify.get('/api/builds/:buildId/pipeline-status', async (request, reply) => {
    try {
      const { buildId } = request.params;

      const orchestrator = getPipelineOrchestrator();
      const status = orchestrator.getPipelineStatus(buildId);

      if (!status) {
        // Check if build exists in database
        const { Build } = require('../models');
        const build = await Build.findByIdGlobal(buildId);

        if (!build) {
          return sendErrorResponse(reply, 'BUILD_NOT_FOUND');
        }

        // Build exists but not in active pipeline - return stored status
        return reply.send({
          success: true,
          data: {
            buildId: build.buildId,
            projectId: build.projectId,
            status: build.status,
            currentStage: build.currentStage,
            stageStatuses: build.stageStatuses,
            failedAt: build.failedAt,
            startedAt: build.startedAt,
            completedAt: build.completedAt,
            error: build.errorMessage,
            isActive: false
          }
        });
      }

      reply.send({
        success: true,
        data: {
          ...status,
          isActive: true
        }
      });
    } catch (error) {
      fastify.log.error('Error fetching pipeline status:', error);
      return sendErrorResponse(reply, 'INTERNAL_ERROR', {
        details: error.message
      });
    }
  });

  // Get stage-specific status (NEW - Requirements 1.2)
  fastify.get('/api/builds/:buildId/stages/:stageName', async (request, reply) => {
    try {
      const { buildId, stageName } = request.params;

      const { Build } = require('../models');
      const build = await Build.findByIdGlobal(buildId);

      if (!build) {
        return sendErrorResponse(reply, 'BUILD_NOT_FOUND');
      }

      const stageStatus = build.stageStatuses?.[stageName];

      if (!stageStatus) {
        return reply.code(404).send({
          success: false,
          error: 'STAGE_NOT_FOUND',
          message: `Stage '${stageName}' not found for build ${buildId}`
        });
      }

      reply.send({
        success: true,
        data: {
          buildId,
          stageName,
          ...stageStatus
        }
      });
    } catch (error) {
      fastify.log.error('Error fetching stage status:', error);
      return sendErrorResponse(reply, 'INTERNAL_ERROR', {
        details: error.message
      });
    }
  });

  // Get all stages for a build (NEW - Requirements 1.2)
  fastify.get('/api/builds/:buildId/stages', async (request, reply) => {
    try {
      const { buildId } = request.params;

      const { Build } = require('../models');
      const build = await Build.findByIdGlobal(buildId);

      if (!build) {
        return sendErrorResponse(reply, 'BUILD_NOT_FOUND');
      }

      reply.send({
        success: true,
        data: {
          buildId,
          currentStage: build.currentStage,
          stageStatuses: build.stageStatuses || {},
          failedAt: build.failedAt
        }
      });
    } catch (error) {
      fastify.log.error('Error fetching stages:', error);
      return sendErrorResponse(reply, 'INTERNAL_ERROR', {
        details: error.message
      });
    }
  });

  // Get artifacts for a specific stage (NEW - Requirements 1.3, 5.3, 8.1-8.10)
  fastify.get('/api/builds/:buildId/artifacts/:stageName', async (request, reply) => {
    try {
      const { buildId, stageName } = request.params;

      const { Build } = require('../models');
      const build = await Build.findByIdGlobal(buildId);

      if (!build) {
        return sendErrorResponse(reply, 'BUILD_NOT_FOUND');
      }

      const artifacts = build.getStageArtifacts(stageName);

      if (!artifacts) {
        return reply.code(404).send({
          success: false,
          error: 'ARTIFACTS_NOT_FOUND',
          message: `No artifacts found for stage '${stageName}' in build ${buildId}`
        });
      }

      reply.send({
        success: true,
        data: {
          buildId,
          stageName,
          artifacts
        }
      });
    } catch (error) {
      fastify.log.error('Error fetching stage artifacts:', error);
      return sendErrorResponse(reply, 'INTERNAL_ERROR', {
        details: error.message
      });
    }
  });

  // Get all artifacts for a build (NEW - Requirements 1.3, 5.3)
  fastify.get('/api/builds/:buildId/artifacts', async (request, reply) => {
    try {
      const { buildId } = request.params;

      const { Build } = require('../models');
      const build = await Build.findByIdGlobal(buildId);

      if (!build) {
        return sendErrorResponse(reply, 'BUILD_NOT_FOUND');
      }

      reply.send({
        success: true,
        data: {
          buildId,
          artifacts: build.artifacts || {},
          artifactsS3Url: build.artifactsS3Url
        }
      });
    } catch (error) {
      fastify.log.error('Error fetching artifacts:', error);
      return sendErrorResponse(reply, 'INTERNAL_ERROR', {
        details: error.message
      });
    }
  });

  // Get error logs for a build (NEW - Requirements 7.3, 7.4, 7.5)
  fastify.get('/api/builds/:buildId/errors', async (request, reply) => {
    try {
      const { buildId } = request.params;

      const { Build } = require('../models');
      const build = await Build.findByIdGlobal(buildId);

      if (!build) {
        return sendErrorResponse(reply, 'BUILD_NOT_FOUND');
      }

      reply.send({
        success: true,
        data: {
          buildId,
          errorLogs: build.errorLogs || [],
          failedAt: build.failedAt,
          errorMessage: build.errorMessage
        }
      });
    } catch (error) {
      fastify.log.error('Error fetching error logs:', error);
      return sendErrorResponse(reply, 'INTERNAL_ERROR', {
        details: error.message
      });
    }
  });

  // Start a new build with pipeline orchestrator (NEW - Requirements 1.1)
  fastify.post('/api/projects/:projectId/builds/start', {
    schema: {
      body: {
        type: 'object',
        properties: {
          specJson: { type: 'object' },
          buildOptions: { type: 'object' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { projectId } = request.params;
      const { specJson, buildOptions = {} } = request.body;

      const { Build, Project } = require('../models');
      const migration = getPipelineMigration();

      // Get project
      const project = await Project.findById(request.user?.orgId || 'default', projectId);

      if (!project) {
        return sendErrorResponse(reply, 'PROJECT_NOT_FOUND');
      }

      // Determine which pipeline to use (Requirements 10.1, 10.2, 10.3)
      const pipelineType = migration.selectPipeline(project);

      // Create build record
      const build = new Build({
        projectId,
        orgId: project.orgId,
        status: 'queued',
        specJson: specJson || project.specJson,
        buildOptions,
        currentStage: 0,
        stageStatuses: {},
        artifacts: {}
      });

      await build.save();

      fastify.log.info(`Created build ${build.buildId} for project ${projectId} using ${pipelineType} pipeline`);

      // Start pipeline based on type
      if (pipelineType === 'new') {
        // Use new stage-based pipeline orchestrator
        const orchestrator = getPipelineOrchestrator();

        // Start pipeline asynchronously
        orchestrator.startPipeline({
          buildId: build.buildId,
          projectId,
          orgId: project.orgId,
          userId: request.user?.userId || 'system',
          specJson: build.specJson
        }).catch(error => {
          fastify.log.error(`Pipeline failed for build ${build.buildId}:`, error);
        });

        reply.code(202).send({
          success: true,
          data: {
            buildId: build.buildId,
            projectId,
            status: 'queued',
            pipelineType: 'new',
            message: 'Build started with new stage-based pipeline'
          }
        });
      } else {
        // Use old job orchestrator for backward compatibility
        const jobOrchestrator = require('../services/job-orchestrator');

        // Queue build with old system
        await jobOrchestrator.queueBuild({
          buildId: build.buildId,
          projectId,
          orgId: project.orgId,
          specJson: build.specJson,
          buildOptions
        });

        reply.code(202).send({
          success: true,
          data: {
            buildId: build.buildId,
            projectId,
            status: 'queued',
            pipelineType: 'old',
            message: 'Build started with legacy agent role system'
          }
        });
      }
    } catch (error) {
      fastify.log.error('Error starting build:', error);
      return sendErrorResponse(reply, 'INTERNAL_ERROR', {
        details: error.message
      });
    }
  });

  // Direct build start endpoint (for questionnaire flow)
  fastify.post('/api/builds/start', {
    schema: {
      body: {
        type: 'object',
        required: ['specJson'],
        properties: {
          specJson: { type: 'object' },
          buildOptions: { type: 'object' },
          projectName: { type: 'string' },
          projectDescription: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { specJson, buildOptions = {}, projectName, projectDescription } = request.body;

      const { Build, Project } = require('../models');
      const orgId = request.user?.orgId || 'default';
      const userId = request.user?.userId || 'anonymous';

      // Create project first
      const project = new Project({
        orgId,
        name: projectName || specJson.project_overview?.app_name || 'Untitled Project',
        description: projectDescription || specJson.project_overview?.app_summary || '',
        visibility: 'private',
        specJson
      });

      await project.save();

      // Create build record
      const build = new Build({
        projectId: project.projectId,
        orgId,
        status: 'queued',
        specJson,
        buildOptions,
        currentStage: 0,
        stageStatuses: {},
        artifacts: {}
      });

      await build.save();

      fastify.log.info(`Created build ${build.buildId} for new project ${project.projectId}`);

      // Always use new pipeline for direct builds
      const orchestrator = getPipelineOrchestrator();

      // Start pipeline asynchronously
      orchestrator.startPipeline({
        buildId: build.buildId,
        projectId: project.projectId,
        orgId,
        userId,
        specJson: build.specJson,
        initialArtifacts: {
          refinedSpec: specJson, // Use the submitted spec as refined
          generatedDocs: request.body.generatedDocs, // Pass generated docs if available
          schema: request.body.schema, // Pass generated schema if available
          fileStructure: request.body.fileStructure // Pass generated file structure if available
        }
      }).catch(error => {
        fastify.log.error(`Pipeline failed for build ${build.buildId}:`, error);
      });

      reply.code(202).send({
        success: true,
        data: {
          buildId: build.buildId,
          projectId: project.projectId,
          status: 'queued',
          pipelineType: 'new',
          message: 'Build started successfully'
        }
      });
    } catch (error) {
      fastify.log.error('Error starting direct build:', error);
      return sendErrorResponse(reply, 'INTERNAL_ERROR', {
        details: error.message
      });
    }
  });
}

module.exports = buildRoutes;
