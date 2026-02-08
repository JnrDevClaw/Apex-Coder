/**
 * Pipeline Stage Handlers Integration Test
 * 
 * Tests that all stage handlers are properly integrated with the pipeline orchestrator
 * and that stage transitions work correctly across all 9 stages.
 * 
 * Task 5: Integrate stage handlers with pipeline orchestrator
 */

const path = require('path');
const fs = require('fs').promises;
const PipelineOrchestrator = require('../../services/pipeline-orchestrator');

describe('Pipeline Stage Handlers Integration', () => {
  let orchestrator;
  let mockStageRouter;
  let mockArtifactStorage;
  let mockBuildModel;
  let mockProjectModel;
  let mockWebsocket;
  let mockEmailService;
  let testProjectDir;

  beforeEach(async () => {
    // Create test project directory
    testProjectDir = path.join(process.cwd(), 'test-pipeline-integration-' + Date.now());
    await fs.mkdir(testProjectDir, { recursive: true });

    // Mock stage router with all stage handlers
    mockStageRouter = {
      callStageModel: jest.fn(async (stageNumber, prompt, options) => {
        // Return mock responses based on stage
        switch (stageNumber) {
          case 1: // Clarifier
            return { content: 'SPECIFICATION_COMPLETE' };
          case 1.5: // Normalizer
            return {
              content: JSON.stringify({
                projectName: 'Test Project',
                features: ['auth', 'api'],
                normalized: true
              })
            };
          case 2: // Docs Creator
            return { content: '# Test Documentation\n\n## Features\n\n- Authentication\n- API' };
          case 3: // Schema Generator
            return { content: JSON.stringify({ users: { id: 'string', email: 'string' } }) };
          case 3.5: // Structural Validator
            return { content: '[]' };
          case 4: // File Structure Generator
            return {
              content: JSON.stringify({
                'src/index.js': 'Main entry point',
                'src/auth.js': 'Authentication module'
              })
            };
          case 5: // Validator
            return {
              content: JSON.stringify({
                'src/index.js': 'Main entry point',
                'src/auth.js': 'Authentication module'
              })
            };
          default:
            return { content: '{}' };
        }
      }),
      callStage7Models: jest.fn(async (params, options) => {
        return {
          code: `// Generated code for ${params.file_path}\n\nmodule.exports = {};`,
          totalTokens: 100,
          totalCost: 0.001
        };
      })
    };

    // Mock artifact storage
    mockArtifactStorage = {
      getArtifactUrl: jest.fn(async (buildId, artifactName) => {
        return `https://s3.example.com/${buildId}/${artifactName}`;
      })
    };

    // Mock build model
    mockBuildModel = {
      findById: jest.fn(async (projectId, buildId) => {
        return {
          update: jest.fn(async (data) => {}),
          updateStageStatus: jest.fn(async (stageName, status, data) => {}),
          logStageError: jest.fn(async (stageName, stageNumber, error, metadata) => {}),
          markFailedAtStage: jest.fn(async (stageNumber, stageName, errorMessage) => {}),
          storeStageArtifacts: jest.fn(async (stageName, metadata) => {}),
          getUser: jest.fn(async (userId) => {
            return {
              id: userId,
              email: 'test@example.com',
              aws_access_key: null
            };
          })
        };
      })
    };

    // Mock project model
    mockProjectModel = {
      findById: jest.fn(async (orgId, projectId) => {
        return {
          name: 'Test Project',
          description: 'Test project description',
          visibility: 'private',
          update: jest.fn(async (data) => {})
        };
      })
    };

    // Mock websocket
    mockWebsocket = {
      sendBuildStatus: jest.fn((buildId, status, data) => {}),
      sendPhaseUpdate: jest.fn((buildId, phase, status, data) => {}),
      sendError: jest.fn((buildId, error, phase) => {}),
      sendBuildProgress: jest.fn((buildId, data) => {})
    };

    // Mock email service
    mockEmailService = {
      sendBuildStartedNotification: jest.fn(async (userId, data) => {}),
      sendBuildFailedNotification: jest.fn(async (userId, data, error) => {}),
      sendBuildCompletedNotification: jest.fn(async (userId, data) => {})
    };

    // Create orchestrator instance
    orchestrator = new PipelineOrchestrator({
      stageRouter: mockStageRouter,
      artifactStorage: mockArtifactStorage,
      buildModel: mockBuildModel,
      projectModel: mockProjectModel,
      websocket: mockWebsocket,
      emailService: mockEmailService,
      workDir: testProjectDir
    });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testProjectDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('All stage handlers are properly bound to orchestrator instance', () => {
    const expectedHandlers = [
      'handleQuestionnaireStage',
      'handleClarifierStage',
      'handleNormalizerStage',
      'handleDocsCreatorStage',
      'handleSchemaGeneratorStage',
      'handleStructuralValidatorStage',
      'handleFileStructureGeneratorStage',
      'handleValidatorStage',
      'handleEmptyFileCreationStage',
      'handleCodeGenerationStage',
      'handleRepoCreationStage',
      'handleAWSDeploymentStage'
    ];

    for (const handlerName of expectedHandlers) {
      expect(typeof orchestrator[handlerName]).toBe('function');
    }
  });

  test('Stage transitions work correctly between all stages', () => {
    expect(orchestrator.getNextStage(0)).toBe(1);
    expect(orchestrator.getNextStage(1)).toBe(1.5);
    expect(orchestrator.getNextStage(1.5)).toBe(2);
    expect(orchestrator.getNextStage(2)).toBe(3);
    expect(orchestrator.getNextStage(3)).toBe(3.5);
    expect(orchestrator.getNextStage(3.5)).toBe(4);
    expect(orchestrator.getNextStage(4)).toBe(5);
    expect(orchestrator.getNextStage(5)).toBe(6);
    expect(orchestrator.getNextStage(6)).toBe(7);
    expect(orchestrator.getNextStage(7)).toBe(8);
    expect(orchestrator.getNextStage(8)).toBe(9);
    expect(orchestrator.getNextStage(9)).toBeNull();
  });

  test('Stage 0 (Questionnaire) handler works correctly', async () => {
    const stage = orchestrator.PIPELINE_STAGES[0];
    const context = {
      buildId: 'test-build-1',
      projectId: 'test-project-1',
      orgId: 'test-org-1',
      userId: 'test-user-1',
      specJson: { projectName: 'Test', features: [] },
      projectDir: testProjectDir
    };

    const result = await orchestrator.handleQuestionnaireStage(stage, context);

    expect(result.success).toBe(true);
    expect(result.artifacts['specs.json']).toBeDefined();
    expect(result.artifacts['specs.json']).toEqual(context.specJson);
  });

  test('Artifact persistence works correctly', async () => {
    const context = {
      buildId: 'test-build-1',
      projectId: 'test-project-1',
      orgId: 'test-org-1',
      userId: 'test-user-1',
      specJson: { projectName: 'Test' },
      projectDir: testProjectDir,
      artifacts: {},
      completedStages: []
    };

    // Create project directory structure
    await orchestrator.createProjectDirectoryStructure(testProjectDir);

    // Stage 0: Questionnaire
    const stage0Result = await orchestrator.handleQuestionnaireStage(
      orchestrator.PIPELINE_STAGES[0],
      context
    );

    // Persist artifacts
    await orchestrator.persistStageArtifacts(
      0,
      orchestrator.PIPELINE_STAGES[0],
      context,
      stage0Result.artifacts
    );

    // Verify specs.json was persisted
    const specsPath = path.join(testProjectDir, 'specs', 'specs.json');
    const specsExists = await fs.access(specsPath).then(() => true).catch(() => false);
    expect(specsExists).toBe(true);

    // Verify content
    const specsContent = await fs.readFile(specsPath, 'utf8');
    const specs = JSON.parse(specsContent);
    expect(specs.projectName).toBe('Test');
  });

  test('WebSocket progress updates are sent for each stage', async () => {
    const context = {
      buildId: 'test-build-1',
      projectId: 'test-project-1',
      orgId: 'test-org-1',
      userId: 'test-user-1',
      specJson: { projectName: 'Test' },
      projectDir: testProjectDir,
      artifacts: {},
      completedStages: []
    };

    // Create project directory
    await orchestrator.createProjectDirectoryStructure(testProjectDir);

    // Execute Stage 0
    await orchestrator.executeStage(0, context);

    // Verify WebSocket updates were sent
    expect(mockWebsocket.sendPhaseUpdate).toHaveBeenCalled();
    expect(mockWebsocket.sendBuildProgress).toHaveBeenCalled();

    // Check for started and completed updates
    const phaseUpdateCalls = mockWebsocket.sendPhaseUpdate.mock.calls;
    const startedCall = phaseUpdateCalls.find(call => call[2] === 'started');
    const completedCall = phaseUpdateCalls.find(call => call[2] === 'completed');

    expect(startedCall).toBeDefined();
    expect(completedCall).toBeDefined();
  });

  test('Stage 6 (Empty File Creation) creates files correctly', async () => {
    const stage = orchestrator.PIPELINE_STAGES[6];
    const context = {
      buildId: 'test-build-1',
      projectId: 'test-project-1',
      orgId: 'test-org-1',
      userId: 'test-user-1',
      projectDir: testProjectDir
    };

    // Create validated_structure.json
    const specsDir = path.join(testProjectDir, 'specs');
    await fs.mkdir(specsDir, { recursive: true });
    await fs.writeFile(
      path.join(specsDir, 'validated_structure.json'),
      JSON.stringify({
        'src/index.js': 'Main entry point',
        'src/auth.js': 'Authentication module'
      }),
      'utf8'
    );

    const result = await orchestrator.handleEmptyFileCreationStage(stage, context);

    expect(result.success).toBe(true);
    expect(result.artifacts['empty_files_created']).toBeDefined();
    expect(result.artifacts['empty_files_created'].count).toBe(2);

    // Verify files were actually created
    const codeDir = path.join(testProjectDir, 'code');
    const indexExists = await fs.access(path.join(codeDir, 'src/index.js')).then(() => true).catch(() => false);
    const authExists = await fs.access(path.join(codeDir, 'src/auth.js')).then(() => true).catch(() => false);

    expect(indexExists).toBe(true);
    expect(authExists).toBe(true);
  });

  test('Artifact flow works correctly between stages', async () => {
    const context = {
      buildId: 'test-build-1',
      projectId: 'test-project-1',
      orgId: 'test-org-1',
      userId: 'test-user-1',
      specJson: { projectName: 'Test' },
      projectDir: testProjectDir,
      artifacts: {},
      completedStages: []
    };

    // Create project directory structure
    await orchestrator.createProjectDirectoryStructure(testProjectDir);

    // Stage 0: Questionnaire
    const stage0Result = await orchestrator.handleQuestionnaireStage(
      orchestrator.PIPELINE_STAGES[0],
      context
    );
    context.artifacts[0] = stage0Result.artifacts;

    // Persist artifacts
    await orchestrator.persistStageArtifacts(
      0,
      orchestrator.PIPELINE_STAGES[0],
      context,
      stage0Result.artifacts
    );

    // Stage 1: Clarifier (reads specs.json from Stage 0)
    const stage1Result = await orchestrator.handleClarifierStage(
      orchestrator.PIPELINE_STAGES[1],
      context
    );
    context.artifacts[1] = stage1Result.artifacts;

    expect(stage1Result.artifacts['specs_refined.json']).toBeDefined();

    // Persist Stage 1 artifacts
    await orchestrator.persistStageArtifacts(
      1,
      orchestrator.PIPELINE_STAGES[1],
      context,
      stage1Result.artifacts
    );

    // Stage 1.5: Normalizer (reads specs_refined.json from Stage 1)
    const stage1_5Result = await orchestrator.handleNormalizerStage(
      orchestrator.PIPELINE_STAGES[1.5],
      context
    );
    context.artifacts[1.5] = stage1_5Result.artifacts;

    expect(stage1_5Result.artifacts['specs_clean.json']).toBeDefined();
    expect(stage1_5Result.artifacts['specs_clean.json'].normalized).toBe(true);
  });

  test('All 9 stages are defined in PIPELINE_STAGES', () => {
    const expectedStages = [0, 1, 1.5, 2, 3, 3.5, 4, 5, 6, 7, 8, 9];
    
    for (const stageNumber of expectedStages) {
      expect(orchestrator.PIPELINE_STAGES[stageNumber]).toBeDefined();
      expect(orchestrator.PIPELINE_STAGES[stageNumber].name).toBeDefined();
      expect(orchestrator.PIPELINE_STAGES[stageNumber].handler).toBeDefined();
    }
  });

  test('Each stage has correct input and output artifacts defined', () => {
    const stages = orchestrator.PIPELINE_STAGES;
    
    // Stage 0
    expect(stages[0].inputArtifacts).toEqual([]);
    expect(stages[0].outputArtifacts).toContain('specs.json');
    
    // Stage 1
    expect(stages[1].inputArtifacts).toContain('specs.json');
    expect(stages[1].outputArtifacts).toContain('specs_refined.json');
    
    // Stage 1.5
    expect(stages[1.5].inputArtifacts).toContain('specs_refined.json');
    expect(stages[1.5].outputArtifacts).toContain('specs_clean.json');
    
    // Stage 2
    expect(stages[2].inputArtifacts).toContain('specs_clean.json');
    expect(stages[2].outputArtifacts).toContain('docs.md');
    
    // Stage 3
    expect(stages[3].inputArtifacts).toContain('docs.md');
    expect(stages[3].outputArtifacts).toContain('schema.json');
    
    // Stage 4
    expect(stages[4].inputArtifacts).toContain('docs.md');
    expect(stages[4].outputArtifacts).toContain('file_structure.json');
    
    // Stage 5
    expect(stages[5].inputArtifacts).toContain('file_structure.json');
    expect(stages[5].outputArtifacts).toContain('validated_structure.json');
    
    // Stage 6
    expect(stages[6].inputArtifacts).toContain('validated_structure.json');
    expect(stages[6].outputArtifacts).toContain('empty_files_created');
    
    // Stage 7
    expect(stages[7].inputArtifacts).toContain('validated_structure.json');
    expect(stages[7].outputArtifacts).toContain('generated_code_files');
    
    // Stage 8
    expect(stages[8].inputArtifacts).toContain('generated_code_files');
    expect(stages[8].outputArtifacts).toContain('github_repo_url');
  });
});
