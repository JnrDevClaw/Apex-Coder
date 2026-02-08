const { PutCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLES, dbUtils } = require('../models/db');
const crypto = require('crypto');

class AuditLogger {
  constructor() {
    this.correlationIdMap = new Map();
  }

  /**
   * Generate a correlation ID for tracking related events
   */
  generateCorrelationId() {
    return crypto.randomUUID();
  }

  /**
   * Set correlation ID for current context
   */
  setCorrelationId(correlationId) {
    this.correlationIdMap.set(process.pid, correlationId);
  }

  /**
   * Get current correlation ID
   */
  getCorrelationId() {
    return this.correlationIdMap.get(process.pid) || this.generateCorrelationId();
  }

  /**
   * Log an audit event with comprehensive tracking
   */
  async logEvent(eventData) {
    const {
      event,
      actor,
      actorType = 'user', // 'user' | 'ai-agent' | 'system'
      projectId,
      buildId,
      resourceId,
      action,
      details = {},
      promptSnapshot,
      generatedFiles = [],
      metadata = {}
    } = eventData;

    const timestamp = new Date().toISOString();
    const correlationId = this.getCorrelationId();
    const eventId = crypto.randomUUID();

    // Hash generated files for integrity tracking
    const fileHashes = generatedFiles.map(file => ({
      path: file.path,
      hash: crypto.createHash('sha256').update(file.content || '').digest('hex'),
      size: file.content ? file.content.length : 0
    }));

    const auditEvent = {
      PK: `audit#${projectId || 'global'}`,
      SK: `${timestamp}#${eventId}`,
      eventId,
      correlationId,
      timestamp,
      event,
      actor,
      actorType,
      projectId,
      buildId,
      resourceId,
      action,
      details,
      promptSnapshot: promptSnapshot ? this.sanitizePrompt(promptSnapshot) : null,
      fileHashes,
      metadata,
      ttl: this.calculateTTL(metadata.retentionDays || 90)
    };

    try {
      await docClient.send(new PutCommand({
        TableName: TABLES.AUDIT_LOGS,
        Item: auditEvent
      }));

      // Also log to structured application logs
      this.logToConsole(auditEvent);

      return eventId;
    } catch (error) {
      console.error('Failed to log audit event:', error);
      // Still log to console as fallback
      this.logToConsole(auditEvent);
      throw error;
    }
  }

  /**
   * Sanitize prompt data to remove PII and sensitive information
   */
  sanitizePrompt(prompt) {
    if (!prompt) return null;

    // Remove potential PII patterns
    let sanitized = prompt
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')
      .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD]')
      .replace(/\b\d{10,15}\b/g, '[PHONE]');

    // Truncate if too long
    if (sanitized.length > 2000) {
      sanitized = sanitized.substring(0, 2000) + '... [truncated]';
    }

    return sanitized;
  }

  /**
   * Calculate TTL for DynamoDB item based on retention policy
   */
  calculateTTL(retentionDays) {
    const now = new Date();
    const expirationDate = new Date(now.getTime() + (retentionDays * 24 * 60 * 60 * 1000));
    return Math.floor(expirationDate.getTime() / 1000);
  }

  /**
   * Log structured event to console with correlation ID
   */
  logToConsole(auditEvent) {
    const logEntry = {
      level: 'audit',
      timestamp: auditEvent.timestamp,
      correlationId: auditEvent.correlationId,
      event: auditEvent.event,
      actor: auditEvent.actor,
      actorType: auditEvent.actorType,
      projectId: auditEvent.projectId,
      buildId: auditEvent.buildId,
      action: auditEvent.action,
      details: auditEvent.details
    };

    console.log(JSON.stringify(logEntry));
  }

  /**
   * Query audit events for a project
   */
  async getProjectAuditLog(projectId, options = {}) {
    const {
      startTime,
      endTime,
      actor,
      event,
      limit = 100
    } = options;

    let keyConditionExpression = 'PK = :pk';
    const expressionAttributeValues = {
      ':pk': `audit#${projectId}`
    };

    if (startTime || endTime) {
      if (startTime && endTime) {
        keyConditionExpression += ' AND SK BETWEEN :start AND :end';
        expressionAttributeValues[':start'] = startTime;
        expressionAttributeValues[':end'] = endTime;
      } else if (startTime) {
        keyConditionExpression += ' AND SK >= :start';
        expressionAttributeValues[':start'] = startTime;
      } else if (endTime) {
        keyConditionExpression += ' AND SK <= :end';
        expressionAttributeValues[':end'] = endTime;
      }
    }

    let filterExpression = null;
    if (actor) {
      filterExpression = 'actor = :actor';
      expressionAttributeValues[':actor'] = actor;
    }
    if (event) {
      filterExpression = filterExpression 
        ? `${filterExpression} AND event = :event`
        : 'event = :event';
      expressionAttributeValues[':event'] = event;
    }

    try {
      const result = await docClient.send(new QueryCommand({
        TableName: TABLES.AUDIT_LOGS,
        KeyConditionExpression: keyConditionExpression,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        Limit: limit,
        ScanIndexForward: false // Most recent first
      }));

      return result.Items || [];
    } catch (error) {
      console.error('Failed to query audit log:', error);
      throw error;
    }
  }

  /**
   * Get audit events by correlation ID for tracing related actions
   */
  async getEventsByCorrelationId(correlationId, limit = 50) {
    try {
      const result = await docClient.send(new ScanCommand({
        TableName: TABLES.AUDIT_LOGS,
        FilterExpression: 'correlationId = :correlationId',
        ExpressionAttributeValues: {
          ':correlationId': correlationId
        },
        Limit: limit
      }));

      return result.Items || [];
    } catch (error) {
      console.error('Failed to query events by correlation ID:', error);
      throw error;
    }
  }

  /**
   * Log user action
   */
  async logUserAction(userId, action, details = {}) {
    return this.logEvent({
      event: 'user_action',
      actor: userId,
      actorType: 'user',
      action,
      details,
      projectId: details.projectId,
      buildId: details.buildId,
      resourceId: details.resourceId
    });
  }

  /**
   * Log AI agent action with prompt tracking
   */
  async logAIAction(agentRole, action, promptSnapshot, generatedFiles = [], details = {}) {
    return this.logEvent({
      event: 'ai_action',
      actor: agentRole,
      actorType: 'ai-agent',
      action,
      details,
      promptSnapshot,
      generatedFiles,
      projectId: details.projectId,
      buildId: details.buildId,
      resourceId: details.resourceId
    });
  }

  /**
   * Log system event
   */
  async logSystemEvent(event, action, details = {}) {
    return this.logEvent({
      event,
      actor: 'system',
      actorType: 'system',
      action,
      details,
      projectId: details.projectId,
      buildId: details.buildId,
      resourceId: details.resourceId
    });
  }

  /**
   * Log build lifecycle event
   */
  async logBuildEvent(buildId, projectId, event, details = {}) {
    return this.logEvent({
      event: 'build_lifecycle',
      actor: details.actor || 'system',
      actorType: details.actorType || 'system',
      action: event,
      projectId,
      buildId,
      details
    });
  }

  /**
   * Log deployment event
   */
  async logDeploymentEvent(deploymentId, projectId, buildId, event, details = {}) {
    return this.logEvent({
      event: 'deployment',
      actor: details.actor || 'system',
      actorType: details.actorType || 'system',
      action: event,
      projectId,
      buildId,
      resourceId: deploymentId,
      details
    });
  }

  /**
   * Log security event
   */
  async logSecurityEvent(event, actor, details = {}) {
    return this.logEvent({
      event: 'security',
      actor,
      actorType: details.actorType || 'user',
      action: event,
      details: {
        ...details,
        severity: details.severity || 'medium',
        ipAddress: details.ipAddress,
        userAgent: details.userAgent
      },
      projectId: details.projectId
    });
  }

  /**
   * Log cost-related event
   */
  async logCostEvent(event, amount, currency = 'USD', details = {}) {
    return this.logEvent({
      event: 'cost',
      actor: details.actor || 'system',
      actorType: details.actorType || 'system',
      action: event,
      details: {
        ...details,
        amount,
        currency,
        resourceType: details.resourceType
      },
      projectId: details.projectId,
      buildId: details.buildId
    });
  }

  /**
   * Get audit statistics for reporting
   */
  async getAuditStats(projectId, timeRange = '24h') {
    const now = new Date();
    let startTime;

    switch (timeRange) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const events = await this.getProjectAuditLog(projectId, {
      startTime: startTime.toISOString(),
      endTime: now.toISOString(),
      limit: 1000
    });

    const stats = {
      totalEvents: events.length,
      eventsByType: {},
      eventsByActor: {},
      securityEvents: 0,
      costEvents: 0,
      aiActions: 0,
      userActions: 0
    };

    events.forEach(event => {
      // Count by event type
      stats.eventsByType[event.event] = (stats.eventsByType[event.event] || 0) + 1;
      
      // Count by actor
      stats.eventsByActor[event.actor] = (stats.eventsByActor[event.actor] || 0) + 1;
      
      // Count special categories
      if (event.event === 'security') stats.securityEvents++;
      if (event.event === 'cost') stats.costEvents++;
      if (event.actorType === 'ai-agent') stats.aiActions++;
      if (event.actorType === 'user') stats.userActions++;
    });

    return stats;
  }
 }


// Create singleton instance
const auditLogger = new AuditLogger();

module.exports = auditLogger;