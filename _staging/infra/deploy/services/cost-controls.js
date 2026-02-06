const metricsCollector = require('./metrics-collector');
const jobQueueService = require('./job-queue');
const monitoringService = require('./monitoring');
const redisService = require('./redis');

class CostControlsService {
  constructor() {
    this.redis = null;
    this.costControlsPrefix = 'cost_controls:';
    this.initialized = false;
    
    // Default cost limits and thresholds
    this.defaultLimits = {
      dailyLimit: 100, // $100 per day
      monthlyLimit: 3000, // $3000 per month
      buildLimit: 10, // $10 per build
      userDailyLimit: 50, // $50 per user per day
      orgDailyLimit: 200, // $200 per org per day
      emergencyStopThreshold: 500 // $500 emergency stop
    };
    
    this.costLimits = { ...this.defaultLimits };
    this.emergencyStopActive = false;
  }

  async initialize() {
    try {
      this.redis = await redisService.connect();
      await this.loadCostLimits();
      this.initialized = true;
      
      // Start cost monitoring
      this.startCostMonitoring();
      
      console.log('Cost controls service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize cost controls service:', error);
      throw error;
    }
  }

  async loadCostLimits() {
    if (!this.redis) return;
    
    const savedLimits = await this.redis.hgetall(`${this.costControlsPrefix}limits`);
    if (Object.keys(savedLimits).length > 0) {
      this.costLimits = {
        ...this.defaultLimits,
        ...Object.fromEntries(
          Object.entries(savedLimits).map(([key, value]) => [key, parseFloat(value)])
        )
      };
    }
  }

  async saveCostLimits() {
    if (!this.redis) return;
    
    await this.redis.hset(`${this.costControlsPrefix}limits`, this.costLimits);
  }

  startCostMonitoring() {
    // Check cost limits every 5 minutes
    setInterval(async () => {
      try {
        await this.checkCostLimits();
      } catch (error) {
        console.error('Error in cost monitoring:', error);
      }
    }, 5 * 60 * 1000);
    
    console.log('Cost monitoring started');
  }

  // Cost limit management
  async setCostLimit(limitType, amount) {
    if (!this.initialized) {
      throw new Error('Cost controls service not initialized');
    }
    
    const validLimitTypes = Object.keys(this.defaultLimits);
    if (!validLimitTypes.includes(limitType)) {
      throw new Error(`Invalid limit type. Valid types: ${validLimitTypes.join(', ')}`);
    }
    
    if (amount < 0) {
      throw new Error('Cost limit must be non-negative');
    }
    
    this.costLimits[limitType] = amount;
    await this.saveCostLimits();
    
    console.log(`Cost limit updated: ${limitType} = $${amount}`);
    
    return {
      success: true,
      limitType,
      amount,
      message: `${limitType} limit set to $${amount}`
    };
  }

  async getCostLimits() {
    return { ...this.costLimits };
  }

  async resetCostLimits() {
    this.costLimits = { ...this.defaultLimits };
    await this.saveCostLimits();
    
    return {
      success: true,
      message: 'Cost limits reset to defaults',
      limits: this.costLimits
    };
  }

  // Cost checking and enforcement
  async checkCostLimits() {
    if (!this.initialized) return;
    
    const alerts = [];
    const actions = [];
    
    // Check daily cost limit
    const todayCost = await metricsCollector.getTodayTotalCost();
    if (todayCost >= this.costLimits.dailyLimit) {
      alerts.push({
        type: 'daily_limit_exceeded',
        severity: 'critical',
        message: `Daily cost limit exceeded: $${todayCost.toFixed(2)} >= $${this.costLimits.dailyLimit}`,
        cost: todayCost,
        limit: this.costLimits.dailyLimit
      });
      
      actions.push('pause_builds');
    } else if (todayCost >= this.costLimits.dailyLimit * 0.8) {
      alerts.push({
        type: 'daily_limit_warning',
        severity: 'warning',
        message: `Daily cost approaching limit: $${todayCost.toFixed(2)} (80% of $${this.costLimits.dailyLimit})`,
        cost: todayCost,
        limit: this.costLimits.dailyLimit
      });
    }
    
    // Check monthly cost limit
    const monthlyCost = await this.getMonthlyCost();
    if (monthlyCost >= this.costLimits.monthlyLimit) {
      alerts.push({
        type: 'monthly_limit_exceeded',
        severity: 'critical',
        message: `Monthly cost limit exceeded: $${monthlyCost.toFixed(2)} >= $${this.costLimits.monthlyLimit}`,
        cost: monthlyCost,
        limit: this.costLimits.monthlyLimit
      });
      
      actions.push('pause_builds');
    }
    
    // Check emergency stop threshold
    if (todayCost >= this.costLimits.emergencyStopThreshold) {
      alerts.push({
        type: 'emergency_stop_triggered',
        severity: 'critical',
        message: `Emergency stop threshold exceeded: $${todayCost.toFixed(2)} >= $${this.costLimits.emergencyStopThreshold}`,
        cost: todayCost,
        limit: this.costLimits.emergencyStopThreshold
      });
      
      actions.push('emergency_stop');
    }
    
    // Execute actions
    for (const action of actions) {
      await this.executeAction(action, alerts);
    }
    
    // Send alerts
    for (const alert of alerts) {
      await this.sendCostAlert(alert);
    }
    
    return { alerts, actions };
  }

  async executeAction(action, alerts) {
    switch (action) {
      case 'pause_builds':
        await this.pauseAllBuilds('Cost limit exceeded');
        break;
      case 'emergency_stop':
        await this.emergencyStop('Emergency cost threshold exceeded');
        break;
      default:
        console.warn(`Unknown cost control action: ${action}`);
    }
  }

  async pauseAllBuilds(reason) {
    if (!jobQueueService.isInitialized()) {
      console.error('Cannot pause builds: Job queue service not initialized');
      return;
    }
    
    const queueNames = jobQueueService.getQueueNames();
    const results = [];
    
    for (const queueName of queueNames) {
      try {
        await jobQueueService.pauseQueue(queueName);
        results.push({ queue: queueName, status: 'paused' });
      } catch (error) {
        results.push({ queue: queueName, status: 'error', error: error.message });
      }
    }
    
    console.log(`COST CONTROL: All builds paused - ${reason}`);
    
    // Record the pause action
    await this.recordCostAction('pause_builds', reason, results);
    
    return results;
  }

  async resumeAllBuilds(reason) {
    if (!jobQueueService.isInitialized()) {
      console.error('Cannot resume builds: Job queue service not initialized');
      return;
    }
    
    const queueNames = jobQueueService.getQueueNames();
    const results = [];
    
    for (const queueName of queueNames) {
      try {
        await jobQueueService.resumeQueue(queueName);
        results.push({ queue: queueName, status: 'resumed' });
      } catch (error) {
        results.push({ queue: queueName, status: 'error', error: error.message });
      }
    }
    
    console.log(`COST CONTROL: All builds resumed - ${reason}`);
    
    // Record the resume action
    await this.recordCostAction('resume_builds', reason, results);
    
    return results;
  }

  async emergencyStop(reason) {
    if (this.emergencyStopActive) {
      console.log('Emergency stop already active');
      return;
    }
    
    this.emergencyStopActive = true;
    
    // Pause all builds
    const pauseResults = await this.pauseAllBuilds(reason);
    
    // Record emergency stop
    await this.recordCostAction('emergency_stop', reason, {
      timestamp: Date.now(),
      pauseResults
    });
    
    console.log(`EMERGENCY STOP ACTIVATED: ${reason}`);
    
    // Send critical alert
    await this.sendCostAlert({
      type: 'emergency_stop_activated',
      severity: 'critical',
      message: `Emergency stop activated: ${reason}`,
      timestamp: Date.now()
    });
    
    return {
      success: true,
      message: 'Emergency stop activated',
      reason,
      pauseResults
    };
  }

  async emergencyResume(reason, adminId) {
    if (!this.emergencyStopActive) {
      throw new Error('Emergency stop is not active');
    }
    
    this.emergencyStopActive = false;
    
    // Resume all builds
    const resumeResults = await this.resumeAllBuilds(reason);
    
    // Record emergency resume
    await this.recordCostAction('emergency_resume', reason, {
      timestamp: Date.now(),
      adminId,
      resumeResults
    });
    
    console.log(`EMERGENCY STOP DEACTIVATED: ${reason} (by ${adminId})`);
    
    return {
      success: true,
      message: 'Emergency stop deactivated',
      reason,
      adminId,
      resumeResults
    };
  }

  // Build cost validation
  async validateBuildCost(buildId, estimatedCost) {
    if (!this.initialized) return { allowed: true };
    
    const validation = {
      allowed: true,
      reasons: [],
      warnings: []
    };
    
    // Check if emergency stop is active
    if (this.emergencyStopActive) {
      validation.allowed = false;
      validation.reasons.push('Emergency stop is active');
      return validation;
    }
    
    // Check build cost limit
    if (estimatedCost > this.costLimits.buildLimit) {
      validation.allowed = false;
      validation.reasons.push(`Build cost ($${estimatedCost.toFixed(2)}) exceeds limit ($${this.costLimits.buildLimit})`);
    }
    
    // Check daily cost limit
    const todayCost = await metricsCollector.getTodayTotalCost();
    const projectedDailyCost = todayCost + estimatedCost;
    
    if (projectedDailyCost > this.costLimits.dailyLimit) {
      validation.allowed = false;
      validation.reasons.push(`Build would exceed daily limit: $${projectedDailyCost.toFixed(2)} > $${this.costLimits.dailyLimit}`);
    } else if (projectedDailyCost > this.costLimits.dailyLimit * 0.9) {
      validation.warnings.push(`Build would use 90%+ of daily limit: $${projectedDailyCost.toFixed(2)}`);
    }
    
    // Check monthly cost limit
    const monthlyCost = await this.getMonthlyCost();
    const projectedMonthlyCost = monthlyCost + estimatedCost;
    
    if (projectedMonthlyCost > this.costLimits.monthlyLimit) {
      validation.allowed = false;
      validation.reasons.push(`Build would exceed monthly limit: $${projectedMonthlyCost.toFixed(2)} > $${this.costLimits.monthlyLimit}`);
    }
    
    return validation;
  }

  async validateUserCost(userId, estimatedCost) {
    if (!this.initialized) return { allowed: true };
    
    const validation = {
      allowed: true,
      reasons: [],
      warnings: []
    };
    
    const userDailyCost = await this.getUserDailyCost(userId);
    const projectedUserCost = userDailyCost + estimatedCost;
    
    if (projectedUserCost > this.costLimits.userDailyLimit) {
      validation.allowed = false;
      validation.reasons.push(`User daily cost limit would be exceeded: $${projectedUserCost.toFixed(2)} > $${this.costLimits.userDailyLimit}`);
    }
    
    return validation;
  }

  async validateOrgCost(orgId, estimatedCost) {
    if (!this.initialized) return { allowed: true };
    
    const validation = {
      allowed: true,
      reasons: [],
      warnings: []
    };
    
    const orgDailyCost = await this.getOrgDailyCost(orgId);
    const projectedOrgCost = orgDailyCost + estimatedCost;
    
    if (projectedOrgCost > this.costLimits.orgDailyLimit) {
      validation.allowed = false;
      validation.reasons.push(`Organization daily cost limit would be exceeded: $${projectedOrgCost.toFixed(2)} > $${this.costLimits.orgDailyLimit}`);
    }
    
    return validation;
  }

  // Cost tracking and reporting
  async getMonthlyCost() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = Math.ceil((now - startOfMonth) / (1000 * 60 * 60 * 24)) + 1;
    
    const costMetrics = await metricsCollector.getCostMetrics(daysInMonth);
    return parseFloat(costMetrics.totalCost);
  }

  async getUserDailyCost(userId) {
    if (!this.redis) return 0;
    
    const today = new Date().toISOString().split('T')[0];
    const key = `${this.costControlsPrefix}user:${userId}:${today}`;
    const cost = await this.redis.get(key);
    
    return cost ? parseFloat(cost) : 0;
  }

  async getOrgDailyCost(orgId) {
    if (!this.redis) return 0;
    
    const today = new Date().toISOString().split('T')[0];
    const key = `${this.costControlsPrefix}org:${orgId}:${today}`;
    const cost = await this.redis.get(key);
    
    return cost ? parseFloat(cost) : 0;
  }

  async getJobCost(jobId) {
    if (!this.redis) return 0;
    
    const key = `${this.costControlsPrefix}job:${jobId}`;
    const cost = await this.redis.get(key);
    
    return cost ? parseFloat(cost) : 0;
  }

  async trackJobCost(jobId, cost, context = {}) {
    if (!this.redis || !cost) return;
    
    const today = new Date().toISOString().split('T')[0];
    
    // Track job cost
    const jobKey = `${this.costControlsPrefix}job:${jobId}`;
    await this.redis.set(jobKey, cost.toString());
    await this.redis.expire(jobKey, 86400 * 30); // 30 days retention
    
    // Track user cost
    if (context.userId) {
      const userKey = `${this.costControlsPrefix}user:${context.userId}:${today}`;
      await this.redis.incrbyfloat(userKey, cost);
      await this.redis.expire(userKey, 86400 * 7); // 7 days retention
    }
    
    // Track org cost
    if (context.orgId) {
      const orgKey = `${this.costControlsPrefix}org:${context.orgId}:${today}`;
      await this.redis.incrbyfloat(orgKey, cost);
      await this.redis.expire(orgKey, 86400 * 7); // 7 days retention
    }
    
    // Track project cost
    if (context.projectId) {
      const projectKey = `${this.costControlsPrefix}project:${context.projectId}:${today}`;
      await this.redis.incrbyfloat(projectKey, cost);
      await this.redis.expire(projectKey, 86400 * 30); // 30 days retention
    }
    
    // Check if we need to send alerts after this cost addition
    await this.checkCostThresholds(context.userId, context.orgId, cost);
  }

  async checkCostThresholds(userId, orgId, addedCost) {
    const alerts = [];
    
    // Check user threshold
    if (userId) {
      const userCost = await this.getUserDailyCost(userId);
      if (userCost >= this.costLimits.userDailyLimit) {
        alerts.push({
          type: 'user_daily_limit_exceeded',
          severity: 'high',
          message: `User ${userId} exceeded daily cost limit: ${userCost.toFixed(2)} >= ${this.costLimits.userDailyLimit}`,
          userId,
          cost: userCost,
          limit: this.costLimits.userDailyLimit
        });
      } else if (userCost >= this.costLimits.userDailyLimit * 0.8) {
        alerts.push({
          type: 'user_daily_limit_warning',
          severity: 'warning',
          message: `User ${userId} approaching daily cost limit: ${userCost.toFixed(2)} (80% of ${this.costLimits.userDailyLimit})`,
          userId,
          cost: userCost,
          limit: this.costLimits.userDailyLimit
        });
      }
    }
    
    // Check org threshold
    if (orgId) {
      const orgCost = await this.getOrgDailyCost(orgId);
      if (orgCost >= this.costLimits.orgDailyLimit) {
        alerts.push({
          type: 'org_daily_limit_exceeded',
          severity: 'high',
          message: `Organization ${orgId} exceeded daily cost limit: ${orgCost.toFixed(2)} >= ${this.costLimits.orgDailyLimit}`,
          orgId,
          cost: orgCost,
          limit: this.costLimits.orgDailyLimit
        });
      }
    }
    
    // Send alerts
    for (const alert of alerts) {
      await this.sendCostAlert(alert);
    }
    
    return alerts;
  }

  async getUserCostReport(userId, days = 30) {
    if (!this.redis) return null;
    
    const costs = {};
    const today = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const key = `${this.costControlsPrefix}user:${userId}:${dateStr}`;
      const cost = await this.redis.get(key);
      
      if (cost) {
        costs[dateStr] = parseFloat(cost);
      }
    }
    
    const totalCost = Object.values(costs).reduce((sum, cost) => sum + cost, 0);
    const avgDailyCost = totalCost / days;
    
    return {
      userId,
      period: `${days} days`,
      totalCost: totalCost.toFixed(4),
      averageDailyCost: avgDailyCost.toFixed(4),
      dailyCosts: costs,
      currentDailyLimit: this.costLimits.userDailyLimit,
      utilizationRate: ((await this.getUserDailyCost(userId)) / this.costLimits.userDailyLimit * 100).toFixed(1)
    };
  }

  async getOrgCostReport(orgId, days = 30) {
    if (!this.redis) return null;
    
    const costs = {};
    const today = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const key = `${this.costControlsPrefix}org:${orgId}:${dateStr}`;
      const cost = await this.redis.get(key);
      
      if (cost) {
        costs[dateStr] = parseFloat(cost);
      }
    }
    
    const totalCost = Object.values(costs).reduce((sum, cost) => sum + cost, 0);
    const avgDailyCost = totalCost / days;
    
    return {
      orgId,
      period: `${days} days`,
      totalCost: totalCost.toFixed(4),
      averageDailyCost: avgDailyCost.toFixed(4),
      dailyCosts: costs,
      currentDailyLimit: this.costLimits.orgDailyLimit,
      utilizationRate: ((await this.getOrgDailyCost(orgId)) / this.costLimits.orgDailyLimit * 100).toFixed(1)
    };
  }

  async getProjectCostReport(projectId, days = 30) {
    if (!this.redis) return null;
    
    const costs = {};
    const today = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const key = `${this.costControlsPrefix}project:${projectId}:${dateStr}`;
      const cost = await this.redis.get(key);
      
      if (cost) {
        costs[dateStr] = parseFloat(cost);
      }
    }
    
    const totalCost = Object.values(costs).reduce((sum, cost) => sum + cost, 0);
    const avgDailyCost = totalCost / days;
    
    return {
      projectId,
      period: `${days} days`,
      totalCost: totalCost.toFixed(4),
      averageDailyCost: avgDailyCost.toFixed(4),
      dailyCosts: costs
    };
  }

  async getCostBreakdown(days = 30) {
    const costMetrics = await metricsCollector.getCostMetrics(days);
    const buildMetrics = await metricsCollector.getBuildMetrics(days);
    
    return {
      period: `${days} days`,
      totalCost: parseFloat(costMetrics.totalCost),
      costByType: costMetrics.costByType,
      dailyCosts: costMetrics.dailyCosts,
      averageCostPerBuild: buildMetrics.totalBuilds > 0 
        ? (parseFloat(costMetrics.totalCost) / buildMetrics.totalBuilds).toFixed(4)
        : '0.0000',
      projectedMonthlyCost: this.calculateProjectedMonthlyCost(costMetrics.dailyCosts),
      limits: this.costLimits,
      utilizationRates: {
        daily: ((await metricsCollector.getTodayTotalCost()) / this.costLimits.dailyLimit * 100).toFixed(1),
        monthly: ((await this.getMonthlyCost()) / this.costLimits.monthlyLimit * 100).toFixed(1)
      }
    };
  }

  calculateProjectedMonthlyCost(dailyCosts) {
    const costs = Object.values(dailyCosts).map(cost => parseFloat(cost));
    if (costs.length === 0) return '0.00';
    
    const averageDailyCost = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
    const projectedMonthlyCost = averageDailyCost * 30;
    
    return projectedMonthlyCost.toFixed(2);
  }

  // Budget alerts and notifications
  async sendCostAlert(alert) {
    console.log(`[COST ALERT] ${alert.severity.toUpperCase()}: ${alert.message}`);
    
    // Store alert in Redis for admin console
    const alertKey = `${this.costControlsPrefix}alert:${Date.now()}`;
    await this.redis.hset(alertKey, {
      ...alert,
      timestamp: Date.now()
    });
    await this.redis.expire(alertKey, 86400 * 7); // 7 days retention
    
    // Send notification via error notifier for critical and high severity alerts
    if (alert.severity === 'critical' || alert.severity === 'high') {
      try {
        const errorNotifier = require('./error-notifier');
        const error = new Error(alert.message);
        error.name = 'CostLimitError';
        
        await errorNotifier.notifyError(error, {
          severity: alert.severity,
          operation: 'cost_monitoring',
          additionalInfo: {
            alertType: alert.type,
            cost: alert.cost,
            limit: alert.limit,
            userId: alert.userId,
            orgId: alert.orgId
          }
        });
      } catch (notificationError) {
        console.error('Failed to send cost alert notification:', notificationError);
      }
    }
  }

  async getRecentCostAlerts(hours = 24) {
    if (!this.initialized) return [];
    
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const pattern = `${this.costControlsPrefix}alert:*`;
    const keys = await this.redis.keys(pattern);
    
    const alerts = [];
    for (const key of keys) {
      const timestamp = parseInt(key.split(':').pop());
      if (timestamp > cutoff) {
        const alert = await this.redis.hgetall(key);
        alerts.push({
          ...alert,
          timestamp: parseInt(alert.timestamp)
        });
      }
    }
    
    return alerts.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Action logging
  async recordCostAction(action, reason, data) {
    if (!this.redis) return;
    
    const actionKey = `${this.costControlsPrefix}action:${Date.now()}`;
    await this.redis.hset(actionKey, {
      action,
      reason,
      data: JSON.stringify(data),
      timestamp: Date.now()
    });
    await this.redis.expire(actionKey, 86400 * 30); // 30 days retention
  }

  async getCostActions(days = 7) {
    if (!this.initialized) return [];
    
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const pattern = `${this.costControlsPrefix}action:*`;
    const keys = await this.redis.keys(pattern);
    
    const actions = [];
    for (const key of keys) {
      const timestamp = parseInt(key.split(':').pop());
      if (timestamp > cutoff) {
        const action = await this.redis.hgetall(key);
        actions.push({
          ...action,
          data: JSON.parse(action.data),
          timestamp: parseInt(action.timestamp)
        });
      }
    }
    
    return actions.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Status and health
  getStatus() {
    return {
      initialized: this.initialized,
      emergencyStopActive: this.emergencyStopActive,
      costLimits: this.costLimits,
      monitoringActive: true
    };
  }

  async shutdown() {
    this.initialized = false;
    console.log('Cost controls service shutdown complete');
  }
}

module.exports = new CostControlsService();