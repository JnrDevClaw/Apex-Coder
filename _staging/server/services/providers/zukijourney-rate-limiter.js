/**
 * Zukijourney Rate-Limited Retry Handler
 * 
 * Intelligent retry mechanism with rate limit awareness for Zukijourney API.
 * Handles connection issues, network errors, and respects strict rate limits:
 * - 4 requests per minute per key per IP for certain endpoints
 * - 12 requests per minute per key per IP for others
 * 
 * Features:
 * - Exponential backoff with jitter
 * - Rate limit detection and adaptive delays
 * - Connection error classification
 * - Automatic retry queue management
 */

const Bottleneck = require('bottleneck');

class ZukijourneyRateLimiter {
  constructor(config = {}) {
    this.config = {
      // Conservative rate limits to stay under Zukijourney's thresholds
      maxConcurrent: config.maxConcurrent || 2,
      minTime: config.minTime || 5000, // 5 seconds between requests (12 req/min = 5s)
      reservoir: config.reservoir || 10, // Start with 10 tokens
      reservoirRefreshAmount: config.reservoirRefreshAmount || 10,
      reservoirRefreshInterval: config.reservoirRefreshInterval || 60000, // 1 minute
      
      // Retry configuration
      maxRetries: config.maxRetries || 3,
      baseDelay: config.baseDelay || 2000, // 2 seconds base delay
      maxDelay: config.maxDelay || 30000, // 30 seconds max delay
      
      // Rate limit specific
      rateLimitDelay: config.rateLimitDelay || 15000, // 15 seconds on rate limit
      connectionErrorDelay: config.connectionErrorDelay || 5000, // 5 seconds on connection error
      
      ...config
    };

    // Create Bottleneck limiter
    this.limiter = new Bottleneck({
      maxConcurrent: this.config.maxConcurrent,
      minTime: this.config.minTime,
      reservoir: this.config.reservoir,
      reservoirRefreshAmount: this.config.reservoirRefreshAmount,
      reservoirRefreshInterval: this.config.reservoirRefreshInterval
    });

    // Track rate limit state
    this.rateLimitState = {
      isRateLimited: false,
      rateLimitResetTime: null,
      consecutiveRateLimits: 0,
      lastRequestTime: null
    };

    // Track connection health
    this.connectionHealth = {
      consecutiveFailures: 0,
      lastFailureTime: null,
      isHealthy: true
    };

    this.setupMonitoring();
  }

  /**
   * Execute a function with rate limiting and intelligent retry
   * @param {Function} fn - Async function to execute
   * @param {Object} options - Execution options
   * @returns {Promise<any>} Result of function execution
   */
  async execute(fn, options = {}) {
    const {
      context = {},
      maxRetries = this.config.maxRetries,
      onRetry = null
    } = options;

    let lastError = null;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        // Check if we should wait before attempting
        await this.checkAndWaitIfNeeded(attempt);

        // Execute with rate limiting
        const result = await this.limiter.schedule(
          { id: context.requestId || `req-${Date.now()}` },
          async () => {
            this.rateLimitState.lastRequestTime = Date.now();
            return await fn();
          }
        );

        // Success - reset failure counters
        this.onSuccess();
        return result;

      } catch (error) {
        lastError = error;
        attempt++;

        // Classify the error
        const errorType = this.classifyError(error);
        
        // Update state based on error type
        this.onError(errorType, error);

        // Check if we should retry
        if (attempt > maxRetries || !this.shouldRetry(errorType, attempt)) {
          throw this.enhanceError(error, {
            attempt,
            maxRetries,
            errorType,
            rateLimitState: this.rateLimitState,
            connectionHealth: this.connectionHealth
          });
        }

        // Calculate delay before next retry
        const delay = this.calculateRetryDelay(errorType, attempt, error);

        // Call retry callback if provided
        if (onRetry) {
          await onRetry(attempt, error, errorType, delay, context);
        }

        // Log retry attempt
        console.warn(`[ZukijourneyRateLimiter] Retrying request`, {
          attempt,
          maxRetries,
          errorType,
          delay,
          context,
          error: error.message,
          statusCode: error.statusCode || error.response?.status
        });

        // Wait before retrying
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Classify error type for intelligent handling
   * @param {Error} error - Error object
   * @returns {string} Error classification
   */
  classifyError(error) {
    const statusCode = error.statusCode || error.response?.status || error.status;
    const errorMessage = (error.message || '').toLowerCase();
    const errorCode = error.code;

    // Rate limit errors
    if (statusCode === 429 || errorMessage.includes('rate limit')) {
      return 'RATE_LIMIT';
    }

    // Connection errors
    if (errorCode === 'ECONNRESET' || 
        errorCode === 'ECONNREFUSED' ||
        errorCode === 'ETIMEDOUT' ||
        errorCode === 'ENOTFOUND' ||
        errorCode === 'EAI_AGAIN' ||
        errorMessage.includes('socket hang up') ||
        errorMessage.includes('connection reset') ||
        errorMessage.includes('network error')) {
      return 'CONNECTION_ERROR';
    }

    // Timeout errors
    if (errorCode === 'ETIMEDOUT' || 
        errorMessage.includes('timeout') ||
        errorMessage.includes('timed out')) {
      return 'TIMEOUT';
    }

    // Server errors (retryable)
    if (statusCode >= 500 && statusCode < 600) {
      return 'SERVER_ERROR';
    }

    // Service unavailable
    if (statusCode === 503 || errorMessage.includes('service unavailable')) {
      return 'SERVICE_UNAVAILABLE';
    }

    // Bad gateway
    if (statusCode === 502 || errorMessage.includes('bad gateway')) {
      return 'BAD_GATEWAY';
    }

    // Authentication errors (non-retryable)
    if (statusCode === 401 || statusCode === 403) {
      return 'AUTH_ERROR';
    }

    // Bad request (non-retryable)
    if (statusCode === 400 || statusCode === 422) {
      return 'BAD_REQUEST';
    }

    // Unknown error
    return 'UNKNOWN';
  }

  /**
   * Determine if error should be retried
   * @param {string} errorType - Error classification
   * @param {number} attempt - Current attempt number
   * @returns {boolean} True if should retry
   */
  shouldRetry(errorType, attempt) {
    // Non-retryable errors
    const nonRetryable = ['AUTH_ERROR', 'BAD_REQUEST'];
    if (nonRetryable.includes(errorType)) {
      return false;
    }

    // Always retry these errors (up to max attempts)
    const alwaysRetry = [
      'RATE_LIMIT',
      'CONNECTION_ERROR',
      'TIMEOUT',
      'SERVER_ERROR',
      'SERVICE_UNAVAILABLE',
      'BAD_GATEWAY'
    ];
    
    return alwaysRetry.includes(errorType);
  }

  /**
   * Calculate retry delay based on error type and attempt
   * @param {string} errorType - Error classification
   * @param {number} attempt - Current attempt number
   * @param {Error} error - Original error
   * @returns {number} Delay in milliseconds
   */
  calculateRetryDelay(errorType, attempt, error) {
    let delay;

    switch (errorType) {
      case 'RATE_LIMIT':
        // Extract retry-after header if available
        const retryAfter = this.extractRetryAfter(error);
        if (retryAfter) {
          delay = retryAfter * 1000; // Convert to ms
        } else {
          // Use configured rate limit delay + exponential backoff
          delay = this.config.rateLimitDelay * Math.pow(2, attempt - 1);
        }
        break;

      case 'CONNECTION_ERROR':
      case 'TIMEOUT':
        // Connection issues - use moderate delay with exponential backoff
        delay = this.config.connectionErrorDelay * Math.pow(1.5, attempt - 1);
        break;

      case 'SERVER_ERROR':
      case 'SERVICE_UNAVAILABLE':
      case 'BAD_GATEWAY':
        // Server issues - use exponential backoff
        delay = this.config.baseDelay * Math.pow(2, attempt - 1);
        break;

      default:
        // Unknown errors - use base delay with exponential backoff
        delay = this.config.baseDelay * Math.pow(2, attempt - 1);
    }

    // Add jitter (±20%) to prevent thundering herd
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    delay = delay + jitter;

    // Cap at max delay
    delay = Math.min(delay, this.config.maxDelay);

    return Math.round(delay);
  }

  /**
   * Extract retry-after value from error
   * @param {Error} error - Error object
   * @returns {number|null} Retry-after in seconds, or null
   */
  extractRetryAfter(error) {
    // Check response headers
    const headers = error.response?.headers || {};
    const retryAfter = headers['retry-after'] || headers['Retry-After'];

    if (retryAfter) {
      // Can be either seconds or HTTP date
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        return seconds;
      }

      // Try parsing as date
      const date = new Date(retryAfter);
      if (!isNaN(date.getTime())) {
        return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 1000));
      }
    }

    return null;
  }

  /**
   * Check if we should wait before attempting request
   * @param {number} attempt - Current attempt number
   */
  async checkAndWaitIfNeeded(attempt) {
    // If rate limited, wait until reset time
    if (this.rateLimitState.isRateLimited && this.rateLimitState.rateLimitResetTime) {
      const waitTime = this.rateLimitState.rateLimitResetTime - Date.now();
      if (waitTime > 0) {
        console.warn(`[ZukijourneyRateLimiter] Waiting for rate limit reset`, {
          waitTime,
          resetTime: new Date(this.rateLimitState.rateLimitResetTime).toISOString()
        });
        await this.sleep(waitTime);
        this.rateLimitState.isRateLimited = false;
        this.rateLimitState.rateLimitResetTime = null;
      }
    }

    // If connection is unhealthy, add extra delay
    if (!this.connectionHealth.isHealthy && attempt > 0) {
      const healthDelay = this.config.connectionErrorDelay;
      console.warn(`[ZukijourneyRateLimiter] Connection unhealthy, adding delay`, {
        delay: healthDelay,
        consecutiveFailures: this.connectionHealth.consecutiveFailures
      });
      await this.sleep(healthDelay);
    }
  }

  /**
   * Handle successful request
   */
  onSuccess() {
    // Reset failure counters
    this.connectionHealth.consecutiveFailures = 0;
    this.connectionHealth.isHealthy = true;
    this.rateLimitState.consecutiveRateLimits = 0;
  }

  /**
   * Handle error
   * @param {string} errorType - Error classification
   * @param {Error} error - Original error
   */
  onError(errorType, error) {
    if (errorType === 'RATE_LIMIT') {
      this.rateLimitState.consecutiveRateLimits++;
      this.rateLimitState.isRateLimited = true;
      
      // Set reset time
      const retryAfter = this.extractRetryAfter(error);
      if (retryAfter) {
        this.rateLimitState.rateLimitResetTime = Date.now() + (retryAfter * 1000);
      } else {
        // Default to 1 minute if no retry-after header
        this.rateLimitState.rateLimitResetTime = Date.now() + 60000;
      }

      // If we're getting rate limited frequently, increase delays
      if (this.rateLimitState.consecutiveRateLimits >= 3) {
        console.warn(`[ZukijourneyRateLimiter] Frequent rate limits detected, adjusting strategy`, {
          consecutiveRateLimits: this.rateLimitState.consecutiveRateLimits
        });
        
        // Increase min time between requests
        this.limiter.updateSettings({
          minTime: Math.min(this.config.minTime * 2, 15000)
        });
      }
    }

    if (errorType === 'CONNECTION_ERROR' || errorType === 'TIMEOUT') {
      this.connectionHealth.consecutiveFailures++;
      this.connectionHealth.lastFailureTime = Date.now();
      
      // Mark as unhealthy after 2 consecutive failures
      if (this.connectionHealth.consecutiveFailures >= 2) {
        this.connectionHealth.isHealthy = false;
        console.warn(`[ZukijourneyRateLimiter] Connection marked as unhealthy`, {
          consecutiveFailures: this.connectionHealth.consecutiveFailures
        });
      }
    }
  }

  /**
   * Enhance error with additional context
   * @param {Error} error - Original error
   * @param {Object} context - Additional context
   * @returns {Error} Enhanced error
   */
  enhanceError(error, context) {
    error.retryContext = {
      ...context,
      timestamp: new Date().toISOString()
    };
    return error;
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Setup monitoring for the limiter
   */
  setupMonitoring() {
    this.limiter.on('failed', (error, jobInfo) => {
      console.error(`[ZukijourneyRateLimiter] Job failed`, {
        jobId: jobInfo.options?.id,
        error: error.message,
        queueSize: this.limiter.counts().QUEUED
      });
    });

    this.limiter.on('depleted', () => {
      console.warn(`[ZukijourneyRateLimiter] Rate limit reservoir depleted`, {
        counts: this.limiter.counts(),
        rateLimitState: this.rateLimitState
      });
    });

    this.limiter.on('dropped', (dropped) => {
      console.error(`[ZukijourneyRateLimiter] Job dropped`, {
        dropped,
        counts: this.limiter.counts()
      });
    });
  }

  /**
   * Get current status
   * @returns {Object} Current status
   */
  getStatus() {
    return {
      limiter: this.limiter.counts(),
      rateLimitState: { ...this.rateLimitState },
      connectionHealth: { ...this.connectionHealth },
      config: { ...this.config }
    };
  }

  /**
   * Reset state (useful for testing or recovery)
   */
  reset() {
    this.rateLimitState = {
      isRateLimited: false,
      rateLimitResetTime: null,
      consecutiveRateLimits: 0,
      lastRequestTime: null
    };

    this.connectionHealth = {
      consecutiveFailures: 0,
      lastFailureTime: null,
      isHealthy: true
    };

    // Reset limiter settings to defaults
    this.limiter.updateSettings({
      minTime: this.config.minTime
    });
  }
}

module.exports = ZukijourneyRateLimiter;
