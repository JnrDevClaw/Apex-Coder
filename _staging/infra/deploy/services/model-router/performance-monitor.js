/**
 * Performance Monitor
 * 
 * Tracks and analyzes performance metrics including p50, p95, p99 latencies.
 * Monitors system performance under high load and provides insights.
 * 
 * Requirements: 20.5
 */

/**
 * Percentile calculator for latency metrics
 */
class PercentileCalculator {
  constructor(maxSize = 10000) {
    this.values = [];
    this.maxSize = maxSize;
    this.sorted = false;
  }

  /**
   * Add a value to the dataset
   * @param {number} value - Value to add
   */
  add(value) {
    this.values.push(value);
    this.sorted = false;

    // Keep only recent values to prevent memory issues
    if (this.values.length > this.maxSize) {
      this.values.shift();
    }
  }

  /**
   * Calculate percentile
   * @param {number} percentile - Percentile to calculate (0-100)
   * @returns {number} Percentile value
   */
  calculate(percentile) {
    if (this.values.length === 0) {
      return 0;
    }

    if (!this.sorted) {
      this.values.sort((a, b) => a - b);
      this.sorted = true;
    }

    const index = Math.ceil((percentile / 100) * this.values.length) - 1;
    return this.values[Math.max(0, index)];
  }

  /**
   * Get all common percentiles
   * @returns {Object} Percentile values
   */
  getPercentiles() {
    return {
      p50: this.calculate(50),
      p75: this.calculate(75),
      p90: this.calculate(90),
      p95: this.calculate(95),
      p99: this.calculate(99),
      min: this.values.length > 0 ? Math.min(...this.values) : 0,
      max: this.values.length > 0 ? Math.max(...this.values) : 0,
      count: this.values.length
    };
  }

  /**
   * Calculate average
   * @returns {number} Average value
   */
  average() {
    if (this.values.length === 0) {
      return 0;
    }
    return this.values.reduce((sum, val) => sum + val, 0) / this.values.length;
  }

  /**
   * Reset calculator
   */
  reset() {
    this.values = [];
    this.sorted = false;
  }
}

/**
 * Performance monitor for tracking latency and throughput
 */
class PerformanceMonitor {
  constructor(options = {}) {
    this.windowSize = options.windowSize || 60000; // 1 minute window
    this.maxDataPoints = options.maxDataPoints || 10000;
    
    // Per-provider metrics
    this.providerMetrics = new Map();
    
    // Global metrics
    this.globalLatency = new PercentileCalculator(this.maxDataPoints);
    this.requestCount = 0;
    this.errorCount = 0;
    this.startTime = Date.now();
    
    // High load detection
    this.highLoadThreshold = options.highLoadThreshold || 100; // requests per second
    this.highLoadWarningIssued = false;
  }

  /**
   * Get or create metrics for a provider
   * @param {string} provider - Provider name
   * @returns {Object} Provider metrics
   */
  getProviderMetrics(provider) {
    if (!this.providerMetrics.has(provider)) {
      this.providerMetrics.set(provider, {
        latency: new PercentileCalculator(this.maxDataPoints),
        requestCount: 0,
        errorCount: 0,
        successCount: 0,
        totalTokens: 0,
        totalCost: 0,
        lastRequestTime: null
      });
    }
    return this.providerMetrics.get(provider);
  }

  /**
   * Record a request
   * @param {Object} data - Request data
   */
  recordRequest(data) {
    const {
      provider,
      latency,
      status,
      tokens = {},
      cost = 0
    } = data;

    // Update global metrics
    this.requestCount++;
    this.globalLatency.add(latency);

    if (status === 'error') {
      this.errorCount++;
    }

    // Update provider metrics
    if (provider) {
      const metrics = this.getProviderMetrics(provider);
      metrics.requestCount++;
      metrics.latency.add(latency);
      metrics.lastRequestTime = Date.now();

      if (status === 'success') {
        metrics.successCount++;
        metrics.totalTokens += (tokens.total || 0);
        metrics.totalCost += cost;
      } else {
        metrics.errorCount++;
      }
    }

    // Check for high load
    this.checkHighLoad();
  }

  /**
   * Check if system is under high load
   */
  checkHighLoad() {
    const now = Date.now();
    const elapsedSeconds = (now - this.startTime) / 1000;
    const requestsPerSecond = this.requestCount / elapsedSeconds;

    if (requestsPerSecond > this.highLoadThreshold && !this.highLoadWarningIssued) {
      console.warn('⚠️  High load detected', {
        requestsPerSecond: requestsPerSecond.toFixed(2),
        threshold: this.highLoadThreshold,
        totalRequests: this.requestCount,
        elapsedSeconds: elapsedSeconds.toFixed(2)
      });
      this.highLoadWarningIssued = true;
    }
  }

  /**
   * Get performance metrics
   * @param {string} provider - Provider name (optional)
   * @returns {Object} Performance metrics
   */
  getMetrics(provider = null) {
    if (provider) {
      return this.getProviderPerformanceMetrics(provider);
    }

    return this.getGlobalPerformanceMetrics();
  }

  /**
   * Get global performance metrics
   * @returns {Object} Global metrics
   */
  getGlobalPerformanceMetrics() {
    const now = Date.now();
    const elapsedSeconds = (now - this.startTime) / 1000;
    const requestsPerSecond = this.requestCount / elapsedSeconds;

    return {
      latency: this.globalLatency.getPercentiles(),
      throughput: {
        requestsPerSecond: parseFloat(requestsPerSecond.toFixed(2)),
        totalRequests: this.requestCount,
        successRate: this.requestCount > 0 
          ? parseFloat(((this.requestCount - this.errorCount) / this.requestCount * 100).toFixed(2))
          : 0
      },
      errors: {
        total: this.errorCount,
        rate: this.requestCount > 0
          ? parseFloat((this.errorCount / this.requestCount * 100).toFixed(2))
          : 0
      },
      uptime: {
        seconds: parseFloat(elapsedSeconds.toFixed(2)),
        startTime: new Date(this.startTime).toISOString()
      },
      providers: Array.from(this.providerMetrics.keys())
    };
  }

  /**
   * Get performance metrics for a specific provider
   * @param {string} provider - Provider name
   * @returns {Object} Provider metrics
   */
  getProviderPerformanceMetrics(provider) {
    const metrics = this.getProviderMetrics(provider);
    
    return {
      provider,
      latency: metrics.latency.getPercentiles(),
      requests: {
        total: metrics.requestCount,
        success: metrics.successCount,
        errors: metrics.errorCount,
        successRate: metrics.requestCount > 0
          ? parseFloat((metrics.successCount / metrics.requestCount * 100).toFixed(2))
          : 0
      },
      tokens: {
        total: metrics.totalTokens,
        average: metrics.successCount > 0
          ? parseFloat((metrics.totalTokens / metrics.successCount).toFixed(2))
          : 0
      },
      cost: {
        total: parseFloat(metrics.totalCost.toFixed(6)),
        average: metrics.successCount > 0
          ? parseFloat((metrics.totalCost / metrics.successCount).toFixed(6))
          : 0
      },
      lastRequestTime: metrics.lastRequestTime 
        ? new Date(metrics.lastRequestTime).toISOString()
        : null
    };
  }

  /**
   * Get all provider metrics
   * @returns {Object} All provider metrics
   */
  getAllProviderMetrics() {
    const allMetrics = {};
    
    for (const provider of this.providerMetrics.keys()) {
      allMetrics[provider] = this.getProviderPerformanceMetrics(provider);
    }

    return allMetrics;
  }

  /**
   * Check if latency is within acceptable limits
   * @param {string} provider - Provider name (optional)
   * @param {number} threshold - Latency threshold in ms (default: 5000)
   * @returns {Object} Health check result
   */
  checkLatencyHealth(provider = null, threshold = 5000) {
    const metrics = provider 
      ? this.getProviderPerformanceMetrics(provider)
      : this.getGlobalPerformanceMetrics();

    const p95 = metrics.latency.p95;
    const healthy = p95 < threshold;

    return {
      healthy,
      p95,
      threshold,
      message: healthy 
        ? `Latency is healthy (p95: ${p95}ms < ${threshold}ms)`
        : `Latency is unhealthy (p95: ${p95}ms >= ${threshold}ms)`
    };
  }

  /**
   * Get performance summary
   * @returns {Object} Performance summary
   */
  getSummary() {
    const global = this.getGlobalPerformanceMetrics();
    const providers = this.getAllProviderMetrics();

    return {
      global,
      providers,
      health: {
        latency: this.checkLatencyHealth(),
        highLoad: global.throughput.requestsPerSecond > this.highLoadThreshold
      }
    };
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.globalLatency.reset();
    this.requestCount = 0;
    this.errorCount = 0;
    this.startTime = Date.now();
    this.providerMetrics.clear();
    this.highLoadWarningIssued = false;
  }

  /**
   * Reset metrics for a specific provider
   * @param {string} provider - Provider name
   */
  resetProvider(provider) {
    this.providerMetrics.delete(provider);
  }
}

// Singleton instance
const performanceMonitor = new PerformanceMonitor();

module.exports = {
  PerformanceMonitor,
  PercentileCalculator,
  performanceMonitor
};
