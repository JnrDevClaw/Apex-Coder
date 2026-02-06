/**
 * Tests for E2E Validation API Routes
 */

const { build } = require('../helper');

// Mock the E2E validator
jest.mock('../../services/e2e-demo-validator');
const MockE2EDemoValidator = require('../../services/e2e-demo-validator');

describe('E2E Validation API Routes', () => {
  let app;
  let mockValidator;

  beforeEach(async () => {
    // Create mock validator instance
    mockValidator = {
      initialize: jest.fn().mockResolvedValue(),
      runCompleteValidation: jest.fn(),
      validateQuestionnaireToSpec: jest.fn(),
      validateTaskTreeGeneration: jest.fn(),
      validateCodeGeneration: jest.fn(),
      validateDeployment: jest.fn(),
      validateSelfFixLoop: jest.fn(),
      getValidationResults: jest.fn(),
      listActiveValidations: jest.fn(),
      getValidationStats: jest.fn(),
      workerPool: {
        getPoolStats: jest.fn().mockResolvedValue({
          totalWorkers: 1,
          activeWorkers: 0
        })
      },
      selfFixLoop: {
        getFixStats: jest.fn().mockResolvedValue({
          activeSessions: 0,
          totalSessions: 1
        })
      },
      activeValidations: new Map(),
      validationResults: new Map(),
      demoSpec: {
        projectName: 'E2E Demo App',
        features: { auth: true, uploads: true }
      },
      shutdown: jest.fn().mockResolvedValue()
    };

    // Mock the constructor
    MockE2EDemoValidator.mockImplementation(() => mockValidator);

    // Build the app with the route
    app = build();
    await app.register(require('../../routes/e2e-validation'), { prefix: '/api/e2e-validation' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  describe('POST /api/e2e-validation/run', () => {
    test('should run complete E2E validation successfully', async () => {
      const mockResult = {
        validationId: 'test-validation-123',
        success: true,
        duration: 30000,
        stages: {
          questionnaire: true,
          taskTree: true,
          codeGeneration: true,
          deployment: true,
          selfFixLoop: true
        },
        liveUrl: 'https://test-app.cloudfront.net',
        details: {
          specValidation: { success: true },
          taskGeneration: { success: true, taskCount: 5 },
          codeGeneration: { success: true },
          deployment: { success: true, liveUrl: 'https://test-app.cloudfront.net' },
          selfFixLoop: { success: true, iterations: 2 }
        },
        completedAt: new Date().toISOString()
      };

      mockValidator.runCompleteValidation.mockResolvedValue(mockResult);

      const response = await app.inject({
        method: 'POST',
        url: '/api/e2e-validation/run',
        payload: {
          options: {
            timeoutMs: 60000
          }
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      
      expect(result.validationId).toBe('test-validation-123');
      expect(result.success).toBe(true);
      expect(result.duration).toBe(30000);
      expect(result.stages.questionnaire).toBe(true);
      expect(result.liveUrl).toBe('https://test-app.cloudfront.net');
      expect(mockValidator.runCompleteValidation).toHaveBeenCalledWith({ timeoutMs: 60000 });
    });

    test('should handle validation failure', async () => {
      mockValidator.runCompleteValidation.mockRejectedValue(new Error('Validation failed'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/e2e-validation/run',
        payload: {}
      });

      expect(response.statusCode).toBe(500);
      const result = JSON.parse(response.payload);
      
      expect(result.error).toBe('E2E validation failed');
      expect(result.message).toBe('Validation failed');
    });

    test('should use custom spec when provided', async () => {
      const customSpec = {
        projectName: 'Custom App',
        features: { auth: false, uploads: true }
      };

      const mockResult = {
        validationId: 'custom-validation-123',
        success: true,
        duration: 25000,
        stages: {},
        details: {}
      };

      mockValidator.runCompleteValidation.mockResolvedValue(mockResult);

      const response = await app.inject({
        method: 'POST',
        url: '/api/e2e-validation/run',
        payload: {
          customSpec
        }
      });

      expect(response.statusCode).toBe(200);
      expect(mockValidator.demoSpec).toEqual(customSpec);
    });
  });

  describe('POST /api/e2e-validation/stage/:stageName', () => {
    test('should run questionnaire stage validation', async () => {
      const mockResult = {
        success: true,
        specJson: mockValidator.demoSpec,
        validation: { isValid: true },
        message: 'Questionnaire validation passed'
      };

      mockValidator.validateQuestionnaireToSpec.mockResolvedValue(mockResult);

      const response = await app.inject({
        method: 'POST',
        url: '/api/e2e-validation/stage/questionnaire',
        payload: {}
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      
      expect(result.stage).toBe('questionnaire');
      expect(result.success).toBe(true);
      expect(result.result.message).toContain('validation passed');
    });

    test('should run task tree stage validation', async () => {
      const mockResult = {
        success: true,
        tasks: [
          { id: 1, templateId: 'auth-system' },
          { id: 2, templateId: 'file-uploads' }
        ],
        taskCount: 2,
        openApiSkeleton: { paths: {} }
      };

      mockValidator.validateTaskTreeGeneration.mockResolvedValue(mockResult);

      const response = await app.inject({
        method: 'POST',
        url: '/api/e2e-validation/stage/taskTree',
        payload: {
          input: mockValidator.demoSpec
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      
      expect(result.stage).toBe('taskTree');
      expect(result.success).toBe(true);
      expect(result.result.taskCount).toBe(2);
      expect(mockValidator.validateTaskTreeGeneration).toHaveBeenCalledWith(mockValidator.demoSpec);
    });

    test('should run code generation stage validation', async () => {
      const mockResult = {
        success: true,
        codeGeneration: { success: true },
        testExecution: { success: true, testsRun: 5 },
        artifacts: ['s3://bucket/app.zip']
      };

      mockValidator.validateCodeGeneration.mockResolvedValue(mockResult);

      const tasks = [
        { id: 1, templateId: 'auth-system' },
        { id: 2, templateId: 'file-uploads' }
      ];

      const response = await app.inject({
        method: 'POST',
        url: '/api/e2e-validation/stage/codeGeneration',
        payload: {
          input: { tasks }
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      
      expect(result.stage).toBe('codeGeneration');
      expect(result.success).toBe(true);
      expect(result.result.artifacts).toHaveLength(1);
      expect(mockValidator.validateCodeGeneration).toHaveBeenCalledWith(tasks);
    });

    test('should run deployment stage validation', async () => {
      const mockResult = {
        success: true,
        deploymentId: 'deploy-123',
        liveUrl: 'https://test-app.cloudfront.net',
        deployedAt: new Date().toISOString()
      };

      mockValidator.validateDeployment.mockResolvedValue(mockResult);

      const artifacts = ['s3://bucket/app.zip', 's3://bucket/db.sql'];

      const response = await app.inject({
        method: 'POST',
        url: '/api/e2e-validation/stage/deployment',
        payload: {
          input: { artifacts }
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      
      expect(result.stage).toBe('deployment');
      expect(result.success).toBe(true);
      expect(result.result.liveUrl).toBe('https://test-app.cloudfront.net');
      expect(mockValidator.validateDeployment).toHaveBeenCalledWith(artifacts);
    });

    test('should run self-fix loop stage validation', async () => {
      const mockResult = {
        success: true,
        iterations: 2,
        maxIterations: 3,
        fixedAt: new Date().toISOString()
      };

      mockValidator.validateSelfFixLoop.mockResolvedValue(mockResult);

      const testFailure = {
        error: 'Test failed: Authentication should validate tokens',
        failingTests: ['auth.test.js']
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/e2e-validation/stage/selfFixLoop',
        payload: {
          input: { testFailure }
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      
      expect(result.stage).toBe('selfFixLoop');
      expect(result.success).toBe(true);
      expect(result.result.iterations).toBe(2);
      expect(mockValidator.validateSelfFixLoop).toHaveBeenCalledWith(testFailure);
    });

    test('should return 400 for unknown stage', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/e2e-validation/stage/unknownStage',
        payload: {}
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.error).toContain('unknownStage');
    });

    test('should return 400 when required input is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/e2e-validation/stage/codeGeneration',
        payload: {} // Missing tasks input
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.message).toContain('Tasks input required');
    });
  });

  describe('GET /api/e2e-validation/results/:validationId', () => {
    test('should return validation results', async () => {
      const validationId = 'test-validation-123';
      const mockResults = {
        id: validationId,
        status: 'completed',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        stages: {
          questionnaire: { status: 'completed', result: { success: true } }
        },
        finalResult: { success: true },
        errors: []
      };

      mockValidator.getValidationResults.mockResolvedValue(mockResults);

      const response = await app.inject({
        method: 'GET',
        url: `/api/e2e-validation/results/${validationId}`
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      
      expect(result.validationId).toBe(validationId);
      expect(result.status).toBe('completed');
      expect(result.finalResult.success).toBe(true);
    });

    test('should return 404 for non-existent validation', async () => {
      mockValidator.getValidationResults.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/e2e-validation/results/non-existent'
      });

      expect(response.statusCode).toBe(404);
      const result = JSON.parse(response.payload);
      expect(result.error).toBe('Validation not found');
    });
  });

  describe('GET /api/e2e-validation/active', () => {
    test('should return active validations', async () => {
      const mockActive = [
        {
          id: 'active-validation-1',
          status: 'running',
          startedAt: new Date().toISOString(),
          currentStage: 'codeGeneration'
        }
      ];

      mockValidator.listActiveValidations.mockResolvedValue(mockActive);

      const response = await app.inject({
        method: 'GET',
        url: '/api/e2e-validation/active'
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      
      expect(result.activeValidations).toHaveLength(1);
      expect(result.count).toBe(1);
      expect(result.activeValidations[0].id).toBe('active-validation-1');
    });

    test('should return empty array when no active validations', async () => {
      mockValidator.listActiveValidations.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/e2e-validation/active'
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      
      expect(result.activeValidations).toHaveLength(0);
      expect(result.count).toBe(0);
    });
  });

  describe('GET /api/e2e-validation/stats', () => {
    test('should return validation statistics', async () => {
      const mockStats = {
        totalValidations: 10,
        successfulValidations: 8,
        activeValidations: 1,
        successRate: 80,
        averageDuration: 45000
      };

      mockValidator.getValidationStats.mockResolvedValue(mockStats);

      const response = await app.inject({
        method: 'GET',
        url: '/api/e2e-validation/stats'
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      
      expect(result.stats.totalValidations).toBe(10);
      expect(result.stats.successRate).toBe(80);
      expect(result.stats.averageDuration).toBe(45000);
    });
  });

  describe('GET /api/e2e-validation/demo-spec', () => {
    test('should return demo spec', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/e2e-validation/demo-spec'
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      
      expect(result.demoSpec).toEqual(mockValidator.demoSpec);
      expect(result.description).toContain('Demo spec with auth + file upload');
    });
  });

  describe('PUT /api/e2e-validation/demo-spec', () => {
    test('should update demo spec successfully', async () => {
      const newSpec = {
        projectName: 'Updated Demo App',
        stack: { frontend: 'react', backend: 'python', database: 'mysql' },
        features: { auth: true, uploads: false, payments: true },
        constraints: { offline: false, hipaa: false, audit: true },
        envPrefs: { hosting: 'aws', cicd: true, monitoring: true }
      };

      const response = await app.inject({
        method: 'PUT',
        url: '/api/e2e-validation/demo-spec',
        payload: {
          spec: newSpec
        }
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('updated successfully');
      expect(mockValidator.demoSpec).toEqual(newSpec);
    });

    test('should return 400 for invalid spec', async () => {
      const invalidSpec = {
        projectName: '', // Invalid - empty name
        stack: {} // Invalid - missing required fields
      };

      const response = await app.inject({
        method: 'PUT',
        url: '/api/e2e-validation/demo-spec',
        payload: {
          spec: invalidSpec
        }
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      
      expect(result.error).toBe('Invalid spec provided');
      expect(result.validationErrors).toBeDefined();
      expect(Array.isArray(result.validationErrors)).toBe(true);
    });
  });

  describe('GET /api/e2e-validation/health', () => {
    test('should return healthy status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/e2e-validation/health'
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      
      expect(result.status).toBe('healthy');
      expect(result.components.workerPool.status).toBe('healthy');
      expect(result.components.selfFixLoop.status).toBe('healthy');
      expect(result.components.validator.status).toBe('healthy');
    });

    test('should return unhealthy status when components fail', async () => {
      mockValidator.workerPool.getPoolStats.mockRejectedValue(new Error('Worker pool error'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/e2e-validation/health'
      });

      expect(response.statusCode).toBe(503);
      const result = JSON.parse(response.payload);
      
      expect(result.status).toBe('unhealthy');
      expect(result.error).toContain('Worker pool error');
    });
  });

  describe('Error Handling', () => {
    test('should handle service errors gracefully', async () => {
      mockValidator.runCompleteValidation.mockRejectedValue(new Error('Service unavailable'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/e2e-validation/run',
        payload: {}
      });

      expect(response.statusCode).toBe(500);
      const result = JSON.parse(response.payload);
      
      expect(result.error).toBe('E2E validation failed');
      expect(result.message).toBe('Service unavailable');
      expect(result.timestamp).toBeDefined();
    });

    test('should handle validation errors in stage endpoints', async () => {
      mockValidator.validateTaskTreeGeneration.mockRejectedValue(new Error('Task generation failed'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/e2e-validation/stage/taskTree',
        payload: {
          input: mockValidator.demoSpec
        }
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      
      expect(result.error).toContain('Stage taskTree validation failed');
      expect(result.message).toBe('Task generation failed');
    });
  });

  describe('Request Validation', () => {
    test('should validate stage name parameter', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/e2e-validation/stage/invalidStage',
        payload: {}
      });

      expect(response.statusCode).toBe(400);
    });

    test('should handle missing required payload fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/e2e-validation/stage/deployment',
        payload: {} // Missing artifacts
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.message).toContain('Artifacts input required');
    });
  });
});