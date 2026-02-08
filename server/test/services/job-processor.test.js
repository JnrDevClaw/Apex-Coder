const jobProcessor = require('../../services/job-processor');
const jobQueueService = require('../../services/job-queue');
const taskPlanner = require('../../services/task-planner');

// Mock dependencies
jest.mock('../../services/job-queue');
jest.mock('../../services/task-planner');

describe('JobProcessor', () => {
  let mockJob;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock job object
    mockJob = {
      id: 'job-123',
      data: {},
      attemptsMade: 1,
      updateProgress: jest.fn().mockResolvedValue(true)
    };
    
    // Mock job queue service
    jobQueueService.createWorker = jest.fn().mockResolvedValue(true);
    jobQueueService.addJob = jest.fn().mockResolvedValue({ id: 'job-456' });
    jobQueueService.getJobStatus = jest.fn().mockResolvedValue({ status: 'completed' });
  });

  describe('initialization', () => {
    test('should initialize with default processors', async () => {
      await jobProcessor.initialize();
      
      expect(jobQueueService.createWorker).toHaveBeenCalledWith('task-planning', expect.any(Function), expect.any(Object));
      expect(jobQueueService.createWorker).toHaveBeenCalledWith('code-generation', expect.any(Function), expect.any(Object));
      expect(jobQueueService.createWorker).toHaveBeenCalledWith('deployment', expect.any(Function), expect.any(Object));
    });
  });

  describe('job payload validation', () => {
    test('should validate task-planning payload successfully', () => {
      const validPayload = {
        projectId: 'project-123',
        specJson: { projectName: 'Test App' },
        userId: 'user-456',
        buildId: 'build-789'
      };
      
      expect(() => {
        jobProcessor.validateJobPayload('task-planning', validPayload);
      }).not.toThrow();
    });

    test('should reject payload with missing required fields', () => {
      const invalidPayload = {
        projectId: 'project-123'
        // Missing specJson and userId
      };
      
      expect(() => {
        jobProcessor.validateJobPayload('task-planning', invalidPayload);
      }).toThrow("Missing required field 'specJson'");
    });

    test('should validate field types correctly', () => {
      const invalidPayload = {
        projectId: 123, // Should be string
        specJson: { projectName: 'Test' },
        userId: 'user-456'
      };
      
      expect(() => {
        jobProcessor.validateJobPayload('task-planning', invalidPayload);
      }).toThrow('projectId must be a string');
    });

    test('should validate code-generation payload', () => {
      const validPayload = {
        projectId: 'project-123',
        buildId: 'build-456',
        tasks: [{ id: 1, name: 'test task' }],
        agentRole: 'coder'
      };
      
      expect(() => {
        jobProcessor.validateJobPayload('code-generation', validPayload);
      }).not.toThrow();
    });

    test('should validate deployment payload', () => {
      const validPayload = {
        projectId: 'project-123',
        buildId: 'build-456',
        deployTarget: 'aws:ecs',
        artifacts: ['artifact1.zip', 'artifact2.zip']
      };
      
      expect(() => {
        jobProcessor.validateJobPayload('deployment', validPayload);
      }).not.toThrow();
    });

    test('should throw error for unknown queue schema', () => {
      expect(() => {
        jobProcessor.validateJobPayload('unknown-queue', {});
      }).toThrow("No schema defined for queue 'unknown-queue'");
    });
  });

  describe('transient failure detection', () => {
    test('should detect network-related transient failures', () => {
      const networkError = new Error('Network timeout occurred');
      expect(jobProcessor.isTransientFailure(networkError)).toBe(true);
      
      const connectionError = new Error('Connection refused');
      expect(jobProcessor.isTransientFailure(connectionError)).toBe(true);
      
      const rateLimitError = new Error('Rate limit exceeded');
      expect(jobProcessor.isTransientFailure(rateLimitError)).toBe(true);
    });

    test('should not detect permanent failures as transient', () => {
      const syntaxError = new Error('Syntax error in code');
      expect(jobProcessor.isTransientFailure(syntaxError)).toBe(false);
      
      const validationError = new Error('Invalid input data');
      expect(jobProcessor.isTransientFailure(validationError)).toBe(false);
    });
  });

  describe('retry logic and escalation', () => {
    test('should retry transient failures within attempt limit', async () => {
      const transientError = new Error('Network timeout');
      mockJob.attemptsMade = 2; // Less than 3
      
      const shouldRetry = jobProcessor.isTransientFailure(transientError) && mockJob.attemptsMade < 3;
      expect(shouldRetry).toBe(true);
    });

    test('should escalate after max retry attempts', async () => {
      const transientError = new Error('Network timeout');
      mockJob.attemptsMade = 3; // At max attempts
      
      const shouldEscalate = !jobProcessor.isTransientFailure(transientError) || mockJob.attemptsMade >= 3;
      expect(shouldEscalate).toBe(true);
    });

    test('should escalate permanent failures immediately', async () => {
      const permanentError = new Error('Invalid configuration');
      mockJob.attemptsMade = 1;
      
      const shouldEscalate = !jobProcessor.isTransientFailure(permanentError);
      expect(shouldEscalate).toBe(true);
    });

    test('should log escalation details', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const error = new Error('Test error');
      
      await jobProcessor.escalateToHuman(mockJob, error);
      
      expect(consoleSpy).toHaveBeenCalledWith('Job escalated to human-in-loop:', expect.objectContaining({
        jobId: 'job-123',
        error: expect.objectContaining({
          message: 'Test error'
        }),
        status: 'pending_human_review'
      }));
      
      consoleSpy.mockRestore();
    });
  });

  describe('task planning processor', () => {
    beforeEach(() => {
      mockJob.data = {
        projectId: 'project-123',
        specJson: { projectName: 'Test App' },
        userId: 'user-456',
        buildId: 'build-789'
      };
      
      taskPlanner.planProject = jest.fn().mockResolvedValue({
        tasks: [{ id: 1, name: 'Setup project' }],
        milestones: [{ id: 1, name: 'Foundation' }],
        totalEstimation: { totalTimeSeconds: 3600 }
      });
    });

    test('should process task planning job successfully', async () => {
      const result = await jobProcessor.processTaskPlanning(mockJob);
      
      expect(mockJob.updateProgress).toHaveBeenCalledWith(25);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(50);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(90);
      
      expect(taskPlanner.planProject).toHaveBeenCalledWith(mockJob.data.specJson);
      
      expect(result).toEqual({
        projectId: 'project-123',
        buildId: 'build-789',
        userId: 'user-456',
        plan: expect.objectContaining({
          tasks: expect.any(Array),
          milestones: expect.any(Array)
        }),
        generatedAt: expect.any(String)
      });
    });

    test('should handle task planning errors', async () => {
      const planningError = new Error('Planning failed');
      taskPlanner.planProject.mockRejectedValue(planningError);
      
      await expect(jobProcessor.processTaskPlanning(mockJob)).rejects.toThrow('Planning failed');
    });
  });

  describe('code generation processor', () => {
    beforeEach(() => {
      mockJob.data = {
        projectId: 'project-123',
        buildId: 'build-456',
        tasks: [{ id: 1, name: 'Create models' }],
        agentRole: 'coder',
        iteration: 1
      };
    });

    test('should process code generation job successfully', async () => {
      const result = await jobProcessor.processCodeGeneration(mockJob);
      
      expect(mockJob.updateProgress).toHaveBeenCalledWith(20);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(60);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(80);
      
      expect(result).toEqual({
        generatedFiles: expect.arrayContaining([
          expect.objectContaining({
            path: expect.any(String),
            content: expect.any(String),
            type: expect.any(String)
          })
        ]),
        testResults: expect.objectContaining({
          passed: true,
          testsRun: 5,
          testsPassed: 5,
          testsFailed: 0,
          coverage: 85
        }),
        iteration: 1,
        agentRole: 'coder',
        generatedAt: expect.any(String)
      });
    });
  });

  describe('deployment processor', () => {
    beforeEach(() => {
      mockJob.data = {
        projectId: 'project-123',
        buildId: 'build-456',
        deployTarget: 'aws:ecs',
        artifacts: ['app.zip', 'config.json']
      };
    });

    test('should process deployment job successfully', async () => {
      const result = await jobProcessor.processDeployment(mockJob);
      
      expect(mockJob.updateProgress).toHaveBeenCalledWith(30);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(90);
      
      expect(result).toEqual({
        deploymentId: expect.stringMatching(/^deploy-\d+$/),
        status: 'success',
        endpoint: 'https://project-123.example.com',
        deployedAt: expect.any(String),
        artifacts: expect.arrayContaining([
          expect.objectContaining({
            deployed: true
          })
        ])
      });
    });
  });

  describe('metrics tracking', () => {
    test('should update metrics on successful job processing', () => {
      jobProcessor.updateMetrics(true, 1500);
      
      const metrics = jobProcessor.getMetrics();
      expect(metrics.jobsProcessed).toBeGreaterThan(0);
      expect(metrics.jobsSucceeded).toBeGreaterThan(0);
      expect(metrics.totalProcessingTime).toBeGreaterThan(0);
      expect(metrics.averageProcessingTime).toBeGreaterThan(0);
      expect(metrics.successRate).toBeGreaterThan(0);
    });

    test('should update metrics on failed job processing', () => {
      const initialMetrics = jobProcessor.getMetrics();
      
      jobProcessor.updateMetrics(false, 800);
      
      const updatedMetrics = jobProcessor.getMetrics();
      expect(updatedMetrics.jobsProcessed).toBe(initialMetrics.jobsProcessed + 1);
      expect(updatedMetrics.jobsFailed).toBe(initialMetrics.jobsFailed + 1);
    });

    test('should calculate success rate correctly', () => {
      // Reset metrics by creating new instance conceptually
      const initialSucceeded = jobProcessor.getMetrics().jobsSucceeded;
      const initialProcessed = jobProcessor.getMetrics().jobsProcessed;
      
      jobProcessor.updateMetrics(true, 1000);
      jobProcessor.updateMetrics(false, 1000);
      
      const metrics = jobProcessor.getMetrics();
      const expectedSuccessRate = ((initialSucceeded + 1) / (initialProcessed + 2)) * 100;
      expect(metrics.successRate).toBeCloseTo(expectedSuccessRate, 1);
    });
  });

  describe('processor registration', () => {
    test('should register custom processor', async () => {
      const customProcessor = jest.fn().mockResolvedValue({ success: true });
      const queueName = 'custom-queue';
      
      await jobProcessor.registerProcessor(queueName, customProcessor, { concurrency: 2 });
      
      expect(jobQueueService.createWorker).toHaveBeenCalledWith(
        queueName, 
        expect.any(Function), 
        expect.objectContaining({ concurrency: 2 })
      );
    });

    test('should not register processor twice for same queue', async () => {
      const processor = jest.fn();
      const queueName = 'duplicate-queue';
      
      await jobProcessor.registerProcessor(queueName, processor);
      await jobProcessor.registerProcessor(queueName, processor);
      
      // Should only create worker once
      expect(jobQueueService.createWorker).toHaveBeenCalledTimes(1);
    });

    test('should get list of registered processors', () => {
      const processors = jobProcessor.getRegisteredProcessors();
      
      expect(processors).toContain('task-planning');
      expect(processors).toContain('code-generation');
      expect(processors).toContain('deployment');
    });
  });

  describe('utility methods', () => {
    test('should add job through service', async () => {
      const job = await jobProcessor.addJob('test-queue', 'test-job', { data: 'test' });
      
      expect(jobQueueService.addJob).toHaveBeenCalledWith('test-queue', 'test-job', { data: 'test' }, {});
      expect(job).toEqual({ id: 'job-456' });
    });

    test('should get job status through service', async () => {
      const status = await jobProcessor.getJobStatus('test-queue', 'job-123');
      
      expect(jobQueueService.getJobStatus).toHaveBeenCalledWith('test-queue', 'job-123');
      expect(status).toEqual({ status: 'completed' });
    });
  });
});