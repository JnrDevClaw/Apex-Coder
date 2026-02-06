const { PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLES, DatabaseError, dbUtils } = require('./db');

class User {
  constructor(data) {
    this.userId = data.userId || dbUtils.generateId();
    this.email = data.email;
    this.passwordHash = data.passwordHash; // Will be hashed before storage
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.createdAt = data.createdAt || dbUtils.getCurrentTimestamp();
    this.updatedAt = data.updatedAt || dbUtils.getCurrentTimestamp();
    this.lastLoginAt = data.lastLoginAt || null;
    this.isActive = data.isActive !== undefined ? data.isActive : true;
    this.emailVerified = data.emailVerified || false;
    this.organizations = data.organizations || []; // Array of { orgId, role }
    
    // GitHub OAuth fields
    this.githubToken = data.githubToken || null;
    this.githubUsername = data.githubUsername || null;
    this.githubConnectedAt = data.githubConnectedAt || null;
    
    // AWS credentials fields
    this.awsAccessKey = data.awsAccessKey || null;
    this.awsSecretKey = data.awsSecretKey || null;
    this.awsSessionToken = data.awsSessionToken || null;
    this.awsRegion = data.awsRegion || null;
    this.awsAccountId = data.awsAccountId || null;
    this.awsConnectedAt = data.awsConnectedAt || null;
  }

  // Primary key is userId
  get PK() {
    return this.userId;
  }

  // Convert to DynamoDB item
  toDynamoItem() {
    return {
      PK: this.PK,
      userId: this.userId,
      email: this.email,
      passwordHash: this.passwordHash,
      firstName: this.firstName,
      lastName: this.lastName,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastLoginAt: this.lastLoginAt,
      isActive: this.isActive,
      emailVerified: this.emailVerified,
      organizations: this.organizations,
      githubToken: this.githubToken,
      githubUsername: this.githubUsername,
      githubConnectedAt: this.githubConnectedAt,
      awsAccessKey: this.awsAccessKey,
      awsSecretKey: this.awsSecretKey,
      awsSessionToken: this.awsSessionToken,
      awsRegion: this.awsRegion,
      awsAccountId: this.awsAccountId,
      awsConnectedAt: this.awsConnectedAt
    };
  }

  // Get full name
  get fullName() {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  // Check if user belongs to organization with specific role
  hasOrganizationRole(orgId, role = null) {
    const membership = this.organizations.find(org => org.orgId === orgId);
    if (!membership) return false;
    if (role) return membership.role === role;
    return true;
  }

  // Add organization membership
  addOrganization(orgId, role = 'viewer') {
    const existingIndex = this.organizations.findIndex(org => org.orgId === orgId);
    if (existingIndex >= 0) {
      this.organizations[existingIndex].role = role;
    } else {
      this.organizations.push({ orgId, role });
    }
  }

  // Remove organization membership
  removeOrganization(orgId) {
    this.organizations = this.organizations.filter(org => org.orgId !== orgId);
  }

  // Create user in database
  async save() {
    try {
      this.updatedAt = dbUtils.getCurrentTimestamp();
      
      const command = new PutCommand({
        TableName: TABLES.USERS,
        Item: this.toDynamoItem(),
        ConditionExpression: 'attribute_not_exists(PK)' // Prevent overwriting existing users
      });

      await docClient.send(command);
      return this;
    } catch (error) {
      dbUtils.handleError(error, 'User.save');
    }
  }

  // Update user in database
  async update(updates) {
    try {
      const allowedUpdates = [
        'firstName', 'lastName', 'lastLoginAt', 'isActive', 
        'emailVerified', 'organizations', 'passwordHash',
        'githubToken', 'githubUsername', 'githubConnectedAt',
        'awsAccessKey', 'awsSecretKey', 'awsSessionToken', 
        'awsRegion', 'awsAccountId', 'awsConnectedAt'
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
        TableName: TABLES.USERS,
        Key: { PK: this.PK },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: 'attribute_exists(PK)', // Ensure user exists
        ReturnValues: 'ALL_NEW'
      });

      const result = await docClient.send(command);
      return User.fromDynamoItem(result.Attributes);
    } catch (error) {
      dbUtils.handleError(error, 'User.update');
    }
  }

  // Update last login timestamp
  async updateLastLogin() {
    return this.update({
      lastLoginAt: dbUtils.getCurrentTimestamp()
    });
  }

  // Static methods for querying
  static async findById(userId) {
    try {
      const command = new GetCommand({
        TableName: TABLES.USERS,
        Key: { PK: userId }
      });

      const result = await docClient.send(command);
      return result.Item ? User.fromDynamoItem(result.Item) : null;
    } catch (error) {
      dbUtils.handleError(error, 'User.findById');
    }
  }

  static async findByEmail(email) {
    try {
      // This would require a GSI on email field
      const command = new QueryCommand({
        TableName: TABLES.USERS,
        IndexName: 'EmailIndex', // GSI name
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': email
        }
      });

      const result = await docClient.send(command);
      return result.Items && result.Items.length > 0 ? User.fromDynamoItem(result.Items[0]) : null;
    } catch (error) {
      // If GSI doesn't exist, return null
      console.warn('EmailIndex GSI not found');
      return null;
    }
  }

  static async findByOrganization(orgId, limit = 50) {
    try {
      // This would require a GSI on organizations field
      const command = new QueryCommand({
        TableName: TABLES.USERS,
        IndexName: 'OrganizationIndex', // GSI name
        KeyConditionExpression: 'contains(organizations, :orgId)',
        ExpressionAttributeValues: {
          ':orgId': orgId
        },
        Limit: limit
      });

      const result = await docClient.send(command);
      return result.Items ? result.Items.map(item => User.fromDynamoItem(item)) : [];
    } catch (error) {
      // If GSI doesn't exist, return empty array
      console.warn('OrganizationIndex GSI not found');
      return [];
    }
  }

  static async delete(userId) {
    try {
      const command = new DeleteCommand({
        TableName: TABLES.USERS,
        Key: { PK: userId },
        ConditionExpression: 'attribute_exists(PK)'
      });

      await docClient.send(command);
      return true;
    } catch (error) {
      dbUtils.handleError(error, 'User.delete');
    }
  }

  // Create User instance from DynamoDB item
  static fromDynamoItem(item) {
    return new User({
      userId: item.userId,
      email: item.email,
      passwordHash: item.passwordHash,
      firstName: item.firstName,
      lastName: item.lastName,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      lastLoginAt: item.lastLoginAt,
      isActive: item.isActive,
      emailVerified: item.emailVerified,
      organizations: item.organizations,
      githubToken: item.githubToken,
      githubUsername: item.githubUsername,
      githubConnectedAt: item.githubConnectedAt,
      awsAccessKey: item.awsAccessKey,
      awsSecretKey: item.awsSecretKey,
      awsSessionToken: item.awsSessionToken,
      awsRegion: item.awsRegion,
      awsAccountId: item.awsAccountId,
      awsConnectedAt: item.awsConnectedAt
    });
  }
}

module.exports = User;