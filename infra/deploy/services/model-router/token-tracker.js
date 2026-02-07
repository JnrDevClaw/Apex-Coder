/**
 * Token Tracker Service
 * Tracks input and output token usage for AI model calls
 * Aggregates by provider, project, and role
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

class TokenTracker {
  constructor() {
    // In-memory storage for token data
    // In production, this should be persisted to a database
    this.records = [];
    this.aggregates = {
      byProvider: {},
      byProject: {},
      byRole: {},
      total: {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      }
    };
  }

  /**
   * Record token usage for an AI call
   * @param {Object} tokenData - Token usage information
   * @param {number} tokenData.inputTokens - Input tokens used
   * @param {number} tokenData.outputTokens - Output tokens generated
   * @param {string} tokenData.provider - Provider name
   * @param {string} tokenData.model - Model name
   * @param {string} tokenData.role - Agent role (optional)
   * @param {string} tokenData.projectId - Project ID (optional)
   * @param {string} tokenData.userId - User ID (optional)
   * @param {Date} tokenData.timestamp - Call timestamp (optional)
   * @param {string} tokenData.status - Call status (success/error)
   */
  recordTokens(tokenData) {
    // Validate required fields
    if (typeof tokenData.inputTokens !== 'number' || tokenData.inputTokens < 0) {
      throw new Error('Valid inputTokens is required (non-negative number)');
    }
    if (typeof tokenData.outputTokens !== 'number' || tokenData.outputTokens < 0) {
      throw new Error('Valid outputTokens is required (non-negative number)');
    }
    if (!tokenData.provider) {
      throw new Error('Provider is required');
    }
    if (!tokenData.model) {
      throw new Error('Model is required');
    }

    // Create token record
    const tokenRecord = {
      inputTokens: tokenData.inputTokens,
      outputTokens: tokenData.outputTokens,
      totalTokens: tokenData.inputTokens + tokenData.outputTokens,
      provider: tokenData.provider,
      model: tokenData.model,
      role: tokenData.role || 'unknown',
      projectId: tokenData.projectId || 'unknown',
      userId: tokenData.userId || 'unknown',
      status: tokenData.status || 'success',
      timestamp: tokenData.timestamp || new Date()
    };

    // Store token record
    this.records.push(tokenRecord);

    // Update aggregates
    this._updateAggregates(tokenRecord);

    return tokenRecord;
  }

  /**
   * Update aggregate statistics
   * @private
   * @param {Object} tokenRecord - Token record
   */
  _updateAggregates(tokenRecord) {
    // Update total aggregates
    this.aggregates.total.calls++;
    this.aggregates.total.inputTokens += tokenRecord.inputTokens;
    this.aggregates.total.outputTokens += tokenRecord.outputTokens;
    this.aggregates.total.totalTokens += tokenRecord.totalTokens;

    // Update provider aggregates
    if (!this.aggregates.byProvider[tokenRecord.provider]) {
      this.aggregates.byProvider[tokenRecord.provider] = {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        models: {}
      };
    }
    const providerAgg = this.aggregates.byProvider[tokenRecord.provider];
    providerAgg.calls++;
    providerAgg.inputTokens += tokenRecord.inputTokens;
    providerAgg.outputTokens += tokenRecord.outputTokens;
    providerAgg.totalTokens += tokenRecord.totalTokens;

    // Update model aggregates within provider
    if (!providerAgg.models[tokenRecord.model]) {
      providerAgg.models[tokenRecord.model] = {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      };
    }
    const modelAgg = providerAgg.models[tokenRecord.model];
    modelAgg.calls++;
    modelAgg.inputTokens += tokenRecord.inputTokens;
    modelAgg.outputTokens += tokenRecord.outputTokens;
    modelAgg.totalTokens += tokenRecord.totalTokens;

    // Update project aggregates
    if (!this.aggregates.byProject[tokenRecord.projectId]) {
      this.aggregates.byProject[tokenRecord.projectId] = {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        providers: {}
      };
    }
    const projectAgg = this.aggregates.byProject[tokenRecord.projectId];
    projectAgg.calls++;
    projectAgg.inputTokens += tokenRecord.inputTokens;
    projectAgg.outputTokens += tokenRecord.outputTokens;
    projectAgg.totalTokens += tokenRecord.totalTokens;

    // Update provider breakdown within project
    if (!projectAgg.providers[tokenRecord.provider]) {
      projectAgg.providers[tokenRecord.provider] = {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      };
    }
    const projectProviderAgg = projectAgg.providers[tokenRecord.provider];
    projectProviderAgg.calls++;
    projectProviderAgg.inputTokens += tokenRecord.inputTokens;
    projectProviderAgg.outputTokens += tokenRecord.outputTokens;
    projectProviderAgg.totalTokens += tokenRecord.totalTokens;

    // Update role aggregates
    if (!this.aggregates.byRole[tokenRecord.role]) {
      this.aggregates.byRole[tokenRecord.role] = {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        providers: {}
      };
    }
    const roleAgg = this.aggregates.byRole[tokenRecord.role];
    roleAgg.calls++;
    roleAgg.inputTokens += tokenRecord.inputTokens;
    roleAgg.outputTokens += tokenRecord.outputTokens;
    roleAgg.totalTokens += tokenRecord.totalTokens;

    // Update provider breakdown within role
    if (!roleAgg.providers[tokenRecord.provider]) {
      roleAgg.providers[tokenRecord.provider] = {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      };
    }
    const roleProviderAgg = roleAgg.providers[tokenRecord.provider];
    roleProviderAgg.calls++;
    roleProviderAgg.inputTokens += tokenRecord.inputTokens;
    roleProviderAgg.outputTokens += tokenRecord.outputTokens;
    roleProviderAgg.totalTokens += tokenRecord.totalTokens;
  }

  /**
   * Get token usage metrics with optional filters
   * @param {Object} filters - Filter options
   * @param {string} filters.provider - Filter by provider
   * @param {string} filters.project - Filter by project ID
   * @param {string} filters.role - Filter by agent role
   * @param {string} filters.userId - Filter by user ID
   * @param {Date} filters.startDate - Filter by start date
   * @param {Date} filters.endDate - Filter by end date
   * @param {string} filters.groupBy - Group results by 'provider', 'project', 'role', or 'none'
   * @returns {Object} Token usage metrics
   */
  getTokens(filters = {}) {
    // If no filters, return aggregates
    if (!filters.provider && !filters.project && !filters.role && !filters.userId && !filters.startDate && !filters.endDate) {
      return this._formatAggregates(filters.groupBy);
    }

    // Filter records based on criteria
    let filteredRecords = this.records;

    if (filters.provider) {
      filteredRecords = filteredRecords.filter(record => record.provider === filters.provider);
    }

    if (filters.project) {
      filteredRecords = filteredRecords.filter(record => record.projectId === filters.project);
    }

    if (filters.role) {
      filteredRecords = filteredRecords.filter(record => record.role === filters.role);
    }

    if (filters.userId) {
      filteredRecords = filteredRecords.filter(record => record.userId === filters.userId);
    }

    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      filteredRecords = filteredRecords.filter(record => record.timestamp >= startDate);
    }

    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      filteredRecords = filteredRecords.filter(record => record.timestamp <= endDate);
    }

    // Calculate metrics from filtered records
    return this._calculateMetrics(filteredRecords, filters.groupBy);
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
   * Calculate metrics from filtered records
   * @private
   * @param {Array} records - Filtered token records
   * @param {string} groupBy - Grouping option
   * @returns {Object} Calculated metrics
   */
  _calculateMetrics(records, groupBy) {
    const metrics = {
      total: {
        calls: records.length,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      }
    };

    // Calculate totals
    for (const record of records) {
      metrics.total.inputTokens += record.inputTokens;
      metrics.total.outputTokens += record.outputTokens;
      metrics.total.totalTokens += record.totalTokens;
    }

    // Group by if specified
    if (groupBy && groupBy !== 'none') {
      metrics.breakdown = {};

      for (const record of records) {
        const key = record[groupBy === 'project' ? 'projectId' : groupBy];
        
        if (!metrics.breakdown[key]) {
          metrics.breakdown[key] = {
            calls: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0
          };
        }

        const group = metrics.breakdown[key];
        group.calls++;
        group.inputTokens += record.inputTokens;
        group.outputTokens += record.outputTokens;
        group.totalTokens += record.totalTokens;
      }
    }

    return metrics;
  }

  /**
   * Get detailed token usage history
   * @param {Object} filters - Filter options (same as getTokens)
   * @param {number} limit - Maximum number of records to return
   * @param {number} offset - Number of records to skip
   * @returns {Object} Token usage history with pagination
   */
  getTokenHistory(filters = {}, limit = 100, offset = 0) {
    let filteredRecords = this.records;

    // Apply filters
    if (filters.provider) {
      filteredRecords = filteredRecords.filter(record => record.provider === filters.provider);
    }
    if (filters.project) {
      filteredRecords = filteredRecords.filter(record => record.projectId === filters.project);
    }
    if (filters.role) {
      filteredRecords = filteredRecords.filter(record => record.role === filters.role);
    }
    if (filters.userId) {
      filteredRecords = filteredRecords.filter(record => record.userId === filters.userId);
    }
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      filteredRecords = filteredRecords.filter(record => record.timestamp >= startDate);
    }
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      filteredRecords = filteredRecords.filter(record => record.timestamp <= endDate);
    }

    // Sort by timestamp (most recent first)
    filteredRecords.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    const total = filteredRecords.length;
    const paginatedRecords = filteredRecords.slice(offset, offset + limit);

    return {
      records: paginatedRecords,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    };
  }

  /**
   * Get token usage summary statistics
   * @returns {Object} Summary statistics
   */
  getSummary() {
    const summary = {
      total: this.aggregates.total,
      topProviders: this._getTopN(this.aggregates.byProvider, 5, 'totalTokens'),
      topProjects: this._getTopN(this.aggregates.byProject, 5, 'totalTokens'),
      topRoles: this._getTopN(this.aggregates.byRole, 5, 'totalTokens'),
      averageInputTokensPerCall: this.aggregates.total.calls > 0 
        ? this.aggregates.total.inputTokens / this.aggregates.total.calls 
        : 0,
      averageOutputTokensPerCall: this.aggregates.total.calls > 0
        ? this.aggregates.total.outputTokens / this.aggregates.total.calls
        : 0,
      averageTotalTokensPerCall: this.aggregates.total.calls > 0
        ? this.aggregates.total.totalTokens / this.aggregates.total.calls
        : 0,
      inputOutputRatio: this.aggregates.total.outputTokens > 0
        ? this.aggregates.total.inputTokens / this.aggregates.total.outputTokens
        : 0
    };

    return summary;
  }

  /**
   * Get top N items by a metric
   * @private
   * @param {Object} aggregates - Aggregate data
   * @param {number} n - Number of items to return
   * @param {string} metric - Metric to sort by (inputTokens, outputTokens, totalTokens, calls)
   * @returns {Array} Top N items
   */
  _getTopN(aggregates, n, metric) {
    const items = Object.entries(aggregates).map(([key, value]) => ({
      name: key,
      ...value
    }));

    // Sort by metric
    items.sort((a, b) => b[metric] - a[metric]);

    return items.slice(0, n);
  }

  /**
   * Get token usage by time period
   * @param {string} period - Time period ('hour', 'day', 'week', 'month')
   * @param {Object} filters - Additional filters
   * @returns {Object} Token usage grouped by time period
   */
  getTokensByTimePeriod(period = 'day', filters = {}) {
    let filteredRecords = this.records;

    // Apply filters
    if (filters.provider) {
      filteredRecords = filteredRecords.filter(record => record.provider === filters.provider);
    }
    if (filters.project) {
      filteredRecords = filteredRecords.filter(record => record.projectId === filters.project);
    }
    if (filters.role) {
      filteredRecords = filteredRecords.filter(record => record.role === filters.role);
    }
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      filteredRecords = filteredRecords.filter(record => record.timestamp >= startDate);
    }
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      filteredRecords = filteredRecords.filter(record => record.timestamp <= endDate);
    }

    // Group by time period
    const grouped = {};

    for (const record of filteredRecords) {
      const key = this._getTimePeriodKey(record.timestamp, period);
      
      if (!grouped[key]) {
        grouped[key] = {
          period: key,
          calls: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0
        };
      }

      grouped[key].calls++;
      grouped[key].inputTokens += record.inputTokens;
      grouped[key].outputTokens += record.outputTokens;
      grouped[key].totalTokens += record.totalTokens;
    }

    // Convert to array and sort by period
    const result = Object.values(grouped).sort((a, b) => 
      a.period.localeCompare(b.period)
    );

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
   * Reset all token tracking data
   */
  reset() {
    this.records = [];
    this.aggregates = {
      byProvider: {},
      byProject: {},
      byRole: {},
      total: {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      }
    };
  }

  /**
   * Export token data as JSON
   * @param {Object} filters - Filter options
   * @returns {string} JSON string
   */
  export(filters = {}) {
    const data = {
      summary: this.getSummary(),
      tokens: this.getTokens(filters),
      exportedAt: new Date().toISOString()
    };

    return JSON.stringify(data, null, 2);
  }
}

// Create singleton instance
const tokenTracker = new TokenTracker();

module.exports = tokenTracker;
module.exports.TokenTracker = TokenTracker;
