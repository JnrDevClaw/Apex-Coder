const { PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLES, DatabaseError, dbUtils } = require('./db');

class Organization {
  constructor(data) {
    this.orgId = data.orgId || dbUtils.generateId();
    this.name = data.name;
    this.description = data.description || '';
    this.owner = data.owner; // userId of the owner
    this.createdAt = data.createdAt || dbUtils.getCurrentTimestamp();
    this.updatedAt = data.updatedAt || dbUtils.getCurrentTimestamp();
    this.isActive = data.isActive !== undefined ? data.isActive : true;
    this.members = data.members || []; // Array of { userId, role, addedAt }
    this.settings = data.settings || {
      allowPublicProjects: false,
      defaultProjectVisibility: 'private',
      maxProjects: 100
    };
  }

  // Primary key is orgId
  get PK() {
    return this.orgId;
  }

  // Convert to DynamoDB item
  toDynamoItem() {
    return {
      PK: this.PK,
      orgId: this.orgId,
      name: this.name,
      description: this.description,
      owner: this.owner,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isActive: this.isActive,
      members: this.members,
      settings: this.settings
    };
  }

  // Check if user is a member with specific role
  hasMember(userId, role = null) {
    const member = this.members.find(m => m.userId === userId);
    if (!member) return false;
    if (role) return member.role === role;
    return true;
  }

  // Add member to organization
  addMember(userId, role = 'viewer') {
    const existingIndex = this.members.findIndex(m => m.userId === userId);
    if (existingIndex >= 0) {
      this.members[existingIndex].role = role;
    } else {
      this.members.push({
        userId,
        role,
        addedAt: dbUtils.getCurrentTimestamp()
      });
    }
  }

  // Remove member from organization
  removeMember(userId) {
    this.members = this.members.filter(m => m.userId !== userId);
  }

  // Get member role
  getMemberRole(userId) {
    const member = this.members.find(m => m.userId === userId);
    return member ? member.role : null;
  }

  // Check if user is owner
  isOwner(userId) {
    return this.owner === userId;
  }

  // Check if user has admin privileges (owner or admin role)
  hasAdminAccess(userId) {
    return this.isOwner(userId) || this.hasMember(userId, 'admin');
  }

  // Create organization in database
  async save() {
    try {
      this.updatedAt = dbUtils.getCurrentTimestamp();
      
      // Add owner as admin member
      if (!this.hasMember(this.owner)) {
        this.addMember(this.owner, 'admin');
      }
      
      const command = new PutCommand({
        TableName: TABLES.ORGANIZATIONS,
        Item: this.toDynamoItem(),
        ConditionExpression: 'attribute_not_exists(PK)' // Prevent overwriting existing organizations
      });

      await docClient.send(command);
      return this;
    } catch (error) {
      dbUtils.handleError(error, 'Organization.save');
    }
  }

  // Update organization in database
  async update(updates) {
    try {
      const allowedUpdates = [
        'name', 'description', 'isActive', 'members', 'settings'
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

      // Always update the updatedAt timestamp
      updateExpression.push('#updatedAt = :updatedAt');
      expressionAttributeNames['#updatedAt'] = 'updatedAt';
      expressionAttributeValues[':updatedAt'] = dbUtils.getCurrentTimestamp();
      this.updatedAt = expressionAttributeValues[':updatedAt'];

      const command = new UpdateCommand({
        TableName: TABLES.ORGANIZATIONS,
        Key: { PK: this.PK },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: 'attribute_exists(PK)', // Ensure organization exists
        ReturnValues: 'ALL_NEW'
      });

      const result = await docClient.send(command);
      return Organization.fromDynamoItem(result.Attributes);
    } catch (error) {
      dbUtils.handleError(error, 'Organization.update');
    }
  }

  // Static methods for querying
  static async findById(orgId) {
    try {
      const command = new GetCommand({
        TableName: TABLES.ORGANIZATIONS,
        Key: { PK: orgId }
      });

      const result = await docClient.send(command);
      return result.Item ? Organization.fromDynamoItem(result.Item) : null;
    } catch (error) {
      dbUtils.handleError(error, 'Organization.findById');
    }
  }

  static async findByOwner(owner, limit = 50) {
    try {
      // This would require a GSI on owner field
      const command = new QueryCommand({
        TableName: TABLES.ORGANIZATIONS,
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
      return result.Items ? result.Items.map(item => Organization.fromDynamoItem(item)) : [];
    } catch (error) {
      // If GSI doesn't exist, return empty array
      console.warn('OwnerIndex GSI not found');
      return [];
    }
  }

  static async findByMember(userId, limit = 50) {
    try {
      // This would require a GSI on members field
      const command = new QueryCommand({
        TableName: TABLES.ORGANIZATIONS,
        IndexName: 'MemberIndex', // GSI name
        KeyConditionExpression: 'contains(members, :userId)',
        ExpressionAttributeValues: {
          ':userId': userId
        },
        Limit: limit
      });

      const result = await docClient.send(command);
      return result.Items ? result.Items.map(item => Organization.fromDynamoItem(item)) : [];
    } catch (error) {
      // If GSI doesn't exist, return empty array
      console.warn('MemberIndex GSI not found');
      return [];
    }
  }

  static async delete(orgId) {
    try {
      const command = new DeleteCommand({
        TableName: TABLES.ORGANIZATIONS,
        Key: { PK: orgId },
        ConditionExpression: 'attribute_exists(PK)'
      });

      await docClient.send(command);
      return true;
    } catch (error) {
      dbUtils.handleError(error, 'Organization.delete');
    }
  }

  // Create Organization instance from DynamoDB item
  static fromDynamoItem(item) {
    return new Organization({
      orgId: item.orgId,
      name: item.name,
      description: item.description,
      owner: item.owner,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      isActive: item.isActive,
      members: item.members,
      settings: item.settings
    });
  }
}

module.exports = Organization;