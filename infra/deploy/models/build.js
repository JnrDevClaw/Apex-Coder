const { PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLES, DatabaseError, dbUtils } = require('./db');

class Build {
  constructor(data) {
    this.projectId = data.projectId;
    this.buildId = data.buildId || dbUtils.generateId();
    this.status = data.status || 'queued'; // 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
    this.phase = data.phase || null; // 'planning' | 'generation' | 'testing' | 'deployment'
    this.startedAt = data.startedAt || dbUtils.getCurrentTimestamp();
    this.completedAt = data.completedAt || null;
    this.logsS3Url = data.logsS3Url || null;
    this.artifactsS3Url = data.artifactsS3Url || null;
    this.attempts = data.attempts || 1;
    this.selfFixIterations = data.selfFixIterations || 0;
    this.deploymentId = data.deploymentId || null;
    this.errorMessage = data.errorMessage || null;
    this.buildOptions = data.buildOptions || { runTests: true, deploy: false };
    this.specJson = data.specJson || {};
    this.orgId = data.orgId; // For access control
    this.progress = data.progress || {}; // Track progress per phase
    
    // Detailed phase tracking
    this.phaseDetails = data.phaseDetails || {
      planning: { status: 'pending', startedAt: null, completedAt: null, artifacts: null },
      generation: { status: 'pending', startedAt: null, completedAt: null, artifacts: null },
      testing: { status: 'pending', startedAt: null, completedAt: null, artifacts: null },
      deployment: { status: 'pending', startedAt: null, completedAt: null, artifacts: null }
    };
    
    // Build metrics
    this.metrics = data.metrics || {
      duration: null,
      tokensUsed: 0,
      cost: 0,
      filesGenerated: 0,
      linesOfCode: 0
    };

    // Stage tracking for orchestration pipeline (Requirements 7.1-7.5)
    this.currentStage = data.currentStage || 0;
    this.stageStatuses = data.stageStatuses || {}; // { 'clarifier': 'completed', 'normalizer': 'running', ... }
    this.artifacts = data.artifacts || {}; // { 'clarifier': {...}, 'normalizer': {...}, ... }
    this.failedAt = data.failedAt || null; // 'stage-1', 'stage-2', etc.
    this.errorLogs = data.errorLogs || []; // Array of error log entries
  }

  // Generate composite primary key
  get PK() {
    return `${this.projectId}#${this.buildId}`;
  }

  // Convert to DynamoDB item
  toDynamoItem() {
    return {
      PK: this.PK,
      projectId: this.projectId,
      buildId: this.buildId,
      status: this.status,
      phase: this.phase,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      logsS3Url: this.logsS3Url,
      artifactsS3Url: this.artifactsS3Url,
      attempts: this.attempts,
      selfFixIterations: this.selfFixIterations,
      deploymentId: this.deploymentId,
      errorMessage: this.errorMessage,
      buildOptions: this.buildOptions,
      specJson: this.specJson,
      orgId: this.orgId,
      progress: this.progress,
      phaseDetails: this.phaseDetails,
      metrics: this.metrics,
      currentStage: this.currentStage,
      stageStatuses: this.stageStatuses,
      artifacts: this.artifacts,
      failedAt: this.failedAt,
      errorLogs: this.errorLogs
    };
  }

  // Create build in database
  async save() {
    try {
      const command = new PutCommand({
        TableName: TABLES.BUILDS,
        Item: this.toDynamoItem(),
        ConditionExpression: 'attribute_not_exists(PK)' // Prevent overwriting existing builds
      });

      await docClient.send(command);
      return this;
    } catch (error) {
      dbUtils.handleError(error, 'Build.save');
    }
  }

  // Update build status and other fields
  async update(updates) {
    try {
      const allowedUpdates = [
        'status', 'phase', 'completedAt', 'logsS3Url', 'artifactsS3Url', 
        'attempts', 'selfFixIterations', 'deploymentId', 'errorMessage', 'progress',
        'phaseDetails', 'metrics', 'currentStage', 'stageStatuses', 'artifacts',
        'failedAt', 'errorLogs'
      ];
      const updateExpression = [];
      const expressionAttributeNames = {};
      const expressionAttributeValues = {};

      // Build update expression
      Object.keys(updates).forEach(key => {
        if (allowedUpdates.includes(key)) {
          updateExpression.push(`#${key} = :${key}`);
          expressionAttributeNames[`#${key}`] = key;
          expressionAttributeValues[`:${key}`] = updates[key];
          this[key] = updates[key];
        }
      });

      if (updateExpression.length === 0) {
        throw new DatabaseError('No valid fields to update', 'NO_UPDATES');
      }

      const command = new UpdateCommand({
        TableName: TABLES.BUILDS,
        Key: { PK: this.PK },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: 'attribute_exists(PK)', // Ensure build exists
        ReturnValues: 'ALL_NEW'
      });

      const result = await docClient.send(command);
      return Build.fromDynamoItem(result.Attributes);
    } catch (error) {
      dbUtils.handleError(error, 'Build.update');
    }
  }

  // Mark build as completed
  async markCompleted(success = true, artifactsUrl = null, errorMessage = null) {
    const updates = {
      status: success ? 'completed' : 'failed',
      completedAt: dbUtils.getCurrentTimestamp()
    };

    if (artifactsUrl) {
      updates.artifactsS3Url = artifactsUrl;
    }

    if (errorMessage) {
      updates.errorMessage = errorMessage;
    }

    return this.update(updates);
  }

  // Increment self-fix iteration
  async incrementSelfFixIteration() {
    return this.update({
      selfFixIterations: this.selfFixIterations + 1
    });
  }

  // Update phase status
  async updatePhaseStatus(phaseName, status, data = {}) {
    const phaseDetails = { ...this.phaseDetails };
    
    if (!phaseDetails[phaseName]) {
      phaseDetails[phaseName] = {};
    }

    phaseDetails[phaseName].status = status;

    if (status === 'running' && !phaseDetails[phaseName].startedAt) {
      phaseDetails[phaseName].startedAt = dbUtils.getCurrentTimestamp();
    }

    if (status === 'completed' || status === 'failed') {
      phaseDetails[phaseName].completedAt = dbUtils.getCurrentTimestamp();
    }

    if (data.artifacts) {
      phaseDetails[phaseName].artifacts = data.artifacts;
    }

    if (data.error) {
      phaseDetails[phaseName].error = data.error;
    }

    return this.update({ phaseDetails });
  }

  // Update build metrics
  async updateMetrics(metricsUpdate) {
    const metrics = { ...this.metrics, ...metricsUpdate };
    
    // Calculate duration if build is completed
    if (this.completedAt && this.startedAt) {
      const start = new Date(this.startedAt);
      const end = new Date(this.completedAt);
      metrics.duration = end - start;
    }

    return this.update({ metrics });
  }

  /**
   * Update stage status (Requirements 7.1-7.5)
   * @param {string} stageName - Stage name (e.g., 'clarifier', 'normalizer')
   * @param {string} status - Status ('running', 'completed', 'failed')
   * @param {Object} metadata - Additional metadata (artifacts, error, etc.)
   * @returns {Promise<Build>} Updated build
   */
  async updateStageStatus(stageName, status, metadata = {}) {
    const stageStatuses = { ...this.stageStatuses };
    
    stageStatuses[stageName] = {
      status,
      updatedAt: dbUtils.getCurrentTimestamp(),
      ...metadata
    };

    return this.update({ stageStatuses });
  }

  /**
   * Store stage artifacts (Requirements 7.4, 8.1-8.10)
   * @param {string} stageName - Stage name
   * @param {Object} artifacts - Artifacts to store
   * @returns {Promise<Build>} Updated build
   */
  async storeStageArtifacts(stageName, artifacts) {
    const allArtifacts = { ...this.artifacts };
    
    allArtifacts[stageName] = {
      ...artifacts,
      storedAt: dbUtils.getCurrentTimestamp()
    };

    return this.update({ artifacts: allArtifacts });
  }

  /**
   * Get stage artifacts (Requirements 5.3)
   * @param {string} stageName - Stage name
   * @returns {Object|null} Stage artifacts or null if not found
   */
  getStageArtifacts(stageName) {
    return this.artifacts[stageName] || null;
  }

  /**
   * Log error for a stage (Requirements 7.3, 7.4, 7.5)
   * @param {string} stageName - Stage name
   * @param {number} stageNumber - Stage number
   * @param {Error|string} error - Error object or message
   * @param {Object} context - Additional context
   * @returns {Promise<Build>} Updated build
   */
  async logStageError(stageName, stageNumber, error, context = {}) {
    const errorLogs = [...this.errorLogs];
    
    const errorEntry = {
      stage: stageName,
      stageNumber,
      timestamp: dbUtils.getCurrentTimestamp(),
      message: error.message || error.toString(),
      stack: error.stack || null,
      context,
      attempt: context.attempt || 1
    };

    errorLogs.push(errorEntry);

    // Update failedAt if this is a final failure
    const updates = { errorLogs };
    
    if (context.isFinalFailure) {
      updates.failedAt = `stage-${stageNumber}`;
      updates.status = 'failed';
      updates.errorMessage = errorEntry.message;
    }

    return this.update(updates);
  }

  /**
   * Mark build as failed at a specific stage (Requirements 7.3, 7.5)
   * @param {number} stageNumber - Stage number where failure occurred
   * @param {string} stageName - Stage name
   * @param {string} errorMessage - Error message
   * @returns {Promise<Build>} Updated build
   */
  async markFailedAtStage(stageNumber, stageName, errorMessage) {
    return this.update({
      status: 'failed',
      failedAt: `stage-${stageNumber}`,
      errorMessage,
      completedAt: dbUtils.getCurrentTimestamp()
    });
  }

  // Get build summary
  getSummary() {
    return {
      buildId: this.buildId,
      projectId: this.projectId,
      status: this.status,
      phase: this.phase,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      duration: this.metrics.duration,
      phaseDetails: this.phaseDetails,
      metrics: this.metrics,
      errorMessage: this.errorMessage
    };
  }

  // Static methods for querying
  static async findById(projectId, buildId) {
    try {
      const command = new GetCommand({
        TableName: TABLES.BUILDS,
        Key: { PK: `${projectId}#${buildId}` }
      });

      const result = await docClient.send(command);
      return result.Item ? Build.fromDynamoItem(result.Item) : null;
    } catch (error) {
      dbUtils.handleError(error, 'Build.findById');
    }
  }

  static async findByProject(projectId, limit = 50) {
    try {
      const command = new QueryCommand({
        TableName: TABLES.BUILDS,
        KeyConditionExpression: 'begins_with(PK, :projectPrefix)',
        ExpressionAttributeValues: {
          ':projectPrefix': `${projectId}#`
        },
        Limit: limit,
        ScanIndexForward: false // Most recent first
      });

      const result = await docClient.send(command);
      return result.Items ? result.Items.map(item => Build.fromDynamoItem(item)) : [];
    } catch (error) {
      dbUtils.handleError(error, 'Build.findByProject');
    }
  }

  // Find build by buildId only (scans table - use sparingly)
  static async findByIdGlobal(buildId) {
    try {
      // This is inefficient but works without knowing projectId
      // In production, you'd want a GSI on buildId
      const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
      
      const command = new ScanCommand({
        TableName: TABLES.BUILDS,
        FilterExpression: 'buildId = :buildId',
        ExpressionAttributeValues: {
          ':buildId': buildId
        },
        Limit: 1
      });

      const result = await docClient.send(command);
      return result.Items && result.Items.length > 0 
        ? Build.fromDynamoItem(result.Items[0]) 
        : null;
    } catch (error) {
      dbUtils.handleError(error, 'Build.findByIdGlobal');
    }
  }

  static async findByStatus(status, limit = 50) {
    try {
      // This would require a GSI on status field
      const command = new QueryCommand({
        TableName: TABLES.BUILDS,
        IndexName: 'StatusIndex', // GSI name
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': status
        },
        Limit: limit,
        ScanIndexForward: false
      });

      const result = await docClient.send(command);
      return result.Items ? result.Items.map(item => Build.fromDynamoItem(item)) : [];
    } catch (error) {
      // If GSI doesn't exist, return empty array
      console.warn('StatusIndex GSI not found');
      return [];
    }
  }

  static async delete(projectId, buildId) {
    try {
      const command = new DeleteCommand({
        TableName: TABLES.BUILDS,
        Key: { PK: `${projectId}#${buildId}` },
        ConditionExpression: 'attribute_exists(PK)'
      });

      await docClient.send(command);
      return true;
    } catch (error) {
      dbUtils.handleError(error, 'Build.delete');
    }
  }

  // Get build history with pagination
  static async getBuildHistory(projectId, options = {}) {
    try {
      const { limit = 20, lastEvaluatedKey = null } = options;

      const command = new QueryCommand({
        TableName: TABLES.BUILDS,
        KeyConditionExpression: 'begins_with(PK, :projectPrefix)',
        ExpressionAttributeValues: {
          ':projectPrefix': `${projectId}#`
        },
        Limit: limit,
        ScanIndexForward: false, // Most recent first
        ExclusiveStartKey: lastEvaluatedKey
      });

      const result = await docClient.send(command);
      
      return {
        builds: result.Items ? result.Items.map(item => Build.fromDynamoItem(item)) : [],
        lastEvaluatedKey: result.LastEvaluatedKey,
        hasMore: !!result.LastEvaluatedKey
      };
    } catch (error) {
      dbUtils.handleError(error, 'Build.getBuildHistory');
    }
  }

  // Compare two builds
  static async compareBuilds(projectId, buildId1, buildId2) {
    try {
      const build1 = await Build.findById(projectId, buildId1);
      const build2 = await Build.findById(projectId, buildId2);

      if (!build1 || !build2) {
        throw new DatabaseError('One or both builds not found', 'NOT_FOUND');
      }

      return {
        build1: build1.getSummary(),
        build2: build2.getSummary(),
        comparison: {
          durationDiff: (build1.metrics.duration || 0) - (build2.metrics.duration || 0),
          costDiff: (build1.metrics.cost || 0) - (build2.metrics.cost || 0),
          filesGeneratedDiff: (build1.metrics.filesGenerated || 0) - (build2.metrics.filesGenerated || 0),
          statusChanged: build1.status !== build2.status,
          phasesCompleted: {
            build1: Object.values(build1.phaseDetails).filter(p => p.status === 'completed').length,
            build2: Object.values(build2.phaseDetails).filter(p => p.status === 'completed').length
          }
        }
      };
    } catch (error) {
      dbUtils.handleError(error, 'Build.compareBuilds');
    }
  }

  // Get build statistics for a project
  static async getProjectBuildStats(projectId) {
    try {
      const builds = await Build.findByProject(projectId, 100);

      const stats = {
        total: builds.length,
        completed: builds.filter(b => b.status === 'completed').length,
        failed: builds.filter(b => b.status === 'failed').length,
        running: builds.filter(b => b.status === 'running').length,
        cancelled: builds.filter(b => b.status === 'cancelled').length,
        averageDuration: 0,
        totalCost: 0,
        successRate: 0
      };

      if (stats.total > 0) {
        const completedBuilds = builds.filter(b => b.status === 'completed' && b.metrics.duration);
        if (completedBuilds.length > 0) {
          stats.averageDuration = completedBuilds.reduce((sum, b) => sum + (b.metrics.duration || 0), 0) / completedBuilds.length;
        }

        stats.totalCost = builds.reduce((sum, b) => sum + (b.metrics.cost || 0), 0);
        stats.successRate = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
      }

      return stats;
    } catch (error) {
      dbUtils.handleError(error, 'Build.getProjectBuildStats');
    }
  }

  // Create Build instance from DynamoDB item
  static fromDynamoItem(item) {
    return new Build({
      projectId: item.projectId,
      buildId: item.buildId,
      status: item.status,
      phase: item.phase,
      startedAt: item.startedAt,
      completedAt: item.completedAt,
      logsS3Url: item.logsS3Url,
      artifactsS3Url: item.artifactsS3Url,
      attempts: item.attempts,
      selfFixIterations: item.selfFixIterations,
      deploymentId: item.deploymentId,
      errorMessage: item.errorMessage,
      buildOptions: item.buildOptions,
      specJson: item.specJson,
      orgId: item.orgId,
      progress: item.progress || {},
      phaseDetails: item.phaseDetails || {
        planning: { status: 'pending', startedAt: null, completedAt: null, artifacts: null },
        generation: { status: 'pending', startedAt: null, completedAt: null, artifacts: null },
        testing: { status: 'pending', startedAt: null, completedAt: null, artifacts: null },
        deployment: { status: 'pending', startedAt: null, completedAt: null, artifacts: null }
      },
      metrics: item.metrics || {
        duration: null,
        tokensUsed: 0,
        cost: 0,
        filesGenerated: 0,
        linesOfCode: 0
      },
      currentStage: item.currentStage || 0,
      stageStatuses: item.stageStatuses || {},
      artifacts: item.artifacts || {},
      failedAt: item.failedAt || null,
      errorLogs: item.errorLogs || []
    });
  }
}

module.exports = Build;