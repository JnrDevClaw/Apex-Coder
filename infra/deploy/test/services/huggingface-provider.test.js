const { describe, it, expect, beforeEach } = require('@jest/globals');
const HuggingFaceProvider = require('../../services/providers/huggingface');

// Mock the HuggingFaceInference class
jest.mock('../../services/providers/huggingface-inference');
const HuggingFaceInference = require('../../services/providers/huggingface-inference');

describe('HuggingFaceProvider', () => {
  let provider;
  let mockInference;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock inference
    mockInference = {
      isAvailable: jest.fn().mockReturnValue(true),
      generateText: jest.fn(),
      analyzeCode: jest.fn(),
      generateConversation: jest.fn(),
      classifyText: jest.fn(),
      analyzeSentiment: jest.fn(),
      healthCheck: jest.fn(),
      getAvailableModels: jest.fn().mockReturnValue([])
    };
    
    HuggingFaceInference.mockImplementation(() => mockInference);
    
    provider = new HuggingFaceProvider();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with correct name', () => {
      expect(provider.name).toBe('huggingface');
    });

    it('should initialize inference instance', () => {
      expect(provider.inference).toBeDefined();
    });

    it('should check availability from inference', () => {
      expect(provider.isAvailable).toBe(true);
    });

    it('should have role models configured', () => {
      expect(provider.roleModels).toBeDefined();
      expect(provider.roleModels['guidance-generation']).toBeDefined();
      expect(provider.roleModels['technical-inference']).toBeDefined();
    });
  });

  describe('generateGuidance', () => {
    it('should generate guidance successfully', async () => {
      const mockResponse = {
        text: 'Project guidance text',
        model: 'google/flan-t5-large'
      };
      mockInference.generateText.mockResolvedValue(mockResponse);

      const questionnaireData = {
        project_overview: {
          app_name: 'Test App',
          niche: 'e-commerce',
          complexity_level: 7
        }
      };

      const result = await provider.generateGuidance(
        questionnaireData,
        'developer'
      );

      expect(result.success).toBe(true);
      expect(result.guidance).toBeDefined();
      expect(result.metadata.provider).toBe('huggingface');
      expect(result.metadata.user_mode).toBe('developer');
    });

    it('should handle non-developer mode', async () => {
      const mockResponse = {
        text: 'Simple guidance for non-developers',
        model: 'google/flan-t5-large'
      };
      mockInference.generateText.mockResolvedValue(mockResponse);

      const questionnaireData = {
        project_overview: {
          app_name: 'Simple App',
          complexity_level: 3
        }
      };

      const result = await provider.generateGuidance(
        questionnaireData,
        'non-developer'
      );

      expect(result.success).toBe(true);
      expect(result.metadata.user_mode).toBe('non-developer');
    });

    it('should throw error when API is not available', async () => {
      mockInference.isAvailable.mockReturnValue(false);
      provider.isAvailable = false;

      const questionnaireData = {
        project_overview: { app_name: 'Test' }
      };

      await expect(
        provider.generateGuidance(questionnaireData, 'developer')
      ).rejects.toThrow('Hugging Face API not available');
    });

    it('should use custom options', async () => {
      mockInference.generateText.mockResolvedValue({
        text: 'Guidance',
        model: 'test-model'
      });

      const questionnaireData = {
        project_overview: { app_name: 'Test' }
      };

      await provider.generateGuidance(
        questionnaireData,
        'developer',
        { maxTokens: 1024, temperature: 0.5 }
      );

      expect(mockInference.generateText).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          maxTokens: 1024,
          temperature: 0.5
        })
      );
    });
  });

  describe('inferTechnicalStack', () => {
    it('should infer technical stack successfully', async () => {
      const mockResponse = {
        text: 'Recommend Svelte for frontend, Fastify for backend, PostgreSQL for database',
        model: 'codellama/CodeLlama-7b-Instruct-hf'
      };
      mockInference.generateText.mockResolvedValue(mockResponse);

      const projectData = {
        project_overview: {
          app_name: 'Test App',
          niche: 'dashboard',
          complexity_level: 6
        }
      };

      const result = await provider.inferTechnicalStack(projectData);

      expect(result.success).toBe(true);
      expect(result.recommendedStack).toBeDefined();
      expect(result.recommendedStack.frontend_framework).toBeDefined();
      expect(result.recommendedStack.backend_framework).toBeDefined();
      expect(result.recommendedStack.database_engine).toBeDefined();
      expect(result.confidence).toBeDefined();
    });

    it('should parse technical stack from response', async () => {
      const mockResponse = {
        text: 'I recommend using Svelte for the frontend with Fastify backend and MongoDB database',
        model: 'test-model'
      };
      mockInference.generateText.mockResolvedValue(mockResponse);

      const projectData = {
        project_overview: { app_name: 'Test' }
      };

      const result = await provider.inferTechnicalStack(projectData);

      expect(result.recommendedStack.frontend_framework).toBe('svelte');
      expect(result.recommendedStack.backend_framework).toContain('fastify');
      expect(result.recommendedStack.database_engine).toBe('mongodb');
    });

    it('should throw error when API is not available', async () => {
      mockInference.isAvailable.mockReturnValue(false);
      provider.isAvailable = false;

      await expect(
        provider.inferTechnicalStack({})
      ).rejects.toThrow('Hugging Face API not available');
    });
  });

  describe('analyzeCode', () => {
    it('should analyze code successfully', async () => {
      const mockResponse = {
        analysis: 'Code analysis results',
        model: 'microsoft/CodeBERT-base',
        text: 'Detailed analysis'
      };
      mockInference.analyzeCode.mockResolvedValue(mockResponse);

      const code = 'function test() { return true; }';
      const result = await provider.analyzeCode(code, 'javascript');

      expect(result.success).toBe(true);
      expect(result.analysis).toBeDefined();
      expect(result.suggestions).toBeDefined();
      expect(result.metadata.language).toBe('javascript');
    });

    it('should use default language', async () => {
      mockInference.analyzeCode.mockResolvedValue({
        analysis: 'Analysis',
        model: 'test-model',
        text: 'Analysis text'
      });

      const code = 'const x = 1;';
      await provider.analyzeCode(code);

      expect(mockInference.analyzeCode).toHaveBeenCalledWith(
        code,
        'javascript',
        expect.any(Object)
      );
    });
  });

  describe('generateConversation', () => {
    it('should generate conversation successfully', async () => {
      const mockResponse = {
        response: 'Hello! How can I help you?',
        model: 'facebook/blenderbot-400M-distill'
      };
      mockInference.generateConversation.mockResolvedValue(mockResponse);

      const result = await provider.generateConversation('Hello');

      expect(result.success).toBe(true);
      expect(result.response).toBe('Hello! How can I help you?');
      expect(result.metadata.provider).toBe('huggingface');
    });

    it('should handle conversation with context', async () => {
      mockInference.generateConversation.mockResolvedValue({
        response: 'Response',
        model: 'test-model'
      });

      await provider.generateConversation('Question', 'Previous context');

      expect(mockInference.generateConversation).toHaveBeenCalledWith(
        'Question',
        'Previous context',
        expect.any(Object)
      );
    });
  });

  describe('classifyIntent', () => {
    it('should classify intent successfully', async () => {
      const mockResponse = {
        labels: ['technical', 'business', 'design'],
        scores: [0.7, 0.2, 0.1],
        model: 'facebook/bart-large-mnli'
      };
      mockInference.classifyText.mockResolvedValue(mockResponse);

      const result = await provider.classifyIntent(
        'I need help with database design',
        ['technical', 'business', 'design']
      );

      expect(result.success).toBe(true);
      expect(result.intent).toBe('technical');
      expect(result.confidence).toBe(0.7);
      expect(result.all_intents).toBeDefined();
      expect(result.all_intents.length).toBe(3);
    });
  });

  describe('analyzeSentiment', () => {
    it('should analyze sentiment successfully', async () => {
      const mockResponse = {
        sentiment: 'POSITIVE',
        confidence: 0.95,
        model: 'distilbert-base-uncased-finetuned-sst-2-english'
      };
      mockInference.analyzeSentiment.mockResolvedValue(mockResponse);

      const result = await provider.analyzeSentiment('Great product!');

      expect(result.success).toBe(true);
      expect(result.sentiment).toBe('POSITIVE');
      expect(result.confidence).toBe(0.95);
    });
  });

  describe('buildGuidancePrompt', () => {
    it('should build prompt for developer mode', () => {
      const questionnaireData = {
        project_overview: {
          app_name: 'Test App',
          app_summary: 'A test application',
          niche: 'e-commerce'
        }
      };

      const prompt = provider.buildGuidancePrompt(
        questionnaireData,
        'developer'
      );

      expect(prompt).toContain('Test App');
      expect(prompt).toContain('e-commerce');
      expect(prompt).toContain('developer');
      expect(prompt).toContain('Architecture');
    });

    it('should build prompt for non-developer mode', () => {
      const questionnaireData = {
        project_overview: {
          app_name: 'Simple App',
          niche: 'blog'
        }
      };

      const prompt = provider.buildGuidancePrompt(
        questionnaireData,
        'non-developer'
      );

      expect(prompt).toContain('non-technical');
      expect(prompt).toContain('Business goals');
    });
  });

  describe('buildTechnicalInferencePrompt', () => {
    it('should build technical inference prompt', () => {
      const projectData = {
        project_overview: {
          app_name: 'Test App',
          niche: 'dashboard',
          complexity_level: 7,
          estimated_user_count: '1000-10000'
        }
      };

      const prompt = provider.buildTechnicalInferencePrompt(projectData);

      expect(prompt).toContain('Test App');
      expect(prompt).toContain('dashboard');
      expect(prompt).toContain('7/10');
      expect(prompt).toContain('1000-10000');
      expect(prompt).toContain('Frontend Framework');
      expect(prompt).toContain('Backend Framework');
      expect(prompt).toContain('Database');
    });
  });

  describe('parseGuidanceResponse', () => {
    it('should parse guidance response into structured format', () => {
      const responseText = `Project concept is well-defined.
The project shows clear goals.
What database will you use?
Consider using Svelte for performance.
Start with core features first.`;

      const questionnaireData = {
        project_overview: { app_name: 'Test' }
      };

      const guidance = provider.parseGuidanceResponse(
        responseText,
        questionnaireData,
        'developer'
      );

      expect(guidance.clarity_assessment).toBeDefined();
      expect(guidance.project_understanding).toBeDefined();
      expect(guidance.follow_up_questions).toBeDefined();
      expect(guidance.technical_recommendations).toBeDefined();
      expect(guidance.next_steps).toBeDefined();
    });
  });

  describe('parseTechnicalStackResponse', () => {
    it('should parse Svelte recommendation', () => {
      const responseText = 'I recommend Svelte for the frontend';
      const stack = provider.parseTechnicalStackResponse(responseText, {});

      expect(stack.frontend_framework).toBe('svelte');
    });

    it('should parse React recommendation', () => {
      const responseText = 'Use React for this project';
      const stack = provider.parseTechnicalStackResponse(responseText, {});

      expect(stack.frontend_framework).toBe('react');
    });

    it('should parse Fastify backend', () => {
      const responseText = 'Fastify is best for this backend';
      const stack = provider.parseTechnicalStackResponse(responseText, {});

      expect(stack.backend_framework).toBe('node-fastify');
    });

    it('should parse MongoDB database', () => {
      const responseText = 'MongoDB would work well here';
      const stack = provider.parseTechnicalStackResponse(responseText, {});

      expect(stack.database_engine).toBe('mongodb');
    });

    it('should use defaults when no keywords found', () => {
      const responseText = 'Some generic recommendation';
      const stack = provider.parseTechnicalStackResponse(responseText, {});

      expect(stack.frontend_framework).toBe('svelte');
      expect(stack.backend_framework).toBe('node-fastify');
      expect(stack.database_engine).toBe('postgres');
    });
  });

  describe('parseCodeAnalysis', () => {
    it('should parse code analysis into suggestions', () => {
      const analysisText = `Line 1: Good code structure
Line 2: Consider adding error handling
Line 3: Use const instead of let
Line 4: Add comments for clarity
Line 5: Extract to separate function
Line 6: This is extra`;

      const suggestions = provider.parseCodeAnalysis(analysisText);

      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBe(5);
      expect(suggestions[0]).toContain('Good code structure');
    });
  });

  describe('healthCheck', () => {
    it('should return health check from inference', async () => {
      const mockHealth = {
        status: 'healthy',
        models_available: 10
      };
      mockInference.healthCheck.mockResolvedValue(mockHealth);

      const health = await provider.healthCheck();

      expect(health).toEqual(mockHealth);
    });
  });

  describe('getCapabilities', () => {
    it('should return all capabilities', () => {
      const capabilities = provider.getCapabilities();

      expect(capabilities.textGeneration).toBe(true);
      expect(capabilities.codeGeneration).toBe(true);
      expect(capabilities.codeAnalysis).toBe(true);
      expect(capabilities.classification).toBe(true);
      expect(capabilities.embedding).toBe(true);
      expect(capabilities.conversational).toBe(true);
      expect(capabilities.sentimentAnalysis).toBe(true);
      expect(capabilities.guidanceGeneration).toBe(true);
      expect(capabilities.technicalInference).toBe(true);
    });
  });

  describe('getModels', () => {
    it('should return available models from inference', () => {
      const mockModels = [
        { name: 'model1', role: 'role1' },
        { name: 'model2', role: 'role2' }
      ];
      mockInference.getAvailableModels.mockReturnValue(mockModels);

      const models = provider.getModels();

      expect(models).toEqual(mockModels);
    });
  });

  describe('getModelsByRole', () => {
    it('should return role models mapping', () => {
      const roleModels = provider.getModelsByRole();

      expect(roleModels).toBeDefined();
      expect(roleModels['guidance-generation']).toBeDefined();
      expect(roleModels['technical-inference']).toBeDefined();
      expect(roleModels['code-analysis']).toBeDefined();
    });
  });
});
