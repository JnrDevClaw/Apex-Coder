/**
 * Fast Failure Utilities
 * 
 * Implements fast failure patterns to avoid unnecessary retries and delays.
 * Quickly identifies non-retryable errors and fails fast to improve performance.
 * 
 * Requirements: 20.4
 */

/**
 * Non-retryable HTTP status codes
 * These indicate client errors that won't be fixed by retrying
 */
const NON_RETRYABLE_STATUS_CODES = [
  400, // Bad Request - invalid input
  401, // Unauthorized - authentication failed
  403, // Forbidden - insufficient permissions
  404, // Not Found - resource doesn't exist
  405, // Method Not Allowed - wrong HTTP method
  406, // Not Acceptable - invalid accept header
  408, // Request Timeout - client took too long
  409, // Conflict - resource conflict
  410, // Gone - resource permanently deleted
  411, // Length Required - missing content-length
  412, // Precondition Failed - precondition not met
  413, // Payload Too Large - request too big
  414, // URI Too Long - URI too long
  415, // Unsupported Media Type - wrong content-type
  416, // Range Not Satisfiable - invalid range
  417, // Expectation Failed - expect header failed
  422, // Unprocessable Entity - validation failed
  426, // Upgrade Required - protocol upgrade needed
  428, // Precondition Required - missing precondition
  431  // Request Header Fields Too Large - headers too big
];

/**
 * Retryable HTTP status codes
 * These indicate temporary server issues that might be resolved by retrying
 */
const RETRYABLE_STATUS_CODES = [
  429, // Too Many Requests - rate limit
  500, // Internal Server Error - temporary server issue
  502, // Bad Gateway - upstream server error
  503, // Service Unavailable - server overloaded
  504, // Gateway Timeout - upstream timeout
  507, // Insufficient Storage - temporary storage issue
  509  // Bandwidth Limit Exceeded - temporary bandwidth issue
];

/**
 * Error patterns that indicate non-retryable errors
 */
const NON_RETRYABLE_ERROR_PATTERNS = [
  /invalid.*api.*key/i,
  /authentication.*failed/i,
  /unauthorized/i,
  /forbidden/i,
  /invalid.*request/i,
  /invalid.*parameter/i,
  /invalid.*model/i,
  /model.*not.*found/i,
  /validation.*error/i,
  /malformed.*request/i,
  /invalid.*json/i,
  /quota.*exceeded/i, // Permanent quota, not rate limit
  /insufficient.*credits/i,
  /payment.*required/i
];

/**
 * Check if an error should fail fast (no retry)
 * @param {Error} error - Error object
 * @returns {boolean} True if should fail fast
 */
function shouldFailFast(error) {
  // Check status code
  const statusCode = error.statusCode || error.response?.status;
  if (statusCode && NON_RETRYABLE_STATUS_CODES.includes(statusCode)) {
    return true;
  }

  // Check error message patterns
  const errorMessage = error.message || '';
  for (const pattern of NON_RETRYABLE_ERROR_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return true;
    }
  }

  // Check error type/name
  if (error.name === 'AuthenticationError' ||
      error.name === 'InvalidRequestError' ||
      error.name === 'ValidationError') {
    return true;
  }

  return false;
}

/**
 * Check if an error is retryable
 * @param {Error} error - Error object
 * @returns {boolean} True if retryable
 */
function isRetryable(error) {
  // If should fail fast, not retryable
  if (shouldFailFast(error)) {
    return false;
  }

  // Check status code
  const statusCode = error.statusCode || error.response?.status;
  if (statusCode && RETRYABLE_STATUS_CODES.includes(statusCode)) {
    return true;
  }

  // Check for network errors
  const networkErrorCodes = [
    'ETIMEDOUT',
    'ECONNRESET',
    'ENOTFOUND',
    'ECONNREFUSED',
    'ENETUNREACH',
    'EAI_AGAIN'
  ];

  if (error.code && networkErrorCodes.includes(error.code)) {
    return true;
  }

  // Check error type
  if (error.name === 'TimeoutError' ||
      error.name === 'ProviderUnavailableError' ||
      error.name === 'RateLimitError') {
    return true;
  }

  // Default to not retryable for unknown errors
  return false;
}

/**
 * Get failure reason for logging
 * @param {Error} error - Error object
 * @returns {string} Failure reason
 */
function getFailureReason(error) {
  const statusCode = error.statusCode || error.response?.status;
  
  if (statusCode) {
    if (statusCode === 400) return 'Invalid request';
    if (statusCode === 401) return 'Authentication failed';
    if (statusCode === 403) return 'Insufficient permissions';
    if (statusCode === 404) return 'Resource not found';
    if (statusCode === 422) return 'Validation failed';
    if (statusCode === 429) return 'Rate limit exceeded';
    if (statusCode === 500) return 'Server error';
    if (statusCode === 502) return 'Bad gateway';
    if (statusCode === 503) return 'Service unavailable';
    if (statusCode === 504) return 'Gateway timeout';
  }

  const errorMessage = error.message || '';
  
  if (/api.*key/i.test(errorMessage)) return 'Invalid API key';
  if (/authentication/i.test(errorMessage)) return 'Authentication failed';
  if (/validation/i.test(errorMessage)) return 'Validation error';
  if (/timeout/i.test(errorMessage)) return 'Request timeout';
  if (/network/i.test(errorMessage)) return 'Network error';
  
  return 'Unknown error';
}

/**
 * Create a fast-failing error handler
 * @param {Object} options - Handler options
 * @returns {Function} Error handler function
 */
function createFastFailureHandler(options = {}) {
  const {
    logger = console,
    onFailFast = null,
    onRetryable = null
  } = options;

  return (error, context = {}) => {
    const failFast = shouldFailFast(error);
    const retryable = isRetryable(error);
    const reason = getFailureReason(error);

    const errorInfo = {
      ...context,
      error: error.message,
      statusCode: error.statusCode || error.response?.status,
      errorCode: error.code,
      errorType: error.name,
      failFast,
      retryable,
      reason
    };

    if (failFast) {
      logger.error('Fast failure - non-retryable error', errorInfo);
      
      if (onFailFast) {
        onFailFast(error, errorInfo);
      }
    } else if (retryable) {
      logger.warn('Retryable error detected', errorInfo);
      
      if (onRetryable) {
        onRetryable(error, errorInfo);
      }
    } else {
      logger.error('Non-retryable error', errorInfo);
    }

    return {
      failFast,
      retryable,
      reason,
      errorInfo
    };
  };
}

/**
 * Wrap a function with fast failure logic
 * @param {Function} fn - Function to wrap
 * @param {Object} options - Wrapper options
 * @returns {Function} Wrapped function
 */
function withFastFailure(fn, options = {}) {
  const handler = createFastFailureHandler(options);

  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      const result = handler(error, { args });
      
      if (result.failFast) {
        // Throw immediately without retry
        throw error;
      }
      
      // Let caller handle retry logic
      throw error;
    }
  };
}

/**
 * Circuit breaker state for fast failure
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.threshold = options.threshold || 5; // Failures before opening
    this.timeout = options.timeout || 60000; // Time before trying again (ms)
    this.failures = 0;
    this.state = 'closed'; // closed, open, half-open
    this.lastFailureTime = null;
  }

  /**
   * Record a successful call
   */
  recordSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  /**
   * Record a failed call
   */
  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }

  /**
   * Check if circuit is open (should fail fast)
   * @returns {boolean} True if circuit is open
   */
  isOpen() {
    if (this.state === 'open') {
      // Check if timeout has passed
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Get circuit state
   * @returns {Object} Circuit state
   */
  getState() {
    return {
      state: this.state,
      failures: this.failures,
      threshold: this.threshold,
      lastFailureTime: this.lastFailureTime
    };
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this.failures = 0;
    this.state = 'closed';
    this.lastFailureTime = null;
  }
}

module.exports = {
  shouldFailFast,
  isRetryable,
  getFailureReason,
  createFastFailureHandler,
  withFastFailure,
  CircuitBreaker,
  NON_RETRYABLE_STATUS_CODES,
  RETRYABLE_STATUS_CODES
};
