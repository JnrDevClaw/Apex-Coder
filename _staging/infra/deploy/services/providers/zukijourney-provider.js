/**
 * Zukijourney Provider
 * 
 * Provider implementation for Zukijourney API (OpenAI-compatible).
 * Supports GPT models (GPT-5 Mini, GPT-4o) and Claude models (Claude 3.5 Haiku, etc.).
 * 
 * Requirements: 2.2, 2.5, 12.1, 12.2
 */

const OpenAI = require('openai').default || require('openai');
const BaseProvider = require('./base-provider.js');
const { callWithRetry } = require('../../utils/retry-handler.js');
const ZukijourneyRateLimiter = require('./zukijourney-rate-limiter.js');

class ZukijourneyProvider extends BaseProvider {
  /**
   * Create Zukijourney provider instance
   * @param {Object} config - Provider configuration
   */
  constructor(config) {
    super(config);
    
    // Validate Zukijourney-specific requirements
    if (!this.baseURL) {
      this.baseURL = 'https://api.zukijourney.com/v1';
    }

    // Initialize OpenAI client with custom base URL
    this.client = new OpenAI({
      baseURL: this.baseURL,
      apiKey: this.apiKey,
      timeout: this.timeout,
      maxRetries: 0 // We handle retries ourselves
    });

    // Initialize intelligent rate limiter for Zukijourney
    // Respects 4 req/min and 12 req/min limits
    this.rateLimiter = new ZukijourneyRateLimiter({
      maxConcurrent: config.maxConcurrent || 2,
      minTime: config.minTime || 5000, // 5 seconds = 12 req/min
      reservoir: config.reservoir || 10,
      reservoirRefreshAmount: config.reservoirRefreshAmount || 10,
      reservoirRefreshInterval: 60000, // 1 minute
      maxRetries: config.maxRetries || 3,
      rateLimitDelay: 15000, // 15 seconds on rate limit
      connectionErrorDelay: 5000 // 5 seconds on connection error
    });

    // Model-specific configurations
    this.modelConfigs = {
      // GPT Models
      'gpt-5-mini': {
        defaultTemperature: 0.7,
        defaultMaxTokens: 4096,
        defaultTopP: 1.0,
        supportsStreaming: true
      },
      'gpt-4o': {
        defaultTemperature: 0.7,
        defaultMaxTokens: 4096,
        defaultTopP: 1.0,
        supportsStreaming: true
      },
      // Claude Models (accessed via Zukijourney)
      'claude-3.5-haiku': {
        defaultTemperature: 0.7,
        defaultMaxTokens: 4096,
        defaultTopP: 1.0,
        supportsStreaming: true
      },
      'claude-3-5-haiku-20241022': {
        defaultTemperature: 0.7,
        defaultMaxTokens: 4096,
        defaultTopP: 1.0,
        supportsStreaming: true
      }
    };
  }

  /**
   * Get model-specific configuration
   * @param {string} model - Model identifier
   * @returns {Object} Model configuration
   */
  getModelConfig(model) {
    return this.modelConfigs[model] || {
      defaultTemperature: 0.7,
      defaultMaxTokens: 4096,
      defaultTopP: 1.0,
      supportsStreaming: true
    };
  }

  /**
   * Make an AI call to Zukijourney API
   * @param {string} model - Model identifier
   * @param {Array} messages - Chat messages in standard format
   * @param {Object} options - Call options
   * @param {number} options.temperature - Sampling temperature (0-2)
   * @param {number} options.maxTokens - Maximum tokens to generate
   * @param {number} options.topP - Nucleus sampling parameter
   * @param {number} options.frequencyPenalty - Frequency penalty (-2.0 to 2.0)
   * @param {number} options.presencePenalty - Presence penalty (-2.0 to 2.0)
   * @returns {Promise<Object>} Standardized response
   */
  async call(model, messages, options = {}) {
    const startTime = Date.now();
    const requestId = `zuki-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    
    try {
      // Get model-specific configuration
      const modelConfig = this.getModelConfig(model);
      
      // Prepare request parameters with model-specific defaults
      const requestParams = {
        model,
        messages: this.formatMessages(messages),
        temperature: options.temperature !== undefined ? options.temperature : modelConfig.defaultTemperature,
        max_tokens: options.maxTokens || modelConfig.defaultMaxTokens,
        top_p: options.topP !== undefined ? options.topP : modelConfig.defaultTopP,
        frequency_penalty: options.frequencyPenalty || 0,
        presence_penalty: options.presencePenalty || 0
      };

      // Make API call with intelligent rate limiting and retry logic
      const response = await this.rateLimiter.execute(
        async () => {
          return await this.client.chat.completions.create(requestParams);
        },
        {
          context: {
            requestId,
            model,
            provider: 'zukijourney'
          },
          onRetry: async (attempt, error, errorType, delay, context) => {
            console.warn(`[Zukijourney] Retrying request`, {
              requestId: context.requestId,
              model: context.model,
              attempt,
              errorType,
              delay,
              error: error.message,
              statusCode: error.statusCode || error.response?.status
            });
          }
        }
      );

      // Parse response
      const parsed = this.parseResponse(response, model);
      
      // Calculate latency
      const latency = Date.now() - startTime;
      
      // Calculate cost
      const cost = this.calculateCost(
        parsed.tokens.input,
        parsed.tokens.output,
        model
      );

      return {
        content: parsed.content,
        tokens: parsed.tokens,
        cost,
        provider: this.name,
        model,
        latency,
        cached: false,
        metadata: {
          finishReason: parsed.finishReason,
          systemFingerprint: response.system_fingerprint
        }
      };

    } catch (error) {
      const latency = Date.now() - startTime;
      
      // Convert to structured error type
      const structuredError = this.handleError(error, { model, latency });
      structuredError.latency = latency;
      
      throw structuredError;
    }
  }

  /**
   * Stream responses from Zukijourney API
   * @param {string} model - Model identifier
   * @param {Array} messages - Chat messages
   * @param {Object} options - Call options
   * @returns {AsyncIterator<Object>} Stream of response chunks
   */
  async *stream(model, messages, options = {}) {
    const startTime = Date.now();
    const requestId = `zuki-stream-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    
    try {
      // Get model-specific configuration
      const modelConfig = this.getModelConfig(model);
      
      // Prepare request parameters
      const requestParams = {
        model,
        messages: this.formatMessages(messages),
        temperature: options.temperature !== undefined ? options.temperature : modelConfig.defaultTemperature,
        max_tokens: options.maxTokens || modelConfig.defaultMaxTokens,
        top_p: options.topP !== undefined ? options.topP : modelConfig.defaultTopP,
        frequency_penalty: options.frequencyPenalty || 0,
        presence_penalty: options.presencePenalty || 0,
        stream: true
      };

      // Make streaming API call with intelligent rate limiting and retry logic
      const stream = await this.rateLimiter.execute(
        async () => {
          return await this.client.chat.completions.create(requestParams);
        },
        {
          context: {
            requestId,
            model,
            provider: 'zukijourney',
            streaming: true
          },
          onRetry: async (attempt, error, errorType, delay, context) => {
            console.warn(`[Zukijourney] Retrying streaming request`, {
              requestId: context.requestId,
              model: context.model,
              attempt,
              errorType,
              delay,
              error: error.message,
              statusCode: error.statusCode || error.response?.status
            });
          }
        }
      );

      let totalTokens = { input: 0, output: 0 };
      let fullContent = '';

      // Process stream chunks
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        
        if (delta) {
          fullContent += delta;
          // Estimate output tokens incrementally
          totalTokens.output = this.estimateTokens(fullContent);
          
          yield {
            content: delta,
            tokens: {
              input: totalTokens.input,
              output: totalTokens.output,
              total: totalTokens.input + totalTokens.output
            },
            model,
            provider: this.name,
            done: false
          };
        }

        // Check if stream is complete
        if (chunk.choices[0]?.finish_reason) {
          // Get final token counts if available
          if (chunk.usage) {
            totalTokens.input = chunk.usage.prompt_tokens || totalTokens.input;
            totalTokens.output = chunk.usage.completion_tokens || totalTokens.output;
          }

          const latency = Date.now() - startTime;
          const cost = this.calculateCost(totalTokens.input, totalTokens.output, model);

          yield {
            content: '',
            tokens: {
              input: totalTokens.input,
              output: totalTokens.output,
              total: totalTokens.input + totalTokens.output
            },
            cost,
            model,
            provider: this.name,
            latency,
            done: true,
            metadata: {
              finishReason: chunk.choices[0].finish_reason
            }
          };
        }
      }

    } catch (error) {
      const latency = Date.now() - startTime;
      
      // Convert to structured error type
      const structuredError = this.handleError(error, { model, latency });
      structuredError.latency = latency;
      
      throw structuredError;
    }
  }

  /**
   * Format messages for Zukijourney API (OpenAI-compatible format)
   * @param {Array} messages - Standard message format [{role, content}]
   * @returns {Array} Formatted messages for OpenAI API
   */
  formatMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages must be a non-empty array');
    }

    // OpenAI format is already standard, just validate and return
    return messages.map(msg => {
      if (!msg.role || !msg.content) {
        throw new Error('Each message must have role and content');
      }

      // Ensure role is valid
      const validRoles = ['system', 'user', 'assistant'];
      if (!validRoles.includes(msg.role)) {
        throw new Error(`Invalid message role: ${msg.role}. Must be one of: ${validRoles.join(', ')}`);
      }

      return {
        role: msg.role,
        content: msg.content
      };
    });
  }

  /**
   * Parse Zukijourney response to standard format
   * @param {Object} response - Zukijourney API response
   * @param {string} model - Model identifier
   * @returns {Object} Parsed response with content and tokens
   */
  parseResponse(response, model) {
    if (!response || !response.choices || response.choices.length === 0) {
      throw new Error('Invalid response from Zukijourney API');
    }

    const choice = response.choices[0];
    const content = choice.message?.content || '';
    
    // Extract token usage
    const usage = response.usage || {};
    
    // If no usage data, estimate tokens
    // For input tokens, we can't estimate without the original messages, so default to 0
    // In real usage, the call() method will have the messages and can estimate
    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || this.estimateTokens(content);
    
    return {
      content: content.trim(),
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: usage.total_tokens || (inputTokens + outputTokens)
      },
      finishReason: choice.finish_reason || 'stop'
    };
  }

  /**
   * Check if error is retryable (override to handle OpenAI-specific errors)
   * @param {Error} error - Error object
   * @returns {boolean} True if retryable
   */
  isRetryableError(error) {
    // Check OpenAI-specific error types
    if (error.type) {
      const retryableTypes = [
        'server_error',
        'timeout',
        'rate_limit_exceeded',
        'api_connection_error'
      ];
      
      if (retryableTypes.includes(error.type)) {
        return true;
      }
    }

    // Fall back to base class logic
    return super.isRetryableError(error);
  }

  /**
   * Get rate limiter status
   * @returns {Object} Current rate limiter status
   */
  getRateLimiterStatus() {
    return this.rateLimiter.getStatus();
  }

  /**
   * Reset rate limiter state
   * Useful for testing or recovery scenarios
   */
  resetRateLimiter() {
    this.rateLimiter.reset();
  }
}

module.exports = ZukijourneyProvider;
