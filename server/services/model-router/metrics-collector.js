/**
 * Metrics Collector Service
 * Collects performance and health metrics for AI model calls
 * Tracks latency, status, provider, model, and role
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */

class MetricsCollector {
  constructor() {
    // In-memory storage for metrics
    // In production, this should be persisted to a database or time-series DB
    this.metrics = [];
    this.aggregates = {
      byProvider: {},
      byModel: {},
      byRole: {},
      total: {
        calls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        totalLatency: 0,
        totalCost: 0,
        cachedCalls: 0
      }
    };
  }

  /**
   * Record a metric for an AI call
   * @param {Object} metricData - Metric information
   * @param {string} metricData.provider - Provider name
   * @param {string} metricData.model - Model name
   * @param {string} metricData.role - Agent role (optional)
   * @param {string} metricData.projectId - Project ID (optional)
   * @param {Object} metricData.tokens - Token usage (optional)
   * @param {number} metricData.cost - Cost in USD (optional)
   * @param {number} metricData.latency - Response time in ms
   * @param {string} metricData.status - Call status (success/error)
   * @param {boolean} metricData.cached - Whether response was cached (optional)
   * @param {boolean} metricData.streaming - Whether call was streaming (optional)
   * @param {boolean} metricData.isFallback - Whether fallback was used (optional)
   * @param {string} metricData.error - Error message if failed (optional)
   * @param {string} metricData.correlationId - Correlation ID (optional)
   * @param {Date} metricData.timestamp - Call timestamp (optional)
   */
  recordMetric(metricData) {
    // Validate required fields
    if (typeof metricData.latency !== 'number' || metricData.latency < 0) {
      throw new Error('Valid latency is required (non-negative number)');
    }
    if (!metricData.status) {
      throw new Error('Status is required');
    }

    // Create metric record
    const metricRecord = {
      provider: metricData.provider || 'unknown',
      model: metricData.model || 'unknown',
      role: metricData.role || 'unknown',
      projectId: metricData.projectId || 'unknown',
      tokens: metricData.tokens || { input: 0, output: 0, total: 0 },
      cost: metricData.cost || 0,
      latency: metricData.latency,
      status: metricData.status,
      cached: metricData.cached || false,
      streaming: metricData.streaming || false,
      isFallback: metricData.isFallback || false,
      error: metricData.error || null,
      correlationId: metricData.correlationId || null,
      timestamp: metricData.timestamp || new Date()
    };

    // Store metric record
    this.metrics.push(metricRecord);

    // Update aggregates
    this._updateAggregates(metricRecord);

    return metricRecord;
  }

  /**
   * Update aggregate statistics
   * @private
   * @param {Object} metricRecord - Metric record
   */
  _updateAggregates(metricRecord) {
    const isSuccess = metricRecord.status === 'success';

    // Update total aggregates
    this.aggregates.total.calls++;
    if (isSuccess) {
      this.aggregates.total.successfulCalls++;
    } else {
      this.aggregates.total.failedCalls++;
    }
    this.aggregates.total.totalLatency += metricRecord.latency;
    this.aggregates.total.totalCost += metricRecord.cost;
    if (metricRecord.cached) {
      this.aggregates.total.cachedCalls++;
    }

    // Update provider aggregates
    if (!this.aggregates.byProvider[metricRecord.provider]) {
      this.aggregates.byProvider[metricRecord.provider] = {
        calls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        totalLatency: 0,
        totalCost: 0,
        cachedCalls: 0,
        errors: {}
      };
    }
    const providerAgg = this.aggregates.byProvider[metricRecord.provider];
    providerAgg.calls++;
    if (isSuccess) {
      providerAgg.successfulCalls++;
    } else {
      providerAgg.failedCalls++;
      // Track error types
      const errorType = metricRecord.error || 'unknown_error';
      providerAgg.errors[errorType] = (providerAgg.errors[errorType] || 0) + 1;
    }
    providerAgg.totalLatency += metricRecord.latency;
    providerAgg.totalCost += metricRecord.cost;
    if (metricRecord.cached) {
      providerAgg.cachedCalls++;
    }

    // Update model aggregates
    const modelKey = `${metricRecord.provider}:${metricRecord.model}`;
    if (!this.aggregates.byModel[modelKey]) {
      this.aggregates.byModel[modelKey] = {
        provider: metricRecord.provider,
        model: metricRecord.model,
        calls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        totalLatency: 0,
        totalCost: 0,
        cachedCalls: 0
      };
    }
    const modelAgg = this.aggregates.byModel[modelKey];
    modelAgg.calls++;
    if (isSuccess) {
      modelAgg.successfulCalls++;
    } else {
      modelAgg.failedCalls++;
    }
    modelAgg.totalLatency += metricRecord.latency;
    modelAgg.totalCost += metricRecord.cost;
    if (metricRecord.cached) {
      modelAgg.cachedCalls++;
    }

    // Update role aggregates
    if (!this.aggregates.byRole[metricRecord.role]) {
      this.aggregates.byRole[metricRecord.role] = {
        calls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        totalLatency: 0,
        totalCost: 0,
        cachedCalls: 0,
        providers: {}
      };
    }
    const roleAgg = this.aggregates.byRole[metricRecord.role];
    roleAgg.calls++;
    if (isSuccess) {
      roleAgg.successfulCalls++;
    } else {
      roleAgg.failedCalls++;
    }
    roleAgg.totalLatency += metricRecord.latency;
    roleAgg.totalCost += metricRecord.cost;
    if (metricRecord.cached) {
      roleAgg.cachedCalls++;
    }

    // Update provider breakdown within role
    if (!roleAgg.providers[metricRecord.provider]) {
      roleAgg.providers[metricRecord.provider] = {
        calls: 0,
        successfulCalls: 0,
        failedCalls: 0
      };
    }
    const roleProviderAgg = roleAgg.providers[metricRecord.provider];
    roleProviderAgg.calls++;
    if (isSuccess) {
      roleProviderAgg.successfulCalls++;
    } else {
      roleProviderAgg.failedCalls++;
    }
  }

  /**
   * Get metrics with optional filters
   * @param {Object} filters - Filter options
   * @param {string} filters.provider - Filter by provider
   * @param {string} filters.model - Filter by model
   * @param {string} filters.role - Filter by agent role
   * @param {string} filters.projectId - Filter by project ID
   * @param {string} filters.status - Filter by status (success/error)
   * @param {Date} filters.startDate - Filter by start date
   * @param {Date} filters.endDate - Filter by end date
   * @param {string} filters.groupBy - Group results by 'provider', 'model', 'role', or 'none'
   * @returns {Object} Metrics data
   */
  getMetrics(filters = {}) {
    // If no filters, return aggregates with calculated rates
    if (!filters.provider && !filters.model && !filters.role && !filters.projectId && 
        !filters.status && !filters.startDate && !filters.endDate) {
      return this._formatAggregates(filters.groupBy);
    }

    // Filter metrics based on criteria
    let filteredMetrics = this.metrics;

    if (filters.provider) {
      filteredMetrics = filteredMetrics.filter(metric => metric.provider === filters.provider);
    }

    if (filters.model) {
      filteredMetrics = filteredMetrics.filter(metric => metric.model === filters.model);
    }

    if (filters.role) {
      filteredMetrics = filteredMetrics.filter(metric => metric.role === filters.role);
    }

    if (filters.projectId) {
      filteredMetrics = filteredMetrics.filter(metric => metric.projectId === filters.projectId);
    }

    if (filters.status) {
      filteredMetrics = filteredMetrics.filter(metric => metric.status === filters.status);
    }

    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      filteredMetrics = filteredMetrics.filter(metric => metric.timestamp >= startDate);
    }

    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      filteredMetrics = filteredMetrics.filter(metric => metric.timestamp <= endDate);
    }

    // Calculate metrics from filtered data
    return this._calculateMetrics(filteredMetrics, filters.groupBy);
  }

  /**
   * Format aggregate data based on groupBy option
   * @private
   * @param {string} groupBy - Grouping option
   * @returns {Object} Formatted aggregates with calculated rates
   */
  _formatAggregates(groupBy) {
    const total = this._calculateRates(this.aggregates.total);

    if (!groupBy || groupBy === 'none') {
      return {
        total,
        byProvider: this._calculateRatesForGroup(this.aggregates.byProvider),
        byModel: this._calculateRatesForGroup(this.aggregates.byModel),
        byRole: this._calculateRatesForGroup(this.aggregates.byRole)
      };
    }

    if (groupBy === 'provider') {
      return {
        total,
        breakdown: this._calculateRatesForGroup(this.aggregates.byProvider)
      };
    }

    if (groupBy === 'model') {
      return {
        total,
        breakdown: this._calculateRatesForGroup(this.aggregates.byModel)
      };
    }

    if (groupBy === 'role') {
      return {
        total,
        breakdown: this._calculateRatesForGroup(this.aggregates.byRole)
      };
    }

    return { total, ...this.aggregates };
  }

  /**
   * Calculate rates for a group of aggregates
   * @private
   * @param {Object} group - Group of aggregates
   * @returns {Object} Group with calculated rates
   */
  _calculateRatesForGroup(group) {
    const result = {};
    for (const [key, value] of Object.entries(group)) {
      result[key] = this._calculateRates(value);
    }
    return result;
  }

  /**
   * Calculate success rate, error rate, and average latency
   * @private
   * @param {Object} aggregate - Aggregate data
   * @returns {Object} Aggregate with calculated rates
   */
  _calculateRates(aggregate) {
    const calls = aggregate.calls || 0;
    const successfulCalls = aggregate.successfulCalls || 0;
    const failedCalls = aggregate.failedCalls || 0;
    const totalLatency = aggregate.totalLatency || 0;
    const cachedCalls = aggregate.cachedCalls || 0;

    return {
      ...aggregate,
      successRate: calls > 0 ? (successfulCalls / calls) * 100 : 0,
      errorRate: calls > 0 ? (failedCalls / calls) * 100 : 0,
      averageLatency: calls > 0 ? totalLatency / calls : 0,
      cacheHitRate: calls > 0 ? (cachedCalls / calls) * 100 : 0
    };
  }

  /**
   * Calculate metrics from filtered data
   * @private
   * @param {Array} metrics - Filtered metric records
   * @param {string} groupBy - Grouping option
   * @returns {Object} Calculated metrics
   */
  _calculateMetrics(metrics, groupBy) {
    const result = {
      total: {
        calls: metrics.length,
        successfulCalls: 0,
        failedCalls: 0,
        totalLatency: 0,
        totalCost: 0,
        cachedCalls: 0
      }
    };

    // Calculate totals
    for (const metric of metrics) {
      if (metric.status === 'success') {
        result.total.successfulCalls++;
      } else {
        result.total.failedCalls++;
      }
      result.total.totalLatency += metric.latency;
      result.total.totalCost += metric.cost;
      if (metric.cached) {
        result.total.cachedCalls++;
      }
    }

    // Add calculated rates
    result.total = this._calculateRates(result.total);

    // Group by if specified
    if (groupBy && groupBy !== 'none') {
      result.breakdown = {};

      for (const metric of metrics) {
        let key;
        if (groupBy === 'provider') {
          key = metric.provider;
        } else if (groupBy === 'model') {
          key = `${metric.provider}:${metric.model}`;
        } else if (groupBy === 'role') {
          key = metric.role;
        } else {
          key = metric[groupBy];
        }

        if (!result.breakdown[key]) {
          result.breakdown[key] = {
            calls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            totalLatency: 0,
            totalCost: 0,
            cachedCalls: 0
          };
        }

        const group = result.breakdown[key];
        group.calls++;
        if (metric.status === 'success') {
          group.successfulCalls++;
        } else {
          group.failedCalls++;
        }
        group.totalLatency += metric.latency;
        group.totalCost += metric.cost;
        if (metric.cached) {
          group.cachedCalls++;
        }
      }

      // Calculate rates for each group
      for (const key in result.breakdown) {
        result.breakdown[key] = this._calculateRates(result.breakdown[key]);
      }
    }

    return result;
  }

  /**
   * Get detailed metric history
   * @param {Object} filters - Filter options (same as getMetrics)
   * @param {number} limit - Maximum number of records to return
   * @param {number} offset - Number of records to skip
   * @returns {Object} Metric history with pagination
   */
  getMetricHistory(filters = {}, limit = 100, offset = 0) {
    let filteredMetrics = this.metrics;

    // Apply filters
    if (filters.provider) {
      filteredMetrics = filteredMetrics.filter(metric => metric.provider === filters.provider);
    }
    if (filters.model) {
      filteredMetrics = filteredMetrics.filter(metric => metric.model === filters.model);
    }
    if (filters.role) {
      filteredMetrics = filteredMetrics.filter(metric => metric.role === filters.role);
    }
    if (filters.projectId) {
      filteredMetrics = filteredMetrics.filter(metric => metric.projectId === filters.projectId);
    }
    if (filters.status) {
      filteredMetrics = filteredMetrics.filter(metric => metric.status === filters.status);
    }
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      filteredMetrics = filteredMetrics.filter(metric => metric.timestamp >= startDate);
    }
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      filteredMetrics = filteredMetrics.filter(metric => metric.timestamp <= endDate);
    }

    // Sort by timestamp (most recent first)
    filteredMetrics.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    const total = filteredMetrics.length;
    const paginatedMetrics = filteredMetrics.slice(offset, offset + limit);

    return {
      metrics: paginatedMetrics,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    };
  }

  /**
   * Get performance summary statistics
   * @returns {Object} Summary statistics
   */
  getSummary() {
    const total = this._calculateRates(this.aggregates.total);

    const summary = {
      total,
      topProvidersBySuccessRate: this._getTopN(this.aggregates.byProvider, 5, 'successRate'),
      topProvidersByLatency: this._getTopN(this.aggregates.byProvider, 5, 'averageLatency', true),
      topRolesByVolume: this._getTopN(this.aggregates.byRole, 5, 'calls'),
      errorBreakdown: this._getErrorBreakdown()
    };

    return summary;
  }

  /**
   * Get top N items by a metric
   * @private
   * @param {Object} aggregates - Aggregate data
   * @param {number} n - Number of items to return
   * @param {string} metric - Metric to sort by
   * @param {boolean} ascending - Sort ascending (for latency)
   * @returns {Array} Top N items
   */
  _getTopN(aggregates, n, metric, ascending = false) {
    const items = Object.entries(aggregates).map(([key, value]) => ({
      name: key,
      ...this._calculateRates(value)
    }));

    // Sort by metric
    if (ascending) {
      items.sort((a, b) => a[metric] - b[metric]);
    } else {
      items.sort((a, b) => b[metric] - a[metric]);
    }

    return items.slice(0, n);
  }

  /**
   * Get error breakdown across all providers
   * @private
   * @returns {Object} Error breakdown
   */
  _getErrorBreakdown() {
    const errors = {};

    for (const [provider, data] of Object.entries(this.aggregates.byProvider)) {
      if (data.errors) {
        for (const [errorType, count] of Object.entries(data.errors)) {
          if (!errors[errorType]) {
            errors[errorType] = { count: 0, providers: {} };
          }
          errors[errorType].count += count;
          errors[errorType].providers[provider] = count;
        }
      }
    }

    // Sort by count
    const sortedErrors = Object.entries(errors)
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.count - a.count);

    return sortedErrors;
  }

  /**
   * Get metrics by time period
   * @param {string} period - Time period ('hour', 'day', 'week', 'month')
   * @param {Object} filters - Additional filters
   * @returns {Object} Metrics grouped by time period
   */
  getMetricsByTimePeriod(period = 'day', filters = {}) {
    let filteredMetrics = this.metrics;

    // Apply filters
    if (filters.provider) {
      filteredMetrics = filteredMetrics.filter(metric => metric.provider === filters.provider);
    }
    if (filters.role) {
      filteredMetrics = filteredMetrics.filter(metric => metric.role === filters.role);
    }
    if (filters.projectId) {
      filteredMetrics = filteredMetrics.filter(metric => metric.projectId === filters.projectId);
    }
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      filteredMetrics = filteredMetrics.filter(metric => metric.timestamp >= startDate);
    }
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      filteredMetrics = filteredMetrics.filter(metric => metric.timestamp <= endDate);
    }

    // Group by time period
    const grouped = {};

    for (const metric of filteredMetrics) {
      const key = this._getTimePeriodKey(metric.timestamp, period);

      if (!grouped[key]) {
        grouped[key] = {
          period: key,
          calls: 0,
          successfulCalls: 0,
          failedCalls: 0,
          totalLatency: 0,
          totalCost: 0,
          cachedCalls: 0
        };
      }

      grouped[key].calls++;
      if (metric.status === 'success') {
        grouped[key].successfulCalls++;
      } else {
        grouped[key].failedCalls++;
      }
      grouped[key].totalLatency += metric.latency;
      grouped[key].totalCost += metric.cost;
      if (metric.cached) {
        grouped[key].cachedCalls++;
      }
    }

    // Calculate rates and convert to array
    const result = Object.values(grouped)
      .map(group => this._calculateRates(group))
      .sort((a, b) => a.period.localeCompare(b.period));

    return result;
  }

  /**
   * Get time period key for grouping
   * @private
   * @param {Date} timestamp - Timestamp
   * @param {string} period - Period type
   * @returns {string} Period key
   */
  _getTimePeriodKey(timestamp, period) {
    const date = new Date(timestamp);

    if (period === 'hour') {
      return date.toISOString().substring(0, 13) + ':00:00';
    } else if (period === 'day') {
      return date.toISOString().substring(0, 10);
    } else if (period === 'week') {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      return weekStart.toISOString().substring(0, 10);
    } else if (period === 'month') {
      return date.toISOString().substring(0, 7);
    }

    return date.toISOString().substring(0, 10);
  }

  /**
   * Reset all metrics data
   */
  reset() {
    this.metrics = [];
    this.aggregates = {
      byProvider: {},
      byModel: {},
      byRole: {},
      total: {
        calls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        totalLatency: 0,
        totalCost: 0,
        cachedCalls: 0
      }
    };
  }

  /**
   * Export metrics data as JSON
   * @param {Object} filters - Filter options
   * @returns {string} JSON string
   */
  export(filters = {}) {
    const data = {
      summary: this.getSummary(),
      metrics: this.getMetrics(filters),
      exportedAt: new Date().toISOString()
    };

    return JSON.stringify(data, null, 2);
  }
}

// Create singleton instance
const metricsCollector = new MetricsCollector();

module.exports = metricsCollector;
module.exports.MetricsCollector = MetricsCollector;
