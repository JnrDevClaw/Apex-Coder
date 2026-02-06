const auditLogger = require('./audit-logger');
const correlationTracker = require('./correlation-tracker');
const logRetentionService = require('./log-retention');
const structuredLogger = require('./structured-logger');

class AuditDashboardService {
  constructor() {
    this.dashboardCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get comprehensive audit dashboard data
   */
  async getDashboardData(timeRange = '24h', projectId = null) {
    const cacheKey = `dashboard_${timeRange}_${projectId || 'global'}`;
    const cached = this.dashboardCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const dashboardData = {
        timeRange,
        projectId,
        generatedAt: new Date().toISOString(),
        summary: await this.getSummaryStats(timeRange, projectId),
        auditStats: await this.getAuditStats(timeRange, projectId),
        correlationStats: correlationTracker.getStatistics(),
        retentionStats: await logRetentionService.getRetentionStats(),
        securityEvents: await this.getSecurityEvents(timeRange, projectId),
        costEvents: await this.getCostEvents(timeRange, projectId),
        aiActivityStats: await this.getAIActivityStats(timeRange, projectId),
        topUsers: await this.getTopUsers(timeRange, projectId),
        errorAnalysis: await this.getErrorAnalysis(timeRange, projectId)
      };

      // Cache the result
      this.dashboardCache.set(cacheKey, {
        data: dashboardData,
        timestamp: Date.now()
      });

      return dashboardData;
    } catch (error) {
      structuredLogger.error('Failed to generate dashboard data', {
        timeRange,
        projectId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get summary statistics
   */
  async getSummaryStats(timeRange, projectId) {
    const auditStats = await auditLogger.getAuditStats(projectId || 'global', timeRange);
    
    return {
      totalEvents: auditStats.totalEvents,
      userActions: auditStats.userActions,
      aiActions: auditStats.aiActions,
      securityEvents: auditStats.securityEvents,
      costEvents: auditStats.costEvents,
      activeCorrelations: correlationTracker.getActiveCount(),
      eventGrowthRate: await this.calculateGrowthRate(timeRange, projectId)
    };
  }

  /**
   * Get detailed audit statistics
   */
  async getAuditStats(timeRange, projectId) {
    return await auditLogger.getAuditStats(projectId || 'global', timeRange);
  }

  /**
   * Get security events analysis
   */
  async getSecurityEvents(timeRange, projectId) {
    try {
      const events = await auditLogger.getProjectAuditLog(projectId || 'global', {
        event: 'security',
        limit: 1000
      });

      const analysis = {
        totalSecurityEvents: events.length,
        eventsByType: {},
        eventsBySeverity: {},
        recentEvents: events.slice(0, 10),
        trends: this.analyzeSecurityTrends(events)
      };

      events.forEach(event => {
        const action = event.action || 'unknown';
        const severity = event.details?.severity || 'medium';
        
        analysis.eventsByType[action] = (analysis.eventsByType[action] || 0) + 1;
        analysis.eventsBySeverity[severity] = (analysis.eventsBySeverity[severity] || 0) + 1;
      });

      return analysis;
    } catch (error) {
      structuredLogger.error('Failed to get security events', {
        timeRange,
        projectId,
        error: error.message
      });
      return {
        totalSecurityEvents: 0,
        eventsByType: {},
        eventsBySeverity: {},
        recentEvents: [],
        trends: {}
      };
    }
  }

  /**
   * Get cost events analysis
   */
  async getCostEvents(timeRange, projectId) {
    try {
      const events = await auditLogger.getProjectAuditLog(projectId || 'global', {
        event: 'cost',
        limit: 1000
      });

      const analysis = {
        totalCostEvents: events.length,
        totalAmount: 0,
        currency: 'USD',
        eventsByType: {},
        costByResource: {},
        recentEvents: events.slice(0, 10),
        trends: this.analyzeCostTrends(events)
      };

      events.forEach(event => {
        const action = event.action || 'unknown';
        const amount = event.details?.amount || 0;
        const resourceType = event.details?.resourceType || 'unknown';
        
        analysis.eventsByType[action] = (analysis.eventsByType[action] || 0) + 1;
        analysis.costByResource[resourceType] = (analysis.costByResource[resourceType] || 0) + amount;
        analysis.totalAmount += amount;
      });

      return analysis;
    } catch (error) {
      structuredLogger.error('Failed to get cost events', {
        timeRange,
        projectId,
        error: error.message
      });
      return {
        totalCostEvents: 0,
        totalAmount: 0,
        currency: 'USD',
        eventsByType: {},
        costByResource: {},
        recentEvents: [],
        trends: {}
      };
    }
  }

  /**
   * Get AI activity statistics
   */
  async getAIActivityStats(timeRange, projectId) {
    try {
      const events = await auditLogger.getProjectAuditLog(projectId || 'global', {
        event: 'ai_action',
        limit: 1000
      });

      const analysis = {
        totalAIActions: events.length,
        actionsByAgent: {},
        actionsByType: {},
        promptsAnalyzed: 0,
        filesGenerated: 0,
        recentActions: events.slice(0, 10),
        trends: this.analyzeAITrends(events)
      };

      events.forEach(event => {
        const agent = event.actor || 'unknown';
        const action = event.action || 'unknown';
        
        analysis.actionsByAgent[agent] = (analysis.actionsByAgent[agent] || 0) + 1;
        analysis.actionsByType[action] = (analysis.actionsByType[action] || 0) + 1;
        
        if (event.promptSnapshot) {
          analysis.promptsAnalyzed++;
        }
        
        if (event.fileHashes && event.fileHashes.length > 0) {
          analysis.filesGenerated += event.fileHashes.length;
        }
      });

      return analysis;
    } catch (error) {
      structuredLogger.error('Failed to get AI activity stats', {
        timeRange,
        projectId,
        error: error.message
      });
      return {
        totalAIActions: 0,
        actionsByAgent: {},
        actionsByType: {},
        promptsAnalyzed: 0,
        filesGenerated: 0,
        recentActions: [],
        trends: {}
      };
    }
  }

  /**
   * Get top users by activity
   */
  async getTopUsers(timeRange, projectId) {
    try {
      const events = await auditLogger.getProjectAuditLog(projectId || 'global', {
        limit: 1000
      });

      const userStats = {};

      events.forEach(event => {
        if (event.actorType === 'user') {
          const userId = event.actor;
          if (!userStats[userId]) {
            userStats[userId] = {
              userId,
              totalActions: 0,
              actionsByType: {},
              lastActivity: null
            };
          }
          
          userStats[userId].totalActions++;
          userStats[userId].actionsByType[event.action] = 
            (userStats[userId].actionsByType[event.action] || 0) + 1;
          
          if (!userStats[userId].lastActivity || event.timestamp > userStats[userId].lastActivity) {
            userStats[userId].lastActivity = event.timestamp;
          }
        }
      });

      // Sort by total actions and return top 10
      return Object.values(userStats)
        .sort((a, b) => b.totalActions - a.totalActions)
        .slice(0, 10);
    } catch (error) {
      structuredLogger.error('Failed to get top users', {
        timeRange,
        projectId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get error analysis
   */
  async getErrorAnalysis(timeRange, projectId) {
    try {
      const correlations = correlationTracker.searchCorrelations({
        projectId: projectId || undefined
      });

      const errorAnalysis = {
        totalErrors: 0,
        errorsByType: {},
        errorsByCorrelation: {},
        recentErrors: [],
        errorRate: 0
      };

      let totalRequests = 0;

      correlations.forEach(correlation => {
        totalRequests++;
        
        const hasError = correlation.events.some(event => event.type === 'error');
        if (hasError) {
          errorAnalysis.totalErrors++;
          
          const errorEvents = correlation.events.filter(event => event.type === 'error');
          errorEvents.forEach(errorEvent => {
            const errorType = this.categorizeError(errorEvent.error);
            errorAnalysis.errorsByType[errorType] = 
              (errorAnalysis.errorsByType[errorType] || 0) + 1;
            
            errorAnalysis.recentErrors.push({
              correlationId: correlation.id,
              error: errorEvent.error,
              timestamp: errorEvent.timestamp,
              statusCode: errorEvent.statusCode
            });
          });
        }
      });

      // Sort recent errors by timestamp and limit to 10
      errorAnalysis.recentErrors = errorAnalysis.recentErrors
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 10);

      // Calculate error rate
      if (totalRequests > 0) {
        errorAnalysis.errorRate = (errorAnalysis.totalErrors / totalRequests) * 100;
      }

      return errorAnalysis;
    } catch (error) {
      structuredLogger.error('Failed to get error analysis', {
        timeRange,
        projectId,
        error: error.message
      });
      return {
        totalErrors: 0,
        errorsByType: {},
        errorsByCorrelation: {},
        recentErrors: [],
        errorRate: 0
      };
    }
  }

  /**
   * Calculate growth rate for events
   */
  async calculateGrowthRate(timeRange, projectId) {
    try {
      // Get current period stats
      const currentStats = await auditLogger.getAuditStats(projectId || 'global', timeRange);
      
      // Get previous period stats for comparison
      const previousTimeRange = this.getPreviousTimeRange(timeRange);
      const previousStats = await auditLogger.getAuditStats(projectId || 'global', previousTimeRange);
      
      if (previousStats.totalEvents === 0) {
        return currentStats.totalEvents > 0 ? 100 : 0;
      }
      
      return ((currentStats.totalEvents - previousStats.totalEvents) / previousStats.totalEvents) * 100;
    } catch (error) {
      structuredLogger.error('Failed to calculate growth rate', {
        timeRange,
        projectId,
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Get previous time range for comparison
   */
  getPreviousTimeRange(timeRange) {
    // This is a simplified implementation
    // In a real system, you'd calculate the exact previous period
    return timeRange;
  }

  /**
   * Analyze security trends
   */
  analyzeSecurityTrends(events) {
    const trends = {
      increasing: [],
      decreasing: [],
      stable: []
    };

    // Group events by day and analyze trends
    const eventsByDay = this.groupEventsByDay(events);
    const days = Object.keys(eventsByDay).sort();
    
    if (days.length >= 2) {
      const recent = eventsByDay[days[days.length - 1]] || 0;
      const previous = eventsByDay[days[days.length - 2]] || 0;
      
      if (recent > previous) {
        trends.increasing.push('security_events');
      } else if (recent < previous) {
        trends.decreasing.push('security_events');
      } else {
        trends.stable.push('security_events');
      }
    }

    return trends;
  }

  /**
   * Analyze cost trends
   */
  analyzeCostTrends(events) {
    const trends = {
      totalSpend: 0,
      dailyAverage: 0,
      projectedMonthly: 0
    };

    const totalAmount = events.reduce((sum, event) => {
      return sum + (event.details?.amount || 0);
    }, 0);

    trends.totalSpend = totalAmount;
    
    const uniqueDays = new Set(events.map(event => 
      new Date(event.timestamp).toDateString()
    )).size;
    
    if (uniqueDays > 0) {
      trends.dailyAverage = totalAmount / uniqueDays;
      trends.projectedMonthly = trends.dailyAverage * 30;
    }

    return trends;
  }

  /**
   * Analyze AI trends
   */
  analyzeAITrends(events) {
    const trends = {
      mostActiveAgent: null,
      averageFilesPerAction: 0,
      promptComplexityTrend: 'stable'
    };

    const agentCounts = {};
    let totalFiles = 0;
    let totalPrompts = 0;

    events.forEach(event => {
      const agent = event.actor;
      agentCounts[agent] = (agentCounts[agent] || 0) + 1;
      
      if (event.fileHashes) {
        totalFiles += event.fileHashes.length;
      }
      
      if (event.promptSnapshot) {
        totalPrompts++;
      }
    });

    // Find most active agent
    const sortedAgents = Object.entries(agentCounts)
      .sort(([,a], [,b]) => b - a);
    
    if (sortedAgents.length > 0) {
      trends.mostActiveAgent = sortedAgents[0][0];
    }

    // Calculate average files per action
    if (events.length > 0) {
      trends.averageFilesPerAction = totalFiles / events.length;
    }

    return trends;
  }

  /**
   * Group events by day
   */
  groupEventsByDay(events) {
    const grouped = {};
    
    events.forEach(event => {
      const day = new Date(event.timestamp).toDateString();
      grouped[day] = (grouped[day] || 0) + 1;
    });
    
    return grouped;
  }

  /**
   * Categorize error for analysis
   */
  categorizeError(errorMessage) {
    if (!errorMessage) return 'unknown';
    
    const message = errorMessage.toLowerCase();
    
    if (message.includes('timeout') || message.includes('timed out')) {
      return 'timeout';
    }
    if (message.includes('network') || message.includes('connection')) {
      return 'network';
    }
    if (message.includes('auth') || message.includes('unauthorized')) {
      return 'authentication';
    }
    if (message.includes('permission') || message.includes('forbidden')) {
      return 'authorization';
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return 'validation';
    }
    if (message.includes('database') || message.includes('db')) {
      return 'database';
    }
    if (message.includes('rate limit') || message.includes('throttle')) {
      return 'rate_limiting';
    }
    
    return 'application';
  }

  /**
   * Clear dashboard cache
   */
  clearCache() {
    this.dashboardCache.clear();
    structuredLogger.info('Audit dashboard cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      cacheSize: this.dashboardCache.size,
      cacheTimeout: this.cacheTimeout,
      entries: Array.from(this.dashboardCache.keys())
    };
  }
}

// Create singleton instance
const auditDashboardService = new AuditDashboardService();

module.exports = auditDashboardService;