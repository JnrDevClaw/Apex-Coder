/**
 * REAL Pipeline Integration Test
 * 
 * This test ACTUALLY CALLS the AI providers through the pipeline.
 * Uses real API keys from .env to test the full flow.
 * 
 * Run with: npx jest test/integration/pipeline-real.test.js --verbose --runInBand
 * 
 * ⚠️ WARNING: This test will consume API credits!
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const PipelineOrchestrator = require('../../services/pipeline-orchestrator');
const { ModelRouter } = require('../../services/model-router');
const StageRouter = require('../../services/stage-router');
const ArtifactStorage = require('../../services/artifact-storage');

const TEST_WORK_DIR = path.join(__dirname, '../../test-work-real');

// Real WebSocket-like emitter for logging
const realWebsocket = {
    emit: (event, data) => console.log(`[WS] ${event}:`, JSON.stringify(data, null, 2).slice(0, 200)),
    sendPhaseUpdate: (buildId, stage, status, data) => {
        console.log(`\n📌 [Stage: ${stage}] Status: ${status}`);
        if (data?.currentFile) console.log(`   File: ${data.currentFile}`);
        if (data?.percentage) console.log(`   Progress: ${data.percentage}%`);
    },
    sendBuildStatus: (buildId, status) => console.log(`\n🔨 Build Status: ${status}`),
    sendBuildProgress: (buildId, progress) => console.log(`   Progress: ${progress.percentage}%`),
    sendError: (buildId, error) => console.error(`\n❌ Error: ${error.message}`),
    sendProgress: (buildId, progress) => console.log(`   Progress: ${progress}%`)
};

// Real database mocks (these would connect to actual DB in production)
const mockBuildModel = {
    create: jest.fn().mockResolvedValue({ _id: 'real-build-id' }),
    findById: jest.fn().mockResolvedValue({
        _id: 'real-build-id',
        update: jest.fn().mockResolvedValue({}),
        save: jest.fn().mockResolvedValue({}),
        updateStageStatus: jest.fn().mockResolvedValue({}),
        storeStageArtifacts: jest.fn().mockResolvedValue({}),
        logStageError: jest.fn().mockResolvedValue({}),
        setStageCompleted: jest.fn().mockResolvedValue({}),
        markFailedAtStage: jest.fn().mockResolvedValue({}),
        markComplete: jest.fn().mockResolvedValue({})
    }),
    findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    getUser: jest.fn().mockResolvedValue({ _id: 'test-user', email: 'test@example.com' })
};

const mockEmailService = {
    sendTemplateEmail: jest.fn().mockResolvedValue(true),
    sendBuildStartedNotification: jest.fn().mockResolvedValue(true),
    sendBuildCompletedNotification: jest.fn().mockResolvedValue(true),
    sendBuildFailedNotification: jest.fn().mockResolvedValue(true)
};

const mockProjectModel = {
    findById: jest.fn().mockResolvedValue({ _id: 'test-project', name: 'SimpleTodo' })
};

describe('REAL AI Pipeline Integration', () => {
    let orchestrator;
    let modelRouter;
    let stageRouter;

    beforeAll(async () => {
        // Clean up and create test directory
        await fs.rm(TEST_WORK_DIR, { recursive: true, force: true }).catch(() => { });
        await fs.mkdir(TEST_WORK_DIR, { recursive: true });

        // Create REAL model router with actual API providers
        modelRouter = new ModelRouter();

        // MUST call initialize() to properly register providers
        await modelRouter.initialize({
            healthCheckOnStartup: false, // Skip health checks to speed up test
            healthCheckInterval: 0
        });

        // Log which providers are registered
        console.log('\n📡 Registered AI Providers:');
        for (const [name, provider] of modelRouter.providers) {
            console.log(`   ✅ ${name}`);
        }


        // Create REAL stage router that will call actual AI APIs
        stageRouter = new StageRouter(modelRouter);

        // Create orchestrator with real stage router
        orchestrator = new PipelineOrchestrator({
            stageRouter,
            modelRouter,
            websocket: realWebsocket,
            emailService: mockEmailService,
            buildModel: mockBuildModel,
            projectModel: mockProjectModel,
            artifactStorage: new ArtifactStorage({ localDir: TEST_WORK_DIR })
        });

        console.log('\n🚀 Pipeline initialized with REAL AI providers\n');
    }, 30000);

    // Test individual stages with real AI calls
    describe('Stage 1: Real Clarifier (HuggingFace/OpenRouter)', () => {
        it('should call real AI to refine specs', async () => {
            const specs = {
                appName: 'SimpleTodo',
                description: 'A simple to-do list application',
                features: ['Add task', 'Remove task', 'Mark complete', 'Filter tasks'],
                techStack: { frontend: 'SvelteKit', backend: 'Fastify', database: 'SQLite' }
            };

            console.log('\n📤 Sending specs to Clarifier AI...');

            try {
                const response = await stageRouter.callStageModel(1, JSON.stringify(specs, null, 2), {
                    context: { buildId: 'test-1', projectId: 'test' },
                    timeout: 60000
                });

                console.log('\n📥 Clarifier Response:');
                console.log(response.content?.slice(0, 500) + '...');

                expect(response).toBeDefined();
                expect(response.content).toBeDefined();
                expect(response.content.length).toBeGreaterThan(50);

                // Save the response
                const projectDir = path.join(TEST_WORK_DIR, 'test-project');
                await fs.mkdir(path.join(projectDir, 'specs'), { recursive: true });
                await fs.writeFile(
                    path.join(projectDir, 'specs', 'clarifier_response.txt'),
                    response.content
                );

                console.log('✅ Clarifier stage passed with real AI response');
            } catch (error) {
                console.error('❌ Clarifier failed:', error.message);
                throw error;
            }
        }, 120000);
    });

    describe('Stage 2: Real Docs Creator (Llama)', () => {
        it('should call real AI to generate documentation', async () => {
            const refinedSpecs = {
                appName: 'SimpleTodo',
                description: 'A to-do list app with CRUD operations',
                features: ['Add task', 'Remove task', 'Mark complete', 'Filter by status'],
                techStack: { frontend: 'SvelteKit', backend: 'Fastify', database: 'SQLite' },
                authentication: 'none'
            };

            console.log('\n📤 Sending specs to Docs Creator (Llama)...');

            try {
                const response = await stageRouter.callStageModel(2, JSON.stringify(refinedSpecs, null, 2), {
                    context: { buildId: 'test-2', projectId: 'test' },
                    timeout: 120000
                });

                console.log('\n📥 Docs Creator Response (first 800 chars):');
                console.log(response.content?.slice(0, 800));

                expect(response).toBeDefined();
                expect(response.content).toBeDefined();
                expect(response.content).toContain('#'); // Should have markdown headers

                // Save docs
                const projectDir = path.join(TEST_WORK_DIR, 'test-project');
                await fs.mkdir(path.join(projectDir, 'docs'), { recursive: true });
                await fs.writeFile(
                    path.join(projectDir, 'docs', 'docs.md'),
                    response.content
                );

                console.log('✅ Docs Creator stage passed with real AI response');
            } catch (error) {
                console.error('❌ Docs Creator failed:', error.message);
                throw error;
            }
        }, 180000);
    });

    describe('Stage 3: Real Schema Generator (DeepSeek)', () => {
        it('should call real AI to generate schema', async () => {
            // Read docs from previous stage or use sample
            let docsContent;
            try {
                docsContent = await fs.readFile(
                    path.join(TEST_WORK_DIR, 'test-project', 'docs', 'docs.md'),
                    'utf8'
                );
            } catch {
                docsContent = `# SimpleTodo
## Features
- Add, edit, delete tasks
- Mark tasks complete
## API Endpoints
- GET /api/tasks
- POST /api/tasks
- PUT /api/tasks/:id
- DELETE /api/tasks/:id`;
            }

            console.log('\n📤 Sending docs to Schema Generator (DeepSeek)...');

            try {
                const response = await stageRouter.callStageModel(3, docsContent, {
                    context: { buildId: 'test-3', projectId: 'test' },
                    timeout: 120000
                });

                console.log('\n📥 Schema Generator Response (first 600 chars):');
                console.log(response.content?.slice(0, 600));

                expect(response).toBeDefined();
                expect(response.content).toBeDefined();

                // Save schema
                const projectDir = path.join(TEST_WORK_DIR, 'test-project');
                await fs.writeFile(
                    path.join(projectDir, 'specs', 'schema_response.json'),
                    response.content
                );

                console.log('✅ Schema Generator stage passed with real AI response');
            } catch (error) {
                console.error('❌ Schema Generator failed:', error.message);
                throw error;
            }
        }, 180000);
    });

    describe('Stage 7+8: Real Prompt Builder + Code Generation', () => {
        it('should generate prompts with GPT-5 Mini and code with Gemini', async () => {
            const fileInfo = {
                path: 'src/lib/db.js',
                purpose: 'SQLite database connection and initialization'
            };

            const docsExcerpt = `
# SimpleTodo Database
Uses SQLite with better-sqlite3.
Table: tasks (id, title, completed, created_at)
`;

            console.log('\n📤 Stage 7: Sending to GPT-5 Mini for prompt building...');

            try {
                // Stage 7: Build prompt with GPT-5 Mini
                const promptTemplateManager = require('../../services/prompt-templates');
                const promptBuilderInput = promptTemplateManager.getTemplate('prompt-builder', {
                    file_path: fileInfo.path,
                    file_purpose: fileInfo.purpose,
                    docs_excerpt: docsExcerpt,
                    schema_excerpt: JSON.stringify({ tasks: { id: 'INTEGER', title: 'VARCHAR', completed: 'BOOLEAN' } })
                });

                const promptResponse = await stageRouter.callStageModel(7, promptBuilderInput, {
                    context: { buildId: 'test-7', projectId: 'test', fileName: fileInfo.path },
                    timeout: 60000
                });

                console.log('\n📥 GPT-5 Mini generated prompt (first 500 chars):');
                console.log(promptResponse.content?.slice(0, 500));

                expect(promptResponse.content).toBeDefined();
                expect(promptResponse.content.length).toBeGreaterThan(100);

                // Stage 8: Generate code with Gemini
                console.log('\n📤 Stage 8: Sending prompt to Gemini for code generation...');

                const codePrompt = promptTemplateManager.getTemplate('gemini-coder', {
                    file_path: fileInfo.path,
                    file_purpose: fileInfo.purpose,
                    docs_excerpt: promptResponse.content, // Use the rich prompt from Stage 7
                    schema_excerpt: '{}',
                    coding_rules: 'Use ES6+, add JSDoc comments, handle errors'
                });

                const codeResponse = await stageRouter.callStageModel(8, codePrompt, {
                    context: { buildId: 'test-8', projectId: 'test', fileName: fileInfo.path },
                    timeout: 120000
                });

                console.log('\n📥 Gemini generated code:');
                console.log(codeResponse.content);

                expect(codeResponse.content).toBeDefined();
                expect(codeResponse.content).toContain('function'); // Should have actual code

                // Save generated code
                const projectDir = path.join(TEST_WORK_DIR, 'test-project', 'code');
                await fs.mkdir(path.join(projectDir, 'src', 'lib'), { recursive: true });
                await fs.writeFile(
                    path.join(projectDir, fileInfo.path),
                    codeResponse.content
                );

                console.log('✅ Code generation stage passed with REAL AI responses');
            } catch (error) {
                console.error('❌ Code generation failed:', error.message);
                throw error;
            }
        }, 300000);
    });
});
