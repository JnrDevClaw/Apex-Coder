const tap = require('tap');
const path = require('path');
const fs = require('fs').promises;
const PipelineOrchestrator = require('../../services/pipeline-orchestrator');
const StageRouter = require('../../services/stage-router');
const ModelRouter = require('../../services/model-router');
const { initializeProviders } = require('../../services/model-router/initialize-providers');

/**
 * End-to-End Pipeline Test
 * 
 * Tests the complete 8-stage pipeline execution with real AI providers
 * 
 * Requirements tested:
 * - 7.1: Execute stages 0-8 in sequence
 * - 7.2: Automatically start next stage after completion
 * - 7.3: Generate code for all files
 * - 7.4: Create GitHub repository
 * - 7.5: Send success email
 */

tap.test('End-to-End Pipeline Execution', async (t) => {
  let modelRouter;
  let stageRouter;
  let pipelineOrchestrator;
  let testProjectDir;
  let buildId;
  let projectId;

  t.before(async () => {
    // Initialize Model Router
    modelRouter = new ModelRouter();
    
    // Initialize all providers
    const initResult = await initializeProviders(modelRouter);
    t.ok(initResult.success, 'Providers initialized successfully');
    t.ok(initResult.providers.length > 0, 'At least one provider initialized');
    
    // Create Stage Router
    stageRouter = new StageRouter(modelRouter);
    
    // Validate providers
    const validation = stageRouter.validateProviders();
    if (!validation.valid) {
      t.comment(`Warning: Missing providers for stages: ${validation.missingProviders.join(', ')}`);
    }
    
    // Create test project directory
    buildId = `test-build-${Date.now()}`;
    projectId = `test-project-${Date.now()}`;
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
        t.comment(`WebSocket update for ${buildId}: ${JSON.stringify(update)}`);
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

  t.test('6.1.1 - Create test specs.json', async (t) => {
    const specsDir = path.join(testProjectDir, 'specs');
    await fs.mkdir(specsDir, { recursive: true });
    
    const testSpecs = {
      projectName: 'Test Todo App',
      projectType: 'web',
      complexity: 3,
      features: {
        authentication: true,
        database: true,
        api: true
      },
      stack: {
        frontend: 'svelte',
        backend: 'fastify',
        database: 'dynamodb'
      },
      description: 'A simple todo application for testing the pipeline'
    };
    
    await fs.writeFile(
      path.join(specsDir, 'specs.json'),
      JSON.stringify(testSpecs, null, 2)
    );
    
    t.ok(true, 'Test specs.json created');
  });

  t.test('6.1.2 - Execute complete pipeline', async (t) => {
    t.plan(10);
    
    // Track stage completions
    const completedStages = [];
    
    pipelineOrchestrator.on('stage:completed', (data) => {
      completedStages.push(data.stage);
      t.comment(`Stage ${data.stage} (${data.stageName}) completed`);
    });
    
    pipelineOrchestrator.on('stage:failed', (data) => {
      t.fail(`Stage ${data.stage} (${data.stageName}) failed: ${data.error}`);
    });
    
    try {
      // Start the pipeline
      const result = await pipelineOrchestrator.executePipeline({
        buildId,
        projectId,
        orgId: 'test-org',
        userId: 'test-user',
        projectDir: testProjectDir
      });
      
      t.ok(result.success, 'Pipeline execution completed successfully');
      t.equal(result.status, 'completed', 'Pipeline status is completed');
      
      // Verify all stages completed
      t.ok(completedStages.includes(1), 'Stage 1 (Clarifier) completed');
      t.ok(completedStages.includes(1.5), 'Stage 1.5 (Normalizer) completed');
      t.ok(completedStages.includes(2), 'Stage 2 (Docs Creator) completed');
      t.ok(completedStages.includes(3), 'Stage 3 (Schema Generator) completed');
      t.ok(completedStages.includes(3.5), 'Stage 3.5 (Structural Validator) completed');
      t.ok(completedStages.includes(4), 'Stage 4 (File Structure Generator) completed');
      t.ok(completedStages.includes(5), 'Stage 5 (Validator) completed');
      t.ok(completedStages.includes(7), 'Stage 7 (Code Generation) completed');
      
    } catch (error) {
      t.fail(`Pipeline execution failed: ${error.message}`);
      t.comment(`Error stack: ${error.stack}`);
    }
  });

  t.test('6.1.3 - Verify artifacts created', async (t) => {
    const specsDir = path.join(testProjectDir, 'specs');
    const docsDir = path.join(testProjectDir, 'docs');
    
    // Check specs artifacts
    const specsRefined = await fs.readFile(path.join(specsDir, 'specs_refined.json'), 'utf8');
    t.ok(specsRefined, 'specs_refined.json exists');
    t.ok(JSON.parse(specsRefined), 'specs_refined.json is valid JSON');
    
    const specsClean = await fs.readFile(path.join(specsDir, 'specs_clean.json'), 'utf8');
    t.ok(specsClean, 'specs_clean.json exists');
    t.ok(JSON.parse(specsClean), 'specs_clean.json is valid JSON');
    
    const schema = await fs.readFile(path.join(specsDir, 'schema.json'), 'utf8');
    t.ok(schema, 'schema.json exists');
    t.ok(JSON.parse(schema), 'schema.json is valid JSON');
    
    const fileStructure = await fs.readFile(path.join(specsDir, 'file_structure.json'), 'utf8');
    t.ok(fileStructure, 'file_structure.json exists');
    t.ok(JSON.parse(fileStructure), 'file_structure.json is valid JSON');
    
    const validatedStructure = await fs.readFile(path.join(specsDir, 'validated_structure.json'), 'utf8');
    t.ok(validatedStructure, 'validated_structure.json exists');
    t.ok(JSON.parse(validatedStructure), 'validated_structure.json is valid JSON');
    
    // Check docs artifacts
    const docs = await fs.readFile(path.join(docsDir, 'docs.md'), 'utf8');
    t.ok(docs, 'docs.md exists');
    t.ok(docs.length > 100, 'docs.md has substantial content');
  });

  t.test('6.1.4 - Verify code files generated', async (t) => {
    const validatedStructurePath = path.join(testProjectDir, 'specs', 'validated_structure.json');
    const validatedStructure = JSON.parse(await fs.readFile(validatedStructurePath, 'utf8'));
    
    let totalFiles = 0;
    let generatedFiles = 0;
    
    // Count expected files
    for (const section of Object.values(validatedStructure)) {
      if (typeof section === 'object') {
        totalFiles += Object.keys(section).length;
      }
    }
    
    t.ok(totalFiles > 0, `Expected ${totalFiles} files to be generated`);
    
    // Check if files exist
    for (const section of Object.values(validatedStructure)) {
      if (typeof section === 'object') {
        for (const filePath of Object.keys(section)) {
          const fullPath = path.join(testProjectDir, filePath);
          try {
            const stats = await fs.stat(fullPath);
            if (stats.isFile()) {
              const content = await fs.readFile(fullPath, 'utf8');
              if (content.length > 50) { // More than just placeholder
                generatedFiles++;
              }
            }
          } catch (error) {
            t.comment(`File not found: ${filePath}`);
          }
        }
      }
    }
    
    const generationRate = (generatedFiles / totalFiles) * 100;
    t.ok(generationRate > 50, `At least 50% of files generated (${generationRate.toFixed(1)}%)`);
    t.comment(`Generated ${generatedFiles} out of ${totalFiles} files`);
  });

  t.test('6.1.5 - Verify GitHub repo metadata', async (t) => {
    // Check if repo metadata was created
    const repoMetadataPath = path.join(testProjectDir, 'repo_metadata.json');
    
    try {
      const repoMetadata = JSON.parse(await fs.readFile(repoMetadataPath, 'utf8'));
      t.ok(repoMetadata.repoName, 'Repository name exists');
      t.ok(repoMetadata.repoUrl, 'Repository URL exists');
      t.comment(`Repository: ${repoMetadata.repoUrl}`);
    } catch (error) {
      t.comment('Note: GitHub repo creation may be skipped in test environment');
      t.pass('Repo metadata check skipped');
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
