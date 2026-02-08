const { sendErrorResponse, sendErrorFromException } = require('../utils/error-responses');

async function projectRoutes(fastify, options) {
  // Create project
  fastify.post('/', {
    preHandler: fastify.authenticate,
    schema: {
      body: {
        type: 'object',
        required: ['name', 'orgId'],
        properties: {
          name: { type: 'string', minLength: 1 },
          orgId: { type: 'string' },
          specJson: { type: 'object' },
          visibility: { 
            type: 'string', 
            enum: ['private', 'organization', 'public'],
            default: 'private'
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name, orgId, specJson = {}, visibility = 'private' } = request.body;
      
      // Check organization access
      const hasAccess = await fastify.auth.checkOrganizationAccess(
        request.user.userId, 
        orgId, 
        'dev'
      );
      
      if (!hasAccess) {
        return sendErrorResponse(reply, 'AUTH_INSUFFICIENT_PERMISSIONS', {
          customMessage: 'You don\'t have permission to create projects in this organization.',
          customSolution: 'Contact your organization administrator to request developer access.'
        });
      }

      const { Project } = require('../models');
      const project = new Project({
        name,
        orgId,
        owner: request.user.userId,
        specJson,
        visibility
      });

      await project.save();
      
      reply.code(201).send({
        success: true,
        data: project
      });
    } catch (error) {
      return sendErrorFromException(reply, error, 'BAD_REQUEST');
    }
  });

  // Get project by ID
  fastify.get('/:orgId/:projectId', {
    preHandler: fastify.requireProjectAccess()
  }, async (request, reply) => {
    try {
      const { Project } = require('../models');
      const project = await Project.findById(
        request.params.orgId, 
        request.params.projectId
      );
      
      if (!project) {
        return sendErrorResponse(reply, 'PROJECT_NOT_FOUND');
      }

      reply.send({
        success: true,
        data: project
      });
    } catch (error) {
      return sendErrorFromException(reply, error, 'INTERNAL_ERROR');
    }
  });

  // Update project
  fastify.put('/:orgId/:projectId', {
    preHandler: fastify.requireOrganizationAccess('dev'),
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          specJson: { type: 'object' },
          visibility: { 
            type: 'string', 
            enum: ['private', 'organization', 'public']
          },
          status: {
            type: 'string',
            enum: ['draft', 'building', 'deployed', 'failed']
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { Project } = require('../models');
      const project = await Project.findById(
        request.params.orgId, 
        request.params.projectId
      );
      
      if (!project) {
        return reply.code(404).send({
          error: 'Project not found'
        });
      }

      const updatedProject = await project.update(request.body);
      
      reply.send({
        success: true,
        data: updatedProject
      });
    } catch (error) {
      reply.code(400).send({
        error: 'Project update failed',
        message: error.message
      });
    }
  });

  // Delete project
  fastify.delete('/:orgId/:projectId', {
    preHandler: fastify.requireOrganizationAccess('admin')
  }, async (request, reply) => {
    try {
      const { Project } = require('../models');
      const project = await Project.findById(
        request.params.orgId, 
        request.params.projectId
      );
      
      if (!project) {
        return reply.code(404).send({
          error: 'Project not found'
        });
      }

      await Project.delete(request.params.orgId, request.params.projectId);
      
      reply.send({
        success: true,
        message: 'Project deleted successfully'
      });
    } catch (error) {
      reply.code(500).send({
        error: 'Failed to delete project',
        message: error.message
      });
    }
  });

  // Start build
  fastify.post('/:orgId/:projectId/builds', {
    preHandler: fastify.requireOrganizationAccess('dev'),
    schema: {
      body: {
        type: 'object',
        properties: {
          buildOptions: {
            type: 'object',
            properties: {
              runTests: { type: 'boolean', default: true },
              deploy: { type: 'boolean', default: false },
              deploymentOptions: { type: 'object' }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { Project, Build } = require('../models');
      const project = await Project.findById(
        request.params.orgId, 
        request.params.projectId
      );
      
      if (!project) {
        return sendErrorResponse(reply, 'PROJECT_NOT_FOUND');
      }

      const { buildOptions = { runTests: true, deploy: false } } = request.body;

      // Create build record
      const build = new Build({
        projectId: project.projectId,
        orgId: project.orgId,
        specJson: project.specJson,
        buildOptions,
        status: 'queued',
        phase: 'planning'
      });

      await build.save();

      // Update project with latest build ID
      await project.update({ 
        latestBuildId: build.buildId,
        status: 'building'
      });

      // Determine which pipeline to use (Requirements 10.1, 10.2, 10.3)
      const PipelineMigration = require('../services/pipeline-migration');
      const pipelineMigration = new PipelineMigration({
        buildModel: Build,
        projectModel: Project
      });

      const pipelineType = pipelineMigration.selectPipeline(project, build);

      if (pipelineType === 'old') {
        // Use old job orchestrator for backward compatibility (Requirement 10.2)
        fastify.log.warn(`Using old agent role system for project ${project.projectId}`);
        
        const JobOrchestrator = require('../services/job-orchestrator');
        const orchestrator = new JobOrchestrator({
          jobQueue: fastify.jobQueue,
          buildModel: Build,
          projectModel: Project,
          websocket: fastify.websocket
        });

        // Start orchestration flow (planning -> generation -> testing -> deployment)
        await orchestrator.startOrchestration({
          buildId: build.buildId,
          projectId: project.projectId,
          orgId: project.orgId,
          specJson: project.specJson,
          buildOptions,
          userId: request.user.userId
        });
      } else {
        // Use new stage-based pipeline (Requirement 10.3)
        fastify.log.info(`Using new stage-based pipeline for project ${project.projectId}`);
        
        const PipelineOrchestrator = require('../services/pipeline-orchestrator');
        const StageRouter = require('../services/stage-router');
        const artifactStorage = require('../../workers/services/artifact-storage');
        
        const stageRouter = new StageRouter(fastify.modelRouter);
        const pipelineOrchestrator = new PipelineOrchestrator({
          stageRouter,
          artifactStorage,
          buildModel: Build,
          projectModel: Project,
          websocket: fastify.websocket,
          emailService: require('../services/email-notifications')
        });

        // Start 8-stage pipeline
        await pipelineOrchestrator.startPipeline({
          buildId: build.buildId,
          projectId: project.projectId,
          orgId: project.orgId,
          specJson: project.specJson,
          userId: request.user.userId
        });
      }

      // Log audit event
      const auditLogger = require('../services/audit-logger');
      await auditLogger.logBuildEvent(
        build.buildId,
        project.projectId,
        'build_started',
        {
          actor: request.user.userId,
          actorType: 'user',
          orgId: project.orgId,
          buildOptions,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent']
        }
      );
      
      reply.code(201).send({
        success: true,
        data: {
          buildId: build.buildId,
          status: build.status,
          phase: build.phase,
          projectId: project.projectId,
          message: 'Build orchestration started'
        }
      });
    } catch (error) {
      return sendErrorFromException(reply, error, 'BAD_REQUEST');
    }
  });

  // Get project builds with pagination
  fastify.get('/:orgId/:projectId/builds', {
    preHandler: fastify.requireOrganizationAccess(),
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          lastKey: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { Build } = require('../models');
      const { limit = 20, lastKey } = request.query;
      
      const lastEvaluatedKey = lastKey ? JSON.parse(Buffer.from(lastKey, 'base64').toString()) : null;
      
      const result = await Build.getBuildHistory(request.params.projectId, {
        limit,
        lastEvaluatedKey
      });
      
      // Encode lastEvaluatedKey for pagination
      const nextKey = result.lastEvaluatedKey 
        ? Buffer.from(JSON.stringify(result.lastEvaluatedKey)).toString('base64')
        : null;
      
      reply.send({
        success: true,
        data: {
          builds: result.builds,
          pagination: {
            hasMore: result.hasMore,
            nextKey
          }
        }
      });
    } catch (error) {
      return sendErrorFromException(reply, error, 'INTERNAL_ERROR');
    }
  });

  // Get build status
  fastify.get('/builds/:buildId', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      const { Build } = require('../models');
      
      // Find build (we need to scan since we don't have projectId)
      // In production, you'd want to include projectId in the route
      const orgIds = request.user.organizations?.map(org => org.orgId) || [];
      let build = null;
      
      // This is inefficient - in production you'd want a GSI on buildId
      for (const orgId of orgIds) {
        const orgProjects = await require('../models').Project.findByOrganization(orgId);
        for (const project of orgProjects) {
          const foundBuild = await Build.findById(project.projectId, request.params.buildId);
          if (foundBuild) {
            build = foundBuild;
            break;
          }
        }
        if (build) break;
      }

      if (!build) {
        return reply.code(404).send({
          error: 'Build not found'
        });
      }

      // Check organization access
      const hasAccess = await fastify.auth.checkOrganizationAccess(
        request.user.userId, 
        build.orgId
      );
      
      if (!hasAccess) {
        return reply.code(403).send({
          error: 'Access denied'
        });
      }

      reply.send({
        success: true,
        data: build
      });
    } catch (error) {
      reply.code(500).send({
        error: 'Failed to fetch build',
        message: error.message
      });
    }
  });

  // Get project members
  fastify.get('/:orgId/:projectId/members', {
    preHandler: fastify.requireOrganizationAccess()
  }, async (request, reply) => {
    try {
      const members = await fastify.auth.getProjectMembers(
        request.user.userId,
        request.params.orgId,
        request.params.projectId
      );
      
      reply.send({
        success: true,
        data: members
      });
    } catch (error) {
      reply.code(500).send({
        error: 'Failed to fetch project members',
        message: error.message
      });
    }
  });

  // Share project with user
  fastify.post('/:orgId/:projectId/share', {
    preHandler: fastify.requireOrganizationAccess('dev'),
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
          role: { 
            type: 'string', 
            enum: ['viewer', 'dev', 'admin'],
            default: 'viewer'
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { email, role = 'viewer' } = request.body;
      const result = await fastify.auth.shareProject(
        request.user.userId,
        request.params.orgId,
        request.params.projectId,
        email,
        role
      );
      
      reply.code(201).send({
        success: true,
        data: result
      });
    } catch (error) {
      reply.code(400).send({
        error: 'Failed to share project',
        message: error.message
      });
    }
  });

  // Update project member role
  fastify.put('/:orgId/:projectId/members/:memberId', {
    preHandler: fastify.requireOrganizationAccess('dev'),
    schema: {
      body: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { 
            type: 'string', 
            enum: ['viewer', 'dev', 'admin']
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { role } = request.body;
      const result = await fastify.auth.updateProjectMemberRole(
        request.user.userId,
        request.params.orgId,
        request.params.projectId,
        request.params.memberId,
        role
      );
      
      reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      reply.code(400).send({
        error: 'Failed to update project member role',
        message: error.message
      });
    }
  });

  // Unshare project from user
  fastify.delete('/:orgId/:projectId/members/:memberId', {
    preHandler: fastify.requireOrganizationAccess('dev')
  }, async (request, reply) => {
    try {
      const result = await fastify.auth.unshareProject(
        request.user.userId,
        request.params.orgId,
        request.params.projectId,
        request.params.memberId
      );
      
      reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      reply.code(400).send({
        error: 'Failed to unshare project',
        message: error.message
      });
    }
  });

  // Deploy project
  fastify.post('/:orgId/:projectId/deploy', {
    preHandler: fastify.requireOrganizationAccess('dev'),
    config: {
      rateLimit: fastify.rateLimitConfig.deployment
    },
    schema: {
      body: {
        type: 'object',
        properties: {
          generatedFiles: {
            type: 'object',
            description: 'Object with file paths as keys and content as values'
          },
          deploymentOptions: {
            type: 'object',
            properties: {
              privateRepo: { type: 'boolean', default: true },
              autoTriggerWorkflow: { type: 'boolean', default: true }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { Project, Deployment } = require('../models');
      const project = await Project.findById(
        request.params.orgId, 
        request.params.projectId
      );
      
      if (!project) {
        return reply.code(404).send({
          error: 'Project not found'
        });
      }

      const { generatedFiles = {}, deploymentOptions = {} } = request.body;

      // Create deployment record
      const deployment = new Deployment({
        userId: request.user.userId,
        projectId: project.projectId,
        status: 'pending'
      });

      await deployment.save();

      // Queue deployment job
      const jobQueue = fastify.jobQueue;
      if (!jobQueue || !jobQueue.isInitialized()) {
        return sendErrorResponse(reply, 'QUEUE_UNAVAILABLE');
      }

      await jobQueue.addJob('deployment', 'deploy-project', {
        deploymentId: deployment.id,
        userId: request.user.userId,
        projectId: project.projectId,
        orgId: project.orgId,
        generatedFiles,
        deploymentOptions: {
          privateRepo: deploymentOptions.privateRepo !== false,
          autoTriggerWorkflow: deploymentOptions.autoTriggerWorkflow !== false
        }
      }, {
        priority: 1,
        attempts: 2
      });

      // Update project status
      await project.update({ 
        status: 'deploying'
      });

      // Log audit event for deployment trigger
      const auditLogger = require('../services/audit-logger');
      await auditLogger.logDeploymentEvent(
        deployment.id,
        project.projectId,
        null, // buildId
        'deployment_triggered',
        {
          actor: request.user.userId,
          actorType: 'user',
          orgId: project.orgId,
          deploymentOptions,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent']
        }
      );

      reply.code(202).send({
        success: true,
        data: {
          deploymentId: deployment.id,
          status: deployment.status,
          projectId: project.projectId,
          message: 'Deployment queued successfully'
        }
      });
    } catch (error) {
      reply.code(400).send({
        error: 'Deployment trigger failed',
        message: error.message
      });
    }
  });

  // Get deployment status
  fastify.get('/:orgId/:projectId/deployments/:deploymentId', {
    preHandler: fastify.requireOrganizationAccess()
  }, async (request, reply) => {
    try {
      const { Deployment } = require('../models');
      const deployment = await Deployment.findById(request.params.deploymentId);
      
      if (!deployment) {
        return reply.code(404).send({
          error: 'Deployment not found'
        });
      }

      // Verify deployment belongs to this project
      if (deployment.projectId !== request.params.projectId) {
        return reply.code(403).send({
          error: 'Access denied'
        });
      }

      reply.send({
        success: true,
        data: deployment
      });
    } catch (error) {
      reply.code(500).send({
        error: 'Failed to fetch deployment',
        message: error.message
      });
    }
  });

  // Get all deployments for a project
  fastify.get('/:orgId/:projectId/deployments', {
    preHandler: fastify.requireOrganizationAccess()
  }, async (request, reply) => {
    try {
      const { Deployment } = require('../models');
      const deployments = await Deployment.findByProjectId(request.params.projectId);
      
      reply.send({
        success: true,
        data: deployments
      });
    } catch (error) {
      reply.code(500).send({
        error: 'Failed to fetch deployments',
        message: error.message
      });
    }
  });

  // Get build statistics for a project
  fastify.get('/:orgId/:projectId/builds/stats', {
    preHandler: fastify.requireOrganizationAccess()
  }, async (request, reply) => {
    try {
      const { Build } = require('../models');
      const stats = await Build.getProjectBuildStats(request.params.projectId);
      
      reply.send({
        success: true,
        data: stats
      });
    } catch (error) {
      return sendErrorFromException(reply, error, 'INTERNAL_ERROR');
    }
  });

  // Compare two builds
  fastify.get('/:orgId/:projectId/builds/compare', {
    preHandler: fastify.requireOrganizationAccess(),
    schema: {
      querystring: {
        type: 'object',
        required: ['build1', 'build2'],
        properties: {
          build1: { type: 'string' },
          build2: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { Build } = require('../models');
      const { build1, build2 } = request.query;
      
      const comparison = await Build.compareBuilds(
        request.params.projectId,
        build1,
        build2
      );
      
      reply.send({
        success: true,
        data: comparison
      });
    } catch (error) {
      return sendErrorFromException(reply, error, 'INTERNAL_ERROR');
    }
  });
}

module.exports = projectRoutes;