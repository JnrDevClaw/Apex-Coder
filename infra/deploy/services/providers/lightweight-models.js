/**
 * Lightweight Models Provider
 * Provides access to GPT-J and GLM-4.1V for efficient processing
 */

const { LLMProvider, LLMResponse } = require('../model-router');

class GPTJProvider extends LLMProvider {
  constructor(config = {}) {
    super({
      name: 'gpt-j',
      capabilities: ['tester', 'reviewer', 'interviewer'],
      costPerToken: config.costPerToken || 0.00005, // Very cost-effective
      maxTokens: config.maxTokens || 2048,
      latency: config.latency || 400,
      reliability: config.reliability || 0.87,
      ...config
    });
    
    this.apiKey = config.apiKey || process.env.HUGGINGFACE_API_KEY;
    this.baseUrl = config.baseUrl || 'https://api-inference.huggingface.co/models/EleutherAI/gpt-j-6b';
    this.modelName = 'EleutherAI/gpt-j-6b';
    
    if (!this.apiKey) {
      console.warn('GPT-J API key not provided. Provider will not function.');
    }
  }

  /**
   * Make API call to GPT-J
   * @param {string} prompt - The prompt to send
   * @param {Object} context - Additional context
   * @returns {Promise<LLMResponse>}
   */
  async call(prompt, context = {}) {
    if (!this.apiKey) {
      throw new Error('GPT-J API key not configured');
    }

    const { role, temperature = 0.7, maxTokens = 1024 } = context;
    const formattedPrompt = this.formatPrompt(prompt, role, context);
    
    const startTime = Date.now();
    
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: formattedPrompt,
          parameters: {
            max_new_tokens: maxTokens,
            temperature: temperature,
            do_sample: temperature > 0,
            return_full_text: false,
            top_p: 0.9,
            repetition_penalty: 1.1
          },
          options: {
            wait_for_model: true,
            use_cache: false
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`GPT-J API error: ${response.status} - ${errorData.error || response.statusText}`);
      }

      const data = await response.json();
      const latency = Date.now() - startTime;
      
      // Handle response format
      let content = '';
      if (Array.isArray(data) && data.length > 0) {
        content = data[0].generated_text || '';
      } else if (data.generated_text) {
        content = data.generated_text;
      }
      
      // Clean up the response
      content = this.cleanResponse(content, role);
      
      // Estimate tokens
      const tokens = Math.ceil((formattedPrompt.length + content.length) / 4);
      const cost = this.calculateCost(tokens);
      
      return new LLMResponse({
        success: true,
        content: content,
        tokens: tokens,
        cost: cost,
        latency: latency,
        provider: this.name,
        model: this.modelName,
        metadata: {
          originalResponse: data,
          role: role
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
        model: this.modelName,
        error: error.message,
        metadata: { originalError: error }
      });
    }
  }

  /**
   * Format prompt based on role
   * @param {string} prompt - Original prompt
   * @param {string} role - Agent role
   * @param {Object} context - Additional context
   * @returns {string}
   */
  formatPrompt(prompt, role, context) {
    const rolePrompts = {
      'tester': `Task: Write comprehensive tests for the following code or functionality.\n\n${prompt}\n\nTests:`,
      'reviewer': `Task: Review the following code and provide feedback on quality, security, and best practices.\n\n${prompt}\n\nReview:`,
      'interviewer': `Task: Ask clarifying questions about the following requirement.\n\n${prompt}\n\nQuestions:`
    };
    
    return rolePrompts[role] || `${prompt}\n\nResponse:`;
  }

  /**
   * Clean up response based on role
   * @param {string} content - Generated content
   * @param {string} role - Agent role
   * @returns {string}
   */
  cleanResponse(content, role) {
    // Remove common artifacts and improve formatting
    return content
      .replace(/^Response:\s*/i, '')
      .replace(/^Tests:\s*/i, '')
      .replace(/^Review:\s*/i, '')
      .replace(/^Questions:\s*/i, '')
      .trim();
  }

  /**
   * Calculate cost based on tokens
   * @param {number} tokens - Number of tokens used
   * @returns {number}
   */
  calculateCost(tokens) {
    return tokens * this.costPerToken;
  }

  /**
   * Health check for GPT-J
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    if (!this.apiKey) {
      return false;
    }

    try {
      const response = await this.call('Hello world', { maxTokens: 20 });
      return response.success;
    } catch (error) {
      console.error('GPT-J health check failed:', error);
      return false;
    }
  }
}

class GLMProvider extends LLMProvider {
  constructor(config = {}) {
    super({
      name: 'glm-4.1v',
      capabilities: ['reviewer', 'schema-designer', 'interviewer'],
      costPerToken: config.costPerToken || 0.0003,
      maxTokens: config.maxTokens || 4096,
      latency: config.latency || 500,
      reliability: config.reliability || 0.90,
      ...config
    });
    
    this.apiKey = config.apiKey || process.env.GLM_API_KEY;
    this.baseUrl = config.baseUrl || 'https://open.bigmodel.cn/api/paas/v4';
    this.modelName = 'glm-4-flash';
    
    if (!this.apiKey) {
      console.warn('GLM API key not provided. Provider will not function.');
    }
  }

  /**
   * Make API call to GLM
   * @param {string} prompt - The prompt to send
   * @param {Object} context - Additional context
   * @returns {Promise<LLMResponse>}
   */
  async call(prompt, context = {}) {
    if (!this.apiKey) {
      throw new Error('GLM API key not configured');
    }

    const { role, temperature = 0.7, maxTokens = 2048 } = context;
    
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
          model: this.modelName,
          messages: messages,
          temperature: temperature,
          max_tokens: maxTokens,
          stream: false
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`GLM API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const latency = Date.now() - startTime;
      
      const usage = data.usage || {};
      const tokens = usage.total_tokens || 0;
      const cost = this.calculateCost(tokens);
      
      return new LLMResponse({
        success: true,
        content: data.choices?.[0]?.message?.content || '',
        tokens: tokens,
        cost: cost,
        latency: latency,
        provider: this.name,
        model: this.modelName,
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
        model: this.modelName,
        error: error.message,
        metadata: { originalError: error }
      });
    }
  }

  /**
   * Format messages for GLM API
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
      'reviewer': 'You are an experienced software engineer. Review code for quality, security, performance, and maintainability. Provide specific, actionable feedback.',
      'schema-designer': 'You are a database architect. Design efficient, normalized database schemas and well-structured APIs. Consider scalability and performance.',
      'interviewer': 'You are a business analyst. Help gather and clarify requirements through thoughtful questions. Focus on understanding user needs and constraints.'
    };
    
    return systemPrompts[role] || 'You are a helpful AI assistant.';
  }

  /**
   * Calculate cost based on tokens
   * @param {number} tokens - Number of tokens used
   * @returns {number}
   */
  calculateCost(tokens) {
    return tokens * this.costPerToken;
  }

  /**
   * Health check for GLM
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
      console.error('GLM health check failed:', error);
      return false;
    }
  }

  /**
   * Get model capabilities and features
   * @returns {Object}
   */
  getModelCapabilities() {
    return {
      multimodal: true, // GLM-4.1V supports vision
      languages: ['chinese', 'english'],
      specialties: ['reasoning', 'analysis', 'multimodal'],
      contextWindow: 128000,
      outputLimit: 4096
    };
  }
}

module.exports = {
  GPTJProvider,
  GLMProvider
};