/**
 * Analytics Service
 * Tracks user interactions and system usage for monitoring and optimization
 * Implements monitoring requirements from task 13
 */

class AnalyticsService {
  constructor() {
    this.enabled = import.meta.env.VITE_ENABLE_ANALYTICS === 'true';
    this.sessionId = this.generateSessionId();
    this.events = [];
    this.flushInterval = 30000; // 30 seconds
    this.maxBatchSize = 50;
    
    if (this.enabled) {
      this.startFlushTimer();
    }
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Track page view
   */
  trackPageView(pageName, properties = {}) {
    if (!this.enabled) return;

    this.track('page_view', {
      page: pageName,
      url: window.location.href,
      referrer: document.referrer,
      ...properties
    });
  }

  /**
   * Track user action
   */
  trackAction(action, properties = {}) {
    if (!this.enabled) return;

    this.track('user_action', {
      action,
      ...properties
    });
  }

  /**
   * Track pipeline event
   */
  trackPipelineEvent(eventType, pipelineId, properties = {}) {
    if (!this.enabled) return;

    this.track('pipeline_event', {
      eventType,
      pipelineId,
      ...properties
    });
  }

  /**
   * Track error
   */
  trackError(error, context = {}) {
    if (!this.enabled) return;

    this.track('error', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      ...context
    });
  }

  /**
   * Track performance metric
   */
  trackPerformance(metric, value, properties = {}) {
    if (!this.enabled) return;

    this.track('performance', {
      metric,
      value,
      ...properties
    });
  }

  /**
   * Track feature usage
   */
  trackFeatureUsage(feature, properties = {}) {
    if (!this.enabled) return;

    this.track('feature_usage', {
      feature,
      ...properties
    });
  }

  /**
   * Core tracking method
   */
  track(eventType, properties = {}) {
    const event = {
      type: eventType,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      properties: {
        ...properties,
        userAgent: navigator.userAgent,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        screen: {
          width: window.screen.width,
          height: window.screen.height
        }
      }
    };

    this.events.push(event);

    // Flush if batch size reached
    if (this.events.length >= this.maxBatchSize) {
      this.flush();
    }
  }

  /**
   * Flush events to backend
   */
  async flush() {
    if (this.events.length === 0) return;

    const eventsToSend = [...this.events];
    this.events = [];

    try {
      await fetch('/api/analytics/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          events: eventsToSend
        })
      });
    } catch (error) {
      console.error('Failed to send analytics events:', error);
      // Re-add events to queue for retry
      this.events = [...eventsToSend, ...this.events];
    }
  }

  /**
   * Start automatic flush timer
   */
  startFlushTimer() {
    setInterval(() => {
      this.flush();
    }, this.flushInterval);

    // Flush on page unload
    window.addEventListener('beforeunload', () => {
      this.flush();
    });
  }

  /**
   * Track pipeline lifecycle
   */
  trackPipelineLifecycle(pipelineId, stage, status, duration = null) {
    this.trackPipelineEvent('lifecycle', pipelineId, {
      stage,
      status,
      duration
    });
  }

  /**
   * Track user journey
   */
  trackUserJourney(step, properties = {}) {
    this.trackAction('user_journey', {
      step,
      ...properties
    });
  }

  /**
   * Track conversion
   */
  trackConversion(conversionType, properties = {}) {
    this.trackAction('conversion', {
      conversionType,
      ...properties
    });
  }

  /**
   * Track search
   */
  trackSearch(query, results, properties = {}) {
    this.trackAction('search', {
      query,
      resultCount: results,
      ...properties
    });
  }

  /**
   * Track filter usage
   */
  trackFilter(filterType, filterValue, properties = {}) {
    this.trackAction('filter', {
      filterType,
      filterValue,
      ...properties
    });
  }

  /**
   * Track API call
   */
  trackApiCall(endpoint, method, duration, status) {
    this.trackPerformance('api_call', duration, {
      endpoint,
      method,
      status
    });
  }

  /**
   * Track component render time
   */
  trackComponentRender(componentName, duration) {
    this.trackPerformance('component_render', duration, {
      component: componentName
    });
  }

  /**
   * Track resource loading
   */
  trackResourceLoad(resourceType, url, duration) {
    this.trackPerformance('resource_load', duration, {
      resourceType,
      url
    });
  }

  /**
   * Get session summary
   */
  getSessionSummary() {
    return {
      sessionId: this.sessionId,
      eventCount: this.events.length,
      startTime: this.events[0]?.timestamp,
      lastActivity: this.events[this.events.length - 1]?.timestamp
    };
  }
}

// Export singleton instance
export const analytics = new AnalyticsService();

// Export class for testing
export { AnalyticsService };

// Convenience functions
export function trackPageView(pageName, properties) {
  analytics.trackPageView(pageName, properties);
}

export function trackAction(action, properties) {
  analytics.trackAction(action, properties);
}

export function trackPipelineEvent(eventType, pipelineId, properties) {
  analytics.trackPipelineEvent(eventType, pipelineId, properties);
}

export function trackError(error, context) {
  analytics.trackError(error, context);
}

export function trackPerformance(metric, value, properties) {
  analytics.trackPerformance(metric, value, properties);
}

export function trackFeatureUsage(feature, properties) {
  analytics.trackFeatureUsage(feature, properties);
}
