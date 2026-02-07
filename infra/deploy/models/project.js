const { PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLES, DatabaseError, dbUtils } = require('./db');

class Project {
  constructor(data) {
    this.orgId = data.orgId;
    this.projectId = data.projectId || dbUtils.generateId();
    this.name = data.name;
    this.specJson = data.specJson || {};
    this.owner = data.owner;
    this.createdAt = data.createdAt || dbUtils.getCurrentTimestamp();
    this.updatedAt = data.updatedAt || dbUtils.getCurrentTimestamp();
    this.status = data.status || 'draft'; // 'draft' | 'building' | 'deployed' | 'failed'
    this.latestBuildId = data.latestBuildId || null;
    this.deploymentEndpoints = data.deploymentEndpoints || [];
    this.visibility = data.visibility || 'private'; // 'private' | 'organization' | 'public'
    this.members = data.members || []; // Array of { userId, role, addedAt, updatedAt }
  }

  // Generate composite primary key
  get PK() {
    return `${this.orgId}#${this.projectId}`;
  }

  // Convert to DynamoDB item
  toDynamoItem() {
    return {
      PK: this.PK,
      orgId: this.orgId,
      projectId: this.projectId,
      name: this.name,
      specJson: this.specJson,
      owner: this.owner,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      status: this.status,
      latestBuildId: this.latestBuildId,
      deploymentEndpoints: this.deploymentEndpoints,
      visibility: this.visibility,
      members: this.members
    };
  }

  // Create project in database
  async save() {
    try {
      this.updatedAt = dbUtils.getCurrentTimestamp();
      
      const command = new PutCommand({
        TableName: TABLES.PROJECTS,
        Item: this.toDynamoItem(),
        ConditionExpression: 'attribute_not_exists(PK)' // Prevent overwriting existing projects
      });

      await docClient.send(command);
      return this;
    } catch (error) {
      dbUtils.handleError(error, 'Project.save');
    }
  }

  // Check if user has access to project
  hasAccess(userId, requiredRole = null) {
    // Owner always has access
    if (this.owner === userId) return true;
    
    // Check visibility
    if (this.visibility === 'public') return true;
    
    // For private and organization visibility, check membership
    const member = this.members.find(m => m.userId === userId);
    if (!member) return false;
    
    if (requiredRole) {
      const roleHierarchy = { viewer: 1, dev: 2, admin: 3 };
      const userRoleLevel = roleHierarchy[member.role] || 0;
      const requiredRoleLevel = roleHierarchy[requiredRole] || 0;
      return userRoleLevel >= requiredRoleLevel;
    }
    
    return true;
  }

  // Add member to project
  addMember(userId, role = 'viewer') {
    const existingIndex = this.members.findIndex(m => m.userId === userId);
    if (existingIndex >= 0) {
      this.members[existingIndex].role = role;
      this.members[existingIndex].updatedAt = dbUtils.getCurrentTimestamp();
    } else {
      this.members.push({
        userId,
        role,
        addedAt: dbUtils.getCurrentTimestamp(),
        updatedAt: dbUtils.getCurrentTimestamp()
      });
    }
  }

  // Remove member from project
  removeMember(userId) {
    this.members = this.members.filter(m => m.userId !== userId);
  }

  // Get member role
  getMemberRole(userId) {
    const member = this.members.find(m => m.userId === userId);
    return member ? member.role : null;
  }

  // Check if user is project member
  hasMember(userId, role = null) {
    const member = this.members.find(m => m.userId === userId);
    if (!member) return false;
    if (role) return member.role === role;
    return true;
  }

  // Share project with user
  async shareWith(userId, role = 'viewer') {
    this.addMember(userId, role);
    return this.update({ members: this.members });
  }

  // Unshare project from user
  async unshareFrom(userId) {
    this.removeMember(userId);
    return this.update({ members: this.members });
  }

  // Update project in database
  async update(updates) {
    try {
      const allowedUpdates = ['name', 'specJson', 'status', 'latestBuildId', 'deploymentEndpoints', 'visibility', 'members'];
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

      // Always update the updatedAt timestamp
      updateExpression.push('#updatedAt = :updatedAt');
      expressionAttributeNames['#updatedAt'] = 'updatedAt';
      expressionAttributeValues[':updatedAt'] = dbUtils.getCurrentTimestamp();
      this.updatedAt = expressionAttributeValues[':updatedAt'];

      const command = new UpdateCommand({
        TableName: TABLES.PROJECTS,
        Key: { PK: this.PK },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: 'attribute_exists(PK)', // Ensure project exists
        ReturnValues: 'ALL_NEW'
      });

      const result = await docClient.send(command);
      return Project.fromDynamoItem(result.Attributes);
    } catch (error) {
      dbUtils.handleError(error, 'Project.update');
    }
  }

  // Static methods for querying
  static async findById(orgId, projectId) {
    try {
      const command = new GetCommand({
        TableName: TABLES.PROJECTS,
        Key: { PK: `${orgId}#${projectId}` }
      });

      const result = await docClient.send(command);
      return result.Item ? Project.fromDynamoItem(result.Item) : null;
    } catch (error) {
      dbUtils.handleError(error, 'Project.findById');
    }
  }

  static async findByOrganization(orgId, limit = 50) {
    try {
      const command = new QueryCommand({
        TableName: TABLES.PROJECTS,
        KeyConditionExpression: 'begins_with(PK, :orgPrefix)',
        ExpressionAttributeValues: {
          ':orgPrefix': `${orgId}#`
        },
        Limit: limit,
        ScanIndexForward: false // Most recent first
      });

      const result = await docClient.send(command);
      return result.Items ? result.Items.map(item => Project.fromDynamoItem(item)) : [];
    } catch (error) {
      dbUtils.handleError(error, 'Project.findByOrganization');
    }
  }

  static async findByOwner(owner, limit = 50) {
    try {
      // This would require a GSI on owner field
      const command = new QueryCommand({
        TableName: TABLES.PROJECTS,
        IndexName: 'OwnerIndex', // GSI name
        KeyConditionExpression: '#owner = :owner',
        ExpressionAttributeNames: {
          '#owner': 'owner'
        },
        ExpressionAttributeValues: {
          ':owner': owner
        },
        Limit: limit,
        ScanIndexForward: false
      });

      const result = await docClient.send(command);
      return result.Items ? result.Items.map(item => Project.fromDynamoItem(item)) : [];
    } catch (error) {
      // If GSI doesn't exist, fall back to scan (not recommended for production)
      console.warn('OwnerIndex GSI not found, falling back to scan');
      return [];
    }
  }

  static async delete(orgId, projectId) {
    try {
      const command = new DeleteCommand({
        TableName: TABLES.PROJECTS,
        Key: { PK: `${orgId}#${projectId}` },
        ConditionExpression: 'attribute_exists(PK)'
      });

      await docClient.send(command);
      return true;
    } catch (error) {
      dbUtils.handleError(error, 'Project.delete');
    }
  }

  // Create Project instance from DynamoDB item
  static fromDynamoItem(item) {
    return new Project({
      orgId: item.orgId,
      projectId: item.projectId,
      name: item.name,
      specJson: item.specJson,
      owner: item.owner,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      status: item.status,
      latestBuildId: item.latestBuildId,
      deploymentEndpoints: item.deploymentEndpoints,
      visibility: item.visibility,
      members: item.members || []
    });
  }
}

module.exports = Project;