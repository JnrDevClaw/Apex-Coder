/**
 * Model Router Routes Tests
 * 
 * Tests for model router API endpoints
 */

'use strict';

const { build } = require('../helper');

describe('Model Router Routes', () => {
  let app;
  let authToken;

  beforeAll(async () => {
    app = await build();
    
    // Create a test user and get auth token
    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'modelrouter@test.com',
        password: 'testpass123',
        name: 'Model Router Test User'
      }
    });

    if (registerRes.statusCode === 201 || registerRes.statusCode === 200) {
      const data = JSON.parse(registerRes.payload);
      authToken = data.token;
    } else {
      // Try to login if user already exists
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'modelrouter@test.com',
          password: 'testpass123'
        }
      });
      const data = JSON.parse(loginRes.payload);
      authToken = data.token;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Authentication', () => {
    test('should reject requests without authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/model-router/health'
      });

      expect(res.statusCode).toBe(401);
    });

    test('should accept requests with valid JWT', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/model-router/health',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      // Should not be 401 (may be 503 if ModelRouter not initialized)
      expect(res.statusCode).not.toBe(401);
    });
  });

  describe('GET /api/model-router/health', () => {
    test('should return health status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/model-router/health',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect([200, 503]).toContain(res.statusCode);
      const data = JSON.parse(res.payload);
      expect(data).toHaveProperty('status');
    });
  });

  describe('GET /api/model-router/providers', () => {
    test('should return provider list', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/model-router/providers',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect([200, 503]).toContain(res.statusCode);
      
      if (res.statusCode === 200) {
        const data = JSON.parse(res.payload);
        expect(data).toHaveProperty('providers');
        expect(Array.isArray(data.providers)).toBe(true);
      }
    });
  });

  describe('GET /api/model-router/roles', () => {
    test('should return available roles', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/model-router/roles',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect([200, 500]).toContain(res.statusCode);
      
      if (res.statusCode === 200) {
        const data = JSON.parse(res.payload);
        expect(data).toHaveProperty('roles');
        expect(Array.isArray(data.roles)).toBe(true);
      }
    });
  });

  describe('GET /api/model-router/costs', () => {
    test('should return cost information', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/model-router/costs',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect([200, 503]).toContain(res.statusCode);
      
      if (res.statusCode === 200) {
        const data = JSON.parse(res.payload);
        expect(data).toHaveProperty('totalCost');
      }
    });

    test('should accept filter parameters', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/model-router/costs?provider=huggingface&role=clarifier',
        headers: {
          authorization: `Bearer ${authToken}`
        }
      });

      expect([200, 503]).toContain(res.statusCode);
    });
  });

  describe('POST /api/model-router/call', () => {
    test('should reject requests without required fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/model-router/call',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {}
      });

      expect(res.statusCode).toBe(400);
      const data = JSON.parse(res.payload);
      expect(data).toHaveProperty('error');
    });

    test('should reject requests with invalid messages', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/model-router/call',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          provider: 'huggingface',
          model: 'test-model',
          messages: []
        }
      });

      expect(res.statusCode).toBe(400);
    });

    test('should accept valid call request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/model-router/call',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          provider: 'huggingface',
          model: 'test-model',
          messages: [
            { role: 'user', content: 'Hello' }
          ]
        }
      });

      // Should not be 400 (may be 503 if ModelRouter not initialized)
      expect(res.statusCode).not.toBe(400);
    });
  });

  describe('POST /api/model-router/call-by-role', () => {
    test('should reject requests without required fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/model-router/call-by-role',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {}
      });

      expect(res.statusCode).toBe(400);
    });

    test('should reject invalid role', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/model-router/call-by-role',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          role: 'invalid-role',
          messages: [
            { role: 'user', content: 'Hello' }
          ]
        }
      });

      expect(res.statusCode).toBe(400);
      const data = JSON.parse(res.payload);
      expect(data.message).toContain('Invalid role');
    });

    test('should accept valid role', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/model-router/call-by-role',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          role: 'clarifier',
          messages: [
            { role: 'user', content: 'Hello' }
          ]
        }
      });

      // Should not be 400 (may be 503 if ModelRouter not initialized)
      expect(res.statusCode).not.toBe(400);
    });
  });

  describe('POST /api/model-router/stream', () => {
    test('should reject requests without required fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/model-router/stream',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {}
      });

      expect(res.statusCode).toBe(400);
    });

    test('should accept valid stream request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/model-router/stream',
        headers: {
          authorization: `Bearer ${authToken}`
        },
        payload: {
          role: 'clarifier',
          messages: [
            { role: 'user', content: 'Hello' }
          ]
        }
      });

      // Should not be 400 (may be 503 if ModelRouter not initialized)
      expect(res.statusCode).not.toBe(400);
    });
  });
});
