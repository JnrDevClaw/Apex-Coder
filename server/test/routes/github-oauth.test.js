'use strict';

const { build } = require('../helper');

describe('GitHub OAuth Routes', () => {
  let app;

  beforeAll(async () => {
    app = await build();
    
    // Set required environment variables for tests
    process.env.GITHUB_CLIENT_ID = 'test_client_id';
    process.env.GITHUB_CLIENT_SECRET = 'test_client_secret';
    process.env.GITHUB_CALLBACK_URL = 'http://localhost:3000/api/auth/github/callback';
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/auth/github/status', () => {
    test('returns connection status for authenticated user', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/github/status'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(typeof body.connected).toBe('boolean');
      expect(body).toHaveProperty('username');
      expect(body).toHaveProperty('connectedAt');
    });
  });

  describe('GET /api/auth/github', () => {
    test('redirects to GitHub OAuth authorization', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/github'
      });

      // Should redirect to GitHub
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain('github.com/login/oauth/authorize');
      expect(response.headers.location).toContain('client_id=test_client_id');
      expect(response.headers.location).toContain('scope=repo');
    });
  });

  describe('POST /api/auth/github/disconnect', () => {
    test('removes GitHub connection for authenticated user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/github/disconnect'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/auth/github/callback', () => {
    test('handles invalid state parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/github/callback?code=test_code&state=invalid_state'
      });

      // Should redirect with error
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain('github=error');
      expect(response.headers.location).toContain('reason=invalid_state');
    });

    test('handles missing parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/github/callback'
      });

      // Should redirect with error
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain('github=error');
      expect(response.headers.location).toContain('reason=missing_params');
    });

    test('handles missing code parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/github/callback?state=some_state'
      });

      // Should redirect with error
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toContain('github=error');
      expect(response.headers.location).toContain('reason=missing_params');
    });
  });
});
