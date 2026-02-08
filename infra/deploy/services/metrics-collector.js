const redisService = require('./redis');

class MetricsCollector {
  constructor() {
    this.redis = null;
    this.metricsPrefix = 'metrics:';
    this.initialized = false;
  }

  async initialize() {
    try {
      this.redis = await redisService.connect();
      this.initialized = true;
      console.log('Metrics collector initialized successfully');
    } catch (error) {
      console.error('Failed to initialize metrics collector:', error);
      throw error;
    }
  }

  // Build metrics
  async recordBuildStart(buildId, projectId, orgId) {
    if (!this.initialized) return;
    
    const timestamp = Date.now();
    const buildKey = `${this.metricsPrefix}build:${buildId}`;
    
    await this.redis.hset(buildKey, {
      buildId,
      projectId,
      orgId,
      startTime: timestamp,
      status: 'running'
    });
    
    // Increment daily build counter
    const dateKey = this.getDailyKey('builds');
    await this.redis.incr(dateKey);
    await this.redis.expire(dateKey, 86400 * 30); // 30 days retention
    
    // Track builds per second (sliding window)
    const buildsPerSecKey = `${this.metricsPrefix}builds_per_sec`;
    await this.redis.zadd(buildsPerSecKey, timestamp, buildId);
    await this.redis.zremrangebyscore(buildsPerSecKey, 0, timestamp - 60000); // Keep last minute
  }

  async recordBuildComplete(buildId, success, duration, selfFixIterations = 0, errorMessage = null) {
    if (!this.initialized) return;
    
    const timestamp = Date.now();
    const buildKey = `${this.metricsPrefix}build:${buildId}`;
    
    await this.redis.hset(buildKey, {
      endTime: timestamp,
      duration,
      status: success ? 'completed' : 'failed',
      selfFixIterations,
      errorMessage: errorMessage || ''
    });
    
    // Update success/failure counters
    const dateKey = this.getDailyKey(success ? 'builds_success' : 'builds_failed');
    await this.redis.incr(dateKey);
    await this.redis.expire(dateKey, 86400 * 30);
    
    // Track build times for median calculation
    const buildTimesKey = `${this.metricsPrefix}build_times`;
    await this.redis.zadd(buildTimesKey, duration, `${buildId}:${timestamp}`);
    await this.redis.zremrangebyrank(buildTimesKey, 0, -1001); // Keep last 1000 builds
    
    // Track self-fix iterations
    if (selfFixIterations > 0) {
      const selfFixKey = `${this.metricsPrefix}self_fix_iterations`;
      await this.redis.zadd(selfFixKey, selfFixIterations, `${buildId}:${timestamp}`);
      await this.redis.zremrangebyrank(selfFixKey, 0, -1001);
    }
  }

  // Deployment metrics
  async recordDeploymentStart(deploymentId, buildId, deploymentType) {
    if (!this.initialized) return;
    
    const timestamp = Date.now();
    const deployKey = `${this.metricsPrefix}deployment:${deploymentId}`;
    
    await this.redis.hset(deployKey, {
      deploymentId,
      buildId,
      deploymentType,
      startTime: timestamp,
      status: 'deploying'
    });
    
    // Increment daily deployment counter
    const dateKey = this.getDailyKey('deployments');
    await this.redis.incr(dateKey);
    await this.redis.expire(dateKey, 86400 * 30);
  }

  async recordDeploymentComplete(deploymentId, success, duration, endpoint = null) {
    if (!this.initialized) return;
    
    const timestamp = Date.now();
    const deployKey = `${this.metricsPrefix}deployment:${deploymentId}`;
    
    await this.redis.hset(deployKey, {
      endTime: timestamp,
      duration,
      status: success ? 'deployed' : 'failed',
      endpoint: endpoint || ''
    });
    
    // Update deployment success/failure counters
    const dateKey = this.getDailyKey(success ? 'deployments_success' : 'deployments_failed');
    await this.redis.incr(dateKey);
    await this.redis.expire(dateKey, 86400 * 30);
  }

  // Cost tracking
  async recordCost(buildId, costType, amount, currency = 'USD') {
    if (!this.initialized) return;
    
    const timestamp = Date.now();
    const costKey = `${this.metricsPrefix}cost:${buildId}`;
    
    await this.redis.hset(costKey, {
      buildId,
      costType, // 'llm_tokens', 'aws_compute', 'aws_storage', etc.
      amount,
      currency,
      timestamp
    });
    
    // Track daily costs
    const dateKey = this.getDailyKey(`cost_${costType}`);
    await this.redis.incrbyfloat(dateKey, amount);
    await this.redis.expire(dateKey, 86400 * 90); // 90 days retention for costs
  }

  // LLM usage tracking
  async recordLLMUsage(buildId, provider, model, inputTokens, outputTokens, cost) {
    if (!this.initialized) return;
    
    const timestamp = Date.now();
    const llmKey = `${this.metricsPrefix}llm:${buildId}:${timestamp}`;
    
    await this.redis.hset(llmKey, {
      buildId,
      provider,
      model,
      inputTokens,
      outputTokens,
      cost,
      timestamp
    });
    
    // Track daily token usage
    const tokenKey = this.getDailyKey(`tokens_${provider}`);
    await this.redis.incr(tokenKey, inputTokens + outputTokens);
    await this.redis.expire(tokenKey, 86400 * 30);
  }

  // Get metrics
  async getBuildMetrics(days = 7) {
    if (!this.initialized) return null;
    
    const metrics = {
      buildsPerDay: {},
      successRate: {},
      averageBuildTime: 0,
      medianBuildTime: 0,
      averageSelfFixIterations: 0,
      totalBuilds: 0,
      successfulBuilds: 0,
      failedBuilds: 0
    };
    
    // Get daily build counts
    for (let i = 0; i < days; i++) {
      const date = this.getDateKey(i);
      const builds = await this.redis.get(`${this.metricsPrefix}builds:${date}`) || 0;
      const success = await this.redis.get(`${this.metricsPrefix}builds_success:${date}`) || 0;
      const failed = await this.redis.get(`${this.metricsPrefix}builds_failed:${date}`) || 0;
      
      metrics.buildsPerDay[date] = parseInt(builds);
      metrics.successRate[date] = builds > 0 ? (success / builds * 100).toFixed(2) : 0;
      metrics.totalBuilds += parseInt(builds);
      metrics.successfulBuilds += parseInt(success);
      metrics.failedBuilds += parseInt(failed);
    }
    
    // Calculate build time statistics
    const buildTimes = await this.redis.zrange(`${this.metricsPrefix}build_times`, 0, -1, 'WITHSCORES');
    if (buildTimes.length > 0) {
      const times = buildTimes.filter((_, index) => index % 2 === 1).map(Number);
      metrics.averageBuildTime = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
      
      // Calculate median
      const sortedTimes = times.sort((a, b) => a - b);
      const mid = Math.floor(sortedTimes.length / 2);
      metrics.medianBuildTime = sortedTimes.length % 2 === 0 
        ? Math.round((sortedTimes[mid - 1] + sortedTimes[mid]) / 2)
        : sortedTimes[mid];
    }
    
    // Calculate average self-fix iterations
    const selfFixData = await this.redis.zrange(`${this.metricsPrefix}self_fix_iterations`, 0, -1, 'WITHSCORES');
    if (selfFixData.length > 0) {
      const iterations = selfFixData.filter((_, index) => index % 2 === 1).map(Number);
      metrics.averageSelfFixIterations = (iterations.reduce((a, b) => a + b, 0) / iterations.length).toFixed(2);
    }
    
    return metrics;
  }

  async getDeploymentMetrics(days = 7) {
    if (!this.initialized) return null;
    
    const metrics = {
      deploymentsPerDay: {},
      successRate: {},
      totalDeployments: 0,
      successfulDeployments: 0,
      failedDeployments: 0
    };
    
    for (let i = 0; i < days; i++) {
      const date = this.getDateKey(i);
      const deployments = await this.redis.get(`${this.metricsPrefix}deployments:${date}`) || 0;
      const success = await this.redis.get(`${this.metricsPrefix}deployments_success:${date}`) || 0;
      const failed = await this.redis.get(`${this.metricsPrefix}deployments_failed:${date}`) || 0;
      
      metrics.deploymentsPerDay[date] = parseInt(deployments);
      metrics.successRate[date] = deployments > 0 ? (success / deployments * 100).toFixed(2) : 0;
      metrics.totalDeployments += parseInt(deployments);
      metrics.successfulDeployments += parseInt(success);
      metrics.failedDeployments += parseInt(failed);
    }
    
    return metrics;
  }

  async getCostMetrics(days = 30) {
    if (!this.initialized) return null;
    
    const metrics = {
      dailyCosts: {},
      totalCost: 0,
      costByType: {}
    };
    
    const costTypes = ['llm_tokens', 'aws_compute', 'aws_storage', 'aws_network'];
    
    for (let i = 0; i < days; i++) {
      const date = this.getDateKey(i);
      let dailyTotal = 0;
      
      for (const costType of costTypes) {
        const cost = await this.redis.get(`${this.metricsPrefix}cost_${costType}:${date}`) || 0;
        const costValue = parseFloat(cost);
        
        if (!metrics.costByType[costType]) {
          metrics.costByType[costType] = 0;
        }
        metrics.costByType[costType] += costValue;
        dailyTotal += costValue;
      }
      
      metrics.dailyCosts[date] = dailyTotal.toFixed(2);
      metrics.totalCost += dailyTotal;
    }
    
    metrics.totalCost = metrics.totalCost.toFixed(2);
    
    return metrics;
  }

  async getCurrentBuildsPerSecond() {
    if (!this.initialized) return 0;
    
    const now = Date.now();
    const count = await this.redis.zcount(`${this.metricsPrefix}builds_per_sec`, now - 1000, now);
    return count;
  }

  // Alert thresholds
  async checkAlerts() {
    if (!this.initialized) return [];
    
    const alerts = [];
    
    // Check build failure rate
    const todayKey = this.getDateKey(0);
    const totalBuilds = await this.redis.get(`${this.metricsPrefix}builds:${todayKey}`) || 0;
    const failedBuilds = await this.redis.get(`${this.metricsPrefix}builds_failed:${todayKey}`) || 0;
    
    if (totalBuilds > 10 && (failedBuilds / totalBuilds) > 0.5) {
      alerts.push({
        type: 'high_failure_rate',
        message: `High build failure rate: ${((failedBuilds / totalBuilds) * 100).toFixed(1)}%`,
        severity: 'warning',
        timestamp: Date.now()
      });
    }
    
    // Check cost threshold (example: $100/day)
    const todayCost = await this.getTodayTotalCost();
    if (todayCost > 100) {
      alerts.push({
        type: 'cost_threshold',
        message: `Daily cost threshold exceeded: $${todayCost.toFixed(2)}`,
        severity: 'critical',
        timestamp: Date.now()
      });
    }
    
    return alerts;
  }

  async getTodayTotalCost() {
    if (!this.initialized) return 0;
    
    const todayKey = this.getDateKey(0);
    const costTypes = ['llm_tokens', 'aws_compute', 'aws_storage', 'aws_network'];
    let total = 0;
    
    for (const costType of costTypes) {
      const cost = await this.redis.get(`${this.metricsPrefix}cost_${costType}:${todayKey}`) || 0;
      total += parseFloat(cost);
    }
    
    return total;
  }

  // Utility methods
  getDailyKey(metric) {
    const today = new Date().toISOString().split('T')[0];
    return `${this.metricsPrefix}${metric}:${today}`;
  }

  getDateKey(daysAgo = 0) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
  }

  async cleanup() {
    // Clean up old metrics (older than 90 days)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    const cutoffKey = cutoffDate.toISOString().split('T')[0];
    
    // This would need to be implemented based on your cleanup strategy
    console.log(`Cleaning up metrics older than ${cutoffKey}`);
  }
}

module.exports = new MetricsCollector();