/**
 * Llama Providers
 * Meta-Llama models for architecture planning and lightweight review
 */

const { LLMProvider, LLMResponse } = require('../model-router');

class Llama3Provider extends LLMProvider {
  constructor(config = {}) {
    super({
      name: 'llama-3-8b',
      capabilities: ['planner', 'schema-designer'],
      costPerToken: config.costPerToken || 0.0002,
      maxTokens: config.maxTokens || 8192,
      latency: config.latency || 700,
      reliability: config.reliability || 0.93,
      ...config
    });
    
    this.apiKey = config.apiKey || process.env.HUGGINGFACE_API_KEY;
    this.baseUrl = config.baseUrl || 'https://api-inference.huggingface.co/models/meta-llama/Meta-Llama-3-8B-Instruct';
    this.modelName = 'meta-llama/Meta-Llama-3-8B-Instruct';
    
    if (!this.apiKey) {
      console.warn('Llama-3 API key not provided. Provider will not function.');
    }
  }

  /**
   * Make API call to Llama-3
   * @param {string} prompt - The prompt to send
   * @param {Object} context - Additional context
   * @returns {Promise<LLMResponse>}
   */
  async call(prompt, context = {}) {
    if (!this.apiKey) {
      throw new Error('Llama-3 API key not configured');
    }

    const { role, temperature = 0.3, maxTokens = 4096 } = context;
    const formattedPrompt = this.formatStructuredPrompt(prompt, role, context);
    
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
            top_p: 0.9,
            repetition_penalty: 1.1,
            return_full_text: false
          },
          options: {
            wait_for_model: true,
            use_cache: false
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Llama-3 API error: ${response.status} - ${errorData.error || response.statusText}`);
      }

      const data = await response.json();
      const latency = Date.now() - startTime;
      
      let content = '';
      if (Array.isArray(data) && data.length > 0) {
        content = data[0].generated_text || '';
      } else if (data.generated_text) {
        content = data.generated_text;
      }
      
      // Clean and structure the response
      content = this.cleanStructuredResponse(content, role);
      
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
          structureQuality: this.assessStructureQuality(content),
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
   * Format prompt for structured reasoning tasks
   * @param {string} prompt - Original prompt
   * @param {string} role - Agent role
   * @param {Object} context - Additional context
   * @returns {string}
   */
  formatStructuredPrompt(prompt, role, context) {
    if (role === 'planner') {
      return `<|begin_of_text|><|start_header_id|>system<|end_header_id|>

You are an expert software architect. Break down complex projects into structured, actionable plans with clear milestones and dependencies.

<|eot_id|><|start_header_id|>user<|end_header_id|>

${prompt}

Please create a structured breakdown including:
1. Project phases and milestones
2. Frontend, backend, and database components
3. Dependencies between components
4. Estimated complexity for each component

Format your response as structured JSON or clear sections.

<|eot_id|><|start_header_id|>assistant<|end_header_id|>

`;
    } else if (role === 'schema-designer') {
      return `<|begin_of_text|><|start_header_id|>system<|end_header_id|>

You are a database architect and API designer. Create efficient, scalable database schemas and well-structured APIs.

<|eot_id|><|start_header_id|>user<|end_header_id|>

${prompt}

Please design:
1. Database schema with tables, relationships, and indexes
2. API endpoints with request/response structures
3. Data validation rules
4. Performance considerations

<|eot_id|><|start_header_id|>assistant<|end_header_id|>

`;
    }
    
    return `<|begin_of_text|><|start_header_id|>user<|end_header_id|>

${prompt}

<|eot_id|><|start_header_id|>assistant<|end_header_id|>

`;
  }

  /**
   * Clean structured response
   * @param {string} content - Generated content
   * @param {string} role - Agent role
   * @returns {string}
   */
  cleanStructuredResponse(content, role) {
    // Remove Llama-3 chat template artifacts
    return content
      .replace(/<\|.*?\|>/g, '') // Remove chat template tokens
      .replace(/^assistant\s*/i, '')
      .replace(/^user\s*/i, '')
      .trim();
  }

  /**
   * Assess structure quality
   * @param {string} content - Generated content
   * @returns {Object}
   */
  assessStructureQuality(content) {
    const hasJsonStructure = content.includes('{') && content.includes('}');
    const hasNumberedLists = /^\d+\./.test(content);
    const hasSections = content.includes('##') || content.includes('###');
    const lines = content.split('\n').length;
    
    return {
      hasJsonStructure,
      hasNumberedLists,
      hasSections,
      lineCount: lines,
      structureScore: (hasJsonStructure ? 1 : 0) + (hasNumberedLists ? 1 : 0) + (hasSections ? 1 : 0),
      complexity: lines > 50 ? 'high' : lines > 20 ? 'medium' : 'low'
    };
  }

  calculateCost(tokens) {
    return tokens * this.costPerToken;
  }

  async healthCheck() {
    if (!this.apiKey) return false;
    
    try {
      const response = await this.call('Create a simple project plan', { 
        role: 'planner',
        maxTokens: 100 
      });
      return response.success;
    } catch (error) {
      console.error('Llama-3 health check failed:', error);
      return false;
    }
  }
}

class Llama32Provider extends LLMProvider {
  constructor(config = {}) {
    super({
      name: 'llama-3.2-1b',
      capabilities: ['reviewer', 'tester'],
      costPerToken: config.costPerToken || 0.00005, // Very lightweight
      maxTokens: config.maxTokens || 2048,
      latency: config.latency || 300, // Fast due to small size
      reliability: config.reliability || 0.88,
      ...config
    });
    
    this.apiKey = config.apiKey || process.env.HUGGINGFACE_API_KEY;
    this.baseUrl = config.baseUrl || 'https://api-inference.huggingface.co/models/meta-llama/Llama-3.2-1B-Instruct';
    this.modelName = 'meta-llama/Llama-3.2-1B-Instruct';
    
    if (!this.apiKey) {
      console.warn('Llama-3.2 API key not provided. Provider will not function.');
    }
  }

  async call(prompt, context = {}) {
    if (!this.apiKey) {
      throw new Error('Llama-3.2 API key not configured');
    }

    const { role, temperature = 0.5, maxTokens = 1024 } = context;
    const formattedPrompt = this.formatReviewPrompt(prompt, role, context);
    
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
            top_p: 0.9,
            return_full_text: false
          },
          options: {
            wait_for_model: true,
            use_cache: false
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Llama-3.2 API error: ${response.status} - ${errorData.error || response.statusText}`);
      }

      const data = await response.json();
      const latency = Date.now() - startTime;
      
      let content = '';
      if (Array.isArray(data) && data.length > 0) {
        content = data[0].generated_text || '';
      } else if (data.generated_text) {
        content = data.generated_text;
      }
      
      content = this.cleanReviewResponse(content, role);
      
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
          reviewQuality: this.assessReviewQuality(content),
          role: role
        }
      });

    } catch (error) {
      const latency = Date.now() - startTime;
      
      return new LLLResponse({
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

  formatReviewPrompt(prompt, role, context) {
    if (role === 'reviewer') {
      return `<|begin_of_text|><|start_header_id|>system<|end_header_id|>

You are a code reviewer. Provide concise, actionable feedback on code quality, security, and best practices.

<|eot_id|><|start_header_id|>user<|end_header_id|>

${prompt}

<|eot_id|><|start_header_id|>assistant<|end_header_id|>

`;
    }
    
    return `<|begin_of_text|><|start_header_id|>user<|end_header_id|>

${prompt}

<|eot_id|><|start_header_id|>assistant<|end_header_id|>

`;
  }

  cleanReviewResponse(content, role) {
    return content
      .replace(/<\|.*?\|>/g, '')
      .replace(/^assistant\s*/i, '')
      .trim();
  }

  assessReviewQuality(content) {
    const hasSpecificFeedback = content.includes('consider') || content.includes('recommend');
    const hasCodeExamples = content.includes('```') || content.includes('function');
    const feedbackItems = content.split(/[.!]/).filter(s => s.trim().length > 10).length;
    
    return {
      hasSpecificFeedback,
      hasCodeExamples,
      feedbackItemCount: feedbackItems,
      reviewDepth: feedbackItems > 5 ? 'detailed' : feedbackItems > 2 ? 'moderate' : 'basic'
    };
  }

  calculateCost(tokens) {
    return tokens * this.costPerToken;
  }

  async healthCheck() {
    if (!this.apiKey) return false;
    
    try {
      const response = await this.call('Review this simple function', { 
        role: 'reviewer',
        maxTokens: 50 
      });
      return response.success;
    } catch (error) {
      console.error('Llama-3.2 health check failed:', error);
      return false;
    }
  }
}

module.exports = {
  Llama3Provider,
  Llama32Provider
};