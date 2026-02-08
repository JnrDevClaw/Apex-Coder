/**
 * Error logging plugin for Fastify
 * Automatically logs all errors with structured context
 */

const fp = require('fastify-plugin');
const {
  logDeploymentError,
  logGitHubError,
  logAWSError,
  logCloudFormationError,
  logWorkerError,
  logAuthError,
  logDatabaseError,
  logValidationError,
  logAPIError,
  logEncryptionError,
  logModelError
} = require('../services/deployment-error-logger');

async function errorLoggingPlugin(fastify, options) {
  // Decorate fastify with error logging functions
  fastify.decorate('logError', {
    deployment: logDeploymentError,
    github: logGitHubError,
    aws: logAWSError,
    cloudformation: logCloudFormationError,
    worker: logWorkerError,
    auth: logAuthError,
    database: logDatabaseError,
    validation: logValidationError,
    api: logAPIError,
    encryption: logEncryptionError,
    model: logModelError
  });

  // Add error handler hook
  fastify.addHook('onError', async (request, reply, error) => {
    // Extract user context
    const userId = request.user?.userId || request.user?.id;
    
    // Determine error type and log appropriately
    const context = {
      userId,
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      correlationId: request.id
    };

    // Log based on error type or route
    if (request.url.includes('/github')) {
      logGitHubError('route_error', error, context);
    } else if (request.url.includes('/aws')) {
      logAWSError('route_error', error, context);
    } else if (request.url.includes('/deploy')) {
      logDeploymentError('route_error', error, context);
    } else if (request.url.includes('/auth')) {
      logAuthError('route_error', error, context);
    } else {
      // Generic API error
      logAPIError('route_error', error, {
        ...context,
        statusCode: reply.statusCode || 500
      });
    }
  });

  // Add request error wrapper
  fastify.decorateRequest('logError', function(operation, error, additionalContext = {}) {
    const context = {
      userId: this.user?.userId || this.user?.id,
      method: this.method,
      url: this.url,
      ip: this.ip,
      correlationId: this.id,
      ...additionalContext
    };

    logAPIError(operation, error, context);
  });
}

module.exports = fp(errorLoggingPlugin, {
  name: 'error-logging',
  dependencies: []
});
