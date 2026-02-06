/**
 * Retry with Exponential Backoff Utility
 * 
 * Specialized retry logic for AI Orchestration Pipeline with exponential backoff.
 * Implements 500ms and 1500ms delays as specified in requirements.
 * 
 * Requirements: 14.1, 14.2
 */

const { callWithRetry, defaultIsRetryable } = require('./retry-handler');

/**
 * Retry an AI provider call with exponential backoff
 * Implements specific delays: 500ms, 1500ms for AI orchestration pipeline
 * 
 * @param {Function} fn - Async function to call
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 2)
 * @param {Function} options.isRetryable - Function to determine if error is retryable
 * @param {Function} options.onRetry - Callback function called on each retry
 * @param {Object} options.logger - Logger instance
 * @param {Object} options.context - Additional context for logging
 * @returns {Promise<any>} Result of the function call
 * @throws {Error} Last error if all retries are exhausted
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 2,
    isRetryable = isRetryableForAI,
    onRetry = null,
    logger = console,
    context = {}
  } = options;

  // AI orchestration pipeline specific delays: 500ms, 1500ms
  const delays = [0, 500, 1500];

  return callWithRetry(fn, {
    maxRetries,
    delays,
    isRetryable,
    onRetry: onRetry ? (attempt, error) => {
      return onRetry(attempt, error, context);
    } : null,
    logger
  });
}

/**
 * Determine if an AI provider error is retryable
 * Handles AI-specific error scenarios
 * 
 * @param {Error} error - Error object
 * @returns {boolean} True if error is retryable
 */
function isRetryableForAI(error) {
  // Use default retry logic as base
  if (!defaultIsRetryable(error)) {
    return false;
  }

  // Additional AI-specific checks
  const statusCode = error.statusCode || error.response?.status;
  const errorMessage = error.message?.toLowerCase() || '';

  // Retryable AI provider errors
  if (statusCode === 429) {
    // Rate limit - always retry
    return true;
  }

  if (statusCode === 503 || statusCode === 502) {
    // Service unavailable or bad gateway - retry
    return true;
  }

  if (statusCode === 500) {
    // Internal server error - retry for AI providers
    return true;
  }

  // Model-specific errors that are retryable
  if (errorMessage.includes('model is loading') || 
      errorMessage.includes('model is warming up') ||
      errorMessage.includes('temporarily unavailable')) {
    return true;
  }

  // Timeout errors
  if (error.code === 'ETIMEDOUT' || errorMessage.includes('timeout')) {
    return true;
  }

  // Connection errors
  if (error.code === 'ECONNRESET' || 
      error.code === 'ECONNREFUSED' ||
      error.code === 'ENOTFOUND') {
    return true;
  }

  return false;
}

/**
 * Determine if an error is non-retryable (fail fast)
 * 
 * @param {Error} error - Error object
 * @returns {boolean} True if error should fail fast
 */
function isNonRetryable(error) {
  const statusCode = error.statusCode || error.response?.status;
  const errorMessage = error.message?.toLowerCase() || '';

  // Authentication errors - don't retry
  if (statusCode === 401 || statusCode === 403) {
    return true;
  }

  // Bad request - don't retry
  if (statusCode === 400 || statusCode === 422) {
    return true;
  }

  // Not found - don't retry
  if (statusCode === 404) {
    return true;
  }

  // Invalid API key or authentication
  if (errorMessage.includes('invalid api key') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('authentication failed')) {
    return true;
  }

  // Invalid model or endpoint
  if (errorMessage.includes('model not found') ||
      errorMessage.includes('invalid model') ||
      errorMessage.includes('endpoint not found')) {
    return true;
  }

  // Content policy violations
  if (errorMessage.includes('content policy') ||
      errorMessage.includes('safety filter') ||
      errorMessage.includes('inappropriate content')) {
    return true;
  }

  return false;
}

/**
 * Retry an AI call with custom retry logic
 * 
 * @param {Function} fn - Async function to call
 * @param {Object} options - Options
 * @param {number} options.maxRetries - Max retries (default: 2)
 * @param {Array<number>} options.delays - Custom delay array
 * @param {string} options.providerName - Provider name for logging
 * @param {string} options.modelName - Model name for logging
 * @param {string} options.stage - Pipeline stage for logging
 * @returns {Promise<any>} Result
 */
async function retryAICall(fn, options = {}) {
  const {
    maxRetries = 2,
    delays = [0, 500, 1500],
    providerName = 'unknown',
    modelName = 'unknown',
    stage = 'unknown'
  } = options;

  const context = {
    provider: providerName,
    model: modelName,
    stage
  };

  return retryWithBackoff(fn, {
    maxRetries,
    context,
    onRetry: (attempt, error, ctx) => {
      console.warn(`[${ctx.stage}] Retrying AI call to ${ctx.provider}/${ctx.model}`, {
        attempt,
        maxRetries,
        error: error.message,
        statusCode: error.statusCode || error.response?.status,
        nextDelay: delays[attempt]
      });
    }
  });
}

/**
 * Create a retry wrapper for a provider method
 * 
 * @param {Function} method - Provider method to wrap
 * @param {Object} config - Configuration
 * @param {string} config.providerName - Provider name
 * @param {string} config.modelName - Model name
 * @param {number} config.maxRetries - Max retries
 * @returns {Function} Wrapped method
 */
function createRetryWrapper(method, config = {}) {
  const {
    providerName = 'unknown',
    modelName = 'unknown',
    maxRetries = 2
  } = config;

  return async (...args) => {
    return retryAICall(
      () => method(...args),
      {
        maxRetries,
        providerName,
        modelName
      }
    );
  };
}

module.exports = {
  retryWithBackoff,
  retryAICall,
  isRetryableForAI,
  isNonRetryable,
  createRetryWrapper
};
