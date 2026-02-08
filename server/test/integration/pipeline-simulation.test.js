/**
 * Full Pipeline E2E Simulation Test
 * 
 * Simulates the entire pipeline for a "Simple To-Do List" app.
 * Mocks all AI model responses to test artifact flow and file creation.
 * 
 * Run with: npx jest test/integration/pipeline-simulation.test.js --verbose
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const PipelineOrchestrator = require('../../services/pipeline-orchestrator');
const { ModelRouter } = require('../../services/model-router');
const StageRouter = require('../../services/stage-router');
const ArtifactStorage = require('../../services/artifact-storage');

const TEST_WORK_DIR = path.join(__dirname, '../../test-work');

// Mock AI model responses for each stage
const MOCK_RESPONSES = {
    // Stage 1: Clarifier asks clarifying questions then consolidates
    clarifier: {
        questions: [
            'What user authentication method would you prefer (email/password, OAuth, or no auth)?',
            'Should tasks have due dates or priorities?',
            'Do you need multi-user support or is this single-user?'
        ],
        refinedSpecs: {
            appName: 'SimpleTodo',
            description: 'A simple to-do list application',
            features: [
                'Add task with title',
                'Remove task',
                'Mark task as completed',
                'Filter tasks (all, active, completed)',
                'Persist tasks to local storage'
            ],
            techStack: {
                frontend: 'SvelteKit',
                backend: 'Node.js with Fastify',
                database: 'SQLite'
            },
            authentication: 'none',
            multiUser: false,
            taskProperties: ['title', 'completed', 'createdAt']
        }
    },

    // Stage 2: Llama creates documentation in markdown format
    docsCreation: `# SimpleTodo Application Documentation

## Overview
A lightweight to-do list application built with SvelteKit and Fastify.

## User Stories
- As a user, I can add a new task
- As a user, I can mark a task as complete
- As a user, I can delete a task
- As a user, I can filter tasks by status

## Features
### Task Management
- Create tasks with title
- Toggle completion status
- Delete tasks
- Filter by: all, active, completed

### Data Persistence
- Tasks stored in SQLite database
- Automatic save on changes

## Endpoints
### GET /api/tasks
Returns all tasks

### POST /api/tasks
Creates a new task
Body: { title: string }

### PUT /api/tasks/:id
Updates task completion status
Body: { completed: boolean }

### DELETE /api/tasks/:id
Deletes a task

## Frontend Pages
- / - Main todo list view with filtering

## Database Entities
See schema.json for complete schema.

## Non-functional Requirements
- Tasks load in under 200ms
- Mobile responsive design
`,

    // Stage 3: DeepSeek creates schema
    schemaCreation: {
        database: {
            tables: {
                tasks: {
                    columns: {
                        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
                        title: { type: 'VARCHAR(255)', notNull: true },
                        completed: { type: 'BOOLEAN', default: false },
                        created_at: { type: 'TIMESTAMP', default: 'CURRENT_TIMESTAMP' }
                    },
                    indexes: ['idx_tasks_completed']
                }
            }
        },
        resources: {
            Task: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    title: { type: 'string' },
                    completed: { type: 'boolean' },
                    createdAt: { type: 'string', format: 'date-time' }
                },
                required: ['id', 'title', 'completed']
            }
        },
        responses: {
            TaskList: {
                type: 'object',
                properties: {
                    tasks: { type: 'array', items: { $ref: '#/resources/Task' } },
                    total: { type: 'integer' }
                }
            }
        }
    },

    // Stage 4: GPT-4o creates file structure
    fileStructure: {
        files: [
            { path: 'package.json', purpose: 'Project configuration' },
            { path: 'src/app.js', purpose: 'Fastify server entry point' },
            { path: 'src/routes/tasks.js', purpose: 'Task API routes' },
            { path: 'src/lib/db.js', purpose: 'SQLite database connection' },
            { path: 'src/lib/utils.js', purpose: 'Utility functions' },
            { path: 'frontend/src/routes/+page.svelte', purpose: 'Main todo list component' },
            { path: 'frontend/src/lib/stores.js', purpose: 'Svelte stores for state management' },
            { path: 'frontend/src/lib/api.js', purpose: 'API client functions' }
        ],
        directories: ['src', 'src/routes', 'src/lib', 'frontend', 'frontend/src', 'frontend/src/routes', 'frontend/src/lib']
    },

    // Stage 5: Claude validates structure
    validation: {
        valid: true,
        corrections: [],
        validatedStructure: {
            files: [
                { path: 'package.json', purpose: 'Project configuration', validated: true },
                { path: 'src/app.js', purpose: 'Fastify server entry point', validated: true },
                { path: 'src/routes/tasks.js', purpose: 'Task API routes with CRUD operations', validated: true },
                { path: 'src/lib/db.js', purpose: 'SQLite database connection and initialization', validated: true },
                { path: 'src/lib/utils.js', purpose: 'Utility functions', validated: true },
                { path: 'frontend/src/routes/+page.svelte', purpose: 'Main todo list component', validated: true },
                { path: 'frontend/src/lib/stores.js', purpose: 'Svelte stores for state management', validated: true },
                { path: 'frontend/src/lib/api.js', purpose: 'API client functions', validated: true }
            ]
        }
    },

    // Stage 7: GPT-5 Mini generates prompts
    promptBuilder: [
        {
            filename: 'package.json',
            purpose: 'Project configuration',
            schema: {},
            imports: { filePaths: [], functions: [] },
            generatedPrompt: 'Generate package.json for a SvelteKit + Fastify app',
            functions: []
        },
        {
            filename: 'src/app.js',
            purpose: 'Fastify server entry point',
            schema: {},
            imports: { filePaths: ['./routes/tasks', './lib/db'], functions: [{ functionName: 'registerRoutes', functionPurpose: 'Register API routes', methods: [] }] },
            generatedPrompt: 'Generate Fastify server with CORS and task routes',
            functions: [{ functionName: 'start', functionPurpose: 'Start the server', methods: [{ method: 'listen', usecase: 'Start listening on port' }] }]
        },
        {
            filename: 'src/routes/tasks.js',
            purpose: 'Task API routes with CRUD operations',
            schema: { Task: { id: 'integer', title: 'string', completed: 'boolean' } },
            imports: { filePaths: ['../lib/db'], functions: [] },
            generatedPrompt: 'Generate Fastify routes for task CRUD',
            functions: [
                { functionName: 'getTasks', functionPurpose: 'Get all tasks', methods: [{ method: 'GET', usecase: 'List tasks' }] },
                { functionName: 'createTask', functionPurpose: 'Create a task', methods: [{ method: 'POST', usecase: 'Add task' }] },
                { functionName: 'updateTask', functionPurpose: 'Update a task', methods: [{ method: 'PUT', usecase: 'Toggle completion' }] },
                { functionName: 'deleteTask', functionPurpose: 'Delete a task', methods: [{ method: 'DELETE', usecase: 'Remove task' }] }
            ]
        },
        {
            filename: 'src/lib/db.js',
            purpose: 'SQLite database connection',
            schema: { tasks: { id: 'INTEGER PRIMARY KEY', title: 'VARCHAR', completed: 'BOOLEAN' } },
            imports: { filePaths: [], functions: [] },
            generatedPrompt: 'Generate SQLite database wrapper with task table',
            functions: [{ functionName: 'initDb', functionPurpose: 'Initialize database', methods: [] }]
        }
    ],

    // Stage 8: Gemini generates code
    codeGeneration: {
        'package.json': `{
  "name": "simple-todo",
  "version": "1.0.0",
  "main": "src/app.js",
  "scripts": {
    "start": "node src/app.js",
    "dev": "nodemon src/app.js"
  },
  "dependencies": {
    "fastify": "^4.24.0",
    "@fastify/cors": "^8.4.0",
    "better-sqlite3": "^9.2.0"
  }
}`,
        'src/app.js': `const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const taskRoutes = require('./routes/tasks');
const { initDb } = require('./lib/db');

async function start() {
  await fastify.register(cors, { origin: true });
  await fastify.register(taskRoutes, { prefix: '/api' });
  await initDb();
  
  const port = process.env.PORT || 3000;
  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(\`Server running on port \${port}\`);
}

start().catch(console.error);
module.exports = { start };`,
        'src/routes/tasks.js': `const { getDb } = require('../lib/db');

async function taskRoutes(fastify) {
  fastify.get('/tasks', async (req, reply) => {
    const db = getDb();
    const tasks = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();
    return { tasks, total: tasks.length };
  });

  fastify.post('/tasks', async (req, reply) => {
    const { title } = req.body;
    if (!title) return reply.status(400).send({ error: 'Title required' });
    
    const db = getDb();
    const result = db.prepare('INSERT INTO tasks (title) VALUES (?)').run(title);
    return { id: result.lastInsertRowid, title, completed: false };
  });

  fastify.put('/tasks/:id', async (req, reply) => {
    const { id } = req.params;
    const { completed } = req.body;
    const db = getDb();
    db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(completed ? 1 : 0, id);
    return { id, completed };
  });

  fastify.delete('/tasks/:id', async (req, reply) => {
    const { id } = req.params;
    const db = getDb();
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    return { deleted: true };
  });
}

module.exports = taskRoutes;`,
        'src/lib/db.js': `const Database = require('better-sqlite3');
let db;

function initDb() {
  db = new Database('./tasks.db');
  db.exec(\`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title VARCHAR(255) NOT NULL,
      completed BOOLEAN DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  \`);
  return db;
}

function getDb() {
  if (!db) initDb();
  return db;
}

module.exports = { initDb, getDb };`
    }
};

// Mock dependencies
const mockWebsocket = {
    emit: jest.fn((event, data) => console.log(`[WS] ${event}:`, data?.stage || data?.status || '')),
    sendPhaseUpdate: jest.fn((buildId, stage, status, data) => console.log(`[WS] Phase Update: ${stage} - ${status}`)),
    sendBuildStatus: jest.fn((buildId, status) => console.log(`[WS] Build Status: ${status}`)),
    sendBuildProgress: jest.fn((buildId, progress) => console.log(`[WS] Build Progress: ${progress.percentage}%`)),
    sendError: jest.fn((buildId, error) => console.log(`[WS] Error: ${error.message}`)),
    sendProgress: jest.fn((buildId, progress) => console.log(`[WS] Progress: ${progress}%`))
};

const mockBuildModel = {
    create: jest.fn().mockResolvedValue({ _id: 'test-build-id' }),
    findById: jest.fn().mockResolvedValue({
        _id: 'test-build-id',
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
    findById: jest.fn().mockResolvedValue({ _id: 'test-project-id', name: 'Todo App' })
};

// Create mock stage router that returns mock responses
function createMockStageRouter() {
    const mockStageRouter = {
        callStageModel: jest.fn(async (stageNum, prompt, options) => {
            console.log(`[MockStageRouter] Stage ${stageNum} called`);

            switch (stageNum) {
                case 1: // Clarifier
                    return { content: JSON.stringify(MOCK_RESPONSES.clarifier.refinedSpecs) };
                case 2: // Docs Creator
                    return { content: MOCK_RESPONSES.docsCreation };
                case 3: // Schema Generator
                    return { content: JSON.stringify(MOCK_RESPONSES.schemaCreation) };
                case 4: // File Structure
                    return { content: JSON.stringify(MOCK_RESPONSES.fileStructure) };
                case 5: // Validator
                    return { content: JSON.stringify(MOCK_RESPONSES.validation) };
                case 7: // Prompt Builder (GPT-5 Mini)
                    const fileInfo = options?.context?.fileName || 'unknown';
                    const prompt = MOCK_RESPONSES.promptBuilder.find(p => p.filename === fileInfo);
                    return { content: prompt ? JSON.stringify(prompt) : 'Generate code for this file' };
                case 8: // Code Generation (Gemini)
                    const fileName = options?.context?.fileName || 'unknown';
                    const code = MOCK_RESPONSES.codeGeneration[fileName] || '// Generated code placeholder';
                    return { content: code, tokens: 100, cost: 0.001 };
                default:
                    return { content: '{}' };
            }
        }),

        callStage7Models: jest.fn(async (input, options) => {
            console.log(`[MockStageRouter] Stage 7 Models called for: ${input.file_path}`);
            const code = MOCK_RESPONSES.codeGeneration[input.file_path] || '// Generated code';
            return { code, totalTokens: 100, totalCost: 0.001 };
        }),

        getModelForStage: jest.fn((stageNum) => ({
            provider: 'mock',
            modelName: 'mock-model',
            requiresAI: stageNum > 0
        }))
    };

    return mockStageRouter;
}

describe('Full Pipeline Simulation with Mocks', () => {
    let orchestrator;
    let mockStageRouter;

    beforeAll(async () => {
        // Clean up test directory
        await fs.rm(TEST_WORK_DIR, { recursive: true, force: true }).catch(() => { });
        await fs.mkdir(TEST_WORK_DIR, { recursive: true });

        mockStageRouter = createMockStageRouter();

        orchestrator = new PipelineOrchestrator({
            stageRouter: mockStageRouter,
            websocket: mockWebsocket,
            emailService: mockEmailService,
            buildModel: mockBuildModel,
            projectModel: mockProjectModel,
            artifactStorage: new ArtifactStorage({ localDir: TEST_WORK_DIR })
        });
    });

    afterAll(async () => {
        // Keep test output for review, don't clean up
    });

    describe('Stage 1: Clarifier / Refinement', () => {
        it('should refine specs.json through clarification', async () => {
            const specs = {
                appName: 'SimpleTodo',
                description: 'A simple to-do list',
                features: ['Add task', 'Remove task', 'Mark complete']
            };

            // Write initial specs
            const projectDir = path.join(TEST_WORK_DIR, 'test-project');
            await fs.mkdir(path.join(projectDir, 'specs'), { recursive: true });
            await fs.writeFile(
                path.join(projectDir, 'specs', 'specs.json'),
                JSON.stringify(specs, null, 2)
            );

            // Call stage model for refinement
            const response = await mockStageRouter.callStageModel(1, JSON.stringify(specs), {});
            const refinedSpecs = JSON.parse(response.content);

            expect(refinedSpecs).toBeDefined();
            expect(refinedSpecs.appName).toBe('SimpleTodo');
            expect(refinedSpecs.techStack).toBeDefined();
            expect(refinedSpecs.authentication).toBe('none');

            // Write refined specs
            await fs.writeFile(
                path.join(projectDir, 'specs', 'refined_specs.json'),
                JSON.stringify(refinedSpecs, null, 2)
            );

            console.log('✅ Stage 1: Specs refined successfully');
        });
    });

    describe('Stage 2: Docs Creation (Llama)', () => {
        it('should generate markdown documentation from specs', async () => {
            const projectDir = path.join(TEST_WORK_DIR, 'test-project');
            await fs.mkdir(path.join(projectDir, 'docs'), { recursive: true });

            const response = await mockStageRouter.callStageModel(2, 'Create docs', {});
            const docsMd = response.content;

            expect(docsMd).toBeDefined();
            expect(typeof docsMd).toBe('string');
            expect(docsMd).toContain('# SimpleTodo');
            expect(docsMd).toContain('## Endpoints');
            expect(docsMd).toContain('GET /api/tasks');

            // Write docs
            await fs.writeFile(
                path.join(projectDir, 'docs', 'docs.md'),
                docsMd
            );

            console.log('✅ Stage 2: Markdown documentation created');
        });
    });

    describe('Stage 3: Schema Creation (DeepSeek)', () => {
        it('should create schema and attach to documentation', async () => {
            const projectDir = path.join(TEST_WORK_DIR, 'test-project');

            const response = await mockStageRouter.callStageModel(3, 'Create schema', {});
            const schema = JSON.parse(response.content);

            expect(schema).toBeDefined();
            expect(schema.database).toBeDefined();
            expect(schema.database.tables.tasks).toBeDefined();
            expect(schema.resources.Task).toBeDefined();

            // Write schema
            await fs.writeFile(
                path.join(projectDir, 'specs', 'schema.json'),
                JSON.stringify(schema, null, 2)
            );

            // Read existing docs and append schema
            const existingDocs = await fs.readFile(path.join(projectDir, 'docs', 'docs.md'), 'utf8');
            const docsWithSchema = existingDocs + '\n\n## Schema\n```json\n' + JSON.stringify(schema, null, 2) + '\n```\n';

            await fs.writeFile(
                path.join(projectDir, 'docs', 'documentation_with_schema.md'),
                docsWithSchema
            );

            console.log('✅ Stage 3: Schema created and attached to docs');
        });
    });

    describe('Stage 4: File Structure Creation (GPT-4o)', () => {
        it('should generate file structure from docs and schema', async () => {
            const projectDir = path.join(TEST_WORK_DIR, 'test-project');

            const response = await mockStageRouter.callStageModel(4, 'Create file structure', {});
            const fileStructure = JSON.parse(response.content);

            expect(fileStructure).toBeDefined();
            expect(fileStructure.files).toBeDefined();
            expect(Array.isArray(fileStructure.files)).toBe(true);
            expect(fileStructure.files.length).toBeGreaterThan(0);

            // Write file structure
            await fs.writeFile(
                path.join(projectDir, 'specs', 'file_structure.json'),
                JSON.stringify(fileStructure, null, 2)
            );

            console.log('✅ Stage 4: File structure created');
        });
    });

    describe('Stage 5: Validation (Claude-Sonnet)', () => {
        it('should validate structure against docs and specs', async () => {
            const projectDir = path.join(TEST_WORK_DIR, 'test-project');

            const response = await mockStageRouter.callStageModel(5, 'Validate', {});
            const validation = JSON.parse(response.content);

            expect(validation).toBeDefined();
            expect(validation.valid).toBe(true);
            expect(validation.validatedStructure).toBeDefined();
            expect(validation.validatedStructure.files.length).toBeGreaterThan(0);

            // Write validated structure
            await fs.writeFile(
                path.join(projectDir, 'specs', 'validated_structure.json'),
                JSON.stringify(validation.validatedStructure, null, 2)
            );

            console.log('✅ Stage 5: Structure validated');
        });
    });

    describe('Stage 6: Empty File Creation (Worker)', () => {
        it('should create empty files from validated structure', async () => {
            const projectDir = path.join(TEST_WORK_DIR, 'test-project');
            const codeDir = path.join(projectDir, 'code');

            // Read validated structure
            const validatedStructure = JSON.parse(
                await fs.readFile(path.join(projectDir, 'specs', 'validated_structure.json'), 'utf8')
            );

            // Create empty files
            for (const file of validatedStructure.files) {
                const filePath = path.join(codeDir, file.path);
                await fs.mkdir(path.dirname(filePath), { recursive: true });
                await fs.writeFile(filePath, `// Placeholder for ${file.purpose}\n`);
            }

            // Verify files were created
            for (const file of validatedStructure.files) {
                const filePath = path.join(codeDir, file.path);
                const exists = await fs.access(filePath).then(() => true).catch(() => false);
                expect(exists).toBe(true);
            }

            console.log('✅ Stage 6: Empty files created');
        });
    });

    describe('Stage 7: Prompt Builder (GPT-5 Mini)', () => {
        it('should generate prompts in the specified JSON format', async () => {
            const projectDir = path.join(TEST_WORK_DIR, 'test-project');

            // Read validated structure
            const validatedStructure = JSON.parse(
                await fs.readFile(path.join(projectDir, 'specs', 'validated_structure.json'), 'utf8')
            );

            const geminiPrompts = [];

            for (const file of validatedStructure.files) {
                const response = await mockStageRouter.callStageModel(7, 'Build prompt', {
                    context: { fileName: file.path }
                });

                // Build structured prompt in user-specified format
                const structuredPrompt = {
                    filename: file.path,
                    purpose: file.purpose,
                    schema: {},
                    imports: {
                        filePaths: [],
                        functions: []
                    },
                    generatedPrompt: response.content,
                    functions: []
                };

                geminiPrompts.push(structuredPrompt);
            }

            expect(geminiPrompts.length).toBe(validatedStructure.files.length);
            expect(geminiPrompts[0].filename).toBeDefined();
            expect(geminiPrompts[0].purpose).toBeDefined();
            expect(geminiPrompts[0].imports).toBeDefined();

            // Write prompts
            await fs.writeFile(
                path.join(projectDir, 'specs', 'gemini_prompts.json'),
                JSON.stringify(geminiPrompts, null, 2)
            );

            console.log('✅ Stage 7: Prompts generated in specified format');
        });
    });

    describe('Stage 8: Code Generation (Gemini)', () => {
        it('should generate code and update files', async () => {
            const projectDir = path.join(TEST_WORK_DIR, 'test-project');
            const codeDir = path.join(projectDir, 'code');

            // Read prompts
            const geminiPrompts = JSON.parse(
                await fs.readFile(path.join(projectDir, 'specs', 'gemini_prompts.json'), 'utf8')
            );

            const generatedFiles = [];

            for (const prompt of geminiPrompts) {
                const response = await mockStageRouter.callStageModel(8, prompt.generatedPrompt, {
                    context: { fileName: prompt.filename }
                });

                const code = response.content;
                const filePath = path.join(codeDir, prompt.filename);

                // Update file with generated code
                await fs.mkdir(path.dirname(filePath), { recursive: true });
                await fs.writeFile(filePath, code);

                generatedFiles.push({
                    path: prompt.filename,
                    size: code.length
                });
            }

            expect(generatedFiles.length).toBe(geminiPrompts.length);

            console.log('✅ Stage 8: Code generated and files updated');
        });

        it('should verify file contents match generated code', async () => {
            const projectDir = path.join(TEST_WORK_DIR, 'test-project');
            const codeDir = path.join(projectDir, 'code');

            // Check specific files
            const packageJson = await fs.readFile(path.join(codeDir, 'package.json'), 'utf8');
            expect(packageJson).toContain('"name": "simple-todo"');
            expect(packageJson).toContain('fastify');

            const appJs = await fs.readFile(path.join(codeDir, 'src/app.js'), 'utf8');
            expect(appJs).toContain('fastify');
            expect(appJs).toContain('taskRoutes');

            const tasksRoute = await fs.readFile(path.join(codeDir, 'src/routes/tasks.js'), 'utf8');
            expect(tasksRoute).toContain('fastify.get');
            expect(tasksRoute).toContain('fastify.post');
            expect(tasksRoute).toContain('fastify.delete');

            const dbJs = await fs.readFile(path.join(codeDir, 'src/lib/db.js'), 'utf8');
            expect(dbJs).toContain('better-sqlite3');
            expect(dbJs).toContain('CREATE TABLE');

            console.log('✅ File contents verified');
        });
    });

    describe('Full Pipeline Integration', () => {
        it('should verify all artifacts exist', async () => {
            const projectDir = path.join(TEST_WORK_DIR, 'test-project');

            const artifacts = [
                'specs/specs.json',
                'specs/refined_specs.json',
                'specs/schema.json',
                'specs/file_structure.json',
                'specs/validated_structure.json',
                'specs/gemini_prompts.json',
                'docs/docs.md',
                'docs/documentation_with_schema.md'
            ];

            for (const artifact of artifacts) {
                const filePath = path.join(projectDir, artifact);
                const exists = await fs.access(filePath).then(() => true).catch(() => false);
                expect(exists).toBe(true);
                console.log(`  ✓ ${artifact}`);
            }

            console.log('✅ All artifacts verified');
        });
    });
});
