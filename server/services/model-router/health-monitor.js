/**
 * Health Monitor Service
 * 
 * Tracks provider health status based on success rate, response time, and error rate.
 * Detects unhealthy providers and supports fallback to healthy providers.
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */

class HealthMonitor {
  constructor(options = {}) {
    this.logger = options.logger || console;
    
    // Health tracking data per provider
    this.providerHealth = new Map();
    
    // Configuration thresholds
    this.config = {
      errorRateThreshold: options.errorRateThreshold || 0.5, // 50%
      latencyThreshold: options.latencyThreshold || 10000, // 10 seconds
      windowSize: options.windowSize || 100, // Track last 100 calls
      recoveryThreshold: options.recoveryThreshold || 0.8, // 80% success rate to recover
      minCallsForHealth: options.minCallsForHealth || 5, // Minimum calls before marking unhealthy
      recoveryCheckInterval: options.recoveryCheckInterval || 60000 // Check recovery every 60s
    };

    // Background recovery monitoring
    this.recoveryCheckTimer = null;
    this.isMonitoring = false;
  }

  /**
   * Track health metrics for a provider call
   * @param {string} provider - Provider name
   * @param {Object} metrics - Call metrics
   * @param {boolean} metrics.success - Whether call succeeded
   * @param {number} metrics.latency - Response time in milliseconds
   * @param {Date} metrics.timestamp - Call timestamp
   * @param {string} metrics.error - Error message if failed
   */
  trackHealth(provider, metrics) {
    if (!provider) {
      throw new Error('Provider name is required');
    }

    // Initialize provider health tracking if not exists
    if (!this.providerHealth.has(provider)) {
      this.providerHealth.set(provider, {
        calls: [],
        status: 'healthy',
        lastUpdated: new Date(),
        stats: {
          totalCalls: 0,
          successfulCalls: 0,
          failedCalls: 0,
          totalLatency: 0,
          avgLatency: 0,
          successRate: 1.0,
          errorRate: 0.0
        }
      });
    }

    const health = this.providerHealth.get(provider);

    // Add call to history (maintain sliding window)
    health.calls.push({
      success: metrics.success,
      latency: metrics.latency,
      timestamp: metrics.timestamp || new Date(),
      error: metrics.error
    });

    // Keep only last N calls (sliding window)
    if (health.calls.length > this.config.windowSize) {
      health.calls.shift();
    }

    // Update statistics
    this.updateProviderStats(provider);

    // Check health status
    this.checkProviderHealth(provider);

    // Log health changes
    if (health.status !== health.previousStatus) {
      this.logger.info('Provider health status changed', {
        provider,
        previousStatus: health.previousStatus,
        newStatus: health.status,
        stats: health.stats
      });
      health.previousStatus = health.status;
    }
  }

  /**
   * Get health status for a specific provider
   * @param {string} provider - Provider name
   * @returns {Object} Health status and metrics
   */
  getProviderHealth(provider) {
    if (!provider) {
      throw new Error('Provider name is required');
    }

    const health = this.providerHealth.get(provider);

    if (!health) {
      return {
        provider,
        status: 'unknown',
        message: 'No health data available',
        stats: {
          totalCalls: 0,
          successfulCalls: 0,
          failedCalls: 0,
          avgLatency: 0,
          successRate: 0,
          errorRate: 0
        }
      };
    }

    return {
      provider,
      status: health.status,
      lastUpdated: health.lastUpdated,
      stats: { ...health.stats },
      recentCalls: health.calls.length,
      message: this.getHealthMessage(health)
    };
  }

  /**
   * Get health status for all providers
   * @returns {Object} Health status for all tracked providers
   */
  getAllProviderHealth() {
    const allHealth = {};

    for (const [provider, _] of this.providerHealth) {
      allHealth[provider] = this.getProviderHealth(provider);
    }

    return allHealth;
  }

  /**
   * Check if a provider is healthy
   * @param {string} provider - Provider name
   * @returns {boolean} True if provider is healthy
   */
  isProviderHealthy(provider) {
    const health = this.getProviderHealth(provider);
    return health.status === 'healthy';
  }

  /**
   * Reset health tracking for a provider
   * @param {string} provider - Provider name
   */
  resetProviderHealth(provider) {
    if (!provider) {
      throw new Error('Provider name is required');
    }

    this.providerHealth.delete(provider);
    
    this.logger.info('Provider health reset', { provider });
  }

  /**
   * Reset health tracking for all providers
   */
  resetAllHealth() {
    this.providerHealth.clear();
    this.logger.info('All provider health data reset');
  }

  /**
   * Update statistics for a provider
   * @private
   */
  updateProviderStats(provider) {
    const health = this.providerHealth.get(provider);
    const calls = health.calls;

    // Calculate statistics from sliding window
    const totalCalls = calls.length;
    const successfulCalls = calls.filter(c => c.success).length;
    const failedCalls = totalCalls - successfulCalls;
    const totalLatency = calls.reduce((sum, c) => sum + (c.latency || 0), 0);
    const avgLatency = totalCalls > 0 ? totalLatency / totalCalls : 0;
    const successRate = totalCalls > 0 ? successfulCalls / totalCalls : 1.0;
    const errorRate = totalCalls > 0 ? failedCalls / totalCalls : 0.0;

    health.stats = {
      totalCalls,
      successfulCalls,
      failedCalls,
      totalLatency,
      avgLatency: Math.round(avgLatency),
      successRate: Math.round(successRate * 1000) / 1000, // Round to 3 decimals
      errorRate: Math.round(errorRate * 1000) / 1000
    };

    health.lastUpdated = new Date();
  }

  /**
   * Check and update provider health status
   * @private
   */
  checkProviderHealth(provider) {
    const health = this.providerHealth.get(provider);
    const stats = health.stats;

    // Need minimum calls before marking unhealthy
    if (stats.totalCalls < this.config.minCallsForHealth) {
      health.status = 'healthy';
      return;
    }

    // Check if provider should be marked unhealthy
    const isHighErrorRate = stats.errorRate > this.config.errorRateThreshold;
    const isHighLatency = stats.avgLatency > this.config.latencyThreshold;

    if (isHighErrorRate || isHighLatency) {
      if (health.status !== 'unhealthy') {
        health.status = 'unhealthy';
        health.unhealthySince = new Date();
        
        this.logger.warn('Provider marked as unhealthy', {
          provider,
          reason: isHighErrorRate ? 'high error rate' : 'high latency',
          errorRate: stats.errorRate,
          avgLatency: stats.avgLatency,
          stats
        });
      }
      return;
    }

    // Check if provider should recover
    if (health.status === 'unhealthy') {
      const shouldRecover = stats.successRate >= this.config.recoveryThreshold;
      
      if (shouldRecover) {
        health.status = 'healthy';
        const unhealthyDuration = health.unhealthySince 
          ? Date.now() - health.unhealthySince.getTime()
          : 0;
        
        this.logger.info('Provider recovered to healthy status', {
          provider,
          unhealthyDuration: Math.round(unhealthyDuration / 1000) + 's',
          successRate: stats.successRate,
          avgLatency: stats.avgLatency,
          stats
        });
        
        delete health.unhealthySince;
      }
    }
  }

  /**
   * Get human-readable health message
   * @private
   */
  getHealthMessage(health) {
    const stats = health.stats;

    if (health.status === 'unknown') {
      return 'No health data available';
    }

    if (health.status === 'healthy') {
      return `Provider is healthy (${Math.round(stats.successRate * 100)}% success rate, ${stats.avgLatency}ms avg latency)`;
    }

    if (health.status === 'unhealthy') {
      const reasons = [];
      
      if (stats.errorRate > this.config.errorRateThreshold) {
        reasons.push(`high error rate (${Math.round(stats.errorRate * 100)}%)`);
      }
      
      if (stats.avgLatency > this.config.latencyThreshold) {
        reasons.push(`high latency (${stats.avgLatency}ms)`);
      }

      return `Provider is unhealthy: ${reasons.join(', ')}`;
    }

    return 'Unknown status';
  }

  /**
   * Get configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update configuration
   * @param {Object} newConfig - New configuration values
   */
  updateConfig(newConfig) {
    this.config = {
      ...this.config,
      ...newConfig
    };

    this.logger.info('Health monitor configuration updated', {
      config: this.config
    });

    // Restart monitoring if interval changed
    if (newConfig.recoveryCheckInterval && this.isMonitoring) {
      this.stopRecoveryMonitoring();
      this.startRecoveryMonitoring();
    }
  }

  /**
   * Start background monitoring for provider recovery
   * Periodically checks unhealthy providers to see if they've recovered
   */
  startRecoveryMonitoring() {
    if (this.isMonitoring) {
      this.logger.warn('Recovery monitoring already started');
      return;
    }

    this.isMonitoring = true;

    this.recoveryCheckTimer = setInterval(() => {
      this.checkProviderRecovery();
    }, this.config.recoveryCheckInterval);

    this.logger.info('Started background recovery monitoring', {
      interval: this.config.recoveryCheckInterval
    });
  }

  /**
   * Stop background monitoring
   */
  stopRecoveryMonitoring() {
    if (!this.isMonitoring) {
      return;
    }

    if (this.recoveryCheckTimer) {
      clearInterval(this.recoveryCheckTimer);
      this.recoveryCheckTimer = null;
    }

    this.isMonitoring = false;

    this.logger.info('Stopped background recovery monitoring');
  }

  /**
   * Check all unhealthy providers for potential recovery
   * @private
   */
  checkProviderRecovery() {
    const unhealthyProviders = [];

    for (const [provider, health] of this.providerHealth) {
      if (health.status === 'unhealthy') {
        unhealthyProviders.push(provider);
      }
    }

    if (unhealthyProviders.length === 0) {
      return;
    }

    this.logger.debug('Checking recovery for unhealthy providers', {
      providers: unhealthyProviders
    });

    for (const provider of unhealthyProviders) {
      const health = this.providerHealth.get(provider);
      
      // Check if provider has recent successful calls
      const recentCalls = health.calls.slice(-10); // Last 10 calls
      const recentSuccesses = recentCalls.filter(c => c.success).length;
      const recentSuccessRate = recentCalls.length > 0 
        ? recentSuccesses / recentCalls.length 
        : 0;

      // If recent success rate is good, consider recovery
      if (recentSuccessRate >= this.config.recoveryThreshold) {
        this.logger.info('Provider showing signs of recovery', {
          provider,
          recentSuccessRate,
          recentCalls: recentCalls.length
        });

        // Force recalculation of health status
        this.checkProviderHealth(provider);
      } else {
        // Log that provider is still unhealthy
        const unhealthyDuration = health.unhealthySince 
          ? Date.now() - health.unhealthySince.getTime()
          : 0;

        this.logger.debug('Provider still unhealthy', {
          provider,
          unhealthyDuration: Math.round(unhealthyDuration / 1000) + 's',
          recentSuccessRate,
          stats: health.stats
        });
      }
    }
  }

  /**
   * Manually mark a provider as healthy (for testing or manual recovery)
   * @param {string} provider - Provider name
   */
  markProviderHealthy(provider) {
    if (!provider) {
      throw new Error('Provider name is required');
    }

    const health = this.providerHealth.get(provider);
    
    if (!health) {
      this.logger.warn('Cannot mark unknown provider as healthy', { provider });
      return;
    }

    const previousStatus = health.status;
    health.status = 'healthy';
    
    if (health.unhealthySince) {
      delete health.unhealthySince;
    }

    this.logger.info('Provider manually marked as healthy', {
      provider,
      previousStatus
    });
  }

  /**
   * Manually mark a provider as unhealthy (for testing or manual intervention)
   * @param {string} provider - Provider name
   * @param {string} reason - Reason for marking unhealthy
   */
  markProviderUnhealthy(provider, reason = 'Manual intervention') {
    if (!provider) {
      throw new Error('Provider name is required');
    }

    const health = this.providerHealth.get(provider);
    
    if (!health) {
      // Initialize if not exists
      this.providerHealth.set(provider, {
        calls: [],
        status: 'unhealthy',
        lastUpdated: new Date(),
        unhealthySince: new Date(),
        stats: {
          totalCalls: 0,
          successfulCalls: 0,
          failedCalls: 0,
          totalLatency: 0,
          avgLatency: 0,
          successRate: 0,
          errorRate: 1.0
        }
      });
    } else {
      const previousStatus = health.status;
      health.status = 'unhealthy';
      
      if (!health.unhealthySince) {
        health.unhealthySince = new Date();
      }

      this.logger.info('Provider manually marked as unhealthy', {
        provider,
        previousStatus,
        reason
      });
    }
  }

  /**
   * Get providers that are currently unhealthy
   * @returns {Array<string>} List of unhealthy provider names
   */
  getUnhealthyProviders() {
    const unhealthy = [];

    for (const [provider, health] of this.providerHealth) {
      if (health.status === 'unhealthy') {
        unhealthy.push(provider);
      }
    }

    return unhealthy;
  }

  /**
   * Get providers that are currently healthy
   * @returns {Array<string>} List of healthy provider names
   */
  getHealthyProviders() {
    const healthy = [];

    for (const [provider, health] of this.providerHealth) {
      if (health.status === 'healthy') {
        healthy.push(provider);
      }
    }

    return healthy;
  }
}

module.exports = HealthMonitor;
