/**
 * Metrics Aggregator Service
 * Aggregates metrics from metrics collector, cost tracker, and token tracker
 * Calculates success rate, average latency, and total cost per provider
 * 
 * Requirements: 6.6
 */

class MetricsAggregator {
  constructor(metricsCollector, costTracker, tokenTracker) {
    this.metricsCollector = metricsCollector;
    this.costTracker = costTracker;
    this.tokenTracker = tokenTracker;
  }

  /**
   * Get comprehensive aggregated metrics
   * @param {Object} filters - Filter options
   * @param {string} filters.provider - Filter by provider
   * @param {string} filters.project - Filter by project ID
   * @param {string} filters.role - Filter by agent role
   * @param {Date} filters.startDate - Filter by start date
   * @param {Date} filters.endDate - Filter by end date
   * @returns {Object} Aggregated metrics
   */
  getAggregatedMetrics(filters = {}) {
    const performance = this.metricsCollector ? this.metricsCollector.getMetrics(filters) : null;
    const costs = this.costTracker ? this.costTracker.getCosts(filters) : null;
    const tokens = this.tokenTracker ? this.tokenTracker.getTokens(filters) : null;

    return {
      performance,
      costs,
      tokens,
      combined: this._combineMetrics(performance, costs, tokens)
    };
  }

  /**
   * Get aggregated metrics by provider
   * @param {Object} filters - Additional filters
   * @returns {Object} Provider-level aggregated metrics
   */
  getByProvider(filters = {}) {
    const performance = this.metricsCollector ? 
      this.metricsCollector.getMetrics({ ...filters, groupBy: 'provider' }) : null;
    const costs = this.costTracker ? 
      this.costTracker.getCosts({ ...filters, groupBy: 'provider' }) : null;
    const tokens = this.tokenTracker ? 
      this.tokenTracker.getTokens({ ...filters, groupBy: 'provider' }) : null;

    return this._mergeByProvider(performance, costs, tokens);
  }

  /**
   * Get aggregated metrics by role
   * @param {Object} filters - Additional filters
   * @returns {Object} Role-level aggregated metrics
   */
  getByRole(filters = {}) {
    const performance = this.metricsCollector ? 
      this.metricsCollector.getMetrics({ ...filters, groupBy: 'role' }) : null;
    const costs = this.costTracker ? 
      this.costTracker.getCosts({ ...filters, groupBy: 'role' }) : null;
    const tokens = this.tokenTracker ? 
      this.tokenTracker.getTokens({ ...filters, groupBy: 'role' }) : null;

    return this._mergeByKey(performance, costs, tokens);
  }

  /**
   * Get aggregated metrics by project
   * @param {Object} filters - Additional filters
   * @returns {Object} Project-level aggregated metrics
   */
  getByProject(filters = {}) {
    const performance = this.metricsCollector ? 
      this.metricsCollector.getMetrics({ ...filters, groupBy: 'project' }) : null;
    const costs = this.costTracker ? 
      this.costTracker.getCosts({ ...filters, groupBy: 'project' }) : null;
    const tokens = this.tokenTracker ? 
      this.tokenTracker.getTokens({ ...filters, groupBy: 'project' }) : null;

    return this._mergeByKey(performance, costs, tokens);
  }

  /**
   * Calculate success rate per provider
   * @param {Object} filters - Additional filters
   * @returns {Object} Success rates by provider
   */
  getSuccessRateByProvider(filters = {}) {
    if (!this.metricsCollector) {
      return { error: 'Metrics collector not available' };
    }

    const metrics = this.metricsCollector.getMetrics({ ...filters, groupBy: 'provider' });
    
    if (!metrics.breakdown) {
      return {};
    }

    const successRates = {};
    for (const [provider, data] of Object.entries(metrics.breakdown)) {
      successRates[provider] = {
        successRate: data.successRate || 0,
        calls: data.calls || 0,
        successfulCalls: data.successfulCalls || 0,
        failedCalls: data.failedCalls || 0
      };
    }

    return successRates;
  }

  /**
   * Calculate average latency per provider
   * @param {Object} filters - Additional filters
   * @returns {Object} Average latencies by provider
   */
  getAverageLatencyByProvider(filters = {}) {
    if (!this.metricsCollector) {
      return { error: 'Metrics collector not available' };
    }

    const metrics = this.metricsCollector.getMetrics({ ...filters, groupBy: 'provider' });
    
    if (!metrics.breakdown) {
      return {};
    }

    const latencies = {};
    for (const [provider, data] of Object.entries(metrics.breakdown)) {
      latencies[provider] = {
        averageLatency: data.averageLatency || 0,
        calls: data.calls || 0,
        totalLatency: data.totalLatency || 0
      };
    }

    return latencies;
  }

  /**
   * Calculate total cost per provider
   * @param {Object} filters - Additional filters
   * @returns {Object} Total costs by provider
   */
  getTotalCostByProvider(filters = {}) {
    if (!this.costTracker) {
      return { error: 'Cost tracker not available' };
    }

    const costs = this.costTracker.getCosts({ ...filters, groupBy: 'provider' });
    
    if (!costs.breakdown) {
      return {};
    }

    const totalCosts = {};
    for (const [provider, data] of Object.entries(costs.breakdown)) {
      totalCosts[provider] = {
        totalCost: data.cost || 0,
        calls: data.calls || 0,
        averageCostPerCall: data.calls > 0 ? (data.cost / data.calls) : 0,
        tokens: data.tokens || { input: 0, output: 0, total: 0 }
      };
    }

    return totalCosts;
  }

  /**
   * Get comprehensive provider summary
   * @param {string} provider - Provider name
   * @param {Object} filters - Additional filters
   * @returns {Object} Comprehensive provider metrics
   */
  getProviderSummary(provider, filters = {}) {
    const providerFilters = { ...filters, provider };

    const performance = this.metricsCollector ? 
      this.metricsCollector.getMetrics(providerFilters) : null;
    const costs = this.costTracker ? 
      this.costTracker.getCosts(providerFilters) : null;
    const tokens = this.tokenTracker ? 
      this.tokenTracker.getTokens(providerFilters) : null;

    return {
      provider,
      performance: performance?.total || {},
      costs: costs?.total || {},
      tokens: tokens?.total || {},
      combined: this._combineMetrics(performance, costs, tokens)
    };
  }

  /**
   * Get comprehensive role summary
   * @param {string} role - Role name
   * @param {Object} filters - Additional filters
   * @returns {Object} Comprehensive role metrics
   */
  getRoleSummary(role, filters = {}) {
    const roleFilters = { ...filters, role };

    const performance = this.metricsCollector ? 
      this.metricsCollector.getMetrics(roleFilters) : null;
    const costs = this.costTracker ? 
      this.costTracker.getCosts(roleFilters) : null;
    const tokens = this.tokenTracker ? 
      this.tokenTracker.getTokens(roleFilters) : null;

    return {
      role,
      performance: performance?.total || {},
      costs: costs?.total || {},
      tokens: tokens?.total || {},
      combined: this._combineMetrics(performance, costs, tokens)
    };
  }

  /**
   * Get time-series metrics
   * @param {string} period - Time period ('hour', 'day', 'week', 'month')
   * @param {Object} filters - Additional filters
   * @returns {Object} Time-series metrics
   */
  getTimeSeriesMetrics(period = 'day', filters = {}) {
    const performance = this.metricsCollector ? 
      this.metricsCollector.getMetricsByTimePeriod(period, filters) : [];
    const tokens = this.tokenTracker ? 
      this.tokenTracker.getTokensByTimePeriod(period, filters) : [];

    // Merge time series data
    const merged = this._mergeTimeSeries(performance, tokens);

    return merged;
  }

  /**
   * Get top performers
   * @param {number} limit - Number of top items to return
   * @param {Object} filters - Additional filters
   * @returns {Object} Top performers by various metrics
   */
  getTopPerformers(limit = 5, filters = {}) {
    const byProvider = this.getByProvider(filters);
    const byRole = this.getByRole(filters);

    return {
      topProvidersBySuccessRate: this._getTopN(byProvider.breakdown, limit, 'successRate'),
      topProvidersByLatency: this._getTopN(byProvider.breakdown, limit, 'averageLatency', true),
      topProvidersByCost: this._getTopN(byProvider.breakdown, limit, 'totalCost'),
      topRolesByVolume: this._getTopN(byRole.breakdown, limit, 'calls'),
      topRolesByCost: this._getTopN(byRole.breakdown, limit, 'totalCost')
    };
  }

  /**
   * Combine metrics from different sources
   * @private
   * @param {Object} performance - Performance metrics
   * @param {Object} costs - Cost metrics
   * @param {Object} tokens - Token metrics
   * @returns {Object} Combined metrics
   */
  _combineMetrics(performance, costs, tokens) {
    const combined = {
      calls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      successRate: 0,
      errorRate: 0,
      averageLatency: 0,
      totalCost: 0,
      averageCostPerCall: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      averageTokensPerCall: 0
    };

    if (performance?.total) {
      combined.calls = performance.total.calls || 0;
      combined.successfulCalls = performance.total.successfulCalls || 0;
      combined.failedCalls = performance.total.failedCalls || 0;
      combined.successRate = performance.total.successRate || 0;
      combined.errorRate = performance.total.errorRate || 0;
      combined.averageLatency = performance.total.averageLatency || 0;
    }

    if (costs?.total) {
      combined.totalCost = costs.total.cost || 0;
      combined.averageCostPerCall = combined.calls > 0 ? 
        combined.totalCost / combined.calls : 0;
    }

    if (tokens?.total) {
      combined.totalTokens = tokens.total.totalTokens || 0;
      combined.inputTokens = tokens.total.inputTokens || 0;
      combined.outputTokens = tokens.total.outputTokens || 0;
      combined.averageTokensPerCall = combined.calls > 0 ? 
        combined.totalTokens / combined.calls : 0;
    }

    return combined;
  }

  /**
   * Merge metrics by provider
   * @private
   * @param {Object} performance - Performance metrics
   * @param {Object} costs - Cost metrics
   * @param {Object} tokens - Token metrics
   * @returns {Object} Merged metrics
   */
  _mergeByProvider(performance, costs, tokens) {
    const merged = {
      total: this._combineMetrics(performance, costs, tokens),
      breakdown: {}
    };

    // Get all provider keys
    const providerKeys = new Set();
    if (performance?.breakdown) {
      Object.keys(performance.breakdown).forEach(key => providerKeys.add(key));
    }
    if (costs?.breakdown) {
      Object.keys(costs.breakdown).forEach(key => providerKeys.add(key));
    }
    if (tokens?.breakdown) {
      Object.keys(tokens.breakdown).forEach(key => providerKeys.add(key));
    }

    // Merge data for each provider
    for (const provider of providerKeys) {
      const perfData = performance?.breakdown?.[provider];
      const costData = costs?.breakdown?.[provider];
      const tokenData = tokens?.breakdown?.[provider];

      merged.breakdown[provider] = this._combineMetrics(
        perfData ? { total: perfData } : null,
        costData ? { total: costData } : null,
        tokenData ? { total: tokenData } : null
      );
    }

    return merged;
  }

  /**
   * Merge metrics by key (role or project)
   * @private
   * @param {Object} performance - Performance metrics
   * @param {Object} costs - Cost metrics
   * @param {Object} tokens - Token metrics
   * @returns {Object} Merged metrics
   */
  _mergeByKey(performance, costs, tokens) {
    const merged = {
      total: this._combineMetrics(performance, costs, tokens),
      breakdown: {}
    };

    // Get all keys
    const keys = new Set();
    if (performance?.breakdown) {
      Object.keys(performance.breakdown).forEach(key => keys.add(key));
    }
    if (costs?.breakdown) {
      Object.keys(costs.breakdown).forEach(key => keys.add(key));
    }
    if (tokens?.breakdown) {
      Object.keys(tokens.breakdown).forEach(key => keys.add(key));
    }

    // Merge data for each key
    for (const key of keys) {
      const perfData = performance?.breakdown?.[key];
      const costData = costs?.breakdown?.[key];
      const tokenData = tokens?.breakdown?.[key];

      merged.breakdown[key] = this._combineMetrics(
        perfData ? { total: perfData } : null,
        costData ? { total: costData } : null,
        tokenData ? { total: tokenData } : null
      );
    }

    return merged;
  }

  /**
   * Merge time series data
   * @private
   * @param {Array} performance - Performance time series
   * @param {Array} tokens - Token time series
   * @returns {Array} Merged time series
   */
  _mergeTimeSeries(performance, tokens) {
    const merged = {};

    // Add performance data
    for (const item of performance) {
      merged[item.period] = {
        period: item.period,
        calls: item.calls || 0,
        successfulCalls: item.successfulCalls || 0,
        failedCalls: item.failedCalls || 0,
        successRate: item.successRate || 0,
        averageLatency: item.averageLatency || 0,
        totalCost: item.totalCost || 0
      };
    }

    // Add token data
    for (const item of tokens) {
      if (!merged[item.period]) {
        merged[item.period] = {
          period: item.period,
          calls: 0,
          successfulCalls: 0,
          failedCalls: 0,
          successRate: 0,
          averageLatency: 0,
          totalCost: 0
        };
      }
      merged[item.period].inputTokens = item.inputTokens || 0;
      merged[item.period].outputTokens = item.outputTokens || 0;
      merged[item.period].totalTokens = item.totalTokens || 0;
    }

    // Convert to array and sort
    return Object.values(merged).sort((a, b) => 
      a.period.localeCompare(b.period)
    );
  }

  /**
   * Get top N items by metric
   * @private
   * @param {Object} data - Data to sort
   * @param {number} n - Number of items
   * @param {string} metric - Metric to sort by
   * @param {boolean} ascending - Sort ascending
   * @returns {Array} Top N items
   */
  _getTopN(data, n, metric, ascending = false) {
    if (!data) return [];

    const items = Object.entries(data).map(([key, value]) => ({
      name: key,
      ...value
    }));

    if (ascending) {
      items.sort((a, b) => (a[metric] || 0) - (b[metric] || 0));
    } else {
      items.sort((a, b) => (b[metric] || 0) - (a[metric] || 0));
    }

    return items.slice(0, n);
  }
}

module.exports = MetricsAggregator;
