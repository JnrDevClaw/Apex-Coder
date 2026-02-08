const LogStreaming = require('../services/log-streaming');
const WebSocket = require('ws');
const { EventEmitter } = require('events');

// Mock WebSocket
jest.mock('ws');

describe('LogStreaming', () => {
  let logStreaming;
  let mockWsServer;
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock WebSocket client
    mockClient = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
      close: jest.fn(),
      subscriptions: new Set()
    };
    
    // Mock WebSocket server
    mockWsServer = new EventEmitter();
    mockWsServer.close = jest.fn((callback) => callback && callback());
    
    WebSocket.Server = jest.fn().mockImplementation(() => mockWsServer);
    
    logStreaming = new LogStreaming({ port: 3005, maxLogHistory: 100 });
  });

  afterEach(async () => {
    if (logStreaming) {
      await logStreaming.shutdown();
    }
  });

  describe('initialization', () => {
    test('should initialize WebSocket server successfully', async () => {
      await logStreaming.initialize();
      
      expect(WebSocket.Server).toHaveBeenCalledWith({
        port: 3005,
        path: '/logs'
      });
      expect(logStreaming.wsServer).toBe(mockWsServer);
    });

    test('should handle initialization error', async () => {
      WebSocket.Server = jest.fn().mockImplementation(() => {
        throw new Error('Port already in use');
      });
      
      await expect(logStreaming.initialize()).rejects.toThrow('Port already in use');
    });
  });

  describe('client connection handling', () => {
    beforeEach(async () => {
      await logStreaming.initialize();
    });

    test('should handle client connection', () => {
      const mockReq = {};
      
      mockWsServer.emit('connection', mockClient, mockReq);
      
      expect(logStreaming.clients.size).toBe(1);
      expect(mockClient.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'connected',
          clientId: expect.any(String),
          timestamp: expect.any(String)
        })
      );
    });

    test('should handle client disconnection', () => {
      mockWsServer.emit('connection', mockClient, {});
      const clientId = Array.from(logStreaming.clients.keys())[0];
      
      mockClient.emit('close');
      
      expect(logStreaming.clients.has(clientId)).toBe(false);
    });

    test('should handle client error', () => {
      mockWsServer.emit('connection', mockClient, {});
      const clientId = Array.from(logStreaming.clients.keys())[0];
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      mockClient.emit('error', new Error('Connection lost'));
      
      expect(logStreaming.clients.has(clientId)).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('WebSocket error for client'),
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });

    test('should handle invalid client message', () => {
      mockWsServer.emit('connection', mockClient, {});
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      mockClient.emit('message', 'invalid json');
      
      expect(consoleSpy).toHaveBeenCalledWith('Invalid message from client:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });

  describe('client message handling', () => {
    let clientId;

    beforeEach(async () => {
      await logStreaming.initialize();
      mockWsServer.emit('connection', mockClient, {});
      clientId = Array.from(logStreaming.clients.keys())[0];
    });

    test('should handle subscribe message', () => {
      const message = JSON.stringify({
        type: 'subscribe',
        jobId: 'job-123'
      });
      
      mockClient.emit('message', message);
      
      expect(mockClient.subscriptions.has('job-123')).toBe(true);
      expect(mockClient.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'subscribed',
          jobId: 'job-123',
          timestamp: expect.any(String)
        })
      );
    });

    test('should handle unsubscribe message', () => {
      mockClient.subscriptions.add('job-123');
      
      const message = JSON.stringify({
        type: 'unsubscribe',
        jobId: 'job-123'
      });
      
      mockClient.emit('message', message);
      
      expect(mockClient.subscriptions.has('job-123')).toBe(false);
      expect(mockClient.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'unsubscribed',
          jobId: 'job-123',
          timestamp: expect.any(String)
        })
      );
    });

    test('should handle get_history message', () => {
      // Create a log stream with history
      logStreaming.createLogStream('job-123', 'project-456', 'build-789');
      logStreaming.appendLog('job-123', { message: 'Test log 1' });
      logStreaming.appendLog('job-123', { message: 'Test log 2' });
      
      const message = JSON.stringify({
        type: 'get_history',
        jobId: 'job-123',
        limit: 10
      });
      
      mockClient.emit('message', message);
      
      expect(mockClient.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'log_history',
          jobId: 'job-123',
          logs: expect.arrayContaining([
            expect.objectContaining({ message: 'Test log 1' }),
            expect.objectContaining({ message: 'Test log 2' })
          ]),
          timestamp: expect.any(String)
        })
      );
    });

    test('should handle get_history for non-existent job', () => {
      const message = JSON.stringify({
        type: 'get_history',
        jobId: 'non-existent-job'
      });
      
      mockClient.emit('message', message);
      
      expect(mockClient.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'error',
          message: 'No log stream found for job non-existent-job',
          timestamp: expect.any(String)
        })
      );
    });

    test('should handle unknown message type', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const message = JSON.stringify({
        type: 'unknown_type',
        data: 'test'
      });
      
      mockClient.emit('message', message);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown message type from client'),
        'unknown_type'
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('log stream management', () => {
    beforeEach(async () => {
      await logStreaming.initialize();
    });

    test('should create log stream', () => {
      const stream = logStreaming.createLogStream('job-123', 'project-456', 'build-789');
      
      expect(stream).toEqual({
        jobId: 'job-123',
        projectId: 'project-456',
        buildId: 'build-789',
        startedAt: expect.any(Date),
        logs: [],
        status: 'active',
        totalBytes: 0
      });
      
      expect(logStreaming.streams.has('job-123')).toBe(true);
    });

    test('should not create duplicate log stream', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      logStreaming.createLogStream('job-123', 'project-456', 'build-789');
      const stream2 = logStreaming.createLogStream('job-123', 'project-456', 'build-789');
      
      expect(consoleSpy).toHaveBeenCalledWith('Log stream already exists for job job-123');
      expect(stream2).toBe(logStreaming.streams.get('job-123'));
      
      consoleSpy.mockRestore();
    });

    test('should append log entry', () => {
      logStreaming.createLogStream('job-123', 'project-456', 'build-789');
      
      logStreaming.appendLog('job-123', {
        level: 'info',
        message: 'Build started',
        source: 'worker',
        metadata: { step: 1 }
      });
      
      const stream = logStreaming.streams.get('job-123');
      expect(stream.logs).toHaveLength(1);
      expect(stream.logs[0]).toEqual({
        timestamp: expect.any(String),
        level: 'info',
        message: 'Build started',
        source: 'worker',
        metadata: { step: 1 }
      });
      expect(stream.totalBytes).toBeGreaterThan(0);
    });

    test('should append log with defaults', () => {
      logStreaming.createLogStream('job-123', 'project-456', 'build-789');
      
      logStreaming.appendLog('job-123', 'Simple log message');
      
      const stream = logStreaming.streams.get('job-123');
      expect(stream.logs[0]).toEqual({
        timestamp: expect.any(String),
        level: 'info',
        message: 'Simple log message',
        source: 'worker',
        metadata: {}
      });
    });

    test('should handle append log to non-existent stream', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      logStreaming.appendLog('non-existent-job', 'Test message');
      
      expect(consoleSpy).toHaveBeenCalledWith('No log stream found for job non-existent-job');
      
      consoleSpy.mockRestore();
    });

    test('should maintain log history limit', () => {
      logStreaming = new LogStreaming({ maxLogHistory: 3 });
      logStreaming.createLogStream('job-123', 'project-456', 'build-789');
      
      // Add more logs than the limit
      for (let i = 1; i <= 5; i++) {
        logStreaming.appendLog('job-123', `Log message ${i}`);
      }
      
      const stream = logStreaming.streams.get('job-123');
      expect(stream.logs).toHaveLength(3);
      expect(stream.logs[0].message).toBe('Log message 3');
      expect(stream.logs[2].message).toBe('Log message 5');
    });

    test('should append bulk logs', () => {
      logStreaming.createLogStream('job-123', 'project-456', 'build-789');
      
      const bulkLogs = [
        { message: 'Log 1', level: 'info' },
        { message: 'Log 2', level: 'warn' },
        { message: 'Log 3', level: 'error' }
      ];
      
      logStreaming.appendBulkLogs('job-123', bulkLogs);
      
      const stream = logStreaming.streams.get('job-123');
      expect(stream.logs).toHaveLength(3);
      expect(stream.logs.map(log => log.message)).toEqual(['Log 1', 'Log 2', 'Log 3']);
    });

    test('should update stream status', () => {
      logStreaming.createLogStream('job-123', 'project-456', 'build-789');
      
      logStreaming.updateStreamStatus('job-123', 'completed', { exitCode: 0 });
      
      const stream = logStreaming.streams.get('job-123');
      expect(stream.status).toBe('completed');
      expect(stream.completedAt).toBeInstanceOf(Date);
      expect(stream.lastUpdated).toBeInstanceOf(Date);
    });

    test('should close log stream', (done) => {
      logStreaming.createLogStream('job-123', 'project-456', 'build-789');
      
      logStreaming.closeLogStream('job-123');
      
      const stream = logStreaming.streams.get('job-123');
      expect(stream.status).toBe('closed');
      expect(stream.closedAt).toBeInstanceOf(Date);
      
      // Stream should be removed after timeout
      setTimeout(() => {
        expect(logStreaming.streams.has('job-123')).toBe(false);
        done();
      }, 100); // Use shorter timeout for testing
    });
  });

  describe('log stream queries', () => {
    beforeEach(async () => {
      await logStreaming.initialize();
      logStreaming.createLogStream('job-123', 'project-456', 'build-789');
      
      // Add test logs
      logStreaming.appendLog('job-123', { level: 'info', message: 'Info message 1' });
      logStreaming.appendLog('job-123', { level: 'warn', message: 'Warning message' });
      logStreaming.appendLog('job-123', { level: 'error', message: 'Error message' });
      logStreaming.appendLog('job-123', { level: 'info', message: 'Info message 2' });
    });

    test('should get stream logs with default options', () => {
      const result = logStreaming.getStreamLogs('job-123');
      
      expect(result).toEqual({
        jobId: 'job-123',
        logs: expect.arrayContaining([
          expect.objectContaining({ message: 'Info message 1' }),
          expect.objectContaining({ message: 'Warning message' }),
          expect.objectContaining({ message: 'Error message' }),
          expect.objectContaining({ message: 'Info message 2' })
        ]),
        total: 4,
        offset: 0,
        limit: 100,
        hasMore: false
      });
    });

    test('should get stream logs with pagination', () => {
      const result = logStreaming.getStreamLogs('job-123', { limit: 2, offset: 1 });
      
      expect(result.logs).toHaveLength(2);
      expect(result.offset).toBe(1);
      expect(result.limit).toBe(2);
      expect(result.hasMore).toBe(true);
    });

    test('should filter logs by level', () => {
      const result = logStreaming.getStreamLogs('job-123', { level: 'info' });
      
      expect(result.logs).toHaveLength(2);
      expect(result.logs.every(log => log.level === 'info')).toBe(true);
    });

    test('should filter logs by time range', () => {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60000);
      
      const result = logStreaming.getStreamLogs('job-123', { 
        since: oneMinuteAgo.toISOString(),
        until: now.toISOString()
      });
      
      expect(result.logs).toHaveLength(4); // All logs should be within range
    });

    test('should return null for non-existent stream', () => {
      const result = logStreaming.getStreamLogs('non-existent-job');
      
      expect(result).toBeNull();
    });

    test('should search logs', () => {
      const result = logStreaming.searchLogs('job-123', 'Warning');
      
      expect(result).toEqual({
        jobId: 'job-123',
        query: 'Warning',
        logs: [expect.objectContaining({ message: 'Warning message' })],
        total: 1,
        hasMore: false
      });
    });

    test('should search logs case insensitive', () => {
      const result = logStreaming.searchLogs('job-123', 'ERROR', { caseSensitive: false });
      
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].message).toBe('Error message');
    });

    test('should search logs case sensitive', () => {
      const result = logStreaming.searchLogs('job-123', 'error', { caseSensitive: true });
      
      expect(result.logs).toHaveLength(0); // 'error' != 'Error'
    });

    test('should limit search results', () => {
      // Add more matching logs
      for (let i = 0; i < 5; i++) {
        logStreaming.appendLog('job-123', { message: `Info message ${i + 3}` });
      }
      
      const result = logStreaming.searchLogs('job-123', 'Info', { limit: 3 });
      
      expect(result.logs).toHaveLength(3);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('broadcasting', () => {
    let clientId1, clientId2;

    beforeEach(async () => {
      await logStreaming.initialize();
      
      // Add two clients
      const mockClient1 = { ...mockClient, subscriptions: new Set() };
      const mockClient2 = { ...mockClient, subscriptions: new Set() };
      
      mockWsServer.emit('connection', mockClient1, {});
      mockWsServer.emit('connection', mockClient2, {});
      
      const clientIds = Array.from(logStreaming.clients.keys());
      clientId1 = clientIds[0];
      clientId2 = clientIds[1];
      
      // Subscribe clients to different jobs
      logStreaming.clients.get(clientId1).subscriptions.add('job-123');
      logStreaming.clients.get(clientId2).subscriptions.add('job-456');
    });

    test('should broadcast to subscribed clients only', () => {
      logStreaming.broadcastToSubscribers('job-123', {
        type: 'test_message',
        data: 'test'
      });
      
      expect(logStreaming.clients.get(clientId1).send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'test_message',
          data: 'test'
        })
      );
      expect(logStreaming.clients.get(clientId2).send).not.toHaveBeenCalled();
    });

    test('should broadcast stream events', () => {
      logStreaming.clients.get(clientId1).subscriptions.add('job-123');
      
      logStreaming.createLogStream('job-123', 'project-456', 'build-789');
      
      expect(logStreaming.clients.get(clientId1).send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'stream_started',
          jobId: 'job-123',
          projectId: 'project-456',
          buildId: 'build-789',
          timestamp: expect.any(String)
        })
      );
    });

    test('should broadcast log entries', () => {
      logStreaming.clients.get(clientId1).subscriptions.add('job-123');
      logStreaming.createLogStream('job-123', 'project-456', 'build-789');
      
      // Clear previous calls
      logStreaming.clients.get(clientId1).send.mockClear();
      
      logStreaming.appendLog('job-123', { message: 'Test log' });
      
      expect(logStreaming.clients.get(clientId1).send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'log_entry',
          jobId: 'job-123',
          log: expect.objectContaining({ message: 'Test log' })
        })
      );
    });
  });

  describe('statistics and monitoring', () => {
    beforeEach(async () => {
      await logStreaming.initialize();
    });

    test('should get connection stats', () => {
      // Add clients and streams
      mockWsServer.emit('connection', mockClient, {});
      logStreaming.createLogStream('job-123', 'project-456', 'build-789');
      logStreaming.createLogStream('job-456', 'project-789', 'build-123');
      logStreaming.updateStreamStatus('job-456', 'completed');
      
      const stats = logStreaming.getConnectionStats();
      
      expect(stats).toEqual({
        totalClients: 1,
        activeStreams: 1, // Only job-123 is active
        totalStreams: 2,
        subscriptions: 0
      });
    });

    test('should get stream summary', () => {
      logStreaming.createLogStream('job-123', 'project-456', 'build-789');
      logStreaming.appendLog('job-123', { message: 'Test log' });
      
      const summary = logStreaming.getStreamSummary('job-123');
      
      expect(summary).toEqual({
        jobId: 'job-123',
        projectId: 'project-456',
        buildId: 'build-789',
        status: 'active',
        startedAt: expect.any(Date),
        completedAt: undefined,
        closedAt: undefined,
        totalLogs: 1,
        totalBytes: expect.any(Number),
        lastActivity: expect.any(String)
      });
    });

    test('should list active streams', () => {
      logStreaming.createLogStream('job-123', 'project-456', 'build-789');
      logStreaming.createLogStream('job-456', 'project-789', 'build-123');
      logStreaming.updateStreamStatus('job-456', 'completed');
      
      const activeStreams = logStreaming.listActiveStreams();
      
      expect(activeStreams).toHaveLength(1);
      expect(activeStreams[0].jobId).toBe('job-123');
    });
  });

  describe('event emission', () => {
    beforeEach(async () => {
      await logStreaming.initialize();
    });

    test('should emit logEntry event', (done) => {
      logStreaming.createLogStream('job-123', 'project-456', 'build-789');
      
      logStreaming.on('logEntry', (data) => {
        expect(data).toEqual({
          jobId: 'job-123',
          log: expect.objectContaining({ message: 'Test log' })
        });
        done();
      });
      
      logStreaming.appendLog('job-123', { message: 'Test log' });
    });

    test('should emit statusUpdate event', (done) => {
      logStreaming.createLogStream('job-123', 'project-456', 'build-789');
      
      logStreaming.on('statusUpdate', (data) => {
        expect(data).toEqual({
          jobId: 'job-123',
          status: 'completed',
          metadata: { exitCode: 0 }
        });
        done();
      });
      
      logStreaming.updateStreamStatus('job-123', 'completed', { exitCode: 0 });
    });
  });

  describe('shutdown', () => {
    test('should shutdown gracefully', async () => {
      await logStreaming.initialize();
      
      // Add client and stream
      mockWsServer.emit('connection', mockClient, {});
      logStreaming.createLogStream('job-123', 'project-456', 'build-789');
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await logStreaming.shutdown();
      
      expect(mockClient.close).toHaveBeenCalledWith(1000, 'Server shutting down');
      expect(mockWsServer.close).toHaveBeenCalled();
      expect(logStreaming.clients.size).toBe(0);
      expect(logStreaming.streams.size).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith('Log streaming service shutdown complete');
      
      consoleSpy.mockRestore();
    });

    test('should handle client close errors during shutdown', async () => {
      await logStreaming.initialize();
      
      mockClient.close.mockImplementation(() => {
        throw new Error('Close failed');
      });
      mockWsServer.emit('connection', mockClient, {});
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await logStreaming.shutdown();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error closing client'),
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });
});