/**
 * Tests for E2E Demo Validation System
 */

const E2EDemoValidator = require('../../services/e2e-demo-validator');
const { validateSpec } = require('../../../Frontend/src/lib/schemas/spec.js');

// Mock dependencies
jest.mock('../../services/task-planner');
jest.mock('../../services/model-router-service');
jest.mock('../../services/job-processor');
jest.mock('../../../workers/services/worker-pool');
jest.mock('../../../workers/services/self-fix-loop');
jest.mock('../../services/aws-action-layer');
jest.mock('../../services/structured-logger');

const mockTaskPlanner = require('../../services/task-planner');
const mockModelRouter = require('../../services/model-router-service');
const MockWorkerPool = require('../../../workers/services/worker-pool');
const MockSelfFixLoop = require('../../../workers/services/self-fix-loop');
const mockAWSActionLayer = require('../../services/aws-action-layer');

describe('E2EDemoValidator', () => {
  let validator;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock WorkerPool
    MockWorkerPool.mockImplementation(() => ({
      initialize: jest.fn().mockResolvedValue(),
      createWorker: jest.fn().mockResolvedValue({
        id: 'test-worker-123',
        status: 'created'
      }),
      executeJob: jest.fn().mockResolvedValue({
        success: true,
        output: 'Job completed successfully'
      }),
      getPoolStats: jest.fn().mockResolvedValue({
        totalWorkers: 1,
        activeWorkers: 0
      }),
      shutdown: jest.fn().mockResolvedValue()
    }));

    // Mock SelfFixLoop
    MockSelfFixLoop.mockImplementation(() => ({
      initialize: jest.fn().mockResolvedValue(),
      startFixLoop: jest.fn().mockResolvedValue({
        success: true,
        iteration: 2,
        totalIterations: 2,
        fixedAt: new Date().toISOString()
      }),
      getFixStats: jest.fn().mockResolvedValue({
        activeSessions: 0,
        totalSessions: 1,
        successfulFixes: 1
      }),
      shutdown: jest.fn().mockResolvedValue()
    }));

    // Mock AWS Action Layer
    mockAWSActionLayer.mockImplementation(() => ({
      generateOperationId: jest.fn().mockReturnValue('op_123_abc'),
      requestApproval: jest.fn().mockResolvedValue({
        status: 'approved',
        operationId: 'op_123_abc'
      }),
      logAuditEvent: jest.fn().mockResolvedValue({
        eventTime: new Date().toISOString(),
        eventName: 'E2EDeploymentValidation'
      })
    }));

    // Mock task planner
    mockTaskPlanner.planProject = jest.fn().mockResolvedValue({
      tasks: [
        {
          id: 1,
          templateId: 'auth-system',
          name: 'Implement authentication system',
          agentRole: 'coder',
          estimatedTime: 720
        },
        {
          id: 2,
          templateId: 'file-uploads',
          name: 'Implement file upload system',
          agentRole: 'coder',
          estimatedTime: 600
        },
        {
          id: 3,
          templateId: 'database-models',
          name: 'Create database models',
          agentRole: 'coder',
          estimatedTime: 450
        }
      ],
      openApiSkeleton: {
        openapi: '3.0.0',
        paths: {
          '/auth/login': { post: { summary: 'User login' } },
          '/auth/register': { post: { summary: 'User registration' } },
          '/uploads': { post: { summary: 'Upload file' } }
        }
      },
      databaseSchema: {
        tables: [
          { name: 'users', columns: [] },
          { name: 'uploads', columns: [] }
        ]
      },
      milestones: [],
      totalEstimation: { totalTimeSeconds: 1770 }
    });

    validator = new E2EDemoValidator({
      workerPool: { maxWorkers: 1 },
      aws: { region: 'us-east-1' }
    });

    await validator.initialize();
  });

  afterEach(async () => {
    if (validator) {
      await validator.shutdown();
    }
  });

  describe('Demo Spec Creation', () => {
    test('should create valid demo spec with auth and file upload features', () => {
      const demoSpec = validator.createDemoSpec();

      expect(demoSpec).toHaveProperty('projectName', 'E2E Demo App');
      expect(demoSpec.features.auth).toBe(true);
      expect(demoSpec.features.uploads).toBe(true);
      expect(demoSpec.stack.frontend).toBe('svelte');
      expect(demoSpec.stack.backend).toBe('node');
      expect(demoSpec.stack.database).toBe('postgres');

      // Validate against schema
      const validation = validateSpec(demoSpec);
      expect(validation.isValid).toBe(true);
    });
  });

  describe('Questionnaire to Spec Validation', () => {
    test('should validate complete questionnaire to spec.json conversion', async () => {
      const result = await validator.validateQuestionnaireToSpec();

      expect(result.success).toBe(true);
      expect(result.specJson).toBeDefined();
      expect(result.validation.isValid).toBe(true);
      expect(result.requiredFieldsPresent).toBeGreaterThan(0);
      expect(result.message).toContain('validation passed');
    });

    test('should fail validation for incomplete spec', async () => {
      // Temporarily modify demo spec to be incomplete
      const originalSpec = validator.demoSpec;
      validator.demoSpec = { projectName: '' }; // Incomplete spec

      const result = await validator.validateQuestionnaireToSpec();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      // Restore original spec
      validator.demoSpec = originalSpec;
    });
  });

  describe('Task Tree Generation Validation', () => {
    test('should validate task tree generation for auth + file upload', async () => {
      const result = await validator.validateTaskTreeGeneration(validator.demoSpec);

      expect(result.success).toBe(true);
      expect(result.tasks).toHaveLength(3);
      expect(result.taskCount).toBe(3);
      expect(result.openApiSkeleton).toBeDefined();
      expect(result.databaseSchema).toBeDefined();

      // Check for required endpoints
      expect(result.openApiSkeleton.paths).toHaveProperty('/auth/login');
      expect(result.openApiSkeleton.paths).toHaveProperty('/uploads');
    });

    test('should fail validation when task planner fails', async () => {
      mockTaskPlanner.planProject.mockRejectedValueOnce(new Error('Task planning failed'));

      const result = await validator.validateTaskTreeGeneration(validator.demoSpec);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Task planning failed');
      expect(result.tasks).toHaveLength(0);
    });

    test('should fail validation when OpenAPI skeleton is missing auth endpoints', async () => {
      mockTaskPlanner.planProject.mockResolvedValueOnce({
        tasks: [{ id: 1, templateId: 'basic-task' }],
        openApiSkeleton: {
          openapi: '3.0.0',
          paths: {} // Missing auth endpoints
        },
        databaseSchema: { tables: [] }
      });

      const result = await validator.validateTaskTreeGeneration(validator.demoSpec);

      expect(result.success).toBe(false);
      expect(result.error).toContain('missing authentication endpoints');
    });
  });

  describe('Code Generation Validation', () => {
    test('should validate successful code generation and testing', async () => {
      const tasks = [
        { id: 1, templateId: 'auth-system', name: 'Auth system' },
        { id: 2, templateId: 'file-uploads', name: 'File uploads' }
      ];

      const result = await validator.validateCodeGeneration(tasks);

      expect(result.success).toBe(true);
      expect(result.codeGeneration.success).toBe(true);
      expect(result.packageInstall.success).toBe(true);
      expect(result.testExecution).toBeDefined();
      expect(result.artifacts).toBeDefined();
      expect(Array.isArray(result.artifacts)).toBe(true);
    });

    test('should handle code generation failure', async () => {
      const mockWorkerPool = validator.workerPool;
      mockWorkerPool.executeJob.mockResolvedValueOnce({
        success: false,
        output: 'Code generation failed'
      });

      const tasks = [{ id: 1, templateId: 'auth-system' }];
      const result = await validator.validateCodeGeneration(tasks);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Code generation failed');
    });

    test('should handle test failures and return test failure data', async () => {
      // Mock test failure in simulateTestExecution
      const originalSimulate = validator.simulateTestExecution;
      validator.simulateTestExecution = jest.fn().mockResolvedValue({
        success: false,
        error: 'Test failed: Authentication middleware should validate JWT tokens',
        failingTests: ['auth.test.js: should validate JWT tokens'],
        testsRun: 8,
        testsPassed: 6,
        testsFailed: 2
      });

      const tasks = [{ id: 1, templateId: 'auth-system' }];
      const result = await validator.validateCodeGeneration(tasks);

      expect(result.success).toBe(false);
      expect(result.testFailures).toHaveLength(1);
      expect(result.testFailures[0].error).toContain('Authentication middleware');

      // Restore original method
      validator.simulateTestExecution = originalSimulate;
    });
  });

  describe('Deployment Validation', () => {
    test('should validate successful deployment with live URL', async () => {
      const artifacts = ['s3://bucket/app.zip', 's3://bucket/db.sql'];

      const result = await validator.validateDeployment(artifacts);

      expect(result.success).toBe(true);
      expect(result.deploymentId).toBeDefined();
      expect(result.liveUrl).toBeDefined();
      expect(result.liveUrl).toMatch(/^https:\/\//);
      expect(result.healthCheckUrl).toBeDefined();
      expect(result.deployedAt).toBeDefined();
    });

    test('should fail validation when no artifacts provided', async () => {
      const result = await validator.validateDeployment([]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No artifacts available');
      expect(result.liveUrl).toBeNull();
    });

    test('should fail validation when deployment approval is denied', async () => {
      const mockAWS = validator.awsActionLayer;
      mockAWS.requestApproval.mockResolvedValueOnce({
        status: 'pending',
        operationId: 'op_123_abc'
      });

      const artifacts = ['s3://bucket/app.zip'];
      const result = await validator.validateDeployment(artifacts);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not approved');
    });
  });

  describe('Self-Fix Loop Validation', () => {
    test('should validate successful self-fix loop within 3 iterations', async () => {
      const testFailure = {
        error: 'Test failed: Authentication middleware should validate JWT tokens',
        failingTests: ['auth.test.js: should validate JWT tokens'],
        output: 'Error: Expected token to be valid'
      };

      const result = await validator.validateSelfFixLoop(testFailure);

      expect(result.success).toBe(true);
      expect(result.iterations).toBeLessThanOrEqual(3);
      expect(result.maxIterations).toBe(3);
      expect(result.escalated).toBe(false);
      expect(result.fixedAt).toBeDefined();
    });

    test('should handle self-fix loop failure and escalation', async () => {
      const mockSelfFixLoop = validator.selfFixLoop;
      mockSelfFixLoop.startFixLoop.mockResolvedValueOnce({
        success: false,
        totalIterations: 3,
        escalated: true,
        message: 'Self-fix loop exhausted, escalated to human review'
      });

      const testFailure = {
        error: 'Complex test failure',
        failingTests: ['complex.test.js']
      };

      const result = await validator.validateSelfFixLoop(testFailure);

      expect(result.success).toBe(false);
      expect(result.escalated).toBe(true);
      expect(result.message).toContain('escalated to human review');
    });

    test('should fail validation when self-fix loop exceeds maximum iterations', async () => {
      const mockSelfFixLoop = validator.selfFixLoop;
      mockSelfFixLoop.startFixLoop.mockResolvedValueOnce({
        success: false,
        totalIterations: 5, // Exceeds maximum of 3
        escalated: false
      });

      const testFailure = { error: 'Test failure' };
      const result = await validator.validateSelfFixLoop(testFailure);

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeded maximum iterations');
    });
  });

  describe('Complete E2E Validation', () => {
    test('should run complete validation pipeline successfully', async () => {
      const result = await validator.runCompleteValidation();

      expect(result.success).toBe(true);
      expect(result.validationId).toBeDefined();
      expect(result.duration).toBeGreaterThan(0);
      expect(result.stages.questionnaire).toBe(true);
      expect(result.stages.taskTree).toBe(true);
      expect(result.stages.codeGeneration).toBe(true);
      expect(result.stages.deployment).toBe(true);
      expect(result.liveUrl).toBeDefined();
      expect(result.completedAt).toBeDefined();
    });

    test('should handle validation failure in early stage', async () => {
      // Mock task planner failure
      mockTaskPlanner.planProject.mockRejectedValueOnce(new Error('Task planning failed'));

      await expect(validator.runCompleteValidation()).rejects.toThrow('Task planning failed');
    });

    test('should skip self-fix loop when no test failures', async () => {
      // Mock successful test execution (no failures)
      const originalSimulate = validator.simulateTestExecution;
      validator.simulateTestExecution = jest.fn().mockResolvedValue({
        success: true,
        testsRun: 8,
        testsPassed: 8,
        testsFailed: 0
      });

      const result = await validator.runCompleteValidation();

      expect(result.success).toBe(true);
      expect(result.stages.selfFixLoop).toBe(true); // Should be true when skipped
      expect(result.details.selfFixLoop.result.reason).toContain('No test failures');

      // Restore original method
      validator.simulateTestExecution = originalSimulate;
    });
  });

  describe('Utility Methods', () => {
    test('should get nested values correctly', () => {
      const obj = {
        level1: {
          level2: {
            value: 'test'
          }
        }
      };

      expect(validator.getNestedValue(obj, 'level1.level2.value')).toBe('test');
      expect(validator.getNestedValue(obj, 'level1.nonexistent')).toBeUndefined();
    });

    test('should compile final results correctly', () => {
      const validation = {
        id: 'test-validation',
        startedAt: new Date('2024-01-01T10:00:00Z'),
        completedAt: new Date('2024-01-01T10:05:00Z'),
        stages: {
          questionnaire: { status: 'completed', result: { success: true } },
          taskTree: { status: 'completed', result: { success: true } },
          codeGeneration: { status: 'completed', result: { success: false } },
          deployment: { status: 'completed', result: { success: true, liveUrl: 'https://test.com' } },
          selfFixLoop: { status: 'skipped', result: { reason: 'No failures' } }
        },
        errors: []
      };

      const result = validator.compileFinalResults(validation);

      expect(result.validationId).toBe('test-validation');
      expect(result.success).toBe(false); // Because codeGeneration failed
      expect(result.duration).toBe(5 * 60 * 1000); // 5 minutes
      expect(result.stages.questionnaire).toBe(true);
      expect(result.stages.codeGeneration).toBe(false);
      expect(result.stages.selfFixLoop).toBe(true); // Skipped counts as success
      expect(result.liveUrl).toBe('https://test.com');
    });
  });

  describe('Validation Management', () => {
    test('should track active validations', async () => {
      // Start validation but don't await it
      const validationPromise = validator.runCompleteValidation();

      // Check active validations
      const active = await validator.listActiveValidations();
      expect(active.length).toBe(1);
      expect(active[0].status).toBe('running');

      // Wait for completion
      await validationPromise;

      // Check active validations again
      const activeAfter = await validator.listActiveValidations();
      expect(activeAfter.length).toBe(0);
    });

    test('should provide validation statistics', async () => {
      // Run a validation
      await validator.runCompleteValidation();

      const stats = await validator.getValidationStats();

      expect(stats.totalValidations).toBe(1);
      expect(stats.successfulValidations).toBe(1);
      expect(stats.activeValidations).toBe(0);
      expect(stats.successRate).toBe(100);
      expect(stats.averageDuration).toBeGreaterThan(0);
    });

    test('should retrieve validation results by ID', async () => {
      const result = await validator.runCompleteValidation();
      const validationId = result.validationId;

      const retrieved = await validator.getValidationResults(validationId);

      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(validationId);
      expect(retrieved.status).toBe('completed');
      expect(retrieved.finalResult).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle worker pool initialization failure', async () => {
      const mockWorkerPool = validator.workerPool;
      mockWorkerPool.initialize.mockRejectedValueOnce(new Error('Worker pool init failed'));

      const newValidator = new E2EDemoValidator();
      
      await expect(newValidator.initialize()).rejects.toThrow('Worker pool init failed');
    });

    test('should handle self-fix loop initialization failure', async () => {
      const mockSelfFixLoop = validator.selfFixLoop;
      mockSelfFixLoop.initialize.mockRejectedValueOnce(new Error('Self-fix loop init failed'));

      const newValidator = new E2EDemoValidator();
      
      await expect(newValidator.initialize()).rejects.toThrow('Self-fix loop init failed');
    });
  });

  describe('Cleanup', () => {
    test('should shutdown all components properly', async () => {
      const mockWorkerPool = validator.workerPool;
      const mockSelfFixLoop = validator.selfFixLoop;

      await validator.shutdown();

      expect(mockWorkerPool.shutdown).toHaveBeenCalled();
      expect(mockSelfFixLoop.shutdown).toHaveBeenCalled();
      expect(validator.validationResults.size).toBe(0);
      expect(validator.activeValidations.size).toBe(0);
    });
  });
});