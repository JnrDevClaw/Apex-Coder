/**
 * Scaleway AI Infrastructure LLM Provider
 * Provides access to European AI infrastructure through Scaleway
 */

const { LLMProvider, LLMResponse } = require('../model-router');

class ScalewayProvider extends LLMProvider {
  constructor(config = {}) {
    super({
      name: 'scaleway',
      capabilities: ['coder', 'tester', 'reviewer'],
      costPerToken: config.costPerToken || 0.0008,
      maxTokens: config.maxTokens || 4096,
      latency: config.latency || 600, // European servers may have higher latency
      reliability: config.reliability || 0.88,
      ...config
    });
    
    this.apiKey = config.apiKey || process.env.SCALEWAY_API_KEY;
    this.projectId = config.projectId || process.env.SCALEWAY_PROJECT_ID;
    this.region = config.region || 'fr-par';
    this.baseUrl = config.baseUrl || `https://api.scaleway.com/inference/v1beta1`;
    this.modelMappings = {
      'coder': 'llama-2-7b-chat',
      'tester': 'mistral-7b-instruct',
      'reviewer': 'llama-2-13b-chat'
    };
    
    if (!this.apiKey || !this.projectId) {
      console.warn('Scaleway API key or project ID not provided. Provider will not function.');
    }
  }

  /**
   * Make API call to Scaleway AI
   * @param {string} prompt - The prompt to send
   * @param {Object} context - Additional context
   * @returns {Promise<LLMResponse>}
   */
  async call(prompt, context = {}) {
    if (!this.apiKey || !this.projectId) {
      throw new Error('Scaleway API key or project ID not configured');
    }

    const { role, temperature = 0.7, maxTokens = 2048 } = context;
    const model = this.selectModel(role, context);
    
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${this.baseUrl}/models/${model}/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-Project-Id': this.projectId
        },
        body: JSON.stringify({
          prompt: prompt,
          max_tokens: maxTokens,
          temperature: temperature,
          top_p: 0.9,
          stream: false
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Scaleway API error: ${response.status} - ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      const latency = Date.now() - startTime;
      
      // Extract generated text
      const content = data.generated_text || data.text || '';
      
      // Estimate tokens (Scaleway may not provide exact counts)
      const tokens = Math.ceil((prompt.length + content.length) / 4);
      const cost = this.calculateCost(tokens, model);
      
      return new LLMResponse({
        success: true,
        content: content,
        tokens: tokens,
        cost: cost,
        latency: latency,
        provider: this.name,
        model: model,
        metadata: {
          region: this.region,
          originalResponse: data
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
   * Select appropriate model based on role and context
   * @param {string} role - Agent role
   * @param {Object} context - Task context
   * @returns {string}
   */
  selectModel(role, context = {}) {
    if (context.model) {
      return context.model;
    }
    
    return this.modelMappings[role] || 'mistral-7b-instruct';
  }

  /**
   * Calculate cost based on tokens and model
   * @param {number} tokens - Number of tokens used
   * @param {string} model - Model used
   * @returns {number}
   */
  calculateCost(tokens, model) {
    // Scaleway pricing (estimated)
    const modelPricing = {
      'llama-2-7b-chat': 0.0006,
      'llama-2-13b-chat': 0.001,
      'mistral-7b-instruct': 0.0008,
      'default': this.costPerToken
    };
    
    const pricePerToken = modelPricing[model] || modelPricing.default;
    return tokens * pricePerToken;
  }

  /**
   * Health check for Scaleway API
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    if (!this.apiKey || !this.projectId) {
      return false;
    }

    try {
      const response = await this.call('Hello', { maxTokens: 10 });
      return response.success;
    } catch (error) {
      console.error('Scaleway health check failed:', error);
      return false;
    }
  }

  /**
   * Get available models from Scaleway
   * @returns {Promise<Array>}
   */
  async getAvailableModels() {
    if (!this.apiKey || !this.projectId) {
      throw new Error('Scaleway API key or project ID not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Project-Id': this.projectId
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = await response.json();
      return data.models || [];
    } catch (error) {
      console.error('Failed to get Scaleway models:', error);
      return [];
    }
  }
}

module.exports = ScalewayProvider;