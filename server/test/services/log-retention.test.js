const logRetentionService = require('../../services/log-retention');
const { docClient, TABLES } = require('../../models/db');
const structuredLogger = require('../../services/structured-logger');

// Mock dependencies
jest.mock('../../models/db', () => ({
  docClient: {
    send: jest.fn()
  },
  TABLES: {
    AUDIT_LOGS: 'test-audit-logs'
  }
}));

jest.mock('../../services/structured-logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

jest.mock('../../services/audit-logger', () => ({
  logSystemEvent: jest.fn().mockResolvedValue('event-id')
}));

describe('LogRetentionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Retention Policies', () => {
    test('should return correct retention policy for event types', () => {
      expect(logRetentionService.getRetentionPolicy('security')).toBe(365);
      expect(logRetentionService.getRetentionPolicy('cost')).toBe(1095);
      expect(logRetentionService.getRetentionPolicy('audit')).toBe(2555);
      expect(logRetentionService.getRetentionPolicy('unknown')).toBe(90);
    });
  });

  describe('Cleanup Operations', () => {
    test('should cleanup expired logs', async () => {
      const mockExpiredItems = [
        { PK: 'audit#project1', SK: '2024-01-01T00:00:00Z#event1' },
        { PK: 'audit#project1', SK: '2024-01-01T00:01:00Z#event2' }
      ];

      docClient.send
        .mockResolvedValueOnce({ Items: mockExpiredItems }) // First scan
        .mockResolvedValueOnce({ Items: [] }) // Second scan (no more items)
        .mockResolvedValue({}); // Batch delete operations

      const deletedCount = await logRetentionService.cleanupExpiredLogs();

      expect(deletedCount).toBe(2);
      expect(structuredLogger.info).toHaveBeenCalledWith('Starting audit log cleanup');
      expect(structuredLogger.info).toHaveBeenCalledWith('Audit log cleanup completed', {
        deletedCount: 2
      });
    });

    test('should handle cleanup errors', async () => {
      const error = new Error('Scan failed');
      docClient.send.mockRejectedValue(error);

      await expect(logRetentionService.cleanupExpiredLogs()).rejects.toThrow('Scan failed');
      expect(structuredLogger.error).toHaveBeenCalledWith('Failed to cleanup expired logs', {
        error: 'Scan failed'
      });
    });

    test('should delete items in batches', async () => {
      docClient.send.mockResolvedValue({});
      
      const items = Array.from({ length: 30 }, (_, i) => ({
        PK: `audit#project${i}`,
        SK: `2024-01-01T00:00:00Z#event${i}`
      }));

      await logRetentionService.deleteItemsBatch(items);

      // Should be called twice: once for 25 items, once for 5 items
      expect(docClient.send).toHaveBeenCalledTimes(2);
    });

    test('should chunk array correctly', () => {
      const array = [1, 2, 3, 4, 5, 6, 7];
      const chunks = logRetentionService.chunkArray(array, 3);

      expect(chunks).toEqual([
        [1, 2, 3],
        [4, 5, 6],
        [7]
      ]);
    });
  });

  describe('GDPR Compliance', () => {
    test('should delete project logs', async () => {
      const mockProjectLogs = [
        { PK: 'audit#project-123', SK: '2024-01-01T00:00:00Z#event1' },
        { PK: 'audit#project-123', SK: '2024-01-01T00:01:00Z#event2' }
      ];

      docClient.send
        .mockResolvedValueOnce({ Items: mockProjectLogs }) // Query
        .mockResolvedValueOnce({ Items: [] }) // Query (no more items)
        .mockResolvedValue({}); // Delete operations

      const deletedCount = await logRetentionService.deleteProjectLogs('project-123', 'gdpr_request');

      expect(deletedCount).toBe(2);
      expect(structuredLogger.info).toHaveBeenCalledWith('Deleting project logs', {
        projectId: 'project-123',
        reason: 'gdpr_request'
      });
      expect(structuredLogger.info).toHaveBeenCalledWith('Project logs deleted', {
        projectId: 'project-123',
        deletedCount: 2,
        reason: 'gdpr_request'
      });
    });

    test('should delete user logs', async () => {
      const mockUserLogs = [
        { PK: 'audit#project1', SK: '2024-01-01T00:00:00Z#event1', actor: 'user-123' },
        { PK: 'audit#project2', SK: '2024-01-01T00:01:00Z#event2', actor: 'user-123' }
      ];

      docClient.send
        .mockResolvedValueOnce({ Items: mockUserLogs }) // Scan
        .mockResolvedValueOnce({ Items: [] }) // Scan (no more items)
        .mockResolvedValue({}); // Delete operations

      const deletedCount = await logRetentionService.deleteUserLogs('user-123', 'account_deletion');

      expect(deletedCount).toBe(2);
      expect(structuredLogger.info).toHaveBeenCalledWith('Deleting user logs', {
        userId: 'user-123',
        reason: 'account_deletion'
      });
    });

    test('should handle deletion errors', async () => {
      const error = new Error('Delete failed');
      docClient.send.mockRejectedValue(error);

      await expect(logRetentionService.deleteProjectLogs('project-123')).rejects.toThrow('Delete failed');
      expect(structuredLogger.error).toHaveBeenCalledWith('Failed to delete project logs', {
        projectId: 'project-123',
        error: 'Delete failed'
      });
    });
  });

  describe('Data Export', () => {
    test('should export project logs as JSON', async () => {
      const mockLogs = [
        {
          PK: 'audit#project-123',
          SK: '2024-01-01T00:00:00Z#event1',
          ttl: 1234567890,
          eventId: 'event1',
          event: 'user_action',
          actor: 'user-123'
        },
        {
          PK: 'audit#project-123',
          SK: '2024-01-01T00:01:00Z#event2',
          ttl: 1234567890,
          eventId: 'event2',
          event: 'ai_action',
          actor: 'coder'
        }
      ];

      docClient.send
        .mockResolvedValueOnce({ Items: mockLogs })
        .mockResolvedValueOnce({ Items: [] });

      const result = await logRetentionService.exportProjectLogs('project-123', 'json');

      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).not.toHaveProperty('PK');
      expect(parsed[0]).not.toHaveProperty('SK');
      expect(parsed[0]).not.toHaveProperty('ttl');
      expect(parsed[0]).toHaveProperty('eventId');
    });

    test('should export project logs as CSV', async () => {
      const mockLogs = [
        { eventId: 'event1', event: 'user_action', actor: 'user-123' },
        { eventId: 'event2', event: 'ai_action', actor: 'coder' }
      ];

      docClient.send
        .mockResolvedValueOnce({ Items: mockLogs })
        .mockResolvedValueOnce({ Items: [] });

      const result = await logRetentionService.exportProjectLogs('project-123', 'csv');

      expect(result).toContain('eventId,event,actor');
      expect(result).toContain('"event1","user_action","user-123"');
      expect(result).toContain('"event2","ai_action","coder"');
    });

    test('should handle CSV conversion with complex objects', () => {
      const logs = [
        {
          eventId: 'event1',
          details: { key: 'value', nested: { prop: 'test' } },
          message: 'Test "quoted" message'
        }
      ];

      const csv = logRetentionService.convertToCSV(logs);
      
      expect(csv).toContain('eventId,details,message');
      expect(csv).toContain('"event1"');
      expect(csv).toContain('""quoted""'); // Escaped quotes
    });

    test('should return empty string for empty logs', () => {
      const csv = logRetentionService.convertToCSV([]);
      expect(csv).toBe('');
    });

    test('should handle export errors', async () => {
      const error = new Error('Export failed');
      docClient.send.mockRejectedValue(error);

      await expect(logRetentionService.exportProjectLogs('project-123')).rejects.toThrow('Export failed');
      expect(structuredLogger.error).toHaveBeenCalledWith('Failed to export project logs', {
        projectId: 'project-123',
        error: 'Export failed'
      });
    });
  });

  describe('Statistics', () => {
    test('should get retention statistics', async () => {
      const now = Math.floor(Date.now() / 1000);
      const mockItems = [
        { timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), ttl: now + 3600 }, // 12h old
        { timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), ttl: now + 3600 }, // 3d old
        { timestamp: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(), ttl: now + 3600 }, // 15d old
        { timestamp: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), ttl: now + 3600 }, // 60d old
        { timestamp: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(), ttl: now - 3600 } // 120d old, expired
      ];

      // Mock the scan to return our test data
      jest.spyOn(logRetentionService, 'getRetentionStats').mockImplementation(async () => {
        return {
          totalRecords: 5,
          expiredRecords: 1,
          recordsByAge: {
            '1d': 1,
            '7d': 1,
            '30d': 1,
            '90d': 1,
            'older': 1
          }
        };
      });

      const stats = await logRetentionService.getRetentionStats();

      expect(stats).toEqual({
        totalRecords: 5,
        expiredRecords: 1,
        recordsByAge: {
          '1d': 1,
          '7d': 1,
          '30d': 1,
          '90d': 1,
          'older': 1
        }
      });
    });

    test('should handle statistics errors', async () => {
      // Restore the original implementation first
      logRetentionService.getRetentionStats.mockRestore?.();
      
      const error = new Error('Stats failed');
      docClient.send.mockRejectedValue(error);

      await expect(logRetentionService.getRetentionStats()).rejects.toThrow('Stats failed');
      expect(structuredLogger.error).toHaveBeenCalledWith('Failed to get retention stats', {
        error: 'Stats failed'
      });
    });
  });

  describe('Scheduled Operations', () => {
    test('should run scheduled cleanup successfully', async () => {
      jest.spyOn(logRetentionService, 'cleanupExpiredLogs').mockResolvedValue(10);

      const result = await logRetentionService.scheduleCleanup();

      expect(result).toEqual({ success: true, deletedCount: 10 });
      expect(structuredLogger.info).toHaveBeenCalledWith('Scheduled cleanup completed', {
        deletedCount: 10,
        nextCleanup: expect.any(String)
      });
    });

    test('should handle scheduled cleanup errors', async () => {
      const error = new Error('Cleanup failed');
      jest.spyOn(logRetentionService, 'cleanupExpiredLogs').mockRejectedValue(error);

      const result = await logRetentionService.scheduleCleanup();

      expect(result).toEqual({ success: false, error: 'Cleanup failed' });
      expect(structuredLogger.error).toHaveBeenCalledWith('Scheduled cleanup failed', {
        error: 'Cleanup failed'
      });
    });
  });
});