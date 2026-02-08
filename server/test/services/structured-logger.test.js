const structuredLogger = require('../../services/structured-logger');
const auditLogger = require('../../services/audit-logger');

// Mock audit logger
jest.mock('../../services/audit-logger', () => ({
  getCorrelationId: jest.fn(() => 'test-correlation-id'),
  setCorrelationId: jest.fn(),
  logSystemEvent: jest.fn().mockResolvedValue('event-id'),
  logAIAction: jest.fn().mockResolvedValue('event-id'),
  logBuildEvent: jest.fn().mockResolvedValue('event-id'),
  logDeploymentEvent: jest.fn().mockResolvedValue('event-id'),
  logSecurityEvent: jest.fn().mockResolvedValue('event-id'),
  logCostEvent: jest.fn().mockResolvedValue('event-id')
}));

describe('StructuredLogger', () => {
  let consoleSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    // Reset log level
    structuredLogger.logLevel = 'info';
    // Reset correlation ID mock
    auditLogger.getCorrelationId.mockReturnValue('test-correlation-id');
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Log Level Management', () => {
    test('should respect log levels', () => {
      structuredLogger.logLevel = 'warn';

      structuredLogger.debug('debug message');
      structuredLogger.info('info message');
      structuredLogger.warn('warn message');
      structuredLogger.error('error message');

      expect(consoleSpy).toHaveBeenCalledTimes(2); // Only warn and error
    });

    test('should check log level correctly', () => {
      structuredLogger.logLevel = 'info';

      expect(structuredLogger.shouldLog('error')).toBe(true);
      expect(structuredLogger.shouldLog('warn')).toBe(true);
      expect(structuredLogger.shouldLog('info')).toBe(true);
      expect(structuredLogger.shouldLog('debug')).toBe(false);
      expect(structuredLogger.shouldLog('trace')).toBe(false);
    });
  });

  describe('Log Entry Creation', () => {
    test('should create structured log entry', () => {
      const entry = structuredLogger.createLogEntry('info', 'test message', {
        key: 'value'
      });

      expect(entry).toEqual({
        timestamp: expect.any(String),
        level: 'info',
        message: 'test message',
        correlationId: 'test-correlation-id',
        pid: process.pid,
        key: 'value'
      });

      expect(new Date(entry.timestamp)).toBeInstanceOf(Date);
    });

    test('should include correlation ID from audit logger', () => {
      auditLogger.getCorrelationId.mockReturnValue('custom-correlation-id');

      const entry = structuredLogger.createLogEntry('info', 'test');

      expect(entry.correlationId).toBe('custom-correlation-id');
    });
  });

  describe('Basic Logging Methods', () => {
    test('should log error with metadata', () => {
      const error = new Error('Test error');
      structuredLogger.error('Error occurred', { 
        error,
        userId: 'user-123' 
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"level":"error"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Error occurred"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"userId":"user-123"')
      );
    });

    test('should log warning', () => {
      structuredLogger.warn('Warning message', { key: 'value' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"level":"warn"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Warning message"')
      );
    });

    test('should log info', () => {
      structuredLogger.info('Info message');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"level":"info"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Info message"')
      );
    });

    test('should log debug when level allows', () => {
      structuredLogger.logLevel = 'debug';
      structuredLogger.debug('Debug message');

      expect(consoleSpy).toHaveBeenCalled();
    });

    test('should log trace when level allows', () => {
      structuredLogger.logLevel = 'trace';
      structuredLogger.trace('Trace message');

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('Specialized Logging Methods', () => {
    test('should log HTTP request', () => {
      const request = {
        method: 'GET',
        url: '/api/test',
        headers: { 'user-agent': 'test-agent' },
        ip: '127.0.0.1',
        user: { userId: 'user-123' }
      };
      const response = { statusCode: 200 };
      const responseTime = 150;

      structuredLogger.logRequest(request, response, responseTime);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"HTTP Request"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"method":"GET"')
      );
    });

    test('should log database operation', () => {
      structuredLogger.logDatabaseOperation('query', 'projects', {
        duration: 50,
        recordCount: 10
      });

      // Debug level should not log when level is 'info'
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    test('should log AI interaction and audit trail', async () => {
      await structuredLogger.logAIInteraction('openai', 'gpt-4', 'code_generation', {
        promptSnapshot: 'Generate a function',
        generatedFiles: [{ path: 'test.js', content: 'function test() {}' }],
        projectId: 'project-123'
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"AI Model Interaction"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"provider":"openai"')
      );

      expect(auditLogger.logAIAction).toHaveBeenCalledWith(
        'gpt-4',
        'code_generation',
        'Generate a function',
        [{ path: 'test.js', content: 'function test() {}' }],
        {
          provider: 'openai',
          promptSnapshot: 'Generate a function',
          generatedFiles: [{ path: 'test.js', content: 'function test() {}' }],
          projectId: 'project-123'
        }
      );
    });

    test('should log build operation and audit trail', async () => {
      await structuredLogger.logBuildOperation('build-123', 'project-456', 'build_started', {
        actor: 'user-789'
      });

      expect(consoleSpy).toHaveBeenCalled();
      expect(auditLogger.logBuildEvent).toHaveBeenCalledWith(
        'build-123',
        'project-456',
        'build_started',
        { actor: 'user-789' }
      );
    });

    test('should log deployment operation and audit trail', async () => {
      await structuredLogger.logDeploymentOperation(
        'deploy-123',
        'project-456',
        'build-789',
        'deploy_started',
        { target: 'production' }
      );

      expect(consoleSpy).toHaveBeenCalled();
      expect(auditLogger.logDeploymentEvent).toHaveBeenCalledWith(
        'deploy-123',
        'project-456',
        'build-789',
        'deploy_started',
        { target: 'production' }
      );
    });

    test('should log security event and audit trail', async () => {
      await structuredLogger.logSecurityEvent('failed_login', 'user-123', {
        ipAddress: '192.168.1.1'
      });

      expect(consoleSpy).toHaveBeenCalled();
      expect(auditLogger.logSecurityEvent).toHaveBeenCalledWith(
        'failed_login',
        'user-123',
        { ipAddress: '192.168.1.1' }
      );
    });

    test('should log cost event and audit trail', async () => {
      await structuredLogger.logCostEvent('api_usage', 5.25, 'USD', {
        resourceType: 'compute'
      });

      expect(consoleSpy).toHaveBeenCalled();
      expect(auditLogger.logCostEvent).toHaveBeenCalledWith(
        'api_usage',
        5.25,
        'USD',
        { resourceType: 'compute' }
      );
    });
  });

  describe('Child Logger', () => {
    test('should create child logger with context', () => {
      const childLogger = structuredLogger.child({
        userId: 'user-123',
        projectId: 'project-456'
      });

      childLogger.info('Child log message');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Child log message"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"userId":"user-123"')
      );
    });

    test('should merge child context with additional metadata', () => {
      const childLogger = structuredLogger.child({ userId: 'user-123' });

      childLogger.info('Test message', { action: 'test_action' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Test message"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"action":"test_action"')
      );
    });
  });

  describe('Correlation ID Management', () => {
    test('should set correlation ID', () => {
      structuredLogger.setCorrelationId('new-correlation-id');

      expect(auditLogger.setCorrelationId).toHaveBeenCalledWith('new-correlation-id');
    });

    test('should get correlation ID', () => {
      auditLogger.getCorrelationId.mockReturnValue('current-correlation-id');

      const correlationId = structuredLogger.getCorrelationId();

      expect(correlationId).toBe('current-correlation-id');
    });
  });

  describe('Error Handling', () => {
    test('should handle audit logging errors gracefully', async () => {
      auditLogger.logAIAction.mockRejectedValue(new Error('Audit failed'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await structuredLogger.logAIInteraction('openai', 'gpt-4', 'test');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to log AI interaction to audit trail:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    test('should log error with audit data', async () => {
      await structuredLogger.error('Test error', { key: 'value' }, {
        projectId: 'project-123'
      });

      expect(auditLogger.logSystemEvent).toHaveBeenCalledWith(
        'error',
        'system_error',
        {
          message: 'Test error',
          projectId: 'project-123',
          severity: 'high'
        }
      );
    });
  });
});