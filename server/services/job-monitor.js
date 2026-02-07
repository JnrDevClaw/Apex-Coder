const jobQueueService = require('./job-queue');
const jobProcessor = require('./job-processor');

class JobMonitor {
  constructor() {
    this.metrics = {
      startTime: Date.now(),
      totalJobs: 0,
      successfulJobs: 0,
      failedJobs: 0,
      averageProcessingTime: 0,
      queueHealthStatus: {},
      alerts: []
    };
    
    this.thresholds = {
      maxFailureRate: 0.1, // 10% failure rate threshold
      maxQueueSize: 1000,
      maxProcessingTime: 300000, // 5 minutes
      maxMemoryUsage: 0.8 // 80% memory usage
    };
    
    this.monitoringInterval = null;
    this.isMonitoring = false;
  }

  async startMonitoring(intervalMs = 30000) {
    if (this.isMonitoring) {
      console.log('Job monitoring already started');
      return;
    }

    this.isMonitoring = true;
    console.log(`Starting job monitoring with ${intervalMs}ms interval`);

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
        await this.checkHealthStatus();
        await this.checkAlerts();
      } catch (error) {
        console.error('Error during monitoring cycle:', error);
      }
    }, intervalMs);
  }

  async stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    console.log('Job monitoring stopped');
  }

  async collectMetrics() {
    try {
      // Get queue statistics
      const queueStats = await jobQueueService.getAllQueueStats();
      
      // Get processor metrics
      const processorMetrics = jobProcessor.getMetrics();
      
      // Update metrics
      this.metrics.totalJobs = processorMetrics.jobsProcessed;
      this.metrics.successfulJobs = processorMetrics.jobsSucceeded;
      this.metrics.failedJobs = processorMetrics.jobsFailed;
      this.metrics.averageProcessingTime = processorMetrics.averageProcessingTime;
      
      // Calculate failure rate
      this.metrics.failureRate = this.metrics.totalJobs > 0 
        ? this.metrics.failedJobs / this.metrics.totalJobs 
        : 0;
      
      // Update queue health status
      for (const [queueName, stats] of Object.entries(queueStats)) {
        this.metrics.queueHealthStatus[queueName] = {
          ...stats,
          isHealthy: this.isQueueHealthy(stats),
          lastChecked: new Date().toISOString()
        };
      }
      
      // Get system metrics
      const memoryUsage = process.memoryUsage();
      this.metrics.systemHealth = {
        memoryUsage: {
          rss: memoryUsage.rss,
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          external: memoryUsage.external,
          usagePercentage: memoryUsage.heapUsed / memoryUsage.heapTotal
        },
        uptime: process.uptime(),
        nodeVersion: process.version
      };
      
    } catch (error) {
      console.error('Failed to collect metrics:', error);
    }
  }

  isQueueHealthy(queueStats) {
    // Check if queue size is within acceptable limits
    if (queueStats.waiting > this.thresholds.maxQueueSize) {
      return false;
    }
    
    // Check if there are too many failed jobs
    const totalJobs = queueStats.waiting + queueStats.active + queueStats.completed + queueStats.failed;
    if (totalJobs > 0) {
      const failureRate = queueStats.failed / totalJobs;
      if (failureRate > this.thresholds.maxFailureRate) {
        return false;
      }
    }
    
    return true;
  }

  async checkHealthStatus() {
    const healthChecks = {
      redis: await this.checkRedisHealth(),
      queues: await this.checkQueuesHealth(),
      system: await this.checkSystemHealth(),
      processors: await this.checkProcessorsHealth()
    };

    this.metrics.overallHealth = {
      isHealthy: Object.values(healthChecks).every(check => check.isHealthy),
      checks: healthChecks,
      lastChecked: new Date().toISOString()
    };

    return this.metrics.overallHealth;
  }

  async checkRedisHealth() {
    try {
      const redisStatus = require('./redis').getConnectionStatus();
      return {
        isHealthy: redisStatus.isConnected,
        status: redisStatus.isConnected ? 'connected' : 'disconnected',
        details: redisStatus
      };
    } catch (error) {
      return {
        isHealthy: false,
        status: 'error',
        error: error.message
      };
    }
  }

  async checkQueuesHealth() {
    try {
      const queueNames = jobQueueService.getQueueNames();
      const unhealthyQueues = [];

      for (const queueName of queueNames) {
        const queueHealth = this.metrics.queueHealthStatus[queueName];
        if (queueHealth && !queueHealth.isHealthy) {
          unhealthyQueues.push(queueName);
        }
      }

      return {
        isHealthy: unhealthyQueues.length === 0,
        status: unhealthyQueues.length === 0 ? 'healthy' : 'degraded',
        unhealthyQueues,
        totalQueues: queueNames.length
      };
    } catch (error) {
      return {
        isHealthy: false,
        status: 'error',
        error: error.message
      };
    }
  }

  async checkSystemHealth() {
    try {
      const memoryUsage = this.metrics.systemHealth?.memoryUsage?.usagePercentage || 0;
      const isMemoryHealthy = memoryUsage < this.thresholds.maxMemoryUsage;

      return {
        isHealthy: isMemoryHealthy,
        status: isMemoryHealthy ? 'healthy' : 'high_memory_usage',
        memoryUsagePercentage: Math.round(memoryUsage * 100),
        uptime: process.uptime()
      };
    } catch (error) {
      return {
        isHealthy: false,
        status: 'error',
        error: error.message
      };
    }
  }

  async checkProcessorsHealth() {
    try {
      const processorMetrics = jobProcessor.getMetrics();
      const isHealthy = processorMetrics.successRate >= (1 - this.thresholds.maxFailureRate) * 100;

      return {
        isHealthy,
        status: isHealthy ? 'healthy' : 'high_failure_rate',
        successRate: Math.round(processorMetrics.successRate),
        averageProcessingTime: Math.round(processorMetrics.averageProcessingTime)
      };
    } catch (error) {
      return {
        isHealthy: false,
        status: 'error',
        error: error.message
      };
    }
  }

  async checkAlerts() {
    const newAlerts = [];

    // Check failure rate alert
    if (this.metrics.failureRate > this.thresholds.maxFailureRate) {
      newAlerts.push({
        type: 'high_failure_rate',
        severity: 'warning',
        message: `Job failure rate (${Math.round(this.metrics.failureRate * 100)}%) exceeds threshold (${Math.round(this.thresholds.maxFailureRate * 100)}%)`,
        timestamp: new Date().toISOString(),
        data: { failureRate: this.metrics.failureRate }
      });
    }

    // Check queue size alerts
    for (const [queueName, queueHealth] of Object.entries(this.metrics.queueHealthStatus)) {
      if (queueHealth.waiting > this.thresholds.maxQueueSize) {
        newAlerts.push({
          type: 'large_queue_size',
          severity: 'warning',
          message: `Queue '${queueName}' has ${queueHealth.waiting} waiting jobs (threshold: ${this.thresholds.maxQueueSize})`,
          timestamp: new Date().toISOString(),
          data: { queueName, waitingJobs: queueHealth.waiting }
        });
      }
    }

    // Check memory usage alert
    const memoryUsage = this.metrics.systemHealth?.memoryUsage?.usagePercentage || 0;
    if (memoryUsage > this.thresholds.maxMemoryUsage) {
      newAlerts.push({
        type: 'high_memory_usage',
        severity: 'critical',
        message: `Memory usage (${Math.round(memoryUsage * 100)}%) exceeds threshold (${Math.round(this.thresholds.maxMemoryUsage * 100)}%)`,
        timestamp: new Date().toISOString(),
        data: { memoryUsage }
      });
    }

    // Add new alerts and keep only recent ones (last 100)
    this.metrics.alerts.push(...newAlerts);
    this.metrics.alerts = this.metrics.alerts.slice(-100);

    if (newAlerts.length > 0) {
      console.log(`Generated ${newAlerts.length} new alerts:`, newAlerts);
    }

    return newAlerts;
  }

  getMetrics() {
    return {
      ...this.metrics,
      isMonitoring: this.isMonitoring,
      monitoringDuration: Date.now() - this.metrics.startTime
    };
  }

  getAlerts(severity = null, limit = 50) {
    let alerts = this.metrics.alerts;
    
    if (severity) {
      alerts = alerts.filter(alert => alert.severity === severity);
    }
    
    return alerts.slice(-limit).reverse(); // Most recent first
  }

  clearAlerts() {
    const clearedCount = this.metrics.alerts.length;
    this.metrics.alerts = [];
    console.log(`Cleared ${clearedCount} alerts`);
    return clearedCount;
  }

  updateThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    console.log('Updated monitoring thresholds:', this.thresholds);
  }

  getThresholds() {
    return { ...this.thresholds };
  }
}

module.exports = new JobMonitor();