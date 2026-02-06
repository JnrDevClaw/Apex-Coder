/**
 * Full Pipeline E2E Simulation Test
 * 
 * Simulates the entire pipeline for a "Simple To-Do List" app.
 * Uses real AI providers where configured.
 * 
 * Run with: npx jest test/integration/pipeline-simulation.test.js
 */

require('dotenv').config();
const PipelineOrchestrator = require('../../services/pipeline-orchestrator');
const { ModelRouter } = require('../../services/model-router'); // Fix import
const StageRouter = require('../../services/stage-router');
const ArtifactStorage = require('../../services/artifact-storage');

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
    findByIdAndUpdate: jest.fn().mockResolvedValue({})
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

describe('Full Pipeline Simulation', () => {
    let orchestrator;

    beforeAll(() => {
        const modelRouter = new ModelRouter();
        // Initialize providers (this will load from .env)
        modelRouter.loadProvidersFromEnv();

        const stageRouter = new StageRouter(modelRouter);

        orchestrator = new PipelineOrchestrator({
            stageRouter,
            modelRouter,
            websocket: mockWebsocket,
            emailService: mockEmailService, // Mock email service
            buildModel: mockBuildModel,
            projectModel: mockProjectModel,
            artifactStorage: new ArtifactStorage({ localDir: './test-work' })
        });
    });

    it('should run the full pipeline for a To-Do List app', async () => {
        // 10 minute timeout for this test
        jest.setTimeout(600000);

        const specs = {
            appName: "SimpleTodo",
            description: "A simple to-do list application where users can add, delete, and mark tasks as done.",
            features: [
                "Add task",
                "Remove task",
                "Mark task as completed",
                "Filter tasks (all, active, completed)",
                "Persist tasks to local storage"
            ],
            techStack: {
                frontend: "SvelteKit",
                backend: "Node.js",
                database: "InMemory"
            }
        };

        console.log("🚀 Starting Pipeline Simulation...");

        try {
            const result = await orchestrator.startPipeline({
                buildId: 'sim-build-1',
                projectId: 'sim-project-1',
                specJson: specs,
                userId: 'test-user'
            });

            console.log("✅ Pipeline Simulation Complete!");
            console.log("Result:", result);

            expect(result).toBeDefined();
            // Add more assertions based on expected artifacts
        } catch (error) {
            console.error("❌ Pipeline Failed:", error);
            throw error;
        }
    });
});
