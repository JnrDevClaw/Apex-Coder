const securityAuditLogger = require('../../services/security-audit-logger');
const auditLogger = require('../../services/audit-logger');

// Mock the audit logger
jest.mock('../../services/audit-logger', () => ({
  logSecurityEvent: jest.fn(),
  logUserAction: jest.fn(),
  logDeploymentEvent: jest.fn(),
  getProjectAuditLog: jest.fn(),
  getAuditStats: jest.fn()
}));

describe('Security Audit Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('OAuth Logging', () => {
    it('should log OAuth connection', async () => {
      const userId = 'user-123';
      const details = {
        githubUsername: 'testuser',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      };

      await securityAuditLogger.logOAuthConnection('github', userId, details);

      expect(auditLogger.logSecurityEvent).toHaveBeenCalledWith(
        'github_oauth_connected',
        userId,
        expect.objectContaining({
          actorType: 'user',
          severity: 'low',
          ...details
        })
      );
    });

    it('should log OAuth disconnection', async () => {
      const userId = 'user-123';
      const details = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      };

      await securityAuditLogger.logOAuthDisconnection('github', userId, details);

      expect(auditLogger.logSecurityEvent).toHaveBeenCalledWith(
        'github_oauth_disconnected',
        userId,
        expect.objectContaining({
          actorType: 'user',
          severity: 'low',
          ...details
        })
      );
    });
  });

  describe('AWS Credentials Logging', () => {
    it('should log AWS connection', async () => {
      const userId = 'user-123';
      const accountId = '123456789012';
      const region = 'us-east-1';
      const details = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      };

      await securityAuditLogger.logAWSConnection(userId, accountId, region, details);

      expect(auditLogger.logSecurityEvent).toHaveBeenCalledWith(
        'aws_credentials_connected',
        userId,
        expect.objectContaining({
          actorType: 'user',
          severity: 'medium',
          accountId,
          region,
          ...details
        })
      );
    });

    it('should log AWS disconnection', async () => {
      const userId = 'user-123';
      const details = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      };

      await securityAuditLogger.logAWSDisconnection(userId, details);

      expect(auditLogger.logSecurityEvent).toHaveBeenCalledWith(
        'aws_credentials_disconnected',
        userId,
        expect.objectContaining({
          actorType: 'user',
          severity: 'medium',
          ...details
        })
      );
    });
  });

  describe('CloudFormation Stack Logging', () => {
    it('should log stack creation', async () => {
      const userId = 'user-123';
      const stackDetails = {
        stackName: 'github-oidc-stack',
        stackId: 'arn:aws:cloudformation:...',
        region: 'us-east-1',
        roleArn: 'arn:aws:iam::...',
        bucketName: 'deployment-bucket'
      };

      await securityAuditLogger.logStackCreation(userId, stackDetails);

      expect(auditLogger.logUserAction).toHaveBeenCalledWith(
        userId,
        'cloudformation_stack_created',
        expect.objectContaining(stackDetails)
      );
    });

    it('should log stack deletion', async () => {
      const userId = 'user-123';
      const stackName = 'github-oidc-stack';

      await securityAuditLogger.logStackDeletion(userId, stackName);

      expect(auditLogger.logUserAction).toHaveBeenCalledWith(
        userId,
        'cloudformation_stack_deleted',
        expect.objectContaining({
          stackName,
          severity: 'high'
        })
      );
    });
  });

  describe('Deployment Logging', () => {
    it('should log deployment trigger', async () => {
      const userId = 'user-123';
      const deploymentId = 'deploy-123';
      const projectId = 'project-456';
      const details = {
        orgId: 'org-789',
        ipAddress: '192.168.1.1'
      };

      await securityAuditLogger.logDeploymentTrigger(userId, deploymentId, projectId, details);

      expect(auditLogger.logDeploymentEvent).toHaveBeenCalledWith(
        deploymentId,
        projectId,
        null,
        'deployment_triggered',
        expect.objectContaining({
          actor: userId,
          actorType: 'user',
          ...details
        })
      );
    });

    it('should log deployment completion', async () => {
      const deploymentId = 'deploy-123';
      const projectId = 'project-456';
      const status = 'success';

      await securityAuditLogger.logDeploymentComplete(deploymentId, projectId, status);

      expect(auditLogger.logDeploymentEvent).toHaveBeenCalledWith(
        deploymentId,
        projectId,
        null,
        'deployment_completed',
        expect.objectContaining({
          actor: 'system',
          actorType: 'system',
          status
        })
      );
    });
  });

  describe('Security Event Logging', () => {
    it('should log authentication success', async () => {
      const userId = 'user-123';
      const details = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      };

      await securityAuditLogger.logAuthAttempt(userId, true, details);

      expect(auditLogger.logSecurityEvent).toHaveBeenCalledWith(
        'auth_success',
        userId,
        expect.objectContaining({
          actorType: 'user',
          severity: 'low',
          success: true,
          ...details
        })
      );
    });

    it('should log authentication failure', async () => {
      const userId = 'user-123';
      const details = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        reason: 'invalid_password'
      };

      await securityAuditLogger.logAuthAttempt(userId, false, details);

      expect(auditLogger.logSecurityEvent).toHaveBeenCalledWith(
        'auth_failure',
        userId,
        expect.objectContaining({
          actorType: 'user',
          severity: 'high',
          success: false,
          ...details
        })
      );
    });

    it('should log rate limit violation', async () => {
      const userId = 'user-123';
      const endpoint = '/api/auth/github';
      const details = {
        ipAddress: '192.168.1.1',
        requestCount: 15
      };

      await securityAuditLogger.logRateLimitViolation(userId, endpoint, details);

      expect(auditLogger.logSecurityEvent).toHaveBeenCalledWith(
        'rate_limit_exceeded',
        userId,
        expect.objectContaining({
          actorType: 'user',
          severity: 'medium',
          endpoint,
          ...details
        })
      );
    });

    it('should log CSRF failure', async () => {
      const userId = 'user-123';
      const endpoint = '/api/aws/credentials';
      const details = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      };

      await securityAuditLogger.logCSRFFailure(userId, endpoint, details);

      expect(auditLogger.logSecurityEvent).toHaveBeenCalledWith(
        'csrf_token_invalid',
        userId,
        expect.objectContaining({
          actorType: 'user',
          severity: 'high',
          endpoint,
          ...details
        })
      );
    });

    it('should log suspicious activity', async () => {
      const userId = 'user-123';
      const activityType = 'multiple_failed_logins';
      const details = {
        ipAddress: '192.168.1.1',
        attemptCount: 10
      };

      await securityAuditLogger.logSuspiciousActivity(userId, activityType, details);

      expect(auditLogger.logSecurityEvent).toHaveBeenCalledWith(
        'suspicious_activity',
        userId,
        expect.objectContaining({
          actorType: 'user',
          severity: 'high',
          activityType,
          ...details
        })
      );
    });
  });

  describe('Security Statistics', () => {
    it('should get security statistics', async () => {
      const mockStats = {
        securityEvents: 50,
        eventsByType: {
          auth_failure: 5,
          rate_limit_exceeded: 10,
          csrf_token_invalid: 2,
          suspicious_activity: 1
        }
      };

      auditLogger.getAuditStats.mockResolvedValue(mockStats);

      const stats = await securityAuditLogger.getSecurityStats('24h');

      expect(stats).toEqual({
        totalSecurityEvents: 50,
        authFailures: 5,
        rateLimitViolations: 10,
        csrfFailures: 2,
        suspiciousActivities: 1,
        timeRange: '24h'
      });

      expect(auditLogger.getAuditStats).toHaveBeenCalledWith('global', '24h');
    });
  });
});
