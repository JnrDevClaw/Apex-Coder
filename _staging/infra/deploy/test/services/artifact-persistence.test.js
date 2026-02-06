const path = require('path');
const fs = require('fs').promises;
const os = require('os');

/**
 * Artifact Persistence Tests
 * 
 * Verifies that artifacts are correctly persisted and read across all pipeline stages
 * Tests Requirements: 4.1, 4.2, 4.3, 4.4
 */

describe('Artifact Persistence', () => {
  let testDir;
  let PipelineOrchestrator;
  let orchestrator;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'artifact-test-'));
    
    // Load PipelineOrchestrator
    PipelineOrchestrator = require('../../services/pipeline-orchestrator');
    
    // Create mock dependencies
    const mockStageRouter = {
      callStageModel: async () => ({ content: '{"test": "data"}', provider: 'test', model: 'test' }),
      callStage7Models: async () => ({ promptBuilder: { content: 'prompt' }, codeGenerator: { content: 'code' } })
    };
    
    const mockBuildModel = {
      findById: async () => ({
        storeStageArtifacts: async () => {},
        logStageError: async () => {},
        updateStatus: async () => {},
        updateStage: async () => {}
      })
    };
    
    const mockProjectModel = {};
    const mockWebsocket = { sendUpdate: () => {} };
    const mockEmailService = { sendBuildCompleteEmail: async () => {}, sendBuildFailedEmail: async () => {} };
    
    orchestrator = new PipelineOrchestrator({
      stageRouter: mockStageRouter,
      artifactStorage: null,
      buildModel: mockBuildModel,
      projectModel: mockProjectModel,
      websocket: mockWebsocket,
      emailService: mockEmailService,
      workDir: testDir
    });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up test directory:', error);
    }
  });

  test('writeArtifact - should write string artifacts', async () => {
    const filePath = path.join(testDir, 'test', 'artifact.txt');
    const content = 'Test content';
    
    await orchestrator.writeArtifact(filePath, content);
    
    const written = await fs.readFile(filePath, 'utf8');
    expect(written).toBe(content);
  });

  test('writeArtifact - should write JSON artifacts', async () => {
    const filePath = path.join(testDir, 'test', 'artifact.json');
    const content = { test: 'data', nested: { value: 123 } };
    
    await orchestrator.writeArtifact(filePath, content);
    
    const written = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(written);
    expect(parsed).toEqual(content);
  });

  test('writeArtifact - should create directories if they don\'t exist', async () => {
    const filePath = path.join(testDir, 'deep', 'nested', 'path', 'artifact.json');
    const content = { test: 'data' };
    
    await orchestrator.writeArtifact(filePath, content);
    
    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  test('readArtifact - should read JSON artifacts', async () => {
    const filePath = path.join(testDir, 'test', 'artifact.json');
    const content = { test: 'data', value: 42 };
    
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(content), 'utf8');
    
    const read = await orchestrator.readArtifact(filePath);
    expect(read).toEqual(content);
  });

  test('readArtifact - should read string artifacts', async () => {
    const filePath = path.join(testDir, 'test', 'artifact.txt');
    const content = 'Test content\nMultiple lines';
    
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
    
    const read = await orchestrator.readArtifact(filePath);
    expect(read).toBe(content);
  });

  test('getArtifactPath - should place specs in specs/ directory', async () => {
    const projectDir = path.join(testDir, 'project');
    const artifactPath = orchestrator.getArtifactPath(projectDir, 'specs.json');
    
    expect(artifactPath).toBe(path.join(projectDir, 'specs', 'specs.json'));
  });

  test('getArtifactPath - should place markdown files in docs/ directory', async () => {
    const projectDir = path.join(testDir, 'project');
    const artifactPath = orchestrator.getArtifactPath(projectDir, 'docs.md');
    
    expect(artifactPath).toBe(path.join(projectDir, 'docs', 'docs.md'));
  });

  test('getArtifactPath - should place code artifacts in code/ directory', async () => {
    const projectDir = path.join(testDir, 'project');
    const artifactPath = orchestrator.getArtifactPath(projectDir, 'generated_code_files.json');
    
    expect(artifactPath).toBe(path.join(projectDir, 'code', 'generated_code_files.json'));
  });

  test('persistStageArtifacts - should persist all artifacts', async () => {
    const projectDir = path.join(testDir, 'project');
    const context = {
      buildId: 'test-build',
      projectId: 'test-project',
      projectDir
    };
    
    const stage = {
      name: 'test-stage',
      outputArtifacts: ['artifact1.json', 'artifact2.json']
    };
    
    const artifacts = {
      'artifact1.json': { data: 'test1' },
      'artifact2.json': { data: 'test2' }
    };
    
    await orchestrator.persistStageArtifacts(1, stage, context, artifacts);
    
    // Verify artifacts were written
    const artifact1Path = path.join(projectDir, 'specs', 'artifact1.json');
    const artifact2Path = path.join(projectDir, 'specs', 'artifact2.json');
    
    const artifact1Exists = await fs.access(artifact1Path).then(() => true).catch(() => false);
    const artifact2Exists = await fs.access(artifact2Path).then(() => true).catch(() => false);
    
    expect(artifact1Exists).toBe(true);
    expect(artifact2Exists).toBe(true);
    
    // Verify content
    const artifact1Content = await orchestrator.readArtifact(artifact1Path);
    const artifact2Content = await orchestrator.readArtifact(artifact2Path);
    
    expect(artifact1Content).toEqual(artifacts['artifact1.json']);
    expect(artifact2Content).toEqual(artifacts['artifact2.json']);
  });

  test('persistStageArtifacts - should handle empty artifacts gracefully', async () => {
    const projectDir = path.join(testDir, 'project');
    const context = {
      buildId: 'test-build',
      projectId: 'test-project',
      projectDir
    };
    
    const stage = {
      name: 'test-stage',
      outputArtifacts: []
    };
    
    // Should not throw
    await expect(
      orchestrator.persistStageArtifacts(1, stage, context, {})
    ).resolves.not.toThrow();
  });

  test('persistStageArtifacts - should continue on individual artifact failure', async () => {
    const projectDir = path.join(testDir, 'project');
    const context = {
      buildId: 'test-build',
      projectId: 'test-project',
      projectDir
    };
    
    const stage = {
      name: 'test-stage',
      outputArtifacts: ['good.json', 'bad.json']
    };
    
    const artifacts = {
      'good.json': { data: 'test' },
      'bad.json': { circular: null }
    };
    
    // Create circular reference that will fail JSON.stringify
    artifacts['bad.json'].circular = artifacts['bad.json'];
    
    // Should not throw - should continue with other artifacts
    await expect(
      orchestrator.persistStageArtifacts(1, stage, context, artifacts)
    ).resolves.not.toThrow();
    
    // Verify good artifact was still written
    const goodPath = path.join(projectDir, 'specs', 'good.json');
    const goodExists = await fs.access(goodPath).then(() => true).catch(() => false);
    expect(goodExists).toBe(true);
  });

  test('artifact recovery - should read artifacts from previous stages', async () => {
    const projectDir = path.join(testDir, 'project');
    
    // Simulate stage 1 output
    const specsPath = path.join(projectDir, 'specs', 'specs.json');
    await fs.mkdir(path.dirname(specsPath), { recursive: true });
    await fs.writeFile(specsPath, JSON.stringify({ projectName: 'Test' }), 'utf8');
    
    // Read artifact in stage 2
    const specs = await orchestrator.readArtifact(specsPath);
    
    expect(specs).toEqual({ projectName: 'Test' });
  });

  test('artifact recovery - should handle missing artifacts with clear error', async () => {
    const projectDir = path.join(testDir, 'project');
    const missingPath = path.join(projectDir, 'specs', 'missing.json');
    
    await expect(
      orchestrator.readArtifact(missingPath)
    ).rejects.toThrow();
  });

  test('cross-stage artifact flow - specs.json → specs_refined.json → specs_clean.json', async () => {
    const projectDir = path.join(testDir, 'project');
    
    // Stage 0: Write specs.json
    const specsPath = path.join(projectDir, 'specs', 'specs.json');
    const specs = { projectName: 'Test', features: ['auth', 'api'] };
    await orchestrator.writeArtifact(specsPath, specs);
    
    // Stage 1: Read specs.json, write specs_refined.json
    const readSpecs = await orchestrator.readArtifact(specsPath);
    expect(readSpecs).toEqual(specs);
    
    const specsRefinedPath = path.join(projectDir, 'specs', 'specs_refined.json');
    const specsRefined = { ...readSpecs, clarified: true };
    await orchestrator.writeArtifact(specsRefinedPath, specsRefined);
    
    // Stage 1.5: Read specs_refined.json, write specs_clean.json
    const readSpecsRefined = await orchestrator.readArtifact(specsRefinedPath);
    expect(readSpecsRefined).toEqual(specsRefined);
    
    const specsCleanPath = path.join(projectDir, 'specs', 'specs_clean.json');
    const specsClean = { ...readSpecsRefined, normalized: true };
    await orchestrator.writeArtifact(specsCleanPath, specsClean);
    
    // Verify final artifact
    const finalSpecs = await orchestrator.readArtifact(specsCleanPath);
    expect(finalSpecs).toEqual(specsClean);
    expect(finalSpecs.clarified).toBe(true);
    expect(finalSpecs.normalized).toBe(true);
  });

  test('cross-stage artifact flow - docs.md → schema.json → updated docs.md', async () => {
    const projectDir = path.join(testDir, 'project');
    
    // Stage 2: Write docs.md
    const docsPath = path.join(projectDir, 'docs', 'docs.md');
    const docs = '# Project Documentation\n\n## Features\n- Auth\n- API';
    await orchestrator.writeArtifact(docsPath, docs);
    
    // Stage 3: Read docs.md, write schema.json, update docs.md
    const readDocs = await orchestrator.readArtifact(docsPath);
    expect(readDocs).toBe(docs);
    
    const schemaPath = path.join(projectDir, 'specs', 'schema.json');
    const schema = { users: { id: 'string', email: 'string' } };
    await orchestrator.writeArtifact(schemaPath, schema);
    
    const updatedDocs = readDocs + '\n\n## Schema\n```json\n' + JSON.stringify(schema, null, 2) + '\n```';
    await orchestrator.writeArtifact(docsPath, updatedDocs);
    
    // Verify both artifacts
    const finalDocs = await orchestrator.readArtifact(docsPath);
    const finalSchema = await orchestrator.readArtifact(schemaPath);
    
    expect(finalDocs).toContain('Schema');
    expect(finalSchema).toEqual(schema);
  });
});
