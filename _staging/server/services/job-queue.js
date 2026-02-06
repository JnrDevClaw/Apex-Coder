const { Queue, Worker, QueueEvents } = require('bullmq');
const redisService = require('./redis');

class JobQueueService {
  constructor() {
    this.queues = new Map();
    this.workers = new Map();
    this.queueEvents = new Map();
    this.connection = null;
  }

  async initialize() {
    try {
      // Initialize Redis connection
      this.connection = await redisService.connect();
      
      // Create default queues
      await this.createQueue('task-planning', {
        defaultJobOptions: {
          removeOnComplete: 10,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        }
      });

      await this.createQueue('code-generation', {
        defaultJobOptions: {
          removeOnComplete: 5,
          removeOnFail: 20,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        }
      });

      await this.createQueue('deployment', {
        defaultJobOptions: {
          removeOnComplete: 10,
          removeOnFail: 10,
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 10000,
          },
        }
      });

      console.log('Job queue service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize job queue service:', error);
      const { logWorkerError } = require('./deployment-error-logger');
      logWorkerError('initialize_job_queue', error, {
        operation: 'initialize',
        queueNames: ['task-planning', 'code-generation', 'deployment']
      });
      throw error;
    }
  }

  async createQueue(queueName, options = {}) {
    if (this.queues.has(queueName)) {
      return this.queues.get(queueName);
    }

    const queue = new Queue(queueName, {
      connection: this.connection,
      ...options
    });

    // Create queue events for monitoring
    const queueEvents = new QueueEvents(queueName, {
      connection: this.connection
    });

    this.queues.set(queueName, queue);
    this.queueEvents.set(queueName, queueEvents);

    console.log(`Queue '${queueName}' created successfully`);
    return queue;
  }

  async addJob(queueName, jobName, data, options = {}) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      const error = new Error(`Queue '${queueName}' not found`);
      const { logWorkerError } = require('./deployment-error-logger');
      logWorkerError('add_job', error, {
        queueName,
        jobName,
        operation: 'add_job',
        userId: data.userId
      });
      throw error;
    }

    try {
      const job = await queue.add(jobName, data, {
        ...options,
        // Add correlation ID for tracking
        jobId: options.jobId || `${queueName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      });

      console.log(`Job '${jobName}' added to queue '${queueName}' with ID: ${job.id}`);
      return job;
    } catch (error) {
      const { logWorkerError } = require('./deployment-error-logger');
      logWorkerError('add_job', error, {
        queueName,
        jobName,
        operation: 'add_job_failed',
        userId: data.userId,
        jobId: options.jobId
      });
      throw error;
    }
  }

  async createWorker(queueName, processor, options = {}) {
    if (this.workers.has(queueName)) {
      console.log(`Worker for queue '${queueName}' already exists`);
      return this.workers.get(queueName);
    }

    const worker = new Worker(queueName, processor, {
      connection: this.connection,
      concurrency: options.concurrency || 1,
      ...options
    });

    // Set up worker event handlers
    worker.on('completed', (job) => {
      console.log(`Job ${job.id} completed in queue ${queueName}`);
    });

    worker.on('failed', (job, err) => {
      console.error(`Job ${job.id} failed in queue ${queueName}:`, err);
    });

    worker.on('error', (err) => {
      console.error(`Worker error in queue ${queueName}:`, err);
    });

    this.workers.set(queueName, worker);
    console.log(`Worker created for queue '${queueName}'`);
    return worker;
  }

  async getJobStatus(queueName, jobId) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      return null;
    }

    return {
      id: job.id,
      name: job.name,
      data: job.data,
      progress: job.progress,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      attemptsMade: job.attemptsMade,
      opts: job.opts
    };
  }

  async getQueueStats(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const waiting = await queue.getWaiting();
    const active = await queue.getActive();
    const completed = await queue.getCompleted();
    const failed = await queue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length
    };
  }

  async pauseQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    await queue.pause();
    console.log(`Queue '${queueName}' paused`);
  }

  async resumeQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    await queue.resume();
    console.log(`Queue '${queueName}' resumed`);
  }

  async retryFailedJobs(queueName, maxJobs = 100) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const failedJobs = await queue.getFailed(0, maxJobs - 1);
    let retriedCount = 0;

    for (const job of failedJobs) {
      try {
        await job.retry();
        retriedCount++;
      } catch (error) {
        console.error(`Failed to retry job ${job.id}:`, error);
      }
    }

    console.log(`Retried ${retriedCount} failed jobs in queue '${queueName}'`);
    return retriedCount;
  }

  async cleanQueue(queueName, grace = 5000, limit = 100) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const cleaned = await queue.clean(grace, limit, 'completed');
    console.log(`Cleaned ${cleaned.length} completed jobs from queue '${queueName}'`);
    return cleaned.length;
  }

  async shutdown() {
    console.log('Shutting down job queue service...');

    // Close all workers
    for (const [queueName, worker] of this.workers) {
      try {
        await worker.close();
        console.log(`Worker for queue '${queueName}' closed`);
      } catch (error) {
        console.error(`Error closing worker for queue '${queueName}':`, error);
      }
    }

    // Close all queue events
    for (const [queueName, queueEvents] of this.queueEvents) {
      try {
        await queueEvents.close();
        console.log(`Queue events for '${queueName}' closed`);
      } catch (error) {
        console.error(`Error closing queue events for '${queueName}':`, error);
      }
    }

    // Close all queues
    for (const [queueName, queue] of this.queues) {
      try {
        await queue.close();
        console.log(`Queue '${queueName}' closed`);
      } catch (error) {
        console.error(`Error closing queue '${queueName}':`, error);
      }
    }

    // Disconnect Redis
    await redisService.disconnect();

    this.queues.clear();
    this.workers.clear();
    this.queueEvents.clear();
    this.connection = null;

    console.log('Job queue service shutdown complete');
  }

  // Utility methods for monitoring
  async getAllQueueStats() {
    const stats = {};
    for (const queueName of this.queues.keys()) {
      stats[queueName] = await this.getQueueStats(queueName);
    }
    return stats;
  }

  getQueueNames() {
    return Array.from(this.queues.keys());
  }

  isInitialized() {
    return !!this.connection && redisService.getConnectionStatus().isConnected;
  }
}

module.exports = new JobQueueService();