/**
 * OAuth Manager for Model Router
 * 
 * Handles OAuth 2.0 flows for providers that require it.
 * Supports authorization code flow, client credentials flow, and token refresh.
 * 
 * Requirements: 19.4
 */

const crypto = require('crypto');

/**
 * OAuth Token Store
 * Stores and manages OAuth tokens securely in memory
 */
class OAuthTokenStore {
  constructor() {
    this.tokens = new Map();
  }

  /**
   * Store token for a provider
   * @param {string} provider - Provider name
   * @param {Object} token - Token object
   * @param {string} token.accessToken - Access token
   * @param {string} token.refreshToken - Refresh token (optional)
   * @param {number} token.expiresAt - Expiration timestamp
   * @param {string} token.tokenType - Token type (usually 'Bearer')
   */
  setToken(provider, token) {
    this.tokens.set(provider, {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken || null,
      expiresAt: token.expiresAt,
      tokenType: token.tokenType || 'Bearer',
      updatedAt: Date.now()
    });
  }

  /**
   * Get token for a provider
   * @param {string} provider - Provider name
   * @returns {Object|null} Token object or null if not found
   */
  getToken(provider) {
    return this.tokens.get(provider) || null;
  }

  /**
   * Check if token exists and is valid
   * @param {string} provider - Provider name
   * @returns {boolean} True if token exists and is not expired
   */
  hasValidToken(provider) {
    const token = this.getToken(provider);
    if (!token) {
      return false;
    }

    // Check if token is expired (with 5 minute buffer)
    const now = Date.now();
    const buffer = 5 * 60 * 1000; // 5 minutes
    return token.expiresAt > (now + buffer);
  }

  /**
   * Check if token needs refresh
   * @param {string} provider - Provider name
   * @returns {boolean} True if token exists but is expired or about to expire
   */
  needsRefresh(provider) {
    const token = this.getToken(provider);
    if (!token || !token.refreshToken) {
      return false;
    }

    // Check if token is expired or will expire in next 10 minutes
    const now = Date.now();
    const buffer = 10 * 60 * 1000; // 10 minutes
    return token.expiresAt <= (now + buffer);
  }

  /**
   * Remove token for a provider
   * @param {string} provider - Provider name
   */
  removeToken(provider) {
    this.tokens.delete(provider);
  }

  /**
   * Clear all tokens
   */
  clear() {
    this.tokens.clear();
  }
}

/**
 * OAuth Manager
 * Handles OAuth 2.0 flows for AI providers
 */
class OAuthManager {
  constructor(config = {}) {
    this.tokenStore = new OAuthTokenStore();
    this.config = config;
    this.logger = config.logger || console;
  }

  /**
   * Get authorization URL for OAuth flow
   * @param {string} provider - Provider name
   * @param {Object} options - OAuth options
   * @param {string} options.clientId - OAuth client ID
   * @param {string} options.redirectUri - Redirect URI
   * @param {string} options.scope - OAuth scope
   * @param {string} options.state - State parameter for CSRF protection
   * @returns {string} Authorization URL
   */
  getAuthorizationUrl(provider, options) {
    const providerConfig = this.getProviderOAuthConfig(provider);
    if (!providerConfig) {
      throw new Error(`OAuth not configured for provider: ${provider}`);
    }

    const params = new URLSearchParams({
      client_id: options.clientId,
      redirect_uri: options.redirectUri,
      response_type: 'code',
      scope: options.scope || providerConfig.defaultScope || '',
      state: options.state || this.generateState()
    });

    return `${providerConfig.authorizationUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   * @param {string} provider - Provider name
   * @param {Object} options - Exchange options
   * @param {string} options.code - Authorization code
   * @param {string} options.clientId - OAuth client ID
   * @param {string} options.clientSecret - OAuth client secret
   * @param {string} options.redirectUri - Redirect URI
   * @returns {Promise<Object>} Token object
   */
  async exchangeCodeForToken(provider, options) {
    const providerConfig = this.getProviderOAuthConfig(provider);
    if (!providerConfig) {
      throw new Error(`OAuth not configured for provider: ${provider}`);
    }

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: options.code,
      client_id: options.clientId,
      client_secret: options.clientSecret,
      redirect_uri: options.redirectUri
    });

    try {
      const response = await fetch(providerConfig.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: params.toString()
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OAuth token exchange failed: ${error}`);
      }

      const data = await response.json();

      // Calculate expiration timestamp
      const expiresIn = data.expires_in || 3600; // Default 1 hour
      const expiresAt = Date.now() + (expiresIn * 1000);

      const token = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || null,
        expiresAt,
        tokenType: data.token_type || 'Bearer',
        scope: data.scope || null
      };

      // Store token
      this.tokenStore.setToken(provider, token);

      this.logger.info('OAuth token obtained', {
        provider,
        expiresIn,
        hasRefreshToken: !!token.refreshToken
      });

      return token;
    } catch (error) {
      this.logger.error('OAuth token exchange failed', {
        provider,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {string} provider - Provider name
   * @param {Object} options - Refresh options
   * @param {string} options.clientId - OAuth client ID
   * @param {string} options.clientSecret - OAuth client secret
   * @returns {Promise<Object>} New token object
   */
  async refreshToken(provider, options) {
    const providerConfig = this.getProviderOAuthConfig(provider);
    if (!providerConfig) {
      throw new Error(`OAuth not configured for provider: ${provider}`);
    }

    const currentToken = this.tokenStore.getToken(provider);
    if (!currentToken || !currentToken.refreshToken) {
      throw new Error(`No refresh token available for provider: ${provider}`);
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: currentToken.refreshToken,
      client_id: options.clientId,
      client_secret: options.clientSecret
    });

    try {
      const response = await fetch(providerConfig.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: params.toString()
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OAuth token refresh failed: ${error}`);
      }

      const data = await response.json();

      // Calculate expiration timestamp
      const expiresIn = data.expires_in || 3600;
      const expiresAt = Date.now() + (expiresIn * 1000);

      const token = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || currentToken.refreshToken, // Keep old refresh token if new one not provided
        expiresAt,
        tokenType: data.token_type || 'Bearer',
        scope: data.scope || currentToken.scope
      };

      // Store new token
      this.tokenStore.setToken(provider, token);

      this.logger.info('OAuth token refreshed', {
        provider,
        expiresIn
      });

      return token;
    } catch (error) {
      this.logger.error('OAuth token refresh failed', {
        provider,
        error: error.message
      });
      
      // Remove invalid token
      this.tokenStore.removeToken(provider);
      
      throw error;
    }
  }

  /**
   * Get client credentials token (for machine-to-machine auth)
   * @param {string} provider - Provider name
   * @param {Object} options - Client credentials options
   * @param {string} options.clientId - OAuth client ID
   * @param {string} options.clientSecret - OAuth client secret
   * @param {string} options.scope - OAuth scope
   * @returns {Promise<Object>} Token object
   */
  async getClientCredentialsToken(provider, options) {
    const providerConfig = this.getProviderOAuthConfig(provider);
    if (!providerConfig) {
      throw new Error(`OAuth not configured for provider: ${provider}`);
    }

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: options.clientId,
      client_secret: options.clientSecret,
      scope: options.scope || providerConfig.defaultScope || ''
    });

    try {
      const response = await fetch(providerConfig.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: params.toString()
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OAuth client credentials failed: ${error}`);
      }

      const data = await response.json();

      // Calculate expiration timestamp
      const expiresIn = data.expires_in || 3600;
      const expiresAt = Date.now() + (expiresIn * 1000);

      const token = {
        accessToken: data.access_token,
        refreshToken: null, // Client credentials flow doesn't use refresh tokens
        expiresAt,
        tokenType: data.token_type || 'Bearer',
        scope: data.scope || null
      };

      // Store token
      this.tokenStore.setToken(provider, token);

      this.logger.info('OAuth client credentials token obtained', {
        provider,
        expiresIn
      });

      return token;
    } catch (error) {
      this.logger.error('OAuth client credentials failed', {
        provider,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get valid access token for a provider (with automatic refresh)
   * @param {string} provider - Provider name
   * @param {Object} options - Options for token refresh
   * @returns {Promise<string>} Valid access token
   */
  async getAccessToken(provider, options = {}) {
    // Check if we have a valid token
    if (this.tokenStore.hasValidToken(provider)) {
      const token = this.tokenStore.getToken(provider);
      return token.accessToken;
    }

    // Check if we need to refresh
    if (this.tokenStore.needsRefresh(provider)) {
      try {
        const newToken = await this.refreshToken(provider, options);
        return newToken.accessToken;
      } catch (error) {
        this.logger.warn('Token refresh failed, may need re-authorization', {
          provider,
          error: error.message
        });
        throw new Error(`OAuth token expired and refresh failed for ${provider}`);
      }
    }

    // No token available
    throw new Error(`No OAuth token available for provider: ${provider}`);
  }

  /**
   * Get authorization header for a provider
   * @param {string} provider - Provider name
   * @param {Object} options - Options for token refresh
   * @returns {Promise<string>} Authorization header value
   */
  async getAuthorizationHeader(provider, options = {}) {
    const accessToken = await this.getAccessToken(provider, options);
    const token = this.tokenStore.getToken(provider);
    const tokenType = token?.tokenType || 'Bearer';
    return `${tokenType} ${accessToken}`;
  }

  /**
   * Revoke token for a provider
   * @param {string} provider - Provider name
   * @param {Object} options - Revocation options
   * @returns {Promise<void>}
   */
  async revokeToken(provider, options = {}) {
    const providerConfig = this.getProviderOAuthConfig(provider);
    if (!providerConfig || !providerConfig.revocationUrl) {
      // Just remove from store if no revocation endpoint
      this.tokenStore.removeToken(provider);
      return;
    }

    const token = this.tokenStore.getToken(provider);
    if (!token) {
      return;
    }

    const params = new URLSearchParams({
      token: token.accessToken,
      client_id: options.clientId,
      client_secret: options.clientSecret
    });

    try {
      const response = await fetch(providerConfig.revocationUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      if (!response.ok) {
        this.logger.warn('Token revocation failed', {
          provider,
          status: response.status
        });
      }
    } catch (error) {
      this.logger.error('Token revocation error', {
        provider,
        error: error.message
      });
    } finally {
      // Always remove from store
      this.tokenStore.removeToken(provider);
    }
  }

  /**
   * Get OAuth configuration for a provider
   * @param {string} provider - Provider name
   * @returns {Object|null} OAuth configuration
   */
  getProviderOAuthConfig(provider) {
    // Provider-specific OAuth configurations
    const oauthConfigs = {
      // Example: Google OAuth for Gemini
      gemini: {
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        revocationUrl: 'https://oauth2.googleapis.com/revoke',
        defaultScope: 'https://www.googleapis.com/auth/generative-language'
      },
      // Add other providers as needed
    };

    return oauthConfigs[provider] || null;
  }

  /**
   * Generate random state parameter for CSRF protection
   * @returns {string} Random state string
   */
  generateState() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Verify state parameter
   * @param {string} state - State to verify
   * @param {string} expectedState - Expected state value
   * @returns {boolean} True if state matches
   */
  verifyState(state, expectedState) {
    if (!state || !expectedState) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(state),
      Buffer.from(expectedState)
    );
  }

  /**
   * Clear all tokens
   */
  clearAllTokens() {
    this.tokenStore.clear();
  }
}

module.exports = {
  OAuthManager,
  OAuthTokenStore
};
