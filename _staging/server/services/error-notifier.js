/**
 * Error Notification Service
 * Sends alerts for critical errors via email and optional Slack integration
 */

const structuredLogger = require('./structured-logger');
const emailNotifications = require('./email-notifications');

class ErrorNotifier {
  constructor() {
    this.enabled = process.env.ERROR_NOTIFICATIONS_ENABLED !== 'false';
    this.emailEnabled = process.env.EMAIL_NOTIFICATIONS_ENABLED !== 'false';
    this.slackEnabled = process.env.SLACK_NOTIFICATIONS_ENABLED === 'true';
    this.slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
    
    // Error severity thresholds
    this.severityLevels = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3
    };
    
    // Minimum severity to trigger notifications
    this.minSeverity = process.env.ERROR_NOTIFICATION_MIN_SEVERITY || 'high';
    
    // Rate limiting to prevent notification spam
    this.notificationCache = new Map();
    this.rateLimitWindow = 5 * 60 * 1000; // 5 minutes
    this.maxNotificationsPerWindow = 10;
    
    structuredLogger.info('Error Notifier initialized', {
      enabled: this.enabled,
      emailEnabled: this.emailEnabled,
      slackEnabled: this.slackEnabled,
      minSeverity: this.minSeverity
    });
  }

  /**
   * Send error notification
   */
  async notifyError(error, context = {}) {
    if (!this.enabled) {
      return { sent: false, reason: 'notifications_disabled' };
    }

    const severity = context.severity || 'medium';
    
    // Check if severity meets threshold
    if (!this.shouldNotify(severity)) {
      return { sent: false, reason: 'below_severity_threshold' };
    }

    // Check rate limiting
    if (this.isRateLimited(error, context)) {
      structuredLogger.warn('Error notification rate limited', {
        error: error.message,
        context
      });
      return { sent: false, reason: 'rate_limited' };
    }

    const notification = this.buildNotification(error, context);
    const results = {
      email: null,
      slack: null
    };

    // Send email notification
    if (this.emailEnabled) {
      try {
        results.email = await this.sendEmailNotification(notification);
      } catch (emailError) {
        structuredLogger.error('Failed to send email notification', {
          error: emailError.message,
          originalError: error.message
        });
      }
    }

    // Send Slack notification
    if (this.slackEnabled && this.slackWebhookUrl) {
      try {
        results.slack = await this.sendSlackNotification(notification);
      } catch (slackError) {
        structuredLogger.error('Failed to send Slack notification', {
          error: slackError.message,
          originalError: error.message
        });
      }
    }

    // Update rate limiting cache
    this.updateRateLimitCache(error, context);

    structuredLogger.info('Error notification sent', {
      severity,
      email: results.email?.sent || false,
      slack: results.slack?.sent || false
    });

    return {
      sent: true,
      results
    };
  }

  /**
   * Check if error severity meets notification threshold
   */
  shouldNotify(severity) {
    const errorLevel = this.severityLevels[severity] ?? this.severityLevels.medium;
    const minLevel = this.severityLevels[this.minSeverity] ?? this.severityLevels.high;
    
    return errorLevel <= minLevel;
  }

  /**
   * Check if error notification is rate limited
   */
  isRateLimited(error, context) {
    const key = this.getRateLimitKey(error, context);
    const now = Date.now();
    
    const cached = this.notificationCache.get(key);
    
    if (!cached) {
      return false;
    }

    // Clean up old entries
    cached.timestamps = cached.timestamps.filter(
      ts => now - ts < this.rateLimitWindow
    );

    return cached.timestamps.length >= this.maxNotificationsPerWindow;
  }

  /**
   * Update rate limiting cache
   */
  updateRateLimitCache(error, context) {
    const key = this.getRateLimitKey(error, context);
    const now = Date.now();
    
    const cached = this.notificationCache.get(key) || { timestamps: [] };
    cached.timestamps.push(now);
    
    // Keep only recent timestamps
    cached.timestamps = cached.timestamps.filter(
      ts => now - ts < this.rateLimitWindow
    );
    
    this.notificationCache.set(key, cached);
  }

  /**
   * Generate rate limit key for error
   */
  getRateLimitKey(error, context) {
    const errorType = error.name || 'UnknownError';
    const operation = context.operation || 'unknown';
    const userId = context.userId || 'system';
    
    return `${errorType}:${operation}:${userId}`;
  }

  /**
   * Build notification object
   */
  buildNotification(error, context) {
    return {
      timestamp: new Date().toISOString(),
      severity: context.severity || 'medium',
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code
      },
      context: {
        operation: context.operation,
        userId: context.userId,
        projectId: context.projectId,
        buildId: context.buildId,
        correlationId: context.correlationId,
        environment: process.env.NODE_ENV,
        service: 'ai-app-builder',
        ...context.additionalInfo
      }
    };
  }

  /**
   * Send email notification
   */
  async sendEmailNotification(notification) {
    const adminEmails = this.getAdminEmails();
    
    if (!adminEmails || adminEmails.length === 0) {
      return { sent: false, reason: 'no_admin_emails' };
    }

    const subject = `[${notification.severity.toUpperCase()}] Error Alert: ${notification.error.name}`;
    
    const body = this.formatEmailBody(notification);

    try {
      await emailNotifications.sendEmail({
        to: adminEmails,
        subject,
        html: body
      });

      return { sent: true, recipients: adminEmails.length };
    } catch (error) {
      structuredLogger.error('Email notification failed', {
        error: error.message
      });
      return { sent: false, error: error.message };
    }
  }

  /**
   * Format email body
   */
  formatEmailBody(notification) {
    const { error, context, severity, timestamp } = notification;
    
    return `
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
          <div style="background-color: ${this.getSeverityColor(severity)}; color: white; padding: 20px; border-radius: 5px 5px 0 0;">
            <h1 style="margin: 0;">${severity.toUpperCase()} Error Alert</h1>
            <p style="margin: 5px 0 0 0;">${timestamp}</p>
          </div>
          
          <div style="background-color: #f5f5f5; padding: 20px; border: 1px solid #ddd; border-top: none;">
            <h2 style="color: #333; margin-top: 0;">Error Details</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; font-weight: bold; width: 150px;">Error Type:</td>
                <td style="padding: 8px;">${error.name}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Message:</td>
                <td style="padding: 8px;">${error.message}</td>
              </tr>
              ${error.code ? `
              <tr>
                <td style="padding: 8px; font-weight: bold;">Error Code:</td>
                <td style="padding: 8px;">${error.code}</td>
              </tr>
              ` : ''}
            </table>

            <h2 style="color: #333;">Context</h2>
            <table style="width: 100%; border-collapse: collapse;">
              ${context.operation ? `
              <tr>
                <td style="padding: 8px; font-weight: bold; width: 150px;">Operation:</td>
                <td style="padding: 8px;">${context.operation}</td>
              </tr>
              ` : ''}
              ${context.userId ? `
              <tr>
                <td style="padding: 8px; font-weight: bold;">User ID:</td>
                <td style="padding: 8px;">${context.userId}</td>
              </tr>
              ` : ''}
              ${context.projectId ? `
              <tr>
                <td style="padding: 8px; font-weight: bold;">Project ID:</td>
                <td style="padding: 8px;">${context.projectId}</td>
              </tr>
              ` : ''}
              ${context.buildId ? `
              <tr>
                <td style="padding: 8px; font-weight: bold;">Build ID:</td>
                <td style="padding: 8px;">${context.buildId}</td>
              </tr>
              ` : ''}
              ${context.correlationId ? `
              <tr>
                <td style="padding: 8px; font-weight: bold;">Correlation ID:</td>
                <td style="padding: 8px;">${context.correlationId}</td>
              </tr>
              ` : ''}
              <tr>
                <td style="padding: 8px; font-weight: bold;">Environment:</td>
                <td style="padding: 8px;">${context.environment}</td>
              </tr>
            </table>

            ${error.stack ? `
            <h2 style="color: #333;">Stack Trace</h2>
            <pre style="background-color: #fff; padding: 15px; border: 1px solid #ddd; overflow-x: auto; font-size: 12px;">${error.stack}</pre>
            ` : ''}
          </div>
          
          <div style="background-color: #333; color: white; padding: 15px; text-align: center; border-radius: 0 0 5px 5px;">
            <p style="margin: 0;">AI App Builder - Automated Error Notification</p>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Get severity color for email
   */
  getSeverityColor(severity) {
    const colors = {
      critical: '#d32f2f',
      high: '#f57c00',
      medium: '#fbc02d',
      low: '#388e3c'
    };
    
    return colors[severity] || colors.medium;
  }

  /**
   * Send Slack notification
   */
  async sendSlackNotification(notification) {
    if (!this.slackWebhookUrl) {
      return { sent: false, reason: 'no_webhook_url' };
    }

    const payload = this.formatSlackPayload(notification);

    try {
      const response = await fetch(this.slackWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.status}`);
      }

      return { sent: true };
    } catch (error) {
      structuredLogger.error('Slack notification failed', {
        error: error.message
      });
      return { sent: false, error: error.message };
    }
  }

  /**
   * Format Slack payload
   */
  formatSlackPayload(notification) {
    const { error, context, severity, timestamp } = notification;
    
    const emoji = {
      critical: ':rotating_light:',
      high: ':warning:',
      medium: ':exclamation:',
      low: ':information_source:'
    };

    const color = {
      critical: 'danger',
      high: 'warning',
      medium: '#fbc02d',
      low: 'good'
    };

    return {
      text: `${emoji[severity] || ':exclamation:'} *${severity.toUpperCase()} Error Alert*`,
      attachments: [
        {
          color: color[severity] || color.medium,
          fields: [
            {
              title: 'Error Type',
              value: error.name,
              short: true
            },
            {
              title: 'Timestamp',
              value: timestamp,
              short: true
            },
            {
              title: 'Message',
              value: error.message,
              short: false
            },
            ...(context.operation ? [{
              title: 'Operation',
              value: context.operation,
              short: true
            }] : []),
            ...(context.userId ? [{
              title: 'User ID',
              value: context.userId,
              short: true
            }] : []),
            ...(context.projectId ? [{
              title: 'Project ID',
              value: context.projectId,
              short: true
            }] : []),
            ...(context.correlationId ? [{
              title: 'Correlation ID',
              value: context.correlationId,
              short: true
            }] : []),
            {
              title: 'Environment',
              value: context.environment,
              short: true
            }
          ],
          footer: 'AI App Builder',
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    };
  }

  /**
   * Get admin email addresses
   */
  getAdminEmails() {
    const emails = process.env.ADMIN_EMAILS;
    
    if (!emails) {
      return [];
    }

    return emails.split(',').map(email => email.trim()).filter(Boolean);
  }

  /**
   * Notify critical error (convenience method)
   */
  async notifyCritical(error, context = {}) {
    return this.notifyError(error, { ...context, severity: 'critical' });
  }

  /**
   * Notify high severity error (convenience method)
   */
  async notifyHigh(error, context = {}) {
    return this.notifyError(error, { ...context, severity: 'high' });
  }

  /**
   * Notify medium severity error (convenience method)
   */
  async notifyMedium(error, context = {}) {
    return this.notifyError(error, { ...context, severity: 'medium' });
  }

  /**
   * Clean up old cache entries
   */
  cleanup() {
    const now = Date.now();
    
    for (const [key, cached] of this.notificationCache.entries()) {
      cached.timestamps = cached.timestamps.filter(
        ts => now - ts < this.rateLimitWindow
      );
      
      if (cached.timestamps.length === 0) {
        this.notificationCache.delete(key);
      }
    }
  }
}

// Create singleton instance
const errorNotifier = new ErrorNotifier();

// Schedule periodic cleanup
setInterval(() => {
  errorNotifier.cleanup();
}, 60 * 1000); // Clean up every minute

module.exports = errorNotifier;
