const PipelineOrchestrator = require('../../services/pipeline-orchestrator');

describe('Pipeline Orchestrator - Retry Logic Verification (Task 5.1) - Simple Tests', () => {
  let orchestrator;
  let mockStageRouter;
  let mockBuildModel;
  let mockProjectModel;
  let mockWebsocket;
  let mockEmailService;

  beforeEach(() => {
    // Create mock dependencies
    mockStageRouter = {
      callStageModel: jest.fn()
    };

    mockBuildModel = {
      findById: jest.fn(),
      create: jest.fn()
    };

    mockProjectModel = {
      findById: jest.fn()
    };

    mockWebsocket = {
      sendPhaseUpdate: jest.fn(),
      sendBuildProgress: jest.fn(),
      sendBuildStatus: jest.fn(),
      sendError: jest.fn()
    };

    mockEmailService = {
      sendBuildStartedNotification: jest.fn().mockResolvedValue(),
      sendBuildFailedNotification: jest.fn().mockResolvedValue(),
      sendBuildCompletedNotification: jest.fn().mockResolvedValue()
    };

    // Create orchestrator instance
    orchestrator = new PipelineOrchestrator({
      stageRouter: mockStageRouter,
      buildModel: mockBuildModel,
      projectModel: mockProjectModel,
      websocket: mockWebsocket,
      emailService: mockEmailService,
      workDir: '/tmp/test-work'
    });
  });

  test('5.1.1 - Retry count tracking - succeeds after 2 failures', async () => {
    const mockBuild = {
      update: jest.fn().mockResolvedValue(),
      updateStageStatus: jest.fn().mockResolvedValue(),
      logStageError: jest.fn().mockResolvedValue(),
      markFailedAtStage: jest.fn().mockResolvedValue()
    };
    mockBuildModel.findById.mockResolvedValue(mockBuild);

    const stage = {
      name: 'test-stage',
      handler: 'handleTestStage',
      retries: 2,
      requiresAI: true
    };

    const context = {
      buildId: 'test-build-123',
      projectId: 'test-project-456',
      artifacts: {}
    };

    let attemptCount = 0;

    // Mock handler that fails twice then succeeds
    orchestrator.handleTestStage = jest.fn().mockImplementation(async () => {
      attemptCount++;
      
      if (attemptCount <= 2) {
        throw new Error(`Attempt ${attemptCount} failed`);
      }
      
      return {
        success: true,
        artifacts: { result: 'success' }
      };
    });

    // Execute
    const result = await orchestrator.executeStageWithRetry(1, stage, context);

    // Verify the result
    expect(result.success).toBe(true);
    expect(attemptCount).toBe(3); // Initial + 2 retries

    // Verify error logging was called for the 2 failures
    expect(mockBuild.logStageError).toHaveBeenCalledTimes(2);
    
    // Verify first error log
    expect(mockBuild.logStageError).toHaveBeenNthCalledWith(
      1,
      'test-stage',
      1,
      expect.any(Error),
      expect.objectContaining({
        attempt: 1,
        maxRetries: 2,
        isFinalFailure: false
      })
    );

    // Verify second error log
    expect(mockBuild.logStageError).toHaveBeenNthCalledWith(
      2,
      'test-stage',
      1,
      expect.any(Error),
      expect.objectContaining({
        attempt: 2,
        maxRetries: 2,
        isFinalFailure: false
      })
    );

    // Verify retry notifications were sent
    expect(mockWebsocket.sendPhaseUpdate).toHaveBeenCalledWith(
      'test-build-123',
      'test-stage',
      'retrying',
      expect.objectContaining({
        attempt: 2,
        maxAttempts: 3,
        backoffMs: 500
      })
    );

    expect(mockWebsocket.sendPhaseUpdate).toHaveBeenCalledWith(
      'test-build-123',
      'test-stage',
      'retrying',
      expect.objectContaining({
        attempt: 3,
        maxAttempts: 3,
        backoffMs: 1500
      })
    );

    // Verify retry-success notification
    expect(mockWebsocket.sendPhaseUpdate).toHaveBeenCalledWith(
      'test-build-123',
      'test-stage',
      'retry-success',
      expect.objectContaining({
        attempt: 3,
        retriesNeeded: 2
      })
    );
  });

  test('5.1.2 - All retries exhausted - final failure', async () => {
    const mockBuild = {
      update: jest.fn().mockResolvedValue(),
      updateStageStatus: jest.fn().mockResolvedValue(),
      logStageError: jest.fn().mockResolvedValue(),
      markFailedAtStage: jest.fn().mockResolvedValue()
    };
    mockBuildModel.findById.mockResolvedValue(mockBuild);

    const stage = {
      name: 'test-stage',
      handler: 'handleTestStage',
      retries: 2,
      requiresAI: true
    };

    const context = {
      buildId: 'test-build-123',
      projectId: 'test-project-456',
      artifacts: {}
    };

    let attemptCount = 0;

    // Mock handler that always fails
    orchestrator.handleTestStage = jest.fn().mockImplementation(async () => {
      attemptCount++;
      throw new Error(`Attempt ${attemptCount} failed`);
    });

    // Execute and expect failure
    await expect(
      orchestrator.executeStageWithRetry(1, stage, context)
    ).rejects.toThrow('failed after 3 attempts');

    // Verify attempt count
    expect(attemptCount).toBe(3); // Initial + 2 retries

    // Verify error logging was called for each attempt
    expect(mockBuild.logStageError).toHaveBeenCalledTimes(3);
    
    // Verify each error log includes correct metadata
    for (let i = 0; i < 3; i++) {
      expect(mockBuild.logStageError).toHaveBeenNthCalledWith(
        i + 1,
        'test-stage',
        1,
        expect.any(Error),
        expect.objectContaining({
          attempt: i + 1,
          maxRetries: 2,
          isFinalFailure: i === 2 // Only last one is final
        })
      );
    }

    // Verify build was marked as failed
    expect(mockBuild.markFailedAtStage).toHaveBeenCalledWith(
      1,
      'test-stage',
      expect.stringContaining('failed after 3 attempts')
    );
  });

  test('5.1.3 - Error logging to build model', async () => {
    const mockBuild = {
      update: jest.fn().mockResolvedValue(),
      updateStageStatus: jest.fn().mockResolvedValue(),
      logStageError: jest.fn().mockResolvedValue(),
      markFailedAtStage: jest.fn().mockResolvedValue()
    };
    mockBuildModel.findById.mockResolvedValue(mockBuild);

    const stage = {
      name: 'clarifier',
      handler: 'handleTestStage',
      retries: 2,
      requiresAI: true
    };

    const context = {
      buildId: 'test-build-789',
      projectId: 'test-project-101',
      artifacts: {}
    };

    const testError = new Error('Provider timeout');

    // Mock handler that fails once then succeeds
    orchestrator.handleTestStage = jest.fn()
      .mockRejectedValueOnce(testError)
      .mockResolvedValueOnce({
        success: true,
        artifacts: { result: 'success' }
      });

    // Execute
    const result = await orchestrator.executeStageWithRetry(1, stage, context);

    // Verify error was logged
    expect(mockBuild.logStageError).toHaveBeenCalledTimes(1);
    
    expect(mockBuild.logStageError).toHaveBeenCalledWith(
      'clarifier',
      1,
      testError,
      {
        attempt: 1,
        maxRetries: 2,
        isFinalFailure: false
      }
    );

    // Verify success after retry
    expect(result.success).toBe(true);
  });

  test('5.1.4 - No retries when retries = 0', async () => {
    const mockBuild = {
      update: jest.fn().mockResolvedValue(),
      updateStageStatus: jest.fn().mockResolvedValue(),
      logStageError: jest.fn().mockResolvedValue(),
      markFailedAtStage: jest.fn().mockResolvedValue()
    };
    mockBuildModel.findById.mockResolvedValue(mockBuild);

    const stage = {
      name: 'test-stage',
      handler: 'handleTestStage',
      retries: 0, // No retries
      requiresAI: true
    };

    const context = {
      buildId: 'test-build-123',
      projectId: 'test-project-456',
      artifacts: {}
    };

    let attemptCount = 0;

    // Mock handler that always fails
    orchestrator.handleTestStage = jest.fn().mockImplementation(async () => {
      attemptCount++;
      throw new Error('Failed');
    });

    // Execute and expect immediate failure
    await expect(
      orchestrator.executeStageWithRetry(1, stage, context)
    ).rejects.toThrow('failed after 1 attempts');

    expect(attemptCount).toBe(1); // Only initial attempt, no retries

    // Verify no retry notifications were sent
    const retryCalls = mockWebsocket.sendPhaseUpdate.mock.calls.filter(
      call => call[2] === 'retrying'
    );
    expect(retryCalls.length).toBe(0);
  });

  test('5.1.5 - Success on first attempt (no retries needed)', async () => {
    const mockBuild = {
      update: jest.fn().mockResolvedValue(),
      updateStageStatus: jest.fn().mockResolvedValue(),
      logStageError: jest.fn().mockResolvedValue(),
      markFailedAtStage: jest.fn().mockResolvedValue()
    };
    mockBuildModel.findById.mockResolvedValue(mockBuild);

    const stage = {
      name: 'test-stage',
      handler: 'handleTestStage',
      retries: 2,
      requiresAI: true
    };

    const context = {
      buildId: 'test-build-123',
      projectId: 'test-project-456',
      artifacts: {}
    };

    let attemptCount = 0;

    // Mock handler that succeeds immediately
    orchestrator.handleTestStage = jest.fn().mockImplementation(async () => {
      attemptCount++;
      return {
        success: true,
        artifacts: { result: 'success' }
      };
    });

    // Execute
    const result = await orchestrator.executeStageWithRetry(1, stage, context);

    // Verify
    expect(result.success).toBe(true);
    expect(attemptCount).toBe(1); // Only one attempt
    
    // Verify no error logging
    expect(mockBuild.logStageError).not.toHaveBeenCalled();
    
    // Verify no retry notifications
    const retryCalls = mockWebsocket.sendPhaseUpdate.mock.calls.filter(
      call => call[2] === 'retrying'
    );
    expect(retryCalls.length).toBe(0);

    // Verify no retry-success notification (since no retries were needed)
    const retrySuccessCalls = mockWebsocket.sendPhaseUpdate.mock.calls.filter(
      call => call[2] === 'retry-success'
    );
    expect(retrySuccessCalls.length).toBe(0);
  });

  test('5.1.6 - Final failure marks build as failed at stage', async () => {
    const mockBuild = {
      update: jest.fn().mockResolvedValue(),
      updateStageStatus: jest.fn().mockResolvedValue(),
      logStageError: jest.fn().mockResolvedValue(),
      markFailedAtStage: jest.fn().mockResolvedValue()
    };
    mockBuildModel.findById.mockResolvedValue(mockBuild);

    const stage = {
      name: 'normalizer',
      handler: 'handleTestStage',
      retries: 2,
      requiresAI: true
    };

    const context = {
      buildId: 'test-build-123',
      projectId: 'test-project-456',
      artifacts: {}
    };

    // Mock handler that always fails
    orchestrator.handleTestStage = jest.fn().mockRejectedValue(new Error('Persistent failure'));

    // Execute and expect failure
    await expect(
      orchestrator.executeStageWithRetry(1.5, stage, context)
    ).rejects.toThrow();

    // Verify build was marked as failed at this stage
    expect(mockBuild.markFailedAtStage).toHaveBeenCalledTimes(1);
    
    expect(mockBuild.markFailedAtStage).toHaveBeenCalledWith(
      1.5,
      'normalizer',
      expect.stringContaining('failed after 3 attempts')
    );
  });
});
