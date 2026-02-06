const { PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLES, DatabaseError, dbUtils } = require('./db');

class Deployment {
  constructor(data) {
    this.id = data.id || dbUtils.generateId();
    this.userId = data.userId;
    this.projectId = data.projectId;
    this.repoUrl = data.repoUrl;
    this.repoFullName = data.repoFullName;
    this.commitSha = data.commitSha;
    this.status = data.status || 'pending'; // pending, in_progress, success, failed
    this.createdAt = data.createdAt || dbUtils.getCurrentTimestamp();
    this.deployedAt = data.deployedAt || null;
  }

  // Primary key is id
  get PK() {
    return this.id;
  }

  // Convert to DynamoDB item
  toDynamoItem() {
    return {
      PK: this.PK,
      id: this.id,
      userId: this.userId,
      projectId: this.projectId,
      repoUrl: this.repoUrl,
      repoFullName: this.repoFullName,
      commitSha: this.commitSha,
      status: this.status,
      createdAt: this.createdAt,
      deployedAt: this.deployedAt
    };
  }

  // Create deployment record in database
  async save() {
    try {
      const command = new PutCommand({
        TableName: TABLES.DEPLOYMENTS,
        Item: this.toDynamoItem(),
        ConditionExpression: 'attribute_not_exists(PK)' // Prevent overwriting existing deployments
      });

      await docClient.send(command);
      return this;
    } catch (error) {
      dbUtils.handleError(error, 'Deployment.save');
    }
  }

  // Update deployment record
  async update(updates) {
    try {
      const allowedUpdates = [
        'repoUrl', 'repoFullName', 'commitSha', 'status', 'deployedAt'
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
        TableName: TABLES.DEPLOYMENTS,
        Key: { PK: this.PK },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: 'attribute_exists(PK)', // Ensure deployment exists
        ReturnValues: 'ALL_NEW'
      });

      const result = await docClient.send(command);
      return Deployment.fromDynamoItem(result.Attributes);
    } catch (error) {
      dbUtils.handleError(error, 'Deployment.update');
    }
  }

  // Update deployment status
  async updateStatus(status, deployedAt = null) {
    const updates = { status };
    if (deployedAt) {
      updates.deployedAt = deployedAt;
    } else if (status === 'success') {
      updates.deployedAt = dbUtils.getCurrentTimestamp();
    }
    return this.update(updates);
  }

  // Static methods for querying
  static async findById(id) {
    try {
      const command = new GetCommand({
        TableName: TABLES.DEPLOYMENTS,
        Key: { PK: id }
      });

      const result = await docClient.send(command);
      return result.Item ? Deployment.fromDynamoItem(result.Item) : null;
    } catch (error) {
      dbUtils.handleError(error, 'Deployment.findById');
    }
  }

  static async findByUserId(userId, limit = 50) {
    try {
      const command = new QueryCommand({
        TableName: TABLES.DEPLOYMENTS,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        },
        Limit: limit,
        ScanIndexForward: false // Most recent first
      });

      const result = await docClient.send(command);
      return result.Items ? result.Items.map(item => Deployment.fromDynamoItem(item)) : [];
    } catch (error) {
      console.warn('UserIdIndex GSI not found');
      return [];
    }
  }

  static async findByProjectId(projectId, limit = 50) {
    try {
      const command = new QueryCommand({
        TableName: TABLES.DEPLOYMENTS,
        IndexName: 'ProjectIdIndex',
        KeyConditionExpression: 'projectId = :projectId',
        ExpressionAttributeValues: {
          ':projectId': projectId
        },
        Limit: limit,
        ScanIndexForward: false // Most recent first
      });

      const result = await docClient.send(command);
      return result.Items ? result.Items.map(item => Deployment.fromDynamoItem(item)) : [];
    } catch (error) {
      console.warn('ProjectIdIndex GSI not found');
      return [];
    }
  }

  static async findByStatus(status, limit = 50) {
    try {
      const command = new QueryCommand({
        TableName: TABLES.DEPLOYMENTS,
        IndexName: 'StatusIndex',
        KeyConditionExpression: 'status = :status',
        ExpressionAttributeValues: {
          ':status': status
        },
        Limit: limit
      });

      const result = await docClient.send(command);
      return result.Items ? result.Items.map(item => Deployment.fromDynamoItem(item)) : [];
    } catch (error) {
      console.warn('StatusIndex GSI not found');
      return [];
    }
  }

  static async findByRepoAndCommit(repoFullName, commitSha) {
    try {
      const command = new ScanCommand({
        TableName: TABLES.DEPLOYMENTS,
        FilterExpression: 'repoFullName = :repoFullName AND commitSha = :commitSha',
        ExpressionAttributeValues: {
          ':repoFullName': repoFullName,
          ':commitSha': commitSha
        }
      });

      const result = await docClient.send(command);
      return result.Items ? result.Items.map(item => Deployment.fromDynamoItem(item)) : [];
    } catch (error) {
      console.warn('Error finding deployment by repo and commit:', error);
      return [];
    }
  }

  static async delete(id) {
    try {
      const command = new DeleteCommand({
        TableName: TABLES.DEPLOYMENTS,
        Key: { PK: id },
        ConditionExpression: 'attribute_exists(PK)'
      });

      await docClient.send(command);
      return true;
    } catch (error) {
      dbUtils.handleError(error, 'Deployment.delete');
    }
  }

  // Create Deployment instance from DynamoDB item
  static fromDynamoItem(item) {
    return new Deployment({
      id: item.id,
      userId: item.userId,
      projectId: item.projectId,
      repoUrl: item.repoUrl,
      repoFullName: item.repoFullName,
      commitSha: item.commitSha,
      status: item.status,
      createdAt: item.createdAt,
      deployedAt: item.deployedAt
    });
  }
}

module.exports = Deployment;
