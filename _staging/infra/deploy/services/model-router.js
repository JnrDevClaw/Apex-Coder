/**
 * ModelRouter - Pluggable LLM provider routing system
 * Routes AI tasks to optimal LLM providers based on agent roles and task complexity
 */

/**
 * Base LLM Provider interface
 * All LLM providers must implement this interface
 */
class LLMProvider {
  constructor(config) {
    this.name = config.name;
    this.capabilities = config.capabilities || [];
    this.costPerToken = config.costPerToken || 0.001;
    this.maxTokens = config.maxTokens || 4096;
    this.latency = config.latency || 200; // ms
    this.reliability = config.reliability || 0.99;
    this.config = config;
  }

  /**
   * Make a call to the LLM provider
   * @param {string} prompt - The prompt to send
   * @param {Object} context - Additional context for the call
   * @returns {Promise<LLMResponse>}
   */
  async call(prompt, context = {}) {
    throw new Error('LLMProvider.call() must be implemented by subclass');
  }

  /**
   * Check if provider supports a specific agent role
   * @param {string} role - Agent role to check
   * @returns {boolean}
   */
  supportsRole(role) {
    return this.capabilities.includes(role);
  }

  /**
   * Get provider health status
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      const response = await this.call('test', { timeout: 5000 });
      return response && response.success;
    } catch (error) {
      return false;
    }
  }
}

/**
 * LLM Response structure
 */
class LLMResponse {
  constructor(data) {
    this.success = data.success || false;
    this.content = data.content || '';
    this.tokens = data.tokens || 0;
    this.cost = data.cost || 0;
    this.latency = data.latency || 0;
    this.provider = data.provider || '';
    this.model = data.model || '';
    this.error = data.error || null;
    this.metadata = data.metadata || {};
  }
}

/**
 * Agent roles with their characteristics
 */
const AGENT_ROLES = {
  INTERVIEWER: {
    name: 'interviewer',
    description: 'Pre-questionnaire agent for spec collection',
    preferredModels: ['mistral', 'vicuna'],
    complexity: 'low',
    requirements: ['chat', 'low-latency']
  },
  PLANNER: {
    name: 'planner',
    description: 'Architect that decomposes specs into tasks',
    preferredModels: ['deepseek-r1', 'llama-3-8b'],
    complexity: 'high',
    requirements: ['reasoning', 'planning']
  },
  SCHEMA_DESIGNER: {
    name: 'schema-designer',
    description: 'Designs APIs and database schemas',
    preferredModels: ['deepseek-v3', 'mistral'],
    complexity: 'medium',
    requirements: ['structured-output', 'technical']
  },
  CODER: {
    name: 'coder',
    description: 'Generates frontend/backend/infrastructure code',
    preferredModels: ['starcoder2', 'codegen-16b', 'deepseek-v3'],
    complexity: 'high',
    requirements: ['code-generation', 'multi-language']
  },
  TESTER: {
    name: 'tester',
    description: 'Generates and runs tests',
    preferredModels: ['gpt-j', 'codegen-16b'],
    complexity: 'medium',
    requirements: ['code-generation', 'testing']
  },
  DEBUGGER: {
    name: 'debugger',
    description: 'Analyzes failures and generates patches',
    preferredModels: ['deepseek-r1', 'claude'],
    complexity: 'high',
    requirements: ['reasoning', 'debugging', 'patch-generation']
  },
  REVIEWER: {
    name: 'reviewer',
    description: 'Code quality and security review',
    preferredModels: ['mistral', 'glm-4.1v'],
    complexity: 'medium',
    requirements: ['analysis', 'security']
  },
  DEPLOYER: {
    name: 'deployer',
    description: 'Creates deployment configurations',
    preferredModels: ['deepseek-v3', 'claude'],
    complexity: 'medium',
    requirements: ['infrastructure', 'deployment']
  }
};

/**
 * ModelRouter - Routes tasks to optimal LLM providers
 */
class ModelRouter {
  constructor() {
    this.providers = new Map();
    this.weights = new Map();
    this.fallbackChain = [];
    this.metrics = {
      totalCalls: 0,
      successfulCalls: 0,
      totalCost: 0,
      averageLatency: 0
    };
    this.initialized = false;
    this.demoMode = false;
    this.providerHealth = new Map();
  }

  /**
   * Initialize ModelRouter with configuration
   * @param {Object} config - Configuration object
   * @returns {Promise<void>}
   */
  async initialize(config = {}) {
    if (this.initialized) {
      console.log('ModelRouter already initialized');
      return;
    }

    console.log('Initializing ModelRouter...');

    // Load configuration from environment or provided config
    const routerConfig = {
      demoMode: config.demoMode || process.env.MODEL_ROUTER_DEMO_MODE || 'auto',
      fallbackChain: config.fallbackChain || 
        (process.env.MODEL_ROUTER_FALLBACK_CHAIN || 'openrouter,deepseek,huggingface,demo').split(','),
      providers: config.providers || this.loadProvidersFromEnv(),
      healthCheckOnStartup: config.healthCheckOnStartup !== false,
      healthCheckInterval: config.healthCheckInterval || 300000 // 5 minutes
    };

    // Determine if we should use demo mode
    this.demoMode = this.shouldUseDemoMode(routerConfig);

    if (this.demoMode) {
      console.log('⚠️  Running in DEMO MODE - No API keys configured');
      console.log('   Add API keys to .env to enable real LLM providers');
    }

    // Register providers from configuration
    await this.registerProvidersFromConfig(routerConfig.providers);

    // Set fallback chain
    this.fallbackChain = routerConfig.fallbackChain;

    // Perform health checks if enabled
    if (routerConfig.healthCheckOnStartup) {
      await this.performHealthChecks();
    }

    // Setup periodic health checks
    if (routerConfig.healthCheckInterval > 0) {
      this.setupPeriodicHealthChecks(routerConfig.healthCheckInterval);
    }

    this.initialized = true;
    console.log(`✅ ModelRouter initialized with ${this.providers.size} providers`);
    console.log(`   Fallback chain: ${this.fallbackChain.join(' → ')}`);
  }

  /**
   * Load provider configurations from environment variables
   * @returns {Array<Object>}
   */
  loadProvidersFromEnv() {
    const providers = [];

    // Gemini (Primary for coding)
    if (process.env.GEMINI_API_KEY) {
      providers.push({
        name: 'gemini',
        type: 'GeminiProvider',
        config: {
          apiKey: process.env.GEMINI_API_KEY,
          priority: 1
        }
      });
    }

    // OpenRouter
    if (process.env.OPENROUTER_API_KEY) {
      providers.push({
        name: 'openrouter',
        type: 'OpenRouterProvider',
        config: {
          apiKey: process.env.OPENROUTER_API_KEY,
          priority: 2
        }
      });
    }

    // DeepSeek
    if (process.env.DEEPSEEK_API_KEY) {
      providers.push({
        name: 'deepseek',
        type: 'DeepSeekProvider',
        config: {
          apiKey: process.env.DEEPSEEK_API_KEY,
          priority: 1
        }
      });
    }

    // HuggingFace
    if (process.env.HUGGINGFACE_API_KEY) {
      providers.push({
        name: 'huggingface',
        type: 'HuggingFaceProvider',
        config: {
          apiKey: process.env.HUGGINGFACE_API_KEY,
          priority: 3
        }
      });
    }

    // Anthropic
    if (process.env.ANTHROPIC_API_KEY) {
      providers.push({
        name: 'anthropic',
        type: 'AnthropicProvider',
        config: {
          apiKey: process.env.ANTHROPIC_API_KEY,
          priority: 2
        }
      });
    }

    // Always add demo provider as fallback
    providers.push({
      name: 'demo',
      type: 'DemoProvider',
      config: {
        priority: 999 // Lowest priority
      }
    });

    return providers;
  }

  /**
   * Determine if demo mode should be used
   * @param {Object} config - Router configuration
   * @returns {boolean}
   */
  shouldUseDemoMode(config) {
    if (config.demoMode === 'enabled' || config.demoMode === true) {
      return true;
    }

    if (config.demoMode === 'disabled' || config.demoMode === false) {
      return false;
    }

    // Auto mode: use demo if no real API keys are configured
    if (config.demoMode === 'auto') {
      const hasRealProvider = config.providers.some(p => 
        p.name !== 'demo' && p.config && p.config.apiKey
      );
      return !hasRealProvider;
    }

    return false;
  }

  /**
   * Register providers from configuration
   * @param {Array<Object>} providerConfigs - Provider configurations
   * @returns {Promise<void>}
   */
  async registerProvidersFromConfig(providerConfigs) {
    const providerModules = require('./providers');

    for (const providerConfig of providerConfigs) {
      try {
        const ProviderClass = providerModules[providerConfig.type];
        
        if (!ProviderClass) {
          console.warn(`Provider type ${providerConfig.type} not found, skipping`);
          continue;
        }

        const provider = new ProviderClass(providerConfig.config);
        this.registerProvider(provider);
        
        console.log(`  ✓ Registered ${providerConfig.name} provider`);
      } catch (error) {
        console.error(`  ✗ Failed to register ${providerConfig.name}:`, error.message);
      }
    }
  }

  /**
   * Perform health checks on all providers
   * @returns {Promise<Object>}
   */
  async performHealthChecks() {
    console.log('Performing provider health checks...');
    
    const healthResults = {};
    const healthPromises = [];

    for (const [name, provider] of this.providers) {
      healthPromises.push(
        this.checkProviderHealth(name, provider)
          .then(healthy => {
            healthResults[name] = healthy;
            this.providerHealth.set(name, {
              healthy,
              lastCheck: new Date(),
              consecutiveFailures: healthy ? 0 : (this.providerHealth.get(name)?.consecutiveFailures || 0) + 1
            });
            
            const status = healthy ? '✓' : '✗';
            console.log(`  ${status} ${name}: ${healthy ? 'healthy' : 'unhealthy'}`);
            
            return { name, healthy };
          })
      );
    }

    await Promise.all(healthPromises);
    
    return healthResults;
  }

  /**
   * Check health of a single provider
   * @param {string} name - Provider name
   * @param {LLMProvider} provider - Provider instance
   * @returns {Promise<boolean>}
   */
  async checkProviderHealth(name, provider) {
    try {
      // Demo provider is always healthy
      if (name === 'demo') {
        return true;
      }

      // Check if provider has API key configured
      if (provider.apiKey === undefined || provider.apiKey === null || provider.apiKey === '') {
        return false;
      }

      // Perform actual health check with timeout
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Health check timeout')), 5000)
      );
      
      const healthPromise = provider.healthCheck();
      const healthy = await Promise.race([healthPromise, timeoutPromise]);
      
      return healthy === true;
    } catch (error) {
      console.error(`Health check failed for ${name}:`, error.message);
      return false;
    }
  }

  /**
   * Setup periodic health checks
   * @param {number} interval - Interval in milliseconds
   */
  setupPeriodicHealthChecks(interval) {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, interval);
  }

  /**
   * Get provider health status
   * @returns {Object}
   */
  getProviderHealth() {
    const health = {};
    
    for (const [name, status] of this.providerHealth) {
      health[name] = {
        healthy: status.healthy,
        lastCheck: status.lastCheck,
        consecutiveFailures: status.consecutiveFailures
      };
    }
    
    return health;
  }

  /**
   * Shutdown ModelRouter and cleanup resources
   */
  shutdown() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    this.initialized = false;
    console.log('ModelRouter shutdown complete');
  }

  /**
   * Register a new LLM provider
   * @param {LLMProvider} provider - Provider instance to register
   */
  registerProvider(provider) {
    if (!(provider instanceof LLMProvider)) {
      throw new Error('Provider must extend LLMProvider class');
    }
    
    this.providers.set(provider.name, provider);
    
    // Initialize weights for each capability
    provider.capabilities.forEach(capability => {
      if (!this.weights.has(capability)) {
        this.weights.set(capability, new Map());
      }
      this.weights.get(capability).set(provider.name, provider.reliability);
    });
    
    console.log(`Registered LLM provider: ${provider.name} with capabilities: ${provider.capabilities.join(', ')}`);
  }

  /**
   * Route a task to the optimal provider
   * @param {Object} task - Task to route
   * @param {Object} context - Additional context
   * @returns {Promise<LLMResponse>}
   */
  async routeTask(task, context = {}) {
    const { role, complexity = 'medium', prompt, fallback = true, timeout } = task;
    
    if (!role || !AGENT_ROLES[role.toUpperCase()]) {
      throw new Error(`Invalid agent role: ${role}`);
    }
    
    const agentRole = AGENT_ROLES[role.toUpperCase()];
    const optimalProvider = this.getOptimalModel(role, complexity);
    
    if (!optimalProvider) {
      throw new Error(`No provider available for role: ${role}`);
    }
    
    // Determine timeout based on complexity and configuration
    const callTimeout = timeout || this.getTimeoutForComplexity(complexity);
    
    const startTime = Date.now();
    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`LLM call timeout after ${callTimeout}ms`));
        }, callTimeout);
      });
      
      // Race between actual call and timeout
      const callPromise = optimalProvider.call(prompt, {
        ...context,
        role,
        complexity,
        agentRole,
        timeout: callTimeout
      });
      
      const response = await Promise.race([callPromise, timeoutPromise]);
      
      const latency = Date.now() - startTime;
      this.updateMetrics(response, latency, context);
      
      // Track performance in monitoring service
      try {
        const monitoringService = require('./monitoring');
        if (monitoringService.initialized) {
          monitoringService.trackLLMCall(response.provider, latency, response.success);
        }
      } catch (monitorError) {
        // Don't fail if monitoring fails
        console.error('Failed to track LLM call in monitoring:', monitorError.message);
      }
      
      return response;
    } catch (error) {
      const latency = Date.now() - startTime;
      const isTimeout = error.message.includes('timeout');
      
      console.error(`Provider ${optimalProvider.name} failed for role ${role}:`, error);
      
      // Log model error with structured logging
      const structuredLogger = require('./structured-logger');
      structuredLogger.error('LLM call failed', {
        error: error.message,
        provider: optimalProvider.name,
        model: optimalProvider.model,
        role,
        complexity,
        latency,
        isTimeout,
        userId: context.userId,
        projectId: context.projectId,
        correlationId: context.correlationId
      });
      
      // Send error notification for critical failures
      if (isTimeout || latency > callTimeout * 0.9) {
        try {
          const errorNotifier = require('./error-notifier');
          await errorNotifier.notifyError(error, {
            severity: isTimeout ? 'high' : 'medium',
            operation: 'llm_call',
            additionalInfo: {
              provider: optimalProvider.name,
              role,
              complexity,
              latency,
              isTimeout
            },
            userId: context.userId,
            projectId: context.projectId,
            correlationId: context.correlationId
          });
        } catch (notifyError) {
          console.error('Failed to send error notification:', notifyError.message);
        }
      }
      
      // Track failed call
      this.updateMetrics({ 
        success: false, 
        cost: 0, 
        provider: optimalProvider.name,
        model: optimalProvider.model || 'unknown',
        tokens: 0,
        error: error.message
      }, latency, context);
      
      // Track performance in monitoring service
      try {
        const monitoringService = require('./monitoring');
        if (monitoringService.initialized) {
          monitoringService.trackLLMCall(optimalProvider.name, latency, false);
        }
      } catch (monitorError) {
        // Don't fail if monitoring fails
        console.error('Failed to track LLM call in monitoring:', monitorError.message);
      }
      
      if (fallback) {
        return this.handleFallback(task, context, optimalProvider.name);
      }
      
      throw error;
    }
  }

  /**
   * Get timeout duration based on task complexity
   * @param {string} complexity - Task complexity (low, medium, high)
   * @returns {number} Timeout in milliseconds
   */
  getTimeoutForComplexity(complexity) {
    const timeouts = {
      low: 15000,    // 15 seconds
      medium: 30000, // 30 seconds
      high: 60000    // 60 seconds
    };
    
    return timeouts[complexity] || timeouts.medium;
  }

  /**
   * Get optimal model for a role and complexity
   * @param {string} role - Agent role
   * @param {string} complexity - Task complexity (low, medium, high)
   * @returns {LLMProvider|null}
   */
  getOptimalModel(role, complexity = 'medium') {
    const agentRole = AGENT_ROLES[role.toUpperCase()];
    if (!agentRole) return null;
    
    // Get providers that support this role
    const candidateProviders = [];
    
    for (const [providerName, provider] of this.providers) {
      if (provider.supportsRole(role)) {
        const weight = this.calculateProviderWeight(provider, agentRole, complexity);
        candidateProviders.push({ provider, weight });
      }
    }
    
    if (candidateProviders.length === 0) return null;
    
    // Sort by weight (higher is better)
    candidateProviders.sort((a, b) => b.weight - a.weight);
    
    return candidateProviders[0].provider;
  }

  /**
   * Get weighted routing options for a role
   * @param {string} role - Agent role
   * @returns {Array<{provider: LLMProvider, weight: number}>}
   */
  getWeightedRouting(role) {
    const agentRole = AGENT_ROLES[role.toUpperCase()];
    if (!agentRole) return [];
    
    const weightedProviders = [];
    
    for (const [providerName, provider] of this.providers) {
      if (provider.supportsRole(role)) {
        const weight = this.calculateProviderWeight(provider, agentRole, 'medium');
        weightedProviders.push({ provider, weight });
      }
    }
    
    return weightedProviders.sort((a, b) => b.weight - a.weight);
  }

  /**
   * Calculate provider weight based on role requirements and complexity
   * @param {LLMProvider} provider - Provider to evaluate
   * @param {Object} agentRole - Agent role configuration
   * @param {string} complexity - Task complexity
   * @returns {number}
   */
  calculateProviderWeight(provider, agentRole, complexity) {
    let weight = provider.reliability;
    
    // Prefer models listed in preferredModels
    const isPreferred = agentRole.preferredModels.some(model => 
      provider.name.toLowerCase().includes(model.toLowerCase())
    );
    if (isPreferred) weight += 0.2;
    
    // Adjust for complexity
    if (complexity === 'high' && provider.maxTokens >= 8192) weight += 0.1;
    if (complexity === 'low' && provider.latency < 500) weight += 0.1;
    
    // Cost consideration (lower cost is better for non-critical tasks)
    if (provider.costPerToken < 0.001) weight += 0.05;
    
    return Math.min(weight, 1.0);
  }

  /**
   * Handle fallback when primary provider fails
   * @param {Object} task - Original task
   * @param {Object} context - Task context
   * @param {string} failedProvider - Name of failed provider
   * @returns {Promise<LLMResponse>}
   */
  async handleFallback(task, context, failedProvider) {
    const { role } = task;
    const attemptedProviders = context.attemptedProviders || [failedProvider];
    const retryCount = context.retryCount || 0;
    
    // Get fallback chain based on configuration
    const fallbackChain = this.getFallbackChain(role, attemptedProviders);
    
    if (fallbackChain.length === 0) {
      throw new Error(`No fallback provider available for role: ${role} after trying: ${attemptedProviders.join(', ')}`);
    }
    
    // Try each provider in the fallback chain
    for (let i = 0; i < fallbackChain.length; i++) {
      const providerName = fallbackChain[i];
      const provider = this.providers.get(providerName);
      
      if (!provider) {
        console.warn(`Fallback provider ${providerName} not found, skipping`);
        continue;
      }
      
      // Check provider health before attempting
      const health = this.providerHealth.get(providerName);
      if (health && !health.healthy && health.consecutiveFailures >= 3) {
        console.log(`Skipping unhealthy provider ${providerName} (${health.consecutiveFailures} consecutive failures)`);
        continue;
      }
      
      console.log(`Falling back to ${providerName} for role ${role} (attempt ${retryCount + 1})`);
      
      // Calculate exponential backoff delay
      const backoffDelay = this.calculateBackoffDelay(retryCount);
      if (backoffDelay > 0) {
        console.log(`Waiting ${backoffDelay}ms before retry...`);
        await this.sleep(backoffDelay);
      }
      
      try {
        const startTime = Date.now();
        const response = await provider.call(task.prompt, {
          ...context,
          attemptedProviders: [...attemptedProviders, providerName],
          retryCount: retryCount + 1,
          fallback: i < fallbackChain.length - 1 // Allow fallback unless this is the last provider
        });
        
        const latency = Date.now() - startTime;
        
        // Update metrics
        this.updateMetrics(response, latency, context);
        
        // Track fallback metrics
        this.trackFallbackMetrics(failedProvider, providerName, true);
        
        // Update provider health on success
        this.updateProviderHealthStatus(providerName, true);
        
        return response;
      } catch (error) {
        console.error(`Fallback provider ${providerName} failed:`, error.message);
        
        // Update provider health on failure
        this.updateProviderHealthStatus(providerName, false);
        
        // Track fallback metrics
        this.trackFallbackMetrics(failedProvider, providerName, false);
        
        // Continue to next provider in chain
        attemptedProviders.push(providerName);
      }
    }
    
    // All fallback providers failed
    throw new Error(`All fallback providers failed for role: ${role}. Attempted: ${attemptedProviders.join(', ')}`);
  }

  /**
   * Get fallback chain for a role, excluding already attempted providers
   * @param {string} role - Agent role
   * @param {Array<string>} attemptedProviders - Providers already attempted
   * @returns {Array<string>}
   */
  getFallbackChain(role, attemptedProviders = []) {
    // Start with configured fallback chain
    let chain = [...this.fallbackChain];
    
    // Filter out already attempted providers
    chain = chain.filter(name => !attemptedProviders.includes(name));
    
    // Filter to only providers that support this role
    chain = chain.filter(name => {
      const provider = this.providers.get(name);
      return provider && provider.supportsRole(role);
    });
    
    return chain;
  }

  /**
   * Calculate exponential backoff delay
   * @param {number} retryCount - Number of retries so far
   * @returns {number} Delay in milliseconds
   */
  calculateBackoffDelay(retryCount) {
    if (retryCount === 0) return 0;
    
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s (max)
    const baseDelay = 1000;
    const maxDelay = 16000;
    const delay = Math.min(baseDelay * Math.pow(2, retryCount - 1), maxDelay);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.3 * delay;
    
    return Math.floor(delay + jitter);
  }

  /**
   * Update provider health status
   * @param {string} providerName - Provider name
   * @param {boolean} success - Whether the call succeeded
   */
  updateProviderHealthStatus(providerName, success) {
    const currentHealth = this.providerHealth.get(providerName) || {
      healthy: true,
      lastCheck: new Date(),
      consecutiveFailures: 0
    };
    
    if (success) {
      this.providerHealth.set(providerName, {
        healthy: true,
        lastCheck: new Date(),
        consecutiveFailures: 0
      });
    } else {
      const consecutiveFailures = currentHealth.consecutiveFailures + 1;
      this.providerHealth.set(providerName, {
        healthy: consecutiveFailures < 3, // Mark unhealthy after 3 consecutive failures
        lastCheck: new Date(),
        consecutiveFailures
      });
    }
  }

  /**
   * Track fallback metrics
   * @param {string} fromProvider - Original provider that failed
   * @param {string} toProvider - Fallback provider
   * @param {boolean} success - Whether fallback succeeded
   */
  trackFallbackMetrics(fromProvider, toProvider, success) {
    if (!this.metrics.fallbacks) {
      this.metrics.fallbacks = {
        total: 0,
        successful: 0,
        byProvider: {}
      };
    }
    
    this.metrics.fallbacks.total++;
    if (success) {
      this.metrics.fallbacks.successful++;
    }
    
    const key = `${fromProvider}->${toProvider}`;
    if (!this.metrics.fallbacks.byProvider[key]) {
      this.metrics.fallbacks.byProvider[key] = {
        attempts: 0,
        successes: 0
      };
    }
    
    this.metrics.fallbacks.byProvider[key].attempts++;
    if (success) {
      this.metrics.fallbacks.byProvider[key].successes++;
    }
  }

  /**
   * Sleep utility for backoff delays
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update routing metrics
   * @param {LLMResponse} response - Response from provider
   * @param {number} latency - Response latency in ms
   * @param {Object} context - Call context for logging
   */
  updateMetrics(response, latency, context = {}) {
    this.metrics.totalCalls++;
    if (response.success) {
      this.metrics.successfulCalls++;
    }
    this.metrics.totalCost += response.cost || 0;
    
    // Update rolling average latency
    const alpha = 0.1; // Smoothing factor
    this.metrics.averageLatency = 
      (1 - alpha) * this.metrics.averageLatency + alpha * latency;
    
    // Log to database (async, don't wait)
    this.logCallToDatabase(response, latency, context).catch(error => {
      console.error('Failed to log LLM call to database:', error.message);
    });
  }

  /**
   * Log LLM call to database
   * @param {LLMResponse} response - Response from provider
   * @param {number} latency - Response latency in ms
   * @param {Object} context - Call context
   * @returns {Promise<void>}
   */
  async logCallToDatabase(response, latency, context = {}) {
    try {
      const LLMCallLog = require('../models/llm-call-log');
      
      await LLMCallLog.logCall({
        provider: response.provider,
        model: response.model,
        role: context.role,
        totalTokens: response.tokens,
        cost: response.cost,
        latency: latency,
        success: response.success,
        error: response.error,
        userId: context.userId,
        projectId: context.projectId,
        jobId: context.jobId,
        correlationId: context.correlationId,
        metadata: response.metadata
      });
    } catch (error) {
      // Don't throw - logging failures shouldn't break the main flow
      console.error('Database logging error:', error.message);
    }
  }

  /**
   * Get routing metrics
   * @returns {Object}
   */
  getMetrics() {
    const fallbackMetrics = this.metrics.fallbacks || {
      total: 0,
      successful: 0,
      byProvider: {}
    };
    
    return {
      ...this.metrics,
      successRate: this.metrics.totalCalls > 0 
        ? this.metrics.successfulCalls / this.metrics.totalCalls 
        : 0,
      fallbackRate: this.metrics.totalCalls > 0
        ? fallbackMetrics.total / this.metrics.totalCalls
        : 0,
      fallbackSuccessRate: fallbackMetrics.total > 0
        ? fallbackMetrics.successful / fallbackMetrics.total
        : 0,
      registeredProviders: Array.from(this.providers.keys()),
      totalProviders: this.providers.size,
      providerHealth: this.getProviderHealth()
    };
  }

  /**
   * Get all registered providers
   * @returns {Array<LLMProvider>}
   */
  getProviders() {
    return Array.from(this.providers.values());
  }

  /**
   * Get provider by name
   * @param {string} name - Provider name
   * @returns {LLMProvider|null}
   */
  getProvider(name) {
    return this.providers.get(name) || null;
  }
}

module.exports = {
  LLMProvider,
  LLMResponse,
  ModelRouter,
  AGENT_ROLES
};