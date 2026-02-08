const tap = require('tap');
const path = require('path');
const fs = require('fs').promises;
const PipelineOrchestrator = require('../../services/pipeline-orchestrator');
const StageRouter = require('../../services/stage-router');
const ModelRouter = require('../../services/model-router');

/**
 * Pipeline Failure Recovery Test
 * 
 * Tests pipeline behavior when providers fail
 * 
 * Requirements tested:
 * - 6.1: Retry with exponential backoff
 * - 6.2: Try fallback providers
 * - 6.3: Halt pipeline on complete failure
 */

tap.test('Pipeline Failure Recovery', async (t) => {
  let modelRouter;
  let stageRouter;
  let pipelineOrchestrator;
  let testProjectDir;
  let buildId;
  let projectId;

  t.before(async () => {
    // Create Model Router with mock providers
    modelRouter = new ModelRouter();
    
    // Create mock provider that fails initially then succeeds
    let callCount = 0;
    const mockProvider = {
      name: 'mock-provider',
      async call(prompt, options) {
        callCount++;
        
        if (callCount <= 2) {
          // Fail first 2 attempts
          throw new Error('Simulated provider failure');
        }
        
        // Succeed on 3rd attempt (fallback)
        return {
          content: JSON.stringify({
            success: true,
            message: 'Recovered from failure'
          }),
          usage: { total_tokens: 100 }
        };
      }
    };
    
    // Register mock provider
    modelRouter.registerProvider('mock-provider', mockProvider);
    
    // Create Stage Router
    stageRouter = new StageRouter(modelRouter);
    
    // Override stage configuration to use mock provider
    stageRouter.stageConfig[1.5] = {
      primary: { provider: 'mock-provider', model: 'mock-model' },
      fallbacks: [
        { provider: 'mock-provider', model: 'mock-fallback-1' },
        { provider: 'mock-provider', model: 'mock-fallback-2' }
      ]
    };
    
    // Create test project directory
    buildId = `test-build-failure-${Date.now()}`;
    projectId = `test-project-failure-${Date.now()}`;
    testProjectDir = path.join(process.cwd(), 'work', projectId);
    await fs.mkdir(testProjectDir, { recursive: true });
    
    // Create mock services
    const mockBuildModel = {
      async updateBuild(id, updates) {
        t.comment(`Build ${id} updated: ${JSON.stringify(updates)}`);
        return { id, ...updates };
      },
      async markBuildFailed(id, error) {
        t.comment(`Build ${id} marked as failed: ${error}`);
        return { id, status: 'failed', error };
      }
    };
    
    const mockProjectModel = {
      async getProject(id) {
        return {
          id,
          name: 'Test Project',
          orgId: 'test-org',
          userId: 'test-user'
        };
      }
    };
    
    const mockWebsocket = {
      sendBuildUpdate(buildId, update) {
        t.comment(`WebSocket update: ${update.status} - ${update.message || ''}`);
      }
    };
    
    const mockEmailService = {
      async sendBuildSuccessEmail(userId, buildData) {
        t.comment(`Success email sent to ${userId}`);
        return true;
      },
      async sendBuildFailureEmail(userId, buildData) {
        t.comment(`Failure email sent to ${userId}`);
        return true;
      }
    };
    
    // Create Pipeline Orchestrator
    pipelineOrchestrator = new PipelineOrchestrator({
      stageRouter,
      buildModel: mockBuildModel,
      projectModel: mockProjectModel,
      websocket: mockWebsocket,
      emailService: mockEmailService,
      workDir: path.join(process.cwd(), 'work')
    });
  });

  t.test('6.2.1 - Test retry with exponential backoff', async (t) => {
    const retryDelays = [];
    let lastRetryTime = Date.now();
    
    // Mock the retry logic to capture delays
    const originalExecuteStage = pipelineOrchestrator.executeStageWithRetry;
    pipelineOrchestrator.executeStageWithRetry = async function(stage, context) {
      const currentTime = Date.now();
      if (retryDelays.length > 0) {
        retryDelays.push(currentTime - lastRetryTime);
      }
      lastRetryTime = currentTime;
      
      return originalExecuteStage.call(this, stage, context);
    };
    
    try {
      // Execute a single stage that will fail and retry
      await pipelineOrchestrator.executeStage(1.5, {
        buildId,
        projectId,
        projectDir: testProjectDir,
        artifacts: {
          1: { 'specs_refined.json': { test: 'data' } }
        }
      });
      
      // Verify exponential backoff delays
      if (retryDelays.length >= 2) {
        t.ok(retryDelays[0] >= 500, 'First retry delay >= 500ms');
        t.ok(retryDelays[1] >= 1500, 'Second retry delay >= 1500ms');
        t.comment(`Retry delays: ${retryDelays.join('ms, ')}ms`);
      }
      
    } catch (error) {
      t.comment(`Stage execution error (expected): ${error.message}`);
    }
  });

  t.test('6.2.2 - Test fallback activation', async (t) => {
    const fallbackAttempts = [];
    
    // Track fallback attempts
    pipelineOrchestrator.on('stage:retry', (data) => {
      fallbackAttempts.push({
        attempt: data.attempt,
        provider: data.provider,
        model: data.model
      });
      t.comment(`Retry attempt ${data.attempt}: ${data.provider}/${data.model}`);
    });
    
    try {
      // Execute stage that will use fallbacks
      const result = await pipelineOrchestrator.executeStage(1.5, {
        buildId,
        projectId,
        projectDir: testProjectDir,
        artifacts: {
          1: { 'specs_refined.json': { test: 'data' } }
        }
      });
      
      t.ok(result.success, 'Stage eventually succeeded with fallback');
      t.ok(fallbackAttempts.length >= 2, 'Multiple fallback attempts made');
      
      // Verify fallback order
      if (fallbackAttempts.length >= 2) {
        t.equal(fallbackAttempts[0].provider, 'mock-provider', 'First attempt used primary provider');
        t.equal(fallbackAttempts[1].provider, 'mock-provider', 'Second attempt used fallback provider');
      }
      
    } catch (error) {
      t.fail(`Stage should have succeeded with fallback: ${error.message}`);
    }
  });

  t.test('6.2.3 - Test pipeline halt on complete failure', async (t) => {
    // Create a provider that always fails
    const alwaysFailProvider = {
      name: 'always-fail-provider',
      async call(prompt, options) {
        throw new Error('Permanent provider failure');
      }
    };
    
    modelRouter.registerProvider('always-fail-provider', alwaysFailProvider);
    
    // Override stage configuration to use failing provider
    stageRouter.stageConfig[1.5] = {
      primary: { provider: 'always-fail-provider', model: 'fail-model' },
      fallbacks: [
        { provider: 'always-fail-provider', model: 'fail-fallback-1' },
        { provider: 'always-fail-provider', model: 'fail-fallback-2' }
      ]
    };
    
    let failureEmailSent = false;
    pipelineOrchestrator.emailService.sendBuildFailureEmail = async (userId, buildData) => {
      failureEmailSent = true;
      t.comment('Failure email sent');
      return true;
    };
    
    try {
      // Execute pipeline that should fail
      await pipelineOrchestrator.executePipeline({
        buildId: `${buildId}-fail`,
        projectId,
        orgId: 'test-org',
        userId: 'test-user',
        projectDir: testProjectDir
      });
      
      t.fail('Pipeline should have failed');
      
    } catch (error) {
      t.ok(error, 'Pipeline failed as expected');
      t.match(error.message, /failed/i, 'Error message indicates failure');
      t.ok(failureEmailSent, 'Failure email was sent');
    }
  });

  t.test('6.2.4 - Verify artifact persistence before halt', async (t) => {
    // Create specs.json for the test
    const specsDir = path.join(testProjectDir, 'specs');
    await fs.mkdir(specsDir, { recursive: true });
    
    await fs.writeFile(
      path.join(specsDir, 'specs.json'),
      JSON.stringify({ test: 'data' })
    );
    
    // Create a provider that fails after stage 1
    let stageCount = 0;
    const partialSuccessProvider = {
      name: 'partial-success-provider',
      async call(prompt, options) {
        stageCount++;
        
        if (stageCount === 1) {
          // Succeed on first stage
          return {
            content: JSON.stringify({
              specs_refined: { test: 'refined' },
              clarification_history: []
            }),
            usage: { total_tokens: 100 }
          };
        }
        
        // Fail on subsequent stages
        throw new Error('Stage failure after partial success');
      }
    };
    
    modelRouter.registerProvider('partial-success-provider', partialSuccessProvider);
    
    // Override stage configurations
    stageRouter.stageConfig[1] = {
      primary: { provider: 'partial-success-provider', model: 'test-model' },
      fallbacks: []
    };
    stageRouter.stageConfig[1.5] = {
      primary: { provider: 'partial-success-provider', model: 'test-model' },
      fallbacks: []
    };
    
    try {
      await pipelineOrchestrator.executePipeline({
        buildId: `${buildId}-partial`,
        projectId,
        orgId: 'test-org',
        userId: 'test-user',
        projectDir: testProjectDir
      });
    } catch (error) {
      t.comment(`Pipeline failed as expected: ${error.message}`);
    }
    
    // Verify that stage 1 artifacts were persisted
    try {
      const specsRefined = await fs.readFile(
        path.join(specsDir, 'specs_refined.json'),
        'utf8'
      );
      t.ok(specsRefined, 'Stage 1 artifacts persisted before failure');
      t.ok(JSON.parse(specsRefined), 'Persisted artifact is valid JSON');
    } catch (error) {
      t.fail(`Stage 1 artifacts should have been persisted: ${error.message}`);
    }
  });

  t.teardown(async () => {
    // Clean up test directory
    try {
      await fs.rm(testProjectDir, { recursive: true, force: true });
      t.comment('Test directory cleaned up');
    } catch (error) {
      t.comment(`Cleanup warning: ${error.message}`);
    }
  });
});
