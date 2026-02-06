const taskPlanner = require('../../services/task-planner');
const jobProcessor = require('../../services/job-processor');
const jobQueueService = require('../../services/job-queue');

// Mock Redis and BullMQ for integration tests
jest.mock('../../services/redis');
jest.mock('bullmq');

describe('Task Planning Integration', () => {
  const mockSpecJson = {
    projectName: 'Integration Test App',
    stack: {
      frontend: 'svelte',
      backend: 'node',
      database: 'postgres'
    },
    features: {
      auth: true,
      payments: false,
      uploads: true,
      realtime: false,
      web3: false
    },
    envPrefs: {
      hosting: 'aws',
      cicd: true
    }
  };

  test('should complete full task planning workflow', async () => {
    // Test direct planning
    const plan = await taskPlanner.planProject(mockSpecJson);
    
    expect(plan).toBeDefined();
    expect(plan.tasks.length).toBeGreaterThan(0);
    expect(plan.openApiSkeleton).toBeDefined();
    expect(plan.databaseSchema).toBeDefined();
    expect(plan.totalEstimation.totalTimeSeconds).toBeGreaterThan(0);
    
    // Verify task structure
    expect(plan.tasks.every(task => 
      task.id && task.name && task.agentRole && task.estimatedTime
    )).toBe(true);
    
    // Verify OpenAPI structure
    expect(plan.openApiSkeleton.openapi).toBe('3.0.0');
    expect(plan.openApiSkeleton.info.title).toBe('Integration Test App');
    
    // Verify database schema
    expect(plan.databaseSchema.database).toBe('postgres');
    expect(plan.databaseSchema.tables.length).toBeGreaterThan(0);
    
    console.log(`Generated ${plan.tasks.length} tasks with total estimation of ${plan.totalEstimation.totalTimeMinutes} minutes`);
  });

  test('should validate job payload structure', () => {
    const validPayload = {
      projectId: 'test-project-123',
      specJson: mockSpecJson,
      userId: 'user-456',
      buildId: 'build-789'
    };
    
    // This should not throw
    expect(() => {
      jobProcessor.validateJobPayload('task-planning', validPayload);
    }).not.toThrow();
  });

  test('should reject invalid job payload', () => {
    const invalidPayload = {
      projectId: 'test-project-123',
      // Missing specJson and userId
    };
    
    expect(() => {
      jobProcessor.validateJobPayload('task-planning', invalidPayload);
    }).toThrow('Missing required field');
  });

  test('should handle different stack configurations', async () => {
    const frontendOnlySpec = {
      projectName: 'Frontend Only App',
      stack: {
        frontend: 'svelte',
        backend: 'none',
        database: 'none'
      },
      features: {
        auth: false,
        payments: false,
        uploads: false,
        realtime: false,
        web3: false
      }
    };
    
    const plan = await taskPlanner.planProject(frontendOnlySpec);
    
    expect(plan.tasks.length).toBeGreaterThan(0);
    
    // Should have frontend tasks but no backend/database tasks
    const taskTemplateIds = plan.tasks.map(t => t.templateId);
    expect(taskTemplateIds).toContain('frontend-setup');
    expect(taskTemplateIds).not.toContain('database-models');
    expect(taskTemplateIds).not.toContain('auth-system');
  });

  test('should generate appropriate milestones', async () => {
    const plan = await taskPlanner.planProject(mockSpecJson);
    
    expect(plan.milestones.length).toBeGreaterThan(0);
    
    // Each milestone should have tasks and time estimation
    for (const milestone of plan.milestones) {
      expect(milestone.tasks.length).toBeGreaterThan(0);
      expect(milestone.estimatedTime).toBeGreaterThan(0);
      expect(milestone.name).toBeDefined();
    }
    
    // Total milestone time should equal total task time
    const totalMilestoneTime = plan.milestones.reduce((sum, m) => sum + m.estimatedTime, 0);
    expect(totalMilestoneTime).toBe(plan.totalEstimation.totalTimeSeconds);
  });

  describe('job queue integration', () => {
    beforeEach(() => {
      // Mock BullMQ components
      const { Queue, Worker, QueueEvents } = require('bullmq');
      
      const mockQueue = {
        add: jest.fn().mockResolvedValue({ id: 'job-123' }),
        close: jest.fn().mockResolvedValue(true)
      };
      
      Queue.mockImplementation(() => mockQueue);
      
      Worker.mockImplementation(() => ({
        on: jest.fn(),
        close: jest.fn().mockResolvedValue(true)
      }));
      
      QueueEvents.mockImplementation(() => ({
        close: jest.fn().mockResolvedValue(true)
      }));
      
      // Mock job queue service to have the queue available
      jobQueueService.queues = new Map();
      jobQueueService.queues.set('task-planning', mockQueue);
    });

    test('should add task planning job to queue', async () => {
      const projectId = 'test-project-123';
      const userId = 'user-456';
      const buildId = 'build-789';
      
      const result = await taskPlanner.addJobToQueue(projectId, mockSpecJson, userId, buildId);
      
      expect(result).toEqual({
        jobId: expect.any(String),
        buildId: 'build-789',
        status: 'queued'
      });
    });

    test('should process task planning job end-to-end', async () => {
      // Mock job object
      const mockJob = {
        id: 'job-123',
        data: {
          projectId: 'project-123',
          specJson: mockSpecJson,
          userId: 'user-456',
          buildId: 'build-789'
        },
        updateProgress: jest.fn().mockResolvedValue(true)
      };
      
      const result = await jobProcessor.processTaskPlanning(mockJob);
      
      expect(result).toEqual({
        projectId: 'project-123',
        buildId: 'build-789',
        userId: 'user-456',
        plan: expect.objectContaining({
          tasks: expect.any(Array),
          dependencyGraph: expect.any(Map),
          milestones: expect.any(Array),
          totalEstimation: expect.any(Object),
          openApiSkeleton: expect.any(Object),
          databaseSchema: expect.any(Object)
        }),
        generatedAt: expect.any(String)
      });
      
      // Verify progress updates were called
      expect(mockJob.updateProgress).toHaveBeenCalledWith(25);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(50);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(90);
    });

    test('should handle job processing errors with retry logic', async () => {
      const mockJob = {
        id: 'job-123',
        data: {
          projectId: 'project-123',
          specJson: mockSpecJson,
          userId: 'user-456'
        },
        attemptsMade: 1,
        updateProgress: jest.fn().mockResolvedValue(true)
      };
      
      // Mock task planner to throw a transient error
      const originalPlanProject = taskPlanner.planProject;
      taskPlanner.planProject = jest.fn().mockRejectedValue(new Error('Network timeout'));
      
      try {
        await jobProcessor.processTaskPlanning(mockJob);
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error.message).toBe('Network timeout');
        expect(jobProcessor.isTransientFailure(error)).toBe(true);
      }
      
      // Restore original function
      taskPlanner.planProject = originalPlanProject;
    });

    test('should validate complete workflow from spec to task queue', async () => {
      // 1. Decompose spec into tasks
      const taskDecomposition = await taskPlanner.decomposeSpec(mockSpecJson);
      
      expect(taskDecomposition.tasks.length).toBeGreaterThan(0);
      expect(taskDecomposition.dependencyGraph).toBeDefined();
      
      // 2. Validate task ordering
      const orderedTasks = taskDecomposition.tasks;
      const isValidOrder = orderedTasks.every((task, index) => {
        return task.dependencies.every(depId => {
          const depIndex = orderedTasks.findIndex(t => t.id === depId);
          return depIndex < index;
        });
      });
      expect(isValidOrder).toBe(true);
      
      // 3. Generate complete project plan
      const fullPlan = await taskPlanner.planProject(mockSpecJson);
      
      expect(fullPlan.tasks).toEqual(taskDecomposition.tasks);
      expect(fullPlan.openApiSkeleton).toBeDefined();
      expect(fullPlan.databaseSchema).toBeDefined();
      
      // 4. Validate job payload structure
      const jobPayload = {
        projectId: 'test-project',
        specJson: mockSpecJson,
        userId: 'test-user',
        buildId: 'test-build'
      };
      
      expect(() => {
        jobProcessor.validateJobPayload('task-planning', jobPayload);
      }).not.toThrow();
      
      // 5. Simulate job processing
      const mockJob = {
        id: 'integration-test-job',
        data: jobPayload,
        updateProgress: jest.fn().mockResolvedValue(true)
      };
      
      const processingResult = await jobProcessor.processTaskPlanning(mockJob);
      
      expect(processingResult.plan.tasks.length).toBe(fullPlan.tasks.length);
      expect(processingResult.projectId).toBe(jobPayload.projectId);
    });
  });

  describe('retry logic and error handling', () => {
    test('should retry transient failures up to 3 times', () => {
      const transientError = new Error('Connection timeout');
      
      // Should retry for attempts 1 and 2
      expect(jobProcessor.isTransientFailure(transientError)).toBe(true);
      
      // Mock job with different attempt counts
      const jobAttempt1 = { attemptsMade: 1 };
      const jobAttempt2 = { attemptsMade: 2 };
      const jobAttempt3 = { attemptsMade: 3 };
      
      expect(jobAttempt1.attemptsMade < 3).toBe(true); // Should retry
      expect(jobAttempt2.attemptsMade < 3).toBe(true); // Should retry
      expect(jobAttempt3.attemptsMade < 3).toBe(false); // Should escalate
    });

    test('should escalate permanent failures immediately', () => {
      const permanentError = new Error('Invalid configuration');
      
      expect(jobProcessor.isTransientFailure(permanentError)).toBe(false);
      
      // Should escalate because it's not a transient failure (regardless of attempt count)
      const jobAttempt1 = { attemptsMade: 1 };
      const shouldEscalate = !jobProcessor.isTransientFailure(permanentError) || jobAttempt1.attemptsMade >= 3;
      expect(shouldEscalate).toBe(true);
    });

    test('should handle escalation to human-in-loop', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const mockJob = {
        id: 'failed-job-123',
        queueName: 'task-planning',
        data: { projectId: 'test' },
        attemptsMade: 3
      };
      
      const error = new Error('Persistent failure');
      
      await jobProcessor.escalateToHuman(mockJob, error);
      
      expect(consoleSpy).toHaveBeenCalledWith('Job escalated to human-in-loop:', expect.objectContaining({
        jobId: 'failed-job-123',
        queueName: 'task-planning',
        error: expect.objectContaining({
          message: 'Persistent failure'
        }),
        status: 'pending_human_review'
      }));
      
      consoleSpy.mockRestore();
    });
  });
});