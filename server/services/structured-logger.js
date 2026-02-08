const auditLogger = require('./audit-logger');

class StructuredLogger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.logLevels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4
    };
  }

  /**
   * Check if log level should be output
   */
  shouldLog(level) {
    return this.logLevels[level] <= this.logLevels[this.logLevel];
  }

  /**
   * Create structured log entry
   */
  createLogEntry(level, message, metadata = {}) {
    const correlationId = auditLogger.getCorrelationId();
    
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId,
      pid: process.pid,
      ...metadata
    };
  }

  /**
   * Output log entry to console
   */
  output(logEntry) {
    if (this.shouldLog(logEntry.level)) {
      console.log(JSON.stringify(logEntry));
    }
  }

  /**
   * Log error with optional audit trail
   */
  error(message, metadata = {}, auditData = null) {
    const logEntry = this.createLogEntry('error', message, {
      ...metadata,
      stack: metadata.error?.stack
    });
    
    this.output(logEntry);

    // Log to audit trail if audit data provided
    if (auditData) {
      auditLogger.logSystemEvent('error', 'system_error', {
        message,
        ...auditData,
        severity: 'high'
      }).catch(err => {
        console.error('Failed to log error to audit trail:', err);
      });
    }
  }

  /**
   * Log warning
   */
  warn(message, metadata = {}) {
    const logEntry = this.createLogEntry('warn', message, metadata);
    this.output(logEntry);
  }

  /**
   * Log info
   */
  info(message, metadata = {}) {
    const logEntry = this.createLogEntry('info', message, metadata);
    this.output(logEntry);
  }

  /**
   * Log debug information
   */
  debug(message, metadata = {}) {
    const logEntry = this.createLogEntry('debug', message, metadata);
    this.output(logEntry);
  }

  /**
   * Log trace information
   */
  trace(message, metadata = {}) {
    const logEntry = this.createLogEntry('trace', message, metadata);
    this.output(logEntry);
  }

  /**
   * Log HTTP request
   */
  logRequest(request, response, responseTime) {
    const logEntry = this.createLogEntry('info', 'HTTP Request', {
      method: request.method,
      url: request.url,
      statusCode: response.statusCode,
      responseTime,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      userId: request.user?.userId
    });
    
    this.output(logEntry);
  }

  /**
   * Log database operation
   */
  logDatabaseOperation(operation, table, metadata = {}) {
    const logEntry = this.createLogEntry('debug', 'Database Operation', {
      operation,
      table,
      ...metadata
    });
    
    this.output(logEntry);
  }

  /**
   * Log AI model interaction
   */
  logAIInteraction(provider, model, operation, metadata = {}) {
    const logEntry = this.createLogEntry('info', 'AI Model Interaction', {
      provider,
      model,
      operation,
      ...metadata
    });
    
    this.output(logEntry);

    // Also log to audit trail
    auditLogger.logAIAction(
      model,
      operation,
      metadata.promptSnapshot,
      metadata.generatedFiles || [],
      {
        provider,
        ...metadata
      }
    ).catch(err => {
      console.error('Failed to log AI interaction to audit trail:', err);
    });
  }

  /**
   * Log build operation
   */
  logBuildOperation(buildId, projectId, operation, metadata = {}) {
    const logEntry = this.createLogEntry('info', 'Build Operation', {
      buildId,
      projectId,
      operation,
      ...metadata
    });
    
    this.output(logEntry);

    // Also log to audit trail
    auditLogger.logBuildEvent(buildId, projectId, operation, metadata).catch(err => {
      console.error('Failed to log build operation to audit trail:', err);
    });
  }

  /**
   * Log deployment operation
   */
  logDeploymentOperation(deploymentId, projectId, buildId, operation, metadata = {}) {
    const logEntry = this.createLogEntry('info', 'Deployment Operation', {
      deploymentId,
      projectId,
      buildId,
      operation,
      ...metadata
    });
    
    this.output(logEntry);

    // Also log to audit trail
    auditLogger.logDeploymentEvent(deploymentId, projectId, buildId, operation, metadata).catch(err => {
      console.error('Failed to log deployment operation to audit trail:', err);
    });
  }

  /**
   * Log security event
   */
  logSecurityEvent(event, actor, metadata = {}) {
    const logEntry = this.createLogEntry('warn', 'Security Event', {
      event,
      actor,
      ...metadata
    });
    
    this.output(logEntry);

    // Always log security events to audit trail
    auditLogger.logSecurityEvent(event, actor, metadata).catch(err => {
      console.error('Failed to log security event to audit trail:', err);
    });
  }

  /**
   * Log cost event
   */
  logCostEvent(event, amount, currency, metadata = {}) {
    const logEntry = this.createLogEntry('info', 'Cost Event', {
      event,
      amount,
      currency,
      ...metadata
    });
    
    this.output(logEntry);

    // Log to audit trail
    auditLogger.logCostEvent(event, amount, currency, metadata).catch(err => {
      console.error('Failed to log cost event to audit trail:', err);
    });
  }

  /**
   * Create child logger with additional context
   */
  child(context = {}) {
    const childLogger = Object.create(this);
    childLogger.context = { ...this.context, ...context };
    
    // Override createLogEntry to include child context
    childLogger.createLogEntry = (level, message, metadata = {}) => {
      return this.createLogEntry(level, message, {
        ...childLogger.context,
        ...metadata
      });
    };
    
    return childLogger;
  }

  /**
   * Set correlation ID for request tracing
   */
  setCorrelationId(correlationId) {
    auditLogger.setCorrelationId(correlationId);
  }

  /**
   * Get current correlation ID
   */
  getCorrelationId() {
    return auditLogger.getCorrelationId();
  }
}

// Create singleton instance
const structuredLogger = new StructuredLogger();

module.exports = structuredLogger;