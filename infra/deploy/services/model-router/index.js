/**
 * Model Router Module
 * 
 * Main entry point for the Model Router service.
 * Exports the ModelRouter class and related utilities.
 */

const ModelRouter = require('./model-router');
const providerRegistry = require('./provider-registry');
const config = require('../../config/model-router-config');
const costTracker = require('./cost-tracker');
const tokenTracker = require('./token-tracker');
const HealthMonitor = require('./health-monitor');
const CacheManager = require('./cache-manager');
const RequestQueue = require('./request-queue');
const { PRIORITY } = require('./request-queue');

// Create and export singleton instances
let routerInstance = null;
let healthMonitorInstance = null;
let cacheManagerInstance = null;

/**
 * Get or create the singleton HealthMonitor instance
 * @param {Object} options - Health monitor options
 * @returns {HealthMonitor} Health monitor instance
 */
function getHealthMonitor(options = {}) {
  if (!healthMonitorInstance) {
    healthMonitorInstance = new HealthMonitor(options);
    
    // Start recovery monitoring by default
    if (options.startRecoveryMonitoring !== false) {
      healthMonitorInstance.startRecoveryMonitoring();
    }
  }
  return healthMonitorInstance;
}

/**
 * Get or create the singleton CacheManager instance
 * @param {Object} options - Cache manager options
 * @returns {CacheManager} Cache manager instance
 */
function getCacheManager(options = {}) {
  if (!cacheManagerInstance) {
    cacheManagerInstance = new CacheManager(options);
  }
  return cacheManagerInstance;
}

/**
 * Get or create the singleton ModelRouter instance
 * @param {Object} options - Router options
 * @returns {ModelRouter} Router instance
 */
function getRouter(options = {}) {
  if (!routerInstance) {
    // Get health monitor instance
    const healthMonitor = getHealthMonitor(options.healthMonitorOptions);
    
    // Get cache manager instance
    const cacheManager = getCacheManager(options.cacheManagerOptions);
    
    // Include cost tracker, token tracker, health monitor, and cache manager in default options if not provided
    const defaultOptions = {
      costTracker,
      tokenTracker,
      healthMonitor,
      cacheManager,
      ...options
    };
    routerInstance = new ModelRouter(defaultOptions);
  }
  return routerInstance;
}

/**
 * Reset the singleton instances (useful for testing)
 */
function resetRouter() {
  // Stop recovery monitoring before resetting
  if (healthMonitorInstance) {
    healthMonitorInstance.stopRecoveryMonitoring();
  }
  
  // Stop cache cleanup before resetting
  if (cacheManagerInstance) {
    cacheManagerInstance.stopCleanup();
  }
  
  routerInstance = null;
  healthMonitorInstance = null;
  cacheManagerInstance = null;
}

/**
 * Create a new ModelRouter instance (non-singleton)
 * @param {Object} options - Router options
 * @returns {ModelRouter} New router instance
 */
function createRouter(options = {}) {
  return new ModelRouter(options);
}

module.exports = {
  ModelRouter,
  getRouter,
  resetRouter,
  createRouter,
  providerRegistry,
  config,
  costTracker,
  tokenTracker,
  HealthMonitor,
  getHealthMonitor,
  CacheManager,
  getCacheManager,
  RequestQueue,
  PRIORITY
};
