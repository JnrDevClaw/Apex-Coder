const auditLogger = require('../../services/audit-logger');
const { docClient, TABLES } = require('../../models/db');
const { PutCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

// Mock DynamoDB
jest.mock('../../models/db', () => ({
  docClient: {
    send: jest.fn()
  },
  TABLES: {
    AUDIT_LOGS: 'test-audit-logs'
  }
}));

describe('AuditLogger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset correlation ID map if it exists
    if (auditLogger.correlationIdMap) {
      auditLogger.correlationIdMap.clear();
    }
  });

  describe('Correlation ID Management', () => {
    test('should generate unique correlation IDs', () => {
      const id1 = auditLogger.generateCorrelationId();
      const id2 = auditLogger.generateCorrelationId();
      
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    test('should set and get correlation ID', () => {
      const correlationId = 'test-correlation-id';
      auditLogger.setCorrelationId(correlationId);
      
      expect(auditLogger.getCorrelationId()).toBe(correlationId);
    });

    test('should generate new correlation ID if none set', () => {
      const correlationId = auditLogger.getCorrelationId();
      
      expect(correlationId).toBeDefined();
      expect(correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });

  describe('Event Logging', () => {
    test('should log basic audit event', async () => {
      docClient.send.mockResolvedValue({});

      const eventData = {
        event: 'test_event',
        actor: 'test-user',
        action: 'test_action',
        projectId: 'project-123',
        details: { key: 'value' }
      };

      const eventId = await auditLogger.logEvent(eventData);

      expect(eventId).toBeDefined();
      expect(docClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLES.AUDIT_LOGS,
            Item: expect.objectContaining({
              event: 'test_event',
              actor: 'test-user',
              actorType: 'user',
              action: 'test_action',
              projectId: 'project-123',
              details: { key: 'value' }
            })
          })
        })
      );
    });

    test('should sanitize prompt data', () => {
      const prompt = 'User email: john@example.com, SSN: 123-45-6789, Card: 1234 5678 9012 3456';
      const sanitized = auditLogger.sanitizePrompt(prompt);
      
      expect(sanitized).toBe('User email: [EMAIL], SSN: [SSN], Card: [CARD]');
    });

    test('should truncate long prompts', () => {
      const longPrompt = 'a'.repeat(3000);
      const sanitized = auditLogger.sanitizePrompt(longPrompt);
      
      expect(sanitized.length).toBeLessThanOrEqual(2020); // 2000 + '... [truncated]'
      expect(sanitized).toEndWith('... [truncated]');
    });

    test('should calculate TTL correctly', () => {
      const retentionDays = 30;
      const ttl = auditLogger.calculateTTL(retentionDays);
      
      const expectedExpiration = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));
      const expectedTTL = Math.floor(expectedExpiration.getTime() / 1000);
      
      // Allow for small time differences in test execution
      expect(Math.abs(ttl - expectedTTL)).toBeLessThan(5);
    });

    test('should handle file hashes', async () => {
      docClient.send.mockResolvedValue({});

      const generatedFiles = [
        { path: 'test.js', content: 'console.log("test");' },
        { path: 'empty.js', content: '' }
      ];

      await auditLogger.logEvent({
        event: 'code_generation',
        actor: 'ai-agent',
        action: 'generate_files',
        generatedFiles
      });

      const call = docClient.send.mock.calls[0][0];
      const item = call.input.Item;
      
      expect(item.fileHashes).toHaveLength(2);
      expect(item.fileHashes[0]).toEqual({
        path: 'test.js',
        hash: expect.any(String),
        size: 20
      });
      expect(item.fileHashes[1]).toEqual({
        path: 'empty.js',
        hash: expect.any(String),
        size: 0
      });
    });
  });

  describe('Specialized Logging Methods', () => {
    beforeEach(() => {
      docClient.send.mockResolvedValue({});
    });

    test('should log user action', async () => {
      await auditLogger.logUserAction('user-123', 'create_project', {
        projectId: 'project-456',
        projectName: 'Test Project'
      });

      expect(docClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Item: expect.objectContaining({
              event: 'user_action',
              actor: 'user-123',
              actorType: 'user',
              action: 'create_project'
            })
          })
        })
      );
    });

    test('should log AI action with prompt', async () => {
      const prompt = 'Generate a React component';
      const files = [{ path: 'Component.jsx', content: 'export default function Component() {}' }];

      await auditLogger.logAIAction('coder', 'generate_component', prompt, files, {
        projectId: 'project-123'
      });

      expect(docClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Item: expect.objectContaining({
              event: 'ai_action',
              actor: 'coder',
              actorType: 'ai-agent',
              action: 'generate_component',
              promptSnapshot: prompt
            })
          })
        })
      );
    });

    test('should log system event', async () => {
      await auditLogger.logSystemEvent('startup', 'application_start', {
        version: '1.0.0'
      });

      expect(docClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Item: expect.objectContaining({
              event: 'startup',
              actor: 'system',
              actorType: 'system',
              action: 'application_start'
            })
          })
        })
      );
    });

    test('should log build event', async () => {
      await auditLogger.logBuildEvent('build-123', 'project-456', 'build_started', {
        actor: 'user-789'
      });

      expect(docClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Item: expect.objectContaining({
              event: 'build_lifecycle',
              action: 'build_started',
              projectId: 'project-456',
              buildId: 'build-123'
            })
          })
        })
      );
    });

    test('should log deployment event', async () => {
      await auditLogger.logDeploymentEvent('deploy-123', 'project-456', 'build-789', 'deploy_started');

      expect(docClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Item: expect.objectContaining({
              event: 'deployment',
              action: 'deploy_started',
              projectId: 'project-456',
              buildId: 'build-789',
              resourceId: 'deploy-123'
            })
          })
        })
      );
    });

    test('should log security event', async () => {
      await auditLogger.logSecurityEvent('failed_login', 'user-123', {
        ipAddress: '192.168.1.1',
        severity: 'high'
      });

      expect(docClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Item: expect.objectContaining({
              event: 'security',
              actor: 'user-123',
              action: 'failed_login',
              details: expect.objectContaining({
                severity: 'high',
                ipAddress: '192.168.1.1'
              })
            })
          })
        })
      );
    });

    test('should log cost event', async () => {
      await auditLogger.logCostEvent('token_usage', 10.50, 'USD', {
        resourceType: 'llm_tokens',
        projectId: 'project-123'
      });

      expect(docClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Item: expect.objectContaining({
              event: 'cost',
              action: 'token_usage',
              details: expect.objectContaining({
                amount: 10.50,
                currency: 'USD',
                resourceType: 'llm_tokens'
              })
            })
          })
        })
      );
    });
  });

  describe('Querying', () => {
    test('should query project audit log', async () => {
      const mockItems = [
        { eventId: '1', event: 'test1' },
        { eventId: '2', event: 'test2' }
      ];
      
      docClient.send.mockResolvedValue({ Items: mockItems });

      const result = await auditLogger.getProjectAuditLog('project-123', {
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-02T00:00:00Z',
        limit: 50
      });

      expect(result).toEqual(mockItems);
      expect(docClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLES.AUDIT_LOGS,
            KeyConditionExpression: 'PK = :pk AND SK BETWEEN :start AND :end',
            ExpressionAttributeValues: {
              ':pk': 'audit#project-123',
              ':start': '2024-01-01T00:00:00Z',
              ':end': '2024-01-02T00:00:00Z'
            },
            Limit: 50
          })
        })
      );
    });

    test('should query events by correlation ID', async () => {
      const mockItems = [{ eventId: '1', correlationId: 'corr-123' }];
      docClient.send.mockResolvedValue({ Items: mockItems });

      const result = await auditLogger.getEventsByCorrelationId('corr-123');

      expect(result).toEqual(mockItems);
      expect(docClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: TABLES.AUDIT_LOGS,
            FilterExpression: 'correlationId = :correlationId',
            ExpressionAttributeValues: {
              ':correlationId': 'corr-123'
            }
          })
        })
      );
    });

    test('should get audit statistics', async () => {
      const mockEvents = [
        { event: 'user_action', actorType: 'user', actor: 'user1' },
        { event: 'ai_action', actorType: 'ai-agent', actor: 'coder' },
        { event: 'security', actorType: 'user', actor: 'user1' },
        { event: 'cost', actorType: 'system', actor: 'system' }
      ];

      // Mock the getProjectAuditLog method
      jest.spyOn(auditLogger, 'getProjectAuditLog').mockResolvedValue(mockEvents);

      const stats = await auditLogger.getAuditStats('project-123', '24h');

      expect(stats).toEqual({
        totalEvents: 4,
        eventsByType: {
          user_action: 1,
          ai_action: 1,
          security: 1,
          cost: 1
        },
        eventsByActor: {
          user1: 2,
          coder: 1,
          system: 1
        },
        securityEvents: 1,
        costEvents: 1,
        aiActions: 1,
        userActions: 2
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle DynamoDB errors gracefully', async () => {
      const error = new Error('DynamoDB error');
      docClient.send.mockRejectedValue(error);

      // Should still log to console as fallback
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await expect(auditLogger.logEvent({
        event: 'test',
        actor: 'test',
        action: 'test'
      })).rejects.toThrow('DynamoDB error');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('should handle query errors', async () => {
      const error = new Error('Query failed');
      docClient.send.mockRejectedValue(error);

      await expect(auditLogger.getProjectAuditLog('project-123')).rejects.toThrow('Query failed');
    });
  });
});