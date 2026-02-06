/**
 * Tests for Zukijourney Provider
 */

const ZukijourneyProvider = require('../../services/providers/zukijourney-provider.js');

describe('ZukijourneyProvider', () => {
  let provider;
  const mockConfig = {
    name: 'zukijourney',
    apiKey: 'test-api-key',
    baseURL: 'https://api.zukijourney.com/v1',
    rateLimit: {
      maxConcurrent: 5,
      minTime: 200
    },
    pricing: {
      'gpt-5-mini': {
        input: 0.15,
        output: 0.60
      },
      'gpt-4o': {
        input: 2.50,
        output: 10.00
      }
    },
    timeout: 30000,
    retries: 2
  };

  beforeEach(() => {
    provider = new ZukijourneyProvider(mockConfig);
  });

  describe('Constructor', () => {
    it('should create provider instance with correct configuration', () => {
      expect(provider.name).toBe('zukijourney');
      expect(provider.apiKey).toBe('test-api-key');
      expect(provider.baseURL).toBe('https://api.zukijourney.com/v1');
      expect(provider.timeout).toBe(30000);
      expect(provider.retries).toBe(2);
    });

    it('should initialize OpenAI client', () => {
      expect(provider.client).toBeDefined();
    });

    it('should have model configurations', () => {
      expect(provider.modelConfigs['gpt-5-mini']).toBeDefined();
      expect(provider.modelConfigs['gpt-4o']).toBeDefined();
    });

    it('should throw error if no API key provided', () => {
      const invalidConfig = { ...mockConfig, apiKey: null };
      expect(() => new ZukijourneyProvider(invalidConfig)).toThrow('API key is required');
    });
  });

  describe('getModelConfig', () => {
    it('should return config for gpt-5-mini', () => {
      const config = provider.getModelConfig('gpt-5-mini');
      expect(config.defaultTemperature).toBe(0.7);
      expect(config.defaultMaxTokens).toBe(4096);
      expect(config.supportsStreaming).toBe(true);
    });

    it('should return config for gpt-4o', () => {
      const config = provider.getModelConfig('gpt-4o');
      expect(config.defaultTemperature).toBe(0.7);
      expect(config.defaultMaxTokens).toBe(4096);
      expect(config.supportsStreaming).toBe(true);
    });

    it('should return default config for unknown model', () => {
      const config = provider.getModelConfig('unknown-model');
      expect(config.defaultTemperature).toBe(0.7);
      expect(config.supportsStreaming).toBe(true);
    });
  });

  describe('formatMessages', () => {
    it('should format messages correctly', () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' }
      ];

      const formatted = provider.formatMessages(messages);
      expect(formatted).toEqual(messages);
      expect(formatted).toHaveLength(2);
    });

    it('should throw error for empty messages array', () => {
      expect(() => provider.formatMessages([])).toThrow('Messages must be a non-empty array');
    });

    it('should throw error for invalid message format', () => {
      const invalidMessages = [{ content: 'Hello' }]; // missing role
      expect(() => provider.formatMessages(invalidMessages)).toThrow('Each message must have role and content');
    });

    it('should throw error for invalid role', () => {
      const invalidMessages = [{ role: 'invalid', content: 'Hello' }];
      expect(() => provider.formatMessages(invalidMessages)).toThrow('Invalid message role');
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost for gpt-5-mini correctly', () => {
      const cost = provider.calculateCost(1000, 500, 'gpt-5-mini');
      // (1000 * 0.15 + 500 * 0.60) / 1000000 = 0.00045
      expect(cost).toBeCloseTo(0.00045, 6);
    });

    it('should calculate cost for gpt-4o correctly', () => {
      const cost = provider.calculateCost(1000, 500, 'gpt-4o');
      // (1000 * 2.50 + 500 * 10.00) / 1000000 = 0.00750
      expect(cost).toBeCloseTo(0.00750, 6);
    });

    it('should return 0 for unknown model with no pricing', () => {
      const providerNoPricing = new ZukijourneyProvider({
        ...mockConfig,
        pricing: {}
      });
      const cost = providerNoPricing.calculateCost(1000, 500, 'unknown-model');
      expect(cost).toBe(0);
    });
  });

  describe('parseResponse', () => {
    it('should parse valid response correctly', () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Hello! How can I help you?'
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18
        }
      };

      const parsed = provider.parseResponse(mockResponse, 'gpt-5-mini');
      expect(parsed.content).toBe('Hello! How can I help you?');
      expect(parsed.tokens.input).toBe(10);
      expect(parsed.tokens.output).toBe(8);
      expect(parsed.tokens.total).toBe(18);
      expect(parsed.finishReason).toBe('stop');
    });

    it('should handle response without usage data', () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Test response'
            },
            finish_reason: 'stop'
          }
        ]
      };

      const parsed = provider.parseResponse(mockResponse, 'gpt-5-mini');
      expect(parsed.content).toBe('Test response');
      expect(parsed.tokens.input).toBe(0); // no usage data, defaults to 0
      expect(parsed.tokens.output).toBeGreaterThan(0); // estimated from content
    });

    it('should throw error for invalid response', () => {
      const invalidResponse = { choices: [] };
      expect(() => provider.parseResponse(invalidResponse, 'gpt-5-mini')).toThrow('Invalid response from Zukijourney API');
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable error types', () => {
      const retryableErrors = [
        { type: 'server_error' },
        { type: 'timeout' },
        { type: 'rate_limit_exceeded' },
        { type: 'api_connection_error' }
      ];

      retryableErrors.forEach(error => {
        expect(provider.isRetryableError(error)).toBe(true);
      });
    });

    it('should identify non-retryable error types', () => {
      const nonRetryableErrors = [
        { type: 'invalid_request_error' },
        { type: 'authentication_error' }
      ];

      nonRetryableErrors.forEach(error => {
        expect(provider.isRetryableError(error)).toBe(false);
      });
    });

    it('should fall back to base class logic for status codes', () => {
      expect(provider.isRetryableError({ statusCode: 429 })).toBe(true);
      expect(provider.isRetryableError({ statusCode: 500 })).toBe(true);
      expect(provider.isRetryableError({ statusCode: 400 })).toBe(false);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens from text', () => {
      const text = 'This is a test message';
      const tokens = provider.estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBe(Math.ceil(text.length / 4));
    });

    it('should return 0 for empty text', () => {
      expect(provider.estimateTokens('')).toBe(0);
      expect(provider.estimateTokens(null)).toBe(0);
    });
  });
});
