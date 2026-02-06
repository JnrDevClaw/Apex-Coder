const { describe, it, expect, beforeEach } = require('@jest/globals');
const HuggingFaceProvider = require('../../services/providers/huggingface');
const HuggingFaceInference = require('../../services/providers/huggingface-inference');

describe('Hugging Face Integration Tests', () => {
  let provider;
  let inference;

  beforeEach(() => {
    provider = new HuggingFaceProvider();
    inference = new HuggingFaceInference();
  });

  describe('Provider and Inference Integration', () => {
    it('should have matching availability status', () => {
      expect(provider.isAvailable).toBe(inference.isAvailable());
    });

    it('should use inference instance internally', () => {
      expect(provider.inference).toBeDefined();
      expect(provider.inference.constructor.name).toBe('HuggingFaceInference');
    });
  });

  describe('Model Configuration Consistency', () => {
    it('should have consistent role mappings', () => {
      const providerRoles = Object.keys(provider.roleModels);
      const inferenceRoles = Object.keys(inference.roleMapping);

      // Provider has additional roles for LLMProvider compatibility (coder, tester, reviewer, etc.)
      // Just check that all inference roles are present in provider
      inferenceRoles.forEach(role => {
        expect(providerRoles).toContain(role);
      });
      
      // Verify provider has at least as many roles as inference
      expect(providerRoles.length).toBeGreaterThanOrEqual(inferenceRoles.length);
    });

    it('should map to valid models', () => {
      const availableModels = inference.getAvailableModels();
      const modelNames = availableModels.map(m => m.name);

      // Check that inference role mappings point to valid models
      Object.values(inference.roleMapping).forEach(modelName => {
        expect(modelNames).toContain(modelName);
      });
    });
  });

  describe('Model Availability', () => {
    it('should list available models through provider', () => {
      const models = provider.getModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
    });

    it('should list available models through inference', () => {
      const models = inference.getAvailableModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
    });

    it('should have models with required properties', () => {
      const models = inference.getAvailableModels();

      models.forEach(model => {
        expect(model.name).toBeDefined();
        expect(model.role).toBeDefined();
        expect(model.capabilities).toBeDefined();
        expect(Array.isArray(model.capabilities)).toBe(true);
        expect(model.maxTokens).toBeDefined();
        expect(model.temperature).toBeDefined();
        expect(model.description).toBeDefined();
      });
    });
  });

  describe('Capability Verification', () => {
    it('should support all required capabilities', () => {
      const capabilities = provider.getCapabilities();

      const requiredCapabilities = [
        'textGeneration',
        'codeGeneration',
        'codeAnalysis',
        'classification',
        'embedding',
        'conversational',
        'sentimentAnalysis',
        'guidanceGeneration',
        'technicalInference'
      ];

      requiredCapabilities.forEach(capability => {
        expect(capabilities[capability]).toBe(true);
      });
    });

    it('should have models for each capability', () => {
      const capabilities = [
        'code-generation',
        'code-analysis',
        'conversation',
        'text-classification',
        'sentiment-analysis',
        'text-embedding'
      ];

      capabilities.forEach(capability => {
        const models = inference.getModelsByCapability(capability);
        expect(models.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Health Check Integration', () => {
    it('should perform health check through provider', async () => {
      const health = await provider.healthCheck();

      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
      expect(['healthy', 'degraded', 'unavailable', 'error']).toContain(health.status);
    });

    it('should perform health check through inference', async () => {
      const health = await inference.healthCheck();

      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
    });

    it('should have consistent health status', async () => {
      const providerHealth = await provider.healthCheck();
      const inferenceHealth = await inference.healthCheck();

      expect(providerHealth.status).toBe(inferenceHealth.status);
    });
  });

  describe('Response Parsing', () => {
    it('should parse guidance responses correctly', () => {
      const responseText = `
The project concept is clear and well-defined.
This appears to be a solid e-commerce application.
What payment gateway will you integrate?
Consider using Stripe for payments.
Start with user authentication first.
      `.trim();

      const guidance = provider.parseGuidanceResponse(
        responseText,
        { project_overview: { app_name: 'Test' } },
        'developer'
      );

      expect(guidance.clarity_assessment).toBeDefined();
      expect(guidance.project_understanding).toBeDefined();
      expect(guidance.follow_up_questions).toBeDefined();
      expect(Array.isArray(guidance.follow_up_questions)).toBe(true);
      expect(guidance.technical_recommendations).toBeDefined();
      expect(Array.isArray(guidance.technical_recommendations)).toBe(true);
    });

    it('should parse technical stack responses correctly', () => {
      const testCases = [
        {
          text: 'Use Svelte with Fastify and PostgreSQL',
          expected: {
            frontend: 'svelte',
            backend: 'node-fastify',
            database: 'postgres'
          }
        },
        {
          text: 'React with Express and MongoDB would work well',
          expected: {
            frontend: 'react',
            backend: 'node-express',
            database: 'mongodb'
          }
        },
        {
          text: 'Vue.js with FastAPI and MySQL',
          expected: {
            frontend: 'vue',
            backend: 'python-fastapi',
            database: 'mysql'
          }
        }
      ];

      testCases.forEach(({ text, expected }) => {
        const stack = provider.parseTechnicalStackResponse(text, {});

        expect(stack.frontend_framework).toBe(expected.frontend);
        expect(stack.backend_framework).toContain(expected.backend.split('-')[1]);
        expect(stack.database_engine).toBe(expected.database);
      });
    });
  });

  describe('Prompt Building', () => {
    it('should build comprehensive guidance prompts', () => {
      const questionnaireData = {
        project_overview: {
          app_name: 'E-commerce Platform',
          app_summary: 'Online marketplace for handmade goods',
          niche: 'e-commerce',
          complexity_level: 7
        }
      };

      const developerPrompt = provider.buildGuidancePrompt(
        questionnaireData,
        'developer'
      );

      expect(developerPrompt).toContain('E-commerce Platform');
      expect(developerPrompt).toContain('e-commerce');
      expect(developerPrompt).toContain('developer');
      expect(developerPrompt).toContain('Architecture');

      const nonDevPrompt = provider.buildGuidancePrompt(
        questionnaireData,
        'non-developer'
      );

      expect(nonDevPrompt).toContain('non-technical');
      expect(nonDevPrompt).toContain('Business goals');
    });

    it('should build comprehensive technical inference prompts', () => {
      const projectData = {
        project_overview: {
          app_name: 'Analytics Dashboard',
          niche: 'analytics',
          complexity_level: 8,
          estimated_user_count: '10000+'
        },
        app_structure: {
          app_type: 'dashboard'
        }
      };

      const prompt = provider.buildTechnicalInferencePrompt(projectData);

      expect(prompt).toContain('Analytics Dashboard');
      expect(prompt).toContain('analytics');
      expect(prompt).toContain('8/10');
      expect(prompt).toContain('10000+');
      expect(prompt).toContain('Frontend Framework');
      expect(prompt).toContain('Backend Framework');
      expect(prompt).toContain('Database');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing API key gracefully', () => {
      const originalKey = process.env.HUGGINGFACE_API_KEY;
      delete process.env.HUGGINGFACE_API_KEY;

      const testInference = new HuggingFaceInference();
      expect(testInference.isAvailable()).toBe(false);

      const testProvider = new HuggingFaceProvider();
      expect(testProvider.isAvailable).toBe(false);

      // Restore API key
      if (originalKey) {
        process.env.HUGGINGFACE_API_KEY = originalKey;
      }
    });

    it('should throw appropriate errors for unavailable API', async () => {
      const originalKey = process.env.HUGGINGFACE_API_KEY;
      delete process.env.HUGGINGFACE_API_KEY;

      const testProvider = new HuggingFaceProvider();

      await expect(
        testProvider.generateGuidance({}, 'developer')
      ).rejects.toThrow('Hugging Face API not available');

      await expect(
        testProvider.inferTechnicalStack({})
      ).rejects.toThrow('Hugging Face API not available');

      // Restore API key
      if (originalKey) {
        process.env.HUGGINGFACE_API_KEY = originalKey;
      }
    });
  });
});
