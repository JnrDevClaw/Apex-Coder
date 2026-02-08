async function organizationRoutes(fastify, options) {
  // Get organization details
  fastify.get('/:orgId', {
    preHandler: fastify.requireOrganizationAccess()
  }, async (request, reply) => {
    try {
      const { Organization } = require('../models');
      const organization = await Organization.findById(request.params.orgId);
      
      if (!organization) {
        return reply.code(404).send({
          error: 'Organization not found'
        });
      }

      reply.send({
        success: true,
        data: organization
      });
    } catch (error) {
      reply.code(500).send({
        error: 'Failed to fetch organization',
        message: error.message
      });
    }
  });

  // Update organization
  fastify.put('/:orgId', {
    preHandler: fastify.requireOrganizationAccess('admin'),
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          settings: { type: 'object' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { Organization } = require('../models');
      const organization = await Organization.findById(request.params.orgId);
      
      if (!organization) {
        return reply.code(404).send({
          error: 'Organization not found'
        });
      }

      const updatedOrganization = await organization.update(request.body);
      
      reply.send({
        success: true,
        data: updatedOrganization
      });
    } catch (error) {
      reply.code(400).send({
        error: 'Organization update failed',
        message: error.message
      });
    }
  });

  // Get organization members
  fastify.get('/:orgId/members', {
    preHandler: fastify.requireOrganizationAccess()
  }, async (request, reply) => {
    try {
      const { Organization, User } = require('../models');
      const organization = await Organization.findById(request.params.orgId);
      
      if (!organization) {
        return reply.code(404).send({
          error: 'Organization not found'
        });
      }

      // Get member details
      const members = [];
      for (const member of organization.members) {
        const user = await User.findById(member.userId);
        if (user) {
          members.push({
            userId: user.userId,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: member.role,
            addedAt: member.addedAt,
            isOwner: organization.owner === user.userId
          });
        }
      }

      reply.send({
        success: true,
        data: members
      });
    } catch (error) {
      reply.code(500).send({
        error: 'Failed to fetch members',
        message: error.message
      });
    }
  });

  // Add member to organization
  fastify.post('/:orgId/members', {
    preHandler: fastify.requireOrganizationAccess('admin'),
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
      const result = await fastify.auth.addOrganizationMember(
        request.user.userId,
        request.params.orgId,
        email,
        role
      );
      
      reply.code(201).send({
        success: true,
        data: result
      });
    } catch (error) {
      reply.code(400).send({
        error: 'Failed to add member',
        message: error.message
      });
    }
  });

  // Update member role
  fastify.put('/:orgId/members/:memberId', {
    preHandler: fastify.requireOrganizationAccess('admin'),
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
      const result = await fastify.auth.updateMemberRole(
        request.user.userId,
        request.params.orgId,
        request.params.memberId,
        role
      );
      
      reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      reply.code(400).send({
        error: 'Failed to update member role',
        message: error.message
      });
    }
  });

  // Remove member from organization
  fastify.delete('/:orgId/members/:memberId', {
    preHandler: fastify.requireOrganizationAccess('admin')
  }, async (request, reply) => {
    try {
      const result = await fastify.auth.removeOrganizationMember(
        request.user.userId,
        request.params.orgId,
        request.params.memberId
      );
      
      reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      reply.code(400).send({
        error: 'Failed to remove member',
        message: error.message
      });
    }
  });

  // Get organization projects
  fastify.get('/:orgId/projects', {
    preHandler: fastify.requireOrganizationAccess()
  }, async (request, reply) => {
    try {
      const { Project } = require('../models');
      const projects = await Project.findByOrganization(request.params.orgId);
      
      reply.send({
        success: true,
        data: projects
      });
    } catch (error) {
      reply.code(500).send({
        error: 'Failed to fetch projects',
        message: error.message
      });
    }
  });

  // Delete organization (owner only)
  fastify.delete('/:orgId', {
    preHandler: fastify.requireOrganizationAccess('admin')
  }, async (request, reply) => {
    try {
      const { Organization } = require('../models');
      const organization = await Organization.findById(request.params.orgId);
      
      if (!organization) {
        return reply.code(404).send({
          error: 'Organization not found'
        });
      }

      // Only owner can delete organization
      if (organization.owner !== request.user.userId) {
        return reply.code(403).send({
          error: 'Only organization owner can delete organization'
        });
      }

      await Organization.delete(request.params.orgId);
      
      reply.send({
        success: true,
        message: 'Organization deleted successfully'
      });
    } catch (error) {
      reply.code(500).send({
        error: 'Failed to delete organization',
        message: error.message
      });
    }
  });
}

module.exports = organizationRoutes;