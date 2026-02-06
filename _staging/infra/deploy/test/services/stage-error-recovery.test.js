/**
 * Stage Error Recovery Tests
 * 
 * Tests error recovery for all pipeline stage handlers
 * Requirements: 1.4, 2.4, 3.5, 4.4, 5.5, 6.4, 7.4, 8.4
 */

const path = require('path');
const fs = require('fs').promises;
const PipelineOrchestrator = require('../../services/pipeline-orchestrator');

// Mock dependencies
const mockStageRouter = {
  callStageModel: jest.fn().mockResolvedValue({
    content: JSON.stringify({ test: 'data' })
  })
};

const mockBuildModel = {
  findById: jest.fn().mockResolvedValue({
    update: jest.fn(),
    updateStageStatus: jest.fn(),
    logStageError: jest.fn(),
    markFailedAtStage: jest.fn(),
    storeStageArtifacts: jest.fn()
  })
};

const mockProjectModel = {
  findById: jest.fn().mockResolvedValue({
    name: 'Test Project',
    update: jest.fn()
  })
};

describe('Stage Error Recovery', () => {
  let orchestrator;
  let testWorkDir;

  beforeEach(async () => {
    testWorkDir = path.join(process.cwd(), 'test-work-' + Date.now());
    await fs.mkdir(testWorkDir, { recursive: true });

    orchestrator = new PipelineOrchestrator({
      stageRouter: mockStageRouter,
      buildModel: mockBuildModel,
      projectModel: mockProjectModel,
      workDir: testWorkDir
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(testWorkDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('Clarifier stage throws enhanced error with context', async () => {
    const context = {
      buildId: 'test-build-1',
      projectId: 'test-project-1',
      orgId: 'test-org-1',
      projectDir: path.join(testWorkDir, 'test-project-1'),
      artifacts: {}
    };

    await fs.mkdir(path.join(context.projectDir, 'specs'), { recursive: true });

    const stage = { name: 'clarifier', timeout: 5000, retries: 2 };

    await expect(orchestrator.handleClarifierStage(stage, context)).rejects.toMatchObject({
      stage: 'clarifier',
      stageNumber: 1,
      buildId: 'test-build-1'
    });
  });

  test('All stage handlers throw errors with consistent properties', async () => {
    const stages = [
      { handler: 'handleNormalizerStage', stage: 'normalizer', stageNumber: 1.5 },
      { handler: 'handleDocsCreatorStage', stage: 'docs-creator', stageNumber: 2 },
      { handler: 'handleSchemaGeneratorStage', stage: 'schema-generator', stageNumber: 3 }
    ];

    for (const stageInfo of stages) {
      const context = {
        buildId: `test-${stageInfo.stage}`,
        projectId: `proj-${stageInfo.stage}`,
        orgId: 'test-org',
        projectDir: path.join(testWorkDir, stageInfo.stage),
        artifacts: {}
      };

      await fs.mkdir(path.join(context.projectDir, 'specs'), { recursive: true });
      await fs.mkdir(path.join(context.projectDir, 'docs'), { recursive: true });

      const stage = { name: stageInfo.stage, timeout: 5000, retries: 2 };

      try {
        await orchestrator[stageInfo.handler](stage, context);
        fail('Should have thrown error');
      } catch (error) {
        expect(error.stage).toBe(stageInfo.stage);
        expect(error.stageNumber).toBe(stageInfo.stageNumber);
        expect(error.buildId).toBe(context.buildId);
        expect(error.originalError).toBeDefined();
        expect(error.message).toContain('Build ID:');
        expect(error.message).toContain('Project ID:');
      }
    }
  });
});
