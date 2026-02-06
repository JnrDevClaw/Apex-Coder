/**
 * Deployment-specific error logging service
 * Provides structured error logging for deployment automation operations
 */

const structuredLogger = require('./structured-logger');
const auditLogger = require('./audit-logger');

/**
 * Log deployment-related errors with full context
 */
function logDeploymentError(operation, error, context = {}) {
  const errorDetails = {
    operation,
    error: error.message,
    stack: error.stack,
    userId: context.userId,
    projectId: context.projectId,
    deploymentId: context.deploymentId,
    buildId: context.buildId,
    repoUrl: context.repoUrl,
    commitSha: context.commitSha,
    ...context
  };

  structuredLogger.error(`Deployment error: ${operation}`, errorDetails, {
    userId: context.userId,
    operation,
    details: errorDetails
  });

  return errorDetails;
}

/**
 * Log GitHub operation errors
 */
function logGitHubError(operation, error, context = {}) {
  const errorDetails = {
    operation,
    error: error.message,
    stack: error.stack,
    userId: context.userId,
    repoOwner: context.repoOwner,
    repoName: context.repoName,
    githubUsername: context.githubUsername,
    ...context
  };

  structuredLogger.error(`GitHub error: ${operation}`, errorDetails, {
    userId: context.userId,
    operation,
    details: errorDetails
  });

  return errorDetails;
}

/**
 * Log AWS operation errors
 */
function logAWSError(operation, error, context = {}) {
  const errorDetails = {
    operation,
    error: error.message,
    stack: error.stack,
    userId: context.userId,
    region: context.region,
    stackName: context.stackName,
    roleArn: context.roleArn,
    awsErrorCode: error.code,
    awsRequestId: error.requestId,
    ...context
  };

  structuredLogger.error(`AWS error: ${operation}`, errorDetails, {
    userId: context.userId,
    operation,
    details: errorDetails
  });

  return errorDetails;
}

/**
 * Log CloudFormation operation errors
 */
function logCloudFormationError(operation, error, context = {}) {
  const errorDetails = {
    operation,
    error: error.message,
    stack: error.stack,
    userId: context.userId,
    stackName: context.stackName,
    stackId: context.stackId,
    region: context.region,
    status: context.status,
    statusReason: context.statusReason,
    ...context
  };

  structuredLogger.error(`CloudFormation error: ${operation}`, errorDetails, {
    userId: context.userId,
    operation,
    details: errorDetails
  });

  return errorDetails;
}

/**
 * Log worker/job execution errors
 */
function logWorkerError(operation, error, context = {}) {
  const errorDetails = {
    operation,
    error: error.message,
    stack: error.stack,
    jobId: context.jobId,
    queueName: context.queueName,
    workerId: context.workerId,
    projectId: context.projectId,
    buildId: context.buildId,
    attemptNumber: context.attemptNumber,
    ...context
  };

  structuredLogger.error(`Worker error: ${operation}`, errorDetails, {
    userId: context.userId,
    operation,
    details: errorDetails
  });

  return errorDetails;
}

/**
 * Log OAuth/authentication errors
 */
function logAuthError(operation, error, context = {}) {
  const errorDetails = {
    operation,
    error: error.message,
    stack: error.stack,
    userId: context.userId,
    provider: context.provider,
    authType: context.authType,
    ...context
  };

  structuredLogger.error(`Auth error: ${operation}`, errorDetails, {
    userId: context.userId,
    operation,
    details: errorDetails
  });

  return errorDetails;
}

/**
 * Log database operation errors
 */
function logDatabaseError(operation, error, context = {}) {
  const errorDetails = {
    operation,
    error: error.message,
    stack: error.stack,
    table: context.table,
    key: context.key,
    userId: context.userId,
    ...context
  };

  structuredLogger.error(`Database error: ${operation}`, errorDetails, {
    userId: context.userId,
    operation,
    details: errorDetails
  });

  return errorDetails;
}

/**
 * Log validation errors
 */
function logValidationError(operation, error, context = {}) {
  const errorDetails = {
    operation,
    error: error.message,
    validationErrors: context.validationErrors,
    userId: context.userId,
    input: context.input,
    ...context
  };

  structuredLogger.error(`Validation error: ${operation}`, errorDetails, {
    userId: context.userId,
    operation,
    details: errorDetails
  });

  return errorDetails;
}

/**
 * Log API/HTTP errors
 */
function logAPIError(operation, error, context = {}) {
  const errorDetails = {
    operation,
    error: error.message,
    stack: error.stack,
    statusCode: context.statusCode,
    method: context.method,
    url: context.url,
    userId: context.userId,
    ...context
  };

  structuredLogger.error(`API error: ${operation}`, errorDetails, {
    userId: context.userId,
    operation,
    details: errorDetails
  });

  return errorDetails;
}

/**
 * Log encryption/decryption errors
 */
function logEncryptionError(operation, error, context = {}) {
  const errorDetails = {
    operation,
    error: error.message,
    stack: error.stack,
    userId: context.userId,
    dataType: context.dataType,
    ...context
  };

  structuredLogger.error(`Encryption error: ${operation}`, errorDetails, {
    userId: context.userId,
    operation,
    details: errorDetails
  });

  return errorDetails;
}

/**
 * Log model/AI operation errors
 */
function logModelError(operation, error, context = {}) {
  const errorDetails = {
    operation,
    error: error.message,
    stack: error.stack,
    provider: context.provider,
    model: context.model,
    role: context.role,
    userId: context.userId,
    ...context
  };

  structuredLogger.error(`Model error: ${operation}`, errorDetails, {
    userId: context.userId,
    operation,
    details: errorDetails
  });

  return errorDetails;
}

module.exports = {
  logDeploymentError,
  logGitHubError,
  logAWSError,
  logCloudFormationError,
  logWorkerError,
  logAuthError,
  logDatabaseError,
  logValidationError,
  logAPIError,
  logEncryptionError,
  logModelError
};