/**
 * ModelRouter Service
 * Main service that integrates ModelRouter with all LLM providers and agent roles
 */

const { ModelRouter } = require('./model-router');
const { AgentRoleAssigner } = require('./agent-roles');
const {
  OpenRouterProvider,
  HuggingFaceProviderLegacy: HuggingFaceProvider,
  DeepSeekProvider,
  ElectronHubProvider,
  GeminiProvider,
  AnthropicProvider,
  ScalewayProvider,
  MistralProvider,
  StarCoder2Provider,
  CodeGenProvider,
  GPTJProvider,
  GLMProvider
} = require('./providers');

class ModelRouterService {
  constructor(config = {}) {
    this.config = config;
    this.modelRouter = new ModelRouter();
    this.agentRoleAssigner = new AgentRoleAssigner(this.modelRouter);
    this.initialized = false;
    this.enabledProviders = config.enabledProviders || [
      'openrouter',
      'huggingface', 
      'deepseek',
      'anthropic',
      'mistral'
    ];
  }

  /**
   * Initialize the ModelRouter service with all providers
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    console.log('Initializing ModelRouter service...');

    // Register all available providers
    await this.registerProviders();

    // Perform health checks
    await this.performHealthChecks();

    this.initialized = true;
    console.log('ModelRouter service initialized successfully');
  }

  /**
   * Register all LLM providers
   * @returns {Promise<void>}
   */
  async registerProviders() {
    const providerConfigs = this.getProviderConfigs();

    // Register each enabled provider
    for (const [providerName, ProviderClass] of Object.entries(this.getProviderClasses())) {
      if (this.enabledProviders.includes(providerName)) {
        try {
          const config = providerConfigs[providerName] || {};
          const provider = new ProviderClass(config);
          this.modelRouter.registerProvider(provider);
          console.log(`Registered provider: ${providerName}`);
        } catch (error) {
          console.error(`Failed to register provider ${providerName}:`, error.message);
        }
      }
    }
  }

  /**
   * Get provider class mappings
   * @returns {Object}
   */
  getProviderClasses() {
    return {
      'openrouter': OpenRouterProvider,
      'huggingface': HuggingFaceProvider,
      'deepseek': DeepSeekProvider,
      'electronhub': ElectronHubProvider,
      'zukijourney': ElectronHubProvider, // ZukiJourney uses ElectronHub provider
      'gemini': GeminiProvider,
      'anthropic': AnthropicProvider,
      'scaleway': ScalewayProvider,
      'mistral': MistralProvider,
      'starcoder2': StarCoder2Provider,
      'codegen': CodeGenProvider,
      'gpt-j': GPTJProvider,
      'glm': GLMProvider
    };
  }

  /**
   * Get provider configurations from environment and config
   * @returns {Object}
   */
  getProviderConfigs() {
    return {
      openrouter: {
        apiKey: process.env.OPENROUTER_API_KEY,
        costPerToken: 0.0015,
        ...this.config.openrouter
      },
      huggingface: {
        apiKey: process.env.HUGGINGFACE_API_KEY,
        costPerToken: 0.0001,
        ...this.config.huggingface
      },
      deepseek: {
        apiKey: process.env.DEEPSEEK_API_KEY,
        costPerToken: 0.00014,
        ...this.config.deepseek
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY,
        costPerToken: 0.003,
        ...this.config.anthropic
      },
      electronhub: {
        apiKey: process.env.ELECTRON_HUB_KEY,
        costPerToken: 0.0012,
        ...this.config.electronhub
      },
      zukijourney: {
        apiKey: process.env.ZUKI_API_KEY,
        costPerToken: 0.0018,
        ...this.config.zukijourney
      },
      scaleway: {
        apiKey: process.env.SCALEWAY_API_KEY,
        projectId: process.env.SCALEWAY_PROJECT_ID,
        costPerToken: 0.0008,
        ...this.config.scaleway
      },
      mistral: {
        apiKey: process.env.MISTRAL_API_KEY,
        costPerToken: 0.0002,
        ...this.config.mistral
      },
      starcoder2: {
        apiKey: process.env.HUGGINGFACE_API_KEY,
        costPerToken: 0.00015,
        ...this.config.starcoder2
      },
      codegen: {
        apiKey: process.env.HUGGINGFACE_API_KEY,
        costPerToken: 0.0002,
        ...this.config.codegen
      },
      'gpt-j': {
        apiKey: process.env.HUGGINGFACE_API_KEY,
        costPerToken: 0.00005,
        ...this.config['gpt-j']
      },
      glm: {
        apiKey: process.env.GLM_API_KEY,
        costPerToken: 0.0003,
        ...this.config.glm
      }
    };
  }

  /**
   * Perform health checks on all registered providers
   * @returns {Promise<Object>}
   */
  async performHealthChecks() {
    const healthResults = {};
    const providers = this.modelRouter.getProviders();

    console.log(`Performing health checks on ${providers.length} providers...`);

    for (const provider of providers) {
      try {
        const isHealthy = await provider.healthCheck();
        healthResults[provider.name] = {
          healthy: isHealthy,
          timestamp: new Date().toISOString()
        };
        
        if (isHealthy) {
          console.log(`✓ ${provider.name} is healthy`);
        } else {
          console.warn(`⚠ ${provider.name} health check failed`);
        }
      } catch (error) {
        healthResults[provider.name] = {
          healthy: false,
          error: error.message,
          timestamp: new Date().toISOString()
        };
        console.error(`✗ ${provider.name} health check error:`, error.message);
      }
    }

    return healthResults;
  }

  /**
   * Route a task using the agent role assignment system
   * @param {Object} task - Task to route
   * @returns {Promise<Object>}
   */
  async routeTask(task) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Get agent assignment
      const assignment = await this.agentRoleAssigner.assignTask(task);
      
      // Execute the task
      const response = await this.modelRouter.routeTask({
        role: assignment.agentRole.name,
        complexity: task.complexity || 'medium',
        prompt: task.prompt,
        fallback: true
      }, task.context || {});

      // Update assignment metrics
      this.agentRoleAssigner.updateAssignmentMetrics(
        assignment.assignmentId,
        response.success,
        response.latency,
        response.cost
      );

      return {
        assignment: assignment,
        response: response,
        success: response.success
      };

    } catch (error) {
      console.error('Task routing failed:', error);
      throw error;
    }
  }

  /**
   * Get service status and metrics
   * @returns {Object}
   */
  getStatus() {
    return {
      initialized: this.initialized,
      providers: {
        registered: this.modelRouter.getProviders().length,
        enabled: this.enabledProviders,
        metrics: this.modelRouter.getMetrics()
      },
      agentRoles: {
        performance: this.agentRoleAssigner.getPerformanceMetrics(),
        loadBalancing: this.agentRoleAssigner.getLoadBalancingStatus()
      }
    };
  }

  /**
   * Add a new provider at runtime
   * @param {string} name - Provider name
   * @param {LLMProvider} provider - Provider instance
   */
  addProvider(name, provider) {
    this.modelRouter.registerProvider(provider);
    if (!this.enabledProviders.includes(name)) {
      this.enabledProviders.push(name);
    }
    console.log(`Added provider: ${name}`);
  }

  /**
   * Remove a provider
   * @param {string} name - Provider name
   */
  removeProvider(name) {
    // Note: ModelRouter doesn't have a remove method, so we'd need to implement that
    this.enabledProviders = this.enabledProviders.filter(p => p !== name);
    console.log(`Removed provider: ${name}`);
  }

  /**
   * Update provider configuration
   * @param {string} name - Provider name
   * @param {Object} config - New configuration
   */
  updateProviderConfig(name, config) {
    this.config[name] = { ...this.config[name], ...config };
    console.log(`Updated config for provider: ${name}`);
  }

  /**
   * Get available agent roles
   * @returns {Object}
   */
  getAgentRoles() {
    const { AGENT_ROLES } = require('./agent-roles');
    return AGENT_ROLES;
  }

  /**
   * Test a specific provider
   * @param {string} providerName - Provider to test
   * @param {string} testPrompt - Test prompt
   * @returns {Promise<Object>}
   */
  async testProvider(providerName, testPrompt = 'Hello, world!') {
    const provider = this.modelRouter.getProvider(providerName);
    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    try {
      const response = await provider.call(testPrompt, { maxTokens: 50 });
      return {
        provider: providerName,
        success: response.success,
        response: response,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        provider: providerName,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get cost estimates for a task
   * @param {Object} task - Task to estimate
   * @returns {Promise<Object>}
   */
  async estimateTaskCost(task) {
    const assignment = await this.agentRoleAssigner.assignTask(task);
    const provider = assignment.modelAssignment.provider;
    
    // Estimate tokens (rough approximation)
    const estimatedTokens = Math.ceil(task.prompt.length / 4) + (task.maxTokens || 1000);
    const estimatedCost = estimatedTokens * provider.costPerToken;
    
    return {
      provider: provider.name,
      agentRole: assignment.agentRole.name,
      estimatedTokens: estimatedTokens,
      estimatedCost: estimatedCost,
      costPerToken: provider.costPerToken
    };
  }
}

// Singleton instance
let modelRouterServiceInstance = null;

/**
 * Get or create the ModelRouter service instance
 * @param {Object} config - Configuration options
 * @returns {ModelRouterService}
 */
function getModelRouterService(config = {}) {
  if (!modelRouterServiceInstance) {
    modelRouterServiceInstance = new ModelRouterService(config);
  }
  return modelRouterServiceInstance;
}

module.exports = {
  ModelRouterService,
  getModelRouterService
};