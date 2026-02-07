const taskPlanner = require('../services/task-planner');

async function taskPlannerRoutes(fastify, options) {
  // Plan project from spec.json
  fastify.post('/api/projects/:projectId/plan', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const { projectId } = request.params;
      const { specJson, buildId } = request.body;
      
      if (!specJson) {
        return reply.code(400).send({
          success: false,
          error: 'specJson is required'
        });
      }
      
      // Validate that user has access to this project
      // TODO: Add project ownership validation
      
      const plan = await taskPlanner.planProject(specJson);
      
      return {
        success: true,
        data: {
          projectId,
          buildId: buildId || `build-${Date.now()}`,
          plan
        }
      };
      
    } catch (error) {
      fastify.log.error('Failed to plan project:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to generate project plan'
      });
    }
  });

  // Add planning job to queue
  fastify.post('/api/projects/:projectId/plan/queue', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const { projectId } = request.params;
      const { specJson, buildId } = request.body;
      const userId = request.user.id;
      
      if (!specJson) {
        return reply.code(400).send({
          success: false,
          error: 'specJson is required'
        });
      }
      
      // TODO: Add project ownership validation
      
      const result = await taskPlanner.addJobToQueue(projectId, specJson, userId, buildId);
      
      return {
        success: true,
        data: result
      };
      
    } catch (error) {
      fastify.log.error('Failed to queue planning job:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to queue planning job'
      });
    }
  });

  // Get OpenAPI skeleton for project
  fastify.post('/api/projects/:projectId/openapi', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const { projectId } = request.params;
      const { specJson } = request.body;
      
      if (!specJson) {
        return reply.code(400).send({
          success: false,
          error: 'specJson is required'
        });
      }
      
      const openApiSkeleton = await taskPlanner.generateOpenAPIskeleton(specJson, []);
      
      return {
        success: true,
        data: {
          projectId,
          openApiSkeleton
        }
      };
      
    } catch (error) {
      fastify.log.error('Failed to generate OpenAPI skeleton:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to generate OpenAPI skeleton'
      });
    }
  });

  // Get database schema for project
  fastify.post('/api/projects/:projectId/schema', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const { projectId } = request.params;
      const { specJson } = request.body;
      
      if (!specJson) {
        return reply.code(400).send({
          success: false,
          error: 'specJson is required'
        });
      }
      
      const databaseSchema = await taskPlanner.generateDatabaseSchema(specJson, []);
      
      return {
        success: true,
        data: {
          projectId,
          databaseSchema
        }
      };
      
    } catch (error) {
      fastify.log.error('Failed to generate database schema:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to generate database schema'
      });
    }
  });

  // Get task estimation for spec
  fastify.post('/api/estimate', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    try {
      const { specJson } = request.body;
      
      if (!specJson) {
        return reply.code(400).send({
          success: false,
          error: 'specJson is required'
        });
      }
      
      // Quick estimation without full planning
      const taskPlan = await taskPlanner.decomposeSpec(specJson);
      
      return {
        success: true,
        data: {
          estimation: taskPlan.totalEstimation,
          taskCount: taskPlan.tasks.length,
          milestoneCount: taskPlan.milestones.length,
          features: taskPlanner.analyzeRequiredFeatures(specJson)
        }
      };
      
    } catch (error) {
      fastify.log.error('Failed to estimate project:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to estimate project'
      });
    }
  });
}

module.exports = taskPlannerRoutes;