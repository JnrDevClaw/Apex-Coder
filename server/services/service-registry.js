/**
 * Service Registry
 * Central registry for managing service dependencies and lifecycle
 */

class ServiceRegistry {
  constructor(logger = console) {
    this.logger = logger;
    this.services = new Map();
    this.healthChecks = new Map();
    this.initializationOrder = [];
  }

  /**
   * Register a service with the registry
   * @param {string} name - Service name
   * @param {Object} service - Service instance
   * @param {Object} options - Service options
   * @param {Array<string>} options.dependencies - Service dependencies
   * @param {Function} options.healthCheck - Health check function
   * @param {Function} options.initialize - Initialization function
   * @param {Function} options.shutdown - Shutdown function
   */
  register(name, service, options = {}) {
    if (this.services.has(name)) {
      throw new Error(`Service ${name} is already registered`);
    }

    this.services.set(name, {
      name,
      instance: service,
      dependencies: options.dependencies || [],
      healthCheck: options.healthCheck,
      initialize: options.initialize,
      shutdown: options.shutdown,
      status: 'registered',
      error: null
    });

    this.logger.info(`Service registered: ${name}`);
  }

  /**
   * Get a service instance
   * @param {string} name - Service name
   * @returns {Object} Service instance
   */
  get(name) {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} not found`);
    }
    return service.instance;
  }

  /**
   * Check if a service is registered
   * @param {string} name - Service name
   * @returns {boolean}
   */
  has(name) {
    return this.services.has(name);
  }

  /**
   * Get service status
   * @param {string} name - Service name
   * @returns {Object} Service status
   */
  getStatus(name) {
    const service = this.services.get(name);
    if (!service) {
      return { status: 'not_found' };
    }
    return {
      name: service.name,
      status: service.status,
      error: service.error
    };
  }

  /**
   * Get all service statuses
   * @returns {Object} All service statuses
   */
  getAllStatuses() {
    const statuses = {};
    for (const [name, service] of this.services) {
      statuses[name] = {
        status: service.status,
        error: service.error
      };
    }
    return statuses;
  }

  /**
   * Initialize all services in dependency order
   * @returns {Promise<Object>} Initialization results
   */
  async initializeAll() {
    const results = {
      initialized: [],
      failed: [],
      skipped: []
    };

    // Build dependency graph and determine initialization order
    const order = this._resolveDependencyOrder();
    this.initializationOrder = order;

    this.logger.info(`Initializing ${order.length} services in dependency order...`);

    for (const name of order) {
      try {
        await this.initialize(name);
        results.initialized.push(name);
      } catch (error) {
        this.logger.error(`Failed to initialize service ${name}:`, error.message);
        results.failed.push({ name, error: error.message });
        
        // Mark service as failed
        const service = this.services.get(name);
        if (service) {
          service.status = 'failed';
          service.error = error.message;
        }
      }
    }

    return results;
  }

  /**
   * Initialize a specific service
   * @param {string} name - Service name
   * @returns {Promise<void>}
   */
  async initialize(name) {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} not found`);
    }

    if (service.status === 'initialized') {
      this.logger.debug(`Service ${name} already initialized`);
      return;
    }

    // Check dependencies
    for (const dep of service.dependencies) {
      const depService = this.services.get(dep);
      if (!depService) {
        throw new Error(`Dependency ${dep} not found for service ${name}`);
      }
      if (depService.status !== 'initialized') {
        throw new Error(`Dependency ${dep} not initialized for service ${name}`);
      }
    }

    this.logger.info(`Initializing service: ${name}`);
    service.status = 'initializing';

    try {
      if (service.initialize) {
        await service.initialize();
      }
      service.status = 'initialized';
      service.error = null;
      this.logger.info(`Service initialized: ${name}`);
    } catch (error) {
      service.status = 'failed';
      service.error = error.message;
      throw error;
    }
  }

  /**
   * Shutdown all services in reverse order
   * @returns {Promise<void>}
   */
  async shutdownAll() {
    const order = [...this.initializationOrder].reverse();
    
    this.logger.info(`Shutting down ${order.length} services...`);

    for (const name of order) {
      try {
        await this.shutdown(name);
      } catch (error) {
        this.logger.error(`Error shutting down service ${name}:`, error.message);
      }
    }
  }

  /**
   * Shutdown a specific service
   * @param {string} name - Service name
   * @returns {Promise<void>}
   */
  async shutdown(name) {
    const service = this.services.get(name);
    if (!service) {
      return;
    }

    if (service.status !== 'initialized') {
      return;
    }

    this.logger.info(`Shutting down service: ${name}`);

    try {
      if (service.shutdown) {
        await service.shutdown();
      }
      service.status = 'shutdown';
      this.logger.info(`Service shutdown: ${name}`);
    } catch (error) {
      this.logger.error(`Error shutting down service ${name}:`, error.message);
      throw error;
    }
  }

  /**
   * Run health checks for all services
   * @returns {Promise<Object>} Health check results
   */
  async checkHealth() {
    const results = {};

    for (const [name, service] of this.services) {
      if (service.status !== 'initialized') {
        results[name] = {
          status: 'unhealthy',
          reason: `Service status: ${service.status}`
        };
        continue;
      }

      if (service.healthCheck) {
        try {
          const health = await service.healthCheck();
          results[name] = health;
        } catch (error) {
          results[name] = {
            status: 'unhealthy',
            error: error.message
          };
        }
      } else {
        results[name] = {
          status: 'healthy',
          message: 'No health check defined'
        };
      }
    }

    return results;
  }

  /**
   * Resolve dependency order using topological sort
   * @private
   * @returns {Array<string>} Service names in initialization order
   */
  _resolveDependencyOrder() {
    const visited = new Set();
    const order = [];
    const visiting = new Set();

    const visit = (name) => {
      if (visited.has(name)) {
        return;
      }

      if (visiting.has(name)) {
        throw new Error(`Circular dependency detected involving service: ${name}`);
      }

      visiting.add(name);

      const service = this.services.get(name);
      if (service) {
        for (const dep of service.dependencies) {
          visit(dep);
        }
      }

      visiting.delete(name);
      visited.add(name);
      order.push(name);
    };

    for (const name of this.services.keys()) {
      visit(name);
    }

    return order;
  }
}

module.exports = ServiceRegistry;
