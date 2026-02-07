const metricsCollector = require('./metrics-collector');
const jobQueueService = require('./job-queue');

class MonitoringService {
  constructor() {
    this.alertThresholds = {
      buildFailureRate: 0.5, // 50%
      dailyCostLimit: 100, // $100
      queueBacklog: 100, // jobs
      buildTimeThreshold: 600000, // 10 minutes
      selfFixIterationsThreshold: 3,
      llmCallLatencyThreshold: 30000, // 30 seconds
      llmCallSuccessRateThreshold: 0.9, // 90%
      jobExecutionTimeThreshold: 900000 // 15 minutes
    };
    this.alertHistory = new Map();
    this.monitoringInterval = null;
    this.initialized = false;
    
    // Performance tracking
    this.llmCallMetrics = new Map(); // provider -> { calls, successes, totalLatency }
    this.jobExecutionMetrics = new Map(); // jobType -> { executions, totalTime, successes }
  }

  async initialize() {
    try {
      await metricsCollector.initialize();
      this.initialized = true;
      
      // Start monitoring loop
      this.startMonitoring();
      
      console.log('Monitoring service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize monitoring service:', error);
      throw error;
    }
  }

  startMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    // Run monitoring checks every 5 minutes
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.runMonitoringChecks();
      } catch (error) {
        console.error('Error in monitoring checks:', error);
      }
    }, 5 * 60 * 1000);
    
    console.log('Monitoring loop started');
  }

  async runMonitoringChecks() {
    if (!this.initialized) return;
    
    const alerts = [];
    
    // Check build metrics
    const buildAlerts = await this.checkBuildMetrics();
    alerts.push(...buildAlerts);
    
    // Check queue health
    const queueAlerts = await this.checkQueueHealth();
    alerts.push(...queueAlerts);
    
    // Check cost thresholds
    const costAlerts = await this.checkCostThresholds();
    alerts.push(...costAlerts);
    
    // Check system performance
    const performanceAlerts = await this.checkSystemPerformance();
    alerts.push(...performanceAlerts);
    
    // Process alerts
    for (const alert of alerts) {
      await this.processAlert(alert);
    }
    
    return alerts;
  }

  async checkBuildMetrics() {
    const alerts = [];
    const metrics = await metricsCollector.getBuildMetrics(1); // Last day
    
    if (!metrics) return alerts;
    
    // Check failure rate
    const todayDate = metricsCollector.getDateKey(0);
    const todaySuccessRate = parseFloat(metrics.successRate[todayDate] || 100);
    
    if (metrics.totalBuilds > 5 && todaySuccessRate < (100 - this.alertThresholds.buildFailureRate * 100)) {
      alerts.push({
        type: 'high_build_failure_rate',
        severity: 'warning',
        message: `High build failure rate: ${(100 - todaySuccessRate).toFixed(1)}% (${metrics.failedBuilds}/${metrics.totalBuilds} builds failed)`,
        data: {
          failureRate: 100 - todaySuccessRate,
          totalBuilds: metrics.totalBuilds,
          failedBuilds: metrics.failedBuilds
        },
        timestamp: Date.now()
      });
    }
    
    // Check average build time
    if (metrics.averageBuildTime > this.alertThresholds.buildTimeThreshold) {
      alerts.push({
        type: 'slow_build_times',
        severity: 'warning',
        message: `Average build time is high: ${Math.round(metrics.averageBuildTime / 1000 / 60)} minutes`,
        data: {
          averageBuildTime: metrics.averageBuildTime,
          medianBuildTime: metrics.medianBuildTime
        },
        timestamp: Date.now()
      });
    }
    
    // Check self-fix iterations
    if (parseFloat(metrics.averageSelfFixIterations) > this.alertThresholds.selfFixIterationsThreshold) {
      alerts.push({
        type: 'high_self_fix_iterations',
        severity: 'info',
        message: `High average self-fix iterations: ${metrics.averageSelfFixIterations}`,
        data: {
          averageSelfFixIterations: metrics.averageSelfFixIterations
        },
        timestamp: Date.now()
      });
    }
    
    return alerts;
  }

  async checkQueueHealth() {
    const alerts = [];
    
    if (!jobQueueService.isInitialized()) {
      alerts.push({
        type: 'queue_service_down',
        severity: 'critical',
        message: 'Job queue service is not initialized',
        timestamp: Date.now()
      });
      return alerts;
    }
    
    try {
      const queueStats = await jobQueueService.getAllQueueStats();
      
      for (const [queueName, stats] of Object.entries(queueStats)) {
        // Check for queue backlog
        if (stats.waiting > this.alertThresholds.queueBacklog) {
          alerts.push({
            type: 'queue_backlog',
            severity: 'warning',
            message: `Queue '${queueName}' has high backlog: ${stats.waiting} waiting jobs`,
            data: {
              queueName,
              waitingJobs: stats.waiting,
              activeJobs: stats.active
            },
            timestamp: Date.now()
          });
        }
        
        // Check for stuck jobs (high active count with no progress)
        if (stats.active > 10) {
          alerts.push({
            type: 'potential_stuck_jobs',
            severity: 'warning',
            message: `Queue '${queueName}' has many active jobs: ${stats.active}`,
            data: {
              queueName,
              activeJobs: stats.active
            },
            timestamp: Date.now()
          });
        }
        
        // Check failure rate
        const totalProcessed = stats.completed + stats.failed;
        if (totalProcessed > 10 && (stats.failed / totalProcessed) > 0.3) {
          alerts.push({
            type: 'high_job_failure_rate',
            severity: 'warning',
            message: `Queue '${queueName}' has high job failure rate: ${((stats.failed / totalProcessed) * 100).toFixed(1)}%`,
            data: {
              queueName,
              failureRate: (stats.failed / totalProcessed) * 100,
              failedJobs: stats.failed,
              totalJobs: totalProcessed
            },
            timestamp: Date.now()
          });
        }
      }
    } catch (error) {
      alerts.push({
        type: 'queue_health_check_failed',
        severity: 'error',
        message: `Failed to check queue health: ${error.message}`,
        timestamp: Date.now()
      });
    }
    
    return alerts;
  }

  async checkCostThresholds() {
    const alerts = [];
    
    try {
      const todayCost = await metricsCollector.getTodayTotalCost();
      
      if (todayCost > this.alertThresholds.dailyCostLimit) {
        alerts.push({
          type: 'daily_cost_exceeded',
          severity: 'critical',
          message: `Daily cost limit exceeded: $${todayCost.toFixed(2)} (limit: $${this.alertThresholds.dailyCostLimit})`,
          data: {
            currentCost: todayCost,
            costLimit: this.alertThresholds.dailyCostLimit
          },
          timestamp: Date.now()
        });
      } else if (todayCost > this.alertThresholds.dailyCostLimit * 0.8) {
        alerts.push({
          type: 'daily_cost_warning',
          severity: 'warning',
          message: `Daily cost approaching limit: $${todayCost.toFixed(2)} (80% of $${this.alertThresholds.dailyCostLimit} limit)`,
          data: {
            currentCost: todayCost,
            costLimit: this.alertThresholds.dailyCostLimit
          },
          timestamp: Date.now()
        });
      }
    } catch (error) {
      alerts.push({
        type: 'cost_check_failed',
        severity: 'error',
        message: `Failed to check cost thresholds: ${error.message}`,
        timestamp: Date.now()
      });
    }
    
    return alerts;
  }

  async checkSystemPerformance() {
    const alerts = [];
    
    try {
      // Check builds per second
      const buildsPerSecond = await metricsCollector.getCurrentBuildsPerSecond();
      if (buildsPerSecond > 10) {
        alerts.push({
          type: 'high_build_rate',
          severity: 'info',
          message: `High build rate detected: ${buildsPerSecond} builds/second`,
          data: {
            buildsPerSecond
          },
          timestamp: Date.now()
        });
      }
      
      // Check memory usage (Node.js process)
      const memUsage = process.memoryUsage();
      const memUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      
      if (memUsageMB > 500) { // 500MB threshold
        alerts.push({
          type: 'high_memory_usage',
          severity: 'warning',
          message: `High memory usage: ${memUsageMB}MB`,
          data: {
            heapUsed: memUsageMB,
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
            external: Math.round(memUsage.external / 1024 / 1024)
          },
          timestamp: Date.now()
        });
      }
      
      // Check LLM call performance
      const llmAlerts = await this.checkLLMPerformance();
      alerts.push(...llmAlerts);
      
      // Check job execution performance
      const jobAlerts = await this.checkJobPerformance();
      alerts.push(...jobAlerts);
      
    } catch (error) {
      alerts.push({
        type: 'performance_check_failed',
        severity: 'error',
        message: `Failed to check system performance: ${error.message}`,
        timestamp: Date.now()
      });
    }
    
    return alerts;
  }

  async checkLLMPerformance() {
    const alerts = [];
    
    for (const [provider, metrics] of this.llmCallMetrics.entries()) {
      if (metrics.calls === 0) continue;
      
      const avgLatency = metrics.totalLatency / metrics.calls;
      const successRate = metrics.successes / metrics.calls;
      
      // Check latency
      if (avgLatency > this.alertThresholds.llmCallLatencyThreshold) {
        alerts.push({
          type: 'high_llm_latency',
          severity: 'warning',
          message: `High average latency for ${provider}: ${Math.round(avgLatency / 1000)}s`,
          data: {
            provider,
            avgLatency,
            calls: metrics.calls
          },
          timestamp: Date.now()
        });
      }
      
      // Check success rate
      if (successRate < this.alertThresholds.llmCallSuccessRateThreshold) {
        alerts.push({
          type: 'low_llm_success_rate',
          severity: 'warning',
          message: `Low success rate for ${provider}: ${(successRate * 100).toFixed(1)}%`,
          data: {
            provider,
            successRate: successRate * 100,
            calls: metrics.calls,
            successes: metrics.successes
          },
          timestamp: Date.now()
        });
      }
    }
    
    return alerts;
  }

  async checkJobPerformance() {
    const alerts = [];
    
    for (const [jobType, metrics] of this.jobExecutionMetrics.entries()) {
      if (metrics.executions === 0) continue;
      
      const avgExecutionTime = metrics.totalTime / metrics.executions;
      const successRate = metrics.successes / metrics.executions;
      
      // Check execution time
      if (avgExecutionTime > this.alertThresholds.jobExecutionTimeThreshold) {
        alerts.push({
          type: 'slow_job_execution',
          severity: 'warning',
          message: `Slow average execution time for ${jobType}: ${Math.round(avgExecutionTime / 1000 / 60)} minutes`,
          data: {
            jobType,
            avgExecutionTime,
            executions: metrics.executions
          },
          timestamp: Date.now()
        });
      }
      
      // Check success rate
      if (successRate < 0.8 && metrics.executions > 5) {
        alerts.push({
          type: 'low_job_success_rate',
          severity: 'warning',
          message: `Low success rate for ${jobType}: ${(successRate * 100).toFixed(1)}%`,
          data: {
            jobType,
            successRate: successRate * 100,
            executions: metrics.executions,
            successes: metrics.successes
          },
          timestamp: Date.now()
        });
      }
    }
    
    return alerts;
  }

  async processAlert(alert) {
    const alertKey = `${alert.type}_${alert.severity}`;
    const lastAlert = this.alertHistory.get(alertKey);
    
    // Prevent alert spam - only send if last alert was more than 30 minutes ago
    if (lastAlert && (Date.now() - lastAlert) < 30 * 60 * 1000) {
      return;
    }
    
    this.alertHistory.set(alertKey, Date.now());
    
    // Log alert
    console.log(`[ALERT] ${alert.severity.toUpperCase()}: ${alert.message}`);
    
    // Here you would integrate with your alerting system
    // Examples: send to Slack, email, PagerDuty, etc.
    await this.sendAlert(alert);
  }

  async sendAlert(alert) {
    // Placeholder for alert delivery
    // In a real implementation, you would integrate with:
    // - Slack webhooks
    // - Email service (SendGrid, SES)
    // - PagerDuty
    // - Discord webhooks
    // - etc.
    
    console.log(`Alert sent: ${JSON.stringify(alert, null, 2)}`);
  }

  // Performance monitoring methods
  async getSystemHealth() {
    const health = {
      status: 'healthy',
      timestamp: Date.now(),
      services: {},
      metrics: {},
      alerts: []
    };
    
    try {
      // Check job queue service
      health.services.jobQueue = {
        status: jobQueueService.isInitialized() ? 'healthy' : 'unhealthy',
        queueStats: jobQueueService.isInitialized() ? await jobQueueService.getAllQueueStats() : null
      };
      
      // Check metrics collector
      health.services.metricsCollector = {
        status: metricsCollector.initialized ? 'healthy' : 'unhealthy'
      };
      
      // Get current metrics
      health.metrics.builds = await metricsCollector.getBuildMetrics(1);
      health.metrics.deployments = await metricsCollector.getDeploymentMetrics(1);
      health.metrics.costs = await metricsCollector.getCostMetrics(1);
      
      // Get recent alerts
      health.alerts = await this.getRecentAlerts();
      
      // Determine overall health status
      const hasUnhealthyServices = Object.values(health.services).some(service => service.status === 'unhealthy');
      const hasCriticalAlerts = health.alerts.some(alert => alert.severity === 'critical');
      
      if (hasUnhealthyServices || hasCriticalAlerts) {
        health.status = 'unhealthy';
      } else if (health.alerts.some(alert => alert.severity === 'warning')) {
        health.status = 'degraded';
      }
      
    } catch (error) {
      health.status = 'error';
      health.error = error.message;
    }
    
    return health;
  }

  async getRecentAlerts(hours = 24) {
    // In a real implementation, you'd store alerts in a database
    // For now, return alerts from the last monitoring check
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    return Array.from(this.alertHistory.entries())
      .filter(([_, timestamp]) => timestamp > cutoff)
      .map(([alertKey, timestamp]) => ({
        type: alertKey.split('_')[0],
        severity: alertKey.split('_')[1],
        timestamp
      }));
  }

  // Performance tracking methods
  trackLLMCall(provider, latency, success) {
    if (!this.llmCallMetrics.has(provider)) {
      this.llmCallMetrics.set(provider, {
        calls: 0,
        successes: 0,
        totalLatency: 0
      });
    }
    
    const metrics = this.llmCallMetrics.get(provider);
    metrics.calls++;
    metrics.totalLatency += latency;
    if (success) {
      metrics.successes++;
    }
  }

  trackJobExecution(jobType, executionTime, success) {
    if (!this.jobExecutionMetrics.has(jobType)) {
      this.jobExecutionMetrics.set(jobType, {
        executions: 0,
        totalTime: 0,
        successes: 0
      });
    }
    
    const metrics = this.jobExecutionMetrics.get(jobType);
    metrics.executions++;
    metrics.totalTime += executionTime;
    if (success) {
      metrics.successes++;
    }
  }

  getLLMMetrics(provider = null) {
    if (provider) {
      const metrics = this.llmCallMetrics.get(provider);
      if (!metrics) return null;
      
      return {
        provider,
        calls: metrics.calls,
        successes: metrics.successes,
        failures: metrics.calls - metrics.successes,
        successRate: metrics.calls > 0 ? (metrics.successes / metrics.calls * 100).toFixed(1) : '0.0',
        avgLatency: metrics.calls > 0 ? Math.round(metrics.totalLatency / metrics.calls) : 0
      };
    }
    
    // Return all providers
    const allMetrics = {};
    for (const [providerName, metrics] of this.llmCallMetrics.entries()) {
      allMetrics[providerName] = {
        calls: metrics.calls,
        successes: metrics.successes,
        failures: metrics.calls - metrics.successes,
        successRate: metrics.calls > 0 ? (metrics.successes / metrics.calls * 100).toFixed(1) : '0.0',
        avgLatency: metrics.calls > 0 ? Math.round(metrics.totalLatency / metrics.calls) : 0
      };
    }
    
    return allMetrics;
  }

  getJobMetrics(jobType = null) {
    if (jobType) {
      const metrics = this.jobExecutionMetrics.get(jobType);
      if (!metrics) return null;
      
      return {
        jobType,
        executions: metrics.executions,
        successes: metrics.successes,
        failures: metrics.executions - metrics.successes,
        successRate: metrics.executions > 0 ? (metrics.successes / metrics.executions * 100).toFixed(1) : '0.0',
        avgExecutionTime: metrics.executions > 0 ? Math.round(metrics.totalTime / metrics.executions) : 0
      };
    }
    
    // Return all job types
    const allMetrics = {};
    for (const [type, metrics] of this.jobExecutionMetrics.entries()) {
      allMetrics[type] = {
        executions: metrics.executions,
        successes: metrics.successes,
        failures: metrics.executions - metrics.successes,
        successRate: metrics.executions > 0 ? (metrics.successes / metrics.executions * 100).toFixed(1) : '0.0',
        avgExecutionTime: metrics.executions > 0 ? Math.round(metrics.totalTime / metrics.executions) : 0
      };
    }
    
    return allMetrics;
  }

  getPerformanceDashboard() {
    return {
      timestamp: Date.now(),
      llmMetrics: this.getLLMMetrics(),
      jobMetrics: this.getJobMetrics(),
      systemMetrics: {
        memory: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          external: Math.round(process.memoryUsage().external / 1024 / 1024)
        },
        uptime: Math.round(process.uptime())
      },
      thresholds: this.alertThresholds
    };
  }

  resetMetrics() {
    this.llmCallMetrics.clear();
    this.jobExecutionMetrics.clear();
    console.log('Performance metrics reset');
  }

  // Configuration methods
  updateAlertThresholds(newThresholds) {
    this.alertThresholds = { ...this.alertThresholds, ...newThresholds };
    console.log('Alert thresholds updated:', this.alertThresholds);
  }

  getAlertThresholds() {
    return { ...this.alertThresholds };
  }

  async shutdown() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.initialized = false;
    console.log('Monitoring service shutdown complete');
  }
}

module.exports = new MonitoringService();