/**
 * ModelRouter Configuration Management
 * Provides environment-based configuration, runtime updates, and validation
 */

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  // Demo mode settings
  demoMode: 'auto', // 'auto', 'enabled', 'disabled'
  
  // Fallback chain (order matters)
  fallbackChain: ['openrouter', 'deepseek', 'huggingface', 'anthropic', 'demo'],
  
  // Health check settings
  healthCheckOnStartup: true,
  healthCheckInterval: 300000, // 5 minutes
  healthCheckTimeout: 5000, // 5 seconds
  
  // Timeout settings by complexity
  timeouts: {
    low: 15000,    // 15 seconds
    medium: 30000, // 30 seconds
    high: 60000    // 60 seconds
  },
  
  // Retry and backoff settings
  retry: {
    maxAttempts: 3,
    baseDelay: 1000,      // 1 second
    maxDelay: 16000,      // 16 seconds
    jitterFactor: 0.3     // 30% jitter
  },
  
  // Provider health thresholds
  health: {
    consecutiveFailuresThreshold: 3,
    recoveryCheckInterval: 60000 // 1 minute
  },
  
  // Cost controls
  cost: {
    maxCostPerCall: 1.0,
    maxCostPerJob: 10.0,
    maxCostPerUser: 100.0,
    alertThreshold: 0.8 // Alert at 80% of limit
  },
  
  // Performance settings
  performance: {
    maxConcurrentCalls: 10,
    requestQueueSize: 100,
    cacheEnabled: false,
    cacheTTL: 3600000 // 1 hour
  },
  
  // Logging and monitoring
  logging: {
    logLevel: 'info', // 'debug', 'info', 'warn', 'error'
    logCalls: true,
    logMetrics: true,
    metricsInterval: 60000 // 1 minute
  },
  
  // Provider-specific configurations
  providers: {
    huggingface: {
      name: 'huggingface',
      enabled: true,
      baseURL: 'https://api-inference.huggingface.co',
      models: {
        'clarifier': 'OpenHermes-2.5-Mistral-7B',
        'clarifier-fallback': 'Qwen/Qwen2-7B-Instruct'
      },
      rateLimit: {
        maxConcurrent: 5,
        minTime: 200,
        reservoir: 100,
        reservoirRefreshAmount: 100,
        reservoirRefreshInterval: 60000
      },
      pricing: {
        'OpenHermes-2.5-Mistral-7B': {
          input: 0.0001,    // per 1M tokens
          output: 0.0002    // per 1M tokens
        },
        'Qwen/Qwen2-7B-Instruct': {
          input: 0.0001,
          output: 0.0002
        }
      },
      timeout: 30000,
      retries: 2
    },
    zukijourney: {
      name: 'zukijourney',
      enabled: false,  // Disabled due to IP restrictions
      baseURL: 'https://api.zukijourney.com/v1',
      models: {
        'normalizer': 'gpt-5-mini',
        'prompt-builder': 'gpt-5-mini',
        'file-structure-generator': 'gpt-4o',
        'validator': 'claude-3-5-haiku-20241022'
      },
      rateLimit: {
        maxConcurrent: 10,
        minTime: 100,
        reservoir: 200,
        reservoirRefreshAmount: 200,
        reservoirRefreshInterval: 60000
      },
      pricing: {
        'gpt-5-mini': {
          input: 0.15,      // per 1M tokens
          output: 0.60      // per 1M tokens
        },
        'gpt-4o': {
          input: 2.50,
          output: 10.00
        },
        'claude-3-5-haiku-20241022': {
          input: 0.80,      // per 1M tokens
          output: 4.00      // per 1M tokens
        },
        'claude-3.5-haiku': {
          input: 0.80,
          output: 4.00
        }
      },
      timeout: 30000,
      retries: 2
    },
    // ElectronHub provider for GPT-5 Mini and other models
    electronhub: {
      name: 'electronhub',
      enabled: true,
      baseURL: 'https://api.electronhub.ai/v1',
      models: {
        'normalizer': 'gpt-5-mini',
        'prompt-builder': 'gpt-5-mini',
        'file-structure-generator': 'gpt-4o',
        'validator': 'claude-3-5-haiku-20241022',
        'code-generator-fallback-complex': 'claude-sonnet-4-5-20250929',  // Complex task fallback
        'code-generator-fallback-simple': 'gpt-5-codex'  // Simple task fallback
      },
      rateLimit: {
        maxConcurrent: 5,
        minTime: 200,
        reservoir: 100,
        reservoirRefreshAmount: 100,
        reservoirRefreshInterval: 60000
      },
      pricing: {
        'gpt-5-mini': {
          input: 0.15,      // per 1M tokens
          output: 0.60      // per 1M tokens
        },
        'gpt-4o': {
          input: 2.50,
          output: 10.00
        },
        'claude-3-5-haiku-20241022': {
          input: 0.80,      // per 1M tokens
          output: 4.00      // per 1M tokens
        },
        'claude-sonnet-4-5-20250929': {
          input: 3.00,      // per 1M tokens
          output: 15.00     // per 1M tokens
        },
        'gpt-5-codex': {
          input: 0.10,      // per 1M tokens
          output: 0.20      // per 1M tokens
        }
      },
      timeout: 30000,
      retries: 2
    },
    'github-models': {
      name: 'github-models',
      enabled: true,
      baseURL: 'https://models.github.ai/inference',
      models: {
        'docs-creator': 'meta/Llama-4-Scout-17B-16E-Instruct'
      },
      rateLimit: {
        maxConcurrent: 5,
        minTime: 200,
        reservoir: 100,
        reservoirRefreshAmount: 100,
        reservoirRefreshInterval: 60000
      },
      pricing: {
        'meta/Llama-4-Scout-17B-16E-Instruct': {
          input: 0.0,       // Free tier
          output: 0.0
        }
      },
      timeout: 30000,
      retries: 2
    },
    deepseek: {
      name: 'deepseek',
      enabled: true,
      baseURL: 'https://api.electronhub.ai/v1',  // Using ElectronHub
      models: {
        'schema-generator': 'deepseek-v3-0324:free',  // DeepSeek V3 for schema generation
        'debugger': 'deepseek-coder',  // DeepSeek Coder for debugging and fixing errors
        'reasoning': 'deepseek-r1:free'  // DeepSeek R1 for reasoning tasks
      },
      rateLimit: {
        maxConcurrent: 1,  // Conservative: 1 concurrent request
        minTime: 12000,    // 12 seconds between requests (5 per minute)
        reservoir: 5,      // 5 requests
        reservoirRefreshAmount: 5,
        reservoirRefreshInterval: 60000  // Refill every 60 seconds
      },
      pricing: {
        'deepseek-v3-0324:free': {
          input: 0.27,      // per 1M tokens (free tier)
          output: 1.10      // per 1M tokens
        },
        'deepseek-r1:free': {
          input: 0.55,      // per 1M tokens (free tier)
          output: 2.19      // per 1M tokens
        },
        'deepseek-coder': {
          input: 0.14,      // per 1M tokens (premium model)
          output: 0.28      // per 1M tokens
        }
      },
      timeout: 30000,
      retries: 2,
      // Enhanced configuration for model selection
      complexityThresholds: {
        low: [1, 3],
        medium: [4, 6], 
        high: [7, 10]
      },
      modelSelection: {
        'schema-generation': 'deepseek-v3-0324:free',
        'debugging': 'deepseek-coder',  // Coder for debugging and fixing
        'reasoning': 'deepseek-r1:free'
      }
    },
    anthropic: {
      name: 'anthropic',
      enabled: false, // Disabled - Claude models accessed via Zukijourney
      baseURL: 'https://api.anthropic.com',
      models: {
        // Note: Claude models are now accessed through Zukijourney provider
      },
      rateLimit: {
        maxConcurrent: 10,
        minTime: 100,
        reservoir: 200,
        reservoirRefreshAmount: 200,
        reservoirRefreshInterval: 60000
      },
      pricing: {
        'claude-3-5-haiku-20241022': {
          input: 0.80,      // per 1M tokens
          output: 4.00      // per 1M tokens
        }
      },
      timeout: 30000,
      retries: 2
    },
    gemini: {
      name: 'gemini',
      enabled: true,
      baseURL: 'https://generativelanguage.googleapis.com',
      models: {
        'code-generator': 'gemini-3-pro',
        'code-generator-fallback': 'gemini-2.5-pro'  // Fallback when out of tokens
      },
      rateLimit: {
        maxConcurrent: 10,
        minTime: 100,
        reservoir: 200,
        reservoirRefreshAmount: 200,
        reservoirRefreshInterval: 60000
      },
      pricing: {
        'gemini-3-pro': {
          input: 0.075,     // per 1M tokens
          output: 0.30      // per 1M tokens
        },
        'gemini-2.5-pro': {
          input: 0.05,      // per 1M tokens (cheaper fallback)
          output: 0.20      // per 1M tokens
        }
      },
      timeout: 30000,
      retries: 2,
      // Token exhaustion detection
      tokenExhaustionPatterns: [
        'quota exceeded',
        'rate limit exceeded',
        'insufficient tokens',
        'token limit reached'
      ]
    },
    openrouter: {
      name: 'openrouter',
      enabled: false,
      baseURL: 'https://openrouter.ai/api/v1',
      models: {
        default: 'anthropic/claude-3-sonnet'
      },
      rateLimit: {
        maxConcurrent: 5,
        minTime: 200,
        reservoir: 100,
        reservoirRefreshAmount: 100,
        reservoirRefreshInterval: 60000
      },
      pricing: {
        default: {
          input: 3.00,
          output: 15.00
        }
      },
      timeout: 30000,
      retries: 2
    },
    scaleway: {
      name: 'scaleway',
      enabled: false,
      baseURL: 'https://api.scaleway.ai',
      models: {
        default: 'llama-3-8b-instruct'
      },
      rateLimit: {
        maxConcurrent: 5,
        minTime: 200,
        reservoir: 100,
        reservoirRefreshAmount: 100,
        reservoirRefreshInterval: 60000
      },
      pricing: {
        default: {
          input: 0.10,
          output: 0.20
        }
      },
      timeout: 30000,
      retries: 2
    },
    mistral: {
      name: 'mistral',
      enabled: false,
      baseURL: 'https://api.mistral.ai',
      models: {
        default: 'mistral-large-latest'
      },
      rateLimit: {
        maxConcurrent: 5,
        minTime: 200,
        reservoir: 100,
        reservoirRefreshAmount: 100,
        reservoirRefreshInterval: 60000
      },
      pricing: {
        default: {
          input: 2.00,
          output: 6.00
        }
      },
      timeout: 30000,
      retries: 2
    },
    demo: {
      name: 'demo',
      enabled: true,
      priority: 999, // Lowest priority
      capabilities: ['interviewer', 'planner', 'coder', 'tester', 'debugger', 'reviewer', 'deployer'],
      models: {
        default: 'demo-model'
      }
    }
  },
  
  // Role-to-Model Mappings
  // Each role can have:
  // - primary: The main provider/model to use
  // - fallbacks: Ordered list of fallback providers (tried in order on failure)
  // Fallbacks are only used for connection/provider errors, not model-specific errors
  roleMappings: {
    'clarifier': {
      primary: { provider: 'huggingface', model: 'OpenHermes-2.5-Mistral-7B' },
      fallbacks: [
        { provider: 'huggingface', model: 'Qwen/Qwen2-7B-Instruct' },
        { provider: 'openrouter', model: 'anthropic/claude-3-sonnet' }
      ]
    },
    'normalizer': {
      primary: { provider: 'electronhub', model: 'gpt-5-mini' },
      fallbacks: [
        { provider: 'deepseek', model: 'deepseek-v3-0324:free' },
        { provider: 'huggingface', model: 'OpenHermes-2.5-Mistral-7B' }
      ]
    },
    'docs-creator': {
      primary: { provider: 'github-models', model: 'meta/Llama-4-Scout-17B-16E-Instruct' },
      fallbacks: [
        { provider: 'deepseek', model: 'deepseek-v3-0324:free' },
        { provider: 'huggingface', model: 'OpenHermes-2.5-Mistral-7B' }
      ]
    },
    'schema-generator': {
      primary: { provider: 'deepseek', model: 'deepseek-v3-0324:free' },  // DeepSeek V3 for schema generation
      fallbacks: [
        { provider: 'electronhub', model: 'claude-3-5-haiku-20241022' },
        { provider: 'github-models', model: 'meta/Llama-4-Scout-17B-16E-Instruct' },
        { provider: 'huggingface', model: 'OpenHermes-2.5-Mistral-7B' }
      ]
    },
    'validator': {
      primary: { provider: 'electronhub', model: 'claude-3-5-haiku-20241022' },
      fallbacks: [
        { provider: 'deepseek', model: 'deepseek-v3-0324:free' },
        { provider: 'github-models', model: 'meta/Llama-4-Scout-17B-16E-Instruct' }
      ]
    },
    'code-generator': {
      primary: { provider: 'gemini', model: 'gemini-3-pro' },
      fallbacks: [
        { provider: 'electronhub', model: 'gpt-5-codex' }  // Only Codex as fallback for coding
      ]
    },
    'code-generator-premium': {
      primary: { provider: 'gemini', model: 'gemini-3-pro' },  // Gemini for high complexity code generation
      fallbacks: [
        { provider: 'electronhub', model: 'claude-sonnet-4-5-20250929' }  // Complex fallback only
      ]
    },
    'code-generator-fallback-complex': {
      primary: { provider: 'electronhub', model: 'claude-sonnet-4-5-20250929' },  // For complexity > 7
      fallbacks: [
        { provider: 'electronhub', model: 'gpt-5-codex' }
      ]
    },
    'code-generator-fallback-simple': {
      primary: { provider: 'electronhub', model: 'gpt-5-codex' },  // For complexity <= 7
      fallbacks: [
        { provider: 'gemini', model: 'gemini-2.5-pro' }
      ]
    },
    'debugger': {
      primary: { provider: 'deepseek', model: 'deepseek-coder' },  // DeepSeek Coder for debugging and fixing
      fallbacks: [
        { provider: 'deepseek', model: 'deepseek-r1:free' },  // R1 as fallback for reasoning
        { provider: 'electronhub', model: 'gpt-5-codex' }
      ]
    },
    'prompt-builder': {
      primary: { provider: 'electronhub', model: 'gpt-5-mini' },
      fallbacks: [
        { provider: 'electronhub', model: 'claude-3-5-haiku-20241022' },
        { provider: 'deepseek', model: 'deepseek-v3-0324:free' }
      ]
    },
    'file-structure-generator': {
      primary: { provider: 'electronhub', model: 'gpt-5-mini' },  // Use GPT-5 Mini instead of GPT-4o
      fallbacks: [
        { provider: 'deepseek', model: 'deepseek-v3-0324:free' },
        { provider: 'electronhub', model: 'claude-3-5-haiku-20241022' },
        { provider: 'github-models', model: 'meta/Llama-4-Scout-17B-16E-Instruct' }
      ]
    }
  }
};

/**
 * Environment-specific configuration overrides
 */
const ENVIRONMENT_CONFIGS = {
  development: {
    demoMode: 'auto',
    healthCheckOnStartup: true,
    healthCheckInterval: 300000,
    logging: {
      logLevel: 'debug',
      logCalls: true,
      logMetrics: true
    },
    cost: {
      maxCostPerCall: 2.0,
      maxCostPerJob: 20.0,
      maxCostPerUser: 200.0
    }
  },
  
  test: {
    demoMode: 'enabled',
    healthCheckOnStartup: false,
    healthCheckInterval: 0,
    logging: {
      logLevel: 'error',
      logCalls: false,
      logMetrics: false
    },
    providers: {
      openrouter: { enabled: false },
      deepseek: { enabled: false },
      huggingface: { enabled: false },
      anthropic: { enabled: false },
      demo: { enabled: true }
    }
  },
  
  production: {
    demoMode: 'disabled',
    healthCheckOnStartup: true,
    healthCheckInterval: 300000,
    logging: {
      logLevel: 'info',
      logCalls: true,
      logMetrics: true
    },
    cost: {
      maxCostPerCall: 1.0,
      maxCostPerJob: 10.0,
      maxCostPerUser: 100.0,
      alertThreshold: 0.8
    },
    performance: {
      maxConcurrentCalls: 20,
      requestQueueSize: 200,
      cacheEnabled: true,
      cacheTTL: 3600000
    }
  }
};

/**
 * Configuration Manager Class
 */
class ModelRouterConfig {
  constructor() {
    this.config = null;
    this.environment = process.env.NODE_ENV || 'development';
    this.configListeners = [];
    this.initialized = false;
  }

  /**
   * Initialize configuration from environment
   * @returns {Object} Loaded configuration
   */
  initialize() {
    if (this.initialized) {
      return this.config;
    }

    // Start with default config
    this.config = this.deepClone(DEFAULT_CONFIG);

    // Apply environment-specific overrides
    const envConfig = ENVIRONMENT_CONFIGS[this.environment] || {};
    this.config = this.deepMerge(this.config, envConfig);

    // Apply environment variable overrides
    this.applyEnvironmentVariables();

    // Validate configuration
    this.validate();

    this.initialized = true;
    console.log(`✅ ModelRouter configuration initialized for ${this.environment} environment`);

    return this.config;
  }

  /**
   * Apply environment variable overrides
   */
  applyEnvironmentVariables() {
    // Demo mode
    if (process.env.MODEL_ROUTER_DEMO_MODE) {
      this.config.demoMode = process.env.MODEL_ROUTER_DEMO_MODE;
    }

    // Fallback chain
    if (process.env.MODEL_ROUTER_FALLBACK_CHAIN) {
      this.config.fallbackChain = process.env.MODEL_ROUTER_FALLBACK_CHAIN.split(',').map(s => s.trim());
    }

    // Health check settings
    if (process.env.MODEL_ROUTER_HEALTH_CHECK_INTERVAL) {
      this.config.healthCheckInterval = parseInt(process.env.MODEL_ROUTER_HEALTH_CHECK_INTERVAL, 10);
    }

    // Timeout settings
    if (process.env.MODEL_ROUTER_TIMEOUT_LOW) {
      this.config.timeouts.low = parseInt(process.env.MODEL_ROUTER_TIMEOUT_LOW, 10);
    }
    if (process.env.MODEL_ROUTER_TIMEOUT_MEDIUM) {
      this.config.timeouts.medium = parseInt(process.env.MODEL_ROUTER_TIMEOUT_MEDIUM, 10);
    }
    if (process.env.MODEL_ROUTER_TIMEOUT_HIGH) {
      this.config.timeouts.high = parseInt(process.env.MODEL_ROUTER_TIMEOUT_HIGH, 10);
    }

    // Cost controls
    if (process.env.MAX_COST_PER_CALL) {
      this.config.cost.maxCostPerCall = parseFloat(process.env.MAX_COST_PER_CALL);
    }
    if (process.env.MAX_COST_PER_JOB) {
      this.config.cost.maxCostPerJob = parseFloat(process.env.MAX_COST_PER_JOB);
    }
    if (process.env.MAX_COST_PER_USER) {
      this.config.cost.maxCostPerUser = parseFloat(process.env.MAX_COST_PER_USER);
    }

    // Logging
    if (process.env.MODEL_ROUTER_LOG_LEVEL) {
      this.config.logging.logLevel = process.env.MODEL_ROUTER_LOG_LEVEL;
    }

    // Provider API keys
    this.applyProviderApiKeys();
  }

  /**
   * Apply provider API keys from environment
   */
  applyProviderApiKeys() {
    const providerKeys = {
      huggingface: process.env.HUGGINGFACE_API_KEY,
      zukijourney: process.env.ZUKIJOURNEY_API_KEY || process.env.ZUKI_API_KEY,
      electronhub: process.env.ELECTRON_HUB_KEY,  // ElectronHub for GPT-5 Mini, Claude, etc.
      'github-models': process.env.GITHUB_TOKEN,
      deepseek: process.env.ELECTRON_HUB_KEY,  // Using ElectronHub for DeepSeek
      anthropic: process.env.ANTHROPIC_API_KEY,
      gemini: process.env.GEMINI_API_KEY,
      openrouter: process.env.OPENROUTER_API_KEY,
      scaleway: process.env.SCALEWAY_API_KEY,
      mistral: process.env.MISTRAL_API_KEY
    };

    for (const [provider, apiKey] of Object.entries(providerKeys)) {
      if (this.config.providers[provider]) {
        this.config.providers[provider].apiKey = apiKey;
        
        // Disable provider if no API key in production
        if (this.environment === 'production' && !apiKey && provider !== 'demo') {
          this.config.providers[provider].enabled = false;
          console.warn(`⚠️  Provider ${provider} disabled: No API key configured`);
        }
      }
    }
  }

  /**
   * Validate configuration
   * @throws {Error} If configuration is invalid
   */
  validate() {
    const errors = [];

    // Validate demo mode
    if (!['auto', 'enabled', 'disabled'].includes(this.config.demoMode)) {
      errors.push(`Invalid demoMode: ${this.config.demoMode}. Must be 'auto', 'enabled', or 'disabled'`);
    }

    // Validate fallback chain
    if (!Array.isArray(this.config.fallbackChain) || this.config.fallbackChain.length === 0) {
      errors.push('fallbackChain must be a non-empty array');
    }

    // Validate timeouts
    if (this.config.timeouts.low <= 0 || this.config.timeouts.medium <= 0 || this.config.timeouts.high <= 0) {
      errors.push('All timeout values must be positive numbers');
    }

    // Validate cost limits
    if (this.config.cost.maxCostPerCall <= 0) {
      errors.push('maxCostPerCall must be a positive number');
    }
    if (this.config.cost.maxCostPerJob <= 0) {
      errors.push('maxCostPerJob must be a positive number');
    }
    if (this.config.cost.maxCostPerUser <= 0) {
      errors.push('maxCostPerUser must be a positive number');
    }

    // Validate log level
    const validLogLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLogLevels.includes(this.config.logging.logLevel)) {
      errors.push(`Invalid logLevel: ${this.config.logging.logLevel}. Must be one of: ${validLogLevels.join(', ')}`);
    }

    // Validate providers
    for (const [name, providerConfig] of Object.entries(this.config.providers)) {
      // Skip demo provider from strict validation
      if (name === 'demo') continue;

      // Validate required fields
      if (!providerConfig.name) {
        errors.push(`Provider ${name} must have a name field`);
      }
      
      if (typeof providerConfig.enabled !== 'boolean') {
        errors.push(`Provider ${name} must have boolean enabled field`);
      }

      // Validate models configuration
      if (!providerConfig.models || typeof providerConfig.models !== 'object') {
        errors.push(`Provider ${name} must have models configuration object`);
      }

      // Validate rate limit configuration
      if (providerConfig.rateLimit) {
        const rl = providerConfig.rateLimit;
        if (rl.maxConcurrent && rl.maxConcurrent <= 0) {
          errors.push(`Provider ${name} rateLimit.maxConcurrent must be positive`);
        }
        if (rl.minTime && rl.minTime < 0) {
          errors.push(`Provider ${name} rateLimit.minTime must be non-negative`);
        }
      }

      // Validate pricing configuration
      if (providerConfig.pricing) {
        for (const [model, pricing] of Object.entries(providerConfig.pricing)) {
          if (typeof pricing.input !== 'number' || pricing.input < 0) {
            errors.push(`Provider ${name} model ${model} pricing.input must be non-negative number`);
          }
          if (typeof pricing.output !== 'number' || pricing.output < 0) {
            errors.push(`Provider ${name} model ${model} pricing.output must be non-negative number`);
          }
        }
      }

      // Validate timeout
      if (providerConfig.timeout && providerConfig.timeout <= 0) {
        errors.push(`Provider ${name} timeout must be positive`);
      }

      // Validate retries
      if (providerConfig.retries !== undefined && providerConfig.retries < 0) {
        errors.push(`Provider ${name} retries must be non-negative`);
      }

      // Warn if enabled provider has no API key (except for providers that don't need one)
      if (providerConfig.enabled && !providerConfig.apiKey && this.environment === 'production') {
        const noKeyProviders = ['demo', 'github-models']; // github-models uses GITHUB_TOKEN
        if (!noKeyProviders.includes(name)) {
          console.warn(`⚠️  Warning: Provider ${name} is enabled but has no API key configured`);
        }
      }
    }

    // Validate role mappings
    if (this.config.roleMappings) {
      for (const [role, mapping] of Object.entries(this.config.roleMappings)) {
        if (!mapping.primary) {
          errors.push(`Role ${role} must have primary provider mapping`);
        } else {
          // Validate primary mapping
          if (!mapping.primary.provider) {
            errors.push(`Role ${role} primary mapping must have provider`);
          }
          if (!mapping.primary.model) {
            errors.push(`Role ${role} primary mapping must have model`);
          }
          
          // Check if provider exists
          if (!this.config.providers[mapping.primary.provider]) {
            errors.push(`Role ${role} references non-existent provider: ${mapping.primary.provider}`);
          }
        }

        // Validate fallbacks array if present
        if (mapping.fallbacks) {
          if (!Array.isArray(mapping.fallbacks)) {
            errors.push(`Role ${role} fallbacks must be an array`);
          } else {
            mapping.fallbacks.forEach((fallback, index) => {
              if (!fallback.provider) {
                errors.push(`Role ${role} fallback[${index}] must have provider`);
              }
              if (!fallback.model) {
                errors.push(`Role ${role} fallback[${index}] must have model`);
              }
              
              // Check if provider exists
              if (fallback.provider && !this.config.providers[fallback.provider]) {
                errors.push(`Role ${role} fallback[${index}] references non-existent provider: ${fallback.provider}`);
              }
            });
          }
        }

        // Support legacy single fallback format for backward compatibility
        if (mapping.fallback) {
          if (!mapping.fallback.provider) {
            errors.push(`Role ${role} fallback mapping must have provider`);
          }
          if (!mapping.fallback.model) {
            errors.push(`Role ${role} fallback mapping must have model`);
          }
          
          // Check if provider exists
          if (!this.config.providers[mapping.fallback.provider]) {
            errors.push(`Role ${role} references non-existent fallback provider: ${mapping.fallback.provider}`);
          }
        }
      }
    }

    // Check if at least one provider is enabled
    const hasEnabledProvider = Object.values(this.config.providers).some(p => p.enabled);
    if (!hasEnabledProvider) {
      errors.push('At least one provider must be enabled');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }

    console.log('✅ Configuration validation passed');
  }

  /**
   * Get current configuration
   * @returns {Object} Current configuration
   */
  get() {
    if (!this.initialized) {
      this.initialize();
    }
    return this.deepClone(this.config);
  }

  /**
   * Get specific configuration value
   * @param {string} path - Dot-notation path (e.g., 'cost.maxCostPerCall')
   * @returns {*} Configuration value
   */
  getValue(path) {
    if (!this.initialized) {
      this.initialize();
    }

    const parts = path.split('.');
    let value = this.config;

    for (const part of parts) {
      if (value === undefined || value === null) {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }

  /**
   * Update configuration at runtime
   * @param {string} path - Dot-notation path
   * @param {*} value - New value
   * @returns {boolean} Success status
   */
  update(path, value) {
    if (!this.initialized) {
      this.initialize();
    }

    const parts = path.split('.');
    const lastPart = parts.pop();
    let target = this.config;

    // Navigate to the parent object
    for (const part of parts) {
      if (!target[part]) {
        target[part] = {};
      }
      target = target[part];
    }

    // Store old value
    const oldValue = target[lastPart];

    // Update value
    target[lastPart] = value;

    try {
      // Validate after update
      this.validate();

      // Notify listeners
      this.notifyListeners(path, value, oldValue);

      console.log(`✅ Configuration updated: ${path} = ${JSON.stringify(value)}`);
      return true;
    } catch (error) {
      // Rollback on validation failure
      target[lastPart] = oldValue;
      console.error(`❌ Configuration update failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update multiple configuration values
   * @param {Object} updates - Object with paths as keys and new values
   * @returns {boolean} Success status
   */
  updateMultiple(updates) {
    if (!this.initialized) {
      this.initialize();
    }

    const oldConfig = this.deepClone(this.config);

    try {
      // Apply all updates
      for (const [path, value] of Object.entries(updates)) {
        const parts = path.split('.');
        const lastPart = parts.pop();
        let target = this.config;

        for (const part of parts) {
          if (!target[part]) {
            target[part] = {};
          }
          target = target[part];
        }

        target[lastPart] = value;
      }

      // Validate after all updates
      this.validate();

      // Notify listeners for each update
      for (const [path, value] of Object.entries(updates)) {
        const oldValue = this.getValueFromPath(oldConfig, path);
        this.notifyListeners(path, value, oldValue);
      }

      console.log(`✅ Multiple configuration values updated: ${Object.keys(updates).join(', ')}`);
      return true;
    } catch (error) {
      // Rollback all changes on validation failure
      this.config = oldConfig;
      console.error(`❌ Multiple configuration update failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get value from object using dot-notation path
   * @param {Object} obj - Object to traverse
   * @param {string} path - Dot-notation path
   * @returns {*} Value at path
   */
  getValueFromPath(obj, path) {
    const parts = path.split('.');
    let value = obj;

    for (const part of parts) {
      if (value === undefined || value === null) {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }

  /**
   * Register a configuration change listener
   * @param {Function} callback - Callback function (path, newValue, oldValue)
   */
  onChange(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    this.configListeners.push(callback);
  }

  /**
   * Notify all listeners of configuration change
   * @param {string} path - Changed path
   * @param {*} newValue - New value
   * @param {*} oldValue - Old value
   */
  notifyListeners(path, newValue, oldValue) {
    for (const listener of this.configListeners) {
      try {
        listener(path, newValue, oldValue);
      } catch (error) {
        console.error('Configuration listener error:', error);
      }
    }
  }

  /**
   * Reset configuration to defaults
   */
  reset() {
    this.config = this.deepClone(DEFAULT_CONFIG);
    const envConfig = ENVIRONMENT_CONFIGS[this.environment] || {};
    this.config = this.deepMerge(this.config, envConfig);
    this.applyEnvironmentVariables();
    this.validate();
    console.log('✅ Configuration reset to defaults');
  }

  /**
   * Export configuration as JSON
   * @param {boolean} includeSecrets - Whether to include API keys
   * @returns {string} JSON string
   */
  export(includeSecrets = false) {
    if (!this.initialized) {
      this.initialize();
    }

    const exportConfig = this.deepClone(this.config);

    if (!includeSecrets) {
      // Remove API keys
      for (const provider of Object.values(exportConfig.providers)) {
        if (provider.apiKey) {
          provider.apiKey = '***REDACTED***';
        }
      }
    }

    return JSON.stringify(exportConfig, null, 2);
  }

  /**
   * Deep clone an object
   * @param {*} obj - Object to clone
   * @returns {*} Cloned object
   */
  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }

    if (obj instanceof Array) {
      return obj.map(item => this.deepClone(item));
    }

    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }

    return cloned;
  }

  /**
   * Deep merge two objects
   * @param {Object} target - Target object
   * @param {Object} source - Source object
   * @returns {Object} Merged object
   */
  deepMerge(target, source) {
    const result = this.deepClone(target);

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = this.deepMerge(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * Get provider configuration
   * @param {string} providerName - Provider name
   * @returns {Object|null} Provider configuration
   */
  getProviderConfig(providerName) {
    if (!this.initialized) {
      this.initialize();
    }
    return this.config.providers[providerName] || null;
  }

  /**
   * Check if provider is enabled
   * @param {string} providerName - Provider name
   * @returns {boolean} Whether provider is enabled
   */
  isProviderEnabled(providerName) {
    const providerConfig = this.getProviderConfig(providerName);
    return providerConfig ? providerConfig.enabled : false;
  }

  /**
   * Enable or disable a provider
   * @param {string} providerName - Provider name
   * @param {boolean} enabled - Enable status
   */
  setProviderEnabled(providerName, enabled) {
    this.update(`providers.${providerName}.enabled`, enabled);
  }

  /**
   * Get all enabled providers
   * @returns {Array<string>} List of enabled provider names
   */
  getEnabledProviders() {
    if (!this.initialized) {
      this.initialize();
    }

    return Object.entries(this.config.providers)
      .filter(([_, config]) => config.enabled)
      .map(([name, _]) => name);
  }

  /**
   * Get role mapping configuration
   * @param {string} role - Agent role name
   * @returns {Object|null} Role mapping with primary and optional fallback
   */
  getRoleMapping(role) {
    if (!this.initialized) {
      this.initialize();
    }
    return this.config.roleMappings[role] || null;
  }

  /**
   * Get all role mappings
   * @returns {Object} All role mappings
   */
  getAllRoleMappings() {
    if (!this.initialized) {
      this.initialize();
    }
    return this.deepClone(this.config.roleMappings);
  }

  /**
   * Get model pricing information
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   * @returns {Object|null} Pricing info with input and output costs per 1M tokens
   */
  getModelPricing(provider, model) {
    if (!this.initialized) {
      this.initialize();
    }

    const providerConfig = this.config.providers[provider];
    if (!providerConfig || !providerConfig.pricing) {
      return null;
    }

    return providerConfig.pricing[model] || providerConfig.pricing.default || null;
  }

  /**
   * Update model pricing
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   * @param {Object} pricing - Pricing info
   * @param {number} pricing.input - Input cost per 1M tokens
   * @param {number} pricing.output - Output cost per 1M tokens
   * @returns {boolean} Success status
   */
  updateModelPricing(provider, model, pricing) {
    if (!this.initialized) {
      this.initialize();
    }

    // Validate pricing
    if (typeof pricing.input !== 'number' || pricing.input < 0) {
      throw new Error('pricing.input must be a non-negative number');
    }
    if (typeof pricing.output !== 'number' || pricing.output < 0) {
      throw new Error('pricing.output must be a non-negative number');
    }

    // Check if provider exists
    if (!this.config.providers[provider]) {
      throw new Error(`Provider ${provider} not found`);
    }

    // Update pricing
    const path = `providers.${provider}.pricing.${model}`;
    return this.update(path, pricing);
  }

  /**
   * Update multiple model pricings at once
   * @param {Object} pricingUpdates - Object with provider.model as keys and pricing as values
   * @returns {boolean} Success status
   * @example
   * updateMultiplePricing({
   *   'huggingface.OpenHermes-2.5-Mistral-7B': { input: 0.0001, output: 0.0002 },
   *   'zukijourney.gpt-5-mini': { input: 0.15, output: 0.60 }
   * })
   */
  updateMultiplePricing(pricingUpdates) {
    if (!this.initialized) {
      this.initialize();
    }

    const updates = {};

    for (const [key, pricing] of Object.entries(pricingUpdates)) {
      const [provider, model] = key.split('.');
      
      if (!provider || !model) {
        throw new Error(`Invalid pricing key format: ${key}. Expected 'provider.model'`);
      }

      // Validate pricing
      if (typeof pricing.input !== 'number' || pricing.input < 0) {
        throw new Error(`Invalid input pricing for ${key}: must be a non-negative number`);
      }
      if (typeof pricing.output !== 'number' || pricing.output < 0) {
        throw new Error(`Invalid output pricing for ${key}: must be a non-negative number`);
      }

      // Check if provider exists
      if (!this.config.providers[provider]) {
        throw new Error(`Provider ${provider} not found`);
      }

      const path = `providers.${provider}.pricing.${model}`;
      updates[path] = pricing;
    }

    return this.updateMultiple(updates);
  }

  /**
   * Get all pricing information
   * @returns {Object} All pricing info organized by provider and model
   */
  getAllPricing() {
    if (!this.initialized) {
      this.initialize();
    }

    const pricing = {};

    for (const [providerName, providerConfig] of Object.entries(this.config.providers)) {
      if (providerConfig.pricing) {
        pricing[providerName] = this.deepClone(providerConfig.pricing);
      }
    }

    return pricing;
  }

  /**
   * Get provider base URL
   * @param {string} provider - Provider name
   * @returns {string|null} Base URL
   */
  getProviderBaseURL(provider) {
    const providerConfig = this.getProviderConfig(provider);
    return providerConfig ? providerConfig.baseURL : null;
  }

  /**
   * Get provider API key
   * @param {string} provider - Provider name
   * @returns {string|null} API key
   */
  getProviderApiKey(provider) {
    const providerConfig = this.getProviderConfig(provider);
    return providerConfig ? providerConfig.apiKey : null;
  }

  /**
   * Get provider rate limit configuration
   * @param {string} provider - Provider name
   * @returns {Object|null} Rate limit configuration
   */
  getProviderRateLimit(provider) {
    const providerConfig = this.getProviderConfig(provider);
    return providerConfig && providerConfig.rateLimit ? 
      this.deepClone(providerConfig.rateLimit) : null;
  }
}

// Create singleton instance
const configInstance = new ModelRouterConfig();

module.exports = configInstance;
module.exports.ModelRouterConfig = ModelRouterConfig;
module.exports.DEFAULT_CONFIG = DEFAULT_CONFIG;
module.exports.ENVIRONMENT_CONFIGS = ENVIRONMENT_CONFIGS;
