/**
 * LLM Call Log Model
 * Tracks all LLM API calls for cost tracking, monitoring, and analytics
 */

// Check if Sequelize is available and properly configured
let LLMCallLog;

try {
  const { DataTypes } = require('sequelize');
  const { Sequelize } = require('sequelize');
  
  // Create a simple in-memory SQLite database for development
  const sequelize = new Sequelize('sqlite::memory:', {
    logging: false
  });

  LLMCallLog = sequelize.define('LLMCallLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  
  // Provider information
  provider: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'LLM provider name (openrouter, deepseek, huggingface, demo)'
  },
  
  model: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Specific model used'
  },
  
  // Agent role
  role: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Agent role (coder, planner, debugger, etc.)'
  },
  
  // Token usage
  promptTokens: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Number of tokens in the prompt'
  },
  
  completionTokens: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Number of tokens in the completion'
  },
  
  totalTokens: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Total tokens used'
  },
  
  // Cost tracking
  cost: {
    type: DataTypes.DECIMAL(10, 6),
    defaultValue: 0,
    comment: 'Cost in USD'
  },
  
  // Performance metrics
  latency: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Response latency in milliseconds'
  },
  
  // Success tracking
  success: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Whether the call succeeded'
  },
  
  error: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Error message if call failed'
  },
  
  // Context
  userId: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'User who initiated the call'
  },
  
  projectId: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'Project associated with the call'
  },
  
  jobId: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'Job associated with the call'
  },
  
  correlationId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Correlation ID for tracking related calls'
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {},
    comment: 'Additional metadata about the call'
  },
  
  // Timestamps
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: 'When the call was made'
  }
}, {
  tableName: 'llm_call_logs',
  timestamps: true,
  indexes: [
    { fields: ['provider'] },
    { fields: ['model'] },
    { fields: ['role'] },
    { fields: ['userId'] },
    { fields: ['projectId'] },
    { fields: ['jobId'] },
    { fields: ['correlationId'] },
    { fields: ['timestamp'] },
    { fields: ['success'] }
  ]
});

/**
 * Log an LLM call
 * @param {Object} callData - Call data to log
 * @returns {Promise<LLMCallLog>}
 */
LLMCallLog.logCall = async function(callData) {
  return await this.create({
    provider: callData.provider,
    model: callData.model,
    role: callData.role,
    promptTokens: callData.promptTokens || 0,
    completionTokens: callData.completionTokens || 0,
    totalTokens: callData.totalTokens || callData.tokens || 0,
    cost: callData.cost || 0,
    latency: callData.latency || 0,
    success: callData.success !== false,
    error: callData.error || null,
    userId: callData.userId || null,
    projectId: callData.projectId || null,
    jobId: callData.jobId || null,
    correlationId: callData.correlationId || null,
    metadata: callData.metadata || {},
    timestamp: callData.timestamp || new Date()
  });
};

/**
 * Get cost summary for a user
 * @param {string} userId - User ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>}
 */
LLMCallLog.getCostSummary = async function(userId, startDate, endDate) {
  const { Op, fn, col } = require('sequelize');
  
  const where = { userId };
  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) where.timestamp[Op.gte] = startDate;
    if (endDate) where.timestamp[Op.lte] = endDate;
  }
  
  const result = await this.findOne({
    where,
    attributes: [
      [fn('SUM', col('cost')), 'totalCost'],
      [fn('SUM', col('totalTokens')), 'totalTokens'],
      [fn('COUNT', col('id')), 'totalCalls'],
      [fn('AVG', col('latency')), 'avgLatency']
    ],
    raw: true
  });
  
  return {
    totalCost: parseFloat(result.totalCost || 0),
    totalTokens: parseInt(result.totalTokens || 0),
    totalCalls: parseInt(result.totalCalls || 0),
    avgLatency: parseFloat(result.avgLatency || 0)
  };
};

/**
 * Get cost breakdown by provider
 * @param {string} userId - User ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>}
 */
LLMCallLog.getCostByProvider = async function(userId, startDate, endDate) {
  const { Op, fn, col } = require('sequelize');
  
  const where = { userId };
  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) where.timestamp[Op.gte] = startDate;
    if (endDate) where.timestamp[Op.lte] = endDate;
  }
  
  const results = await this.findAll({
    where,
    attributes: [
      'provider',
      [fn('SUM', col('cost')), 'totalCost'],
      [fn('SUM', col('totalTokens')), 'totalTokens'],
      [fn('COUNT', col('id')), 'totalCalls']
    ],
    group: ['provider'],
    raw: true
  });
  
  return results.map(r => ({
    provider: r.provider,
    totalCost: parseFloat(r.totalCost || 0),
    totalTokens: parseInt(r.totalTokens || 0),
    totalCalls: parseInt(r.totalCalls || 0)
  }));
};

/**
 * Get recent calls for a user
 * @param {string} userId - User ID
 * @param {number} limit - Number of calls to return
 * @returns {Promise<Array>}
 */
LLMCallLog.getRecentCalls = async function(userId, limit = 50) {
  return await this.findAll({
    where: { userId },
    order: [['timestamp', 'DESC']],
    limit
  });
};

/**
 * Get performance metrics by provider
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>}
 */
LLMCallLog.getPerformanceMetrics = async function(startDate, endDate) {
  const { Op, fn, col } = require('sequelize');
  
  const where = {};
  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) where.timestamp[Op.gte] = startDate;
    if (endDate) where.timestamp[Op.lte] = endDate;
  }
  
  const results = await this.findAll({
    where,
    attributes: [
      'provider',
      [fn('AVG', col('latency')), 'avgLatency'],
      [fn('MIN', col('latency')), 'minLatency'],
      [fn('MAX', col('latency')), 'maxLatency'],
      [fn('COUNT', col('id')), 'totalCalls'],
      [fn('SUM', fn('CASE', fn('WHEN', col('success'), 1), 0)), 'successfulCalls']
    ],
    group: ['provider'],
    raw: true
  });
  
  return results.map(r => ({
    provider: r.provider,
    avgLatency: parseFloat(r.avgLatency || 0),
    minLatency: parseInt(r.minLatency || 0),
    maxLatency: parseInt(r.maxLatency || 0),
    totalCalls: parseInt(r.totalCalls || 0),
    successfulCalls: parseInt(r.successfulCalls || 0),
    successRate: r.totalCalls > 0 ? r.successfulCalls / r.totalCalls : 0
  }));
};

  // Initialize the database
  sequelize.sync({ force: false }).catch(console.error);

} catch (error) {
  console.warn('LLMCallLog: Sequelize not available, using mock implementation');
  
  // Mock implementation for when Sequelize is not available
  LLMCallLog = {
    logCall: async (callData) => {
      console.log('LLMCallLog (mock):', callData);
      return { id: Date.now() };
    },
    getCostSummary: async () => ({ totalCost: 0, totalCalls: 0 }),
    getCostByProvider: async () => [],
    getRecentCalls: async () => [],
    getPerformanceMetrics: async () => []
  };
}

module.exports = LLMCallLog;
