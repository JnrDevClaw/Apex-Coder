/**
 * Event Stream Manager
 * Centralized WebSocket management for real-time pipeline updates
 * Requirements: 1.2, 7.3
 */

import { 
  processEventStreamMessage, 
  updatePipeline, 
  connectionStatus,
  eventStreamErrors 
} from '../stores/pipeline.js';
import { addNotification } from '../stores/notifications.js';

class EventStreamManager {
  constructor() {
    this.connections = new Map(); // buildId -> WebSocket
    this.reconnectAttempts = new Map(); // buildId -> attempt count
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Base delay in ms
    this.pingInterval = 30000; // 30 seconds
    this.pingTimers = new Map(); // buildId -> timer
  }

  /**
   * Connect to WebSocket for a specific build
   */
  connect(buildId, options = {}) {
    if (this.connections.has(buildId)) {
      console.log(`WebSocket already connected for build ${buildId}`);
      return this.connections.get(buildId);
    }

    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No authentication token available');
      connectionStatus.set('error');
      return null;
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/builds/${buildId}?token=${token}`;

    try {
      connectionStatus.set('connecting');
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => this.handleOpen(buildId, ws);
      ws.onmessage = (event) => this.handleMessage(buildId, event);
      ws.onerror = (error) => this.handleError(buildId, error);
      ws.onclose = (event) => this.handleClose(buildId, event);

      this.connections.set(buildId, ws);
      return ws;
    } catch (error) {
      console.error(`Failed to create WebSocket for build ${buildId}:`, error);
      connectionStatus.set('error');
      return null;
    }
  }

  /**
   * Disconnect WebSocket for a specific build
   */
  disconnect(buildId) {
    const ws = this.connections.get(buildId);
    if (ws) {
      ws.close();
      this.connections.delete(buildId);
      this.reconnectAttempts.delete(buildId);
      
      // Clear ping timer
      const pingTimer = this.pingTimers.get(buildId);
      if (pingTimer) {
        clearInterval(pingTimer);
        this.pingTimers.delete(buildId);
      }
    }
  }

  /**
   * Disconnect all WebSocket connections
   */
  disconnectAll() {
    for (const buildId of this.connections.keys()) {
      this.disconnect(buildId);
    }
  }

  /**
   * Get connection status for a build
   */
  getConnectionStatus(buildId) {
    const ws = this.connections.get(buildId);
    if (!ws) return 'disconnected';
    
    switch (ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CLOSING: return 'disconnecting';
      case WebSocket.CLOSED: return 'disconnected';
      default: return 'unknown';
    }
  }

  /**
   * Send message to WebSocket
   */
  send(buildId, message) {
    const ws = this.connections.get(buildId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  /**
   * Send ping to keep connection alive
   */
  sendPing(buildId) {
    return this.send(buildId, { type: 'ping' });
  }

  /**
   * Handle WebSocket open event
   */
  handleOpen(buildId, ws) {
    console.log(`WebSocket connected for build ${buildId}`);
    connectionStatus.set('connected');
    this.reconnectAttempts.set(buildId, 0);

    // Show reconnection success notification if this was a reconnect
    const attempts = this.reconnectAttempts.get(buildId) || 0;
    if (attempts > 0) {
      addNotification({
        type: 'success',
        message: 'Real-time updates reconnected',
        duration: 3000
      });
    }

    // Set up ping timer
    const pingTimer = setInterval(() => {
      this.sendPing(buildId);
    }, this.pingInterval);
    this.pingTimers.set(buildId, pingTimer);
  }

  /**
   * Handle WebSocket message event
   */
  handleMessage(buildId, event) {
    try {
      const message = JSON.parse(event.data);
      
      // Handle pong response
      if (message.type === 'pong') {
        return;
      }

      // Handle connection confirmation
      if (message.type === 'connected') {
        console.log(`WebSocket connection confirmed for build ${buildId}`);
        return;
      }

      // Process pipeline update message
      const processed = processEventStreamMessage(message);
      if (!processed) {
        console.warn('Failed to process WebSocket message:', message);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
      eventStreamErrors.update(errors => [...errors, {
        timestamp: new Date().toISOString(),
        message: 'Failed to parse WebSocket message',
        details: { error: error.message, data: event.data }
      }]);
      
      addNotification({
        type: 'warning',
        message: 'Received invalid update message',
        duration: 3000
      });
    }
  }

  /**
   * Handle WebSocket error event
   */
  handleError(buildId, error) {
    console.error(`WebSocket error for build ${buildId}:`, error);
    connectionStatus.set('error');
    
    addNotification({
      type: 'warning',
      message: 'Real-time updates connection error',
      duration: 5000
    });
  }

  /**
   * Handle WebSocket close event
   */
  handleClose(buildId, event) {
    console.log(`WebSocket closed for build ${buildId}`, event);
    connectionStatus.set('disconnected');
    
    // Clean up
    this.connections.delete(buildId);
    const pingTimer = this.pingTimers.get(buildId);
    if (pingTimer) {
      clearInterval(pingTimer);
      this.pingTimers.delete(buildId);
    }

    // Attempt reconnection if not a clean close
    if (event.code !== 1000) { // 1000 = normal closure
      this.attemptReconnect(buildId);
    }
  }

  /**
   * Attempt to reconnect WebSocket
   */
  attemptReconnect(buildId) {
    const attempts = this.reconnectAttempts.get(buildId) || 0;
    
    if (attempts >= this.maxReconnectAttempts) {
      console.log(`Max reconnection attempts reached for build ${buildId}`);
      addNotification({
        type: 'error',
        message: 'Real-time updates disconnected. Refresh the page to reconnect.',
        duration: 10000
      });
      return;
    }

    const nextAttempt = attempts + 1;
    this.reconnectAttempts.set(buildId, nextAttempt);
    
    const delay = Math.min(this.reconnectDelay * Math.pow(2, attempts), 30000);
    console.log(`Reconnecting in ${delay}ms (attempt ${nextAttempt}/${this.maxReconnectAttempts})`);
    
    addNotification({
      type: 'info',
      message: `Reconnecting... (attempt ${nextAttempt}/${this.maxReconnectAttempts})`,
      duration: 3000
    });

    setTimeout(() => {
      this.connect(buildId);
    }, delay);
  }

  /**
   * Reset reconnection attempts for a build
   */
  resetReconnectAttempts(buildId) {
    this.reconnectAttempts.set(buildId, 0);
  }

  /**
   * Get all active connections
   */
  getActiveConnections() {
    return Array.from(this.connections.keys());
  }

  /**
   * Check if connected to a specific build
   */
  isConnected(buildId) {
    return this.getConnectionStatus(buildId) === 'connected';
  }
}

// Create singleton instance
export const eventStreamManager = new EventStreamManager();

// Clean up on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    eventStreamManager.disconnectAll();
  });
}

export default eventStreamManager;