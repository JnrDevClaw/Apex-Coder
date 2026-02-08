const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const SelfFixLoop = require('../services/self-fix-loop');
const { EventEmitter } = require('events');

// Mock ModelRouter for testing
class MockModelRouter {
  constructor(shouldSucceed = true) {
    this.shouldSucceed = shouldSucceed;
    this.callCount = 0;
  }

  async routeTask(task, context) {
    this.callCount++;
    
    if (!this.shouldSucceed) {
      throw new Error('Mock LLM call failed');
    }

    // Return mock patch response
    return {
      success: true,
      content: JSON.stringify({
        analysis: 'Mock analysis of the test failure',
        changes: [
          {
            file: 'src/app.js',
            action: 'modify',
            content: '// Fixed code',
            explanation: 'Fixed the validation logic'
          }
        ],
        description: 'Fixed validation issue',
        confidence: 0.85
      }),
      provider: 'mock-provider',
      model: 'mock-model',
      cost: 0.001,
      tokens: 100,
      latency: 200
    };
  }
}

describe('SelfFixLoop', () => {
  let selfFixLoop;
  let mockModelRouter;

  beforeEach(() => {
    mockModelRouter = new MockModelRouter();
    selfFixLoop = new SelfFixLoop({
      maxIterations: 3,
      modelRouter: mockModelRouter
    });
  });

  afterEach(async () => {
    if (selfFixLoop) {
      await selfFixLoop.shutdown();
    }
  });

  describe('initialization', () => {
    it('should initialize with default options', async () => {
      await selfFixLoop.initialize();
      expect(selfFixLoop.maxIterations).toBe(3);
      expect(selfFixLoop.modelRouter).toBe(mockModelRouter);
    });

    it('should initialize with custom max iterations', () => {
      const customLoop = new SelfFixLoop({ maxIterations: 10 });
      expect(customLoop.maxIterations).toBe(10);
    });
  });

  describe('generatePatch', () => {
    it('should generate patch using ModelRouter', async () => {
      const testFailure = {
        error: 'Test failed: Expected value to be truthy',
        exitCode: 1,
        output: 'Test output...',
        failingTests: ['should validate input']
      };

      const codeContext = {
        framework: 'jest',
        files: ['src/app.js'],
        dependencies: ['express']
      };

      const patch = await selfFixLoop.generatePatch(testFailure, codeContext, []);

      expect(patch).toBeDefined();
      expect(patch.changes).toBeInstanceOf(Array);
      expect(patch.changes.length).toBeGreaterThan(0);
      expect(patch.description).toBeDefined();
      expect(patch.confidence).toBeGreaterThan(0);
      expect(patch.llmMetadata).toBeDefined();
      expect(patch.llmMetadata.provider).toBe('mock-provider');
      expect(mockModelRouter.callCount).toBe(1);
    });

    it('should throw error when ModelRouter is not available', async () => {
      const loopWithoutRouter = new SelfFixLoop({ maxIterations: 3 });
      
      await expect(
        loopWithoutRouter.generatePatch({}, {}, [])
      ).rejects.toThrow('ModelRouter not available');
    });

    it('should throw error when LLM call fails', async () => {
      const failingRouter = new MockModelRouter(false);
      const loopWithFailingRouter = new SelfFixLoop({
        maxIterations: 3,
        modelRouter: failingRouter
      });

      await expect(
        loopWithFailingRouter.generatePatch({}, {}, [])
      ).rejects.toThrow('Patch generation failed');
    });
  });

  describe('parsePatchResponse', () => {
    it('should parse JSON patch response', () => {
      const response = {
        content: JSON.stringify({
          analysis: 'Test analysis',
          changes: [
            {
              file: 'test.js',
              action: 'modify',
              content: 'new content',
              explanation: 'test explanation'
            }
          ],
          description: 'Test patch',
          confidence: 0.9
        })
      };

      const patch = selfFixLoop.parsePatchResponse(response);

      expect(patch.analysis).toBe('Test analysis');
      expect(patch.changes).toHaveLength(1);
      expect(patch.description).toBe('Test patch');
      expect(patch.confidence).toBe(0.9);
    });

    it('should parse JSON in markdown code blocks', () => {
      const response = {
        content: '```json\n{"analysis":"test","changes":[],"description":"test","confidence":0.8}\n```'
      };

      const patch = selfFixLoop.parsePatchResponse(response);

      expect(patch.analysis).toBe('test');
      expect(patch.changes).toBeInstanceOf(Array);
    });

    it('should throw error for invalid patch format', () => {
      const response = {
        content: JSON.stringify({
          analysis: 'Test',
          // Missing required 'changes' field
          description: 'Test'
        })
      };

      expect(() => {
        selfFixLoop.parsePatchResponse(response);
      }).toThrow('Invalid patch response format');
    });
  });

  describe('applyPatch', () => {
    it('should apply patch with multiple changes', async () => {
      const patch = {
        description: 'Test patch',
        confidence: 0.8,
        changes: [
          {
            file: 'src/app.js',
            action: 'modify',
            content: 'new content'
          },
          {
            file: 'src/utils.js',
            action: 'create',
            content: 'utility code'
          }
        ]
      };

      const result = await selfFixLoop.applyPatch('test-job-1', patch);

      expect(result.success).toBe(true);
      expect(result.totalChanges).toBe(2);
      expect(result.successfulChanges).toBe(2);
      expect(result.results).toHaveLength(2);
    });

    it('should emit patchApplied event', async () => {
      const patch = {
        description: 'Test patch',
        confidence: 0.8,
        changes: [
          {
            file: 'test.js',
            action: 'modify',
            content: 'content'
          }
        ]
      };

      let eventEmitted = false;
      selfFixLoop.on('patchApplied', (data) => {
        eventEmitted = true;
        expect(data.jobId).toBe('test-job-2');
        expect(data.success).toBe(true);
      });

      await selfFixLoop.applyPatch('test-job-2', patch);

      expect(eventEmitted).toBe(true);
    });
  });

  describe('getTestCommands', () => {
    it('should return jest commands for jest framework', () => {
      const commands = selfFixLoop.getTestCommands({ framework: 'jest' });
      expect(commands).toContain('pnpm test');
    });

    it('should return pytest commands for pytest framework', () => {
      const commands = selfFixLoop.getTestCommands({ framework: 'pytest' });
      expect(commands).toContain('pytest -v');
    });

    it('should return go test commands for go framework', () => {
      const commands = selfFixLoop.getTestCommands({ framework: 'go' });
      expect(commands).toContain('go test -v ./...');
    });

    it('should use provided test commands if available', () => {
      const customCommands = ['npm run custom-test'];
      const commands = selfFixLoop.getTestCommands({
        framework: 'jest',
        testCommands: customCommands
      });
      expect(commands).toEqual(customCommands);
    });
  });

  describe('escalateToHuman', () => {
    it('should create comprehensive escalation report', async () => {
      const fixSession = {
        jobId: 'test-job-3',
        iteration: 3,
        maxIterations: 3,
        testFailure: {
          error: 'Test failed',
          exitCode: 1,
          output: 'Test output',
          failingTests: ['test1']
        },
        codeContext: {
          framework: 'jest',
          files: ['app.js'],
          dependencies: ['express']
        },
        attempts: [
          {
            iteration: 1,
            startedAt: new Date(),
            completedAt: new Date(),
            status: 'failed',
            patch: {
              description: 'First attempt',
              confidence: 0.7,
              changes: [{ file: 'app.js' }],
              llmMetadata: {
                provider: 'mock',
                model: 'mock-model',
                cost: 0.001
              }
            },
            patchResult: { success: true, totalChanges: 1, successfulChanges: 1 },
            testResult: { success: false, exitCode: 1, testsRun: 5, testsPassed: 4, testsFailed: 1 }
          }
        ]
      };

      const escalation = await selfFixLoop.escalateToHuman('test-job-3', fixSession);

      expect(escalation).toBeDefined();
      expect(escalation.jobId).toBe('test-job-3');
      expect(escalation.status).toBe('pending_human_review');
      expect(escalation.iterations).toBe(3);
      expect(escalation.attempts).toHaveLength(1);
      expect(escalation.summary).toBeDefined();
      expect(escalation.summary.totalCost).toBeGreaterThanOrEqual(0);
    });

    it('should emit escalatedToHuman event', async () => {
      const fixSession = {
        jobId: 'test-job-4',
        iteration: 3,
        maxIterations: 3,
        testFailure: {},
        codeContext: {},
        attempts: []
      };

      let eventEmitted = false;
      selfFixLoop.on('escalatedToHuman', (data) => {
        eventEmitted = true;
        expect(data.jobId).toBe('test-job-4');
      });

      await selfFixLoop.escalateToHuman('test-job-4', fixSession);

      expect(eventEmitted).toBe(true);
    });

    it('should store escalation for retrieval', async () => {
      const fixSession = {
        jobId: 'test-job-5',
        iteration: 3,
        maxIterations: 3,
        testFailure: {},
        codeContext: {},
        attempts: []
      };

      await selfFixLoop.escalateToHuman('test-job-5', fixSession);

      const escalation = selfFixLoop.getEscalation('test-job-5');
      expect(escalation).toBeDefined();
      expect(escalation.jobId).toBe('test-job-5');
    });
  });

  describe('getFixStats', () => {
    it('should return statistics about fix sessions', () => {
      const stats = selfFixLoop.getFixStats();

      expect(stats).toBeDefined();
      expect(stats.activeSessions).toBe(0);
      expect(stats.totalSessions).toBe(0);
      expect(stats.successfulFixes).toBe(0);
      expect(stats.failedFixes).toBe(0);
      expect(stats.escalatedFixes).toBe(0);
    });
  });

  describe('resolveEscalation', () => {
    it('should resolve an escalation', async () => {
      const fixSession = {
        jobId: 'test-job-6',
        iteration: 3,
        maxIterations: 3,
        testFailure: {},
        codeContext: {},
        attempts: []
      };

      await selfFixLoop.escalateToHuman('test-job-6', fixSession);

      const resolution = {
        resolvedBy: 'admin@example.com',
        solution: 'Fixed manually',
        notes: 'Updated validation logic'
      };

      const resolved = await selfFixLoop.resolveEscalation('test-job-6', resolution);

      expect(resolved.status).toBe('resolved');
      expect(resolved.resolution).toBeDefined();
      expect(resolved.resolution.resolvedBy).toBe('admin@example.com');
    });

    it('should throw error when escalation not found', async () => {
      await expect(
        selfFixLoop.resolveEscalation('non-existent-job', {})
      ).rejects.toThrow('No escalation found');
    });
  });
});
