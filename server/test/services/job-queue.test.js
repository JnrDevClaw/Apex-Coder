const jobQueueService = require('../../services/job-queue');
const redisService = require('../../services/redis');

// Mock Redis for testing
jest.mock('../../services/redis');
jest.mock('bullmq');

const { Queue, Worker, QueueEvents } = require('bullmq');

describe('JobQueueService', () => {
  let mockRedisClient;
  let mockQueue;
  let mockWorker;
  let mockQueueEvents;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock Redis client
    mockRedisClient = {
      connect: jest.fn().mockResolvedValue(true),
      quit: jest.fn().mockResolvedValue(true),
      ping: jest.fn().mockResolvedValue('PONG')
    };
    
    redisService.connect.mockResolvedValue(mockRedisClient);
    redisService.getConnectionStatus.mockReturnValue({ isConnected: true });
    
    // Mock BullMQ components
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-123', name: 'test-job' }),
      getJob: jest.fn(),
      getWaiting: jest.fn().mockResolvedValue([]),
      getActive: jest.fn().mockResolvedValue([]),
      getCompleted: jest.fn().mockResolvedValue([]),
      getFailed: jest.fn().mockResolvedValue([]),
      pause: jest.fn().mockResolvedValue(true),
      resume: jest.fn().mockResolvedValue(true),
      clean: jest.fn().mockResolvedValue([]),
      close: jest.fn().mockResolvedValue(true)
    };
    
    mockWorker = {
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(true)
    };
    
    mockQueueEvents = {
      close: jest.fn().mockResolvedValue(true)
    };
    
    Queue.mockImplementation(() => mockQueue);
    Worker.mockImplementation(() => mockWorker);
    QueueEvents.mockImplementation(() => mockQueueEvents);
  });

  afterEach(async () => {
    // Clean up any connections
    if (jobQueueService.isInitialized()) {
      await jobQueueService.shutdown();
    }
  });

  describe('initialization', () => {
    test('should initialize successfully with default queues', async () => {
      await jobQueueService.initialize();
      
      expect(redisService.connect).toHaveBeenCalled();
      expect(Queue).toHaveBeenCalledTimes(3); // task-planning, code-generation, deployment
      expect(QueueEvents).toHaveBeenCalledTimes(3);
      expect(jobQueueService.isInitialized()).toBe(true);
    });

    test('should handle initialization failure', async () => {
      redisService.connect.mockRejectedValue(new Error('Redis connection failed'));
      
      await expect(jobQueueService.initialize()).rejects.toThrow('Redis connection failed');
    });
  });

  describe('queue management', () => {
    beforeEach(async () => {
      await jobQueueService.initialize();
    });

    test('should create new queue successfully', async () => {
      const queueName = 'test-queue';
      const options = { defaultJobOptions: { attempts: 5 } };
      
      const queue = await jobQueueService.createQueue(queueName, options);
      
      expect(Queue).toHaveBeenCalledWith(queueName, expect.objectContaining({
        connection: mockRedisClient,
        ...options
      }));
      expect(queue).toBe(mockQueue);
    });

    test('should return existing queue if already created', async () => {
      const queueName = 'task-planning'; // Already created during initialization
      
      const queue = await jobQueueService.createQueue(queueName);
      
      expect(queue).toBe(mockQueue);
      // Should not create a new Queue instance
      expect(Queue).toHaveBeenCalledTimes(3); // Only the initial 3 from initialization
    });

    test('should get queue statistics', async () => {
      const queueName = 'task-planning';
      
      mockQueue.getWaiting.mockResolvedValue([1, 2]);
      mockQueue.getActive.mockResolvedValue([3]);
      mockQueue.getCompleted.mockResolvedValue([4, 5, 6]);
      mockQueue.getFailed.mockResolvedValue([7]);
      
      const stats = await jobQueueService.getQueueStats(queueName);
      
      expect(stats).toEqual({
        waiting: 2,
        active: 1,
        completed: 3,
        failed: 1,
        total: 7
      });
    });

    test('should throw error for non-existent queue stats', async () => {
      await expect(jobQueueService.getQueueStats('non-existent')).rejects.toThrow("Queue 'non-existent' not found");
    });
  });

  describe('job management', () => {
    beforeEach(async () => {
      await jobQueueService.initialize();
    });

    test('should add job to queue successfully', async () => {
      const queueName = 'task-planning';
      const jobName = 'plan-project';
      const data = { projectId: 'test-123', specJson: {} };
      const options = { priority: 1 };
      
      const job = await jobQueueService.addJob(queueName, jobName, data, options);
      
      expect(mockQueue.add).toHaveBeenCalledWith(jobName, data, expect.objectContaining({
        ...options,
        jobId: expect.stringMatching(/^task-planning-\d+-[a-z0-9]+$/)
      }));
      expect(job).toEqual({ id: 'job-123', name: 'test-job' });
    });

    test('should throw error when adding job to non-existent queue', async () => {
      await expect(jobQueueService.addJob('non-existent', 'test-job', {})).rejects.toThrow("Queue 'non-existent' not found");
    });

    test('should get job status', async () => {
      const queueName = 'task-planning';
      const jobId = 'job-123';
      
      const mockJob = {
        id: jobId,
        name: 'plan-project',
        data: { projectId: 'test' },
        progress: 50,
        returnvalue: null,
        failedReason: null,
        processedOn: Date.now(),
        finishedOn: null,
        attemptsMade: 1,
        opts: { attempts: 3 }
      };
      
      mockQueue.getJob.mockResolvedValue(mockJob);
      
      const status = await jobQueueService.getJobStatus(queueName, jobId);
      
      expect(status).toEqual({
        id: jobId,
        name: 'plan-project',
        data: { projectId: 'test' },
        progress: 50,
        returnvalue: null,
        failedReason: null,
        processedOn: mockJob.processedOn,
        finishedOn: null,
        attemptsMade: 1,
        opts: { attempts: 3 }
      });
    });

    test('should return null for non-existent job', async () => {
      mockQueue.getJob.mockResolvedValue(null);
      
      const status = await jobQueueService.getJobStatus('task-planning', 'non-existent');
      
      expect(status).toBeNull();
    });
  });

  describe('queue operations', () => {
    beforeEach(async () => {
      await jobQueueService.initialize();
    });

    test('should pause queue', async () => {
      const queueName = 'task-planning';
      
      await jobQueueService.pauseQueue(queueName);
      
      expect(mockQueue.pause).toHaveBeenCalled();
    });

    test('should resume queue', async () => {
      const queueName = 'task-planning';
      
      await jobQueueService.resumeQueue(queueName);
      
      expect(mockQueue.resume).toHaveBeenCalled();
    });

    test('should retry failed jobs', async () => {
      const queueName = 'task-planning';
      const mockFailedJobs = [
        { id: 'job-1', retry: jest.fn().mockResolvedValue(true) },
        { id: 'job-2', retry: jest.fn().mockResolvedValue(true) },
        { id: 'job-3', retry: jest.fn().mockRejectedValue(new Error('Retry failed')) }
      ];
      
      mockQueue.getFailed.mockResolvedValue(mockFailedJobs);
      
      const retriedCount = await jobQueueService.retryFailedJobs(queueName, 100);
      
      expect(mockQueue.getFailed).toHaveBeenCalledWith(0, 99);
      expect(mockFailedJobs[0].retry).toHaveBeenCalled();
      expect(mockFailedJobs[1].retry).toHaveBeenCalled();
      expect(mockFailedJobs[2].retry).toHaveBeenCalled();
      expect(retriedCount).toBe(2); // Only 2 succeeded
    });

    test('should clean completed jobs', async () => {
      const queueName = 'task-planning';
      const cleanedJobs = ['job-1', 'job-2', 'job-3'];
      
      mockQueue.clean.mockResolvedValue(cleanedJobs);
      
      const cleanedCount = await jobQueueService.cleanQueue(queueName, 5000, 100);
      
      expect(mockQueue.clean).toHaveBeenCalledWith(5000, 100, 'completed');
      expect(cleanedCount).toBe(3);
    });
  });

  describe('worker management', () => {
    beforeEach(async () => {
      await jobQueueService.initialize();
    });

    test('should create worker successfully', async () => {
      const queueName = 'test-queue';
      const processor = jest.fn();
      const options = { concurrency: 2 };
      
      const worker = await jobQueueService.createWorker(queueName, processor, options);
      
      expect(Worker).toHaveBeenCalledWith(queueName, processor, expect.objectContaining({
        connection: mockRedisClient,
        concurrency: 2,
        ...options
      }));
      expect(worker).toBe(mockWorker);
      expect(mockWorker.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockWorker.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(mockWorker.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    test('should return existing worker if already created', async () => {
      const queueName = 'test-queue';
      const processor = jest.fn();
      
      // Create worker first time
      await jobQueueService.createWorker(queueName, processor);
      
      // Try to create again
      const worker = await jobQueueService.createWorker(queueName, processor);
      
      expect(worker).toBe(mockWorker);
      expect(Worker).toHaveBeenCalledTimes(1); // Should only be called once
    });
  });

  describe('shutdown', () => {
    test('should shutdown gracefully', async () => {
      await jobQueueService.initialize();
      
      // Create some workers and queues
      await jobQueueService.createWorker('test-queue', jest.fn());
      
      await jobQueueService.shutdown();
      
      expect(mockWorker.close).toHaveBeenCalled();
      expect(mockQueueEvents.close).toHaveBeenCalled();
      expect(mockQueue.close).toHaveBeenCalled();
      expect(redisService.disconnect).toHaveBeenCalled();
      expect(jobQueueService.isInitialized()).toBe(false);
    });

    test('should handle shutdown errors gracefully', async () => {
      await jobQueueService.initialize();
      
      mockWorker.close.mockRejectedValue(new Error('Worker close failed'));
      mockQueue.close.mockRejectedValue(new Error('Queue close failed'));
      
      // Should not throw despite errors
      await expect(jobQueueService.shutdown()).resolves.not.toThrow();
    });
  });

  describe('utility methods', () => {
    beforeEach(async () => {
      await jobQueueService.initialize();
    });

    test('should get all queue stats', async () => {
      mockQueue.getWaiting.mockResolvedValue([1]);
      mockQueue.getActive.mockResolvedValue([2]);
      mockQueue.getCompleted.mockResolvedValue([3, 4]);
      mockQueue.getFailed.mockResolvedValue([]);
      
      const allStats = await jobQueueService.getAllQueueStats();
      
      expect(allStats).toHaveProperty('task-planning');
      expect(allStats).toHaveProperty('code-generation');
      expect(allStats).toHaveProperty('deployment');
      
      expect(allStats['task-planning']).toEqual({
        waiting: 1,
        active: 1,
        completed: 2,
        failed: 0,
        total: 4
      });
    });

    test('should get queue names', () => {
      const queueNames = jobQueueService.getQueueNames();
      
      expect(queueNames).toContain('task-planning');
      expect(queueNames).toContain('code-generation');
      expect(queueNames).toContain('deployment');
    });
  });
});