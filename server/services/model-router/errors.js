/**
 * Model Router Error Classes
 * 
 * Structured error types for the Model Router service.
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

/**
 * Base error class for provider-related errors
 */
class ProviderError extends Error {
  constructor(message, provider, statusCode, originalError) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.statusCode = statusCode;
    this.originalError = originalError;
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      provider: this.provider,
      statusCode: this.statusCode,
      originalError: this.originalError ? {
        message: this.originalError.message,
        name: this.originalError.name
      } : undefined
    };
  }
}

/**
 * Rate limit exceeded error
 */
class RateLimitError extends ProviderError {
  constructor(provider, retryAfter) {
    super(`Rate limit exceeded for ${provider}`, provider, 429);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      retryAfter: this.retryAfter
    };
  }
}

/**
 * Authentication failed error
 */
class AuthenticationError extends ProviderError {
  constructor(provider, message = null) {
    super(
      message || `Authentication failed for ${provider}. Check API key configuration.`,
      provider,
      401
    );
    this.name = 'AuthenticationError';
  }
}

/**
 * Provider unavailable error
 */
class ProviderUnavailableError extends ProviderError {
  constructor(provider, message = null) {
    super(
      message || `Provider ${provider} is unavailable`,
      provider,
      503
    );
    this.name = 'ProviderUnavailableError';
  }
}

/**
 * Timeout error
 */
class TimeoutError extends ProviderError {
  constructor(provider, timeout) {
    super(
      `Request to ${provider} timed out after ${timeout}ms`,
      provider,
      504
    );
    this.name = 'TimeoutError';
    this.timeout = timeout;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      timeout: this.timeout
    };
  }
}

/**
 * Invalid request error (model-specific)
 */
class InvalidRequestError extends ProviderError {
  constructor(provider, message, details = null) {
    super(message, provider, 400);
    this.name = 'InvalidRequestError';
    this.details = details;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      details: this.details
    };
  }
}

/**
 * All fallback providers exhausted error
 */
class FallbackExhaustedError extends Error {
  constructor(role, attemptedProviders) {
    const providerList = attemptedProviders
      .map(a => `${a.provider}/${a.model}`)
      .join(', ');
    
    super(
      `All providers failed for role "${role}". Attempted providers: ${providerList}`
    );
    
    this.name = 'FallbackExhaustedError';
    this.role = role;
    this.attemptedProviders = attemptedProviders;
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      role: this.role,
      attemptedProviders: this.attemptedProviders.map(a => ({
        provider: a.provider,
        model: a.model,
        error: a.error
      }))
    };
  }

  /**
   * Get a user-friendly error message
   */
  getUserMessage() {
    return `Unable to complete request for ${this.role}. All available AI providers are currently unavailable. Please try again later.`;
  }

  /**
   * Get detailed error information for logging
   */
  getDetailedInfo() {
    return {
      role: this.role,
      totalAttempts: this.attemptedProviders.length,
      attempts: this.attemptedProviders.map((a, index) => ({
        attemptNumber: index + 1,
        provider: a.provider,
        model: a.model,
        error: a.error
      }))
    };
  }
}

/**
 * Model not found error
 */
class ModelNotFoundError extends ProviderError {
  constructor(provider, model) {
    super(
      `Model "${model}" not found for provider ${provider}`,
      provider,
      404
    );
    this.name = 'ModelNotFoundError';
    this.model = model;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      model: this.model
    };
  }
}

/**
 * Configuration error
 */
class ConfigurationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ConfigurationError';
    this.field = field;
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      field: this.field
    };
  }
}

module.exports = {
  ProviderError,
  RateLimitError,
  AuthenticationError,
  ProviderUnavailableError,
  TimeoutError,
  InvalidRequestError,
  FallbackExhaustedError,
  ModelNotFoundError,
  ConfigurationError
};
