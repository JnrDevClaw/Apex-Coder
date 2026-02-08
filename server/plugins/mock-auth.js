const fp = require('fastify-plugin');

/**
 * Mock Authentication Plugin for Development
 * Provides a simple mock user for development and testing
 */
async function mockAuthPlugin(fastify, options) {
  // Skip in production
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  // Mock user for development
  const mockUser = {
    userId: 'dev-user-123',
    orgId: 'dev-org-123',
    email: 'developer@example.com',
    name: 'Development User',
    role: 'admin'
  };

  // Add mock authentication hook
  fastify.addHook('onRequest', async (request, reply) => {
    // Skip auth for health checks and static files
    if (request.url.startsWith('/health') || 
        request.url.startsWith('/api/health') ||
        request.url.startsWith('/static') ||
        request.url.startsWith('/favicon')) {
      return;
    }

    // Add mock user to all requests in development
    request.user = mockUser;
  });

  // Mock JWT verification function (only if not already decorated)
  if (!fastify.hasDecorator('verifyJWT')) {
    fastify.decorate('verifyJWT', async function(request, reply) {
      // In development, always pass with mock user
      request.user = mockUser;
    });
  }

  // Mock auth array function (only if not already decorated)
  // Check if decorator exists before adding
  try {
    if (!fastify.hasDecorator('auth')) {
      fastify.decorate('auth', function(authFunctions) {
        return async function(request, reply) {
          // In development, always pass with mock user
          request.user = mockUser;
        };
      });
    } else {
      console.log('⚠️  Auth decorator already exists, skipping mock auth decorator');
    }
  } catch (error) {
    // Decorator already exists, skip
    console.log('⚠️  Auth decorator registration skipped:', error.message);
  }

  console.log('🔓 Mock authentication enabled for development');
}

module.exports = fp(mockAuthPlugin, {
  name: 'mock-auth',
  dependencies: []
});