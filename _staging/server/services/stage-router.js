/**
 * Stage-Based Model Router
 * 
 * Routes pipeline stages directly to specific models without agent role abstraction.
 * Implements the canonical stage-to-model mapping from Guide.md.
 * 
 * This replaces the generic agent role system with deterministic stage-specific routing.
 */

const EventEmitter = require('events');

/**
 * Stage-to-Model Mapping
 * Each stage maps directly to a specific provider and model
 */
const STAGE_MODEL_MAP = {
  0: {
    stage: 0,
    name: 'questionnaire',
    requiresAI: false,
    description: 'User input → specs.json'
  },
  1: {
    stage: 1,
    name: 'refinement',
    requiresAI: true,
    description: 'OpenRouter Refines Specs',
    provider: 'openrouter',
    model: 'mistralai/mistral-7b-instruct',
    fallbacks: [
      { provider: 'electronhub', model: 'gpt-4o-mini' }
    ]
  },
  2: {
    stage: 2,
    name: 'docs-creation',
    requiresAI: true,
    description: 'Llama 3.1 Creates Documentation',
    provider: 'github-models',
    model: 'Meta-Llama-3.1-8B-Instruct',
    fallbacks: [
      { provider: 'openrouter', model: 'mistralai/mistral-7b-instruct' }
    ]
  },
  3: {
    stage: 3,
    name: 'schema-creation',
    requiresAI: true,
    description: 'DeepSeek Creates Schema',
    provider: 'electronhub',
    model: 'deepseek-v3.2:free',
    fallbacks: [
      { provider: 'electronhub', model: 'deepseek-reasoner' }
    ]
  },
  4: {
    stage: 4,
    name: 'file-structure',
    requiresAI: true,
    description: 'GPT-4o Creates File Structure',
    provider: 'electronhub',
    model: 'gpt-4o',
    fallbacks: [
      { provider: 'electronhub', model: 'claude-3-5-sonnet-20241022' }
    ]
  },
  5: {
    stage: 5,
    name: 'structure-validation',
    requiresAI: true,
    description: 'Claude Validator Checks Structure',
    provider: 'electronhub',
    model: 'claude-3-5-sonnet-20241022',
    fallbacks: [
      { provider: 'electronhub', model: 'gpt-4o' }
    ]
  },
  6: {
    stage: 6,
    name: 'empty-file-creation',
    requiresAI: false,
    description: 'Worker Creates Empty Files'
  },
  7: {
    stage: 7,
    name: 'prompt-builder',
    requiresAI: true,
    description: 'GPT-5 Mini Prompt Builder',
    provider: 'electronhub',
    model: 'gpt-5-mini',
    fallbacks: [
      { provider: 'electronhub', model: 'gpt-4o-mini' }
    ]
  },
  8: {
    stage: 8,
    name: 'code-generation',
    requiresAI: true,
    description: 'Gemini-3 Code Generator',
    provider: 'gemini',
    model: 'gemini-3-flash-preview',
    fallbacks: [
      { provider: 'electronhub', model: 'claude-sonnet-4' }
    ]
  },
  9: {
    stage: 9,
    name: 'repo-push',
    requiresAI: false,
    description: 'Push to GitHub'
  }
};

/**
 * StageRouter - Routes pipeline stages to specific models
 */
class StageRouter extends EventEmitter {
  constructor(modelRouter) {
    super();

    if (!modelRouter) {
      throw new Error('ModelRouter instance is required');
    }

    this.modelRouter = modelRouter;
    this.stageModelMap = this.buildStageModelMap();
    this.providerHealth = new Map();
    this.callMetrics = new Map();

    // Initialize metrics for each stage
    Object.keys(STAGE_MODEL_MAP).forEach(stageKey => {
      const stage = STAGE_MODEL_MAP[stageKey];
      if (stage.requiresAI) {
        this.callMetrics.set(stage.name, {
          totalCalls: 0,
          successfulCalls: 0,
          failedCalls: 0,
          totalLatency: 0,
          averageLatency: 0,
          totalCost: 0
        });
      }
    });

    console.log('✅ StageRouter initialized with stage-based routing');
  }

  /**
   * Build stage-to-model mapping from STAGE_MODEL_MAP
   * @returns {Map} Stage number to model config
   */
  buildStageModelMap() {
    const map = new Map();

    Object.entries(STAGE_MODEL_MAP).forEach(([stageKey, config]) => {
      map.set(parseFloat(stageKey), config);
    });

    return map;
  }

  /**
   * Get the model configuration for a specific stage
   * @param {number} stageNumber - Stage number (0-8, including 1.5 and 3.5)
   * @returns {Object|null} Model configuration
   */
  getModelForStage(stageNumber) {
    const stageConfig = this.stageModelMap.get(stageNumber);

    if (!stageConfig) {
      console.error(`No configuration found for stage ${stageNumber}`);
      return null;
    }

    if (!stageConfig.requiresAI) {
      return {
        stage: stageNumber,
        name: stageConfig.name,
        requiresAI: false,
        description: stageConfig.description
      };
    }

    // Handle stage 7 which uses multiple models
    if (stageNumber === 7 && stageConfig.models) {
      return {
        stage: stageNumber,
        name: stageConfig.name,
        requiresAI: true,
        description: stageConfig.description,
        models: stageConfig.models,
        fallbacks: stageConfig.fallbacks || []
      };
    }

    // Standard single-model stage
    return {
      stage: stageNumber,
      name: stageConfig.name,
      requiresAI: true,
      description: stageConfig.description,
      provider: stageConfig.provider,
      model: stageConfig.model,
      fallbacks: stageConfig.fallbacks || []
    };
  }

  /**
   * Call a model for a specific stage
   * @param {number} stageNumber - Stage number
   * @param {string} prompt - Prompt to send
   * @param {Object} options - Call options
   * @param {Object} options.context - Additional context
   * @param {number} options.timeout - Timeout in ms
   * @param {number} options.retries - Number of retries
   * @returns {Promise<Object>} Model response
   */
  async callStageModel(stageNumber, prompt, options = {}) {
    const stageConfig = this.getModelForStage(stageNumber);

    if (!stageConfig) {
      throw new Error(`Invalid stage number: ${stageNumber}`);
    }

    if (!stageConfig.requiresAI) {
      throw new Error(`Stage ${stageNumber} (${stageConfig.name}) does not require AI`);
    }

    const {
      context = {},
      timeout = 30000,
      retries = 2
    } = options;

    // Add stage information to context
    const enrichedContext = {
      ...context,
      stage: stageNumber,
      stageName: stageConfig.name,
      stageDescription: stageConfig.description
    };

    const startTime = Date.now();
    let lastError = null;
    let attemptCount = 0;

    // Try primary model with retries
    while (attemptCount <= retries) {
      try {
        const response = await this.callProvider(
          stageConfig.provider,
          stageConfig.model,
          prompt,
          {
            ...enrichedContext,
            timeout,
            attempt: attemptCount + 1
          }
        );

        const latency = Date.now() - startTime;

        // Update metrics
        this.updateStageMetrics(stageConfig.name, true, latency, response.cost || 0);

        // Update provider health
        this.updateProviderHealth(stageConfig.provider, true);

        return {
          success: true,
          content: response.content,
          provider: stageConfig.provider,
          model: stageConfig.model,
          stage: stageNumber,
          stageName: stageConfig.name,
          tokens: response.tokens || 0,
          cost: response.cost || 0,
          latency,
          attempt: attemptCount + 1
        };
      } catch (error) {
        lastError = error;
        attemptCount++;

        console.error(
          `Stage ${stageNumber} (${stageConfig.name}) attempt ${attemptCount} failed:`,
          error.message
        );

        // Update provider health on failure
        this.updateProviderHealth(stageConfig.provider, false);

        // Wait before retry with exponential backoff
        if (attemptCount <= retries) {
          const backoffDelay = this.calculateBackoffDelay(attemptCount);
          console.log(`Waiting ${backoffDelay}ms before retry...`);
          await this.sleep(backoffDelay);
        }
      }
    }

    // Primary model failed, try fallbacks
    if (stageConfig.fallbacks && stageConfig.fallbacks.length > 0) {
      console.log(
        `Primary model failed for stage ${stageNumber}, trying ${stageConfig.fallbacks.length} fallback(s)`
      );

      for (const fallback of stageConfig.fallbacks) {
        try {
          const response = await this.callProvider(
            fallback.provider,
            fallback.model,
            prompt,
            {
              ...enrichedContext,
              timeout,
              fallback: true
            }
          );

          const latency = Date.now() - startTime;

          // Update metrics
          this.updateStageMetrics(stageConfig.name, true, latency, response.cost || 0);

          // Update provider health
          this.updateProviderHealth(fallback.provider, true);

          console.log(
            `✅ Fallback successful: ${fallback.provider}/${fallback.model} for stage ${stageNumber}`
          );

          return {
            success: true,
            content: response.content,
            provider: fallback.provider,
            model: fallback.model,
            stage: stageNumber,
            stageName: stageConfig.name,
            tokens: response.tokens || 0,
            cost: response.cost || 0,
            latency,
            fallback: true
          };
        } catch (error) {
          console.error(
            `Fallback ${fallback.provider}/${fallback.model} failed:`,
            error.message
          );

          // Update provider health on failure
          this.updateProviderHealth(fallback.provider, false);
        }
      }
    }

    // All attempts failed
    const latency = Date.now() - startTime;
    this.updateStageMetrics(stageConfig.name, false, latency, 0);

    throw new Error(
      `Stage ${stageNumber} (${stageConfig.name}) failed after ${attemptCount} attempts: ${lastError.message}`
    );
  }

  /**
   * Call a specific provider/model combination
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   * @param {string} prompt - Prompt to send
   * @param {Object} context - Call context
   * @returns {Promise<Object>} Provider response
   */
  async callProvider(provider, model, prompt, context = {}) {
    // Get provider instance from model router
    const providerInstance = this.modelRouter.providers.get(provider);

    if (!providerInstance) {
      throw new Error(`Provider ${provider} not found or not initialized`);
    }

    // Check provider health before calling
    const health = this.providerHealth.get(provider);
    if (health && !health.healthy && health.consecutiveFailures >= 3) {
      throw new Error(
        `Provider ${provider} is unhealthy (${health.consecutiveFailures} consecutive failures)`
      );
    }

    // Call the provider
    const response = await providerInstance.call(prompt, {
      ...context,
      model,
      provider
    });

    if (!response || !response.success) {
      throw new Error(
        response?.error || `Provider ${provider} returned unsuccessful response`
      );
    }

    return response;
  }

  /**
   * Call stage 7 models (prompt-builder + coder)
   * @param {string} promptBuilderInput - Input for prompt builder
   * @param {Object} fileContext - File context for code generation
   * @param {Object} options - Call options
   * @returns {Promise<Object>} Generated code
   */
  async callStage7Models(promptBuilderInput, fileContext, options = {}) {
    const stageConfig = this.getModelForStage(7);

    if (!stageConfig || !stageConfig.models) {
      throw new Error('Stage 7 configuration not found or invalid');
    }

    const { context = {}, timeout = 60000, retries = 2 } = options;

    // Step 1: Call prompt builder with fallbacks
    const promptBuilderModel = stageConfig.models.find(m => m.role === 'prompt-builder');
    if (!promptBuilderModel) {
      throw new Error('Prompt builder model not configured for stage 7');
    }

    console.log(`Stage 7: Building prompt with ${promptBuilderModel.provider}/${promptBuilderModel.model}`);

    let promptResponse;
    let promptError;

    // Try primary prompt builder
    try {
      promptResponse = await this.callProviderWithRetries(
        promptBuilderModel.provider,
        promptBuilderModel.model,
        promptBuilderInput,
        {
          ...context,
          stage: 7,
          stageName: 'code-generation',
          role: 'prompt-builder',
          timeout: timeout / 2
        },
        retries
      );
    } catch (error) {
      promptError = error;
      console.error(`Primary prompt builder failed: ${error.message}`);

      // Try fallbacks for prompt builder
      if (promptBuilderModel.fallbacks && promptBuilderModel.fallbacks.length > 0) {
        for (const fallback of promptBuilderModel.fallbacks) {
          try {
            console.log(`Trying fallback prompt builder: ${fallback.provider}/${fallback.model}`);
            promptResponse = await this.callProvider(
              fallback.provider,
              fallback.model,
              promptBuilderInput,
              {
                ...context,
                stage: 7,
                stageName: 'code-generation',
                role: 'prompt-builder',
                timeout: timeout / 2,
                fallback: true
              }
            );
            console.log(`✅ Fallback prompt builder successful: ${fallback.provider}/${fallback.model}`);
            break;
          } catch (fallbackError) {
            console.error(`Fallback prompt builder ${fallback.provider}/${fallback.model} failed: ${fallbackError.message}`);
          }
        }
      }

      if (!promptResponse) {
        throw new Error(`All prompt builder attempts failed: ${promptError.message}`);
      }
    }

    // Step 2: Call coder with fallbacks
    const coderModel = stageConfig.models.find(m => m.role === 'coder');
    if (!coderModel) {
      throw new Error('Coder model not configured for stage 7');
    }

    console.log(`Stage 7: Generating code with ${coderModel.provider}/${coderModel.model}`);

    let codeResponse;
    let coderError;

    // Try primary coder
    try {
      codeResponse = await this.callProviderWithRetries(
        coderModel.provider,
        coderModel.model,
        promptResponse.content,
        {
          ...context,
          ...fileContext,
          stage: 7,
          stageName: 'code-generation',
          role: 'coder',
          timeout: timeout / 2
        },
        retries
      );
    } catch (error) {
      coderError = error;
      console.error(`Primary coder failed: ${error.message}`);

      // Try fallbacks for coder
      if (coderModel.fallbacks && coderModel.fallbacks.length > 0) {
        for (const fallback of coderModel.fallbacks) {
          try {
            console.log(`Trying fallback coder: ${fallback.provider}/${fallback.model}`);
            codeResponse = await this.callProvider(
              fallback.provider,
              fallback.model,
              promptResponse.content,
              {
                ...context,
                ...fileContext,
                stage: 7,
                stageName: 'code-generation',
                role: 'coder',
                timeout: timeout / 2,
                fallback: true
              }
            );
            console.log(`✅ Fallback coder successful: ${fallback.provider}/${fallback.model}`);
            break;
          } catch (fallbackError) {
            console.error(`Fallback coder ${fallback.provider}/${fallback.model} failed: ${fallbackError.message}`);
          }
        }
      }

      if (!codeResponse) {
        throw new Error(`All coder attempts failed: ${coderError.message}`);
      }
    }

    return {
      success: true,
      prompt: promptResponse.content,
      code: codeResponse.content,
      promptTokens: promptResponse.tokens || 0,
      codeTokens: codeResponse.tokens || 0,
      totalTokens: (promptResponse.tokens || 0) + (codeResponse.tokens || 0),
      promptCost: promptResponse.cost || 0,
      codeCost: codeResponse.cost || 0,
      totalCost: (promptResponse.cost || 0) + (codeResponse.cost || 0),
      stage: 7,
      stageName: 'code-generation'
    };
  }

  /**
   * Call provider with retries
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   * @param {string} prompt - Prompt to send
   * @param {Object} context - Call context
   * @param {number} retries - Number of retries
   * @returns {Promise<Object>} Provider response
   */
  async callProviderWithRetries(provider, model, prompt, context, retries = 2) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.callProvider(provider, model, prompt, {
          ...context,
          attempt: attempt + 1
        });
      } catch (error) {
        lastError = error;

        if (attempt < retries) {
          const backoffDelay = this.calculateBackoffDelay(attempt + 1);
          console.log(`Retry ${attempt + 1}/${retries} after ${backoffDelay}ms...`);
          await this.sleep(backoffDelay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Check health of all providers used in the pipeline
   * @returns {Promise<Object>} Health status for each provider
   */
  async checkProviderHealth() {
    const healthStatus = {};
    const uniqueProviders = new Set();

    // Collect all unique providers from stage map
    this.stageModelMap.forEach(stageConfig => {
      if (stageConfig.requiresAI) {
        if (stageConfig.provider) {
          uniqueProviders.add(stageConfig.provider);
        }
        if (stageConfig.models) {
          stageConfig.models.forEach(m => uniqueProviders.add(m.provider));
        }
        if (stageConfig.fallbacks) {
          stageConfig.fallbacks.forEach(f => uniqueProviders.add(f.provider));
        }
      }
    });

    // Check health of each provider
    for (const providerName of uniqueProviders) {
      try {
        const providerInstance = this.modelRouter.providers.get(providerName);

        if (!providerInstance) {
          healthStatus[providerName] = {
            healthy: false,
            error: 'Provider not found or not initialized'
          };
          continue;
        }

        // Perform health check
        const isHealthy = await providerInstance.healthCheck();

        healthStatus[providerName] = {
          healthy: isHealthy,
          lastCheck: new Date()
        };

        // Update internal health tracking
        this.updateProviderHealth(providerName, isHealthy);
      } catch (error) {
        healthStatus[providerName] = {
          healthy: false,
          error: error.message,
          lastCheck: new Date()
        };

        this.updateProviderHealth(providerName, false);
      }
    }

    return healthStatus;
  }

  /**
   * Update provider health status
   * @param {string} providerName - Provider name
   * @param {boolean} success - Whether the call/check succeeded
   */
  updateProviderHealth(providerName, success) {
    const currentHealth = this.providerHealth.get(providerName) || {
      healthy: true,
      consecutiveFailures: 0,
      lastCheck: new Date()
    };

    if (success) {
      this.providerHealth.set(providerName, {
        healthy: true,
        consecutiveFailures: 0,
        lastCheck: new Date(),
        lastSuccess: new Date()
      });
    } else {
      const consecutiveFailures = currentHealth.consecutiveFailures + 1;
      this.providerHealth.set(providerName, {
        healthy: consecutiveFailures < 3,
        consecutiveFailures,
        lastCheck: new Date(),
        lastFailure: new Date()
      });
    }
  }

  /**
   * Get provider health status
   * @returns {Object} Health status for all providers
   */
  getProviderHealth() {
    const health = {};

    this.providerHealth.forEach((status, providerName) => {
      health[providerName] = {
        healthy: status.healthy,
        consecutiveFailures: status.consecutiveFailures,
        lastCheck: status.lastCheck,
        lastSuccess: status.lastSuccess,
        lastFailure: status.lastFailure
      };
    });

    return health;
  }

  /**
   * Update stage call metrics
   * @param {string} stageName - Stage name
   * @param {boolean} success - Whether the call succeeded
   * @param {number} latency - Call latency in ms
   * @param {number} cost - Call cost
   */
  updateStageMetrics(stageName, success, latency, cost) {
    const metrics = this.callMetrics.get(stageName);

    if (!metrics) return;

    metrics.totalCalls++;

    if (success) {
      metrics.successfulCalls++;
    } else {
      metrics.failedCalls++;
    }

    metrics.totalLatency += latency;
    metrics.averageLatency = metrics.totalLatency / metrics.totalCalls;
    metrics.totalCost += cost;

    this.callMetrics.set(stageName, metrics);
  }

  /**
   * Get stage call metrics
   * @returns {Object} Metrics for all stages
   */
  getStageMetrics() {
    const metrics = {};

    this.callMetrics.forEach((stageMetrics, stageName) => {
      metrics[stageName] = {
        ...stageMetrics,
        successRate: stageMetrics.totalCalls > 0
          ? stageMetrics.successfulCalls / stageMetrics.totalCalls
          : 0
      };
    });

    return metrics;
  }

  /**
   * Calculate exponential backoff delay
   * @param {number} attemptNumber - Attempt number (1-based)
   * @returns {number} Delay in milliseconds
   */
  calculateBackoffDelay(attemptNumber) {
    // Exponential backoff: 500ms, 1500ms
    const baseDelay = 500;
    const delay = baseDelay * Math.pow(3, attemptNumber - 1);

    // Add jitter (±20%)
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);

    return Math.floor(delay + jitter);
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get all stage configurations
   * @returns {Object} All stage configurations
   */
  getAllStageConfigs() {
    const configs = {};

    this.stageModelMap.forEach((config, stageNumber) => {
      configs[stageNumber] = { ...config };
    });

    return configs;
  }

  /**
   * Validate that all required providers are available
   * @returns {Object} Validation result with missing providers
   */
  validateProviders() {
    const requiredProviders = new Set();
    const missingProviders = [];

    // Collect all required providers
    this.stageModelMap.forEach(stageConfig => {
      if (stageConfig.requiresAI) {
        if (stageConfig.provider) {
          requiredProviders.add(stageConfig.provider);
        }
        if (stageConfig.models) {
          stageConfig.models.forEach(m => requiredProviders.add(m.provider));
        }
      }
    });

    // Check if each provider is available
    requiredProviders.forEach(providerName => {
      const providerInstance = this.modelRouter.providers.get(providerName);
      if (!providerInstance) {
        missingProviders.push(providerName);
      }
    });

    return {
      valid: missingProviders.length === 0,
      requiredProviders: Array.from(requiredProviders),
      missingProviders,
      availableProviders: Array.from(this.modelRouter.providers.keys())
    };
  }
}

module.exports = StageRouter;
module.exports.STAGE_MODEL_MAP = STAGE_MODEL_MAP;
