const fp = require('fastify-plugin');
const authService = require('../services/auth');

async function authPlugin(fastify, options) {
  // Register JWT plugin
  await fastify.register(require('@fastify/jwt'), {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production'
  });

  // Register CORS plugin
  await fastify.register(require('@fastify/cors'), {
    origin: process.env.CORS_ORIGIN || true,
    credentials: true
  });

  // Add auth service to fastify instance
  fastify.decorate('auth', authService);

  // Authentication decorator
  fastify.decorate('authenticate', async function(request, reply) {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        throw new Error('No token provided');
      }

      const decoded = authService.verifyToken(token);
      request.user = decoded;
    } catch (error) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: error.message
      });
    }
  });

  // Organization access decorator
  fastify.decorate('requireOrganizationAccess', function(requiredRole = null) {
    return async function(request, reply) {
      try {
        // First authenticate
        await fastify.authenticate(request, reply);
        
        const orgId = request.params.orgId || request.body.orgId;
        if (!orgId) {
          throw new Error('Organization ID required');
        }

        const hasAccess = await authService.checkOrganizationAccess(
          request.user.userId, 
          orgId, 
          requiredRole
        );

        if (!hasAccess) {
          throw new Error('Insufficient organization permissions');
        }

        request.orgId = orgId;
      } catch (error) {
        reply.code(403).send({
          error: 'Forbidden',
          message: error.message
        });
      }
    };
  });

  // Project access decorator
  fastify.decorate('requireProjectAccess', function(requiredRole = null) {
    return async function(request, reply) {
      try {
        // First authenticate
        await fastify.authenticate(request, reply);
        
        const orgId = request.params.orgId;
        const projectId = request.params.projectId;
        
        if (!orgId || !projectId) {
          throw new Error('Organization ID and Project ID required');
        }

        const hasAccess = await authService.checkProjectAccess(
          request.user.userId, 
          orgId, 
          projectId,
          requiredRole
        );

        if (!hasAccess) {
          throw new Error('Insufficient project permissions');
        }

        request.orgId = orgId;
        request.projectId = projectId;
      } catch (error) {
        reply.code(403).send({
          error: 'Forbidden',
          message: error.message
        });
      }
    };
  });

  // Admin access decorator
  fastify.decorate('requireAdmin', async function(request, reply) {
    try {
      await fastify.authenticate(request, reply);
      
      // Check if user is admin in any organization or system admin
      const isAdmin = request.user.organizations?.some(org => 
        org.role === 'admin' || org.role === 'owner'
      );

      if (!isAdmin) {
        throw new Error('Admin access required');
      }
    } catch (error) {
      reply.code(403).send({
        error: 'Forbidden',
        message: error.message
      });
    }
  });

  // Role-based access decorator
  fastify.decorate('requireRole', function(requiredRole) {
    return async function(request, reply) {
      try {
        await fastify.authenticate(request, reply);
        
        // Check if user has the required role in any organization
        const hasRole = request.user.organizations?.some(org => 
          org.role === requiredRole || org.role === 'owner' || org.role === 'admin'
        );

        if (!hasRole) {
          throw new Error(`Role '${requiredRole}' required`);
        }
      } catch (error) {
        reply.code(403).send({
          error: 'Forbidden',
          message: error.message
        });
      }
    };
  });

  // Error handler for authentication errors
  fastify.setErrorHandler(function (error, request, reply) {
    if (error.statusCode === 401) {
      reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });
    } else if (error.statusCode === 403) {
      reply.code(403).send({
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
    } else {
      // Default error handler
      reply.send(error);
    }
  });
}

module.exports = fp(authPlugin, {
  name: 'auth'
});