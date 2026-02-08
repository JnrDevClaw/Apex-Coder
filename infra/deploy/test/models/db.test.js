const { dbUtils, DatabaseError } = require('../../models/db');

describe('Database Utilities', () => {
  describe('dbUtils', () => {
    test('generateId should create unique IDs', () => {
      const id1 = dbUtils.generateId();
      const id2 = dbUtils.generateId();
      
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(0);
    });

    test('getCurrentTimestamp should return ISO string', () => {
      const timestamp = dbUtils.getCurrentTimestamp();
      
      expect(timestamp).toBeDefined();
      expect(typeof timestamp).toBe('string');
      expect(() => new Date(timestamp)).not.toThrow();
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });

    test('handleError should throw DatabaseError with proper structure', () => {
      const originalError = new Error('Test error');
      originalError.name = 'ResourceNotFoundException';
      
      expect(() => {
        dbUtils.handleError(originalError, 'test operation');
      }).toThrow(DatabaseError);
      
      try {
        dbUtils.handleError(originalError, 'test operation');
      } catch (error) {
        expect(error).toBeInstanceOf(DatabaseError);
        expect(error.code).toBe('TABLE_NOT_FOUND');
        expect(error.originalError).toBe(originalError);
        expect(error.message).toContain('test operation');
      }
    });
  });

  describe('DatabaseError', () => {
    test('should create error with all properties', () => {
      const originalError = new Error('Original');
      const dbError = new DatabaseError('Test message', 'TEST_CODE', originalError);
      
      expect(dbError).toBeInstanceOf(Error);
      expect(dbError.name).toBe('DatabaseError');
      expect(dbError.message).toBe('Test message');
      expect(dbError.code).toBe('TEST_CODE');
      expect(dbError.originalError).toBe(originalError);
    });
  });
});