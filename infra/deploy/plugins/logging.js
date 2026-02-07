const fp = require('fastify-plugin');
const structuredLogger = require('../services/structured-logger');
const correlationTracker = require('../services/correlation-tracker');

async function loggingPlugin(fastify, options) {
  // Add structured logger to fastify instance
  fastify.decorate('structuredLogger', structuredLogger);
  fastify.decorate('correlationTracker', correlationTracker);

  // Add correlation ID to each request
  fastify.addHook('onRequest', async (request, reply) => {
    // Generate or use existing correlation ID
    const correlationId = request.headers['x-correlation-id'] || correlationTracker.generateCorrelationId('req');
    
    // Start correlation tracking
    correlationTracker.startCorrelation(correlationId, {
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      userId: request.user?.userId,
      projectId: request.params?.projectId,
      buildId: request.params?.buildId
    });

    structuredLogger.setCorrelationId(correlationId);
    
    // Add correlation ID to response headers
    reply.header('x-correlation-id', correlationId);
    
    // Store correlation ID and start time
    request.correlationId = correlationId;
    request.startTime = Date.now();

    // Add correlation event
    correlationTracker.addEvent(correlationId, {
      type: 'http_request_start',
      method: request.method,
      url: request.url,
      headers: {
        userAgent: request.headers['user-agent'],
        contentType: request.headers['content-type']
      }
    });
  });

  // Log all requests and responses
  fastify.addHook('onResponse', async (request, reply) => {
    const responseTime = Date.now() - request.startTime;
    
    // Add correlation event
    correlationTracker.addEvent(request.correlationId, {
      type: 'http_request_end',
      statusCode: reply.statusCode,
      responseTime,
      contentLength: reply.getHeader('content-length')
    });

    // End correlation tracking
    correlationTracker.endCorrelation(request.correlationId, {
      statusCode: reply.statusCode,
      responseTime,
      success: reply.statusCode < 400
    });
    
    structuredLogger.logRequest(request, reply, responseTime);
  });

  // Log errors
  fastify.setErrorHandler(async (error, request, reply) => {
    const correlationId = request.correlationId || structuredLogger.getCorrelationId();
    
    // Add error event to correlation
    if (request.correlationId) {
      correlationTracker.addEvent(request.correlationId, {
        type: 'error',
        error: error.message,
        statusCode: error.statusCode || 500,
        stack: error.stack
      });

      // End correlation with error
      correlationTracker.endCorrelation(request.correlationId, {
        error: error.message,
        statusCode: error.statusCode || 500,
        success: false
      });
    }
    
    structuredLogger.error('Request Error', {
      error: error.message,
      stack: error.stack,
      method: request.method,
      url: request.url,
      statusCode: error.statusCode || 500,
      userId: request.user?.userId
    }, {
      projectId: request.params?.projectId,
      buildId: request.params?.buildId,
      correlationId
    });

    // Return appropriate error response
    const statusCode = error.statusCode || 500;
    const message = statusCode >= 500 ? 'Internal Server Error' : error.message;
    
    return reply.code(statusCode).send({
      error: message,
      correlationId
    });
  });

  // Add logging helpers to request object
  fastify.addHook('onRequest', async (request, reply) => {
    // Create request-scoped logger with context
    request.logger = structuredLogger.child({
      method: request.method,
      url: request.url,
      userId: request.user?.userId,
      projectId: request.params?.projectId,
      buildId: request.params?.buildId
    });
  });

  // Log application startup
  fastify.addHook('onReady', async () => {
    structuredLogger.info('Application Started', {
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
      logLevel: process.env.LOG_LEVEL || 'info'
    });
  });

  // Log application shutdown
  fastify.addHook('onClose', async () => {
    structuredLogger.info('Application Shutting Down');
  });
}

module.exports = fp(loggingPlugin, {
  name: 'logging'
});