/**
 * GitHub Models Provider Tests
 * 
 * Tests for the GitHub Models provider implementation
 */

const GitHubModelsProvider = require('../../services/providers/github-models-provider.js');

describe('GitHubModelsProvider', () => {
  let provider;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      name: 'github-models',
      apiKey: 'test-github-token',
      baseURL: 'https://models.inference.ai.azure.com',
      rateLimit: {
        maxConcurrent: 5,
        minTime: 200,
        reservoir: 100,
        reservoirRefreshAmount: 100,
        reservoirRefreshInterval: 60000
      },
      pricing: {
        'meta/Llama-4-Scout-17B-16E-Instruct': {
          input: 0.0,
          output: 0.0
        }
      },
      timeout: 30000,
      retries: 2
    };
  });

  describe('Constructor', () => {
    it('should create provider instance with valid config', () => {
      provider = new GitHubModelsProvider(mockConfig);
      
      expect(provider).toBeDefined();
      expect(provider.name).toBe('github-models');
      expect(provider.apiKey).toBe('test-github-token');
      expect(provider.baseURL).toBe('https://models.inference.ai.azure.com');
    });

    it('should throw error if API key is missing', () => {
      const invalidConfig = { ...mockConfig, apiKey: null };
      
      expect(() => {
        new GitHubModelsProvider(invalidConfig);
      }).toThrow('GitHub token is required');
    });

    it('should initialize Azure AI Inference client', () => {
      provider = new GitHubModelsProvider(mockConfig);
      
      expect(provider.client).toBeDefined();
    });
  });

  describe('Cost Calculation', () => {
    beforeEach(() => {
      provider = new GitHubModelsProvider(mockConfig);
    });

    it('should calculate cost correctly for Llama 4 Scout (free tier)', () => {
      const cost = provider.calculateCost(1000, 500, 'meta/Llama-4-Scout-17B-16E-Instruct');
      
      expect(cost).toBe(0);
    });

    it('should handle missing pricing gracefully', () => {
      const cost = provider.calculateCost(1000, 500, 'unknown-model');
      
      expect(cost).toBe(0);
    });
  });

  describe('Token Estimation', () => {
    beforeEach(() => {
      provider = new GitHubModelsProvider(mockConfig);
    });

    it('should estimate tokens from text', () => {
      const text = 'This is a test message';
      const tokens = provider.estimateTokens(text);
      
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBe(Math.ceil(text.length / 4));
    });

    it('should handle empty text', () => {
      const tokens = provider.estimateTokens('');
      
      expect(tokens).toBe(0);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      provider = new GitHubModelsProvider(mockConfig);
    });

    it('should check if error is retryable', () => {
      const retryableError = { statusCode: 429 };
      const nonRetryableError = { statusCode: 400 };
      
      expect(provider.isRetryableError(retryableError)).toBe(true);
      expect(provider.isRetryableError(nonRetryableError)).toBe(false);
    });
  });
});
