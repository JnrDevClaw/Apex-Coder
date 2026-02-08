const { STSClient, AssumeRoleCommand } = require('@aws-sdk/client-sts');
const { CloudTrailClient, PutEventsCommand } = require('@aws-sdk/client-cloudtrail');
const crypto = require('crypto');

/**
 * AWS Action Layer - Secure server-side functions for AWS operations
 * 
 * Security Model:
 * - Backend holds long-lived IAM role; workers assume short-lived roles via STS with least privilege
 * - Require signature HMAC (X-Signature) for AI-triggered calls to prevent forged requests
 * - Destructive or billing-impact ops need 2-step approval (owner + admin) or cost cap check
 * - Log every AWS action with user/AI-agent ID, operation details, and resource ARNs
 */
class AWSActionLayer {
  constructor(options = {}) {
    this.region = options.region || process.env.AWS_REGION || 'us-east-1';
    this.roleArn = options.roleArn || process.env.AWS_DEPLOYMENT_ROLE_ARN;
    this.webhookSecret = options.webhookSecret || process.env.WEBHOOK_SECRET;
    this.auditTrailName = options.auditTrailName || process.env.AWS_AUDIT_TRAIL_NAME;
    
    this.stsClient = new STSClient({ region: this.region });
    this.cloudTrailClient = new CloudTrailClient({ region: this.region });
    
    // Approval cache for multi-step operations
    this.approvalCache = new Map();
  }

  /**
   * Assume IAM role with STS for least privilege access
   * @param {string} roleArn - ARN of the role to assume
   * @param {string} sessionName - Name for the session
   * @param {number} durationSeconds - Session duration (default: 3600)
   * @returns {Object} Temporary credentials
   */
  async assumeRole(roleArn, sessionName, durationSeconds = 3600) {
    try {
      const command = new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: sessionName,
        DurationSeconds: durationSeconds
      });

      const response = await this.stsClient.send(command);
      
      return {
        accessKeyId: response.Credentials.AccessKeyId,
        secretAccessKey: response.Credentials.SecretAccessKey,
        sessionToken: response.Credentials.SessionToken,
        expiration: response.Credentials.Expiration
      };
    } catch (error) {
      throw new Error(`Failed to assume role ${roleArn}: ${error.message}`);
    }
  }

  /**
   * Validate HMAC signature for AI-triggered calls
   * @param {string} signature - X-Signature header value
   * @param {string} payload - Request payload as string
   * @returns {boolean} True if signature is valid
   */
  validateSignature(signature, payload) {
    if (!this.webhookSecret) {
      throw new Error('WEBHOOK_SECRET not configured');
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');

    return signature === expectedSignature;
  }

  /**
   * Multi-step approval system for destructive operations
   * @param {string} operationId - Unique operation identifier
   * @param {string} operationType - Type of operation ('billing' | 'destructive')
   * @param {Object} operationDetails - Details about the operation
   * @param {string} userId - User requesting the operation
   * @param {string} userRole - Role of the user ('owner' | 'admin' | 'dev')
   * @returns {Object} Approval status
   */
  async requestApproval(operationId, operationType, operationDetails, userId, userRole) {
    const approval = {
      operationId,
      operationType,
      operationDetails,
      requestedBy: userId,
      requestedAt: new Date().toISOString(),
      approvals: [],
      status: 'pending'
    };

    // Check if operation requires approval
    const requiresApproval = this.requiresApproval(operationType, operationDetails);
    
    if (!requiresApproval) {
      approval.status = 'approved';
      approval.approvals.push({
        userId: 'system',
        role: 'system',
        approvedAt: new Date().toISOString(),
        reason: 'Operation within cost cap limits'
      });
    } else {
      // Add first approval if user has sufficient role
      if (userRole === 'owner' || userRole === 'admin') {
        approval.approvals.push({
          userId,
          role: userRole,
          approvedAt: new Date().toISOString()
        });

        // Check if we need second approval
        if (operationType === 'destructive' && approval.approvals.length >= 1) {
          approval.status = 'needs_second_approval';
        } else if (operationType === 'billing' && userRole === 'owner') {
          approval.status = 'approved';
        }
      }
    }

    this.approvalCache.set(operationId, approval);
    return approval;
  }

  /**
   * Add second approval for multi-step operations
   * @param {string} operationId - Operation identifier
   * @param {string} userId - User providing approval
   * @param {string} userRole - Role of the approving user
   * @returns {Object} Updated approval status
   */
  async addApproval(operationId, userId, userRole) {
    const approval = this.approvalCache.get(operationId);
    if (!approval) {
      throw new Error(`Operation ${operationId} not found`);
    }

    // Check if user already approved
    const existingApproval = approval.approvals.find(a => a.userId === userId);
    if (existingApproval) {
      throw new Error('User has already approved this operation');
    }

    // Add approval
    approval.approvals.push({
      userId,
      role: userRole,
      approvedAt: new Date().toISOString()
    });

    // Check if operation is now fully approved
    if (approval.approvals.length >= 2 || 
        (approval.operationType === 'billing' && approval.approvals.some(a => a.role === 'owner'))) {
      approval.status = 'approved';
    }

    this.approvalCache.set(operationId, approval);
    return approval;
  }

  /**
   * Check if operation requires approval based on type and cost
   * @param {string} operationType - Type of operation
   * @param {Object} operationDetails - Operation details including estimated cost
   * @returns {boolean} True if approval is required
   */
  requiresApproval(operationType, operationDetails) {
    // Always require approval for destructive operations
    if (operationType === 'destructive') {
      return true;
    }

    // Check cost cap for billing operations
    if (operationType === 'billing') {
      const estimatedCost = operationDetails.estimatedCost || 0;
      const costCap = process.env.COST_CAP_USD || 100;
      return estimatedCost > costCap;
    }

    return false;
  }

  /**
   * Log AWS action to CloudTrail and application audit trail
   * @param {string} eventName - Name of the event
   * @param {string} actorId - User or AI agent ID
   * @param {string} actorType - 'user' | 'ai-agent'
   * @param {Object} eventDetails - Details about the event
   * @param {Array} resourceArns - ARNs of affected resources
   */
  async logAuditEvent(eventName, actorId, actorType, eventDetails, resourceArns = []) {
    const auditEvent = {
      eventTime: new Date().toISOString(),
      eventName,
      actorId,
      actorType,
      eventDetails,
      resourceArns,
      sourceIPAddress: eventDetails.sourceIP || 'internal',
      userAgent: eventDetails.userAgent || 'aws-action-layer'
    };

    try {
      // Log to CloudTrail if configured
      if (this.auditTrailName) {
        const command = new PutEventsCommand({
          Records: [{
            EventTime: new Date(),
            EventName: eventName,
            EventSource: 'ai-app-builder.aws-action-layer',
            UserIdentity: {
              type: actorType,
              principalId: actorId
            },
            Resources: resourceArns.map(arn => ({ ResourceName: arn })),
            CloudTrailEvent: JSON.stringify(auditEvent)
          }]
        });

        await this.cloudTrailClient.send(command);
      }

      // Also log to application logs
      console.log('AWS_AUDIT_EVENT:', JSON.stringify(auditEvent));
      
      return auditEvent;
    } catch (error) {
      console.error('Failed to log audit event:', error);
      // Don't throw - audit logging failure shouldn't break operations
      return auditEvent;
    }
  }

  /**
   * Create AWS client with assumed role credentials
   * @param {Function} ClientClass - AWS SDK client class
   * @param {Object} credentials - Temporary credentials from assumeRole
   * @returns {Object} Configured AWS client
   */
  createClientWithCredentials(ClientClass, credentials) {
    return new ClientClass({
      region: this.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken
      }
    });
  }

  /**
   * Generate operation ID for tracking
   * @returns {string} Unique operation ID
   */
  generateOperationId() {
    return `op_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Clean up expired approvals from cache
   */
  cleanupExpiredApprovals() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [operationId, approval] of this.approvalCache.entries()) {
      const requestedAt = new Date(approval.requestedAt).getTime();
      if (now - requestedAt > maxAge) {
        this.approvalCache.delete(operationId);
      }
    }
  }
}

module.exports = AWSActionLayer;