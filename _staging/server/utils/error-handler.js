/**
 * Standardized Error Handling Utility
 * Provides consistent error logging and propagation across services
 */

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        name: this.name,
        message: this.message,
        code: this.code,
        statusCode: this.statusCode,
        details: this.details,
        timestamp: this.timestamp
      }
    };
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class NotFoundError extends AppError {
  constructor(resource, identifier = null) {
    const message = identifier 
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND', { resource, identifier });
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

class ServiceUnavailableError extends AppError {
  constructor(service, message = null) {
    const errorMessage = message || `Service '${service}' is currently unavailable`;
    super(errorMessage, 503, 'SERVICE_UNAVAILABLE', { service });
  }
}

class ExternalServiceError extends AppError {
  constructor(service, originalError) {
    super(
      `External service '${service}' error: ${originalError.message}`,
      502,
      'EXTERNAL_SERVICE_ERROR',
      { service, originalError: originalError.message }
    );
  }
}

/**
 * Error Handler Utility
 */
class ErrorHandler {
  constructor(logger = console) {
    this.logger = logger;
  }

  /**
   * Log error with context
   * @param {Error} error - Error object
   * @param {Object} context - Additional context
   */
  logError(error, context = {}) {
    const errorInfo = {
      message: error.message,
      name: error.name,
      code: error.code || 'UNKNOWN',
      statusCode: error.statusCode || 500,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      ...context
    };

    if (error.statusCode >= 500) {
      this.logger.error('Server Error:', errorInfo);
    } else if (error.statusCode >= 400) {
      this.logger.warn('Client Error:', errorInfo);
    } else {
      this.logger.info('Error:', errorInfo);
    }
  }

  /**
   * Handle error and return appropriate response
   * @param {Error} error - Error object
   * @param {Object} reply - Fastify reply object
   * @param {Object} context - Additional context
   */
  handleError(error, reply, context = {}) {
    this.logError(error, context);

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send(error.toJSON());
    }

    // Handle unknown errors
    return reply.code(500).send({
      error: {
        name: 'InternalServerError',
        message: 'An unexpected error occurred',
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Wrap async route handler with error handling
   * @param {Function} handler - Async route handler
   * @returns {Function} Wrapped handler
   */
  wrapAsync(handler) {
    return async (request, reply) => {
      try {
        return await handler(request, reply);
      } catch (error) {
        return this.handleError(error, reply, {
          method: request.method,
          url: request.url,
          params: request.params,
          query: request.query
        });
      }
    };
  }

  /**
   * Create error from external service failure
   * @param {string} service - Service name
   * @param {Error} error - Original error
   * @returns {ExternalServiceError}
   */
  createExternalServiceError(service, error) {
    return new ExternalServiceError(service, error);
  }

  /**
   * Check if error is retryable
   * @param {Error} error - Error object
   * @returns {boolean}
   */
  isRetryable(error) {
    if (error instanceof AppError) {
      return error.statusCode >= 500 || error.code === 'EXTERNAL_SERVICE_ERROR';
    }
    return false;
  }
}

module.exports = {
  ErrorHandler,
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ServiceUnavailableError,
  ExternalServiceError
};
