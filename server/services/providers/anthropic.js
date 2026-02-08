/**
 * Anthropic Claude LLM Provider
 * Provides access to Claude models for reasoning and analysis
 */

const { LLMProvider, LLMResponse } = require('../model-router');

class AnthropicProvider extends LLMProvider {
  constructor(config = {}) {
    super({
      name: 'anthropic',
      capabilities: ['planner', 'debugger', 'reviewer', 'deployer'],
      costPerToken: config.costPerToken || 0.003,
      maxTokens: config.maxTokens || 8192,
      latency: config.latency || 250,
      reliability: config.reliability || 0.98,
      ...config
    });
    
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
    this.modelMappings = {
      'planner': 'claude-3-sonnet-20240229',
      'debugger': 'claude-3-opus-20240229',
      'reviewer': 'claude-3-haiku-20240307',
      'deployer': 'claude-3-sonnet-20240229'
    };
    
    if (!this.apiKey) {
      console.warn('Anthropic API key not provided. Provider will not function.');
    }
  }

  /**
   * Make API call to Anthropic Claude
   * @param {string} prompt - The prompt to send
   * @param {Object} context - Additional context
   * @returns {Promise<LLMResponse>}
   */
  async call(prompt, context = {}) {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const { role, temperature = 0.7, maxTokens = 4096 } = context;
    const model = this.selectModel(role, context);
    
    const startTime = Date.now();
    
    try {
      const messages = this.formatMessages(prompt, role, context);
      
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          max_tokens: maxTokens,
          temperature: temperature,
          system: this.getSystemPrompt(role)
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Anthropic API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const latency = Date.now() - startTime;
      
      const usage = data.usage || {};
      const tokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
      const cost = this.calculateCost(tokens, model);
      
      // Extract content from Claude's response format
      const content = data.content?.[0]?.text || '';
      
      return new LLMResponse({
        success: true,
        content: content,
        tokens: tokens,
        cost: cost,
        latency: latency,
        provider: this.name,
        model: model,
        metadata: {
          usage: usage,
          stopReason: data.stop_reason,
          stopSequence: data.stop_sequence
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
   * Format messages for Claude API
   * @param {string} prompt - The prompt to send
   * @param {string} role - Agent role
   * @param {Object} context - Additional context
   * @returns {Array}
   */
  formatMessages(prompt, role, context) {
    return [
      {
        role: 'user',
        content: prompt
      }
    ];
  }

  /**
   * Get system prompt based on agent role
   * @param {string} role - Agent role
   * @returns {string}
   */
  getSystemPrompt(role) {
    const systemPrompts = {
      'planner': 'You are Claude, an AI assistant specialized in software architecture and project planning. You excel at breaking down complex requirements into well-structured, actionable tasks. Focus on creating clear dependencies, realistic timelines, and comprehensive coverage of all requirements.',
      'debugger': 'You are Claude, an AI assistant specialized in debugging and problem-solving. You have exceptional analytical skills for identifying root causes of issues and generating precise solutions. Think methodically through problems and provide clear, actionable fixes.',
      'reviewer': 'You are Claude, an AI assistant specialized in code review and quality assurance. You have deep knowledge of best practices, security considerations, and maintainability principles. Provide constructive feedback that improves code quality.',
      'deployer': 'You are Claude, an AI assistant specialized in deployment and infrastructure. You understand modern DevOps practices, cloud platforms, and deployment strategies. Focus on creating secure, scalable, and reliable deployment solutions.'
    };
    
    return systemPrompts[role] || 'You are Claude, a helpful AI assistant.';
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
    
    // Use Opus for complex debugging, Sonnet for planning/deployment, Haiku for reviews
    const complexityMapping = {
      'debugger': 'claude-3-opus-20240229', // Most capable for complex debugging
      'planner': 'claude-3-sonnet-20240229', // Good balance for planning
      'reviewer': 'claude-3-haiku-20240307', // Fast and efficient for reviews
      'deployer': 'claude-3-sonnet-20240229' // Good for infrastructure tasks
    };
    
    return complexityMapping[role] || this.modelMappings[role] || 'claude-3-haiku-20240307';
  }

  /**
   * Calculate cost based on tokens and model
   * @param {number} tokens - Number of tokens used
   * @param {string} model - Model used
   * @returns {number}
   */
  calculateCost(tokens, model) {
    // Anthropic pricing (per 1K tokens)
    const modelPricing = {
      'claude-3-opus-20240229': 0.015, // $15 per 1M input tokens
      'claude-3-sonnet-20240229': 0.003, // $3 per 1M input tokens
      'claude-3-haiku-20240307': 0.00025, // $0.25 per 1M input tokens
      'default': this.costPerToken
    };
    
    const pricePerToken = modelPricing[model] || modelPricing.default;
    return (tokens / 1000) * pricePerToken;
  }

  /**
   * Health check for Anthropic API
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
      console.error('Anthropic health check failed:', error);
      return false;
    }
  }

  /**
   * Get rate limit information from headers
   * @param {Response} response - Fetch response object
   * @returns {Object}
   */
  extractRateLimitInfo(response) {
    return {
      requestsLimit: response.headers.get('anthropic-ratelimit-requests-limit'),
      requestsRemaining: response.headers.get('anthropic-ratelimit-requests-remaining'),
      requestsReset: response.headers.get('anthropic-ratelimit-requests-reset'),
      tokensLimit: response.headers.get('anthropic-ratelimit-tokens-limit'),
      tokensRemaining: response.headers.get('anthropic-ratelimit-tokens-remaining'),
      tokensReset: response.headers.get('anthropic-ratelimit-tokens-reset')
    };
  }
}

module.exports = AnthropicProvider;