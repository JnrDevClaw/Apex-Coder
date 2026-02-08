/**
 * Provider Initialization
 * 
 * Initializes and registers all AI providers with the provider registry.
 * Loads configuration and creates provider instances.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */

const providerRegistry = require('./provider-registry.js');
const config = require('../../config/model-router-config.js');
const HuggingFaceProvider = require('../providers/huggingface-provider.js');
const ZukijourneyProvider = require('../providers/zukijourney-provider.js');
const GitHubModelsProvider = require('../providers/github-models-provider.js');
const DeepSeekProvider = require('../providers/deepseek-provider.js');
const GeminiProvider = require('../providers/gemini.js');

/**
 * Initialize all enabled providers
 * @param {Object} logger - Optional logger instance
 * @returns {Object} Initialization results
 */
async function initializeProviders(logger = console) {
  const results = {
    initialized: [],
    failed: [],
    skipped: []
  };

  // Set logger for registry
  if (logger) {
    providerRegistry.setLogger(logger);
  }

  // Get configuration
  const routerConfig = config.get();

  // Initialize each provider
  for (const [providerName, providerConfig] of Object.entries(routerConfig.providers)) {
    try {
      // Skip disabled providers
      if (!providerConfig.enabled) {
        results.skipped.push({
          provider: providerName,
          reason: 'Provider is disabled in configuration'
        });
        continue;
      }

      // Skip if no API key (except for demo provider)
      if (!providerConfig.apiKey && providerName !== 'demo') {
        results.skipped.push({
          provider: providerName,
          reason: 'No API key configured'
        });
        logger.warn(`⚠️  Skipping ${providerName}: No API key configured`);
        continue;
      }

      // Create provider instance based on provider name
      let providerInstance = null;

      switch (providerName) {
        case 'huggingface':
          providerInstance = new HuggingFaceProvider(providerConfig);
          break;

        case 'zukijourney':
          providerInstance = new ZukijourneyProvider(providerConfig);
          break;

        case 'github-models':
          providerInstance = new GitHubModelsProvider(providerConfig);
          break;

        case 'deepseek':
          providerInstance = new DeepSeekProvider(providerConfig);
          break;

        case 'gemini':
          providerInstance = new GeminiProvider(providerConfig);
          break;
        
        default:
          results.skipped.push({
            provider: providerName,
            reason: 'Provider implementation not yet available'
          });
          continue;
      }

      // Register the provider
      if (providerInstance) {
        providerRegistry.registerProvider(providerName, providerInstance);
        results.initialized.push(providerName);
        logger.info(`✅ Initialized provider: ${providerName}`);
      }

    } catch (error) {
      results.failed.push({
        provider: providerName,
        error: error.message
      });
      logger.error(`❌ Failed to initialize provider ${providerName}:`, error);
    }
  }

  // Log summary
  logger.info(`\n📊 Provider Initialization Summary:`);
  logger.info(`   ✅ Initialized: ${results.initialized.length} (${results.initialized.join(', ') || 'none'})`);
  logger.info(`   ⏭️  Skipped: ${results.skipped.length}`);
  logger.info(`   ❌ Failed: ${results.failed.length}`);

  if (results.initialized.length === 0) {
    logger.warn('⚠️  WARNING: No providers were initialized. The model router will not function.');
  }

  return results;
}

/**
 * Validate provider configuration on startup
 * @param {Object} logger - Optional logger instance
 * @returns {Object} Validation results
 */
function validateProviderConfiguration(logger = console) {
  const results = {
    valid: [],
    warnings: [],
    errors: []
  };

  try {
    const routerConfig = config.get();

    // Check if at least one provider is enabled
    const enabledProviders = Object.entries(routerConfig.providers)
      .filter(([_, cfg]) => cfg.enabled);

    if (enabledProviders.length === 0) {
      results.errors.push('No providers are enabled in configuration');
    }

    // Validate each enabled provider
    for (const [providerName, providerConfig] of enabledProviders) {
      // Check API key
      if (!providerConfig.apiKey && providerName !== 'demo') {
        results.warnings.push(`Provider ${providerName} is enabled but has no API key`);
      }

      // Check base URL
      if (!providerConfig.baseURL && providerName !== 'demo') {
        results.warnings.push(`Provider ${providerName} has no base URL configured`);
      }

      // Check models configuration
      if (!providerConfig.models || Object.keys(providerConfig.models).length === 0) {
        results.warnings.push(`Provider ${providerName} has no models configured`);
      }

      // Check rate limit configuration
      if (!providerConfig.rateLimit) {
        results.warnings.push(`Provider ${providerName} has no rate limit configuration`);
      }

      // Check pricing configuration
      if (!providerConfig.pricing) {
        results.warnings.push(`Provider ${providerName} has no pricing configuration`);
      }

      if (results.warnings.length === 0 && results.errors.length === 0) {
        results.valid.push(providerName);
      }
    }

    // Validate role mappings
    for (const [role, mapping] of Object.entries(routerConfig.roleMappings)) {
      // Check if primary provider exists and is enabled
      const primaryProvider = routerConfig.providers[mapping.primary.provider];
      if (!primaryProvider) {
        results.errors.push(`Role ${role} references non-existent provider: ${mapping.primary.provider}`);
      } else if (!primaryProvider.enabled) {
        results.warnings.push(`Role ${role} primary provider ${mapping.primary.provider} is disabled`);
      }

      // Check if fallback provider exists and is enabled (if specified)
      if (mapping.fallback) {
        const fallbackProvider = routerConfig.providers[mapping.fallback.provider];
        if (!fallbackProvider) {
          results.errors.push(`Role ${role} references non-existent fallback provider: ${mapping.fallback.provider}`);
        } else if (!fallbackProvider.enabled) {
          results.warnings.push(`Role ${role} fallback provider ${mapping.fallback.provider} is disabled`);
        }
      }
    }

  } catch (error) {
    results.errors.push(`Configuration validation error: ${error.message}`);
  }

  // Log results
  if (results.errors.length > 0) {
    logger.error('❌ Configuration validation failed:');
    results.errors.forEach(err => logger.error(`   - ${err}`));
  }

  if (results.warnings.length > 0) {
    logger.warn('⚠️  Configuration warnings:');
    results.warnings.forEach(warn => logger.warn(`   - ${warn}`));
  }

  if (results.valid.length > 0) {
    logger.info(`✅ Valid providers: ${results.valid.join(', ')}`);
  }

  return results;
}

/**
 * Get initialization status
 * @returns {Object} Status information
 */
function getInitializationStatus() {
  return {
    providersRegistered: providerRegistry.listProviders(),
    providerCount: providerRegistry.getProviderCount(),
    configInitialized: config.initialized
  };
}

module.exports = {
  initializeProviders,
  validateProviderConfiguration,
  getInitializationStatus
};
