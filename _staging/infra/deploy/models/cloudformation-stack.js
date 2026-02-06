const { PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLES, DatabaseError, dbUtils } = require('./db');

class CloudFormationStack {
  constructor(data) {
    this.id = data.id || dbUtils.generateId();
    this.userId = data.userId;
    this.stackName = data.stackName;
    this.region = data.region;
    this.roleArn = data.roleArn;
    this.bucketName = data.bucketName;
    this.githubOwner = data.githubOwner;
    this.githubRepo = data.githubRepo;
    this.createdAt = data.createdAt || dbUtils.getCurrentTimestamp();
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
      stackName: this.stackName,
      region: this.region,
      roleArn: this.roleArn,
      bucketName: this.bucketName,
      githubOwner: this.githubOwner,
      githubRepo: this.githubRepo,
      createdAt: this.createdAt
    };
  }

  // Create stack record in database
  async save() {
    try {
      const command = new PutCommand({
        TableName: TABLES.CLOUDFORMATION_STACKS,
        Item: this.toDynamoItem(),
        ConditionExpression: 'attribute_not_exists(PK)' // Prevent overwriting existing stacks
      });

      await docClient.send(command);
      return this;
    } catch (error) {
      dbUtils.handleError(error, 'CloudFormationStack.save');
    }
  }

  // Update stack record
  async update(updates) {
    try {
      const allowedUpdates = [
        'stackName', 'region', 'roleArn', 'bucketName', 
        'githubOwner', 'githubRepo'
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
        TableName: TABLES.CLOUDFORMATION_STACKS,
        Key: { PK: this.PK },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: 'attribute_exists(PK)', // Ensure stack exists
        ReturnValues: 'ALL_NEW'
      });

      const result = await docClient.send(command);
      return CloudFormationStack.fromDynamoItem(result.Attributes);
    } catch (error) {
      dbUtils.handleError(error, 'CloudFormationStack.update');
    }
  }

  // Static methods for querying
  static async findById(id) {
    try {
      const command = new GetCommand({
        TableName: TABLES.CLOUDFORMATION_STACKS,
        Key: { PK: id }
      });

      const result = await docClient.send(command);
      return result.Item ? CloudFormationStack.fromDynamoItem(result.Item) : null;
    } catch (error) {
      dbUtils.handleError(error, 'CloudFormationStack.findById');
    }
  }

  static async findByUserId(userId, limit = 50) {
    try {
      const command = new QueryCommand({
        TableName: TABLES.CLOUDFORMATION_STACKS,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        },
        Limit: limit
      });

      const result = await docClient.send(command);
      return result.Items ? result.Items.map(item => CloudFormationStack.fromDynamoItem(item)) : [];
    } catch (error) {
      console.warn('UserIdIndex GSI not found');
      return [];
    }
  }

  static async findByGitHubRepo(githubOwner, githubRepo) {
    try {
      const command = new QueryCommand({
        TableName: TABLES.CLOUDFORMATION_STACKS,
        IndexName: 'GitHubRepoIndex',
        KeyConditionExpression: 'githubOwner = :owner AND githubRepo = :repo',
        ExpressionAttributeValues: {
          ':owner': githubOwner,
          ':repo': githubRepo
        }
      });

      const result = await docClient.send(command);
      return result.Items && result.Items.length > 0 ? CloudFormationStack.fromDynamoItem(result.Items[0]) : null;
    } catch (error) {
      console.warn('GitHubRepoIndex GSI not found');
      return null;
    }
  }

  static async delete(id) {
    try {
      const command = new DeleteCommand({
        TableName: TABLES.CLOUDFORMATION_STACKS,
        Key: { PK: id },
        ConditionExpression: 'attribute_exists(PK)'
      });

      await docClient.send(command);
      return true;
    } catch (error) {
      dbUtils.handleError(error, 'CloudFormationStack.delete');
    }
  }

  // Create CloudFormationStack instance from DynamoDB item
  static fromDynamoItem(item) {
    return new CloudFormationStack({
      id: item.id,
      userId: item.userId,
      stackName: item.stackName,
      region: item.region,
      roleArn: item.roleArn,
      bucketName: item.bucketName,
      githubOwner: item.githubOwner,
      githubRepo: item.githubRepo,
      createdAt: item.createdAt
    });
  }
}

module.exports = CloudFormationStack;
