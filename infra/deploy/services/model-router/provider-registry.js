/**
 * Provider Registry Service
 * 
 * Manages provider instances for the Model Router.
 * Provides methods to register, retrieve, and list AI providers.
 * 
 * Requirements: 1.4, 10.1
 */

class ProviderRegistry {
  constructor() {
    this.providers = new Map();
    this.logger = null;
  }

  /**
   * Set logger instance
   * @param {Object} logger - Logger instance
   */
  setLogger(logger) {
    this.logger = logger;
  }

  /**
   * Register a provider instance
   * @param {string} name - Provider name (e.g., 'huggingface', 'zukijourney')
   * @param {Object} providerInstance - Instance of a provider class extending BaseProvider
   * @throws {Error} If provider name is invalid or provider already registered
   */
  registerProvider(name, providerInstance) {
    if (!name || typeof name !== 'string') {
      throw new Error('Provider name must be a non-empty string');
    }

    if (!providerInstance) {
      throw new Error('Provider instance is required');
    }

    if (this.providers.has(name)) {
      throw new Error(`Provider '${name}' is already registered`);
    }

    // Validate provider has required methods
    if (typeof providerInstance.call !== 'function') {
      throw new Error(`Provider '${name}' must implement call() method`);
    }

    this.providers.set(name, providerInstance);

    if (this.logger) {
      this.logger.info(`Provider registered: ${name}`);
    }
  }

  /**
   * Get a provider instance by name
   * @param {string} name - Provider name
   * @returns {Object} Provider instance
   * @throws {Error} If provider not found
   */
  getProvider(name) {
    if (!name || typeof name !== 'string') {
      throw new Error('Provider name must be a non-empty string');
    }

    const provider = this.providers.get(name);

    if (!provider) {
      throw new Error(`Provider '${name}' not found. Available providers: ${this.listProviders().join(', ')}`);
    }

    return provider;
  }

  /**
   * List all registered provider names
   * @returns {Array<string>} Array of provider names
   */
  listProviders() {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a provider is registered
   * @param {string} name - Provider name
   * @returns {boolean} True if provider is registered
   */
  hasProvider(name) {
    return this.providers.has(name);
  }

  /**
   * Get count of registered providers
   * @returns {number} Number of registered providers
   */
  getProviderCount() {
    return this.providers.size;
  }

  /**
   * Unregister a provider (useful for testing or hot-reloading)
   * @param {string} name - Provider name
   * @returns {boolean} True if provider was unregistered
   */
  unregisterProvider(name) {
    const existed = this.providers.delete(name);
    
    if (existed && this.logger) {
      this.logger.info(`Provider unregistered: ${name}`);
    }

    return existed;
  }

  /**
   * Clear all registered providers
   */
  clear() {
    this.providers.clear();
    
    if (this.logger) {
      this.logger.info('All providers cleared from registry');
    }
  }
}

// Export singleton instance
const providerRegistry = new ProviderRegistry();

module.exports = providerRegistry;
module.exports.ProviderRegistry = ProviderRegistry;
module.exports.default = providerRegistry;
