/**
 * Security Utilities for Model Router
 * 
 * Provides secure handling of API keys, input validation, and request sanitization.
 * 
 * Requirements: 19.1, 19.2, 19.3, 19.4, 19.5
 */

const crypto = require('crypto');

/**
 * API Key Security Manager
 * Handles secure loading, validation, and usage of API keys
 */
class ApiKeySecurityManager {
  constructor() {
    this.apiKeys = new Map();
    this.keyPatterns = new Map();
    this.initialized = false;
  }

  /**
   * Initialize API keys from environment variables only
   * Requirements: 19.1
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    // Load API keys from environment variables only
    const keyMappings = {
      huggingface: process.env.HUGGINGFACE_API_KEY,
      zukijourney: process.env.ZUKIJOURNEY_API_KEY || process.env.ZUKI_API_KEY,
      'github-models': process.env.GITHUB_TOKEN,
      deepseek: process.env.DEEPSEEK_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
      gemini: process.env.GEMINI_API_KEY,
      openrouter: process.env.OPENROUTER_API_KEY,
      scaleway: process.env.SCALEWAY_API_KEY,
      mistral: process.env.MISTRAL_API_KEY
    };

    // Store keys securely in memory (not in plain text logs)
    for (const [provider, key] of Object.entries(keyMappings)) {
      if (key) {
        this.apiKeys.set(provider, key);
        
        // Store pattern for redaction (first 4 and last 4 chars)
        const pattern = this.createRedactionPattern(key);
        this.keyPatterns.set(provider, pattern);
      }
    }

    this.initialized = true;
    console.log(`✅ API keys loaded for ${this.apiKeys.size} providers`);
  }

  /**
   * Get API key for a provider
   * Requirements: 19.1
   * @param {string} provider - Provider name
   * @returns {string|null} API key or null if not found
   */
  getApiKey(provider) {
    if (!this.initialized) {
      this.initialize();
    }

    return this.apiKeys.get(provider) || null;
  }

  /**
   * Check if API key exists for provider
   * @param {string} provider - Provider name
   * @returns {boolean} True if key exists
   */
  hasApiKey(provider) {
    if (!this.initialized) {
      this.initialize();
    }

    return this.apiKeys.has(provider);
  }

  /**
   * Validate API key format for a provider
   * @param {string} provider - Provider name
   * @param {string} apiKey - API key to validate
   * @returns {boolean} True if valid format
   */
  validateApiKeyFormat(provider, apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    // Provider-specific validation rules
    const validationRules = {
      huggingface: /^hf_[a-zA-Z0-9]{32,}$/,
      anthropic: /^sk-ant-[a-zA-Z0-9-_]{32,}$/,
      openrouter: /^sk-or-[a-zA-Z0-9-_]{32,}$/,
      gemini: /^[a-zA-Z0-9-_]{32,}$/,
      deepseek: /^[a-zA-Z0-9-_]{32,}$/,
      'github-models': /^gh[ps]_[a-zA-Z0-9]{36,}$/,
      zukijourney: /^[a-zA-Z0-9-_]{20,}$/,
      scaleway: /^[a-zA-Z0-9-_]{32,}$/,
      mistral: /^[a-zA-Z0-9-_]{32,}$/
    };

    const rule = validationRules[provider];
    if (!rule) {
      // No specific rule, just check it's not empty
      return apiKey.length > 0;
    }

    return rule.test(apiKey);
  }

  /**
   * Create redaction pattern for logging
   * Requirements: 19.2
   * @param {string} key - API key
   * @returns {string} Redacted pattern (e.g., "hf_abc...xyz")
   */
  createRedactionPattern(key) {
    if (!key || key.length < 8) {
      return '***';
    }

    const prefix = key.substring(0, 4);
    const suffix = key.substring(key.length - 4);
    return `${prefix}...${suffix}`;
  }

  /**
   * Redact API key from string
   * Requirements: 19.2
   * @param {string} text - Text that may contain API keys
   * @returns {string} Text with API keys redacted
   */
  redactApiKeys(text) {
    if (!text || typeof text !== 'string') {
      return text;
    }

    let redacted = text;

    // Redact all known API keys
    for (const [provider, key] of this.apiKeys.entries()) {
      const pattern = this.keyPatterns.get(provider) || '***REDACTED***';
      // Replace all occurrences of the key
      redacted = redacted.split(key).join(pattern);
    }

    // Also redact common API key patterns
    const commonPatterns = [
      /Bearer\s+[a-zA-Z0-9-_\.]{20,}/gi,
      /api[_-]?key["\s:=]+[a-zA-Z0-9-_]{20,}/gi,
      /token["\s:=]+[a-zA-Z0-9-_]{20,}/gi,
      /sk-[a-zA-Z0-9-_]{32,}/gi,
      /hf_[a-zA-Z0-9]{32,}/gi
    ];

    for (const pattern of commonPatterns) {
      redacted = redacted.replace(pattern, '***REDACTED***');
    }

    return redacted;
  }

  /**
   * Redact API keys from object (for logging)
   * Requirements: 19.2
   * @param {Object} obj - Object that may contain API keys
   * @returns {Object} Object with API keys redacted
   */
  redactApiKeysFromObject(obj) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const redacted = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
      // Redact keys that look like they contain sensitive data
      const sensitiveKeys = ['apikey', 'api_key', 'apiKey', 'token', 'authorization', 'auth', 'password', 'secret'];
      const isSensitiveKey = sensitiveKeys.some(sk => key.toLowerCase().includes(sk));

      if (isSensitiveKey && typeof value === 'string') {
        redacted[key] = this.createRedactionPattern(value);
      } else if (typeof value === 'string') {
        redacted[key] = this.redactApiKeys(value);
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = this.redactApiKeysFromObject(value);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }

  /**
   * Get list of providers with valid API keys
   * @returns {Array<string>} List of provider names
   */
  getProvidersWithKeys() {
    if (!this.initialized) {
      this.initialize();
    }

    return Array.from(this.apiKeys.keys());
  }

  /**
   * Clear all API keys from memory (for cleanup)
   */
  clear() {
    this.apiKeys.clear();
    this.keyPatterns.clear();
    this.initialized = false;
  }
}

/**
 * Input Validation and Sanitization
 * Requirements: 19.1
 */
class InputValidator {
  /**
   * Validate and sanitize messages array
   * @param {Array} messages - Chat messages
   * @returns {Object} Validation result
   */
  static validateMessages(messages) {
    const errors = [];

    if (!Array.isArray(messages)) {
      return { valid: false, errors: ['Messages must be an array'] };
    }

    if (messages.length === 0) {
      return { valid: false, errors: ['Messages array cannot be empty'] };
    }

    if (messages.length > 100) {
      return { valid: false, errors: ['Messages array too large (max 100 messages)'] };
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (!msg || typeof msg !== 'object') {
        errors.push(`Message ${i} must be an object`);
        continue;
      }

      if (!msg.role || typeof msg.role !== 'string') {
        errors.push(`Message ${i} must have a role field`);
      }

      const validRoles = ['system', 'user', 'assistant', 'function'];
      if (msg.role && !validRoles.includes(msg.role)) {
        errors.push(`Message ${i} has invalid role: ${msg.role}`);
      }

      if (!msg.content || typeof msg.content !== 'string') {
        errors.push(`Message ${i} must have a content field`);
      }

      if (msg.content && msg.content.length > 100000) {
        errors.push(`Message ${i} content too large (max 100KB)`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate model name
   * @param {string} model - Model name
   * @returns {Object} Validation result
   */
  static validateModel(model) {
    if (!model || typeof model !== 'string') {
      return { valid: false, errors: ['Model must be a non-empty string'] };
    }

    if (model.length > 200) {
      return { valid: false, errors: ['Model name too long (max 200 chars)'] };
    }

    // Check for suspicious characters
    const suspiciousPattern = /[<>{}()[\]\\;'"]/;
    if (suspiciousPattern.test(model)) {
      return { valid: false, errors: ['Model name contains invalid characters'] };
    }

    return { valid: true, errors: [] };
  }

  /**
   * Validate provider name
   * @param {string} provider - Provider name
   * @returns {Object} Validation result
   */
  static validateProvider(provider) {
    if (!provider || typeof provider !== 'string') {
      return { valid: false, errors: ['Provider must be a non-empty string'] };
    }

    const validProviders = [
      'huggingface',
      'zukijourney',
      'github-models',
      'deepseek',
      'anthropic',
      'gemini',
      'openrouter',
      'scaleway',
      'mistral',
      'demo'
    ];

    if (!validProviders.includes(provider)) {
      return { valid: false, errors: [`Invalid provider: ${provider}`] };
    }

    return { valid: true, errors: [] };
  }

  /**
   * Validate role name
   * @param {string} role - Agent role
   * @returns {Object} Validation result
   */
  static validateRole(role) {
    if (!role || typeof role !== 'string') {
      return { valid: false, errors: ['Role must be a non-empty string'] };
    }

    const validRoles = [
      'clarifier',
      'normalizer',
      'docs-creator',
      'schema-generator',
      'validator',
      'code-generator',
      'prompt-builder',
      'file-structure-generator'
    ];

    if (!validRoles.includes(role)) {
      return { valid: false, errors: [`Invalid role: ${role}`] };
    }

    return { valid: true, errors: [] };
  }

  /**
   * Validate options object
   * @param {Object} options - Call options
   * @returns {Object} Validation result
   */
  static validateOptions(options) {
    const errors = [];

    if (options === null || options === undefined) {
      return { valid: true, errors: [] };
    }

    if (typeof options !== 'object' || Array.isArray(options)) {
      return { valid: false, errors: ['Options must be an object'] };
    }

    // Validate temperature
    if (options.temperature !== undefined) {
      if (typeof options.temperature !== 'number') {
        errors.push('Temperature must be a number');
      } else if (options.temperature < 0 || options.temperature > 2) {
        errors.push('Temperature must be between 0 and 2');
      }
    }

    // Validate maxTokens
    if (options.maxTokens !== undefined) {
      if (typeof options.maxTokens !== 'number') {
        errors.push('maxTokens must be a number');
      } else if (options.maxTokens < 1 || options.maxTokens > 100000) {
        errors.push('maxTokens must be between 1 and 100000');
      }
    }

    // Validate topP
    if (options.topP !== undefined) {
      if (typeof options.topP !== 'number') {
        errors.push('topP must be a number');
      } else if (options.topP < 0 || options.topP > 1) {
        errors.push('topP must be between 0 and 1');
      }
    }

    // Validate projectId
    if (options.projectId !== undefined) {
      if (typeof options.projectId !== 'string') {
        errors.push('projectId must be a string');
      } else if (options.projectId.length > 100) {
        errors.push('projectId too long (max 100 chars)');
      }
    }

    // Validate userId
    if (options.userId !== undefined) {
      if (typeof options.userId !== 'string') {
        errors.push('userId must be a string');
      } else if (options.userId.length > 100) {
        errors.push('userId too long (max 100 chars)');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Sanitize string input
   * @param {string} input - Input string
   * @returns {string} Sanitized string
   */
  static sanitizeString(input) {
    if (typeof input !== 'string') {
      return '';
    }

    // Remove null bytes
    let sanitized = input.replace(/\0/g, '');

    // Trim whitespace
    sanitized = sanitized.trim();

    return sanitized;
  }

  /**
   * Validate request size
   * @param {Object} request - Request object
   * @param {number} maxSize - Maximum size in bytes
   * @returns {Object} Validation result
   */
  static validateRequestSize(request, maxSize = 1048576) { // 1MB default
    const size = JSON.stringify(request).length;

    if (size > maxSize) {
      return {
        valid: false,
        errors: [`Request too large: ${size} bytes (max ${maxSize} bytes)`]
      };
    }

    return { valid: true, errors: [] };
  }
}

/**
 * Request Signing and Verification
 * Requirements: 19.1
 */
class RequestSigner {
  constructor(secret) {
    this.secret = secret || process.env.MODEL_ROUTER_SECRET || crypto.randomBytes(32).toString('hex');
  }

  /**
   * Sign a request
   * @param {Object} payload - Request payload
   * @param {number} timestamp - Request timestamp
   * @returns {string} Signature
   */
  sign(payload, timestamp) {
    const data = JSON.stringify(payload) + timestamp.toString();
    const hmac = crypto.createHmac('sha256', this.secret);
    hmac.update(data);
    return hmac.digest('hex');
  }

  /**
   * Verify request signature
   * @param {Object} payload - Request payload
   * @param {number} timestamp - Request timestamp
   * @param {string} signature - Provided signature
   * @param {number} maxAge - Maximum age in milliseconds (default 5 minutes)
   * @returns {Object} Verification result
   */
  verify(payload, timestamp, signature, maxAge = 300000) {
    // Check timestamp age
    const now = Date.now();
    const age = now - timestamp;

    if (age > maxAge) {
      return {
        valid: false,
        error: 'Request timestamp too old'
      };
    }

    if (age < -60000) { // Allow 1 minute clock skew
      return {
        valid: false,
        error: 'Request timestamp in the future'
      };
    }

    // Verify signature
    const expectedSignature = this.sign(payload, timestamp);
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );

    if (!isValid) {
      return {
        valid: false,
        error: 'Invalid signature'
      };
    }

    return { valid: true };
  }

  /**
   * Generate signed request headers
   * @param {Object} payload - Request payload
   * @returns {Object} Headers with signature
   */
  generateHeaders(payload) {
    const timestamp = Date.now();
    const signature = this.sign(payload, timestamp);

    return {
      'X-Request-Timestamp': timestamp.toString(),
      'X-Request-Signature': signature
    };
  }
}

/**
 * HTTPS Enforcement
 * Requirements: 19.3
 */
class HttpsEnforcer {
  /**
   * Check if URL uses HTTPS
   * @param {string} url - URL to check
   * @returns {boolean} True if HTTPS
   */
  static isHttps(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }

    return url.toLowerCase().startsWith('https://');
  }

  /**
   * Validate provider URL uses HTTPS
   * @param {string} provider - Provider name
   * @param {string} url - Provider URL
   * @returns {Object} Validation result
   */
  static validateProviderUrl(provider, url) {
    if (!this.isHttps(url)) {
      return {
        valid: false,
        error: `Provider ${provider} must use HTTPS: ${url}`
      };
    }

    return { valid: true };
  }

  /**
   * Enforce HTTPS for all provider calls
   * @param {Object} config - Provider configuration
   * @returns {Object} Validation result
   */
  static enforceHttps(config) {
    const errors = [];

    for (const [provider, providerConfig] of Object.entries(config.providers || {})) {
      if (providerConfig.baseURL && !this.isHttps(providerConfig.baseURL)) {
        errors.push(`Provider ${provider} baseURL must use HTTPS: ${providerConfig.baseURL}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Create singleton instances
const apiKeyManager = new ApiKeySecurityManager();
const requestSigner = new RequestSigner();

module.exports = {
  ApiKeySecurityManager,
  InputValidator,
  RequestSigner,
  HttpsEnforcer,
  apiKeyManager,
  requestSigner
};


/**
 * Request Authentication Middleware
 * Verifies request signatures for internal model router calls
 * Requirements: 19.1
 */
class RequestAuthenticator {
  constructor(options = {}) {
    this.signer = options.signer || requestSigner;
    this.logger = options.logger || console;
    this.enabled = options.enabled !== false;
  }

  /**
   * Middleware to verify request signatures
   * @returns {Function} Fastify middleware function
   */
  middleware() {
    return async (request, reply) => {
      // Skip if authentication is disabled (e.g., in development)
      if (!this.enabled) {
        return;
      }

      // Skip for health check and metrics endpoints
      const skipPaths = ['/health', '/metrics', '/api/model-router/health', '/api/model-router/metrics'];
      if (skipPaths.some(path => request.url.startsWith(path))) {
        return;
      }

      try {
        // Get signature headers
        const timestamp = request.headers['x-request-timestamp'];
        const signature = request.headers['x-request-signature'];

        if (!timestamp || !signature) {
          this.logger.warn('Missing authentication headers', {
            url: request.url,
            method: request.method,
            ip: request.ip
          });

          return reply.code(401).send({
            error: 'Unauthorized',
            message: 'Missing authentication headers'
          });
        }

        // Verify signature
        const payload = {
          method: request.method,
          url: request.url,
          body: request.body
        };

        const verification = this.signer.verify(
          payload,
          parseInt(timestamp, 10),
          signature
        );

        if (!verification.valid) {
          this.logger.warn('Invalid request signature', {
            url: request.url,
            method: request.method,
            ip: request.ip,
            error: verification.error
          });

          return reply.code(401).send({
            error: 'Unauthorized',
            message: verification.error || 'Invalid request signature'
          });
        }

        // Signature valid, continue
        this.logger.debug('Request authenticated', {
          url: request.url,
          method: request.method
        });
      } catch (error) {
        this.logger.error('Authentication error', {
          url: request.url,
          method: request.method,
          error: error.message
        });

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Authentication failed'
        });
      }
    };
  }

  /**
   * Sign an outgoing request
   * @param {Object} request - Request object
   * @returns {Object} Headers with signature
   */
  signRequest(request) {
    const payload = {
      method: request.method || 'POST',
      url: request.url,
      body: request.body
    };

    return this.signer.generateHeaders(payload);
  }

  /**
   * Create authenticated HTTP client
   * @param {Object} options - Client options
   * @returns {Object} HTTP client with authentication
   */
  createAuthenticatedClient(options = {}) {
    const baseUrl = options.baseUrl || '';

    return {
      /**
       * Make authenticated POST request
       * @param {string} path - Request path
       * @param {Object} body - Request body
       * @param {Object} headers - Additional headers
       * @returns {Promise<Response>} Response
       */
      post: async (path, body, headers = {}) => {
        const url = `${baseUrl}${path}`;
        const request = { method: 'POST', url, body };
        const authHeaders = this.signRequest(request);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
            ...headers
          },
          body: JSON.stringify(body)
        });

        return response;
      },

      /**
       * Make authenticated GET request
       * @param {string} path - Request path
       * @param {Object} headers - Additional headers
       * @returns {Promise<Response>} Response
       */
      get: async (path, headers = {}) => {
        const url = `${baseUrl}${path}`;
        const request = { method: 'GET', url, body: null };
        const authHeaders = this.signRequest(request);

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            ...authHeaders,
            ...headers
          }
        });

        return response;
      }
    };
  }
}

// Export additional classes
module.exports.RequestAuthenticator = RequestAuthenticator;
