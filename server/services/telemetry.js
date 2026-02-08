const redisService = require('./redis');
const crypto = require('crypto');

class TelemetryService {
  constructor() {
    this.redis = null;
    this.telemetryPrefix = 'telemetry:';
    this.initialized = false;
    this.optInUsers = new Set();
    this.anonymizationSalt = process.env.TELEMETRY_SALT || 'default-salt-change-in-production';
  }

  async initialize() {
    try {
      this.redis = await redisService.connect();
      await this.loadOptInUsers();
      this.initialized = true;
      console.log('Telemetry service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize telemetry service:', error);
      throw error;
    }
  }

  async loadOptInUsers() {
    if (!this.redis) return;
    
    const optInUsers = await this.redis.smembers(`${this.telemetryPrefix}opt_in_users`);
    this.optInUsers = new Set(optInUsers);
  }

  // User opt-in/opt-out management
  async setUserOptIn(userId, optIn = true) {
    if (!this.initialized) return;
    
    const hashedUserId = this.hashUserId(userId);
    
    if (optIn) {
      this.optInUsers.add(hashedUserId);
      await this.redis.sadd(`${this.telemetryPrefix}opt_in_users`, hashedUserId);
    } else {
      this.optInUsers.delete(hashedUserId);
      await this.redis.srem(`${this.telemetryPrefix}opt_in_users`, hashedUserId);
      
      // Clean up existing telemetry data for this user
      await this.cleanupUserTelemetry(hashedUserId);
    }
    
    return { success: true, optIn, userId: hashedUserId };
  }

  async getUserOptInStatus(userId) {
    const hashedUserId = this.hashUserId(userId);
    return this.optInUsers.has(hashedUserId);
  }

  // Anonymized prompt and token tracking
  async recordPromptUsage(userId, agentRole, provider, model, promptData) {
    if (!this.initialized || !await this.getUserOptInStatus(userId)) {
      return;
    }
    
    const hashedUserId = this.hashUserId(userId);
    const timestamp = Date.now();
    const sessionId = this.generateSessionId();
    
    const anonymizedPrompt = {
      sessionId,
      userId: hashedUserId,
      agentRole,
      provider,
      model,
      promptLength: promptData.prompt ? promptData.prompt.length : 0,
      promptHash: promptData.prompt ? this.hashContent(promptData.prompt) : null,
      inputTokens: promptData.inputTokens || 0,
      outputTokens: promptData.outputTokens || 0,
      cost: promptData.cost || 0,
      responseTime: promptData.responseTime || 0,
      success: promptData.success !== false,
      errorType: promptData.errorType || null,
      timestamp
    };
    
    // Store individual prompt record
    const promptKey = `${this.telemetryPrefix}prompt:${sessionId}:${timestamp}`;
    await this.redis.hset(promptKey, anonymizedPrompt);
    await this.redis.expire(promptKey, 86400 * 90); // 90 days retention
    
    // Update aggregated metrics
    await this.updatePromptAggregates(anonymizedPrompt);
  }

  async updatePromptAggregates(promptData) {
    const dateKey = this.getDateKey(0);
    
    // Daily aggregates by agent role
    const roleKey = `${this.telemetryPrefix}daily:${dateKey}:role:${promptData.agentRole}`;
    await this.redis.hincrby(roleKey, 'count', 1);
    await this.redis.hincrby(roleKey, 'inputTokens', promptData.inputTokens);
    await this.redis.hincrby(roleKey, 'outputTokens', promptData.outputTokens);
    await this.redis.hincrbyfloat(roleKey, 'cost', promptData.cost);
    await this.redis.hincrby(roleKey, 'responseTime', promptData.responseTime);
    await this.redis.expire(roleKey, 86400 * 90);
    
    // Daily aggregates by provider
    const providerKey = `${this.telemetryPrefix}daily:${dateKey}:provider:${promptData.provider}`;
    await this.redis.hincrby(providerKey, 'count', 1);
    await this.redis.hincrby(providerKey, 'inputTokens', promptData.inputTokens);
    await this.redis.hincrby(providerKey, 'outputTokens', promptData.outputTokens);
    await this.redis.hincrbyfloat(providerKey, 'cost', promptData.cost);
    await this.redis.expire(providerKey, 86400 * 90);
    
    // Track success/failure rates
    if (promptData.success) {
      await this.redis.hincrby(roleKey, 'successes', 1);
      await this.redis.hincrby(providerKey, 'successes', 1);
    } else {
      await this.redis.hincrby(roleKey, 'failures', 1);
      await this.redis.hincrby(providerKey, 'failures', 1);
      
      // Track error types
      if (promptData.errorType) {
        const errorKey = `${this.telemetryPrefix}daily:${dateKey}:errors:${promptData.errorType}`;
        await this.redis.incr(errorKey);
        await this.redis.expire(errorKey, 86400 * 90);
      }
    }
  }

  // Usage analytics and insights
  async getUsageAnalytics(days = 30) {
    if (!this.initialized) return null;
    
    const analytics = {
      period: `${days} days`,
      totalPrompts: 0,
      totalTokens: 0,
      totalCost: 0,
      averageResponseTime: 0,
      successRate: 0,
      agentRoleBreakdown: {},
      providerBreakdown: {},
      dailyUsage: {},
      topErrorTypes: {},
      insights: []
    };
    
    let totalResponseTime = 0;
    let totalSuccesses = 0;
    let totalFailures = 0;
    
    for (let i = 0; i < days; i++) {
      const dateKey = this.getDateKey(i);
      let dailyPrompts = 0;
      let dailyTokens = 0;
      let dailyCost = 0;
      
      // Get agent role data
      const rolePattern = `${this.telemetryPrefix}daily:${dateKey}:role:*`;
      const roleKeys = await this.redis.keys(rolePattern);
      
      for (const roleKey of roleKeys) {
        const roleName = roleKey.split(':').pop();
        const roleData = await this.redis.hgetall(roleKey);
        
        if (!analytics.agentRoleBreakdown[roleName]) {
          analytics.agentRoleBreakdown[roleName] = {
            count: 0,
            inputTokens: 0,
            outputTokens: 0,
            cost: 0,
            averageResponseTime: 0,
            successRate: 0
          };
        }
        
        const count = parseInt(roleData.count || 0);
        const inputTokens = parseInt(roleData.inputTokens || 0);
        const outputTokens = parseInt(roleData.outputTokens || 0);
        const cost = parseFloat(roleData.cost || 0);
        const responseTime = parseInt(roleData.responseTime || 0);
        const successes = parseInt(roleData.successes || 0);
        const failures = parseInt(roleData.failures || 0);
        
        analytics.agentRoleBreakdown[roleName].count += count;
        analytics.agentRoleBreakdown[roleName].inputTokens += inputTokens;
        analytics.agentRoleBreakdown[roleName].outputTokens += outputTokens;
        analytics.agentRoleBreakdown[roleName].cost += cost;
        
        if (count > 0) {
          analytics.agentRoleBreakdown[roleName].averageResponseTime = 
            (analytics.agentRoleBreakdown[roleName].averageResponseTime + responseTime / count) / 2;
        }
        
        const totalAttempts = successes + failures;
        if (totalAttempts > 0) {
          analytics.agentRoleBreakdown[roleName].successRate = 
            (successes / totalAttempts * 100).toFixed(2);
        }
        
        dailyPrompts += count;
        dailyTokens += inputTokens + outputTokens;
        dailyCost += cost;
        totalResponseTime += responseTime;
        totalSuccesses += successes;
        totalFailures += failures;
      }
      
      // Get provider data
      const providerPattern = `${this.telemetryPrefix}daily:${dateKey}:provider:*`;
      const providerKeys = await this.redis.keys(providerPattern);
      
      for (const providerKey of providerKeys) {
        const providerName = providerKey.split(':').pop();
        const providerData = await this.redis.hgetall(providerKey);
        
        if (!analytics.providerBreakdown[providerName]) {
          analytics.providerBreakdown[providerName] = {
            count: 0,
            inputTokens: 0,
            outputTokens: 0,
            cost: 0,
            successRate: 0
          };
        }
        
        const count = parseInt(providerData.count || 0);
        const inputTokens = parseInt(providerData.inputTokens || 0);
        const outputTokens = parseInt(providerData.outputTokens || 0);
        const cost = parseFloat(providerData.cost || 0);
        const successes = parseInt(providerData.successes || 0);
        const failures = parseInt(providerData.failures || 0);
        
        analytics.providerBreakdown[providerName].count += count;
        analytics.providerBreakdown[providerName].inputTokens += inputTokens;
        analytics.providerBreakdown[providerName].outputTokens += outputTokens;
        analytics.providerBreakdown[providerName].cost += cost;
        
        const totalAttempts = successes + failures;
        if (totalAttempts > 0) {
          analytics.providerBreakdown[providerName].successRate = 
            (successes / totalAttempts * 100).toFixed(2);
        }
      }
      
      analytics.dailyUsage[dateKey] = {
        prompts: dailyPrompts,
        tokens: dailyTokens,
        cost: dailyCost.toFixed(4)
      };
      
      analytics.totalPrompts += dailyPrompts;
      analytics.totalTokens += dailyTokens;
      analytics.totalCost += dailyCost;
    }
    
    // Calculate overall metrics
    if (analytics.totalPrompts > 0) {
      analytics.averageResponseTime = Math.round(totalResponseTime / analytics.totalPrompts);
    }
    
    const totalAttempts = totalSuccesses + totalFailures;
    if (totalAttempts > 0) {
      analytics.successRate = (totalSuccesses / totalAttempts * 100).toFixed(2);
    }
    
    analytics.totalCost = analytics.totalCost.toFixed(4);
    
    // Get top error types
    analytics.topErrorTypes = await this.getTopErrorTypes(days);
    
    // Generate insights
    analytics.insights = await this.generateInsights(analytics);
    
    return analytics;
  }

  async getTopErrorTypes(days = 30) {
    const errorTypes = {};
    
    for (let i = 0; i < days; i++) {
      const dateKey = this.getDateKey(i);
      const errorPattern = `${this.telemetryPrefix}daily:${dateKey}:errors:*`;
      const errorKeys = await this.redis.keys(errorPattern);
      
      for (const errorKey of errorKeys) {
        const errorType = errorKey.split(':').pop();
        const count = await this.redis.get(errorKey) || 0;
        
        if (!errorTypes[errorType]) {
          errorTypes[errorType] = 0;
        }
        errorTypes[errorType] += parseInt(count);
      }
    }
    
    // Sort by count and return top 10
    return Object.entries(errorTypes)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .reduce((obj, [type, count]) => {
        obj[type] = count;
        return obj;
      }, {});
  }

  async generateInsights(analytics) {
    const insights = [];
    
    // Cost efficiency insights
    if (analytics.totalCost > 0 && analytics.totalPrompts > 0) {
      const costPerPrompt = parseFloat(analytics.totalCost) / analytics.totalPrompts;
      insights.push({
        type: 'cost_efficiency',
        message: `Average cost per prompt: $${costPerPrompt.toFixed(4)}`,
        value: costPerPrompt,
        trend: 'neutral'
      });
    }
    
    // Success rate insights
    const successRate = parseFloat(analytics.successRate);
    if (successRate < 90) {
      insights.push({
        type: 'success_rate',
        message: `Success rate is below 90%: ${successRate}%`,
        value: successRate,
        trend: 'negative',
        recommendation: 'Consider reviewing error patterns and improving prompt quality'
      });
    } else if (successRate > 95) {
      insights.push({
        type: 'success_rate',
        message: `Excellent success rate: ${successRate}%`,
        value: successRate,
        trend: 'positive'
      });
    }
    
    // Provider performance insights
    const providers = Object.entries(analytics.providerBreakdown);
    if (providers.length > 1) {
      const bestProvider = providers.reduce((best, [name, data]) => {
        const successRate = parseFloat(data.successRate);
        const bestSuccessRate = parseFloat(best.data.successRate);
        return successRate > bestSuccessRate ? { name, data } : best;
      }, { name: providers[0][0], data: providers[0][1] });
      
      insights.push({
        type: 'provider_performance',
        message: `Best performing provider: ${bestProvider.name} (${bestProvider.data.successRate}% success rate)`,
        value: bestProvider.data.successRate,
        trend: 'positive'
      });
    }
    
    // Token efficiency insights
    const agentRoles = Object.entries(analytics.agentRoleBreakdown);
    if (agentRoles.length > 0) {
      const mostExpensive = agentRoles.reduce((max, [name, data]) => {
        return data.cost > max.data.cost ? { name, data } : max;
      }, { name: agentRoles[0][0], data: agentRoles[0][1] });
      
      insights.push({
        type: 'token_efficiency',
        message: `Most expensive agent role: ${mostExpensive.name} ($${mostExpensive.data.cost.toFixed(4)} total)`,
        value: mostExpensive.data.cost,
        trend: 'neutral',
        recommendation: 'Consider optimizing prompts for this agent role'
      });
    }
    
    return insights;
  }

  // A/B Testing framework for questionnaire optimization
  async createABTest(testName, variants, trafficSplit = 0.5) {
    if (!this.initialized) return null;
    
    const testId = this.generateTestId();
    const test = {
      testId,
      testName,
      variants, // Array of variant configurations
      trafficSplit,
      startTime: Date.now(),
      status: 'active',
      results: {}
    };
    
    const testKey = `${this.telemetryPrefix}ab_test:${testId}`;
    await this.redis.hset(testKey, test);
    await this.redis.expire(testKey, 86400 * 30); // 30 days
    
    return test;
  }

  async recordABTestEvent(testId, userId, variant, event, value = 1) {
    if (!this.initialized || !await this.getUserOptInStatus(userId)) {
      return;
    }
    
    const hashedUserId = this.hashUserId(userId);
    const timestamp = Date.now();
    
    const eventKey = `${this.telemetryPrefix}ab_event:${testId}:${variant}:${event}`;
    await this.redis.hincrby(eventKey, 'count', value);
    await this.redis.expire(eventKey, 86400 * 30);
    
    // Record user participation
    const participantKey = `${this.telemetryPrefix}ab_participant:${testId}:${hashedUserId}`;
    await this.redis.hset(participantKey, {
      variant,
      firstSeen: timestamp,
      lastSeen: timestamp
    });
    await this.redis.expire(participantKey, 86400 * 30);
  }

  async getABTestResults(testId) {
    if (!this.initialized) return null;
    
    const testKey = `${this.telemetryPrefix}ab_test:${testId}`;
    const test = await this.redis.hgetall(testKey);
    
    if (!test.testId) {
      return null;
    }
    
    const results = {
      testId,
      testName: test.testName,
      variants: JSON.parse(test.variants),
      startTime: parseInt(test.startTime),
      status: test.status,
      results: {}
    };
    
    // Get event data for each variant
    const eventPattern = `${this.telemetryPrefix}ab_event:${testId}:*`;
    const eventKeys = await this.redis.keys(eventPattern);
    
    for (const eventKey of eventKeys) {
      const [, , , variant, event] = eventKey.split(':');
      const eventData = await this.redis.hgetall(eventKey);
      
      if (!results.results[variant]) {
        results.results[variant] = {};
      }
      
      results.results[variant][event] = {
        count: parseInt(eventData.count || 0)
      };
    }
    
    // Calculate conversion rates and statistical significance
    results.analysis = this.analyzeABTestResults(results.results);
    
    return results;
  }

  analyzeABTestResults(results) {
    const analysis = {
      totalParticipants: 0,
      conversionRates: {},
      statisticalSignificance: false,
      winner: null,
      confidence: 0
    };
    
    const variants = Object.keys(results);
    if (variants.length < 2) return analysis;
    
    // Calculate conversion rates
    for (const variant of variants) {
      const events = results[variant];
      const views = events.view?.count || 0;
      const conversions = events.conversion?.count || 0;
      
      analysis.totalParticipants += views;
      analysis.conversionRates[variant] = {
        views,
        conversions,
        rate: views > 0 ? (conversions / views * 100).toFixed(2) : 0
      };
    }
    
    // Simple statistical significance check (would use proper statistical tests in production)
    const rates = Object.values(analysis.conversionRates).map(r => parseFloat(r.rate));
    const maxRate = Math.max(...rates);
    const minRate = Math.min(...rates);
    
    if (maxRate - minRate > 5 && analysis.totalParticipants > 100) {
      analysis.statisticalSignificance = true;
      analysis.winner = variants.find(v => 
        parseFloat(analysis.conversionRates[v].rate) === maxRate
      );
      analysis.confidence = Math.min(95, (maxRate - minRate) * 10); // Simplified confidence calculation
    }
    
    return analysis;
  }

  // Performance benchmarking
  async recordPerformanceBenchmark(benchmarkType, metrics) {
    if (!this.initialized) return;
    
    const timestamp = Date.now();
    const benchmarkKey = `${this.telemetryPrefix}benchmark:${benchmarkType}:${timestamp}`;
    
    await this.redis.hset(benchmarkKey, {
      benchmarkType,
      timestamp,
      ...metrics
    });
    await this.redis.expire(benchmarkKey, 86400 * 90);
    
    // Update rolling averages
    const avgKey = `${this.telemetryPrefix}benchmark_avg:${benchmarkType}`;
    for (const [metric, value] of Object.entries(metrics)) {
      if (typeof value === 'number') {
        await this.redis.lpush(`${avgKey}:${metric}`, value);
        await this.redis.ltrim(`${avgKey}:${metric}`, 0, 99); // Keep last 100 values
      }
    }
  }

  async getPerformanceBenchmarks(benchmarkType, days = 30) {
    if (!this.initialized) return null;
    
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const pattern = `${this.telemetryPrefix}benchmark:${benchmarkType}:*`;
    const keys = await this.redis.keys(pattern);
    
    const benchmarks = [];
    for (const key of keys) {
      const timestamp = parseInt(key.split(':').pop());
      if (timestamp > cutoff) {
        const data = await this.redis.hgetall(key);
        benchmarks.push({
          timestamp,
          ...data
        });
      }
    }
    
    // Calculate averages
    const avgKey = `${this.telemetryPrefix}benchmark_avg:${benchmarkType}`;
    const avgPattern = `${avgKey}:*`;
    const avgKeys = await this.redis.keys(avgPattern);
    
    const averages = {};
    for (const avgKeyFull of avgKeys) {
      const metric = avgKeyFull.split(':').pop();
      const values = await this.redis.lrange(avgKeyFull, 0, -1);
      const numValues = values.map(Number);
      
      if (numValues.length > 0) {
        averages[metric] = {
          current: numValues.reduce((a, b) => a + b, 0) / numValues.length,
          trend: this.calculateTrend(numValues)
        };
      }
    }
    
    return {
      benchmarkType,
      period: `${days} days`,
      benchmarks: benchmarks.sort((a, b) => b.timestamp - a.timestamp),
      averages
    };
  }

  calculateTrend(values) {
    if (values.length < 2) return 'stable';
    
    const recent = values.slice(0, Math.floor(values.length / 2));
    const older = values.slice(Math.floor(values.length / 2));
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    
    if (change > 5) return 'improving';
    if (change < -5) return 'declining';
    return 'stable';
  }

  // Utility methods
  hashUserId(userId) {
    return crypto.createHash('sha256')
      .update(userId + this.anonymizationSalt)
      .digest('hex')
      .substring(0, 16);
  }

  hashContent(content) {
    return crypto.createHash('sha256')
      .update(content)
      .digest('hex')
      .substring(0, 16);
  }

  generateSessionId() {
    return crypto.randomBytes(8).toString('hex');
  }

  generateTestId() {
    return crypto.randomBytes(6).toString('hex');
  }

  getDateKey(daysAgo = 0) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
  }

  async cleanupUserTelemetry(hashedUserId) {
    // Remove user from opt-in list
    await this.redis.srem(`${this.telemetryPrefix}opt_in_users`, hashedUserId);
    
    // Clean up prompt records (this would be more complex in production)
    const promptPattern = `${this.telemetryPrefix}prompt:*`;
    const promptKeys = await this.redis.keys(promptPattern);
    
    for (const key of promptKeys) {
      const data = await this.redis.hgetall(key);
      if (data.userId === hashedUserId) {
        await this.redis.del(key);
      }
    }
    
    // Clean up A/B test participation
    const participantPattern = `${this.telemetryPrefix}ab_participant:*:${hashedUserId}`;
    const participantKeys = await this.redis.keys(participantPattern);
    for (const key of participantKeys) {
      await this.redis.del(key);
    }
  }

  async shutdown() {
    this.initialized = false;
    console.log('Telemetry service shutdown complete');
  }
}

module.exports = new TelemetryService();