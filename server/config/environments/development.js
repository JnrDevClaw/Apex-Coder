/**
 * Development Environment Configuration
 * Enhanced questionnaire settings for development environment
 */

module.exports = {
  // Feature flags - all enabled for development
  featureFlags: {
    enhancedProcessing: true,
    aiGuidance: true,
    technicalInference: true,
    enhancedAuditLogging: true,
    enhancedAudit: true,
    gdprCompliance: true,
    draftMigration: true,
    enhancedValidation: true,
    contextualHelp: true
  },

  // AI services with development-friendly settings
  aiServices: {
    guidance: {
      enabled: true,
      timeout: 30000,
      maxRetries: 2,
      temperature: 0.3,
      fallbackEnabled: true,
      mockResponses: process.env.MOCK_AI_RESPONSES === 'true' || false
    },
    technicalInference: {
      enabled: true,
      timeout: 25000,
      maxRetries: 2,
      temperature: 0.2,
      includeAlternatives: true,
      fallbackEnabled: true,
      mockResponses: process.env.MOCK_AI_RESPONSES === 'true' || false
    },
    specProcessing: {
      enabled: true,
      timeout: 45000,
      maxRetries: 1,
      allowIncomplete: true, // More lenient in development
      generatePreview: true
    }
  },

  // Development-specific settings
  development: {
    debugMode: true,
    verboseLogging: true,
    enableTestEndpoints: true,
    skipValidation: false,
    logAllRequests: true,
    enableCORS: true,
    hotReload: true
  },

  // Relaxed validation for development
  validation: {
    enhancedSchema: {
      enabled: true,
      strictMode: false,
      allowPartialValidation: true
    },
    security: {
      enabled: true,
      sanitizeInputs: true,
      maxInputLength: 100000, // Higher limit for development
      maxArrayLength: 200
    }
  },

  // Enhanced audit logging for debugging
  audit: {
    enhanced: {
      enabled: true,
      logUserModeSelection: true,
      logAIGuidanceGeneration: true,
      logTechnicalInference: true,
      logProcessingMetrics: true,
      logDebugInfo: true
    },
    gdpr: {
      enabled: true,
      sanitizePII: false, // Disabled for easier debugging
      retentionPeriod: 604800000, // 7 days for development
      anonymizeAfterRetention: false
    }
  },

  // Development-friendly draft management
  drafts: {
    migration: {
      enabled: true,
      autoMigrate: true,
      backupBeforeMigration: true,
      maxBackups: 10 // More backups for development
    },
    storage: {
      maxDraftSize: 2097152, // 2MB for development
      compressionEnabled: false,
      encryptionEnabled: false
    }
  },

  // Performance settings for development
  performance: {
    caching: {
      enabled: false, // Disabled for development to see fresh results
      aiResponseCache: false,
      cacheTimeout: 60000, // 1 minute
      maxCacheSize: 50
    },
    rateLimiting: {
      enabled: false, // Disabled for development
      maxRequestsPerMinute: 1000,
      maxAIRequestsPerMinute: 100
    }
  }
};