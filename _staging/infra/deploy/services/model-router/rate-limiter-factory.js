/**
 * Rate Limiter Factory
 * 
 * Creates and manages Bottleneck rate limiters for AI providers.
 * Provides per-provider rate limiting with configurable parameters.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.5
 */

import Bottleneck from 'bottleneck';

/**
 * Create a rate limiter instance
 * @param {Object} config - Rate limiter configuration
 * @param {number} config.maxConcurrent - Maximum concurrent requests (default: 5)
 * @param {number} config.minTime - Minimum time between requests in ms (default: 200)
 * @param {number} config.reservoir - Initial token bucket size (default: 100)
 * @param {number} config.reservoirRefreshAmount - Tokens to add on refresh (default: 100)
 * @param {number} config.reservoirRefreshInterval - Refresh interval in ms (default: 60000)
 * @param {string} config.id - Identifier for this limiter (for logging)
 * @returns {Bottleneck} Configured rate limiter instance
 */
export function createRateLimiter(config = {}) {
  const {
    maxConcurrent = 5,
    minTime = 200,
    reservoir = 100,
    reservoirRefreshAmount = 100,
    reservoirRefreshInterval = 60000,
    id = 'default'
  } = config;

  const limiter = new Bottleneck({
    maxConcurrent,
    minTime,
    reservoir,
    reservoirRefreshAmount,
    reservoirRefreshInterval,
    id
  });

  // Add event listeners for monitoring
  setupMonitoring(limiter, id);

  return limiter;
}

/**
 * Create a group of rate limiters (one per provider)
 * @param {Object} providersConfig - Configuration for multiple providers
 * @returns {Bottleneck.Group} Group of rate limiters
 */
export function createRateLimiterGroup(providersConfig = {}) {
  const group = new Bottleneck.Group({
    // Default settings for all limiters in the group
    maxConcurrent: 5,
    minTime: 200,
    reservoir: 100,
    reservoirRefreshAmount: 100,
    reservoirRefreshInterval: 60000
  });

  // Configure individual provider limiters
  for (const [providerName, config] of Object.entries(providersConfig)) {
    const limiter = group.key(providerName);
    
    // Update limiter with provider-specific config
    if (config.maxConcurrent !== undefined) {
      limiter.updateSettings({ maxConcurrent: config.maxConcurrent });
    }
    if (config.minTime !== undefined) {
      limiter.updateSettings({ minTime: config.minTime });
    }
    if (config.reservoir !== undefined) {
      limiter.updateSettings({ 
        reservoir: config.reservoir,
        reservoirRefreshAmount: config.reservoirRefreshAmount || config.reservoir,
        reservoirRefreshInterval: config.reservoirRefreshInterval || 60000
      });
    }

    // Setup monitoring for this provider's limiter
    setupMonitoring(limiter, providerName);
  }

  return group;
}

/**
 * Setup monitoring and event listeners for a rate limiter
 * @param {Bottleneck} limiter - Rate limiter instance
 * @param {string} id - Identifier for logging
 */
function setupMonitoring(limiter, id) {
  // Track when jobs are queued
  limiter.on('queued', (info) => {
    if (info && info.options && info.options.id) {
      console.debug(`[RateLimiter:${id}] Job queued`, {
        jobId: info.options.id,
        queueSize: limiter.counts().QUEUED
      });
    }
  });

  // Track when jobs start executing
  limiter.on('executing', (info) => {
    if (info && info.options && info.options.id) {
      console.debug(`[RateLimiter:${id}] Job executing`, {
        jobId: info.options.id,
        running: limiter.counts().RUNNING
      });
    }
  });

  // Track when jobs complete
  limiter.on('done', (info) => {
    if (info && info.options && info.options.id) {
      console.debug(`[RateLimiter:${id}] Job completed`, {
        jobId: info.options.id,
        queueSize: limiter.counts().QUEUED
      });
    }
  });

  // Track when jobs fail
  limiter.on('failed', (error, info) => {
    if (info && info.options && info.options.id) {
      console.warn(`[RateLimiter:${id}] Job failed`, {
        jobId: info.options.id,
        error: error.message
      });
    }
  });

  // Track when reservoir is depleted
  limiter.on('depleted', () => {
    console.warn(`[RateLimiter:${id}] Rate limit reservoir depleted`, {
      counts: limiter.counts()
    });
  });

  // Track when jobs are dropped due to rate limiting
  limiter.on('dropped', (dropped) => {
    console.error(`[RateLimiter:${id}] Job dropped due to rate limiting`, {
      dropped
    });
  });
}

/**
 * Get current status of a rate limiter
 * @param {Bottleneck} limiter - Rate limiter instance
 * @returns {Object} Current status
 */
export function getRateLimiterStatus(limiter) {
  const counts = limiter.counts();
  
  return {
    queued: counts.QUEUED || 0,
    running: counts.RUNNING || 0,
    executing: counts.EXECUTING || 0,
    done: counts.DONE || 0,
    failed: counts.FAILED || 0
  };
}

/**
 * Wrap a function with rate limiting
 * @param {Function} fn - Function to wrap
 * @param {Bottleneck} limiter - Rate limiter to use
 * @param {Object} options - Additional options
 * @returns {Function} Wrapped function
 */
export function withRateLimit(fn, limiter, options = {}) {
  return async (...args) => {
    return limiter.schedule(options, () => fn(...args));
  };
}

/**
 * Create rate limiter with common presets
 * @param {string} preset - Preset name ('conservative', 'moderate', 'aggressive')
 * @param {string} id - Identifier for this limiter
 * @returns {Bottleneck} Configured rate limiter
 */
export function createRateLimiterWithPreset(preset, id = 'default') {
  const presets = {
    conservative: {
      maxConcurrent: 2,
      minTime: 500,
      reservoir: 50,
      reservoirRefreshAmount: 50,
      reservoirRefreshInterval: 60000
    },
    moderate: {
      maxConcurrent: 5,
      minTime: 200,
      reservoir: 100,
      reservoirRefreshAmount: 100,
      reservoirRefreshInterval: 60000
    },
    aggressive: {
      maxConcurrent: 10,
      minTime: 100,
      reservoir: 200,
      reservoirRefreshAmount: 200,
      reservoirRefreshInterval: 60000
    }
  };

  const config = presets[preset] || presets.moderate;
  return createRateLimiter({ ...config, id });
}

export default {
  createRateLimiter,
  createRateLimiterGroup,
  getRateLimiterStatus,
  withRateLimit,
  createRateLimiterWithPreset
};
