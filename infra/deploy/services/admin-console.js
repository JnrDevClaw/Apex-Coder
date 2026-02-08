const jobQueueService = require('./job-queue');
const metricsCollector = require('./metrics-collector');
const monitoringService = require('./monitoring');
const costControlsService = require('./cost-controls');
const telemetryService = require('./telemetry');

class AdminConsoleService {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    try {
      await costControlsService.initialize();
      await telemetryService.initialize();
      this.initialized = true;
      console.log('Admin console service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize admin console service:', error);
      throw error;
    }
  }

  // Queue Management
  async getQueueOverview() {
    if (!jobQueueService.isInitialized()) {
      throw new Error('Job queue service not initialized');
    }

    const queueNames = jobQueueService.getQueueNames();
    const overview = {
      totalQueues: queueNames.length,
      queues: {},
      summary: {
        totalWaiting: 0,
        totalActive: 0,
        totalCompleted: 0,
        totalFailed: 0
      }
    };

    for (const queueName of queueNames) {
      const stats = await jobQueueService.getQueueStats(queueName);
      overview.queues[queueName] = {
        ...stats,
        health: this.assessQueueHealth(stats)
      };

      overview.summary.totalWaiting += stats.waiting;
      overview.summary.totalActive += stats.active;
      overview.summary.totalCompleted += stats.completed;
      overview.summary.totalFailed += stats.failed;
    }

    return overview;
  }

  assessQueueHealth(stats) {
    const totalProcessed = stats.completed + stats.failed;
    const failureRate = totalProcessed > 0 ? (stats.failed / totalProcessed) : 0;
    
    if (stats.waiting > 100 || failureRate > 0.5) {
      return 'critical';
    } else if (stats.waiting > 50 || failureRate > 0.3) {
      return 'warning';
    } else if (stats.active > 0 || stats.waiting > 0) {
      return 'active';
    } else {
      return 'idle';
    }
  }

  async getQueueDetails(queueName, limit = 50) {
    if (!jobQueueService.isInitialized()) {
      throw new Error('Job queue service not initialized');
    }

    const queue = jobQueueService.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaiting(0, limit - 1),
      queue.getActive(0, limit - 1),
      queue.getCompleted(0, limit - 1),
      queue.getFailed(0, limit - 1)
    ]);

    return {
      queueName,
      jobs: {
        waiting: waiting.map(job => this.formatJobInfo(job)),
        active: active.map(job => this.formatJobInfo(job)),
        completed: completed.map(job => this.formatJobInfo(job)),
        failed: failed.map(job => this.formatJobInfo(job))
      },
      stats: await jobQueueService.getQueueStats(queueName)
    };
  }

  formatJobInfo(job) {
    return {
      id: job.id,
      name: job.name,
      data: job.data,
      progress: job.progress,
      attemptsMade: job.attemptsMade,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
      delay: job.opts?.delay,
      priority: job.opts?.priority
    };
  }

  async pauseQueue(queueName) {
    await jobQueueService.pauseQueue(queueName);
    return { success: true, message: `Queue '${queueName}' paused` };
  }

  async resumeQueue(queueName) {
    await jobQueueService.resumeQueue(queueName);
    return { success: true, message: `Queue '${queueName}' resumed` };
  }

  async retryFailedJobs(queueName, maxJobs = 10) {
    const retriedCount = await jobQueueService.retryFailedJobs(queueName, maxJobs);
    return { 
      success: true, 
      message: `Retried ${retriedCount} failed jobs in queue '${queueName}'`,
      retriedCount 
    };
  }

  async cleanQueue(queueName, grace = 5000, limit = 100) {
    const cleanedCount = await jobQueueService.cleanQueue(queueName, grace, limit);
    return { 
      success: true, 
      message: `Cleaned ${cleanedCount} completed jobs from queue '${queueName}'`,
      cleanedCount 
    };
  }

  async removeJob(queueName, jobId) {
    const queue = jobQueueService.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job '${jobId}' not found in queue '${queueName}'`);
    }

    await job.remove();
    return { success: true, message: `Job '${jobId}' removed from queue '${queueName}'` };
  }

  // Cost Management
  async getCostDashboard(days = 30) {
    const costBreakdown = await costControlsService.getCostBreakdown(days);
    const recentAlerts = await costControlsService.getRecentCostAlerts(24);
    const costActions = await costControlsService.getCostActions(7);
    
    const dashboard = {
      ...costBreakdown,
      recentAlerts,
      recentActions: costActions,
      emergencyStopActive: costControlsService.emergencyStopActive,
      status: costControlsService.getStatus()
    };

    return dashboard;
  }

  async setCostLimit(limitType, amount) {
    return await costControlsService.setCostLimit(limitType, amount);
  }

  async getCostLimits() {
    return await costControlsService.getCostLimits();
  }

  async resetCostLimits() {
    return await costControlsService.resetCostLimits();
  }

  async validateBuildCost(buildId, estimatedCost) {
    return await costControlsService.validateBuildCost(buildId, estimatedCost);
  }

  async emergencyStopCosts(reason) {
    return await costControlsService.emergencyStop(reason);
  }

  async emergencyResumeCosts(reason, adminId) {
    return await costControlsService.emergencyResume(reason, adminId);
  }

  calculateProjectedMonthlyCost(dailyCosts) {
    const costs = Object.values(dailyCosts).map(cost => parseFloat(cost));
    if (costs.length === 0) return '0.00';
    
    const averageDailyCost = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
    const projectedMonthlyCost = averageDailyCost * 30;
    
    return projectedMonthlyCost.toFixed(2);
  }

  async getBudgetStatus(currentCost) {
    // This would typically come from configuration or database
    const monthlyBudget = 3000; // $3000 monthly budget
    const dailyBudget = monthlyBudget / 30;
    
    const todayCost = await metricsCollector.getTodayTotalCost();
    
    return {
      monthlyBudget,
      dailyBudget: dailyBudget.toFixed(2),
      todayCost: todayCost.toFixed(2),
      monthlyUsed: currentCost,
      monthlyRemaining: (monthlyBudget - parseFloat(currentCost)).toFixed(2),
      dailyBudgetUsed: ((todayCost / dailyBudget) * 100).toFixed(1),
      monthlyBudgetUsed: ((parseFloat(currentCost) / monthlyBudget) * 100).toFixed(1)
    };
  }

  async setBudgetAlert(type, threshold, enabled = true) {
    // Update monitoring thresholds
    const currentThresholds = monitoringService.getAlertThresholds();
    
    if (type === 'daily') {
      currentThresholds.dailyCostLimit = threshold;
    }
    
    monitoringService.updateAlertThresholds(currentThresholds);
    
    return {
      success: true,
      message: `Budget alert ${enabled ? 'enabled' : 'disabled'} for ${type} threshold: $${threshold}`
    };
  }

  // Build Management
  async getBuildOverview(days = 7) {
    const buildMetrics = await metricsCollector.getBuildMetrics(days);
    const deploymentMetrics = await metricsCollector.getDeploymentMetrics(days);
    
    return {
      period: `${days} days`,
      builds: buildMetrics,
      deployments: deploymentMetrics,
      efficiency: {
        buildsPerDay: (buildMetrics.totalBuilds / days).toFixed(1),
        deploymentsPerDay: (deploymentMetrics.totalDeployments / days).toFixed(1),
        deploymentRate: buildMetrics.totalBuilds > 0 
          ? ((deploymentMetrics.totalDeployments / buildMetrics.totalBuilds) * 100).toFixed(1)
          : '0.0'
      }
    };
  }

  // System Health
  async getSystemHealth() {
    return await monitoringService.getSystemHealth();
  }

  async getAlerts(hours = 24) {
    return await monitoringService.getRecentAlerts(hours);
  }

  async updateAlertThresholds(thresholds) {
    monitoringService.updateAlertThresholds(thresholds);
    return {
      success: true,
      message: 'Alert thresholds updated',
      thresholds: monitoringService.getAlertThresholds()
    };
  }

  // Approval Workflows
  async getPendingApprovals() {
    // This would typically query a database for pending approvals
    // For now, return a mock structure
    return {
      destructiveOperations: [],
      highCostOperations: [],
      deployments: []
    };
  }

  async approveOperation(operationId, approverId, approved = true, reason = '') {
    // This would typically update the approval status in a database
    // and trigger the approved operation
    
    return {
      success: true,
      message: `Operation ${operationId} ${approved ? 'approved' : 'rejected'} by ${approverId}`,
      operationId,
      approverId,
      approved,
      reason,
      timestamp: Date.now()
    };
  }

  // Emergency Controls
  async emergencyStop(reason = 'Emergency stop initiated') {
    const results = [];
    
    // Pause all queues
    const queueNames = jobQueueService.getQueueNames();
    for (const queueName of queueNames) {
      try {
        await jobQueueService.pauseQueue(queueName);
        results.push({ queue: queueName, status: 'paused' });
      } catch (error) {
        results.push({ queue: queueName, status: 'error', error: error.message });
      }
    }
    
    console.log(`EMERGENCY STOP: ${reason}`);
    
    return {
      success: true,
      message: 'Emergency stop executed',
      reason,
      timestamp: Date.now(),
      results
    };
  }

  async emergencyResume(reason = 'Emergency resume initiated') {
    const results = [];
    
    // Resume all queues
    const queueNames = jobQueueService.getQueueNames();
    for (const queueName of queueNames) {
      try {
        await jobQueueService.resumeQueue(queueName);
        results.push({ queue: queueName, status: 'resumed' });
      } catch (error) {
        results.push({ queue: queueName, status: 'error', error: error.message });
      }
    }
    
    console.log(`EMERGENCY RESUME: ${reason}`);
    
    return {
      success: true,
      message: 'Emergency resume executed',
      reason,
      timestamp: Date.now(),
      results
    };
  }

  // Telemetry and Analytics
  async getTelemetryAnalytics(days = 30) {
    return await telemetryService.getUsageAnalytics(days);
  }

  async setUserTelemetryOptIn(userId, optIn = true) {
    return await telemetryService.setUserOptIn(userId, optIn);
  }

  async getUserTelemetryStatus(userId) {
    return await telemetryService.getUserOptInStatus(userId);
  }

  async createABTest(testName, variants, trafficSplit = 0.5) {
    return await telemetryService.createABTest(testName, variants, trafficSplit);
  }

  async getABTestResults(testId) {
    return await telemetryService.getABTestResults(testId);
  }

  async getPerformanceBenchmarks(benchmarkType, days = 30) {
    return await telemetryService.getPerformanceBenchmarks(benchmarkType, days);
  }

  async recordPerformanceBenchmark(benchmarkType, metrics) {
    return await telemetryService.recordPerformanceBenchmark(benchmarkType, metrics);
  }

  // Reporting
  async generateReport(type, period = 7) {
    const report = {
      type,
      period: `${period} days`,
      generatedAt: Date.now(),
      data: {}
    };

    switch (type) {
      case 'builds':
        report.data = await metricsCollector.getBuildMetrics(period);
        break;
      case 'deployments':
        report.data = await metricsCollector.getDeploymentMetrics(period);
        break;
      case 'costs':
        report.data = await metricsCollector.getCostMetrics(period);
        break;
      case 'queues':
        report.data = await this.getQueueOverview();
        break;
      case 'system':
        report.data = await this.getSystemHealth();
        break;
      default:
        throw new Error(`Unknown report type: ${type}`);
    }

    return report;
  }
}

module.exports = new AdminConsoleService();