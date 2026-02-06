/**
 * Cost Tracker Service
 * Tracks token usage and costs for AI model calls
 * Aggregates by provider, project, and role
 */

class CostTracker {
  constructor() {
    // In-memory storage for cost data
    // In production, this should be persisted to a database
    this.calls = [];
    this.aggregates = {
      byProvider: {},
      byProject: {},
      byRole: {},
      total: {
        calls: 0,
        tokens: { input: 0, output: 0, total: 0 },
        cost: 0
      }
    };
  }

  /**
   * Record an AI call with token usage and cost
   * @param {Object} callData - Call information
   * @param {string} callData.provider - Provider name
   * @param {string} callData.model - Model name
   * @param {string} callData.role - Agent role (optional)
   * @param {string} callData.projectId - Project ID (optional)
   * @param {Object} callData.tokens - Token usage
   * @param {number} callData.tokens.input - Input tokens
   * @param {number} callData.tokens.output - Output tokens
   * @param {number} callData.tokens.total - Total tokens
   * @param {number} callData.cost - Cost in USD
   * @param {number} callData.latency - Response time in ms (optional)
   * @param {string} callData.status - Call status (success/error)
   * @param {Date} callData.timestamp - Call timestamp (optional)
   */
  recordCall(callData) {
    // Validate required fields
    if (!callData.provider) {
      throw new Error('Provider is required');
    }
    if (!callData.model) {
      throw new Error('Model is required');
    }
    if (!callData.tokens || typeof callData.tokens.input !== 'number' || typeof callData.tokens.output !== 'number') {
      throw new Error('Valid token usage (input and output) is required');
    }
    if (typeof callData.cost !== 'number' || callData.cost < 0) {
      throw new Error('Valid cost is required');
    }

    // Create call record
    const callRecord = {
      provider: callData.provider,
      model: callData.model,
      role: callData.role || 'unknown',
      projectId: callData.projectId || 'unknown',
      tokens: {
        input: callData.tokens.input,
        output: callData.tokens.output,
        total: callData.tokens.total || (callData.tokens.input + callData.tokens.output)
      },
      cost: callData.cost,
      latency: callData.latency || 0,
      status: callData.status || 'success',
      timestamp: callData.timestamp || new Date()
    };

    // Store call record
    this.calls.push(callRecord);

    // Update aggregates
    this._updateAggregates(callRecord);

    return callRecord;
  }

  /**
   * Update aggregate statistics
   * @private
   * @param {Object} callRecord - Call record
   */
  _updateAggregates(callRecord) {
    // Update total aggregates
    this.aggregates.total.calls++;
    this.aggregates.total.tokens.input += callRecord.tokens.input;
    this.aggregates.total.tokens.output += callRecord.tokens.output;
    this.aggregates.total.tokens.total += callRecord.tokens.total;
    this.aggregates.total.cost += callRecord.cost;

    // Update provider aggregates
    if (!this.aggregates.byProvider[callRecord.provider]) {
      this.aggregates.byProvider[callRecord.provider] = {
        calls: 0,
        tokens: { input: 0, output: 0, total: 0 },
        cost: 0,
        models: {}
      };
    }
    const providerAgg = this.aggregates.byProvider[callRecord.provider];
    providerAgg.calls++;
    providerAgg.tokens.input += callRecord.tokens.input;
    providerAgg.tokens.output += callRecord.tokens.output;
    providerAgg.tokens.total += callRecord.tokens.total;
    providerAgg.cost += callRecord.cost;

    // Update model aggregates within provider
    if (!providerAgg.models[callRecord.model]) {
      providerAgg.models[callRecord.model] = {
        calls: 0,
        tokens: { input: 0, output: 0, total: 0 },
        cost: 0
      };
    }
    const modelAgg = providerAgg.models[callRecord.model];
    modelAgg.calls++;
    modelAgg.tokens.input += callRecord.tokens.input;
    modelAgg.tokens.output += callRecord.tokens.output;
    modelAgg.tokens.total += callRecord.tokens.total;
    modelAgg.cost += callRecord.cost;

    // Update project aggregates
    if (!this.aggregates.byProject[callRecord.projectId]) {
      this.aggregates.byProject[callRecord.projectId] = {
        calls: 0,
        tokens: { input: 0, output: 0, total: 0 },
        cost: 0,
        providers: {}
      };
    }
    const projectAgg = this.aggregates.byProject[callRecord.projectId];
    projectAgg.calls++;
    projectAgg.tokens.input += callRecord.tokens.input;
    projectAgg.tokens.output += callRecord.tokens.output;
    projectAgg.tokens.total += callRecord.tokens.total;
    projectAgg.cost += callRecord.cost;

    // Update provider breakdown within project
    if (!projectAgg.providers[callRecord.provider]) {
      projectAgg.providers[callRecord.provider] = {
        calls: 0,
        tokens: { input: 0, output: 0, total: 0 },
        cost: 0
      };
    }
    const projectProviderAgg = projectAgg.providers[callRecord.provider];
    projectProviderAgg.calls++;
    projectProviderAgg.tokens.input += callRecord.tokens.input;
    projectProviderAgg.tokens.output += callRecord.tokens.output;
    projectProviderAgg.tokens.total += callRecord.tokens.total;
    projectProviderAgg.cost += callRecord.cost;

    // Update role aggregates
    if (!this.aggregates.byRole[callRecord.role]) {
      this.aggregates.byRole[callRecord.role] = {
        calls: 0,
        tokens: { input: 0, output: 0, total: 0 },
        cost: 0,
        providers: {}
      };
    }
    const roleAgg = this.aggregates.byRole[callRecord.role];
    roleAgg.calls++;
    roleAgg.tokens.input += callRecord.tokens.input;
    roleAgg.tokens.output += callRecord.tokens.output;
    roleAgg.tokens.total += callRecord.tokens.total;
    roleAgg.cost += callRecord.cost;

    // Update provider breakdown within role
    if (!roleAgg.providers[callRecord.provider]) {
      roleAgg.providers[callRecord.provider] = {
        calls: 0,
        tokens: { input: 0, output: 0, total: 0 },
        cost: 0
      };
    }
    const roleProviderAgg = roleAgg.providers[callRecord.provider];
    roleProviderAgg.calls++;
    roleProviderAgg.tokens.input += callRecord.tokens.input;
    roleProviderAgg.tokens.output += callRecord.tokens.output;
    roleProviderAgg.tokens.total += callRecord.tokens.total;
    roleProviderAgg.cost += callRecord.cost;
  }

  /**
   * Get cost and token metrics with optional filters
   * @param {Object} filters - Filter options
   * @param {string} filters.provider - Filter by provider
   * @param {string} filters.project - Filter by project ID
   * @param {string} filters.role - Filter by agent role
   * @param {Date} filters.startDate - Filter by start date
   * @param {Date} filters.endDate - Filter by end date
   * @param {string} filters.groupBy - Group results by 'provider', 'project', 'role', or 'none'
   * @returns {Object} Cost and token metrics
   */
  getCosts(filters = {}) {
    // If no filters, return aggregates
    if (!filters.provider && !filters.project && !filters.role && !filters.startDate && !filters.endDate) {
      return this._formatAggregates(filters.groupBy);
    }

    // Filter calls based on criteria
    let filteredCalls = this.calls;

    if (filters.provider) {
      filteredCalls = filteredCalls.filter(call => call.provider === filters.provider);
    }

    if (filters.project) {
      filteredCalls = filteredCalls.filter(call => call.projectId === filters.project);
    }

    if (filters.role) {
      filteredCalls = filteredCalls.filter(call => call.role === filters.role);
    }

    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      filteredCalls = filteredCalls.filter(call => call.timestamp >= startDate);
    }

    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      filteredCalls = filteredCalls.filter(call => call.timestamp <= endDate);
    }

    // Calculate metrics from filtered calls
    return this._calculateMetrics(filteredCalls, filters.groupBy);
  }

  /**
   * Format aggregate data based on groupBy option
   * @private
   * @param {string} groupBy - Grouping option
   * @returns {Object} Formatted aggregates
   */
  _formatAggregates(groupBy) {
    if (!groupBy || groupBy === 'none') {
      return {
        total: this.aggregates.total,
        byProvider: this.aggregates.byProvider,
        byProject: this.aggregates.byProject,
        byRole: this.aggregates.byRole
      };
    }

    if (groupBy === 'provider') {
      return {
        total: this.aggregates.total,
        breakdown: this.aggregates.byProvider
      };
    }

    if (groupBy === 'project') {
      return {
        total: this.aggregates.total,
        breakdown: this.aggregates.byProject
      };
    }

    if (groupBy === 'role') {
      return {
        total: this.aggregates.total,
        breakdown: this.aggregates.byRole
      };
    }

    return this.aggregates;
  }

  /**
   * Calculate metrics from filtered calls
   * @private
   * @param {Array} calls - Filtered call records
   * @param {string} groupBy - Grouping option
   * @returns {Object} Calculated metrics
   */
  _calculateMetrics(calls, groupBy) {
    const metrics = {
      total: {
        calls: calls.length,
        tokens: { input: 0, output: 0, total: 0 },
        cost: 0
      }
    };

    // Calculate totals
    for (const call of calls) {
      metrics.total.tokens.input += call.tokens.input;
      metrics.total.tokens.output += call.tokens.output;
      metrics.total.tokens.total += call.tokens.total;
      metrics.total.cost += call.cost;
    }

    // Group by if specified
    if (groupBy && groupBy !== 'none') {
      metrics.breakdown = {};

      for (const call of calls) {
        const key = call[groupBy === 'project' ? 'projectId' : groupBy];
        
        if (!metrics.breakdown[key]) {
          metrics.breakdown[key] = {
            calls: 0,
            tokens: { input: 0, output: 0, total: 0 },
            cost: 0
          };
        }

        const group = metrics.breakdown[key];
        group.calls++;
        group.tokens.input += call.tokens.input;
        group.tokens.output += call.tokens.output;
        group.tokens.total += call.tokens.total;
        group.cost += call.cost;
      }
    }

    return metrics;
  }

  /**
   * Get detailed call history
   * @param {Object} filters - Filter options (same as getCosts)
   * @param {number} limit - Maximum number of records to return
   * @param {number} offset - Number of records to skip
   * @returns {Object} Call history with pagination
   */
  getCallHistory(filters = {}, limit = 100, offset = 0) {
    let filteredCalls = this.calls;

    // Apply filters
    if (filters.provider) {
      filteredCalls = filteredCalls.filter(call => call.provider === filters.provider);
    }
    if (filters.project) {
      filteredCalls = filteredCalls.filter(call => call.projectId === filters.project);
    }
    if (filters.role) {
      filteredCalls = filteredCalls.filter(call => call.role === filters.role);
    }
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      filteredCalls = filteredCalls.filter(call => call.timestamp >= startDate);
    }
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      filteredCalls = filteredCalls.filter(call => call.timestamp <= endDate);
    }

    // Sort by timestamp (most recent first)
    filteredCalls.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    const total = filteredCalls.length;
    const paginatedCalls = filteredCalls.slice(offset, offset + limit);

    return {
      calls: paginatedCalls,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    };
  }

  /**
   * Get cost summary statistics
   * @returns {Object} Summary statistics
   */
  getSummary() {
    const summary = {
      total: this.aggregates.total,
      topProviders: this._getTopN(this.aggregates.byProvider, 5, 'cost'),
      topProjects: this._getTopN(this.aggregates.byProject, 5, 'cost'),
      topRoles: this._getTopN(this.aggregates.byRole, 5, 'cost'),
      averageCostPerCall: this.aggregates.total.calls > 0 
        ? this.aggregates.total.cost / this.aggregates.total.calls 
        : 0,
      averageTokensPerCall: this.aggregates.total.calls > 0
        ? this.aggregates.total.tokens.total / this.aggregates.total.calls
        : 0
    };

    return summary;
  }

  /**
   * Get top N items by a metric
   * @private
   * @param {Object} aggregates - Aggregate data
   * @param {number} n - Number of items to return
   * @param {string} metric - Metric to sort by (cost, calls, tokens)
   * @returns {Array} Top N items
   */
  _getTopN(aggregates, n, metric) {
    const items = Object.entries(aggregates).map(([key, value]) => ({
      name: key,
      ...value
    }));

    // Sort by metric
    if (metric === 'tokens') {
      items.sort((a, b) => b.tokens.total - a.tokens.total);
    } else {
      items.sort((a, b) => b[metric] - a[metric]);
    }

    return items.slice(0, n);
  }

  /**
   * Reset all cost tracking data
   */
  reset() {
    this.calls = [];
    this.aggregates = {
      byProvider: {},
      byProject: {},
      byRole: {},
      total: {
        calls: 0,
        tokens: { input: 0, output: 0, total: 0 },
        cost: 0
      }
    };
  }

  /**
   * Export cost data as JSON
   * @param {Object} filters - Filter options
   * @returns {string} JSON string
   */
  export(filters = {}) {
    const data = {
      summary: this.getSummary(),
      costs: this.getCosts(filters),
      exportedAt: new Date().toISOString()
    };

    return JSON.stringify(data, null, 2);
  }
}

// Create singleton instance
const costTracker = new CostTracker();

module.exports = costTracker;
module.exports.CostTracker = CostTracker;
