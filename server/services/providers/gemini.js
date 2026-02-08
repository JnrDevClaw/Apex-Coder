/**
 * Gemini LLM Provider
 * Provides access to Google's Gemini models for code generation
 * 
 * Requirements: 2.6, 12.1, 18.3
 */

const BaseProvider = require('./base-provider');

class GeminiProvider extends BaseProvider {
  constructor(config = {}) {
    super({
      name: config.name || 'gemini',
      apiKey: config.apiKey || process.env.GEMINI_API_KEY,
      baseURL: config.baseURL || 'https://generativelanguage.googleapis.com/v1beta',
      rateLimit: config.rateLimit || {
        maxConcurrent: 10,
        minTime: 100,
        reservoir: 200,
        reservoirRefreshAmount: 200,
        reservoirRefreshInterval: 60000
      },
      pricing: config.pricing || {
        'gemini-3-pro': {
          input: 0.075,     // per 1M tokens
          output: 0.30      // per 1M tokens
        },
        'gemini-1.5-pro': {
          input: 0.00125,   // per 1M tokens
          output: 0.005     // per 1M tokens
        },
        'gemini-1.5-flash': {
          input: 0.000075,  // per 1M tokens
          output: 0.0003    // per 1M tokens
        },
        default: {
          input: 0.075,
          output: 0.30
        }
      },
      timeout: config.timeout || 30000,
      retries: config.retries || 2
    });

    // Safety settings configuration
    this.safetySettings = config.safetySettings || [
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_NONE'
      },
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_NONE'
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_NONE'
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_NONE'
      }
    ];

    // Generation config defaults
    this.generationConfig = config.generationConfig || {
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192
    };
  }

  /**
   * Make API call to Gemini
   * @param {string} model - Model identifier (e.g., 'gemini-3-pro', 'gemini-1.5-pro')
   * @param {Array} messages - Chat messages in standard format
   * @param {Object} options - Provider-specific options
   * @returns {Promise<Object>} Standardized response
   */
  async chat(model, messages, options = {}) {
    const startTime = Date.now();

    try {
      // Format messages for Gemini API
      const contents = this.formatMessages(messages);

      // Build generation config
      const generationConfig = {
        temperature: options.temperature !== undefined ? options.temperature : this.generationConfig.temperature,
        topP: options.topP !== undefined ? options.topP : this.generationConfig.topP,
        topK: options.topK !== undefined ? options.topK : this.generationConfig.topK,
        maxOutputTokens: options.maxTokens !== undefined ? options.maxTokens : this.generationConfig.maxOutputTokens
      };

      // Build safety settings (allow override)
      const safetySettings = options.safetySettings || this.safetySettings;

      // Gemini uses a different endpoint structure
      const endpoint = `${this.baseURL}/models/${model}:generateContent`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey
        },
        body: JSON.stringify({
          contents,
          generationConfig,
          safetySettings
        }),
        signal: options.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(`Gemini API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
        error.statusCode = response.status;
        throw error;
      }

      const data = await response.json();
      const latency = Date.now() - startTime;

      // Extract content from Gemini response structure
      const content = this.extractContent(data);

      // Calculate tokens and cost
      const usage = data.usageMetadata || {};
      const inputTokens = usage.promptTokenCount || 0;
      const outputTokens = usage.candidatesTokenCount || 0;
      const totalTokens = usage.totalTokenCount || (inputTokens + outputTokens);
      const cost = this.calculateCost(inputTokens, outputTokens, model);

      return {
        content,
        tokens: {
          input: inputTokens,
          output: outputTokens,
          total: totalTokens
        },
        cost,
        provider: this.name,
        model,
        latency,
        cached: false,
        metadata: {
          finishReason: data.candidates?.[0]?.finishReason,
          safetyRatings: data.candidates?.[0]?.safetyRatings,
          usage
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
   * Stream responses from Gemini
   * @param {string} model - Model identifier
   * @param {Array} messages - Chat messages in standard format
   * @param {Object} options - Provider-specific options
   * @returns {AsyncIterator<Object>} Stream of response chunks
   */
  async *stream(model, messages, options = {}) {
    const startTime = Date.now();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
      // Format messages for Gemini API
      const contents = this.formatMessages(messages);

      // Build generation config
      const generationConfig = {
        temperature: options.temperature !== undefined ? options.temperature : this.generationConfig.temperature,
        topP: options.topP !== undefined ? options.topP : this.generationConfig.topP,
        topK: options.topK !== undefined ? options.topK : this.generationConfig.topK,
        maxOutputTokens: options.maxTokens !== undefined ? options.maxTokens : this.generationConfig.maxOutputTokens
      };

      // Build safety settings
      const safetySettings = options.safetySettings || this.safetySettings;

      // Gemini streaming endpoint
      const endpoint = `${this.baseURL}/models/${model}:streamGenerateContent`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey
        },
        body: JSON.stringify({
          contents,
          generationConfig,
          safetySettings
        }),
        signal: options.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(`Gemini API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
        error.statusCode = response.status;
        throw error;
      }

      // Parse streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split by newlines to process complete JSON objects
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line);

            // Extract content from chunk
            const content = this.extractContent(data);

            if (content) {
              // Update token counts
              const usage = data.usageMetadata || {};
              if (usage.promptTokenCount) totalInputTokens = usage.promptTokenCount;
              if (usage.candidatesTokenCount) totalOutputTokens = usage.candidatesTokenCount;

              yield {
                content,
                tokens: {
                  input: totalInputTokens,
                  output: totalOutputTokens,
                  total: totalInputTokens + totalOutputTokens
                },
                model,
                provider: this.name,
                done: false
              };
            }
          } catch (parseError) {
            // Skip invalid JSON lines
            console.warn('Failed to parse streaming chunk:', parseError.message);
          }
        }
      }

      // Final chunk with complete metadata
      const latency = Date.now() - startTime;
      const cost = this.calculateCost(totalInputTokens, totalOutputTokens, model);

      yield {
        content: '',
        tokens: {
          input: totalInputTokens,
          output: totalOutputTokens,
          total: totalInputTokens + totalOutputTokens
        },
        cost,
        provider: this.name,
        model,
        latency,
        done: true
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
   * Extract content from Gemini response structure
   * @param {Object} data - Response data from Gemini API
   * @returns {string}
   */
  extractContent(data) {
    if (!data.candidates || data.candidates.length === 0) {
      return '';
    }

    const candidate = data.candidates[0];
    if (!candidate.content || !candidate.content.parts) {
      return '';
    }

    // Concatenate all text parts
    return candidate.content.parts
      .filter(part => part.text)
      .map(part => part.text)
      .join('');
  }

  /**
   * Format messages for Gemini API
   * @param {Array} messages - Standard message format [{role, content}]
   * @returns {Array} Gemini-specific message format
   */
  formatMessages(messages) {
    const contents = [];
    let systemPrompt = '';

    for (const message of messages) {
      // Extract system message separately (Gemini handles it differently)
      if (message.role === 'system') {
        systemPrompt = message.content;
        continue;
      }

      // Map roles: 'assistant' -> 'model', 'user' -> 'user'
      const geminiRole = message.role === 'assistant' ? 'model' : 'user';

      contents.push({
        role: geminiRole,
        parts: [{ text: message.content }]
      });
    }

    // If we have a system prompt, prepend it to the first user message
    if (systemPrompt && contents.length > 0 && contents[0].role === 'user') {
      contents[0].parts[0].text = `${systemPrompt}\n\n${contents[0].parts[0].text}`;
    }

    return contents;
  }

  /**
   * Update safety settings
   * @param {Array} safetySettings - New safety settings
   */
  setSafetySettings(safetySettings) {
    this.safetySettings = safetySettings;
  }

  /**
   * Get current safety settings
   * @returns {Array} Current safety settings
   */
  getSafetySettings() {
    return [...this.safetySettings];
  }

  /**
   * Create safety settings with specific threshold
   * @param {string} threshold - Threshold level ('BLOCK_NONE', 'BLOCK_ONLY_HIGH', 'BLOCK_MEDIUM_AND_ABOVE', 'BLOCK_LOW_AND_ABOVE')
   * @returns {Array} Safety settings array
   */
  createSafetySettings(threshold = 'BLOCK_NONE') {
    const categories = [
      'HARM_CATEGORY_HARASSMENT',
      'HARM_CATEGORY_HATE_SPEECH',
      'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      'HARM_CATEGORY_DANGEROUS_CONTENT'
    ];

    return categories.map(category => ({
      category,
      threshold
    }));
  }

  /**
   * Update generation config
   * @param {Object} config - New generation config
   */
  setGenerationConfig(config) {
    this.generationConfig = {
      ...this.generationConfig,
      ...config
    };
  }

  /**
   * Get current generation config
   * @returns {Object} Current generation config
   */
  getGenerationConfig() {
    return { ...this.generationConfig };
  }

  /**
   * Create generation config for specific use case
   * @param {string} useCase - Use case ('creative', 'precise', 'balanced', 'code')
   * @returns {Object} Generation config
   */
  createGenerationConfig(useCase = 'balanced') {
    const configs = {
      creative: {
        temperature: 1.0,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192
      },
      precise: {
        temperature: 0.1,
        topP: 0.8,
        topK: 10,
        maxOutputTokens: 8192
      },
      balanced: {
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192
      },
      code: {
        temperature: 0.2,
        topP: 0.9,
        topK: 20,
        maxOutputTokens: 8192
      }
    };

    return configs[useCase] || configs.balanced;
  }

  /**
   * Health check for Gemini API
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      const response = await this.call('gemini-1.5-flash', [
        { role: 'user', content: 'Hello' }
      ], {
        maxTokens: 10
      });
      return !!response.content;
    } catch (error) {
      console.error('Gemini health check failed:', error);
      return false;
    }
  }

  /**
   * Get available models from Gemini
   * @returns {Promise<Array>}
   */
  async getAvailableModels() {
    try {
      const response = await fetch(`${this.baseURL}/models`, {
        headers: {
          'x-goog-api-key': this.apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = await response.json();
      return data.models || [];
    } catch (error) {
      console.error('Failed to get Gemini models:', error);
      return [];
    }
  }
}

module.exports = GeminiProvider;
