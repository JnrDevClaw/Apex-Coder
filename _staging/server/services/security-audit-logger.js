'use strict'

const auditLogger = require('./audit-logger');

/**
 * Security Audit Logger
 * 
 * Specialized logging for security-related events including:
 * - OAuth connections and disconnections
 * - CloudFormation stack creations
 * - Deployment triggers
 * - Authentication events
 * - Authorization failures
 * - Rate limit violations
 * - CSRF token failures
 */
class SecurityAuditLogger {
  /**
   * Log OAuth connection event
   */
  async logOAuthConnection(provider, userId, details = {}) {
    return auditLogger.logSecurityEvent(`${provider}_oauth_connected`, userId, {
      actorType: 'user',
      severity: 'low',
      ...details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log OAuth disconnection event
   */
  async logOAuthDisconnection(provider, userId, details = {}) {
    return auditLogger.logSecurityEvent(`${provider}_oauth_disconnected`, userId, {
      actorType: 'user',
      severity: 'low',
      ...details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log AWS credentials connection
   */
  async logAWSConnection(userId, accountId, region, details = {}) {
    return auditLogger.logSecurityEvent('aws_credentials_connected', userId, {
      actorType: 'user',
      severity: 'medium',
      accountId,
      region,
      ...details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log AWS credentials disconnection
   */
  async logAWSDisconnection(userId, details = {}) {
    return auditLogger.logSecurityEvent('aws_credentials_disconnected', userId, {
      actorType: 'user',
      severity: 'medium',
      ...details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log CloudFormation stack creation
   */
  async logStackCreation(userId, stackDetails, details = {}) {
    return auditLogger.logUserAction(userId, 'cloudformation_stack_created', {
      ...stackDetails,
      ...details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log CloudFormation stack deletion
   */
  async logStackDeletion(userId, stackName, details = {}) {
    return auditLogger.logUserAction(userId, 'cloudformation_stack_deleted', {
      stackName,
      severity: 'high',
      ...details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log deployment trigger
   */
  async logDeploymentTrigger(userId, deploymentId, projectId, details = {}) {
    return auditLogger.logDeploymentEvent(
      deploymentId,
      projectId,
      null,
      'deployment_triggered',
      {
        actor: userId,
        actorType: 'user',
        ...details,
        timestamp: new Date().toISOString()
      }
    );
  }

  /**
   * Log deployment completion
   */
  async logDeploymentComplete(deploymentId, projectId, status, details = {}) {
    return auditLogger.logDeploymentEvent(
      deploymentId,
      projectId,
      null,
      'deployment_completed',
      {
        actor: 'system',
        actorType: 'system',
        status,
        ...details,
        timestamp: new Date().toISOString()
      }
    );
  }

  /**
   * Log authentication attempt
   */
  async logAuthAttempt(userId, success, details = {}) {
    return auditLogger.logSecurityEvent(
      success ? 'auth_success' : 'auth_failure',
      userId || 'unknown',
      {
        actorType: 'user',
        severity: success ? 'low' : 'high',
        success,
        ...details,
        timestamp: new Date().toISOString()
      }
    );
  }

  /**
   * Log authorization failure
   */
  async logAuthorizationFailure(userId, resource, action, details = {}) {
    return auditLogger.logSecurityEvent('authorization_failure', userId, {
      actorType: 'user',
      severity: 'medium',
      resource,
      action,
      ...details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log rate limit violation
   */
  async logRateLimitViolation(userId, endpoint, details = {}) {
    return auditLogger.logSecurityEvent('rate_limit_exceeded', userId || 'anonymous', {
      actorType: userId ? 'user' : 'anonymous',
      severity: 'medium',
      endpoint,
      ...details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log CSRF token failure
   */
  async logCSRFFailure(userId, endpoint, details = {}) {
    return auditLogger.logSecurityEvent('csrf_token_invalid', userId || 'anonymous', {
      actorType: userId ? 'user' : 'anonymous',
      severity: 'high',
      endpoint,
      ...details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log suspicious activity
   */
  async logSuspiciousActivity(userId, activityType, details = {}) {
    return auditLogger.logSecurityEvent('suspicious_activity', userId || 'anonymous', {
      actorType: userId ? 'user' : 'anonymous',
      severity: 'high',
      activityType,
      ...details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log password change
   */
  async logPasswordChange(userId, details = {}) {
    return auditLogger.logSecurityEvent('password_changed', userId, {
      actorType: 'user',
      severity: 'medium',
      ...details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log account deletion
   */
  async logAccountDeletion(userId, details = {}) {
    return auditLogger.logSecurityEvent('account_deleted', userId, {
      actorType: 'user',
      severity: 'high',
      ...details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get security events for a user
   */
  async getUserSecurityEvents(userId, timeRange = '30d') {
    // This would query the audit log for security events
    // Implementation depends on your audit log structure
    return auditLogger.getProjectAuditLog('global', {
      actor: userId,
      event: 'security',
      limit: 100
    });
  }

  /**
   * Get security statistics
   */
  async getSecurityStats(timeRange = '24h') {
    const stats = await auditLogger.getAuditStats('global', timeRange);
    
    return {
      totalSecurityEvents: stats.securityEvents || 0,
      authFailures: stats.eventsByType?.auth_failure || 0,
      rateLimitViolations: stats.eventsByType?.rate_limit_exceeded || 0,
      csrfFailures: stats.eventsByType?.csrf_token_invalid || 0,
      suspiciousActivities: stats.eventsByType?.suspicious_activity || 0,
      timeRange
    };
  }
}

// Create singleton instance
const securityAuditLogger = new SecurityAuditLogger();

module.exports = securityAuditLogger;
