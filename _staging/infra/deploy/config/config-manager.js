/**
 * Configuration Manager for Enhanced Questionnaire
 * Manages feature flags, environment-specific settings, and configuration loading
 */

const path = require('path');
const fs = require('fs');
const structuredLogger = require('../services/structured-logger');

class ConfigManager {
  constructor() {
    this.config = null;
    this.environment = process.env.NODE_ENV || 'development';
    this.configCache = new Map();
    this.loadConfiguration();
  }

  /**
   * Load configuration based on current environment
   */
  loadConfiguration() {
    try {
      // Load base configuration
      const baseConfig = require('./enhanced-questionnaire');
      
      // Load environment-specific configuration
      const envConfigPath = path.join(__dirname, 'environments', `${this.environment}.js`);
      let envConfig = {};
      
      if (fs.existsSync(envConfigPath)) {
        envConfig = require(envConfigPath);
        structuredLogger.info('Loaded environment-specific configuration', {
          environment: this.environment,
          configPath: envConfigPath
        });
      } else {
        structuredLogger.warn('Environment-specific configuration not found, using defaults', {
          environment: this.environment,
          expectedPath: envConfigPath
        });
      }

      // Merge configurations (environment overrides base)
      this.config = this.mergeConfigurations(baseConfig.config, envConfig);
      
      structuredLogger.info('Configuration loaded successfully', {
        environment: this.environment,
        featuresEnabled: Object.keys(this.config.featureFlags).filter(
          key => this.config.featureFlags[key]
        )
      });
    } catch (error) {
      structuredLogger.error('Failed to load configuration', {
        error: error.message,
        environment: this.environment
      });
      
      // Fallback to safe defaults
      this.config = this.getSafeDefaults();
    }
  }

  /**
   * Merge base and environment configurations
   */
  mergeConfigurations(baseConfig, envConfig) {
    const merged = JSON.parse(JSON.stringify(baseConfig)); // Deep clone
    
    // Recursively merge configurations
    function deepMerge(target, source) {
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (!target[key]) target[key] = {};
          deepMerge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    }
    
    deepMerge(merged, envConfig);
    return merged;
  }

  /**
   * Get safe default configuration
   */
  getSafeDefaults() {
    return {
      featureFlags: {
        enhancedProcessing: false,
        aiGuidance: false,
        technicalInference: false,
        enhancedAuditLogging: true,
        gdprCompliance: true,
        draftMigration: true,
        enhancedValidation: true,
        contextualHelp: false
      },
      aiServices: {
        guidance: { enabled: false, timeout: 30000, maxRetries: 1, fallbackEnabled: true },
        technicalInference: { enabled: false, timeout: 25000, maxRetries: 1, fallbackEnabled: true },
        specProcessing: { enabled: false, timeout: 45000, maxRetries: 0, allowIncomplete: false }
      },
      validation: {
        enhancedSchema: { enabled: true, strictMode: true, allowPartialValidation: false },
        security: { enabled: true, sanitizeInputs: true, maxInputLength: 25000, maxArrayLength: 50 }
      },
      audit: {
        enhanced: { enabled: true },
        gdpr: { enabled: true, sanitizePII: true, retentionPeriod: 2592000000 }
      },
      performance: {
        caching: { enabled: false },
        rateLimiting: { enabled: true, maxRequestsPerMinute: 30, maxAIRequestsPerMinute: 5 }
      }
    };
  }

  /**
   * Check if a feature flag is enabled
   */
  isFeatureEnabled(featureName) {
    if (!this.config || !this.config.featureFlags) {
      return false;
    }
    return this.config.featureFlags[featureName] === true;
  }

  /**
   * Get AI service configuration
   */
  getAIServiceConfig(serviceName) {
    if (!this.config || !this.config.aiServices) {
      return { enabled: false };
    }
    return this.config.aiServices[serviceName] || { enabled: false };
  }

  /**
   * Get validation configuration
   */
  getValidationConfig() {
    if (!this.config || !this.config.validation) {
      return this.getSafeDefaults().validation;
    }
    return this.config.validation;
  }

  /**
   * Get audit configuration
   */
  getAuditConfig() {
    if (!this.config || !this.config.audit) {
      return this.getSafeDefaults().audit;
    }
    return this.config.audit;
  }

  /**
   * Get performance configuration
   */
  getPerformanceConfig() {
    if (!this.config || !this.config.performance) {
      return this.getSafeDefaults().performance;
    }
    return this.config.performance;
  }

  /**
   * Get environment-specific configuration
   */
  getEnvironmentConfig() {
    if (!this.config) {
      return { debugMode: false, verboseLogging: false };
    }
    return this.config[this.environment] || this.config.development || {};
  }

  /**
   * Get complete configuration
   */
  getFullConfig() {
    return {
      ...this.config,
      environment: this.environment,
      currentEnvironment: this.getEnvironmentConfig()
    };
  }

  /**
   * Reload configuration (useful for hot reloading in development)
   */
  reloadConfiguration() {
    // Clear require cache for configuration files
    const configFiles = [
      require.resolve('./enhanced-questionnaire'),
      path.join(__dirname, 'environments', `${this.environment}.js`)
    ];
    
    configFiles.forEach(file => {
      if (require.cache[file]) {
        delete require.cache[file];
      }
    });
    
    // Clear internal cache
    this.configCache.clear();
    
    // Reload configuration
    this.loadConfiguration();
    
    structuredLogger.info('Configuration reloaded', {
      environment: this.environment
    });
  }

  /**
   * Get cached configuration value
   */
  getCachedConfig(key, defaultValue = null) {
    if (this.configCache.has(key)) {
      return this.configCache.get(key);
    }
    
    const value = this.getConfigValue(key) || defaultValue;
    this.configCache.set(key, value);
    return value;
  }

  /**
   * Get nested configuration value by dot notation
   */
  getConfigValue(keyPath) {
    if (!this.config) return null;
    
    const keys = keyPath.split('.');
    let value = this.config;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return null;
      }
    }
    
    return value;
  }

  /**
   * Set configuration value (runtime override)
   */
  setConfigValue(keyPath, value) {
    if (!this.config) return false;
    
    const keys = keyPath.split('.');
    const lastKey = keys.pop();
    let target = this.config;
    
    for (const key of keys) {
      if (!target[key]) target[key] = {};
      target = target[key];
    }
    
    target[lastKey] = value;
    
    // Clear cache for this key
    this.configCache.delete(keyPath);
    
    structuredLogger.info('Configuration value updated', {
      keyPath,
      value: typeof value === 'object' ? '[object]' : value
    });
    
    return true;
  }

  /**
   * Enable/disable feature flag at runtime
   */
  setFeatureFlag(featureName, enabled) {
    if (!this.config || !this.config.featureFlags) {
      return false;
    }
    
    this.config.featureFlags[featureName] = enabled;
    
    structuredLogger.info('Feature flag updated', {
      featureName,
      enabled
    });
    
    return true;
  }

  /**
   * Get configuration summary for debugging
   */
  getConfigSummary() {
    if (!this.config) {
      return { error: 'Configuration not loaded' };
    }
    
    return {
      environment: this.environment,
      featuresEnabled: Object.keys(this.config.featureFlags).filter(
        key => this.config.featureFlags[key]
      ),
      aiServicesEnabled: Object.keys(this.config.aiServices).filter(
        key => this.config.aiServices[key]?.enabled
      ),
      validationEnabled: this.config.validation?.enhancedSchema?.enabled || false,
      auditEnabled: this.config.audit?.enhanced?.enabled || false,
      cachingEnabled: this.config.performance?.caching?.enabled || false,
      rateLimitingEnabled: this.config.performance?.rateLimiting?.enabled || false
    };
  }
}

// Create singleton instance
const configManager = new ConfigManager();

module.exports = configManager;