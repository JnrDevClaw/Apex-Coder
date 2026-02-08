const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

// DynamoDB Client Configuration
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.DYNAMODB_ENDPOINT || undefined, // For local development
  credentials: process.env.AWS_ACCESS_KEY_ID ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  } : undefined
});

// Document client for easier operations
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    convertEmptyValues: false,
    removeUndefinedValues: true,
    convertClassInstanceToMap: false
  },
  unmarshallOptions: {
    wrapNumbers: false
  }
});

// Table names from environment or defaults
const TABLES = {
  PROJECTS: process.env.PROJECTS_TABLE || 'ai-app-builder-projects',
  BUILDS: process.env.BUILDS_TABLE || 'ai-app-builder-builds',
  USERS: process.env.USERS_TABLE || 'ai-app-builder-users',
  ORGANIZATIONS: process.env.ORGANIZATIONS_TABLE || 'ai-app-builder-organizations',
  AUDIT_LOGS: process.env.AUDIT_LOGS_TABLE || 'ai-app-builder-audit-logs',
  CLOUDFORMATION_STACKS: process.env.CLOUDFORMATION_STACKS_TABLE || 'ai-app-builder-cloudformation-stacks',
  DEPLOYMENTS: process.env.DEPLOYMENTS_TABLE || 'ai-app-builder-deployments'
};

// Error handling utility
class DatabaseError extends Error {
  constructor(message, code, originalError) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
    this.originalError = originalError;
  }
}

// Common database operations
const dbUtils = {
  handleError(error, operation) {
    console.error(`Database error in ${operation}:`, error);
    
    if (error.name === 'ResourceNotFoundException') {
      throw new DatabaseError(`Table not found during ${operation}`, 'TABLE_NOT_FOUND', error);
    }
    
    if (error.name === 'ConditionalCheckFailedException') {
      throw new DatabaseError(`Conditional check failed during ${operation}`, 'CONDITION_FAILED', error);
    }
    
    if (error.name === 'ValidationException') {
      throw new DatabaseError(`Validation error during ${operation}`, 'VALIDATION_ERROR', error);
    }
    
    throw new DatabaseError(`Unknown error during ${operation}`, 'UNKNOWN_ERROR', error);
  },

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  getCurrentTimestamp() {
    return new Date().toISOString();
  }
};

module.exports = {
  client,
  docClient,
  TABLES,
  DatabaseError,
  dbUtils
};