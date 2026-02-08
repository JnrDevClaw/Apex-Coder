/**
 * HuggingFace Provider
 * 
 * Provider implementation for HuggingFace Inference API.
 * Supports OpenHermes-2.5-Mistral-7B and Qwen2-7B-Instruct models.
 * 
 * Requirements: 2.1, 18.1
 */

const BaseProvider = require('./base-provider');
const { callWithRetry } = require('../../utils/retry-handler');

class HuggingFaceProvider extends BaseProvider {
  /**
   * Create HuggingFace provider instance
   * @param {Object} config - Provider configuration
   */
  constructor(config) {
    super(config);

    // Validate HuggingFace-specific requirements
    if (!this.baseURL) {
      this.baseURL = 'https://api-inference.huggingface.co';
    }

    // Model-specific configurations
    this.modelConfigs = {
      'OpenHermes-2.5-Mistral-7B': {
        defaultTemperature: 0.7,
        defaultMaxTokens: 2048,
        defaultTopP: 0.9,
        supportsStreaming: false
      },
      'Qwen/Qwen2-7B-Instruct': {
        defaultTemperature: 0.7,
        defaultMaxTokens: 2048,
        defaultTopP: 0.9,
        supportsStreaming: false
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
      defaultMaxTokens: 2048,
      defaultTopP: 0.9,
      supportsStreaming: false
    };
  }

  /**
   * Make an AI call to HuggingFace Inference API
   * @param {string} model - Model identifier
   * @param {Array} messages - Chat messages in standard format
   * @param {Object} options - Call options
   * @param {number} options.temperature - Sampling temperature (0-1)
   * @param {number} options.maxTokens - Maximum tokens to generate
   * @param {number} options.topP - Nucleus sampling parameter
   * @returns {Promise<Object>} Standardized response
   */
  async chat(model, messages, options = {}) {
    const startTime = Date.now();

    try {
      // Get model-specific configuration
      const modelConfig = this.getModelConfig(model);

      // Format messages for HuggingFace
      const formattedInput = this.formatMessages(messages);

      // Prepare request parameters with model-specific defaults
      const parameters = {
        temperature: options.temperature !== undefined ? options.temperature : modelConfig.defaultTemperature,
        max_new_tokens: options.maxTokens || modelConfig.defaultMaxTokens,
        top_p: options.topP !== undefined ? options.topP : modelConfig.defaultTopP,
        return_full_text: false,
        // Additional HuggingFace-specific parameters
        do_sample: options.temperature !== 0, // Enable sampling if temperature > 0
        repetition_penalty: options.repetitionPenalty || 1.0
      };

      // Make API call with retry logic
      const response = await callWithRetry(async () => {
        const res = await fetch(`${this.baseURL}/models/${model}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            inputs: formattedInput,
            parameters
          }),
          signal: AbortSignal.timeout(this.timeout)
        });

        if (!res.ok) {
          const errorText = await res.text();
          const error = new Error(`HuggingFace API error: ${res.status} ${res.statusText}`);
          error.statusCode = res.status;
          error.response = { status: res.status, data: errorText };
          throw error;
        }

        return res.json();
      }, this.retries, (error) => this.isRetryableError(error));

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
          finishReason: parsed.finishReason || 'stop'
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
   * Stream responses from HuggingFace (not fully supported by Inference API)
   * @param {string} model - Model identifier
   * @param {Array} messages - Chat messages
   * @param {Object} options - Call options
   * @returns {AsyncIterator<Object>} Stream of response chunks
   */
  async *stream(model, messages, options = {}) {
    // HuggingFace Inference API doesn't support streaming for most models
    // Fall back to regular call and yield the complete response
    const response = await this.call(model, messages, options);

    yield {
      content: response.content,
      tokens: response.tokens,
      model,
      provider: this.name,
      done: true
    };
  }

  /**
   * Format messages for HuggingFace Inference API
   * Converts standard chat format to HuggingFace text format
   * @param {Array} messages - Standard message format [{role, content}]
   * @returns {string} Formatted text for HuggingFace
   */
  formatMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages must be a non-empty array');
    }

    // HuggingFace Inference API expects a single text input
    // Format as a conversation with role prefixes
    const formattedMessages = messages.map(msg => {
      const role = msg.role === 'assistant' ? 'Assistant' :
        msg.role === 'system' ? 'System' : 'User';
      return `${role}: ${msg.content}`;
    });

    // Add a prompt for the assistant to respond
    formattedMessages.push('Assistant:');

    return formattedMessages.join('\n\n');
  }

  /**
   * Parse HuggingFace response to standard format
   * @param {Object|Array} response - HuggingFace API response
   * @param {string} model - Model identifier
   * @returns {Object} Parsed response with content and tokens
   */
  parseResponse(response, model) {
    // HuggingFace returns an array of results
    const result = Array.isArray(response) ? response[0] : response;

    if (!result) {
      throw new Error('Invalid response from HuggingFace API');
    }

    // Extract generated text
    let content = '';
    if (result.generated_text !== undefined) {
      content = result.generated_text;
    } else if (typeof result === 'string') {
      content = result;
    } else if (result[0]?.generated_text) {
      content = result[0].generated_text;
    }

    // Estimate tokens (HuggingFace doesn't always return token counts)
    const inputTokens = result.input_tokens || 0;
    const outputTokens = result.output_tokens || this.estimateTokens(content);

    return {
      content: content.trim(),
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens
      },
      finishReason: result.finish_reason || 'stop'
    };
  }
}

module.exports = HuggingFaceProvider;
