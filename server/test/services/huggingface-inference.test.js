const { describe, it, expect, beforeEach } = require('@jest/globals');

// Mock structured logger
jest.mock('../../services/structured-logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

const HuggingFaceInference = require('../../services/providers/huggingface-inference');

// Mock fetch globally
global.fetch = jest.fn();

describe('HuggingFaceInference', () => {
  let hfInference;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HUGGINGFACE_API_KEY = 'test-api-key';
    hfInference = new HuggingFaceInference();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with API key from environment', () => {
      expect(hfInference.apiKey).toBe('test-api-key');
      expect(hfInference.isAvailable()).toBe(true);
    });

    it('should have correct base URL', () => {
      expect(hfInference.baseUrl).toBe('https://api-inference.huggingface.co/models');
    });

    it('should initialize with model configurations', () => {
      expect(hfInference.models).toBeDefined();
      expect(Object.keys(hfInference.models).length).toBeGreaterThan(0);
    });

    it('should have role mapping configured', () => {
      expect(hfInference.roleMapping).toBeDefined();
      expect(hfInference.roleMapping['guidance-generation']).toBeDefined();
      expect(hfInference.roleMapping['technical-inference']).toBeDefined();
    });
  });

  describe('isAvailable', () => {
    it('should return true when API key is configured', () => {
      expect(hfInference.isAvailable()).toBe(true);
    });

    it('should return false when API key is not configured', () => {
      delete process.env.HUGGINGFACE_API_KEY;
      const hf = new HuggingFaceInference();
      expect(hf.isAvailable()).toBe(false);
    });
  });

  describe('getModelByRole', () => {
    it('should return model for valid role', () => {
      const model = hfInference.getModelByRole('guidance-generation');
      expect(model).toBeDefined();
      expect(model.role).toBe('instruction-following');
    });

    it('should return null for invalid role', () => {
      const model = hfInference.getModelByRole('invalid-role');
      expect(model).toBeNull();
    });
  });

  describe('generateText', () => {
    it('should generate text successfully', async () => {
      const mockResponse = {
        ok: true,
        json: async () => [{
          generated_text: 'Test prompt\nGenerated response text'
        }]
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await hfInference.generateText(
        'google/flan-t5-large',
        'Test prompt',
        { maxTokens: 100 }
      );

      expect(result).toBeDefined();
      expect(result.text).toBe('Generated response text');
      expect(result.model).toBe('google/flan-t5-large');
      expect(result.role).toBe('instruction-following');
    });

    it('should handle array response format', async () => {
      const mockResponse = {
        ok: true,
        json: async () => [{
          generated_text: 'Response text'
        }]
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await hfInference.generateText(
        'google/flan-t5-large',
        'Test prompt'
      );

      expect(result.text).toBe('Response text');
    });

    it('should handle object response format', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          generated_text: 'Response text'
        })
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await hfInference.generateText(
        'google/flan-t5-large',
        'Test prompt'
      );

      expect(result.text).toBe('Response text');
    });

    it('should throw error when API key is not configured', async () => {
      delete process.env.HUGGINGFACE_API_KEY;
      const hf = new HuggingFaceInference();

      await expect(
        hf.generateText('google/flan-t5-large', 'Test prompt')
      ).rejects.toThrow('Hugging Face API key not configured');
    });

    it('should throw error for invalid model', async () => {
      await expect(
        hfInference.generateText('invalid-model', 'Test prompt')
      ).rejects.toThrow('Model invalid-model not configured');
    });

    it('should handle API errors', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      };
      global.fetch.mockResolvedValue(mockResponse);

      await expect(
        hfInference.generateText('google/flan-t5-large', 'Test prompt')
      ).rejects.toThrow('Hugging Face API error: 500');
    });

    it('should use custom options', async () => {
      const mockResponse = {
        ok: true,
        json: async () => [{ generated_text: 'Response' }]
      };
      global.fetch.mockResolvedValue(mockResponse);

      await hfInference.generateText(
        'google/flan-t5-large',
        'Test prompt',
        {
          maxTokens: 200,
          temperature: 0.5,
          topP: 0.95,
          repetitionPenalty: 1.2
        }
      );

      const fetchCall = global.fetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      
      expect(requestBody.parameters.max_new_tokens).toBe(200);
      expect(requestBody.parameters.temperature).toBe(0.5);
      expect(requestBody.parameters.top_p).toBe(0.95);
      expect(requestBody.parameters.repetition_penalty).toBe(1.2);
    });
  });

  describe('generateEmbeddings', () => {
    it('should generate embeddings successfully', async () => {
      const mockEmbeddings = [[0.1, 0.2, 0.3, 0.4]];
      const mockResponse = {
        ok: true,
        json: async () => mockEmbeddings
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await hfInference.generateEmbeddings('Test text');

      expect(result).toBeDefined();
      expect(result.embeddings).toEqual(mockEmbeddings);
      expect(result.model).toBe('sentence-transformers/all-MiniLM-L6-v2');
      expect(result.text_length).toBe(9);
    });

    it('should throw error when API key is not configured', async () => {
      delete process.env.HUGGINGFACE_API_KEY;
      const hf = new HuggingFaceInference();

      await expect(
        hf.generateEmbeddings('Test text')
      ).rejects.toThrow('Hugging Face API key not configured');
    });

    it('should handle API errors', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        text: async () => 'Bad Request'
      };
      global.fetch.mockResolvedValue(mockResponse);

      await expect(
        hfInference.generateEmbeddings('Test text')
      ).rejects.toThrow('Hugging Face embedding error: 400');
    });
  });

  describe('classifyText', () => {
    it('should classify text successfully', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          labels: ['positive', 'negative', 'neutral'],
          scores: [0.8, 0.15, 0.05],
          sequence: 'Test text'
        })
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await hfInference.classifyText(
        'Test text',
        ['positive', 'negative', 'neutral']
      );

      expect(result).toBeDefined();
      expect(result.labels).toEqual(['positive', 'negative', 'neutral']);
      expect(result.scores).toEqual([0.8, 0.15, 0.05]);
      expect(result.model).toBe('facebook/bart-large-mnli');
    });

    it('should throw error when API key is not configured', async () => {
      delete process.env.HUGGINGFACE_API_KEY;
      const hf = new HuggingFaceInference();

      await expect(
        hf.classifyText('Test text', ['label1', 'label2'])
      ).rejects.toThrow('Hugging Face API key not configured');
    });
  });

  describe('analyzeSentiment', () => {
    it('should analyze sentiment successfully', async () => {
      const mockResponse = {
        ok: true,
        json: async () => [{
          label: 'POSITIVE',
          score: 0.95
        }]
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await hfInference.analyzeSentiment('Great product!');

      expect(result).toBeDefined();
      expect(result.sentiment).toBe('POSITIVE');
      expect(result.confidence).toBe(0.95);
      expect(result.model).toBe('distilbert-base-uncased-finetuned-sst-2-english');
    });

    it('should handle unknown sentiment', async () => {
      const mockResponse = {
        ok: true,
        json: async () => []
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await hfInference.analyzeSentiment('Test text');

      expect(result.sentiment).toBe('UNKNOWN');
      expect(result.confidence).toBe(0);
    });
  });

  describe('generateCode', () => {
    it('should generate code successfully', async () => {
      const mockResponse = {
        ok: true,
        json: async () => [{
          generated_text: 'Generate javascript code for the following requirement:\n\nCreate a function\n\nCode:\nfunction test() { return true; }'
        }]
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await hfInference.generateCode(
        'Create a function',
        'javascript'
      );

      expect(result).toBeDefined();
      expect(result.code).toContain('function test()');
      expect(result.language).toBe('javascript');
    });

    it('should use default language', async () => {
      const mockResponse = {
        ok: true,
        json: async () => [{
          generated_text: 'Code response'
        }]
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await hfInference.generateCode('Create a function');

      expect(result.language).toBe('javascript');
    });
  });

  describe('analyzeCode', () => {
    it('should analyze code successfully', async () => {
      const mockResponse = {
        ok: true,
        json: async () => [{
          generated_text: 'Analysis: Code looks good'
        }]
      };
      global.fetch.mockResolvedValue(mockResponse);

      const code = 'function test() { return true; }';
      const result = await hfInference.analyzeCode(code, 'javascript');

      expect(result).toBeDefined();
      expect(result.analysis).toContain('Code looks good');
      expect(result.language).toBe('javascript');
      expect(result.original_code).toBe(code);
    });
  });

  describe('generateConversation', () => {
    it('should generate conversation successfully', async () => {
      const mockResponse = {
        ok: true,
        json: async () => [{
          generated_text: 'User: Hello\n\nAssistant: Hi there!'
        }]
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await hfInference.generateConversation('Hello');

      expect(result).toBeDefined();
      expect(result.response).toContain('Hi there!');
      expect(result.original_message).toBe('Hello');
    });

    it('should handle conversation with context', async () => {
      const mockResponse = {
        ok: true,
        json: async () => [{
          generated_text: 'Response with context'
        }]
      };
      global.fetch.mockResolvedValue(mockResponse);

      const result = await hfInference.generateConversation(
        'Follow-up question',
        'Previous context'
      );

      expect(result.context).toBe('Previous context');
    });
  });

  describe('getAvailableModels', () => {
    it('should return list of available models', () => {
      const models = hfInference.getAvailableModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
      expect(models[0]).toHaveProperty('name');
      expect(models[0]).toHaveProperty('role');
      expect(models[0]).toHaveProperty('capabilities');
    });
  });

  describe('getModelsByCapability', () => {
    it('should return models with specific capability', () => {
      const models = hfInference.getModelsByCapability('code-generation');

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
      expect(models[0].capabilities).toContain('code-generation');
    });

    it('should return empty array for non-existent capability', () => {
      const models = hfInference.getModelsByCapability('non-existent');

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBe(0);
    });
  });

  describe('healthCheck', () => {
    it('should return unavailable when API key is not configured', async () => {
      delete process.env.HUGGINGFACE_API_KEY;
      const hf = new HuggingFaceInference();

      const health = await hf.healthCheck();

      expect(health.status).toBe('unavailable');
      expect(health.reason).toBe('API key not configured');
      expect(health.models_available).toBe(0);
    });

    it('should return healthy when API is accessible', async () => {
      const mockResponse = {
        ok: true,
        status: 200
      };
      global.fetch.mockResolvedValue(mockResponse);

      const health = await hfInference.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.api_accessible).toBe(true);
      expect(health.models_available).toBeGreaterThan(0);
    });

    it('should return degraded when API returns error', async () => {
      const mockResponse = {
        ok: false,
        status: 503
      };
      global.fetch.mockResolvedValue(mockResponse);

      const health = await hfInference.healthCheck();

      expect(health.status).toBe('degraded');
      expect(health.response_status).toBe(503);
    });

    it('should return error when fetch fails', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      const health = await hfInference.healthCheck();

      expect(health.status).toBe('error');
      expect(health.reason).toBe('Network error');
    });
  });

  describe('Model Configurations', () => {
    it('should have code generation models', () => {
      expect(hfInference.models['codellama/CodeLlama-7b-Instruct-hf']).toBeDefined();
      expect(hfInference.models['microsoft/CodeBERT-base']).toBeDefined();
    });

    it('should have conversational models', () => {
      expect(hfInference.models['microsoft/DialoGPT-medium']).toBeDefined();
      expect(hfInference.models['facebook/blenderbot-400M-distill']).toBeDefined();
    });

    it('should have specialized models', () => {
      expect(hfInference.models['sentence-transformers/all-MiniLM-L6-v2']).toBeDefined();
      expect(hfInference.models['facebook/bart-large-mnli']).toBeDefined();
      expect(hfInference.models['distilbert-base-uncased-finetuned-sst-2-english']).toBeDefined();
    });

    it('should have proper model configurations', () => {
      const model = hfInference.models['google/flan-t5-large'];
      
      expect(model.role).toBeDefined();
      expect(model.capabilities).toBeDefined();
      expect(Array.isArray(model.capabilities)).toBe(true);
      expect(model.maxTokens).toBeDefined();
      expect(model.temperature).toBeDefined();
      expect(model.description).toBeDefined();
    });
  });
});
