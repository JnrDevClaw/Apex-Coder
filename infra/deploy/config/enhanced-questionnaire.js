/**
 * Enhanced Questionnaire Configuration
 * Feature flags and configuration for enhanced questionnaire rollout
 */

const config = {
  // Feature flags for enhanced questionnaire rollout
  featureFlags: {
    // Enable enhanced questionnaire processing
    enhancedProcessing: process.env.ENHANCED_QUESTIONNAIRE_ENABLED === 'true' || true,
    
    // Enable AI guidance generation
    aiGuidance: process.env.AI_GUIDANCE_ENABLED === 'true' || true,
    
    // Enable technical inference for non-developers
    technicalInference: process.env.TECHNICAL_INFERENCE_ENABLED === 'true' || true,
    
    // Enable enhanced audit logging
    enhancedAuditLogging: process.env.ENHANCED_AUDIT_LOGGING_ENABLED === 'true' || true,
    
    // Enable GDPR compliance features
    gdprCompliance: process.env.GDPR_COMPLIANCE_ENABLED === 'true' || true,
    
    // Enable draft migration utilities
    draftMigration: process.env.DRAFT_MIGRATION_ENABLED === 'true' || true,
    
    // Enable enhanced validation
    enhancedValidation: process.env.ENHANCED_VALIDATION_ENABLED === 'true' || true,
    
    // Enable contextual help and suggestions
    contextualHelp: process.env.CONTEXTUAL_HELP_ENABLED === 'true' || true
  },

  // AI service configuration
  aiServices: {
    // AI guidance generation settings
    guidance: {
      enabled: process.env.AI_GUIDANCE_ENABLED === 'true' || true,
      timeout: parseInt(process.env.AI_GUIDANCE_TIMEOUT) || 30000,
      maxRetries: parseInt(process.env.AI_GUIDANCE_MAX_RETRIES) || 2,
      temperature: parseFloat(process.env.AI_GUIDANCE_TEMPERATURE) || 0.3,
      fallbackEnabled: process.env.AI_GUIDANCE_FALLBACK_ENABLED === 'true' || true
    },
    
    // Technical inference settings
    technicalInference: {
      enabled: process.env.TECHNICAL_INFERENCE_ENABLED === 'true' || true,
      timeout: parseInt(process.env.TECHNICAL_INFERENCE_TIMEOUT) || 25000,
      maxRetries: parseInt(process.env.TECHNICAL_INFERENCE_MAX_RETRIES) || 2,
      temperature: parseFloat(process.env.TECHNICAL_INFERENCE_TEMPERATURE) || 0.2,
      includeAlternatives: process.env.TECHNICAL_INFERENCE_ALTERNATIVES === 'true' || true,
      fallbackEnabled: process.env.TECHNICAL_INFERENCE_FALLBACK_ENABLED === 'true' || true
    },
    
    // Enhanced spec processing settings
    specProcessing: {
      enabled: process.env.ENHANCED_SPEC_PROCESSING_ENABLED === 'true' || true,
      timeout: parseInt(process.env.ENHANCED_SPEC_PROCESSING_TIMEOUT) || 45000,
      maxRetries: parseInt(process.env.ENHANCED_SPEC_PROCESSING_MAX_RETRIES) || 1,
      allowIncomplete: process.env.ENHANCED_SPEC_ALLOW_INCOMPLETE === 'true' || false,
      generatePreview: process.env.ENHANCED_SPEC_GENERATE_PREVIEW === 'true' || true
    }
  },

  // Environment-specific settings
  environment: {
    // Development environment settings
    development: {
      debugMode: true,
      verboseLogging: true,
      mockAIResponses: process.env.MOCK_AI_RESPONSES === 'true' || false,
      enableTestEndpoints: true,
      skipValidation: process.env.SKIP_VALIDATION === 'true' || false
    },
    
    // Production environment settings
    production: {
      debugMode: false,
      verboseLogging: false,
      mockAIResponses: false,
      enableTestEndpoints: false,
      skipValidation: false,
      enableCaching: true,
      cacheTimeout: parseInt(process.env.CACHE_TIMEOUT) || 300000 // 5 minutes
    },
    
    // Test environment settings
    test: {
      debugMode: true,
      verboseLogging: false,
      mockAIResponses: true,
      enableTestEndpoints: true,
      skipValidation: true
    }
  },

  // Validation settings
  validation: {
    // Enhanced schema validation
    enhancedSchema: {
      enabled: process.env.ENHANCED_VALIDATION_ENABLED === 'true' || true,
      strictMode: process.env.VALIDATION_STRICT_MODE === 'true' || false,
      allowPartialValidation: process.env.ALLOW_PARTIAL_VALIDATION === 'true' || true
    },
    
    // Security validation
    security: {
      enabled: process.env.SECURITY_VALIDATION_ENABLED === 'true' || true,
      sanitizeInputs: process.env.SANITIZE_INPUTS === 'true' || true,
      maxInputLength: parseInt(process.env.MAX_INPUT_LENGTH) || 50000,
      maxArrayLength: parseInt(process.env.MAX_ARRAY_LENGTH) || 100
    }
  },

  // Audit and logging configuration
  audit: {
    // Enhanced audit logging
    enhanced: {
      enabled: process.env.ENHANCED_AUDIT_LOGGING_ENABLED === 'true' || true,
      logUserModeSelection: process.env.LOG_USER_MODE_SELECTION === 'true' || true,
      logAIGuidanceGeneration: process.env.LOG_AI_GUIDANCE_GENERATION === 'true' || true,
      logTechnicalInference: process.env.LOG_TECHNICAL_INFERENCE === 'true' || true,
      logProcessingMetrics: process.env.LOG_PROCESSING_METRICS === 'true' || true
    },
    
    // GDPR compliance
    gdpr: {
      enabled: process.env.GDPR_COMPLIANCE_ENABLED === 'true' || true,
      sanitizePII: process.env.SANITIZE_PII === 'true' || true,
      retentionPeriod: parseInt(process.env.AUDIT_RETENTION_PERIOD) || 2592000000, // 30 days
      anonymizeAfterRetention: process.env.ANONYMIZE_AFTER_RETENTION === 'true' || true
    }
  },

  // Draft management configuration
  drafts: {
    // Migration settings
    migration: {
      enabled: process.env.DRAFT_MIGRATION_ENABLED === 'true' || true,
      autoMigrate: process.env.AUTO_MIGRATE_DRAFTS === 'true' || true,
      backupBeforeMigration: process.env.BACKUP_BEFORE_MIGRATION === 'true' || true,
      maxBackups: parseInt(process.env.MAX_DRAFT_BACKUPS) || 5
    },
    
    // Storage settings
    storage: {
      maxDraftSize: parseInt(process.env.MAX_DRAFT_SIZE) || 1048576, // 1MB
      compressionEnabled: process.env.DRAFT_COMPRESSION_ENABLED === 'true' || false,
      encryptionEnabled: process.env.DRAFT_ENCRYPTION_ENABLED === 'true' || false
    }
  },

  // Performance and scaling configuration
  performance: {
    // Caching settings
    caching: {
      enabled: process.env.CACHING_ENABLED === 'true' || true,
      aiResponseCache: process.env.AI_RESPONSE_CACHE_ENABLED === 'true' || true,
      cacheTimeout: parseInt(process.env.CACHE_TIMEOUT) || 300000, // 5 minutes
      maxCacheSize: parseInt(process.env.MAX_CACHE_SIZE) || 100 // 100 entries
    },
    
    // Rate limiting
    rateLimiting: {
      enabled: process.env.RATE_LIMITING_ENABLED === 'true' || true,
      maxRequestsPerMinute: parseInt(process.env.MAX_REQUESTS_PER_MINUTE) || 60,
      maxAIRequestsPerMinute: parseInt(process.env.MAX_AI_REQUESTS_PER_MINUTE) || 10
    }
  }
};

/**
 * Get configuration for current environment
 */
function getEnvironmentConfig() {
  const env = process.env.NODE_ENV || 'development';
  return config.environment[env] || config.environment.development;
}

/**
 * Check if a feature flag is enabled
 */
function isFeatureEnabled(featureName) {
  return config.featureFlags[featureName] === true;
}

/**
 * Get AI service configuration
 */
function getAIServiceConfig(serviceName) {
  return config.aiServices[serviceName] || {};
}

/**
 * Get validation configuration
 */
function getValidationConfig() {
  return config.validation;
}

/**
 * Get audit configuration
 */
function getAuditConfig() {
  return config.audit;
}

/**
 * Get performance configuration
 */
function getPerformanceConfig() {
  return config.performance;
}

/**
 * Get complete configuration object
 */
function getFullConfig() {
  return {
    ...config,
    currentEnvironment: getEnvironmentConfig()
  };
}

module.exports = {
  config,
  getEnvironmentConfig,
  isFeatureEnabled,
  getAIServiceConfig,
  getValidationConfig,
  getAuditConfig,
  getPerformanceConfig,
  getFullConfig
};