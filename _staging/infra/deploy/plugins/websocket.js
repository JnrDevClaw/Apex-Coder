const fp = require('fastify-plugin');
const websocket = require('@fastify/websocket');

/**
 * WebSocket Plugin for Real-time Progress Updates
 * 
 * Provides WebSocket connections for:
 * - Build progress updates
 * - Job status changes
 * - Phase transitions
 * - Error notifications
 */
async function websocketPlugin(fastify, options) {
  // Register WebSocket support
  await fastify.register(websocket, {
    options: {
      maxPayload: 1048576, // 1MB
      verifyClient: (info, next) => {
        // Verify client connection (can add auth here)
        next(true);
      }
    }
  });

  // Store active connections by buildId
  const connections = new Map();

  // Helper to broadcast to all connections for a build
  const broadcastToBuild = (buildId, message) => {
    const buildConnections = connections.get(buildId);
    if (buildConnections) {
      const messageStr = JSON.stringify(message);
      buildConnections.forEach(socket => {
        if (socket.readyState === 1) { // OPEN
          socket.send(messageStr);
        }
      });
    }
  };

  // Helper to broadcast to a specific user
  const broadcastToUser = (userId, message) => {
    const messageStr = JSON.stringify(message);
    connections.forEach((buildConnections, buildId) => {
      buildConnections.forEach(socket => {
        if (socket.userId === userId && socket.readyState === 1) {
          socket.send(messageStr);
        }
      });
    });
  };

  // WebSocket route for build progress (legacy)
  fastify.get('/ws/builds/:buildId', { websocket: true }, (socket, request) => {
    const { buildId } = request.params;
    const userId = request.query.userId; // In production, get from JWT

    console.log(`WebSocket connection established for build ${buildId}`);

    // Store connection
    if (!connections.has(buildId)) {
      connections.set(buildId, new Set());
    }
    connections.get(buildId).add(socket);
    socket.buildId = buildId;
    socket.userId = userId;

    // Send initial connection confirmation
    socket.send(JSON.stringify({
      type: 'connected',
      buildId,
      timestamp: new Date().toISOString()
    }));

    // Handle incoming messages
    socket.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Handle ping/pong for keep-alive
        if (data.type === 'ping') {
          socket.send(JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString()
          }));
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    // Handle connection close
    socket.on('close', () => {
      console.log(`WebSocket connection closed for build ${buildId}`);
      const buildConnections = connections.get(buildId);
      if (buildConnections) {
        buildConnections.delete(socket);
        if (buildConnections.size === 0) {
          connections.delete(buildId);
        }
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`WebSocket error for build ${buildId}:`, error);
    });
  });

  // Pipeline stream WebSocket route (new - matches frontend expectation)
  fastify.get('/api/pipelines/:id/stream', { websocket: true }, (socket, request) => {
    const buildId = request.params.id;
    const userId = request.query.userId; // In production, get from JWT

    console.log(`Pipeline WebSocket connection established for build ${buildId}`);

    // Store connection
    if (!connections.has(buildId)) {
      connections.set(buildId, new Set());
    }
    connections.get(buildId).add(socket);
    socket.buildId = buildId;
    socket.userId = userId;

    // Send initial connection confirmation
    socket.send(JSON.stringify({
      type: 'connected',
      buildId,
      timestamp: new Date().toISOString()
    }));

    // Handle incoming messages
    socket.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Handle ping/pong for keep-alive
        if (data.type === 'ping') {
          socket.send(JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString()
          }));
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    // Handle connection close
    socket.on('close', () => {
      console.log(`Pipeline WebSocket connection closed for build ${buildId}`);
      const buildConnections = connections.get(buildId);
      if (buildConnections) {
        buildConnections.delete(socket);
        if (buildConnections.size === 0) {
          connections.delete(buildId);
        }
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`Pipeline WebSocket error for build ${buildId}:`, error);
    });
  });

  // Decorate fastify with WebSocket utilities
  fastify.decorate('websocket', {
    // Send progress update for a build
    sendBuildProgress: (buildId, progress) => {
      broadcastToBuild(buildId, {
        type: 'progress',
        buildId,
        progress,
        timestamp: new Date().toISOString()
      });
    },

    // Send phase update
    sendPhaseUpdate: (buildId, phase, status, data = {}) => {
      broadcastToBuild(buildId, {
        type: 'phase',
        buildId,
        phase,
        status,
        data,
        timestamp: new Date().toISOString()
      });
    },

    // Send build status update
    sendBuildStatus: (buildId, status, data = {}) => {
      broadcastToBuild(buildId, {
        type: 'status',
        buildId,
        status,
        data,
        timestamp: new Date().toISOString()
      });
    },

    // Send error notification
    sendError: (buildId, error, phase = null) => {
      broadcastToBuild(buildId, {
        type: 'error',
        buildId,
        phase,
        error: {
          message: error.message || error,
          code: error.code,
          details: error.details
        },
        timestamp: new Date().toISOString()
      });
    },

    // Send log message
    sendLog: (buildId, log) => {
      broadcastToBuild(buildId, {
        type: 'log',
        buildId,
        log,
        timestamp: new Date().toISOString()
      });
    },

    // Send notification to user
    sendUserNotification: (userId, notification) => {
      broadcastToUser(userId, {
        type: 'notification',
        notification,
        timestamp: new Date().toISOString()
      });
    },

    // Get active connections count
    getConnectionsCount: (buildId) => {
      const buildConnections = connections.get(buildId);
      return buildConnections ? buildConnections.size : 0;
    },

    // Get all active builds with connections
    getActiveBuilds: () => {
      return Array.from(connections.keys());
    }
  });

  console.log('WebSocket plugin registered successfully');
}

module.exports = fp(websocketPlugin, {
  name: 'websocket',
  dependencies: []
});
