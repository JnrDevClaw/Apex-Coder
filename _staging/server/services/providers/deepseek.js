/**
 * DeepSeek LLM Provider via ElectronHub
 * Provides access to DeepSeek V3 and R1 models for coding and reasoning
 * Rate limit: 5 requests per minute
 * 
 * Supported Models:
 * - deepseek-reasoner (R1): Chain-of-thought reasoning for debugging and planning
 * - deepseek-chat (V3): Code generation and architecture tasks
 */

const { LLMProvider, LLMResponse } = require('../model-router');

class DeepSeekProvider extends LLMProvider {
  constructor(config = {}) {
    super({
      name: 'deepseek',
      capabilities: ['planner', 'schema-designer', 'coder', 'debugger', 'deployer', 'reviewer'],
      costPerToken: config.costPerToken || 0.00014, // V3 default
      maxTokens: config.maxTokens || 8192,
      latency: config.latency || 400,
      reliability: config.reliability || 0.93,
      ...config
    });
    
    this.apiKey = config.apiKey || process.env.ELECTRON_HUB_KEY;
    this.baseUrl = config.baseUrl || 'https://api.electronhub.ai/v1';
    
    // Rate limiting: 5 requests per minute
    this.rateLimit = {
      maxRequests: 5,
      windowMs: 60000, // 1 minute
      requests: [],
    };
    
    // Model definitions with explicit names for ElectronHub
    this.models = {
      R1: 'deepseek-r1:free',        // R1 - Chain-of-thought reasoning (free)
      V3: 'deepseek-v3-0324:free',   // V3 - Code generation (free)
      CODER: 'deepseek-coder'        // Coder - Premium model for high complexity
    };
    
    // Role to model mappings
    this.modelMappings = {
      'planner': this.models.R1,        // R1 for reasoning and planning
      'schema-designer': this.models.V3, // V3 for structured output
      'coder': this.models.V3,          // V3 for code generation (standard)
      'coder-premium': this.models.CODER, // Coder for high complexity projects
      'debugger': this.models.R1,       // R1 for debugging with reasoning
      'deployer': this.models.V3,       // V3 for deployment configs
      'reviewer': this.models.V3        // V3 for code review
    };
    
    // Pricing per model (per token)
    this.modelPricing = {
      [this.models.R1]: 0.00055,    // R1 pricing (free tier)
      [this.models.V3]: 0.00014,    // V3 pricing (free tier)
      [this.models.CODER]: 0.00014  // Coder pricing (premium)
    };
    
    if (!this.apiKey) {
      console.warn('ElectronHub API key not provided. DeepSeek provider will not function.');
    }
  }

  /**
   * Check and enforce rate limiting
   * @throws {Error} If rate limit exceeded
   */
  async checkRateLimit() {
    const now = Date.now();
    
    // Remove requests outside the current window
    this.rateLimit.requests = this.rateLimit.requests.filter(
      timestamp => now - timestamp < this.rateLimit.windowMs
    );

    // Check if we've exceeded the limit
    if (this.rateLimit.requests.length >= this.rateLimit.maxRequests) {
      const oldestRequest = this.rateLimit.requests[0];
      const waitTime = this.rateLimit.windowMs - (now - oldestRequest);
      
      throw new Error(`DeepSeek rate limit exceeded (5 req/min). Please wait ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    // Record this request
    this.rateLimit.requests.push(now);
  }

  /**
   * Make API call to DeepSeek via ElectronHub
   * @param {string} prompt - The prompt to send
   * @param {Object} context - Additional context
   * @returns {Promise<LLMResponse>}
   */
  async call(prompt, context = {}) {
    if (!this.apiKey) {
      throw new Error('ElectronHub API key not configured for DeepSeek');
    }

    const { role, temperature = 0.7, maxTokens = 4096 } = context;
    const model = this.selectModel(role, context);
    
    const startTime = Date.now();
    
    try {
      // Check rate limit before making request
      await this.checkRateLimit();

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
          // DeepSeek specific parameters
          top_p: 0.95,
          frequency_penalty: 0.1,
          presence_penalty: 0.1
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`ElectronHub DeepSeek API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const latency = Date.now() - startTime;
      
      const usage = data.usage || {};
      const tokens = usage.total_tokens || 0;
      const cost = this.calculateCost(tokens, model);
      
      // Extract reasoning steps for R1 model
      const messageContent = data.choices?.[0]?.message;
      const reasoning = this.extractReasoningSteps(messageContent, model);
      
      // Log reasoning steps if present
      if (reasoning && reasoning.steps && reasoning.steps.length > 0) {
        this.logReasoningSteps(reasoning, role, model);
      }
      
      return new LLMResponse({
        success: true,
        content: messageContent?.content || '',
        tokens: tokens,
        cost: cost,
        latency: latency,
        provider: this.name,
        model: model,
        metadata: {
          usage: usage,
          finishReason: data.choices?.[0]?.finish_reason,
          reasoning: reasoning,
          modelType: model === this.models.R1 ? 'R1' : 'V3',
          rateLimitRemaining: this.rateLimit.maxRequests - this.rateLimit.requests.length,
          via: 'ElectronHub'
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
          via: 'ElectronHub'
        }
      });
    }
  }

  /**
   * Format messages based on role and model type
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
      'planner': 'You are an expert software architect using chain-of-thought reasoning. Break down complex specifications into discrete, manageable tasks with clear dependencies. Think step-by-step, explain your reasoning, and focus on logical sequencing and realistic estimations.',
      'schema-designer': 'You are a database and API design expert. Create well-structured schemas, APIs, and data models. Output valid SQL DDL, JSON schemas, and OpenAPI specifications.',
      'coder': 'You are an expert full-stack developer. Write clean, efficient, and well-documented code. Follow best practices and modern conventions for the target language and framework.',
      'debugger': 'You are a debugging expert using chain-of-thought reasoning. Analyze error logs, identify root causes, and generate precise patches. Think step-by-step through the debugging process, explaining your reasoning at each stage.',
      'deployer': 'You are a DevOps expert. Create deployment configurations, infrastructure as code, and CI/CD pipelines. Focus on security, scalability, and reliability.',
      'reviewer': 'You are a code review expert. Analyze code quality, identify potential issues, suggest improvements, and ensure best practices are followed.'
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
    
    // Use R1 for reasoning-heavy tasks (debugging and planning)
    const reasoningRoles = ['planner', 'debugger'];
    if (reasoningRoles.includes(role)) {
      return this.models.R1;
    }
    
    // Use V3 for code generation and architecture tasks
    return this.modelMappings[role] || this.models.V3;
  }

  /**
   * Extract chain-of-thought reasoning steps from R1 model response
   * @param {Object} messageContent - Message content from API response
   * @param {string} model - Model used
   * @returns {Object|null} Extracted reasoning or null
   */
  extractReasoningSteps(messageContent, model) {
    if (!messageContent) {
      return null;
    }

    // R1 model includes reasoning in the response
    if (model === this.models.R1) {
      const reasoning = {
        raw: messageContent.reasoning || null,
        steps: [],
        summary: null
      };

      // If reasoning field exists, parse it
      if (messageContent.reasoning) {
        reasoning.raw = messageContent.reasoning;
        
        // Try to extract structured steps from reasoning text
        const reasoningText = messageContent.reasoning;
        
        // Look for numbered steps or bullet points
        const stepPatterns = [
          /(?:^|\n)(\d+)\.\s+(.+?)(?=\n\d+\.|\n\n|$)/gs,  // Numbered: 1. Step
          /(?:^|\n)[-*]\s+(.+?)(?=\n[-*]|\n\n|$)/gs,       // Bullets: - Step
          /(?:^|\n)Step\s+(\d+):\s+(.+?)(?=\nStep|\n\n|$)/gis // Step 1: ...
        ];

        for (const pattern of stepPatterns) {
          const matches = [...reasoningText.matchAll(pattern)];
          if (matches.length > 0) {
            reasoning.steps = matches.map((match, index) => ({
              step: index + 1,
              content: match[2] || match[1],
              raw: match[0].trim()
            }));
            break;
          }
        }

        // If no structured steps found, treat entire reasoning as one step
        if (reasoning.steps.length === 0 && reasoningText.trim()) {
          reasoning.steps = [{
            step: 1,
            content: reasoningText.trim(),
            raw: reasoningText.trim()
          }];
        }

        // Extract summary (usually last paragraph or conclusion)
        const summaryMatch = reasoningText.match(/(?:conclusion|summary|therefore|in summary)[:\s]+(.+?)$/is);
        if (summaryMatch) {
          reasoning.summary = summaryMatch[1].trim();
        }
      }

      return reasoning;
    }

    return null;
  }

  /**
   * Log reasoning steps for debugging and analysis
   * @param {Object} reasoning - Extracted reasoning object
   * @param {string} role - Agent role
   * @param {string} model - Model used
   */
  logReasoningSteps(reasoning, role, model) {
    if (!reasoning || !reasoning.steps || reasoning.steps.length === 0) {
      return;
    }

    console.log(`[DeepSeek ${model}] Reasoning for role: ${role}`);
    console.log(`[DeepSeek ${model}] Total reasoning steps: ${reasoning.steps.length}`);
    
    reasoning.steps.forEach((step, index) => {
      console.log(`[DeepSeek ${model}] Step ${step.step}: ${step.content.substring(0, 100)}${step.content.length > 100 ? '...' : ''}`);
    });

    if (reasoning.summary) {
      console.log(`[DeepSeek ${model}] Summary: ${reasoning.summary.substring(0, 150)}${reasoning.summary.length > 150 ? '...' : ''}`);
    }
  }

  /**
   * Calculate cost based on tokens and model
   * @param {number} tokens - Number of tokens used
   * @param {string} model - Model used
   * @returns {number}
   */
  calculateCost(tokens, model) {
    // Use model-specific pricing
    const pricePerToken = this.modelPricing[model] || this.costPerToken;
    return tokens * pricePerToken;
  }

  /**
   * Health check for DeepSeek API via ElectronHub
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
      console.error('ElectronHub DeepSeek health check failed:', error);
      return false;
    }
  }

  /**
   * Get model information from ElectronHub
   * @returns {Promise<Array>}
   */
  async getModelInfo() {
    if (!this.apiKey) {
      throw new Error('ElectronHub API key not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models from ElectronHub: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('Failed to get DeepSeek models from ElectronHub:', error);
      return [];
    }
  }

  /**
   * Get current rate limit status
   * @returns {Object} Rate limit information
   */
  getRateLimitStatus() {
    const now = Date.now();
    
    // Clean up old requests
    this.rateLimit.requests = this.rateLimit.requests.filter(
      timestamp => now - timestamp < this.rateLimit.windowMs
    );

    const remaining = this.rateLimit.maxRequests - this.rateLimit.requests.length;
    const resetTime = this.rateLimit.requests.length > 0 
      ? this.rateLimit.requests[0] + this.rateLimit.windowMs
      : now;

    return {
      limit: this.rateLimit.maxRequests,
      remaining: remaining,
      reset: new Date(resetTime).toISOString(),
      resetIn: Math.max(0, Math.ceil((resetTime - now) / 1000))
    };
  }
}

module.exports = DeepSeekProvider;