async function authRoutes(fastify, options) {
  // Register user
  fastify.post('/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password', 'firstName', 'lastName'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          firstName: { type: 'string', minLength: 1 },
          lastName: { type: 'string', minLength: 1 },
          organizationName: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await fastify.auth.register(request.body);
      
      reply.code(201).send({
        success: true,
        data: result
      });
    } catch (error) {
      reply.code(400).send({
        error: 'Registration failed',
        message: error.message
      });
    }
  });

  // Login user
  fastify.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { email, password } = request.body;
      const result = await fastify.auth.login(email, password);
      
      reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      reply.code(401).send({
        error: 'Login failed',
        message: error.message
      });
    }
  });

  // Logout user
  fastify.post('/logout', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      // In a JWT-based system, logout is typically handled client-side
      // by removing the token. However, we can log the logout event.
      const auditLogger = require('../services/audit-logger');
      await auditLogger.logUserEvent(request.user.userId, 'logout', {
        timestamp: new Date(),
        userAgent: request.headers['user-agent']
      });
      
      reply.send({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      // Don't fail logout on audit logging errors
      reply.send({
        success: true,
        message: 'Logged out successfully'
      });
    }
  });

  // Get user profile
  fastify.get('/profile', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      const profile = await fastify.auth.getProfile(request.user.userId);
      
      reply.send({
        success: true,
        data: profile
      });
    } catch (error) {
      reply.code(404).send({
        error: 'Profile not found',
        message: error.message
      });
    }
  });

  // Update user profile
  fastify.put('/profile', {
    preHandler: fastify.authenticate,
    schema: {
      body: {
        type: 'object',
        properties: {
          firstName: { type: 'string', minLength: 1 },
          lastName: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const updatedProfile = await fastify.auth.updateProfile(
        request.user.userId, 
        request.body
      );
      
      reply.send({
        success: true,
        data: updatedProfile
      });
    } catch (error) {
      reply.code(400).send({
        error: 'Profile update failed',
        message: error.message
      });
    }
  });

  // Change password
  fastify.post('/change-password', {
    preHandler: fastify.authenticate,
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword: { type: 'string', minLength: 8 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { currentPassword, newPassword } = request.body;
      const result = await fastify.auth.changePassword(
        request.user.userId,
        currentPassword,
        newPassword
      );
      
      reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      reply.code(400).send({
        error: 'Password change failed',
        message: error.message
      });
    }
  });

  // Get user organizations
  fastify.get('/organizations', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      const organizations = await fastify.auth.getUserOrganizations(request.user.userId);
      
      reply.send({
        success: true,
        data: organizations
      });
    } catch (error) {
      reply.code(500).send({
        error: 'Failed to fetch organizations',
        message: error.message
      });
    }
  });

  // Create organization
  fastify.post('/organizations', {
    preHandler: fastify.authenticate,
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 },
          description: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const organization = await fastify.auth.createOrganization(
        request.user.userId,
        request.body
      );
      
      reply.code(201).send({
        success: true,
        data: organization
      });
    } catch (error) {
      reply.code(400).send({
        error: 'Organization creation failed',
        message: error.message
      });
    }
  });

  // Deactivate user account
  fastify.post('/deactivate', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      const result = await fastify.auth.deactivateAccount(request.user.userId);
      
      reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      reply.code(400).send({
        error: 'Account deactivation failed',
        message: error.message
      });
    }
  });

  // Verify email
  fastify.post('/verify-email', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      const result = await fastify.auth.verifyEmail(request.user.userId);
      
      reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      reply.code(400).send({
        error: 'Email verification failed',
        message: error.message
      });
    }
  });

  // Get user's accessible projects
  fastify.get('/projects', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      const limit = parseInt(request.query.limit) || 50;
      const projects = await fastify.auth.getUserProjects(request.user.userId, limit);
      
      reply.send({
        success: true,
        data: projects
      });
    } catch (error) {
      reply.code(500).send({
        error: 'Failed to fetch user projects',
        message: error.message
      });
    }
  });
}

module.exports = authRoutes;