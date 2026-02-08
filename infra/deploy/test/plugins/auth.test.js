const Fastify = require('fastify');
const authPlugin = require('../../plugins/auth');
const authService = require('../../services/auth');

// Mock the auth service
jest.mock('../../services/auth', () => ({
  verifyToken: jest.fn(),
  checkOrganizationAccess: jest.fn(),
  checkProjectAccess: jest.fn()
}));

describe('Auth Plugin', () => {
  let fastify;

  beforeEach(async () => {
    fastify = Fastify();
    await fastify.register(authPlugin);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('authenticate decorator', () => {
    test('should authenticate valid JWT token', async () => {
      const mockUser = {
        userId: 'user123',
        email: 'test@example.com',
        organizations: []
      };

      authService.verifyToken.mockReturnValue(mockUser);

      fastify.get('/test', {
        preHandler: fastify.authenticate
      }, async (request, reply) => {
        reply.send({ user: request.user });
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer valid-token'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload).user).toEqual(mockUser);
      expect(authService.verifyToken).toHaveBeenCalledWith('valid-token');
    });

    test('should reject request without token', async () => {
      fastify.get('/test', {
        preHandler: fastify.authenticate
      }, async (request, reply) => {
        reply.send({ success: true });
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/test'
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload).error).toBe('Unauthorized');
    });

    test('should reject request with invalid token', async () => {
      authService.verifyToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      fastify.get('/test', {
        preHandler: fastify.authenticate
      }, async (request, reply) => {
        reply.send({ success: true });
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/test',
        headers: {
          authorization: 'Bearer invalid-token'
        }
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload).error).toBe('Unauthorized');
    });
  });

  describe('requireOrganizationAccess decorator', () => {
    test('should allow access with valid organization permissions', async () => {
      const mockUser = {
        userId: 'user123',
        email: 'test@example.com',
        organizations: [{ orgId: 'org123', role: 'admin' }]
      };

      authService.verifyToken.mockReturnValue(mockUser);
      authService.checkOrganizationAccess.mockResolvedValue(true);

      fastify.get('/test/:orgId', {
        preHandler: fastify.requireOrganizationAccess('admin')
      }, async (request, reply) => {
        reply.send({ success: true, orgId: request.orgId });
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/test/org123',
        headers: {
          authorization: 'Bearer valid-token'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload).orgId).toBe('org123');
      expect(authService.checkOrganizationAccess).toHaveBeenCalledWith('user123', 'org123', 'admin');
    });

    test('should reject access with insufficient organization permissions', async () => {
      const mockUser = {
        userId: 'user123',
        email: 'test@example.com',
        organizations: [{ orgId: 'org123', role: 'viewer' }]
      };

      authService.verifyToken.mockReturnValue(mockUser);
      authService.checkOrganizationAccess.mockResolvedValue(false);

      fastify.get('/test/:orgId', {
        preHandler: fastify.requireOrganizationAccess('admin')
      }, async (request, reply) => {
        reply.send({ success: true });
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/test/org123',
        headers: {
          authorization: 'Bearer valid-token'
        }
      });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.payload).error).toBe('Forbidden');
    });

    test('should reject access without organization ID', async () => {
      const mockUser = {
        userId: 'user123',
        email: 'test@example.com',
        organizations: []
      };

      authService.verifyToken.mockReturnValue(mockUser);

      // Use a route with params to avoid undefined params
      fastify.post('/test', {
        preHandler: fastify.requireOrganizationAccess()
      }, async (request, reply) => {
        reply.send({ success: true });
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/test',
        headers: {
          authorization: 'Bearer valid-token'
        },
        payload: {} // Empty body, no orgId
      });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.payload).message).toContain('Organization ID required');
    });
  });

  describe('requireProjectAccess decorator', () => {
    test('should allow access with valid project permissions', async () => {
      const mockUser = {
        userId: 'user123',
        email: 'test@example.com',
        organizations: [{ orgId: 'org123', role: 'dev' }]
      };

      authService.verifyToken.mockReturnValue(mockUser);
      authService.checkProjectAccess.mockResolvedValue(true);

      fastify.get('/test/:orgId/projects/:projectId', {
        preHandler: fastify.requireProjectAccess('viewer')
      }, async (request, reply) => {
        reply.send({ 
          success: true, 
          orgId: request.orgId,
          projectId: request.projectId 
        });
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/test/org123/projects/project456',
        headers: {
          authorization: 'Bearer valid-token'
        }
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.orgId).toBe('org123');
      expect(payload.projectId).toBe('project456');
      expect(authService.checkProjectAccess).toHaveBeenCalledWith('user123', 'org123', 'project456', 'viewer');
    });

    test('should reject access with insufficient project permissions', async () => {
      const mockUser = {
        userId: 'user123',
        email: 'test@example.com',
        organizations: [{ orgId: 'org123', role: 'viewer' }]
      };

      authService.verifyToken.mockReturnValue(mockUser);
      authService.checkProjectAccess.mockResolvedValue(false);

      fastify.get('/test/:orgId/projects/:projectId', {
        preHandler: fastify.requireProjectAccess('admin')
      }, async (request, reply) => {
        reply.send({ success: true });
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/test/org123/projects/project456',
        headers: {
          authorization: 'Bearer valid-token'
        }
      });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.payload).error).toBe('Forbidden');
    });
  });

  describe('requireAdmin decorator', () => {
    test('should allow access for admin users', async () => {
      const mockUser = {
        userId: 'user123',
        email: 'admin@example.com',
        organizations: [{ orgId: 'org123', role: 'admin' }]
      };

      authService.verifyToken.mockReturnValue(mockUser);

      fastify.get('/admin/test', {
        preHandler: fastify.requireAdmin
      }, async (request, reply) => {
        reply.send({ success: true });
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/test',
        headers: {
          authorization: 'Bearer admin-token'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload).success).toBe(true);
    });

    test('should allow access for organization owners', async () => {
      const mockUser = {
        userId: 'user123',
        email: 'owner@example.com',
        organizations: [{ orgId: 'org123', role: 'owner' }]
      };

      authService.verifyToken.mockReturnValue(mockUser);

      fastify.get('/admin/test', {
        preHandler: fastify.requireAdmin
      }, async (request, reply) => {
        reply.send({ success: true });
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/test',
        headers: {
          authorization: 'Bearer owner-token'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload).success).toBe(true);
    });

    test('should reject access for non-admin users', async () => {
      const mockUser = {
        userId: 'user123',
        email: 'user@example.com',
        organizations: [{ orgId: 'org123', role: 'viewer' }]
      };

      authService.verifyToken.mockReturnValue(mockUser);

      fastify.get('/admin/test', {
        preHandler: fastify.requireAdmin
      }, async (request, reply) => {
        reply.send({ success: true });
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/test',
        headers: {
          authorization: 'Bearer user-token'
        }
      });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.payload).error).toBe('Forbidden');
    });

    test('should reject access for users without organizations', async () => {
      const mockUser = {
        userId: 'user123',
        email: 'user@example.com',
        organizations: []
      };

      authService.verifyToken.mockReturnValue(mockUser);

      fastify.get('/admin/test', {
        preHandler: fastify.requireAdmin
      }, async (request, reply) => {
        reply.send({ success: true });
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/admin/test',
        headers: {
          authorization: 'Bearer user-token'
        }
      });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.payload).error).toBe('Forbidden');
    });
  });
});