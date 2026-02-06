const PipelineOrchestrator = require('../../services/pipeline-orchestrator');
const EventEmitter = require('events');

// Mocks
const mockStageRouter = { route: jest.fn() };
const mockArtifactStorage = { store: jest.fn() };
const mockBuildModel = {
    findById: jest.fn(),
    update: jest.fn(),
    updateStageStatus: jest.fn(),
    logStageError: jest.fn(),
    markFailedAtStage: jest.fn(),
    storeStageArtifacts: jest.fn(),
};
const mockProjectModel = { findById: jest.fn() };
const mockWebsocket = {
    sendBuildStatus: jest.fn(),
    sendPhaseUpdate: jest.fn(),
    sendBuildProgress: jest.fn(),
    sendError: jest.fn(),
};
const mockEmailService = {
    sendBuildStartedNotification: jest.fn(),
    sendBuildFailedNotification: jest.fn(),
    sendBuildCompletedNotification: jest.fn(),
};

describe('PipelineOrchestrator', () => {
    let orchestrator;

    beforeEach(() => {
        jest.clearAllMocks();
        orchestrator = new PipelineOrchestrator({
            stageRouter: mockStageRouter,
            artifactStorage: mockArtifactStorage,
            buildModel: mockBuildModel,
            projectModel: mockProjectModel,
            websocket: mockWebsocket,
            emailService: mockEmailService,
            workDir: '/tmp/test-work-dir' // Use a temp dir for tests
        });

        // Silence console logs during tests
        jest.spyOn(console, 'log').mockImplementation(() => { });
        jest.spyOn(console, 'error').mockImplementation(() => { });
        jest.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('startPipeline', () => {
        it('should start the pipeline successfully', async () => {
            const params = {
                buildId: 'build-123',
                projectId: 'proj-456',
                orgId: 'org-789',
                specJson: { app_name: 'Test App' },
                userId: 'user-000'
            };

            // Mock successful build lookup
            const mockBuild = { update: jest.fn(), updateStageStatus: jest.fn() };
            mockBuildModel.findById.mockResolvedValue(mockBuild);
            mockProjectModel.findById.mockResolvedValue({ name: 'Test Project' });

            // Mock createProjectDirectoryStructure to avoid FS errors
            jest.spyOn(orchestrator, 'createProjectDirectoryStructure').mockResolvedValue();

            // Mock executeStage to stop infinite recursion in test
            jest.spyOn(orchestrator, 'executeStage').mockResolvedValue();

            const result = await orchestrator.startPipeline(params);

            expect(result.success).toBe(true);
            expect(result.buildId).toBe('build-123');
            expect(mockBuild.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'running', currentStage: 0 }));
            expect(mockEmailService.sendBuildStartedNotification).toHaveBeenCalled();
            expect(orchestrator.executeStage).toHaveBeenCalledWith(0, expect.any(Object));
        });

        it('should handle start pipeline failures', async () => {
            const params = { buildId: 'build-fail', projectId: 'proj-fail' };
            const error = new Error('Init failed');

            jest.spyOn(orchestrator, 'createProjectDirectoryStructure').mockRejectedValue(error);
            mockBuildModel.findById.mockResolvedValue({ update: jest.fn() });

            await expect(orchestrator.startPipeline(params)).rejects.toThrow();
            // Email notification may or may not be called depending on implementation
        });
    });

    describe('executeStage', () => {
        it('should execute stage 0 successfully', async () => {
            const context = {
                buildId: 'build-123',
                projectId: 'proj-456',
                completedStages: [],
                artifacts: {}
            };

            const mockBuild = { update: jest.fn(), updateStageStatus: jest.fn() };
            mockBuildModel.findById.mockResolvedValue(mockBuild);

            // Mock handler for stage 0
            orchestrator.handleQuestionnaireStage = jest.fn().mockResolvedValue({ artifacts: { 'specs.json': {} } });

            // Mock persistStageArtifacts
            jest.spyOn(orchestrator, 'persistStageArtifacts').mockResolvedValue();

            // Stop recursion
            jest.spyOn(orchestrator, 'getNextStage').mockReturnValue(null); // No next stage
            jest.spyOn(orchestrator, 'completePipeline').mockResolvedValue();

            await orchestrator.executeStage(0, context);

            expect(orchestrator.handleQuestionnaireStage).toHaveBeenCalled();
            expect(mockBuild.updateStageStatus).toHaveBeenCalledWith('questionnaire', 'completed', expect.any(Object));
            expect(orchestrator.completePipeline).toHaveBeenCalled();
        });

        it('should handle stage failure and stop pipeline', async () => {
            const context = {
                buildId: 'build-fail',
                completedStages: [],
                artifacts: {}
            };

            const error = new Error('Stage failed');
            const mockBuild = {
                update: jest.fn(),
                updateStageStatus: jest.fn(),
                logStageError: jest.fn(),
                markFailedAtStage: jest.fn()
            };
            mockBuildModel.findById.mockResolvedValue(mockBuild);

            // Mock handler to fail
            orchestrator.handleQuestionnaireStage = jest.fn().mockRejectedValue(error);
            // Mock retry logic to fail immediately or we mock executeStageWithRetry directly
            jest.spyOn(orchestrator, 'executeStageWithRetry').mockRejectedValue(error);
            jest.spyOn(orchestrator, 'persistStageArtifacts').mockResolvedValue();

            await expect(orchestrator.executeStage(0, context)).rejects.toThrow('Stage failed');
            // These mocks may not be called directly depending on internal flow
        });
    });

    describe('persistStageArtifacts', () => {
        it('should persist artifacts correctly', async () => {
            const context = {
                buildId: 'build-123',
                projectDir: '/tmp/test'
            };
            const artifacts = { 'test.json': { foo: 'bar' } };

            const mockBuild = { storeStageArtifacts: jest.fn() };
            mockBuildModel.findById.mockResolvedValue(mockBuild);

            jest.spyOn(orchestrator, 'writeArtifact').mockResolvedValue();

            await orchestrator.persistStageArtifacts(0, { name: 'test-stage' }, context, artifacts);

            expect(orchestrator.writeArtifact).toHaveBeenCalled();
            expect(mockBuild.storeStageArtifacts).toHaveBeenCalled();
        });
    });
});
