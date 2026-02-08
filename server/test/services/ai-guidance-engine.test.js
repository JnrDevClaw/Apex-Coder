const AIGuidanceEngine = require('../../services/ai-guidance-engine');
const modelRouter = require('../../services/model-router');
const auditLogger = require('../../services/audit-logger');
const questionnaireAuditLogger = require('../../services/questionnaire-audit-logger');
const MockAIService = require('../../services/mock-ai-service');

// Mocks
jest.mock('../../services/model-router');
jest.mock('../../services/audit-logger');
jest.mock('../../services/questionnaire-audit-logger');
// We don't mock MockAIService completely, but we might want to check if it's used

describe('AIGuidanceEngine', () => {
    const validInstance = require('../../services/ai-guidance-engine');
    const AIGuidanceEngineClass = validInstance.constructor;
    engine = new AIGuidanceEngineClass();

    // Mock structured logger via console for now or separate mock 
    // (Assuming structured-logger is just console wrapper or we mocked it if it was required)
    // Check implementation of ai-guidance-engine requiring structured-logger
    // We need to mock structured-logger if it is required
});

afterEach(() => {
    delete process.env.MOCK_AI_RESPONSES;
    delete process.env.OPENAI_API_KEY;
});

describe('generateContextualGuidance', () => {
    it('should use Mock Service if enabled', async () => {
        process.env.MOCK_AI_RESPONSES = 'true';
        const validInstance = require('../../services/ai-guidance-engine');
        const AIGuidanceEngineClass = validInstance.constructor;
        engine = new AIGuidanceEngineClass();

        const spy = jest.spyOn(engine.mockService, 'generateGuidance').mockResolvedValue({ mocked: true });

        const result = await engine.generateContextualGuidance({}, 'developer');

        expect(spy).toHaveBeenCalled();
        expect(result.mocked).toBe(true);
    });

    it('should route to modelRouter if keys exist and not mock', async () => {
        const data = { project_overview: { app_name: 'Test' } };
        const mockResponse = { content: JSON.stringify({ executive_summary: 'Summary' }) };

        modelRouter.routeTask.mockResolvedValue(mockResponse);
        auditLogger.generateCorrelationId.mockReturnValue('corr-id');
        questionnaireAuditLogger.logAIGuidanceGeneration.mockResolvedValue();

        const result = await engine.generateContextualGuidance(data, 'developer', { type: 'summary' });

        // Depending on implementation details, check outputs
        expect(result.success).toBe(true);
        expect(result.guidance.executive_summary).toBe('Summary');
        expect(modelRouter.routeTask).toHaveBeenCalled();
    });

    it('should handle model failure gracefully', async () => {
        modelRouter.routeTask.mockRejectedValue(new Error('Model Failed'));

        await expect(engine.generateContextualGuidance({}, 'developer'))
            .rejects.toThrow('Model Failed');

        expect(questionnaireAuditLogger.logAIGuidanceGeneration).toHaveBeenCalledWith(
            expect.objectContaining({ guidanceResult: { success: false, error: expect.any(Object) } })
        );
    });
});

describe('Prompt Builders', () => {
    it('should build follow up prompt', () => {
        const data = { test: 1 };
        const prompt = engine.buildFollowUpPrompt(
            data, 'developer', { missing_areas: ['foo'], completeness_score: 5 }, ['ambiguity']
        );

        expect(prompt).toContain('Incompleteness Analysis');
        expect(prompt).toContain('Missing areas: foo');
    });
});
});
