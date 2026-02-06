/**
 * Retry Handler Utility
 * 
 * Provides retry logic with exponential backoff for handling transient failures.
 * Implements fast failure for non-retryable errors to improve performance.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 20.4
 */

const { shouldFailFast, isRetryable: isFastFailureRetryable } = require('../services/model-router/fast-failure');

/**
 * Call a function with retry logic and exponential backoff
 * @param {Function} fn - Async function to call
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 2)
 * @param {Array<number>} options.delays - Delay in ms for each retry attempt (default: [0, 500, 1500])
 * @param {Function} options.isRetryable - Function to determine if error is retryable
 * @param {Function} options.onRetry - Callback function called on each retry
 * @param {Object} options.logger - Logger instance for logging retry attempts
 * @returns {Promise<any>} Result of the function call
 * @throws {Error} Last error if all retries are exhausted
 */
async function callWithRetry(fn, options = {}) {
  const {
    maxRetries = 2,
    delays = [0, 500, 1500],
    isRetryable = defaultIsRetryable,
    onRetry = null,
    logger = console
  } = options;

  let lastError;
  const totalAttempts = maxRetries + 1; // Initial attempt + retries

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    try {
      // Wait before retry (skip on first attempt)
      if (attempt > 0 && delays[attempt] !== undefined) {
        await sleep(delays[attempt]);
      }

      // Call the function
      return await fn();
    } catch (error) {
      lastError = error;

      // Fast failure check - fail immediately for non-retryable errors (Requirements: 20.4)
      if (shouldFailFast(error)) {
        logger.error('Fast failure - non-retryable error detected', {
          attempt: attempt + 1,
          error: error.message,
          statusCode: error.statusCode || error.response?.status,
          errorType: error.name
        });
        throw error;
      }

      // Check if we should retry
      const shouldRetry = attempt < maxRetries && isRetryable(error);

      if (!shouldRetry) {
        // Log final failure
        if (attempt === maxRetries) {
          logger.error('All retry attempts exhausted', {
            attempts: attempt + 1,
            error: error.message,
            statusCode: error.statusCode || error.response?.status
          });
        } else {
          logger.error('Non-retryable error encountered', {
            attempt: attempt + 1,
            error: error.message,
            statusCode: error.statusCode || error.response?.status
          });
        }
        throw error;
      }

      // Log retry attempt
      logRetry(logger, attempt + 1, maxRetries, error, delays[attempt + 1]);

      // Call onRetry callback if provided
      if (onRetry) {
        try {
          await onRetry(attempt + 1, error);
        } catch (callbackError) {
          logger.warn('onRetry callback failed', { error: callbackError.message });
        }
      }
    }
  }

  // This should never be reached, but throw last error as fallback
  throw lastError;
}

/**
 * Default function to determine if an error is retryable
 * @param {Error} error - Error object
 * @returns {boolean} True if error is retryable
 */
function defaultIsRetryable(error) {
  // Retryable HTTP status codes
  const retryableStatusCodes = [429, 500, 502, 503, 504];
  
  // Non-retryable HTTP status codes
  const nonRetryableStatusCodes = [400, 401, 403, 404];
  
  // Retryable error codes
  const retryableErrorCodes = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED'];

  // Check for explicit non-retryable status codes first
  if (error.statusCode && nonRetryableStatusCodes.includes(error.statusCode)) {
    return false;
  }
  
  if (error.response?.status && nonRetryableStatusCodes.includes(error.response.status)) {
    return false;
  }

  // Check for retryable status codes
  if (error.statusCode && retryableStatusCodes.includes(error.statusCode)) {
    return true;
  }
  
  if (error.response?.status && retryableStatusCodes.includes(error.response.status)) {
    return true;
  }

  // Check for retryable error codes
  if (error.code && retryableErrorCodes.includes(error.code)) {
    return true;
  }

  // Check for timeout errors
  if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
    return true;
  }

  // Default to non-retryable
  return false;
}

/**
 * Check if a specific status code is retryable
 * @param {number} statusCode - HTTP status code
 * @returns {boolean} True if status code is retryable
 */
function isRetryableStatusCode(statusCode) {
  const retryableStatusCodes = [429, 500, 502, 503, 504];
  return retryableStatusCodes.includes(statusCode);
}

/**
 * Check if a specific error code is retryable
 * @param {string} errorCode - Error code
 * @returns {boolean} True if error code is retryable
 */
function isRetryableErrorCode(errorCode) {
  const retryableErrorCodes = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED'];
  return retryableErrorCodes.includes(errorCode);
}

/**
 * Log retry attempt
 * @param {Object} logger - Logger instance
 * @param {number} attempt - Current attempt number
 * @param {number} maxRetries - Maximum number of retries
 * @param {Error} error - Error that triggered retry
 * @param {number} nextDelay - Delay before next retry in ms
 */
function logRetry(logger, attempt, maxRetries, error, nextDelay) {
  const statusCode = error.statusCode || error.response?.status;
  const errorCode = error.code;
  
  logger.warn('Retrying AI call', {
    attempt,
    maxRetries,
    remainingRetries: maxRetries - attempt,
    error: error.message,
    statusCode,
    errorCode,
    nextDelayMs: nextDelay,
    retryReason: getRetryReason(error)
  });
}

/**
 * Get human-readable retry reason
 * @param {Error} error - Error object
 * @returns {string} Retry reason
 */
function getRetryReason(error) {
  const statusCode = error.statusCode || error.response?.status;
  const errorCode = error.code;

  if (statusCode === 429) return 'Rate limit exceeded';
  if (statusCode === 500) return 'Internal server error';
  if (statusCode === 502) return 'Bad gateway';
  if (statusCode === 503) return 'Service unavailable';
  if (statusCode === 504) return 'Gateway timeout';
  if (errorCode === 'ETIMEDOUT') return 'Request timeout';
  if (errorCode === 'ECONNRESET') return 'Connection reset';
  if (errorCode === 'ENOTFOUND') return 'DNS lookup failed';
  if (errorCode === 'ECONNREFUSED') return 'Connection refused';
  
  return 'Transient error';
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a retry-enabled version of a function
 * @param {Function} fn - Function to wrap with retry logic
 * @param {Object} options - Retry options
 * @returns {Function} Wrapped function with retry logic
 */
function withRetry(fn, options = {}) {
  return async (...args) => {
    return callWithRetry(() => fn(...args), options);
  };
}

module.exports = {
  callWithRetry,
  defaultIsRetryable,
  isRetryableStatusCode,
  isRetryableErrorCode,
  withRetry
};
