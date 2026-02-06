const { ScanCommand, DeleteCommand, BatchWriteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLES } = require('../models/db');
const structuredLogger = require('./structured-logger');

class LogRetentionService {
  constructor() {
    this.retentionPolicies = {
      default: 90, // days
      security: 365, // days - keep security events longer
      cost: 1095, // days - keep cost events for 3 years
      audit: 2555, // days - keep audit events for 7 years
      
      // GDPR-specific retention policies
      gdpr_consent: 2555, // 7 years - legal requirement for consent records
      gdpr_pii_detection: 365, // 1 year - PII detection logs
      gdpr_data_processing: 1095, // 3 years - data processing logs
      gdpr_audit: 2555, // 7 years - GDPR audit trails
      gdpr_user_requests: 2555, // 7 years - user rights requests
      gdpr_anonymization: 2555 // 7 years - anonymization records (permanent)
    };
  }

  /**
   * Get retention policy for event type
   */
  getRetentionPolicy(eventType) {
    return this.retentionPolicies[eventType] || this.retentionPolicies.default;
  }

  /**
   * Clean up expired audit logs
   */
  async cleanupExpiredLogs() {
    try {
      structuredLogger.info('Starting audit log cleanup');
      
      const now = Math.floor(Date.now() / 1000); // Current timestamp in seconds
      let deletedCount = 0;
      let lastEvaluatedKey = null;

      do {
        // Scan for expired items
        const scanParams = {
          TableName: TABLES.AUDIT_LOGS,
          FilterExpression: 'attribute_exists(#ttl) AND #ttl < :now',
          ExpressionAttributeNames: {
            '#ttl': 'ttl'
          },
          ExpressionAttributeValues: {
            ':now': now
          },
          Limit: 100 // Process in batches
        };

        if (lastEvaluatedKey) {
          scanParams.ExclusiveStartKey = lastEvaluatedKey;
        }

        const result = await docClient.send(new ScanCommand(scanParams));
        
        if (result.Items && result.Items.length > 0) {
          // Delete expired items in batches
          await this.deleteItemsBatch(result.Items);
          deletedCount += result.Items.length;
        }

        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      structuredLogger.info('Audit log cleanup completed', {
        deletedCount
      });

      return deletedCount;
    } catch (error) {
      structuredLogger.error('Failed to cleanup expired logs', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete items in batch
   */
  async deleteItemsBatch(items) {
    const deleteRequests = items.map(item => ({
      DeleteRequest: {
        Key: {
          PK: item.PK,
          SK: item.SK
        }
      }
    }));

    // Split into chunks of 25 (DynamoDB batch limit)
    const chunks = this.chunkArray(deleteRequests, 25);

    for (const chunk of chunks) {
      await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [TABLES.AUDIT_LOGS]: chunk
        }
      }));
    }
  }

  /**
   * Split array into chunks
   */
  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Delete all logs for a specific project (GDPR compliance)
   */
  async deleteProjectLogs(projectId, reason = 'user_request') {
    try {
      structuredLogger.info('Deleting project logs', {
        projectId,
        reason
      });

      let deletedCount = 0;
      let lastEvaluatedKey = null;

      do {
        // Query all logs for the project
        const queryParams = {
          TableName: TABLES.AUDIT_LOGS,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: {
            ':pk': `audit#${projectId}`
          },
          Limit: 100
        };

        if (lastEvaluatedKey) {
          queryParams.ExclusiveStartKey = lastEvaluatedKey;
        }

        const result = await docClient.send(new QueryCommand(queryParams));
        
        if (result.Items && result.Items.length > 0) {
          await this.deleteItemsBatch(result.Items);
          deletedCount += result.Items.length;
        }

        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      // Log the deletion for audit purposes
      await this.logDataDeletion(projectId, deletedCount, reason);

      structuredLogger.info('Project logs deleted', {
        projectId,
        deletedCount,
        reason
      });

      return deletedCount;
    } catch (error) {
      structuredLogger.error('Failed to delete project logs', {
        projectId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete logs for a specific user (GDPR compliance)
   */
  async deleteUserLogs(userId, reason = 'user_request') {
    try {
      structuredLogger.info('Deleting user logs', {
        userId,
        reason
      });

      let deletedCount = 0;
      let lastEvaluatedKey = null;

      do {
        // Scan for logs by this user
        const scanParams = {
          TableName: TABLES.AUDIT_LOGS,
          FilterExpression: 'actor = :userId',
          ExpressionAttributeValues: {
            ':userId': userId
          },
          Limit: 100
        };

        if (lastEvaluatedKey) {
          scanParams.ExclusiveStartKey = lastEvaluatedKey;
        }

        const result = await docClient.send(new ScanCommand(scanParams));
        
        if (result.Items && result.Items.length > 0) {
          await this.deleteItemsBatch(result.Items);
          deletedCount += result.Items.length;
        }

        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      // Log the deletion for audit purposes
      await this.logDataDeletion(`user:${userId}`, deletedCount, reason);

      structuredLogger.info('User logs deleted', {
        userId,
        deletedCount,
        reason
      });

      return deletedCount;
    } catch (error) {
      structuredLogger.error('Failed to delete user logs', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Log data deletion for compliance
   */
  async logDataDeletion(subject, recordCount, reason) {
    const auditLogger = require('./audit-logger');
    
    await auditLogger.logSystemEvent('data_deletion', 'gdpr_compliance', {
      subject,
      recordCount,
      reason,
      timestamp: new Date().toISOString(),
      retentionPolicy: 'permanent' // Keep deletion records permanently
    });
  }

  /**
   * Export logs for a project (GDPR data portability)
   */
  async exportProjectLogs(projectId, format = 'json') {
    try {
      structuredLogger.info('Exporting project logs', {
        projectId,
        format
      });

      const logs = [];
      let lastEvaluatedKey = null;

      do {
        const queryParams = {
          TableName: TABLES.AUDIT_LOGS,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: {
            ':pk': `audit#${projectId}`
          },
          Limit: 1000
        };

        if (lastEvaluatedKey) {
          queryParams.ExclusiveStartKey = lastEvaluatedKey;
        }

        const result = await docClient.send(new QueryCommand(queryParams));
        
        if (result.Items && result.Items.length > 0) {
          logs.push(...result.Items);
        }

        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      // Remove internal DynamoDB fields
      const cleanedLogs = logs.map(log => {
        const { PK, SK, ttl, ...cleanLog } = log;
        return cleanLog;
      });

      if (format === 'csv') {
        return this.convertToCSV(cleanedLogs);
      }

      return JSON.stringify(cleanedLogs, null, 2);
    } catch (error) {
      structuredLogger.error('Failed to export project logs', {
        projectId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Convert logs to CSV format
   */
  convertToCSV(logs) {
    if (logs.length === 0) return '';

    const headers = Object.keys(logs[0]);
    const csvRows = [headers.join(',')];

    for (const log of logs) {
      const values = headers.map(header => {
        const value = log[header];
        if (typeof value === 'object') {
          return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        }
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
  }

  /**
   * Get retention statistics
   */
  async getRetentionStats() {
    try {
      const now = Math.floor(Date.now() / 1000);
      const stats = {
        totalRecords: 0,
        expiredRecords: 0,
        recordsByAge: {
          '1d': 0,
          '7d': 0,
          '30d': 0,
          '90d': 0,
          'older': 0
        }
      };

      let lastEvaluatedKey = null;

      do {
        const scanParams = {
          TableName: TABLES.AUDIT_LOGS,
          ProjectionExpression: 'timestamp, #ttl',
          ExpressionAttributeNames: {
            '#ttl': 'ttl'
          },
          Limit: 1000
        };

        if (lastEvaluatedKey) {
          scanParams.ExclusiveStartKey = lastEvaluatedKey;
        }

        const result = await docClient.send(new ScanCommand(scanParams));
        
        if (result.Items && result.Items.length > 0) {
          stats.totalRecords += result.Items.length;

          for (const item of result.Items) {
            if (item.ttl && item.ttl < now) {
              stats.expiredRecords++;
            }

            if (item.timestamp) {
              const age = now - Math.floor(new Date(item.timestamp).getTime() / 1000);
              const days = age / (24 * 60 * 60);

              if (days <= 1) stats.recordsByAge['1d']++;
              else if (days <= 7) stats.recordsByAge['7d']++;
              else if (days <= 30) stats.recordsByAge['30d']++;
              else if (days <= 90) stats.recordsByAge['90d']++;
              else stats.recordsByAge['older']++;
            }
          }
        }

        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      return stats;
    } catch (error) {
      structuredLogger.error('Failed to get retention stats', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Clean up GDPR-related logs based on specific retention policies
   */
  async cleanupGDPRLogs() {
    try {
      structuredLogger.info('Starting GDPR log cleanup');
      
      const now = Math.floor(Date.now() / 1000);
      let totalDeleted = 0;
      
      // Clean up different types of GDPR logs
      const gdprLogTypes = [
        'pii_detection',
        'consent_tracking',
        'data_processing',
        'gdpr_access_request',
        'gdpr_erasure_request',
        'gdpr_portability_request'
      ];

      for (const logType of gdprLogTypes) {
        const deletedCount = await this.cleanupLogsByType(logType, now);
        totalDeleted += deletedCount;
        
        structuredLogger.info(`Cleaned up ${logType} logs`, {
          deletedCount,
          logType
        });
      }

      // Log GDPR cleanup completion
      const auditLogger = require('./audit-logger');
      await auditLogger.logSystemEvent('gdpr_log_cleanup', 'data_governance', {
        totalDeleted,
        cleanupDate: new Date().toISOString(),
        retentionPolicy: 'gdpr_audit'
      });

      structuredLogger.info('GDPR log cleanup completed', {
        totalDeleted
      });

      return totalDeleted;
    } catch (error) {
      structuredLogger.error('Failed to cleanup GDPR logs', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Clean up logs by specific type
   */
  async cleanupLogsByType(logType, currentTimestamp) {
    let deletedCount = 0;
    let lastEvaluatedKey = null;

    do {
      const scanParams = {
        TableName: TABLES.AUDIT_LOGS,
        FilterExpression: 'attribute_exists(#ttl) AND #ttl < :now AND contains(#event, :logType)',
        ExpressionAttributeNames: {
          '#ttl': 'ttl',
          '#event': 'event'
        },
        ExpressionAttributeValues: {
          ':now': currentTimestamp,
          ':logType': logType
        },
        Limit: 100
      };

      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }

      const result = await docClient.send(new ScanCommand(scanParams));
      
      if (result.Items && result.Items.length > 0) {
        await this.deleteItemsBatch(result.Items);
        deletedCount += result.Items.length;
      }

      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return deletedCount;
  }

  /**
   * Anonymize user data in logs instead of deleting (for legal compliance)
   */
  async anonymizeUserDataInLogs(userId, reason = 'gdpr_erasure') {
    try {
      structuredLogger.info('Anonymizing user data in logs', {
        userId,
        reason
      });

      const crypto = require('crypto');
      const anonymizedId = 'anon_' + crypto.createHash('sha256')
        .update(userId + process.env.ANONYMIZATION_SALT || 'default_salt')
        .digest('hex').substring(0, 16);

      let anonymizedCount = 0;
      let lastEvaluatedKey = null;

      do {
        // Find logs containing the user ID
        const scanParams = {
          TableName: TABLES.AUDIT_LOGS,
          FilterExpression: 'contains(actor, :userId) OR contains(details, :userId)',
          ExpressionAttributeValues: {
            ':userId': userId
          },
          Limit: 100
        };

        if (lastEvaluatedKey) {
          scanParams.ExclusiveStartKey = lastEvaluatedKey;
        }

        const result = await docClient.send(new ScanCommand(scanParams));
        
        if (result.Items && result.Items.length > 0) {
          // Anonymize each log entry
          for (const item of result.Items) {
            const anonymizedItem = this.anonymizeLogItem(item, userId, anonymizedId);
            
            // Update the item with anonymized data
            await docClient.send(new PutCommand({
              TableName: TABLES.AUDIT_LOGS,
              Item: anonymizedItem
            }));
            
            anonymizedCount++;
          }
        }

        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      // Log the anonymization for audit purposes
      await this.logDataAnonymization(userId, anonymizedId, anonymizedCount, reason);

      structuredLogger.info('User data anonymized in logs', {
        userId,
        anonymizedId,
        anonymizedCount,
        reason
      });

      return { anonymizedId, anonymizedCount };
    } catch (error) {
      structuredLogger.error('Failed to anonymize user data in logs', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Anonymize a single log item
   */
  anonymizeLogItem(logItem, originalUserId, anonymizedId) {
    const anonymizedItem = { ...logItem };
    
    // Replace user ID in actor field
    if (anonymizedItem.actor === originalUserId) {
      anonymizedItem.actor = anonymizedId;
    }
    
    // Replace user ID in details (recursively)
    if (anonymizedItem.details) {
      anonymizedItem.details = this.anonymizeObjectData(anonymizedItem.details, originalUserId, anonymizedId);
    }
    
    // Replace user ID in metadata
    if (anonymizedItem.metadata) {
      anonymizedItem.metadata = this.anonymizeObjectData(anonymizedItem.metadata, originalUserId, anonymizedId);
    }
    
    // Add anonymization marker
    anonymizedItem.anonymized = true;
    anonymizedItem.anonymizedAt = new Date().toISOString();
    anonymizedItem.originalUserIdHash = require('crypto')
      .createHash('sha256')
      .update(originalUserId)
      .digest('hex');
    
    return anonymizedItem;
  }

  /**
   * Recursively anonymize object data
   */
  anonymizeObjectData(obj, originalUserId, anonymizedId) {
    if (typeof obj === 'string') {
      return obj.replace(new RegExp(originalUserId, 'g'), anonymizedId);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.anonymizeObjectData(item, originalUserId, anonymizedId));
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const anonymizedObj = {};
      Object.keys(obj).forEach(key => {
        anonymizedObj[key] = this.anonymizeObjectData(obj[key], originalUserId, anonymizedId);
      });
      return anonymizedObj;
    }
    
    return obj;
  }

  /**
   * Log data anonymization for compliance
   */
  async logDataAnonymization(originalUserId, anonymizedId, recordCount, reason) {
    const auditLogger = require('./audit-logger');
    
    await auditLogger.logSystemEvent('data_anonymization', 'gdpr_compliance', {
      originalUserIdHash: require('crypto').createHash('sha256').update(originalUserId).digest('hex'),
      anonymizedId,
      recordCount,
      reason,
      timestamp: new Date().toISOString(),
      retentionPolicy: 'permanent' // Keep anonymization records permanently
    });
  }

  /**
   * Get GDPR compliance report
   */
  async getGDPRComplianceReport() {
    try {
      const now = Math.floor(Date.now() / 1000);
      const report = {
        totalRecords: 0,
        gdprRecords: {
          consentRecords: 0,
          piiDetectionLogs: 0,
          dataProcessingLogs: 0,
          userRequests: 0,
          anonymizationRecords: 0
        },
        expiredRecords: 0,
        retentionCompliance: {
          compliant: 0,
          nonCompliant: 0
        },
        anonymizedRecords: 0
      };

      let lastEvaluatedKey = null;

      do {
        const scanParams = {
          TableName: TABLES.AUDIT_LOGS,
          ProjectionExpression: '#event, #ttl, anonymized, #timestamp',
          ExpressionAttributeNames: {
            '#event': 'event',
            '#ttl': 'ttl',
            '#timestamp': 'timestamp'
          },
          Limit: 1000
        };

        if (lastEvaluatedKey) {
          scanParams.ExclusiveStartKey = lastEvaluatedKey;
        }

        const result = await docClient.send(new ScanCommand(scanParams));
        
        if (result.Items && result.Items.length > 0) {
          report.totalRecords += result.Items.length;

          for (const item of result.Items) {
            // Count GDPR-specific records
            if (item.event) {
              if (item.event.includes('consent')) report.gdprRecords.consentRecords++;
              if (item.event.includes('pii_detection')) report.gdprRecords.piiDetectionLogs++;
              if (item.event.includes('data_processing')) report.gdprRecords.dataProcessingLogs++;
              if (item.event.includes('gdpr_')) report.gdprRecords.userRequests++;
              if (item.event.includes('anonymization')) report.gdprRecords.anonymizationRecords++;
            }

            // Count expired records
            if (item.ttl && item.ttl < now) {
              report.expiredRecords++;
              report.retentionCompliance.nonCompliant++;
            } else {
              report.retentionCompliance.compliant++;
            }

            // Count anonymized records
            if (item.anonymized) {
              report.anonymizedRecords++;
            }
          }
        }

        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      return report;
    } catch (error) {
      structuredLogger.error('Failed to generate GDPR compliance report', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Schedule automatic cleanup (to be called by cron job)
   */
  async scheduleCleanup() {
    try {
      const deletedCount = await this.cleanupExpiredLogs();
      const gdprDeletedCount = await this.cleanupGDPRLogs();
      
      // Log cleanup results
      structuredLogger.info('Scheduled cleanup completed', {
        deletedCount,
        gdprDeletedCount,
        totalDeleted: deletedCount + gdprDeletedCount,
        nextCleanup: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      });

      return { 
        success: true, 
        deletedCount, 
        gdprDeletedCount,
        totalDeleted: deletedCount + gdprDeletedCount
      };
    } catch (error) {
      structuredLogger.error('Scheduled cleanup failed', {
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }
}

// Create singleton instance
const logRetentionService = new LogRetentionService();

module.exports = logRetentionService;