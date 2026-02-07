const { EventEmitter } = require('events');
const WebSocket = require('ws');

class LogStreaming extends EventEmitter {
  constructor(options = {}) {
    super();
    this.streams = new Map(); // jobId -> stream info
    this.wsServer = null;
    this.clients = new Map(); // clientId -> websocket connection
    this.port = options.port || 3004;
    this.maxLogHistory = options.maxLogHistory || 1000;
  }

  async initialize() {
    try {
      // Create WebSocket server for real-time log streaming
      this.wsServer = new WebSocket.Server({ 
        port: this.port,
        path: '/logs'
      });

      this.wsServer.on('connection', (ws, req) => {
        const clientId = this.generateClientId();
        this.clients.set(clientId, ws);
        
        console.log(`Log streaming client connected: ${clientId}`);

        ws.on('message', (message) => {
          try {
            const data = JSON.parse(message);
            this.handleClientMessage(clientId, data);
          } catch (error) {
            console.error('Invalid message from client:', error);
          }
        });

        ws.on('close', () => {
          this.clients.delete(clientId);
          console.log(`Log streaming client disconnected: ${clientId}`);
        });

        ws.on('error', (error) => {
          console.error(`WebSocket error for client ${clientId}:`, error);
          this.clients.delete(clientId);
        });

        // Send welcome message
        this.sendToClient(clientId, {
          type: 'connected',
          clientId,
          timestamp: new Date().toISOString()
        });
      });

      console.log(`Log streaming server started on port ${this.port}`);
    } catch (error) {
      console.error('Failed to initialize log streaming:', error);
      throw error;
    }
  }

  generateClientId() {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  handleClientMessage(clientId, data) {
    switch (data.type) {
      case 'subscribe':
        this.subscribeToJob(clientId, data.jobId);
        break;
      case 'unsubscribe':
        this.unsubscribeFromJob(clientId, data.jobId);
        break;
      case 'get_history':
        this.sendLogHistory(clientId, data.jobId, data.limit);
        break;
      default:
        console.warn(`Unknown message type from client ${clientId}:`, data.type);
    }
  }

  subscribeToJob(clientId, jobId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Add client to job subscribers
    if (!client.subscriptions) {
      client.subscriptions = new Set();
    }
    client.subscriptions.add(jobId);

    this.sendToClient(clientId, {
      type: 'subscribed',
      jobId,
      timestamp: new Date().toISOString()
    });

    // Send recent log history
    this.sendLogHistory(clientId, jobId, 50);
  }

  unsubscribeFromJob(clientId, jobId) {
    const client = this.clients.get(clientId);
    if (!client || !client.subscriptions) return;

    client.subscriptions.delete(jobId);

    this.sendToClient(clientId, {
      type: 'unsubscribed',
      jobId,
      timestamp: new Date().toISOString()
    });
  }

  sendLogHistory(clientId, jobId, limit = 100) {
    const stream = this.streams.get(jobId);
    if (!stream) {
      this.sendToClient(clientId, {
        type: 'error',
        message: `No log stream found for job ${jobId}`,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const history = stream.logs.slice(-limit);
    this.sendToClient(clientId, {
      type: 'log_history',
      jobId,
      logs: history,
      timestamp: new Date().toISOString()
    });
  }

  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  broadcastToSubscribers(jobId, message) {
    for (const [clientId, client] of this.clients) {
      if (client.subscriptions && client.subscriptions.has(jobId)) {
        this.sendToClient(clientId, message);
      }
    }
  }

  createLogStream(jobId, projectId, buildId) {
    if (this.streams.has(jobId)) {
      console.warn(`Log stream already exists for job ${jobId}`);
      return this.streams.get(jobId);
    }

    const stream = {
      jobId,
      projectId,
      buildId,
      startedAt: new Date(),
      logs: [],
      status: 'active',
      totalBytes: 0
    };

    this.streams.set(jobId, stream);
    console.log(`Created log stream for job ${jobId}`);

    // Broadcast stream creation
    this.broadcastToSubscribers(jobId, {
      type: 'stream_started',
      jobId,
      projectId,
      buildId,
      timestamp: stream.startedAt.toISOString()
    });

    return stream;
  }

  appendLog(jobId, logData) {
    const stream = this.streams.get(jobId);
    if (!stream) {
      console.warn(`No log stream found for job ${jobId}`);
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: logData.level || 'info',
      message: logData.message || logData.toString(),
      source: logData.source || 'worker',
      metadata: logData.metadata || {}
    };

    // Add to stream
    stream.logs.push(logEntry);
    stream.totalBytes += Buffer.byteLength(JSON.stringify(logEntry), 'utf8');

    // Maintain log history limit
    if (stream.logs.length > this.maxLogHistory) {
      stream.logs = stream.logs.slice(-this.maxLogHistory);
    }

    // Broadcast to subscribers
    this.broadcastToSubscribers(jobId, {
      type: 'log_entry',
      jobId,
      log: logEntry
    });

    // Emit event for other services
    this.emit('logEntry', { jobId, log: logEntry });
  }

  appendBulkLogs(jobId, logs) {
    const stream = this.streams.get(jobId);
    if (!stream) {
      console.warn(`No log stream found for job ${jobId}`);
      return;
    }

    const logEntries = logs.map(logData => ({
      timestamp: logData.timestamp || new Date().toISOString(),
      level: logData.level || 'info',
      message: logData.message || logData.toString(),
      source: logData.source || 'worker',
      metadata: logData.metadata || {}
    }));

    // Add to stream
    stream.logs.push(...logEntries);
    stream.totalBytes += logEntries.reduce((sum, entry) => 
      sum + Buffer.byteLength(JSON.stringify(entry), 'utf8'), 0
    );

    // Maintain log history limit
    if (stream.logs.length > this.maxLogHistory) {
      stream.logs = stream.logs.slice(-this.maxLogHistory);
    }

    // Broadcast to subscribers
    this.broadcastToSubscribers(jobId, {
      type: 'bulk_logs',
      jobId,
      logs: logEntries
    });

    // Emit event for other services
    this.emit('bulkLogs', { jobId, logs: logEntries });
  }

  updateStreamStatus(jobId, status, metadata = {}) {
    const stream = this.streams.get(jobId);
    if (!stream) {
      console.warn(`No log stream found for job ${jobId}`);
      return;
    }

    stream.status = status;
    stream.lastUpdated = new Date();

    if (status === 'completed' || status === 'failed') {
      stream.completedAt = new Date();
    }

    // Broadcast status update
    this.broadcastToSubscribers(jobId, {
      type: 'status_update',
      jobId,
      status,
      metadata,
      timestamp: stream.lastUpdated.toISOString()
    });

    // Emit event for other services
    this.emit('statusUpdate', { jobId, status, metadata });
  }

  closeLogStream(jobId) {
    const stream = this.streams.get(jobId);
    if (!stream) {
      console.warn(`No log stream found for job ${jobId}`);
      return;
    }

    stream.status = 'closed';
    stream.closedAt = new Date();

    // Broadcast stream closure
    this.broadcastToSubscribers(jobId, {
      type: 'stream_closed',
      jobId,
      timestamp: stream.closedAt.toISOString(),
      summary: {
        totalLogs: stream.logs.length,
        totalBytes: stream.totalBytes,
        duration: stream.closedAt - stream.startedAt
      }
    });

    // Keep stream for a while for history access
    setTimeout(() => {
      this.streams.delete(jobId);
      console.log(`Removed log stream for job ${jobId}`);
    }, 300000); // 5 minutes

    console.log(`Closed log stream for job ${jobId}`);
  }

  getLogStream(jobId) {
    return this.streams.get(jobId);
  }

  getStreamSummary(jobId) {
    const stream = this.streams.get(jobId);
    if (!stream) return null;

    return {
      jobId: stream.jobId,
      projectId: stream.projectId,
      buildId: stream.buildId,
      status: stream.status,
      startedAt: stream.startedAt,
      completedAt: stream.completedAt,
      closedAt: stream.closedAt,
      totalLogs: stream.logs.length,
      totalBytes: stream.totalBytes,
      lastActivity: stream.logs.length > 0 ? stream.logs[stream.logs.length - 1].timestamp : null
    };
  }

  listActiveStreams() {
    const activeStreams = [];
    for (const [jobId, stream] of this.streams) {
      if (stream.status === 'active') {
        activeStreams.push(this.getStreamSummary(jobId));
      }
    }
    return activeStreams;
  }

  getStreamLogs(jobId, options = {}) {
    const stream = this.streams.get(jobId);
    if (!stream) return null;

    const { 
      limit = 100, 
      offset = 0, 
      level = null, 
      since = null,
      until = null 
    } = options;

    let logs = stream.logs;

    // Filter by level
    if (level) {
      logs = logs.filter(log => log.level === level);
    }

    // Filter by time range
    if (since) {
      const sinceDate = new Date(since);
      logs = logs.filter(log => new Date(log.timestamp) >= sinceDate);
    }

    if (until) {
      const untilDate = new Date(until);
      logs = logs.filter(log => new Date(log.timestamp) <= untilDate);
    }

    // Apply pagination
    const paginatedLogs = logs.slice(offset, offset + limit);

    return {
      jobId,
      logs: paginatedLogs,
      total: logs.length,
      offset,
      limit,
      hasMore: offset + limit < logs.length
    };
  }

  searchLogs(jobId, query, options = {}) {
    const stream = this.streams.get(jobId);
    if (!stream) return null;

    const { 
      limit = 100, 
      caseSensitive = false 
    } = options;

    const searchRegex = new RegExp(query, caseSensitive ? 'g' : 'gi');
    
    const matchingLogs = stream.logs.filter(log => 
      searchRegex.test(log.message) || 
      (log.metadata && searchRegex.test(JSON.stringify(log.metadata)))
    );

    return {
      jobId,
      query,
      logs: matchingLogs.slice(0, limit),
      total: matchingLogs.length,
      hasMore: matchingLogs.length > limit
    };
  }

  getConnectionStats() {
    const stats = {
      totalClients: this.clients.size,
      activeStreams: 0,
      totalStreams: this.streams.size,
      subscriptions: 0
    };

    for (const stream of this.streams.values()) {
      if (stream.status === 'active') {
        stats.activeStreams++;
      }
    }

    for (const client of this.clients.values()) {
      if (client.subscriptions) {
        stats.subscriptions += client.subscriptions.size;
      }
    }

    return stats;
  }

  async shutdown() {
    console.log('Shutting down log streaming service...');

    // Close all WebSocket connections
    for (const [clientId, client] of this.clients) {
      try {
        client.close(1000, 'Server shutting down');
      } catch (error) {
        console.error(`Error closing client ${clientId}:`, error);
      }
    }

    // Close WebSocket server
    if (this.wsServer) {
      await new Promise((resolve) => {
        this.wsServer.close(resolve);
      });
    }

    // Close all active streams
    for (const jobId of this.streams.keys()) {
      this.closeLogStream(jobId);
    }

    this.clients.clear();
    this.streams.clear();

    console.log('Log streaming service shutdown complete');
  }
}

module.exports = LogStreaming;