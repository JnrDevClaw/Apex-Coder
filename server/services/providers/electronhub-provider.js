/**
 * ElectronHub Provider
 * 
 * Provider implementation for ElectronHub API with correct endpoint routing.
 * Supports GPT models (chat completions), Claude models (messages), and structured responses.
 * 
 * API Endpoint Mapping:
 * - GPT models (gpt-4o, gpt-5-mini, gpt-5-codex) → /chat/completions
 * - DeepSeek models (deepseek-v3, deepseek-coder, deepseek-r1) → /chat/completions
 * - Claude models (claude-3-5-haiku, claude-sonnet) → /messages (Anthropic format)
 * - Schema generation tasks → /responses (structured output)
 */

const BaseProvider = require('./base-provider.js');
const { callWithRetry } = require('../../utils/retry-handler.js');

class ElectronHubProvider extends BaseProvider {
  constructor(config) {
    super(config);

    if (!this.baseURL) {
      this.baseURL = 'https://api.electronhub.ai/v1';
    }

    this.logging = {
      enabled: true,
      logRequests: true,
      logResponses: true,
      logErrors: true,
      logModelSelection: true
    };

    // Model-specific configurations with API endpoint mapping
    this.modelConfigs = {
      'gpt-5-mini': {
        defaultTemperature: 0.7,
        defaultMaxTokens: 4096,
        defaultTopP: 1.0,
        supportsStreaming: false,
        primaryUse: 'normalization-prompt-building',
        tier: 'standard',
        costPerMToken: { input: 0.15, output: 0.60 },
        apiEndpoint: 'chat/completions'
      },
      'gpt-4o': {
        defaultTemperature: 0.7,
        defaultMaxTokens: 8192,
        defaultTopP: 1.0,
        supportsStreaming: false,
        primaryUse: 'file-structure-generation',
        tier: 'premium',
        costPerMToken: { input: 2.50, output: 10.00 },
        apiEndpoint: 'chat/completions'
      },
      'gpt-5-codex': {
        defaultTemperature: 0.2,
        defaultMaxTokens: 8192,
        defaultTopP: 0.95,
        supportsStreaming: false,
        primaryUse: 'simple-code-generation',
        tier: 'standard',
        costPerMToken: { input: 0.10, output: 0.20 },
        apiEndpoint: 'chat/completions'
      },
      'claude-3-5-haiku-20241022': {
        defaultTemperature: 0.7,
        defaultMaxTokens: 4096,
        defaultTopP: 1.0,
        supportsStreaming: false,
        primaryUse: 'validation',
        tier: 'standard',
        costPerMToken: { input: 0.80, output: 4.00 },
        apiEndpoint: 'messages'
      },
      'claude-sonnet-4-5-20250929': {
        defaultTemperature: 0.3,
        defaultMaxTokens: 8192,
        defaultTopP: 0.95,
        supportsStreaming: false,
        primaryUse: 'complex-code-generation',
        tier: 'premium',
        costPerMToken: { input: 3.00, output: 15.00 },
        apiEndpoint: 'messages'
      },
      'deepseek-v3-0324:free': {
        defaultTemperature: 0.7,
        defaultMaxTokens: 4096,
        defaultTopP: 1.0,
        supportsStreaming: false,
        primaryUse: 'schema-generation',
        tier: 'free',
        costPerMToken: { input: 0.00, output: 0.00 },
        apiEndpoint: 'chat/completions'
      },
      'deepseek-coder': {
        defaultTemperature: 0.2,
        defaultMaxTokens: 8192,
        defaultTopP: 0.95,
        supportsStreaming: false,
        primaryUse: 'debugging-fixing',
        tier: 'standard',
        costPerMToken: { input: 0.10, output: 0.20 },
        apiEndpoint: 'chat/completions'
      },
      'deepseek-r1:free': {
        defaultTemperature: 0.7,
        defaultMaxTokens: 4096,
        defaultTopP: 1.0,
        supportsStreaming: false,
        primaryUse: 'reasoning',
        tier: 'free',
        costPerMToken: { input: 0.00, output: 0.00 },
        apiEndpoint: 'chat/completions'
      }
    };

    this.requestCounter = 0;
    this.sessionStartTime = Date.now();
  }

  log(level, message, metadata = {}) {
    if (!this.logging.enabled) return;

    const timestamp = new Date().toISOString();
    const sessionDuration = Date.now() - this.sessionStartTime;

    const logEntry = {
      timestamp,
      level,
      provider: 'electronhub',
      sessionDuration: `${Math.round(sessionDuration / 1000)}s`,
      requestCount: this.requestCounter,
      message,
      ...metadata
    };

    switch (level) {
      case 'error':
        console.error('🔴 [ElectronHub]', JSON.stringify(logEntry, null, 2));
        break;
      case 'warn':
        console.warn('🟡 [ElectronHub]', JSON.stringify(logEntry, null, 2));
        break;
      case 'debug':
        console.debug('🔍 [ElectronHub]', JSON.stringify(logEntry, null, 2));
        break;
      default:
        console.log('🟢 [ElectronHub]', JSON.stringify(logEntry, null, 2));
    }
  }

  getModelConfig(model) {
    return this.modelConfigs[model] || {
      defaultTemperature: 0.7,
      defaultMaxTokens: 4096,
      defaultTopP: 1.0,
      supportsStreaming: false,
      primaryUse: 'general',
      tier: 'unknown',
      apiEndpoint: 'chat/completions'
    };
  }

  /**
   * Determine API endpoint based on model and task type
   * @param {string} model - Model identifier
   * @param {Object} options - Call options including taskType
   * @returns {string} API endpoint path
   */
  getEndpointForModel(model, options = {}) {
    const modelConfig = this.getModelConfig(model);

    // Check if this is a schema generation task - use responses API for structured output
    if (options.taskType === 'schema-generation' || options.structuredOutput) {
      return 'responses';
    }

    // Use model-specific endpoint from config
    return modelConfig.apiEndpoint;
  }

  /**
   * Check if model uses Anthropic Messages API format
   * @param {string} model - Model identifier
   * @returns {boolean} True if uses Messages API
   */
  usesMessagesAPI(model) {
    return model.startsWith('claude-');
  }

  /**
   * Make an AI call to ElectronHub API with correct endpoint routing
   */
  async chat(model, messages, options = {}) {
    const startTime = Date.now();
    this.requestCounter++;
    const requestId = `req-${this.requestCounter}-${Date.now()}`;

    try {
      const modelConfig = this.getModelConfig(model);
      const endpoint = this.getEndpointForModel(model, options);
      const usesMessages = this.usesMessagesAPI(model);
      const usesResponses = endpoint === 'responses';

      let requestBody;

      if (usesResponses) {
        // Response API format for structured output (schema generation)
        const userMessage = messages.find(m => m.role === 'user');
        const systemMessage = messages.find(m => m.role === 'system');

        requestBody = {
          model,
          input: userMessage?.content || '',
          instructions: systemMessage?.content || 'Generate a structured response.',
          max_output_tokens: options.maxTokens || modelConfig.defaultMaxTokens,
          temperature: options.temperature !== undefined ? options.temperature : modelConfig.defaultTemperature,
          stream: false
        };

        if (options.topP !== undefined) {
          requestBody.top_p = options.topP;
        }

      } else if (usesMessages) {
        // Messages API format for Claude models
        const formattedMessages = this.formatMessages(messages);
        const systemMessage = formattedMessages.find(m => m.role === 'system');
        const nonSystemMessages = formattedMessages.filter(m => m.role !== 'system');

        requestBody = {
          model,
          messages: nonSystemMessages,
          max_tokens: options.maxTokens || modelConfig.defaultMaxTokens,
          temperature: options.temperature !== undefined ? options.temperature : modelConfig.defaultTemperature,
          stream: false
        };

        if (systemMessage) {
          requestBody.system = systemMessage.content;
        }

        if (options.topP !== undefined) {
          requestBody.top_p = options.topP;
        }

      } else {
        // Chat Completions API format for GPT and DeepSeek models
        requestBody = {
          model,
          messages: this.formatMessages(messages),
          temperature: options.temperature !== undefined ? options.temperature : modelConfig.defaultTemperature,
          max_tokens: options.maxTokens || modelConfig.defaultMaxTokens,
          top_p: options.topP !== undefined ? options.topP : modelConfig.defaultTopP,
          stream: false
        };

        // Add thinking parameter for DeepSeek-R1
        if (model.includes('deepseek-r1')) {
          requestBody.thinking = { type: 'enabled', budget_tokens: 1000 };
        }
      }

      if (this.logging.logRequests) {
        this.log('info', 'Making API request', {
          requestId,
          model,
          endpoint: `/${endpoint}`,
          apiFormat: usesResponses ? 'responses' : (usesMessages ? 'messages' : 'chat-completions'),
          messageCount: messages.length,
          taskType: options.taskType,
          modelConfig: {
            tier: modelConfig.tier,
            primaryUse: modelConfig.primaryUse
          }
        });
      }

      const response = await callWithRetry(async () => {
        const url = `${this.baseURL}/${endpoint}`;

        this.log('debug', 'Sending HTTP request to ElectronHub', {
          requestId,
          url,
          method: 'POST',
          timeout: this.timeout
        });

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'ElectronHub-Provider/2.0'
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(this.timeout)
        });

        this.log('debug', 'Received HTTP response', {
          requestId,
          status: res.status,
          statusText: res.statusText
        });

        if (!res.ok) {
          const errorBody = await res.text();
          let errorMessage = `ElectronHub API error: ${res.status} ${res.statusText}`;

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

      const parsed = this.parseResponse(response, model, endpoint);
      const latency = Date.now() - startTime;
      const cost = this.calculateCost(parsed.tokens.input, parsed.tokens.output, model);

      const result = {
        content: parsed.content,
        tokens: parsed.tokens,
        cost,
        provider: this.name,
        model,
        latency,
        cached: false,
        metadata: {
          finishReason: parsed.finishReason,
          requestId,
          apiEndpoint: endpoint,
          apiFormat: usesResponses ? 'responses' : (usesMessages ? 'messages' : 'chat-completions'),
          modelConfig: {
            tier: modelConfig.tier,
            primaryUse: modelConfig.primaryUse
          }
        }
      };

      if (this.logging.logResponses) {
        this.log('info', 'API request completed successfully', {
          requestId,
          latency: `${latency}ms`,
          tokens: parsed.tokens,
          cost: `$${cost.toFixed(6)}`,
          contentLength: parsed.content.length,
          finishReason: parsed.finishReason
        });
      }

      return result;

    } catch (error) {
      const latency = Date.now() - startTime;

      if (this.logging.logErrors) {
        this.log('error', 'API request failed with error', {
          requestId,
          latency: `${latency}ms`,
          errorType: error.constructor.name,
          errorMessage: error.message,
          statusCode: error.statusCode,
          stack: error.stack
        });
      }

      const structuredError = this.handleError(error, { model, latency, requestId });
      structuredError.latency = latency;
      structuredError.requestId = requestId;

      throw structuredError;
    }
  }

  async *stream(model, messages, options = {}) {
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

  formatMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages must be a non-empty array');
    }

    return messages.map(msg => {
      if (!msg.role || !msg.content) {
        throw new Error('Each message must have role and content');
      }

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
   * Parse ElectronHub response based on API endpoint
   * @param {Object} response - ElectronHub API response
   * @param {string} model - Model identifier
   * @param {string} endpoint - API endpoint used
   * @returns {Object} Parsed response with content and tokens
   */
  parseResponse(response, model, endpoint) {
    if (endpoint === 'responses') {
      // Response API format
      const content = response.output || '';
      const usage = response.usage || {};

      return {
        content: content.trim(),
        tokens: {
          input: usage.input_tokens || 0,
          output: usage.output_tokens || this.estimateTokens(content),
          total: usage.total_tokens || 0
        },
        finishReason: response.finish_reason || 'stop'
      };

    } else if (endpoint === 'messages') {
      // Messages API format (Claude)
      const content = response.content?.[0]?.text || '';
      const usage = response.usage || {};

      return {
        content: content.trim(),
        tokens: {
          input: usage.input_tokens || 0,
          output: usage.output_tokens || this.estimateTokens(content),
          total: (usage.input_tokens || 0) + (usage.output_tokens || 0)
        },
        finishReason: response.stop_reason || 'stop'
      };

    } else {
      // Chat Completions API format (GPT, DeepSeek)
      if (!response || !response.choices || response.choices.length === 0) {
        throw new Error('Invalid response from ElectronHub API');
      }

      const choice = response.choices[0];
      const content = choice.message?.content || '';
      const usage = response.usage || {};

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
  }

  isRetryableError(error) {
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

    return super.isRetryableError(error);
  }
}

module.exports = ElectronHubProvider;
