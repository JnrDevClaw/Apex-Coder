/**
 * Hugging Face LLM Provider
 * Wrapper around HuggingFaceInference for ModelRouter compatibility
 */

const { LLMProvider, LLMResponse } = require('../model-router');
const HuggingFaceInference = require('./huggingface-inference');

class HuggingFaceProvider extends LLMProvider {
  constructor(config = {}) {
    super({
      name: 'huggingface',
      capabilities: ['interviewer', 'tester', 'coder', 'reviewer'],
      costPerToken: config.costPerToken || 0.0001,
      maxTokens: config.maxTokens || 2048,
      latency: config.latency || 500,
      reliability: config.reliability || 0.90,
      ...config
    });
    
    this.apiKey = config.apiKey || process.env.HUGGINGFACE_API_KEY;
    this.inference = new HuggingFaceInference();
    
    // Role to model mapping
    this.roleMapping = {
      'interviewer': 'facebook/blenderbot-400M-distill',
      'tester': 'codellama/CodeLlama-7b-Instruct-hf',
      'coder': 'codellama/CodeLlama-7b-Instruct-hf',
      'reviewer': 'microsoft/CodeBERT-base'
    };
    
    if (!this.apiKey) {
      console.warn('HuggingFace API key not provided. Provider will not function.');
    }
  }

  /**
   * Make API call to Hugging Face
   * @param {string} prompt - The prompt to send
   * @param {Object} context - Additional context
   * @returns {Promise<LLMResponse>}
   */
  async call(prompt, context = {}) {
    if (!this.apiKey) {
      throw new Error('HuggingFace API key not configured');
    }

    const { role, temperature = 0.7, maxTokens = 1024 } = context;
    const modelName = this.selectModel(role, context);
    
    const startTime = Date.now();
    
    try {
      const result = await this.inference.generateText(modelName, prompt, {
        temperature,
        maxTokens,
        useCache: true
      });
      
      const latency = Date.now() - startTime;
      const tokens = Math.floor(result.text.length / 4); // Rough estimate
      const cost = this.calculateCost(tokens, modelName);
      
      return new LLMResponse({
        success: true,
        content: result.text,
        tokens: tokens,
        cost: cost,
        latency: latency,
        provider: this.name,
        model: modelName,
        metadata: result.metadata
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
        model: modelName,
        error: error.message,
        metadata: { originalError: error }
      });
    }
  }

  /**
   * Select appropriate model based on role
   * @param {string} role - Agent role
   * @param {Object} context - Task context
   * @returns {string}
   */
  selectModel(role, context = {}) {
    if (context.model) {
      return context.model;
    }
    
    return this.roleMapping[role] || 'facebook/blenderbot-400M-distill';
  }

  /**
   * Calculate cost based on tokens and model
   * @param {number} tokens - Number of tokens used
   * @param {string} model - Model used
   * @returns {number}
   */
  calculateCost(tokens, model) {
    // HuggingFace Inference API pricing (approximate)
    return tokens * this.costPerToken;
  }

  /**
   * Health check for HuggingFace API
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    if (!this.apiKey) {
      return false;
    }

    try {
      const healthStatus = await this.inference.healthCheck();
      return healthStatus.status === 'healthy' || healthStatus.api_accessible === true;
    } catch (error) {
      console.error('HuggingFace health check failed:', error);
      return false;
    }
  }
}

module.exports = HuggingFaceProvider;
