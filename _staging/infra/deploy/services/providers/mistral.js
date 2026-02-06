/**
 * Mistral AI LLM Provider
 * Provides access to Mistral AI models for various tasks
 */

const { LLMProvider, LLMResponse } = require('../model-router');

class MistralProvider extends LLMProvider {
  constructor(config = {}) {
    super({
      name: 'mistral',
      capabilities: ['interviewer', 'schema-designer', 'reviewer', 'deployer'],
      costPerToken: config.costPerToken || 0.0002,
      maxTokens: config.maxTokens || 8192,
      latency: config.latency || 300,
      reliability: config.reliability || 0.94,
      ...config
    });
    
    this.apiKey = config.apiKey || process.env.MISTRAL_API_KEY;
    this.baseUrl = config.baseUrl || 'https://api.mistral.ai/v1';
    this.modelMappings = {
      'interviewer': 'mistral-small-latest',
      'schema-designer': 'mistral-medium-latest',
      'reviewer': 'mistral-small-latest',
      'deployer': 'mistral-medium-latest'
    };
    
    if (!this.apiKey) {
      console.warn('Mistral API key not provided. Provider will not function.');
    }
  }

  /**
   * Make API call to Mistral AI
   * @param {string} prompt - The prompt to send
   * @param {Object} context - Additional context
   * @returns {Promise<LLMResponse>}
   */
  async call(prompt, context = {}) {
    if (!this.apiKey) {
      throw new Error('Mistral API key not configured');
    }

    const { role, temperature = 0.7, maxTokens = 4096 } = context;
    const model = this.selectModel(role, context);
    
    const startTime = Date.now();
    
    try {
      const messages = this.formatMessages(prompt, role, context);
      
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: temperature,
          max_tokens: maxTokens,
          stream: false,
          safe_prompt: false // Allow more flexible prompts
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Mistral API error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      const latency = Date.now() - startTime;
      
      const usage = data.usage || {};
      const tokens = usage.total_tokens || 0;
      const cost = this.calculateCost(tokens, model);
      
      return new LLMResponse({
        success: true,
        content: data.choices?.[0]?.message?.content || '',
        tokens: tokens,
        cost: cost,
        latency: latency,
        provider: this.name,
        model: model,
        metadata: {
          usage: usage,
          finishReason: data.choices?.[0]?.finish_reason
        }
      });

    } catch (error) {
      const latency = Date.now() - startTime;
      
      return new LLMResponse({
        success: false,
        content: '',
        tokens: 0,
        cost: 0,
        latency: latency,
        provider: this.name,
        model: model,
        error: error.message,
        metadata: { originalError: error }
      });
    }
  }

  /**
   * Format messages for Mistral API
   * @param {string} prompt - The prompt to send
   * @param {string} role - Agent role
   * @param {Object} context - Additional context
   * @returns {Array}
   */
  formatMessages(prompt, role, context) {
    const messages = [];
    
    // Add system message based on role
    const systemPrompt = this.getSystemPrompt(role);
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }
    
    // Add user message
    messages.push({
      role: 'user',
      content: prompt
    });
    
    return messages;
  }

  /**
   * Get system prompt based on agent role
   * @param {string} role - Agent role
   * @returns {string}
   */
  getSystemPrompt(role) {
    const systemPrompts = {
      'interviewer': 'You are a helpful AI assistant specialized in gathering requirements through conversational interviews. Ask clarifying questions and help users articulate their needs clearly.',
      'schema-designer': 'You are an expert in database design and API architecture. Create well-structured schemas, normalize data models, and design efficient APIs following REST principles.',
      'reviewer': 'You are a senior software engineer focused on code quality, security, and best practices. Provide constructive feedback that improves maintainability and performance.',
      'deployer': 'You are a DevOps expert specializing in deployment automation and infrastructure management. Focus on reliable, scalable deployment strategies.'
    };
    
    return systemPrompts[role] || '';
  }

  /**
   * Select appropriate model based on role and context
   * @param {string} role - Agent role
   * @param {Object} context - Task context
   * @returns {string}
   */
  selectModel(role, context = {}) {
    if (context.model) {
      return context.model;
    }
    
    // Use larger models for complex tasks
    const complexRoles = ['schema-designer', 'deployer'];
    if (complexRoles.includes(role)) {
      return 'mistral-medium-latest';
    }
    
    return this.modelMappings[role] || 'mistral-small-latest';
  }

  /**
   * Calculate cost based on tokens and model
   * @param {number} tokens - Number of tokens used
   * @param {string} model - Model used
   * @returns {number}
   */
  calculateCost(tokens, model) {
    // Mistral pricing (per 1M tokens)
    const modelPricing = {
      'mistral-small-latest': 0.0002,
      'mistral-medium-latest': 0.0027,
      'mistral-large-latest': 0.008,
      'default': this.costPerToken
    };
    
    const pricePerToken = modelPricing[model] || modelPricing.default;
    return tokens * pricePerToken;
  }

  /**
   * Health check for Mistral API
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    if (!this.apiKey) {
      return false;
    }

    try {
      const response = await this.call('Hello', { maxTokens: 10 });
      return response.success;
    } catch (error) {
      console.error('Mistral health check failed:', error);
      return false;
    }
  }

  /**
   * Get available models from Mistral
   * @returns {Promise<Array>}
   */
  async getAvailableModels() {
    if (!this.apiKey) {
      throw new Error('Mistral API key not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('Failed to get Mistral models:', error);
      return [];
    }
  }
}

module.exports = MistralProvider;