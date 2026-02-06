/**
 * Model Router Logger
 * Structured logging for AI calls with correlation IDs, JSON format, and PII/API key redaction
 * 
 * Requirements: 6.4, 6.5
 */

const structuredLogger = require('../structured-logger');

class ModelRouterLogger {
  constructor() {
    this.baseLogger = structuredLogger;
    this.sensitiveFields = [
      'apiKey',
      'api_key',
      'authorization',
      'token',
      'password',
      'secret',
      'credential',
      'bearer'
    ];
    
    this.piiPatterns = [
      // Email addresses
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      // Phone numbers (various formats)
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
      // Credit card numbers
      /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
      // SSN
      /\b\d{3}-\d{2}-\d{4}\b/g,
      // IP addresses (optional - may want to keep for debugging)
      // /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g
    ];
  }

  /**
   * Redact sensitive information from data
   * @private
   * @param {any} data - Data to redact
   * @returns {any} Redacted data
   */
  _redactSensitiveData(data) {
    if (typeof data === 'string') {
      return this._redactString(data);
    }

    if (Array.isArray(data)) {
      return data.map(item => this._redactSensitiveData(item));
    }

    if (data && typeof data === 'object') {
      const redacted = {};
      for (const [key, value] of Object.entries(data)) {
        // Check if key is sensitive
        const keyLower = key.toLowerCase();
        const isSensitiveKey = this.sensitiveFields.some(field => 
          keyLower.includes(field.toLowerCase())
        );

        if (isSensitiveKey) {
          redacted[key] = '[REDACTED]';
        } else if (typeof value === 'string') {
          redacted[key] = this._redactString(value);
        } else if (typeof value === 'object' && value !== null) {
          redacted[key] = this._redactSensitiveData(value);
        } else {
          redacted[key] = value;
        }
      }
      return redacted;
    }

    return data;
  }

  /**
   * Redact PII from string
   * @private
   * @param {string} str - String to redact
   * @returns {string} Redacted string
   */
  _redactString(str) {
    let redacted = str;

    // Apply PII patterns
    for (const pattern of this.piiPatterns) {
      redacted = redacted.replace(pattern, '[PII_REDACTED]');
    }

    // Redact API keys (common patterns)
    // Bearer tokens
    redacted = redacted.replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer [REDACTED]');
    // API keys in various formats
    redacted = redacted.replace(/[a-z0-9]{32,}/gi, (match) => {
      // Only redact if it looks like a key (all lowercase/numbers, long)
      if (match.length >= 32 && /^[a-z0-9]+$/.test(match)) {
        return '[API_KEY_REDACTED]';
      }
      return match;
    });

    return redacted;
  }

  /**
   * Create log entry with redaction
   * @private
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} metadata - Metadata
   * @returns {Object} Log entry
   */
  _createLogEntry(level, message, metadata = {}) {
    const redactedMetadata = this._redactSensitiveData(metadata);
    
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: 'model-router',
      ...redactedMetadata
    };
  }

  /**
   * Log info message
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  info(message, metadata = {}) {
    const logEntry = this._createLogEntry('info', message, metadata);
    console.log(JSON.stringify(logEntry));
  }

  /**
   * Log warning message
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  warn(message, metadata = {}) {
    const logEntry = this._createLogEntry('warn', message, metadata);
    console.log(JSON.stringify(logEntry));
  }

  /**
   * Log error message
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  error(message, metadata = {}) {
    const logEntry = this._createLogEntry('error', message, metadata);
    console.error(JSON.stringify(logEntry));
  }

  /**
   * Log debug message
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  debug(message, metadata = {}) {
    if (process.env.LOG_LEVEL === 'debug' || process.env.LOG_LEVEL === 'trace') {
      const logEntry = this._createLogEntry('debug', message, metadata);
      console.log(JSON.stringify(logEntry));
    }
  }

  /**
   * Log AI call start
   * @param {Object} callData - Call information
   */
  logAICallStart(callData) {
    this.info('AI call started', {
      correlationId: callData.correlationId,
      provider: callData.provider,
      model: callData.model,
      role: callData.role,
      projectId: callData.projectId,
      userId: callData.userId,
      messageCount: callData.messageCount,
      endpoint: callData.endpoint,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log AI call completion
   * @param {Object} callData - Call information
   */
  logAICallComplete(callData) {
    this.info('AI call completed', {
      correlationId: callData.correlationId,
      provider: callData.provider,
      model: callData.model,
      role: callData.role,
      projectId: callData.projectId,
      tokens: callData.tokens,
      cost: callData.cost,
      latency: callData.latency,
      status: callData.status,
      cached: callData.cached,
      isFallback: callData.isFallback,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log AI call failure
   * @param {Object} callData - Call information
   */
  logAICallFailure(callData) {
    this.error('AI call failed', {
      correlationId: callData.correlationId,
      provider: callData.provider,
      model: callData.model,
      role: callData.role,
      projectId: callData.projectId,
      error: callData.error,
      errorType: callData.errorType,
      statusCode: callData.statusCode,
      latency: callData.latency,
      retryAttempt: callData.retryAttempt,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log retry attempt
   * @param {Object} retryData - Retry information
   */
  logRetryAttempt(retryData) {
    this.warn('Retrying AI call', {
      correlationId: retryData.correlationId,
      provider: retryData.provider,
      model: retryData.model,
      attempt: retryData.attempt,
      maxRetries: retryData.maxRetries,
      error: retryData.error,
      backoffMs: retryData.backoffMs,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log fallback usage
   * @param {Object} fallbackData - Fallback information
   */
  logFallbackUsage(fallbackData) {
    this.warn('Using fallback provider', {
      correlationId: fallbackData.correlationId,
      role: fallbackData.role,
      primaryProvider: fallbackData.primaryProvider,
      primaryModel: fallbackData.primaryModel,
      fallbackProvider: fallbackData.fallbackProvider,
      fallbackModel: fallbackData.fallbackModel,
      primaryError: fallbackData.primaryError,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log cache hit
   * @param {Object} cacheData - Cache information
   */
  logCacheHit(cacheData) {
    this.info('Cache hit', {
      correlationId: cacheData.correlationId,
      role: cacheData.role,
      model: cacheData.model,
      cacheKey: cacheData.cacheKey,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log cache miss
   * @param {Object} cacheData - Cache information
   */
  logCacheMiss(cacheData) {
    this.debug('Cache miss', {
      correlationId: cacheData.correlationId,
      role: cacheData.role,
      model: cacheData.model,
      cacheKey: cacheData.cacheKey,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log rate limit event
   * @param {Object} rateLimitData - Rate limit information
   */
  logRateLimit(rateLimitData) {
    this.warn('Rate limit applied', {
      correlationId: rateLimitData.correlationId,
      provider: rateLimitData.provider,
      queuedRequests: rateLimitData.queuedRequests,
      estimatedWaitMs: rateLimitData.estimatedWaitMs,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log provider health change
   * @param {Object} healthData - Health information
   */
  logProviderHealthChange(healthData) {
    const level = healthData.status === 'unhealthy' ? 'error' : 'info';
    this[level]('Provider health changed', {
      provider: healthData.provider,
      status: healthData.status,
      previousStatus: healthData.previousStatus,
      successRate: healthData.successRate,
      errorRate: healthData.errorRate,
      averageLatency: healthData.averageLatency,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log streaming start
   * @param {Object} streamData - Stream information
   */
  logStreamingStart(streamData) {
    this.info('AI streaming started', {
      correlationId: streamData.correlationId,
      provider: streamData.provider,
      model: streamData.model,
      role: streamData.role,
      projectId: streamData.projectId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log streaming completion
   * @param {Object} streamData - Stream information
   */
  logStreamingComplete(streamData) {
    this.info('AI streaming completed', {
      correlationId: streamData.correlationId,
      provider: streamData.provider,
      model: streamData.model,
      role: streamData.role,
      projectId: streamData.projectId,
      chunkCount: streamData.chunkCount,
      tokens: streamData.tokens,
      cost: streamData.cost,
      latency: streamData.latency,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log streaming error
   * @param {Object} streamData - Stream information
   */
  logStreamingError(streamData) {
    this.error('AI streaming failed', {
      correlationId: streamData.correlationId,
      provider: streamData.provider,
      model: streamData.model,
      role: streamData.role,
      projectId: streamData.projectId,
      chunkCount: streamData.chunkCount,
      error: streamData.error,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Create child logger with additional context
   * @param {Object} context - Additional context
   * @returns {ModelRouterLogger} Child logger
   */
  child(context = {}) {
    const childLogger = Object.create(this);
    childLogger.context = { ...this.context, ...context };
    
    // Override _createLogEntry to include child context
    childLogger._createLogEntry = (level, message, metadata = {}) => {
      return this._createLogEntry(level, message, {
        ...childLogger.context,
        ...metadata
      });
    };
    
    return childLogger;
  }
}

// Create singleton instance
const modelRouterLogger = new ModelRouterLogger();

module.exports = modelRouterLogger;
module.exports.ModelRouterLogger = ModelRouterLogger;
