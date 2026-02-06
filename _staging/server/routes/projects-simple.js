const { sendErrorResponse } = require('../utils/error-responses');

async function projectsSimpleRoutes(fastify, options) {
  // Create a new project (simplified for questionnaire flow)
  fastify.post('/api/projects', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          visibility: { type: 'string', enum: ['public', 'private'], default: 'private' },
          specJson: { type: 'object' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name, description, visibility = 'private', specJson } = request.body;
      
      const { Project } = require('../models');
      const orgId = request.user?.orgId || 'default';
      
      // Create project
      const project = new Project({
        orgId,
        name,
        description: description || '',
        visibility,
        specJson: specJson || {}
      });
      
      await project.save();
      
      fastify.log.info(`Created project ${project.projectId}: ${name}`);
      
      reply.code(201).send({
        success: true,
        data: {
          projectId: project.projectId,
          name: project.name,
          description: project.description,
          visibility: project.visibility,
          createdAt: project.createdAt
        }
      });
    } catch (error) {
      fastify.log.error('Error creating project:', error);
      return sendErrorResponse(reply, 'INTERNAL_ERROR', {
        details: error.message
      });
    }
  });

  // Get project by ID
  fastify.get('/api/projects/:projectId', async (request, reply) => {
    try {
      const { projectId } = request.params;
      const { Project } = require('../models');
      const orgId = request.user?.orgId || 'default';
      
      const project = await Project.findById(orgId, projectId);
      
      if (!project) {
        return sendErrorResponse(reply, 'PROJECT_NOT_FOUND');
      }
      
      reply.send({
        success: true,
        data: project
      });
    } catch (error) {
      fastify.log.error('Error fetching project:', error);
      return sendErrorResponse(reply, 'INTERNAL_ERROR', {
        details: error.message
      });
    }
  });
}

module.exports = projectsSimpleRoutes;