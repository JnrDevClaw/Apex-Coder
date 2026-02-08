/**
 * DeepSeek Provider via ElectronHub
 * 
 * Enhanced provider implementation for DeepSeek API via ElectronHub.
 * Supports multiple DeepSeek models with detailed logging and complexity-based selection.
 * Rate limit: 5 requests per minute
 * 
 * Model Selection Strategy:
 * - deepseek-v3-0324:free - Schema generation, low-medium complexity (1-6)
 * - deepseek-r1:free - Reasoning and debugging tasks
 * - deepseek-coder - High complexity code generation (7-10)
 * 
 * Requirements: 2.4, Enhanced logging and fallback strategy
 */

const BaseProvider = require('./base-provider.js');
const { callWithRetry } = require('../../utils/retry-handler.js');

class DeepSeekProvider extends BaseProvider {
  /**
   * Create DeepSeek provider instance
   * @param {Object} config - Provider configuration
   */
  constructor(config) {
    super(config);

    // Set ElectronHub base URL
    if (!this.baseURL) {
      this.baseURL = 'https://api.electronhub.ai/v1';
    }

    // Rate limiting: 5 requests per minute
    this.rateLimit = {
      maxRequests: 5,
      windowMs: 60000, // 1 minute
      requests: [],
    };

    // Enhanced logging configuration
    this.logging = {
      enabled: true,
      logRequests: true,
      logResponses: true,
      logErrors: true,
      logRateLimit: true,
      logModelSelection: true
    };

    // Model-specific configurations with enhanced metadata
    this.modelConfigs = {
      'deepseek-v3-0324:free': {
        defaultTemperature: 0.7,
        defaultMaxTokens: 4096,
        defaultTopP: 1.0,
        supportsStreaming: false,
        complexity: 'general',
        primaryUse: 'schema-generation',
        tier: 'free',
        costPerMToken: { input: 0.27, output: 1.10 }
      },
      'deepseek-r1:free': {
        defaultTemperature: 0.7,
        defaultMaxTokens: 4096,
        defaultTopP: 1.0,
        supportsStreaming: false,
        complexity: 'reasoning',
        primaryUse: 'reasoning-only',
        tier: 'free',
        costPerMToken: { input: 0.55, output: 2.19 }
      },
      'deepseek-coder': {
        defaultTemperature: 0.3,  // Lower temperature for precise debugging
        defaultMaxTokens: 8192,   // Higher token limit for debugging context
        defaultTopP: 0.95,
        supportsStreaming: false,
        complexity: 'debugging',
        primaryUse: 'debugging-and-fixing',
        tier: 'premium',
        costPerMToken: { input: 0.14, output: 0.28 }
      },
      // Legacy model names for backward compatibility
      'deepseek-v3': {
        defaultTemperature: 0.7,
        defaultMaxTokens: 4096,
        defaultTopP: 1.0,
        supportsStreaming: false,
        complexity: 'medium',
        primaryUse: 'general',
        tier: 'legacy'
      },
      'deepseek-chat': {
        defaultTemperature: 0.7,
        defaultMaxTokens: 4096,
        defaultTopP: 1.0,
        supportsStreaming: false,
        complexity: 'medium',
        primaryUse: 'general',
        tier: 'legacy'
      }
    };

    // Initialize request counter for detailed logging
    this.requestCounter = 0;
    this.sessionStartTime = Date.now();
  }

  /**
   * Enhanced logging method
   * @param {string} level - Log level (info, warn, error, debug)
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  log(level, message, metadata = {}) {
    if (!this.logging.enabled) return;

    const timestamp = new Date().toISOString();
    const sessionDuration = Date.now() - this.sessionStartTime;

    const logEntry = {
      timestamp,
      level,
      provider: 'deepseek-electronhub',
      sessionDuration: `${Math.round(sessionDuration / 1000)}s`,
      requestCount: this.requestCounter,
      rateLimitStatus: {
        remaining: this.rateLimit.maxRequests - this.rateLimit.requests.length,
        total: this.rateLimit.maxRequests,
        windowMs: this.rateLimit.windowMs
      },
      message,
      ...metadata
    };

    // Use appropriate console method based on level
    switch (level) {
      case 'error':
        console.error('🔴 [DeepSeek-ElectronHub]', JSON.stringify(logEntry, null, 2));
        break;
      case 'warn':
        console.warn('🟡 [DeepSeek-ElectronHub]', JSON.stringify(logEntry, null, 2));
        break;
      case 'debug':
        console.debug('🔍 [DeepSeek-ElectronHub]', JSON.stringify(logEntry, null, 2));
        break;
      default:
        console.log('🔵 [DeepSeek-ElectronHub]', JSON.stringify(logEntry, null, 2));
    }
  }

  /**
   * Select optimal model based on complexity and task type
   * @param {string} requestedModel - Originally requested model
   * @param {number} complexity - Task complexity (1-10)
   * @param {string} taskType - Type of task (schema, code, debug, etc.)
   * @returns {string} Selected model name
   */
  selectOptimalModel(requestedModel, complexity = 5, taskType = 'general') {
    // If specific model requested and exists, use it
    if (requestedModel && this.modelConfigs[requestedModel]) {
      this.log('info', 'Using explicitly requested model', {
        requestedModel,
        complexity,
        taskType
      });
      return requestedModel;
    }

    let selectedModel;

    // Model selection logic based on task type
    if (taskType === 'schema' || taskType === 'schema-generation') {
      selectedModel = 'deepseek-v3-0324:free';
    } else if (taskType === 'debugging' || taskType === 'fixing' || taskType === 'error-fixing') {
      selectedModel = 'deepseek-coder';
    } else if (taskType === 'reasoning') {
      selectedModel = 'deepseek-r1:free';
    } else {
      // Default to V3 for general tasks
      selectedModel = 'deepseek-v3-0324:free';
    }

    if (this.logging.logModelSelection) {
      this.log('info', 'Model selected based on complexity and task type', {
        requestedModel,
        selectedModel,
        complexity,
        taskType,
        selectionReason: this.getSelectionReason(selectedModel, complexity, taskType)
      });
    }

    return selectedModel;
  }

  /**
   * Get human-readable reason for model selection
   * @param {string} model - Selected model
   * @param {number} complexity - Task complexity
   * @param {string} taskType - Task type
   * @returns {string} Selection reason
   */
  getSelectionReason(model, complexity, taskType) {
    const config = this.modelConfigs[model];
    if (!config) return 'Unknown model';

    if (model === 'deepseek-v3-0324:free') {
      return 'Selected for schema generation and general tasks';
    } else if (model === 'deepseek-coder') {
      return 'Selected for debugging and fixing errors';
    } else if (model === 'deepseek-r1:free') {
      return 'Selected for reasoning tasks';
    }

    return 'Default selection';
  }

  /**
   * Check and enforce rate limiting with enhanced logging
   * @throws {Error} If rate limit exceeded
   */
  async checkRateLimit() {
    const now = Date.now();

    // Remove requests outside the current window
    const beforeCount = this.rateLimit.requests.length;
    this.rateLimit.requests = this.rateLimit.requests.filter(
      timestamp => now - timestamp < this.rateLimit.windowMs
    );
    const afterCount = this.rateLimit.requests.length;

    if (this.logging.logRateLimit && beforeCount !== afterCount) {
      this.log('debug', 'Rate limit window cleanup', {
        removedRequests: beforeCount - afterCount,
        remainingRequests: afterCount,
        windowMs: this.rateLimit.windowMs
      });
    }

    // Check if we've exceeded the limit
    if (this.rateLimit.requests.length >= this.rateLimit.maxRequests) {
      const oldestRequest = this.rateLimit.requests[0];
      const waitTime = this.rateLimit.windowMs - (now - oldestRequest);

      this.log('warn', 'Rate limit exceeded', {
        currentRequests: this.rateLimit.requests.length,
        maxRequests: this.rateLimit.maxRequests,
        waitTimeSeconds: Math.ceil(waitTime / 1000),
        oldestRequestAge: now - oldestRequest
      });

      const error = new Error(`Rate limit exceeded (${this.rateLimit.requests.length}/${this.rateLimit.maxRequests}). Please wait ${Math.ceil(waitTime / 1000)} seconds.`);
      error.statusCode = 429;
      error.status = 429;
      error.retryAfter = Math.ceil(waitTime / 1000);
      throw error;
    }

    // Record this request
    this.rateLimit.requests.push(now);

    if (this.logging.logRateLimit) {
      this.log('debug', 'Rate limit check passed', {
        currentRequests: this.rateLimit.requests.length,
        maxRequests: this.rateLimit.maxRequests,
        remaining: this.rateLimit.maxRequests - this.rateLimit.requests.length
      });
    }
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
      supportsStreaming: false
    };
  }

  /**
   * Make an AI call to DeepSeek API via ElectronHub with enhanced logging
   * @param {string} model - Model identifier
   * @param {Array} messages - Chat messages in standard format
   * @param {Object} options - Call options
   * @param {number} options.temperature - Sampling temperature (0-2)
   * @param {number} options.maxTokens - Maximum tokens to generate
   * @param {number} options.topP - Nucleus sampling parameter
   * @param {number} options.complexity - Task complexity (1-10)
   * @param {string} options.taskType - Task type for model selection
   * @returns {Promise<Object>} Standardized response
   */
  async chat(model, messages, options = {}) {
    const startTime = Date.now();
    this.requestCounter++;
    const requestId = `req-${this.requestCounter}-${Date.now()}`;

    try {
      // Select optimal model based on complexity and task type
      const selectedModel = this.selectOptimalModel(
        model,
        options.complexity || 5,
        options.taskType || 'general'
      );

      // Check rate limit before making request
      await this.checkRateLimit();

      // Get model-specific configuration
      const modelConfig = this.getModelConfig(selectedModel);

      // Prepare request body for ElectronHub
      const requestBody = {
        model: selectedModel,
        messages: this.formatMessages(messages),
        temperature: options.temperature !== undefined ? options.temperature : modelConfig.defaultTemperature,
        max_tokens: options.maxTokens || modelConfig.defaultMaxTokens,
        top_p: options.topP !== undefined ? options.topP : modelConfig.defaultTopP,
        stream: false
      };

      // Log request details
      if (this.logging.logRequests) {
        this.log('info', 'Making API request', {
          requestId,
          originalModel: model,
          selectedModel,
          complexity: options.complexity,
          taskType: options.taskType,
          messageCount: messages.length,
          requestBody: {
            ...requestBody,
            messages: `[${messages.length} messages]` // Don't log full messages for privacy
          },
          modelConfig: {
            tier: modelConfig.tier,
            primaryUse: modelConfig.primaryUse,
            complexity: modelConfig.complexity
          }
        });
      }

      // Make API call with retry logic
      const response = await callWithRetry(async () => {
        this.log('debug', 'Sending HTTP request to ElectronHub', {
          requestId,
          url: `${this.baseURL}/chat/completions`,
          method: 'POST',
          timeout: this.timeout
        });

        const res = await fetch(`${this.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'DeepSeek-ElectronHub-Provider/1.0'
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(this.timeout)
        });

        this.log('debug', 'Received HTTP response', {
          requestId,
          status: res.status,
          statusText: res.statusText,
          headers: Object.fromEntries(res.headers.entries())
        });

        if (!res.ok) {
          const errorBody = await res.text();
          let errorMessage = `ElectronHub DeepSeek API error: ${res.status} ${res.statusText}`;

          try {
            const errorJson = JSON.parse(errorBody);
            if (errorJson.error?.message) {
              errorMessage = errorJson.error.message;
            }
          } catch (e) {
            // Use default error message
          }

          this.log('error', 'API request failed', {
            requestId,
            status: res.status,
            statusText: res.statusText,
            errorBody,
            errorMessage
          });

          const error = new Error(errorMessage);
          error.statusCode = res.status;
          error.status = res.status;
          error.response = { status: res.status, data: errorBody };
          throw error;
        }

        return await res.json();
      }, this.retries, (error) => this.isRetryableError(error));

      // Parse response
      const parsed = this.parseResponse(response, selectedModel);

      // Calculate latency
      const latency = Date.now() - startTime;

      // Calculate cost
      const cost = this.calculateCost(
        parsed.tokens.input,
        parsed.tokens.output,
        selectedModel
      );

      const result = {
        content: parsed.content,
        tokens: parsed.tokens,
        cost,
        provider: this.name,
        model: selectedModel,
        latency,
        cached: false,
        metadata: {
          finishReason: parsed.finishReason,
          rateLimitRemaining: this.rateLimit.maxRequests - this.rateLimit.requests.length,
          requestId,
          originalModel: model,
          selectedModel,
          modelConfig: {
            tier: modelConfig.tier,
            primaryUse: modelConfig.primaryUse,
            complexity: modelConfig.complexity
          }
        }
      };

      // Log successful response
      if (this.logging.logResponses) {
        this.log('info', 'API request completed successfully', {
          requestId,
          latency: `${latency}ms`,
          tokens: parsed.tokens,
          cost: `$${cost.toFixed(6)}`,
          contentLength: parsed.content.length,
          finishReason: parsed.finishReason,
          rateLimitRemaining: result.metadata.rateLimitRemaining
        });
      }

      return result;

    } catch (error) {
      const latency = Date.now() - startTime;

      // Log error details
      if (this.logging.logErrors) {
        this.log('error', 'API request failed with error', {
          requestId,
          latency: `${latency}ms`,
          errorType: error.constructor.name,
          errorMessage: error.message,
          statusCode: error.statusCode,
          retryAfter: error.retryAfter,
          stack: error.stack
        });
      }

      // Convert to structured error type
      const structuredError = this.handleError(error, { model, latency, requestId });
      structuredError.latency = latency;
      structuredError.requestId = requestId;

      // Add rate limit info to error if applicable
      if (error.statusCode === 429) {
        structuredError.retryAfter = error.retryAfter;
      }

      throw structuredError;
    }
  }

  /**
   * Stream responses from DeepSeek API
   * Note: DeepSeek-V3 may not support streaming, this is a placeholder
   * @param {string} model - Model identifier
   * @param {Array} messages - Chat messages
   * @param {Object} options - Call options
   * @returns {AsyncIterator<Object>} Stream of response chunks
   */
  async *stream(model, messages, options = {}) {
    // For now, fall back to non-streaming call and yield the full response
    const response = await this.call(model, messages, options);

    yield {
      content: response.content,
      tokens: response.tokens,
      cost: response.cost,
      model: response.model,
      provider: response.provider,
      latency: response.latency,
      done: true,
      metadata: response.metadata
    };
  }

  /**
   * Format messages for DeepSeek API
   * @param {Array} messages - Standard message format [{role, content}]
   * @returns {Array} Formatted messages for DeepSeek API
   */
  formatMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages must be a non-empty array');
    }

    // DeepSeek uses OpenAI-compatible format
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
   * Parse DeepSeek response to standard format
   * @param {Object} response - DeepSeek API response
   * @param {string} model - Model identifier
   * @returns {Object} Parsed response with content and tokens
   */
  parseResponse(response, model) {
    if (!response || !response.choices || response.choices.length === 0) {
      throw new Error('Invalid response from DeepSeek API');
    }

    const choice = response.choices[0];
    const content = choice.message?.content || '';

    // Extract token usage
    const usage = response.usage || {};

    // If no usage data, estimate tokens
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
   * Check if error is retryable
   * @param {Error} error - Error object
   * @returns {boolean} True if retryable
   */
  isRetryableError(error) {
    // Check for specific DeepSeek error types if they exist
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
}

module.exports = DeepSeekProvider;
