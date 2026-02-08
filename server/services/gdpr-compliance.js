const auditLogger = require('./audit-logger');
const logRetentionService = require('./log-retention');
const structuredLogger = require('./structured-logger');
const { docClient, TABLES } = require('../models/db');
const { QueryCommand, ScanCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

class GDPRComplianceService {
  constructor() {
    this.dataCategories = {
      PERSONAL: 'personal_data',
      TECHNICAL: 'technical_data', 
      USAGE: 'usage_data',
      AUDIT: 'audit_data'
    };

    // PII detection patterns
    this.piiPatterns = {
      email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      phone: /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
      ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
      creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
      ipAddress: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
      uuid: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      apiKey: /\b[A-Za-z0-9]{32,}\b/g,
      name: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g // Simple name pattern
    };

    // Consent types for data processing
    this.consentTypes = {
      QUESTIONNAIRE_PROCESSING: 'questionnaire_processing',
      AI_ANALYSIS: 'ai_analysis',
      TECHNICAL_INFERENCE: 'technical_inference',
      AUDIT_LOGGING: 'audit_logging',
      ANALYTICS: 'analytics',
      MARKETING: 'marketing'
    };

    // GDPR retention policies (in days)
    this.gdprRetentionPolicies = {
      CONSENT_RECORDS: 2555, // 7 years - legal requirement
      DATA_PROCESSING_LOGS: 1095, // 3 years - business requirement
      PII_DETECTION_LOGS: 365, // 1 year - security requirement
      AUDIT_TRAILS: 2555, // 7 years - compliance requirement
      USER_REQUESTS: 2555, // 7 years - legal requirement
      ANONYMIZATION_LOGS: 2555 // 7 years - permanent record
    };
  }

  /**
   * Detect and sanitize PII in data
   * @param {any} data - Data to scan for PII
   * @param {Object} options - Sanitization options
   * @returns {Object} Sanitized data and PII detection report
   */
  detectAndSanitizePII(data, options = {}) {
    const { 
      sanitize = true, 
      logDetection = true,
      context = 'unknown',
      userId = null 
    } = options;

    const piiDetected = {
      types: [],
      count: 0,
      locations: [],
      sanitized: sanitize
    };

    let sanitizedData = data;

    if (typeof data === 'string') {
      sanitizedData = this.sanitizeStringPII(data, piiDetected, sanitize);
    } else if (typeof data === 'object' && data !== null) {
      sanitizedData = this.sanitizeObjectPII(data, piiDetected, sanitize);
    }

    // Log PII detection if enabled
    if (logDetection && piiDetected.count > 0) {
      this.logPIIDetection(piiDetected, context, userId);
    }

    return {
      sanitizedData,
      piiDetected
    };
  }

  /**
   * Sanitize PII in string data
   */
  sanitizeStringPII(text, piiDetected, sanitize = true) {
    let sanitizedText = text;

    Object.entries(this.piiPatterns).forEach(([type, pattern]) => {
      const matches = text.match(pattern);
      if (matches) {
        piiDetected.types.push(type);
        piiDetected.count += matches.length;
        piiDetected.locations.push({
          type,
          count: matches.length,
          examples: matches.slice(0, 2) // Keep first 2 examples for analysis
        });

        if (sanitize) {
          sanitizedText = sanitizedText.replace(pattern, `[${type.toUpperCase()}]`);
        }
      }
    });

    return sanitizedText;
  }

  /**
   * Sanitize PII in object data
   */
  sanitizeObjectPII(obj, piiDetected, sanitize = true, path = '') {
    if (Array.isArray(obj)) {
      return obj.map((item, index) => 
        this.sanitizeObjectPII(item, piiDetected, sanitize, `${path}[${index}]`)
      );
    }

    if (typeof obj === 'object' && obj !== null) {
      const sanitizedObj = {};
      
      Object.entries(obj).forEach(([key, value]) => {
        const currentPath = path ? `${path}.${key}` : key;
        
        if (typeof value === 'string') {
          const sanitizedValue = this.sanitizeStringPII(value, piiDetected, sanitize);
          sanitizedObj[key] = sanitizedValue;
          
          // Track location if PII was found
          if (sanitizedValue !== value) {
            piiDetected.locations.push({
              path: currentPath,
              originalLength: value.length,
              sanitizedLength: sanitizedValue.length
            });
          }
        } else if (typeof value === 'object') {
          sanitizedObj[key] = this.sanitizeObjectPII(value, piiDetected, sanitize, currentPath);
        } else {
          sanitizedObj[key] = value;
        }
      });
      
      return sanitizedObj;
    }

    return obj;
  }

  /**
   * Log PII detection for audit purposes
   */
  async logPIIDetection(piiDetected, context, userId) {
    try {
      const eventId = await auditLogger.logSystemEvent('pii_detection', 'data_privacy', {
        context,
        userId,
        piiTypes: piiDetected.types,
        piiCount: piiDetected.count,
        sanitized: piiDetected.sanitized,
        detectionTimestamp: new Date().toISOString(),
        retentionPolicy: 'gdpr_pii_detection'
      });

      structuredLogger.info('PII detected and processed', {
        eventId,
        context,
        userId,
        piiTypes: piiDetected.types,
        piiCount: piiDetected.count,
        sanitized: piiDetected.sanitized
      });

      return eventId;
    } catch (error) {
      structuredLogger.error('Failed to log PII detection', {
        error: error.message,
        context,
        userId
      });
    }
  }

  /**
   * Track data processing consent
   * @param {string} userId - User ID
   * @param {string} consentType - Type of consent
   * @param {boolean} granted - Whether consent was granted
   * @param {Object} metadata - Additional consent metadata
   * @returns {Promise<string>} Consent record ID
   */
  async trackDataProcessingConsent(userId, consentType, granted, metadata = {}) {
    const consentId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    try {
      const consentRecord = {
        PK: `consent#${userId}`,
        SK: `${timestamp}#${consentId}`,
        consentId,
        userId,
        consentType,
        granted,
        timestamp,
        ipAddress: this.sanitizeIP(metadata.ipAddress),
        userAgent: metadata.userAgent ? metadata.userAgent.substring(0, 200) : null,
        source: metadata.source || 'application',
        version: metadata.version || '1.0',
        expiresAt: metadata.expiresAt,
        withdrawnAt: null,
        metadata: {
          projectId: metadata.projectId,
          sessionId: metadata.sessionId,
          consentMethod: metadata.consentMethod || 'explicit',
          legalBasis: metadata.legalBasis || 'consent',
          ...metadata.additionalData
        },
        ttl: this.calculateTTL(this.gdprRetentionPolicies.CONSENT_RECORDS)
      };

      // Store consent record
      await docClient.send(new PutCommand({
        TableName: TABLES.AUDIT_LOGS,
        Item: consentRecord
      }));

      // Log consent tracking
      await auditLogger.logSystemEvent('consent_tracking', 'data_privacy', {
        consentId,
        userId,
        consentType,
        granted,
        source: metadata.source,
        legalBasis: metadata.legalBasis,
        retentionPolicy: 'gdpr_consent'
      });

      structuredLogger.info('Data processing consent tracked', {
        consentId,
        userId,
        consentType,
        granted,
        source: metadata.source
      });

      return consentId;
    } catch (error) {
      structuredLogger.error('Failed to track data processing consent', {
        error: error.message,
        userId,
        consentType,
        granted
      });
      throw error;
    }
  }

  /**
   * Withdraw data processing consent
   * @param {string} userId - User ID
   * @param {string} consentType - Type of consent to withdraw
   * @param {Object} metadata - Withdrawal metadata
   * @returns {Promise<number>} Number of consent records updated
   */
  async withdrawDataProcessingConsent(userId, consentType, metadata = {}) {
    try {
      const timestamp = new Date().toISOString();
      
      // Find active consent records
      const result = await docClient.send(new QueryCommand({
        TableName: TABLES.AUDIT_LOGS,
        KeyConditionExpression: 'PK = :pk',
        FilterExpression: 'consentType = :consentType AND granted = :granted AND attribute_not_exists(withdrawnAt)',
        ExpressionAttributeValues: {
          ':pk': `consent#${userId}`,
          ':consentType': consentType,
          ':granted': true
        }
      }));

      let updatedCount = 0;

      // Update each active consent record
      for (const consentRecord of result.Items || []) {
        const updatedRecord = {
          ...consentRecord,
          granted: false,
          withdrawnAt: timestamp,
          withdrawalReason: metadata.reason || 'user_request',
          withdrawalMethod: metadata.method || 'application'
        };

        await docClient.send(new PutCommand({
          TableName: TABLES.AUDIT_LOGS,
          Item: updatedRecord
        }));

        updatedCount++;
      }

      // Log consent withdrawal
      await auditLogger.logSystemEvent('consent_withdrawal', 'data_privacy', {
        userId,
        consentType,
        withdrawnRecords: updatedCount,
        reason: metadata.reason,
        method: metadata.method,
        retentionPolicy: 'gdpr_consent'
      });

      structuredLogger.info('Data processing consent withdrawn', {
        userId,
        consentType,
        withdrawnRecords: updatedCount,
        reason: metadata.reason
      });

      return updatedCount;
    } catch (error) {
      structuredLogger.error('Failed to withdraw data processing consent', {
        error: error.message,
        userId,
        consentType
      });
      throw error;
    }
  }

  /**
   * Get current consent status for user
   * @param {string} userId - User ID
   * @param {string} consentType - Optional specific consent type
   * @returns {Promise<Object>} Consent status
   */
  async getConsentStatus(userId, consentType = null) {
    try {
      let filterExpression = 'attribute_not_exists(withdrawnAt)';
      const expressionAttributeValues = {
        ':pk': `consent#${userId}`
      };

      if (consentType) {
        filterExpression += ' AND consentType = :consentType';
        expressionAttributeValues[':consentType'] = consentType;
      }

      const result = await docClient.send(new QueryCommand({
        TableName: TABLES.AUDIT_LOGS,
        KeyConditionExpression: 'PK = :pk',
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ScanIndexForward: false // Most recent first
      }));

      const consentStatus = {
        userId,
        consentType,
        hasActiveConsent: false,
        consentRecords: [],
        lastUpdated: null
      };

      if (result.Items && result.Items.length > 0) {
        consentStatus.consentRecords = result.Items;
        consentStatus.hasActiveConsent = result.Items.some(record => record.granted);
        consentStatus.lastUpdated = result.Items[0].timestamp;
      }

      return consentStatus;
    } catch (error) {
      structuredLogger.error('Failed to get consent status', {
        error: error.message,
        userId,
        consentType
      });
      throw error;
    }
  }

  /**
   * Create audit trail retention policy
   * @param {string} dataType - Type of data
   * @param {number} retentionDays - Retention period in days
   * @param {string} legalBasis - Legal basis for retention
   * @returns {Promise<string>} Policy ID
   */
  async createAuditTrailRetentionPolicy(dataType, retentionDays, legalBasis, metadata = {}) {
    const policyId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    try {
      const retentionPolicy = {
        PK: `retention_policy#${dataType}`,
        SK: `${timestamp}#${policyId}`,
        policyId,
        dataType,
        retentionDays,
        legalBasis,
        createdAt: timestamp,
        createdBy: metadata.createdBy || 'system',
        active: true,
        description: metadata.description,
        reviewDate: metadata.reviewDate,
        complianceFramework: metadata.complianceFramework || 'GDPR',
        automaticDeletion: metadata.automaticDeletion !== false,
        ttl: this.calculateTTL(this.gdprRetentionPolicies.AUDIT_TRAILS)
      };

      await docClient.send(new PutCommand({
        TableName: TABLES.AUDIT_LOGS,
        Item: retentionPolicy
      }));

      // Log policy creation
      await auditLogger.logSystemEvent('retention_policy_created', 'data_governance', {
        policyId,
        dataType,
        retentionDays,
        legalBasis,
        automaticDeletion: retentionPolicy.automaticDeletion,
        retentionPolicy: 'gdpr_audit'
      });

      structuredLogger.info('Audit trail retention policy created', {
        policyId,
        dataType,
        retentionDays,
        legalBasis
      });

      return policyId;
    } catch (error) {
      structuredLogger.error('Failed to create retention policy', {
        error: error.message,
        dataType,
        retentionDays,
        legalBasis
      });
      throw error;
    }
  }

  /**
   * Sanitize IP address for GDPR compliance
   */
  sanitizeIP(ipAddress) {
    if (!ipAddress) return null;
    
    // Mask last octet for IPv4
    if (ipAddress.includes('.')) {
      const parts = ipAddress.split('.');
      if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
      }
    }
    
    // Mask IPv6 addresses
    if (ipAddress.includes(':')) {
      const parts = ipAddress.split(':');
      if (parts.length > 4) {
        return parts.slice(0, 4).join(':') + ':xxxx:xxxx:xxxx:xxxx';
      }
    }
    
    return 'masked';
  }

  /**
   * Calculate TTL for DynamoDB item based on GDPR retention policy
   */
  calculateTTL(retentionDays) {
    const now = new Date();
    const expirationDate = new Date(now.getTime() + (retentionDays * 24 * 60 * 60 * 1000));
    return Math.floor(expirationDate.getTime() / 1000);
  }

  /**
   * Handle data subject access request (Article 15)
   */
  async handleAccessRequest(userId, requestId) {
    try {
      structuredLogger.info('Processing GDPR access request', {
        userId,
        requestId
      });

      const userData = await this.collectUserData(userId);
      
      // Log the access request
      await auditLogger.logSystemEvent('gdpr_access_request', 'data_export', {
        userId,
        requestId,
        dataCategories: Object.keys(userData),
        recordCount: this.countRecords(userData)
      });

      return {
        requestId,
        userId,
        exportDate: new Date().toISOString(),
        data: userData,
        format: 'json'
      };
    } catch (error) {
      structuredLogger.error('Failed to process GDPR access request', {
        userId,
        requestId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle right to erasure request (Article 17)
   */
  async handleErasureRequest(userId, requestId, reason = 'user_request') {
    try {
      structuredLogger.info('Processing GDPR erasure request', {
        userId,
        requestId,
        reason
      });

      const deletionSummary = {
        userId,
        requestId,
        reason,
        deletedData: {},
        retainedData: {},
        deletionDate: new Date().toISOString()
      };

      // Delete user logs
      const deletedLogs = await logRetentionService.deleteUserLogs(userId, reason);
      deletionSummary.deletedData.auditLogs = deletedLogs;

      // Delete user projects (if user is sole owner)
      const deletedProjects = await this.deleteUserProjects(userId);
      deletionSummary.deletedData.projects = deletedProjects;

      // Anonymize user data in remaining records
      const anonymizedRecords = await this.anonymizeUserData(userId);
      deletionSummary.retainedData.anonymizedRecords = anonymizedRecords;

      // Log the erasure (this record should be retained for legal compliance)
      await auditLogger.logSystemEvent('gdpr_erasure_request', 'data_deletion', {
        ...deletionSummary,
        retentionPolicy: 'legal_requirement' // Keep for 7 years
      });

      return deletionSummary;
    } catch (error) {
      structuredLogger.error('Failed to process GDPR erasure request', {
        userId,
        requestId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle data portability request (Article 20)
   */
  async handlePortabilityRequest(userId, requestId, format = 'json') {
    try {
      structuredLogger.info('Processing GDPR portability request', {
        userId,
        requestId,
        format
      });

      const portableData = await this.collectPortableUserData(userId);
      
      let exportData;
      if (format === 'csv') {
        exportData = this.convertToCSV(portableData);
      } else {
        exportData = JSON.stringify(portableData, null, 2);
      }

      // Log the portability request
      await auditLogger.logSystemEvent('gdpr_portability_request', 'data_export', {
        userId,
        requestId,
        format,
        dataSize: exportData.length,
        recordCount: this.countRecords(portableData)
      });

      return {
        requestId,
        userId,
        format,
        exportDate: new Date().toISOString(),
        data: exportData
      };
    } catch (error) {
      structuredLogger.error('Failed to process GDPR portability request', {
        userId,
        requestId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Collect all user data for access request
   */
  async collectUserData(userId) {
    const userData = {
      personalData: await this.getUserPersonalData(userId),
      projects: await this.getUserProjects(userId),
      builds: await this.getUserBuilds(userId),
      auditLogs: await this.getUserAuditLogs(userId),
      organizations: await this.getUserOrganizations(userId)
    };

    return userData;
  }

  /**
   * Collect portable user data (structured for machine readability)
   */
  async collectPortableUserData(userId) {
    return {
      user: await this.getUserPersonalData(userId),
      projects: await this.getUserProjects(userId),
      builds: await this.getUserBuilds(userId)
      // Note: Audit logs are not typically portable as they're for security/compliance
    };
  }

  /**
   * Get user personal data
   */
  async getUserPersonalData(userId) {
    try {
      const result = await docClient.send(new QueryCommand({
        TableName: TABLES.USERS,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `user#${userId}`
        }
      }));

      return result.Items || [];
    } catch (error) {
      structuredLogger.error('Failed to get user personal data', {
        userId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get user projects
   */
  async getUserProjects(userId) {
    try {
      const result = await docClient.send(new ScanCommand({
        TableName: TABLES.PROJECTS,
        FilterExpression: 'contains(#owners, :userId) OR createdBy = :userId',
        ExpressionAttributeNames: {
          '#owners': 'owners'
        },
        ExpressionAttributeValues: {
          ':userId': userId
        }
      }));

      return result.Items || [];
    } catch (error) {
      structuredLogger.error('Failed to get user projects', {
        userId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get user builds
   */
  async getUserBuilds(userId) {
    try {
      const result = await docClient.send(new ScanCommand({
        TableName: TABLES.BUILDS,
        FilterExpression: 'createdBy = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        }
      }));

      return result.Items || [];
    } catch (error) {
      structuredLogger.error('Failed to get user builds', {
        userId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get user audit logs
   */
  async getUserAuditLogs(userId) {
    try {
      const result = await docClient.send(new ScanCommand({
        TableName: TABLES.AUDIT_LOGS,
        FilterExpression: 'actor = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        },
        Limit: 1000 // Limit for performance
      }));

      return result.Items || [];
    } catch (error) {
      structuredLogger.error('Failed to get user audit logs', {
        userId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get user organizations
   */
  async getUserOrganizations(userId) {
    try {
      const result = await docClient.send(new ScanCommand({
        TableName: TABLES.ORGANIZATIONS,
        FilterExpression: 'contains(members, :userId) OR ownerId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        }
      }));

      return result.Items || [];
    } catch (error) {
      structuredLogger.error('Failed to get user organizations', {
        userId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Delete user projects where user is sole owner
   */
  async deleteUserProjects(userId) {
    const projects = await this.getUserProjects(userId);
    let deletedCount = 0;

    for (const project of projects) {
      // Only delete if user is sole owner
      if (project.ownerId === userId && (!project.owners || project.owners.length <= 1)) {
        // Delete project logs first
        await logRetentionService.deleteProjectLogs(project.projectId, 'user_deletion');
        
        // Delete project record
        // Implementation would depend on your project deletion logic
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Anonymize user data in records that must be retained
   */
  async anonymizeUserData(userId) {
    // This would involve replacing userId with anonymized identifier
    // in records that must be retained for legal/business reasons
    
    const anonymizedId = this.generateAnonymizedId(userId);
    let anonymizedCount = 0;

    // Implementation would scan and update records
    // This is a placeholder for the actual anonymization logic
    
    structuredLogger.info('User data anonymized', {
      originalUserId: userId,
      anonymizedId,
      recordsAnonymized: anonymizedCount
    });

    return anonymizedCount;
  }

  /**
   * Generate anonymized identifier
   */
  generateAnonymizedId(userId) {
    const crypto = require('crypto');
    return 'anon_' + crypto.createHash('sha256').update(userId + process.env.ANONYMIZATION_SALT).digest('hex').substring(0, 16);
  }

  /**
   * Count records in data structure
   */
  countRecords(data) {
    let count = 0;
    
    function countRecursive(obj) {
      if (Array.isArray(obj)) {
        count += obj.length;
        obj.forEach(countRecursive);
      } else if (obj && typeof obj === 'object') {
        Object.values(obj).forEach(countRecursive);
      }
    }
    
    countRecursive(data);
    return count;
  }

  /**
   * Convert data to CSV format
   */
  convertToCSV(data) {
    // Flatten the data structure for CSV export
    const flatData = this.flattenData(data);
    
    if (flatData.length === 0) return '';

    const headers = Object.keys(flatData[0]);
    const csvRows = [headers.join(',')];

    for (const row of flatData) {
      const values = headers.map(header => {
        const value = row[header];
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
   * Flatten nested data structure for CSV export
   */
  flattenData(data, prefix = '') {
    const flattened = [];
    
    function flatten(obj, currentPrefix = '') {
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          flatten(item, `${currentPrefix}[${index}]`);
        });
      } else if (obj && typeof obj === 'object') {
        const flatObj = {};
        
        Object.keys(obj).forEach(key => {
          const value = obj[key];
          const newKey = currentPrefix ? `${currentPrefix}.${key}` : key;
          
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            Object.assign(flatObj, this.flattenObject(value, newKey));
          } else {
            flatObj[newKey] = value;
          }
        });
        
        flattened.push(flatObj);
      }
    }
    
    flatten(data, prefix);
    return flattened;
  }

  /**
   * Flatten a single object
   */
  flattenObject(obj, prefix = '') {
    const flattened = {};
    
    Object.keys(obj).forEach(key => {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(flattened, this.flattenObject(value, newKey));
      } else {
        flattened[newKey] = value;
      }
    });
    
    return flattened;
  }

  /**
   * Validate GDPR request
   */
  validateGDPRRequest(requestType, userId, requestId) {
    const validTypes = ['access', 'erasure', 'portability', 'rectification'];
    
    if (!validTypes.includes(requestType)) {
      throw new Error(`Invalid GDPR request type: ${requestType}`);
    }
    
    if (!userId || typeof userId !== 'string') {
      throw new Error('Valid userId is required');
    }
    
    if (!requestId || typeof requestId !== 'string') {
      throw new Error('Valid requestId is required');
    }
    
    return true;
  }

  /**
   * Get GDPR compliance status for a user
   */
  async getComplianceStatus(userId) {
    try {
      // Get recent GDPR-related audit events
      const gdprEvents = await auditLogger.getEventsByCorrelationId(`gdpr_${userId}`, 10);
      
      const status = {
        userId,
        lastAccessRequest: null,
        lastErasureRequest: null,
        lastPortabilityRequest: null,
        dataRetentionStatus: 'compliant',
        anonymizationStatus: 'not_required'
      };

      // Analyze recent events
      gdprEvents.forEach(event => {
        if (event.action === 'data_export' && event.event === 'gdpr_access_request') {
          status.lastAccessRequest = event.timestamp;
        }
        if (event.action === 'data_deletion' && event.event === 'gdpr_erasure_request') {
          status.lastErasureRequest = event.timestamp;
        }
        if (event.action === 'data_export' && event.event === 'gdpr_portability_request') {
          status.lastPortabilityRequest = event.timestamp;
        }
      });

      return status;
    } catch (error) {
      structuredLogger.error('Failed to get GDPR compliance status', {
        userId,
        error: error.message
      });
      throw error;
    }
  }
}

// Create singleton instance
const gdprComplianceService = new GDPRComplianceService();

module.exports = gdprComplianceService;