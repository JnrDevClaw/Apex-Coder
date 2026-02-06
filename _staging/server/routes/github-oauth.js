'use strict';

const crypto = require('crypto');
const { sendErrorResponse } = require('../utils/error-responses');

module.exports = async function (fastify) {
  // Store state tokens temporarily (use Redis in production)
  const stateStore = new Map();

  // Clean up old states periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of stateStore.entries()) {
      if (now - value.timestamp > 600000) { // 10 minutes
        stateStore.delete(key);
      }
    }
  }, 60000); // Run every minute

  // Step 1: Initiate OAuth flow
  fastify.get('/api/auth/github', {
    preHandler: fastify.authenticate,
    config: {
      rateLimit: fastify.rateLimitConfig.oauth
    }
  }, async (request, reply) => {
    const state = crypto.randomBytes(16).toString('hex');
    const userId = request.user?.id;

    if (!userId) {
      return sendErrorResponse(reply, 'AUTH_REQUIRED');
    }

    // Store state with user ID for verification
    stateStore.set(state, { userId, timestamp: Date.now() });

    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID,
      redirect_uri: process.env.GITHUB_CALLBACK_URL,
      scope: 'repo workflow admin:repo_hook',
      state: state,
      allow_signup: 'true'
    });

    const authUrl = `https://github.com/login/oauth/authorize?${params}`;
    return reply.redirect(authUrl);
  });

  // Step 2: Handle OAuth callback
  fastify.get('/api/auth/github/callback', {
    config: {
      rateLimit: fastify.rateLimitConfig.oauth
    }
  }, async (request, reply) => {
    const { code, state } = request.query;

    if (!code || !state) {
      fastify.log.warn('GitHub OAuth callback missing parameters');
      return reply.redirect('/dashboard?github=error&reason=missing_params');
    }

    // Verify state (CSRF protection)
    const storedState = stateStore.get(state);
    if (!storedState) {
      fastify.log.warn({ state }, 'Invalid or expired OAuth state parameter');
      return reply.redirect('/dashboard?github=error&reason=invalid_state');
    }

    // Verify state hasn't expired (10 minutes)
    const stateAge = Date.now() - storedState.timestamp;
    if (stateAge > 600000) {
      stateStore.delete(state);
      fastify.log.warn({ state, stateAge }, 'Expired OAuth state parameter');
      return reply.redirect('/dashboard?github=error&reason=expired_state');
    }

    const userId = storedState.userId;
    stateStore.delete(state);

    try {
      // Exchange code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code: code,
          redirect_uri: process.env.GITHUB_CALLBACK_URL
        })
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        throw new Error(tokenData.error_description || tokenData.error);
      }

      const accessToken = tokenData.access_token;

      if (!accessToken) {
        throw new Error('No access token received from GitHub');
      }

      // Get user's GitHub info
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!userResponse.ok) {
        throw new Error('Failed to fetch GitHub user info');
      }

      const githubUser = await userResponse.json();

      // Store encrypted token in database
      await fastify.db.query(
        `UPDATE users 
         SET github_token = $1, 
             github_username = $2,
             github_connected_at = NOW()
         WHERE id = $3`,
        [
          fastify.encrypt(accessToken),
          githubUser.login,
          userId
        ]
      );

      fastify.log.info({ userId, githubUsername: githubUser.login }, 'GitHub connected successfully');

      // Log audit event for OAuth connection
      const auditLogger = require('../services/audit-logger');
      await auditLogger.logSecurityEvent('github_oauth_connected', userId, {
        actorType: 'user',
        githubUsername: githubUser.login,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      // Redirect to success page
      return reply.redirect('/dashboard?github=connected');

    } catch (error) {
      fastify.log.error({ error, userId }, 'GitHub OAuth error');
      const { logGitHubError } = require('../services/deployment-error-logger');
      logGitHubError('oauth_callback', error, { userId, operation: 'github_oauth' });
      return reply.redirect('/dashboard?github=error&reason=oauth_failed');
    }
  });

  // Step 3: Disconnect GitHub
  fastify.post('/api/auth/github/disconnect', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    const userId = request.user.id;

    try {
      await fastify.db.query(
        `UPDATE users 
         SET github_token = NULL, 
             github_username = NULL,
             github_connected_at = NULL
         WHERE id = $1`,
        [userId]
      );

      fastify.log.info({ userId }, 'GitHub disconnected');

      // Log audit event for OAuth disconnection
      const auditLogger = require('../services/audit-logger');
      await auditLogger.logSecurityEvent('github_oauth_disconnected', userId, {
        actorType: 'user',
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      return { success: true };
    } catch (error) {
      fastify.log.error({ error, userId }, 'Failed to disconnect GitHub');
      return sendErrorResponse(reply, 'GITHUB_API_ERROR', {
        customMessage: 'Failed to disconnect your GitHub account.',
        details: error.message
      });
    }
  });

  // Step 4: Check connection status
  fastify.get('/api/auth/github/status', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    const userId = request.user.id;

    try {
      const result = await fastify.db.query(
        `SELECT github_username, github_connected_at 
         FROM users 
         WHERE id = $1`,
        [userId]
      );

      const user = result.rows[0];

      return {
        connected: !!user?.github_username,
        username: user?.github_username || null,
        connectedAt: user?.github_connected_at || null
      };
    } catch (error) {
      fastify.log.error({ error, userId }, 'Failed to check GitHub status');
      return sendErrorResponse(reply, 'GITHUB_API_ERROR', {
        customMessage: 'Failed to check GitHub connection status.',
        details: error.message
      });
    }
  });
}
