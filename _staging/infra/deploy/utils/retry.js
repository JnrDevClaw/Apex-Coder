/**
 * Retry utility with exponential backoff for transient failures
 */

/**
 * Execute a function with retry logic and exponential backoff
 * @param {Function} fn - Function to execute
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.baseDelay - Base delay in milliseconds (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in milliseconds (default: 30000)
 * @param {Function} options.shouldRetry - Function to determine if error should be retried
 * @param {Object} options.logger - Logger instance
 * @returns {Promise} Result of the function execution
 */
async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    shouldRetry = defaultShouldRetry,
    logger = console
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      if (attempt > 0) {
        logger.info(`Operation succeeded on attempt ${attempt + 1}`);
      }
      return result;
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        logger.error(`Operation failed after ${maxRetries + 1} attempts:`, error);
        throw error;
      }
      
      if (!shouldRetry(error)) {
        logger.error('Non-retryable error encountered:', error);
        throw error;
      }
      
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      logger.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);
      
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Default function to determine if an error should be retried
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error should be retried
 */
function defaultShouldRetry(error) {
  // Retry on network errors, timeouts, and temporary AWS errors
  const retryableErrors = [
    'ECONNRESET',
    'ENOTFOUND',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EPIPE',
    'ThrottlingException',
    'TooManyRequestsException',
    'ServiceUnavailableException',
    'InternalServerError',
    'RequestTimeout',
    'SlowDown'
  ];
  
  const errorCode = error.code || error.name;
  const errorMessage = error.message || '';
  
  // Check for specific error codes
  if (retryableErrors.includes(errorCode)) {
    return true;
  }
  
  // Check for HTTP status codes that should be retried
  if (error.status || error.statusCode) {
    const status = error.status || error.statusCode;
    // Retry on 5xx errors and 429 (rate limiting)
    if (status >= 500 || status === 429) {
      return true;
    }
  }
  
  // Check for specific error messages
  const retryableMessages = [
    'timeout',
    'connection reset',
    'network error',
    'temporary failure',
    'rate limit',
    'throttled'
  ];
  
  return retryableMessages.some(msg => 
    errorMessage.toLowerCase().includes(msg)
  );
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after the delay
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Specific retry configuration for AWS operations
 */
const AWS_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 2000,
  maxDelay: 30000,
  shouldRetry: (error) => {
    const awsRetryableErrors = [
      'ThrottlingException',
      'TooManyRequestsException',
      'ServiceUnavailableException',
      'InternalServerError',
      'RequestTimeout',
      'SlowDown',
      'NetworkingError',
      'TimeoutError'
    ];
    
    return defaultShouldRetry(error) || 
           awsRetryableErrors.includes(error.code || error.name);
  }
};

/**
 * Specific retry configuration for GitHub API operations
 */
const GITHUB_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 15000,
  shouldRetry: (error) => {
    // GitHub specific error handling
    if (error.status === 403 && error.message?.includes('rate limit')) {
      return true;
    }
    
    if (error.status === 502 || error.status === 503 || error.status === 504) {
      return true;
    }
    
    return defaultShouldRetry(error);
  }
};

module.exports = {
  withRetry,
  AWS_RETRY_CONFIG,
  GITHUB_RETRY_CONFIG
};