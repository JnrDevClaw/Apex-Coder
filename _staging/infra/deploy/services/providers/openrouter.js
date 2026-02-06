/**
 * OpenRouter LLM Provider
 * Provides access to multiple models through OpenRouter API
 * Supports free tier models with rate limiting
 */

const { LLMProvider, LLMResponse } = require('../model-router');

class OpenRouterProvider extends LLMProvider {
  constructor(config = {}) {
    super({
      name: 'openrouter',
      capabilities: ['interviewer', 'planner', 'coder', 'reviewer', 'deployer', 'tester'],
      costPerToken: config.costPerToken || 0.0015,
      maxTokens: config.maxTokens || 8192,
      latency: config.latency || 300,
      reliability: config.reliability || 0.95,
      ...config
    });
    
    this.apiKey = config.apiKey || process.env.OPENROUTER_API_KEY;
    this.baseUrl = config.baseUrl || 'https://openrouter.ai/api/v1';
    this.defaultModel = config.defaultModel || 'anthropic/claude-3-haiku';
    
    // Free tier model configuration
    this.freeTierModels = {
      'interviewer': 'mistralai/mistral-nemo',
      'reviewer': 'nousresearch/nous-hermes-2-mixtral-8x7b-dpo',
      'tester': 'meta-llama/llama-3.1-8b-instruct'
    };
    
    // Paid model mappings for fallback
    this.paidModelMappings = {
      'interviewer': 'mistralai/mistral-7b-instruct',
      'planner': 'anthropic/claude-3-sonnet',
      'coder': 'deepseek/deepseek-coder',
      'reviewer': 'mistralai/mistral-7b-instruct',
      'deployer': 'anthropic/claude-3-haiku',
      'tester': 'anthropic/claude-3-haiku'
    };
    
    // Rate limit tracking for free tier (50 requests per day)
    this.rateLimit = {
      freeRequests: config.freeRequestsLimit || 50,
      resetPeriod: config.resetPeriod || 86400000, // 24 hours in milliseconds
      currentCount: 0,
      resetTime: null,
      enabled: config.enableRateLimit !== false
    };
    
    // Usage metrics
    this.usageMetrics = {
      freeTierCalls: 0,
      paidTierCalls: 0,
      rateLimitExceeded: 0,
      totalTokens: 0,
      totalCost: 0
    };
    
    // Initialize rate limit reset time
    if (this.rateLimit.enabled && !this.rateLimit.resetTime) {
      this.rateLimit.resetTime = Date.now() + this.rateLimit.resetPeriod;
    }
    
    if (!this.apiKey) {
      console.warn('OpenRouter API key not provided. Provider will not function.');
    }
  }

  /**
   * Make API call to OpenRouter
   * @param {string} prompt - The prompt to send
   * @param {Object} context - Additional context
   * @returns {Promise<LLMResponse>}
   */
  async call(prompt, context = {}) {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
    }

    const { role, temperature = 0.7, maxTokens = 4096 } = context;
    
    // Check rate limit and select appropriate model
    const { model, isFreeTier } = this.selectModelWithRateLimit(role, context);
    
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://ai-app-builder.com',
          'X-Title': 'AI App Builder'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: temperature,
          max_tokens: maxTokens,
          stream: false
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Check for rate limit error
        if (response.status === 429) {
          this.handleRateLimitExceeded();
          throw new Error('OpenRouter rate limit exceeded. Falling back to alternative provider.');
        }
        
        throw new Error(`OpenRouter API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const latency = Date.now() - startTime;
      
      const usage = data.usage || {};
      const tokens = usage.total_tokens || 0;
      const cost = this.calculateCost(tokens, model);
      
      // Update usage metrics
      this.updateUsageMetrics(tokens, cost, isFreeTier);
      
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
          finishReason: data.choices?.[0]?.finish_reason,
          isFreeTier: isFreeTier,
          rateLimitStatus: this.getRateLimitStatus()
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
        metadata: { 
          originalError: error,
          rateLimitStatus: this.getRateLimitStatus()
        }
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
    
    // Check if role is eligible for free tier
    if (this.freeTierModels[role]) {
      return this.freeTierModels[role];
    }
    
    return this.paidModelMappings[role] || this.defaultModel;
  }

  /**
   * Select model with rate limit consideration
   * @param {string} role - Agent role
   * @param {Object} context - Task context
   * @returns {Object} - { model: string, isFreeTier: boolean }
   */
  selectModelWithRateLimit(role, context = {}) {
    // If model is explicitly specified, use it
    if (context.model) {
      return { 
        model: context.model, 
        isFreeTier: Object.values(this.freeTierModels).includes(context.model)
      };
    }
    
    // Check if role is eligible for free tier
    const freeTierModel = this.freeTierModels[role];
    
    if (freeTierModel && this.canUseFreeTeir()) {
      // Increment rate limit counter
      this.trackRateLimitUsage();
      return { model: freeTierModel, isFreeTier: true };
    }
    
    // Fall back to paid model
    const paidModel = this.paidModelMappings[role] || this.defaultModel;
    return { model: paidModel, isFreeTier: false };
  }

  /**
   * Check if free tier can be used
   * @returns {boolean}
   */
  canUseFreeTeir() {
    if (!this.rateLimit.enabled) {
      return true;
    }
    
    // Check if rate limit period has expired
    if (Date.now() >= this.rateLimit.resetTime) {
      this.resetRateLimit();
    }
    
    return this.rateLimit.currentCount < this.rateLimit.freeRequests;
  }

  /**
   * Track rate limit usage
   */
  trackRateLimitUsage() {
    if (this.rateLimit.enabled) {
      this.rateLimit.currentCount++;
    }
  }

  /**
   * Reset rate limit counter
   */
  resetRateLimit() {
    this.rateLimit.currentCount = 0;
    this.rateLimit.resetTime = Date.now() + this.rateLimit.resetPeriod;
  }

  /**
   * Handle rate limit exceeded
   */
  handleRateLimitExceeded() {
    this.usageMetrics.rateLimitExceeded++;
    console.warn(`OpenRouter rate limit exceeded. Free tier: ${this.rateLimit.currentCount}/${this.rateLimit.freeRequests}`);
  }

  /**
   * Get current rate limit status
   * @returns {Object}
   */
  getRateLimitStatus() {
    return {
      enabled: this.rateLimit.enabled,
      currentCount: this.rateLimit.currentCount,
      limit: this.rateLimit.freeRequests,
      resetTime: this.rateLimit.resetTime,
      timeUntilReset: Math.max(0, this.rateLimit.resetTime - Date.now())
    };
  }

  /**
   * Update usage metrics
   * @param {number} tokens - Tokens used
   * @param {number} cost - Cost incurred
   * @param {boolean} isFreeTier - Whether free tier was used
   */
  updateUsageMetrics(tokens, cost, isFreeTier) {
    if (isFreeTier) {
      this.usageMetrics.freeTierCalls++;
    } else {
      this.usageMetrics.paidTierCalls++;
    }
    this.usageMetrics.totalTokens += tokens;
    this.usageMetrics.totalCost += cost;
  }

  /**
   * Get usage metrics
   * @returns {Object}
   */
  getUsageMetrics() {
    return {
      ...this.usageMetrics,
      rateLimitStatus: this.getRateLimitStatus()
    };
  }

  /**
   * Calculate cost based on tokens and model
   * @param {number} tokens - Number of tokens used
   * @param {string} model - Model used
   * @returns {number}
   */
  calculateCost(tokens, model) {
    // Free tier models have zero cost
    if (Object.values(this.freeTierModels).includes(model)) {
      return 0;
    }
    
    // Model-specific pricing (approximate)
    const modelPricing = {
      'anthropic/claude-3-haiku': 0.00025,
      'anthropic/claude-3-sonnet': 0.003,
      'mistralai/mistral-7b-instruct': 0.0002,
      'mistralai/mistral-nemo': 0, // Free tier
      'nousresearch/nous-hermes-2-mixtral-8x7b-dpo': 0, // Free tier
      'meta-llama/llama-3.1-8b-instruct': 0, // Free tier
      'deepseek/deepseek-coder': 0.00014,
      'default': this.costPerToken
    };
    
    const pricePerToken = modelPricing[model] || modelPricing.default;
    return tokens * pricePerToken;
  }

  /**
   * Health check for OpenRouter API
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
      console.error('OpenRouter health check failed:', error);
      return false;
    }
  }

  /**
   * Get available models from OpenRouter
   * @returns {Promise<Array>}
   */
  async getAvailableModels() {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key not configured');
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
      console.error('Failed to get OpenRouter models:', error);
      return [];
    }
  }
}

module.exports = OpenRouterProvider;