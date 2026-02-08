/**
 * Base Provider Class
 * 
 * Abstract base class for all AI provider implementations.
 * Provides common functionality including rate limiting, cost calculation,
 * and error handling.
 * 
 * Requirements: 1.1, 1.2, 1.4, 9.1, 9.2, 9.3, 9.4, 9.5
 */

const Bottleneck = require('bottleneck');
const {
  ProviderError,
  RateLimitError,
  AuthenticationError,
  ProviderUnavailableError,
  TimeoutError,
  InvalidRequestError
} = require('../model-router/errors');
const { apiKeyManager, HttpsEnforcer } = require('../model-router/security-utils');
const { connectionPoolManager } = require('../model-router/connection-pool');
const { parseLargeJSON, extractFields } = require('../model-router/streaming-parser');

const { LLMProvider } = require('./llm-provider');

class BaseProvider extends LLMProvider {
  /**
   * Create a new provider instance
   * @param {Object} config - Provider configuration
   * @param {string} config.name - Provider name
   * @param {string} config.apiKey - API key for authentication
   * @param {string} config.baseURL - Base URL for API calls
   * @param {Object} config.rateLimit - Rate limiting configuration
   * @param {Object} config.pricing - Pricing information per model
   * @param {number} config.timeout - Request timeout in milliseconds
   * @param {number} config.retries - Number of retry attempts
   */
  constructor(config) {
    super(config);
    if (!config.name) {
      throw new Error('Provider name is required');
    }
    if (!config.apiKey) {
      throw new Error('API key is required');
    }

    this.name = config.name;
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL;
    this.pricing = config.pricing || {};
    this.timeout = config.timeout || 30000;
    this.retries = config.retries || 2;

    // Validate HTTPS for baseURL (Requirements: 19.3)
    if (this.baseURL) {
      const httpsValidation = HttpsEnforcer.validateProviderUrl(this.name, this.baseURL);
      if (!httpsValidation.valid) {
        console.warn(`⚠️  ${httpsValidation.error}`);
      }
    }

    // Create rate limiter for this provider
    this.rateLimiter = this.createRateLimiter(config.rateLimit || {});

    this.httpAgent = connectionPoolManager.getAgent(this.name, true);
  }

  /**
   * Universal call method matching LLMProvider interface
   * @param {string} prompt - User prompt
   * @param {Object} context - Context object (role, model, etc.)
   * @returns {Promise<Object>} Standardized response
   */
  async call(prompt, context = {}) {
    const model = context.model || (this.modelConfigs ? Object.keys(this.modelConfigs)[0] : 'default');
    const messages = [];

    // Add system prompt if available
    if (context.system) {
      messages.push({ role: 'system', content: context.system });
    }

    // Add user prompt
    messages.push({ role: 'user', content: prompt });

    return this.chat(model, messages, context);
  }

  /**
   * Make a chat completion call (must be implemented by subclass)
   * @param {string} model - Model identifier
   * @param {Array} messages - Chat messages
   * @param {Object} options - Provider-specific options
   * @returns {Promise<Object>} Standardized response
   */
  async chat(model, messages, options = {}) {
    throw new Error('chat() must be implemented by subclass');
  }

  /**
   * Stream responses (must be implemented by subclass)
   * @param {string} model - Model identifier
   * @param {Array} messages - Chat messages
   * @param {Object} options - Provider-specific options
   * @returns {AsyncIterator<Object>} Stream of response chunks
   */
  async *stream(model, messages, options = {}) {
    throw new Error('stream() must be implemented by subclass');
  }

  /**
   * Calculate cost from token usage
   * @param {number} inputTokens - Input token count
   * @param {number} outputTokens - Output token count
   * @param {string} model - Model identifier
   * @returns {number} Cost in USD
   */
  calculateCost(inputTokens, outputTokens, model) {
    const pricing = this.pricing[model] || this.pricing.default;

    if (!pricing) {
      // Return 0 if no pricing information available
      return 0;
    }

    // Pricing is typically per 1M tokens
    const inputCost = (inputTokens * (pricing.input || 0)) / 1000000;
    const outputCost = (outputTokens * (pricing.output || 0)) / 1000000;

    return inputCost + outputCost;
  }

  /**
   * Create rate limiter for this provider
   * @param {Object} config - Rate limit configuration
   * @param {number} config.maxConcurrent - Maximum concurrent requests
   * @param {number} config.minTime - Minimum time between requests (ms)
   * @param {number} config.reservoir - Initial token bucket size
   * @param {number} config.reservoirRefreshAmount - Tokens to add on refresh
   * @param {number} config.reservoirRefreshInterval - Refresh interval (ms)
   * @returns {Bottleneck} Rate limiter instance
   */
  createRateLimiter(config) {
    return new Bottleneck({
      maxConcurrent: config.maxConcurrent || 5,
      minTime: config.minTime || 200,
      reservoir: config.reservoir || 100,
      reservoirRefreshAmount: config.reservoirRefreshAmount || 100,
      reservoirRefreshInterval: config.reservoirRefreshInterval || 60000
    });
  }

  /**
   * Check if error is retryable
   * @param {Error} error - Error object
   * @returns {boolean} True if retryable
   */
  isRetryableError(error) {
    // Retryable HTTP status codes
    const retryableStatusCodes = [429, 500, 502, 503, 504];

    // Retryable error codes
    const retryableErrorCodes = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED'];

    // Check status code
    if (error.statusCode && retryableStatusCodes.includes(error.statusCode)) {
      return true;
    }

    // Check error code
    if (error.code && retryableErrorCodes.includes(error.code)) {
      return true;
    }

    // Check response status (for axios-like errors)
    if (error.response && error.response.status && retryableStatusCodes.includes(error.response.status)) {
      return true;
    }

    return false;
  }

  /**
   * Convert raw error to structured error type
   * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
   * @param {Error} error - Raw error object
   * @param {Object} context - Additional context
   * @returns {ProviderError} Structured error
   */
  handleError(error, context = {}) {
    const statusCode = error.statusCode || error.response?.status || 500;
    const errorMessage = error.message || 'Unknown error';

    // Rate limit errors
    if (statusCode === 429) {
      const retryAfter = error.response?.headers?.['retry-after'] ||
        error.retryAfter ||
        60;
      return new RateLimitError(this.name, retryAfter);
    }

    // Authentication errors
    if (statusCode === 401 || statusCode === 403) {
      return new AuthenticationError(this.name, errorMessage);
    }

    // Timeout errors
    if (error.code === 'ETIMEDOUT' || statusCode === 504) {
      return new TimeoutError(this.name, this.timeout);
    }

    // Service unavailable errors
    if (statusCode === 503 || statusCode === 502) {
      return new ProviderUnavailableError(this.name, errorMessage);
    }

    // Invalid request errors
    if (statusCode === 400 || statusCode === 422) {
      const details = error.response?.data || error.details || null;
      return new InvalidRequestError(this.name, errorMessage, details);
    }

    // Generic provider error
    return new ProviderError(errorMessage, this.name, statusCode, error);
  }

  /**
   * Estimate token count from text (rough approximation)
   * @param {string} text - Text to estimate
   * @returns {number} Estimated token count
   */
  estimateTokens(text) {
    if (!text) return 0;
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Get HTTP agent for this provider
   * Provides connection pooling with keep-alive
   * Requirements: 20.1, 20.2
   * @returns {https.Agent} HTTP agent
   */
  getHttpAgent() {
    return this.httpAgent;
  }

  /**
   * Get connection pool statistics for this provider
   * @returns {Object} Pool statistics
   */
  getPoolStats() {
    return connectionPoolManager.getStats(this.name);
  }

  /**
   * Parse JSON response optimally based on size
   * Uses streaming parser for large responses to avoid memory issues
   * Requirements: 20.3
   * @param {string|Buffer} data - Response data
   * @returns {Promise<Object>} Parsed JSON object
   */
  async parseJSONResponse(data) {
    try {
      // For small responses, use standard JSON.parse
      const size = Buffer.byteLength(data);
      if (size < 1024 * 1024) { // < 1MB
        return JSON.parse(data.toString());
      }

      // For large responses, use streaming parser
      return await parseLargeJSON(data, { maxSize: 50 * 1024 * 1024 }); // 50MB max
    } catch (error) {
      throw new Error(`Failed to parse JSON response: ${error.message}`);
    }
  }

  /**
   * Extract specific fields from response without full parsing
   * Useful for large responses where only certain fields are needed
   * Requirements: 20.3
   * @param {string} data - Response data
   * @param {Array<string>} fields - Fields to extract
   * @returns {Object} Extracted fields
   */
  extractResponseFields(data, fields) {
    return extractFields(data.toString(), fields);
  }

  /**
   * Format messages for provider (can be overridden by subclass)
   * @param {Array} messages - Standard message format
   * @returns {Array} Provider-specific message format
   */
  formatMessages(messages) {
    return messages;
  }

  /**
   * Parse provider response to standard format (can be overridden by subclass)
   * @param {Object} response - Provider-specific response
   * @param {string} model - Model identifier
   * @returns {Object} Standardized response
   */
  parseResponse(response, model) {
    return response;
  }
}

module.exports = BaseProvider;
