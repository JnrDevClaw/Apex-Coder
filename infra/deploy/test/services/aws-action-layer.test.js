const AWSActionLayer = require('../../services/aws-action-layer');
const crypto = require('crypto');

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-sts', () => ({
  STSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  AssumeRoleCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-cloudtrail', () => ({
  CloudTrailClient: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  PutEventsCommand: jest.fn()
}));

describe('AWSActionLayer', () => {
  let awsActionLayer;
  const mockWebhookSecret = 'test-webhook-secret';
  const mockRoleArn = 'arn:aws:iam::123456789012:role/test-deployment-role';

  beforeEach(() => {
    awsActionLayer = new AWSActionLayer({
      region: 'us-east-1',
      roleArn: mockRoleArn,
      webhookSecret: mockWebhookSecret,
      auditTrailName: 'test-audit-trail'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('assumeRole', () => {
    it('should assume IAM role with STS', async () => {
      const mockCredentials = {
        AccessKeyId: 'AKIATEST123',
        SecretAccessKey: 'secret123',
        SessionToken: 'token123',
        Expiration: new Date()
      };

      const mockSend = jest.fn().mockResolvedValue({
        Credentials: mockCredentials
      });

      awsActionLayer.stsClient = { send: mockSend };

      const result = await awsActionLayer.assumeRole(
        mockRoleArn,
        'test-session',
        3600
      );

      expect(result).toEqual({
        accessKeyId: mockCredentials.AccessKeyId,
        secretAccessKey: mockCredentials.SecretAccessKey,
        sessionToken: mockCredentials.SessionToken,
        expiration: mockCredentials.Expiration
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should handle assume role failure', async () => {
      const mockSend = jest.fn().mockRejectedValue(new Error('Access denied'));
      awsActionLayer.stsClient = { send: mockSend };

      await expect(
        awsActionLayer.assumeRole(mockRoleArn, 'test-session')
      ).rejects.toThrow('Failed to assume role');
    });
  });

  describe('validateSignature', () => {
    it('should validate correct HMAC signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const expectedSignature = crypto
        .createHmac('sha256', mockWebhookSecret)
        .update(payload)
        .digest('hex');

      const isValid = awsActionLayer.validateSignature(expectedSignature, payload);
      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const invalidSignature = 'invalid-signature';

      const isValid = awsActionLayer.validateSignature(invalidSignature, payload);
      expect(isValid).toBe(false);
    });

    it('should throw error when webhook secret not configured', () => {
      const awsActionLayerNoSecret = new AWSActionLayer({});
      
      expect(() => {
        awsActionLayerNoSecret.validateSignature('signature', 'payload');
      }).toThrow('WEBHOOK_SECRET not configured');
    });
  });

  describe('requestApproval', () => {
    it('should auto-approve operations within cost cap', async () => {
      process.env.COST_CAP_USD = '100';
      
      const result = await awsActionLayer.requestApproval(
        'op-123',
        'billing',
        { estimatedCost: 50 },
        'user-123',
        'owner'
      );

      expect(result.status).toBe('approved');
      expect(result.approvals).toHaveLength(1);
      expect(result.approvals[0].userId).toBe('system');
    });

    it('should require approval for operations exceeding cost cap', async () => {
      process.env.COST_CAP_USD = '100';
      
      const result = await awsActionLayer.requestApproval(
        'op-124',
        'billing',
        { estimatedCost: 150 },
        'user-123',
        'owner'
      );

      expect(result.status).toBe('approved'); // Owner can approve billing operations
      expect(result.approvals).toHaveLength(1);
      expect(result.approvals[0].userId).toBe('user-123');
    });

    it('should require approval for destructive operations', async () => {
      const result = await awsActionLayer.requestApproval(
        'op-125',
        'destructive',
        { operation: 'delete-resources' },
        'user-123',
        'owner'
      );

      expect(result.status).toBe('needs_second_approval');
      expect(result.approvals).toHaveLength(1);
    });

    it('should handle dev role requesting approval', async () => {
      const result = await awsActionLayer.requestApproval(
        'op-126',
        'billing',
        { estimatedCost: 150 },
        'user-123',
        'dev'
      );

      expect(result.status).toBe('pending');
      expect(result.approvals).toHaveLength(0);
    });
  });

  describe('addApproval', () => {
    it('should add second approval for destructive operations', async () => {
      // First approval
      await awsActionLayer.requestApproval(
        'op-127',
        'destructive',
        { operation: 'delete-resources' },
        'user-123',
        'owner'
      );

      // Second approval
      const result = await awsActionLayer.addApproval(
        'op-127',
        'admin-456',
        'admin'
      );

      expect(result.status).toBe('approved');
      expect(result.approvals).toHaveLength(2);
    });

    it('should prevent duplicate approvals from same user', async () => {
      await awsActionLayer.requestApproval(
        'op-128',
        'destructive',
        { operation: 'delete-resources' },
        'user-123',
        'owner'
      );

      await expect(
        awsActionLayer.addApproval('op-128', 'user-123', 'owner')
      ).rejects.toThrow('User has already approved this operation');
    });

    it('should handle non-existent operation', async () => {
      await expect(
        awsActionLayer.addApproval('non-existent', 'user-123', 'owner')
      ).rejects.toThrow('Operation non-existent not found');
    });
  });

  describe('requiresApproval', () => {
    it('should require approval for destructive operations', () => {
      const requires = awsActionLayer.requiresApproval('destructive', {});
      expect(requires).toBe(true);
    });

    it('should require approval for billing operations exceeding cost cap', () => {
      process.env.COST_CAP_USD = '100';
      
      const requires = awsActionLayer.requiresApproval('billing', { estimatedCost: 150 });
      expect(requires).toBe(true);
    });

    it('should not require approval for billing operations within cost cap', () => {
      process.env.COST_CAP_USD = '100';
      
      const requires = awsActionLayer.requiresApproval('billing', { estimatedCost: 50 });
      expect(requires).toBe(false);
    });
  });

  describe('logAuditEvent', () => {
    it('should log audit event to CloudTrail and console', async () => {
      const mockSend = jest.fn().mockResolvedValue({});
      awsActionLayer.cloudTrailClient = { send: mockSend };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await awsActionLayer.logAuditEvent(
        'TestEvent',
        'user-123',
        'user',
        { action: 'test' },
        ['arn:aws:s3:::test-bucket']
      );

      expect(result.eventName).toBe('TestEvent');
      expect(result.actorId).toBe('user-123');
      expect(result.actorType).toBe('user');
      expect(result.resourceArns).toEqual(['arn:aws:s3:::test-bucket']);

      expect(mockSend).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        'AWS_AUDIT_EVENT:',
        expect.stringContaining('TestEvent')
      );

      consoleSpy.mockRestore();
    });

    it('should handle CloudTrail logging failure gracefully', async () => {
      const mockSend = jest.fn().mockRejectedValue(new Error('CloudTrail error'));
      awsActionLayer.cloudTrailClient = { send: mockSend };

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await awsActionLayer.logAuditEvent(
        'TestEvent',
        'user-123',
        'user',
        { action: 'test' }
      );

      expect(result.eventName).toBe('TestEvent');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to log audit event:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });
  });

  describe('createClientWithCredentials', () => {
    it('should create AWS client with temporary credentials', () => {
      const MockClient = jest.fn();
      const credentials = {
        accessKeyId: 'AKIATEST123',
        secretAccessKey: 'secret123',
        sessionToken: 'token123'
      };

      awsActionLayer.createClientWithCredentials(MockClient, credentials);

      expect(MockClient).toHaveBeenCalledWith({
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'AKIATEST123',
          secretAccessKey: 'secret123',
          sessionToken: 'token123'
        }
      });
    });
  });

  describe('generateOperationId', () => {
    it('should generate unique operation IDs', () => {
      const id1 = awsActionLayer.generateOperationId();
      const id2 = awsActionLayer.generateOperationId();

      expect(id1).toMatch(/^op_\d+_[a-f0-9]{16}$/);
      expect(id2).toMatch(/^op_\d+_[a-f0-9]{16}$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('cleanupExpiredApprovals', () => {
    it('should remove expired approvals from cache', async () => {
      // Add approval with old timestamp
      const oldApproval = {
        operationId: 'old-op',
        requestedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
        status: 'pending'
      };

      awsActionLayer.approvalCache.set('old-op', oldApproval);

      // Add recent approval
      await awsActionLayer.requestApproval(
        'recent-op',
        'billing',
        { estimatedCost: 50 },
        'user-123',
        'owner'
      );

      expect(awsActionLayer.approvalCache.size).toBe(2);

      awsActionLayer.cleanupExpiredApprovals();

      expect(awsActionLayer.approvalCache.size).toBe(1);
      expect(awsActionLayer.approvalCache.has('old-op')).toBe(false);
      expect(awsActionLayer.approvalCache.has('recent-op')).toBe(true);
    });
  });
});