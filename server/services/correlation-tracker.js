const crypto = require('crypto');
const structuredLogger = require('./structured-logger');

class CorrelationTracker {
  constructor() {
    this.activeCorrelations = new Map();
    this.correlationHistory = new Map();
    this.maxHistorySize = 10000;
  }

  /**
   * Generate a new correlation ID
   */
  generateCorrelationId(prefix = 'req') {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(6).toString('hex');
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Start tracking a correlation
   */
  startCorrelation(correlationId, context = {}) {
    const correlation = {
      id: correlationId,
      startTime: Date.now(),
      context,
      events: [],
      childCorrelations: new Set(),
      parentCorrelation: null
    };

    this.activeCorrelations.set(correlationId, correlation);
    
    structuredLogger.debug('Started correlation tracking', {
      correlationId,
      context
    });

    return correlation;
  }

  /**
   * End correlation tracking
   */
  endCorrelation(correlationId, result = {}) {
    const correlation = this.activeCorrelations.get(correlationId);
    
    if (!correlation) {
      structuredLogger.warn('Attempted to end non-existent correlation', {
        correlationId
      });
      return null;
    }

    correlation.endTime = Date.now();
    correlation.duration = correlation.endTime - correlation.startTime;
    correlation.result = result;

    // Move to history
    this.moveToHistory(correlation);
    this.activeCorrelations.delete(correlationId);

    structuredLogger.debug('Ended correlation tracking', {
      correlationId,
      duration: correlation.duration,
      eventCount: correlation.events.length
    });

    return correlation;
  }

  /**
   * Add event to correlation
   */
  addEvent(correlationId, event) {
    const correlation = this.activeCorrelations.get(correlationId);
    
    if (!correlation) {
      structuredLogger.warn('Attempted to add event to non-existent correlation', {
        correlationId,
        event: event.type
      });
      return false;
    }

    const correlationEvent = {
      ...event,
      timestamp: Date.now(),
      sequenceNumber: correlation.events.length + 1
    };

    correlation.events.push(correlationEvent);
    
    return true;
  }

  /**
   * Create child correlation
   */
  createChildCorrelation(parentCorrelationId, childPrefix = 'child') {
    const parentCorrelation = this.activeCorrelations.get(parentCorrelationId);
    
    if (!parentCorrelation) {
      structuredLogger.warn('Attempted to create child of non-existent correlation', {
        parentCorrelationId
      });
      return null;
    }

    const childCorrelationId = this.generateCorrelationId(childPrefix);
    const childCorrelation = this.startCorrelation(childCorrelationId, {
      parentCorrelationId,
      type: 'child'
    });

    childCorrelation.parentCorrelation = parentCorrelationId;
    parentCorrelation.childCorrelations.add(childCorrelationId);

    return childCorrelationId;
  }

  /**
   * Get correlation details
   */
  getCorrelation(correlationId) {
    // Check active correlations first
    let correlation = this.activeCorrelations.get(correlationId);
    
    if (!correlation) {
      // Check history
      correlation = this.correlationHistory.get(correlationId);
    }

    return correlation;
  }

  /**
   * Get correlation tree (parent and all children)
   */
  getCorrelationTree(correlationId) {
    const correlation = this.getCorrelation(correlationId);
    
    if (!correlation) {
      return null;
    }

    const tree = {
      root: correlation,
      children: []
    };

    // Get all child correlations
    for (const childId of correlation.childCorrelations) {
      const childCorrelation = this.getCorrelation(childId);
      if (childCorrelation) {
        tree.children.push(childCorrelation);
      }
    }

    return tree;
  }

  /**
   * Move correlation to history
   */
  moveToHistory(correlation) {
    // Implement LRU eviction if history is full
    if (this.correlationHistory.size >= this.maxHistorySize) {
      const oldestKey = this.correlationHistory.keys().next().value;
      this.correlationHistory.delete(oldestKey);
    }

    this.correlationHistory.set(correlation.id, correlation);
  }

  /**
   * Get active correlations count
   */
  getActiveCount() {
    return this.activeCorrelations.size;
  }

  /**
   * Get correlation statistics
   */
  getStatistics() {
    const stats = {
      activeCorrelations: this.activeCorrelations.size,
      historicalCorrelations: this.correlationHistory.size,
      averageDuration: 0,
      eventCounts: {
        total: 0,
        byType: {}
      }
    };

    let totalDuration = 0;
    let completedCount = 0;

    // Analyze historical correlations
    for (const correlation of this.correlationHistory.values()) {
      if (correlation.duration) {
        totalDuration += correlation.duration;
        completedCount++;
      }

      stats.eventCounts.total += correlation.events.length;

      correlation.events.forEach(event => {
        stats.eventCounts.byType[event.type] = 
          (stats.eventCounts.byType[event.type] || 0) + 1;
      });
    }

    if (completedCount > 0) {
      stats.averageDuration = totalDuration / completedCount;
    }

    return stats;
  }

  /**
   * Clean up old correlations
   */
  cleanup(maxAge = 24 * 60 * 60 * 1000) { // 24 hours default
    const cutoffTime = Date.now() - maxAge;
    let cleanedCount = 0;

    // Clean up active correlations that are too old
    for (const [id, correlation] of this.activeCorrelations.entries()) {
      if (correlation.startTime < cutoffTime) {
        this.endCorrelation(id, { reason: 'cleanup_timeout' });
        cleanedCount++;
      }
    }

    // Clean up history
    for (const [id, correlation] of this.correlationHistory.entries()) {
      if (correlation.startTime < cutoffTime) {
        this.correlationHistory.delete(id);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      structuredLogger.info('Cleaned up old correlations', {
        cleanedCount,
        maxAge
      });
    }

    return cleanedCount;
  }

  /**
   * Export correlation data for analysis
   */
  exportCorrelationData(correlationId) {
    const correlation = this.getCorrelation(correlationId);
    
    if (!correlation) {
      return null;
    }

    return {
      id: correlation.id,
      startTime: new Date(correlation.startTime).toISOString(),
      endTime: correlation.endTime ? new Date(correlation.endTime).toISOString() : null,
      duration: correlation.duration,
      context: correlation.context,
      events: correlation.events.map(event => ({
        ...event,
        timestamp: new Date(event.timestamp).toISOString()
      })),
      childCorrelations: Array.from(correlation.childCorrelations),
      parentCorrelation: correlation.parentCorrelation,
      result: correlation.result
    };
  }

  /**
   * Search correlations by context
   */
  searchCorrelations(searchCriteria) {
    const results = [];
    
    const searchInCorrelation = (correlation) => {
      let matches = true;
      
      for (const [key, value] of Object.entries(searchCriteria)) {
        if (key === 'userId' && correlation.context.userId !== value) {
          matches = false;
          break;
        }
        if (key === 'projectId' && correlation.context.projectId !== value) {
          matches = false;
          break;
        }
        if (key === 'eventType') {
          const hasEventType = correlation.events.some(event => event.type === value);
          if (!hasEventType) {
            matches = false;
            break;
          }
        }
        if (key === 'minDuration' && (!correlation.duration || correlation.duration < value)) {
          matches = false;
          break;
        }
        if (key === 'maxDuration' && correlation.duration && correlation.duration > value) {
          matches = false;
          break;
        }
      }
      
      return matches;
    };

    // Search active correlations
    for (const correlation of this.activeCorrelations.values()) {
      if (searchInCorrelation(correlation)) {
        results.push(this.exportCorrelationData(correlation.id));
      }
    }

    // Search historical correlations
    for (const correlation of this.correlationHistory.values()) {
      if (searchInCorrelation(correlation)) {
        results.push(this.exportCorrelationData(correlation.id));
      }
    }

    return results;
  }
}

// Create singleton instance
const correlationTracker = new CorrelationTracker();

// Schedule periodic cleanup
setInterval(() => {
  correlationTracker.cleanup();
}, 60 * 60 * 1000); // Clean up every hour

module.exports = correlationTracker;