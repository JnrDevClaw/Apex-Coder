/**
 * Production Environment Configuration
 * Enhanced questionnaire settings for production environment
 */

module.exports = {
  // Feature flags - controlled rollout for production
  featureFlags: {
    enhancedProcessing: process.env.ENHANCED_QUESTIONNAIRE_ENABLED === 'true' || false,
    aiGuidance: process.env.AI_GUIDANCE_ENABLED === 'true' || false,
    technicalInference: process.env.TECHNICAL_INFERENCE_ENABLED === 'true' || false,
    enhancedAuditLogging: process.env.ENHANCED_AUDIT_LOGGING_ENABLED === 'true' || true,
    enhancedAudit: process.env.ENHANCED_AUDIT_LOGGING_ENABLED === 'true' || true,
    gdprCompliance: process.env.GDPR_COMPLIANCE_ENABLED === 'true' || true,
    draftMigration: process.env.DRAFT_MIGRATION_ENABLED === 'true' || true,
    enhancedValidation: process.env.ENHANCED_VALIDATION_ENABLED === 'true' || true,
    contextualHelp: process.env.CONTEXTUAL_HELP_ENABLED === 'true' || false
  },

  // AI services with production-optimized settings
  aiServices: {
    guidance: {
      enabled: process.env.AI_GUIDANCE_ENABLED === 'true' || false,
      timeout: parseInt(process.env.AI_GUIDANCE_TIMEOUT) || 20000, // Shorter timeout for production
      maxRetries: parseInt(process.env.AI_GUIDANCE_MAX_RETRIES) || 1,
      temperature: parseFloat(process.env.AI_GUIDANCE_TEMPERATURE) || 0.2, // More deterministic
      fallbackEnabled: true,
      mockResponses: false
    },
    technicalInference: {
      enabled: process.env.TECHNICAL_INFERENCE_ENABLED === 'true' || false,
      timeout: parseInt(process.env.TECHNICAL_INFERENCE_TIMEOUT) || 15000,
      maxRetries: parseInt(process.env.TECHNICAL_INFERENCE_MAX_RETRIES) || 1,
      temperature: parseFloat(process.env.TECHNICAL_INFERENCE_TEMPERATURE) || 0.1,
      includeAlternatives: process.env.TECHNICAL_INFERENCE_ALTERNATIVES === 'true' || false,
      fallbackEnabled: true,
      mockResponses: false
    },
    specProcessing: {
      enabled: process.env.ENHANCED_SPEC_PROCESSING_ENABLED === 'true' || false,
      timeout: parseInt(process.env.ENHANCED_SPEC_PROCESSING_TIMEOUT) || 30000,
      maxRetries: parseInt(process.env.ENHANCED_SPEC_PROCESSING_MAX_RETRIES) || 0,
      allowIncomplete: process.env.ENHANCED_SPEC_ALLOW_INCOMPLETE === 'true' || false,
      generatePreview: process.env.ENHANCED_SPEC_GENERATE_PREVIEW === 'true' || false
    }
  },

  // Production-specific settings
  production: {
    debugMode: false,
    verboseLogging: false,
    enableTestEndpoints: false,
    skipValidation: false,
    logAllRequests: false,
    enableCORS: process.env.ENABLE_CORS === 'true' || false,
    hotReload: false,
    enableCaching: true,
    cacheTimeout: parseInt(process.env.CACHE_TIMEOUT) || 300000 // 5 minutes
  },

  // Strict validation for production
  validation: {
    enhancedSchema: {
      enabled: true,
      strictMode: process.env.VALIDATION_STRICT_MODE === 'true' || true,
      allowPartialValidation: process.env.ALLOW_PARTIAL_VALIDATION === 'true' || false
    },
    security: {
      enabled: true,
      sanitizeInputs: true,
      maxInputLength: parseInt(process.env.MAX_INPUT_LENGTH) || 25000, // Stricter limits
      maxArrayLength: parseInt(process.env.MAX_ARRAY_LENGTH) || 50
    }
  },

  // Production audit logging with GDPR compliance
  audit: {
    enhanced: {
      enabled: true,
      logUserModeSelection: true,
      logAIGuidanceGeneration: true,
      logTechnicalInference: true,
      logProcessingMetrics: true,
      logDebugInfo: false
    },
    gdpr: {
      enabled: true,
      sanitizePII: true,
      retentionPeriod: parseInt(process.env.AUDIT_RETENTION_PERIOD) || 2592000000, // 30 days
      anonymizeAfterRetention: true
    }
  },

  // Production draft management
  drafts: {
    migration: {
      enabled: true,
      autoMigrate: process.env.AUTO_MIGRATE_DRAFTS === 'true' || false,
      backupBeforeMigration: true,
      maxBackups: parseInt(process.env.MAX_DRAFT_BACKUPS) || 3
    },
    storage: {
      maxDraftSize: parseInt(process.env.MAX_DRAFT_SIZE) || 524288, // 512KB
      compressionEnabled: process.env.DRAFT_COMPRESSION_ENABLED === 'true' || true,
      encryptionEnabled: process.env.DRAFT_ENCRYPTION_ENABLED === 'true' || true
    }
  },

  // Production performance optimization
  performance: {
    caching: {
      enabled: true,
      aiResponseCache: true,
      cacheTimeout: parseInt(process.env.CACHE_TIMEOUT) || 600000, // 10 minutes
      maxCacheSize: parseInt(process.env.MAX_CACHE_SIZE) || 500
    },
    rateLimiting: {
      enabled: true,
      maxRequestsPerMinute: parseInt(process.env.MAX_REQUESTS_PER_MINUTE) || 30,
      maxAIRequestsPerMinute: parseInt(process.env.MAX_AI_REQUESTS_PER_MINUTE) || 5
    }
  }
};