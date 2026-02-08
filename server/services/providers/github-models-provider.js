/**
 * GitHub Models Provider
 * Uses Azure AI Inference SDK to access GitHub Models
 * Supports: Llama 4 Scout 17B 16E Instruct
 */

const ModelClient = require('@azure-rest/ai-inference').default;
const { AzureKeyCredential } = require('@azure/core-auth');
const { isUnexpected } = require('@azure-rest/ai-inference');
const BaseProvider = require('./base-provider.js');

class GitHubModelsProvider extends BaseProvider {
  constructor(config) {
    // Check for API key before calling parent constructor
    if (!config.apiKey) {
      throw new Error('GitHub token is required for GitHub Models provider');
    }

    super(config);

    // Initialize Azure AI Inference client for GitHub Models
    this.client = ModelClient(
      'https://models.inference.ai.azure.com',
      new AzureKeyCredential(this.apiKey)
    );
  }

  /**
   * Make an AI call using GitHub Models
   * @param {string} model - Model identifier (e.g., 'meta-llama-4-scout-17b-16e-instruct')
   * @param {Array} messages - Chat messages in OpenAI format
   * @param {Object} options - Call options
   * @returns {Promise<Object>} Standardized response
   */
  async chat(model, messages, options = {}) {
    const startTime = Date.now();

    try {
      // Make the API call through rate limiter
      const response = await this.rateLimiter.schedule(async () => {
        const result = await this.client.path('/chat/completions').post({
          body: {
            messages,
            model,
            temperature: options.temperature ?? 0.8,
            top_p: options.topP ?? 0.1,
            max_tokens: options.maxTokens ?? 2048,
            ...(options.stream !== undefined && { stream: options.stream })
          }
        });

        // Check for unexpected response
        if (isUnexpected(result)) {
          const error = new Error(result.body?.error?.message || 'GitHub Models API error');
          error.statusCode = result.status;
          error.provider = this.name;
          throw error;
        }

        return result;
      });

      const latency = Date.now() - startTime;

      // Parse response body
      const body = response.body;

      // Extract content and usage
      const content = body.choices?.[0]?.message?.content || '';
      const usage = body.usage || {};

      const tokens = {
        input: usage.prompt_tokens || 0,
        output: usage.completion_tokens || 0,
        total: usage.total_tokens || 0
      };

      // Calculate cost
      const cost = this.calculateCost(tokens.input, tokens.output, model);

      return {
        content,
        tokens,
        cost,
        provider: this.name,
        model,
        latency,
        cached: false,
        metadata: {
          finishReason: body.choices?.[0]?.finish_reason,
          id: body.id,
          created: body.created
        }
      };
    } catch (error) {
      // Convert to structured error type
      const structuredError = this.handleError(error, { model });
      throw structuredError;
    }
  }

  /**
   * Stream responses from GitHub Models
   * @param {string} model - Model identifier
   * @param {Array} messages - Chat messages
   * @param {Object} options - Call options
   * @returns {AsyncIterator} Stream of response chunks
   */
  async *stream(model, messages, options = {}) {
    const startTime = Date.now();
    let totalTokens = { input: 0, output: 0 };

    try {
      // Make streaming call through rate limiter
      const stream = await this.rateLimiter.schedule(async () => {
        const result = await this.client.path('/chat/completions').post({
          body: {
            messages,
            model,
            temperature: options.temperature ?? 0.8,
            top_p: options.topP ?? 0.1,
            max_tokens: options.maxTokens ?? 2048,
            stream: true
          }
        });

        if (isUnexpected(result)) {
          const error = new Error(result.body?.error?.message || 'GitHub Models API error');
          error.statusCode = result.status;
          error.provider = this.name;
          throw error;
        }

        return result.body;
      });

      // Process stream chunks
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content || '';

        if (delta) {
          // Estimate output tokens incrementally
          totalTokens.output += this.estimateTokens(delta);

          yield {
            content: delta,
            tokens: { ...totalTokens, total: totalTokens.input + totalTokens.output },
            model,
            provider: this.name,
            done: false
          };
        }

        // Check if stream is complete
        if (chunk.choices?.[0]?.finish_reason) {
          const latency = Date.now() - startTime;
          const cost = this.calculateCost(totalTokens.input, totalTokens.output, model);

          yield {
            content: '',
            tokens: { ...totalTokens, total: totalTokens.input + totalTokens.output },
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
      // Enhance error with provider context
      if (!error.provider) {
        error.provider = this.name;
      }
      // Convert to structured error type
      const structuredError = this.handleError(error, { model });
      throw structuredError;
    }
  }

  /**
   * Estimate token count from text (rough approximation)
   * @param {string} text - Text to estimate
   * @returns {number} Estimated token count
   */
  estimateTokens(text) {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}

module.exports = GitHubModelsProvider;
