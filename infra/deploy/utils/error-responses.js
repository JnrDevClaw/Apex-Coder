/**
 * User-friendly error response utilities
 * Provides consistent, helpful error messages across all API endpoints
 */

/**
 * Error response templates with user-friendly messages and solutions
 */
const ERROR_TEMPLATES = {
  // Authentication errors
  AUTH_REQUIRED: {
    code: 401,
    error: 'Authentication Required',
    message: 'You need to be logged in to access this resource.',
    solution: 'Please log in and try again.'
  },
  AUTH_INVALID_TOKEN: {
    code: 401,
    error: 'Invalid Authentication',
    message: 'Your session has expired or is invalid.',
    solution: 'Please log in again to continue.'
  },
  AUTH_INSUFFICIENT_PERMISSIONS: {
    code: 403,
    error: 'Insufficient Permissions',
    message: 'You don\'t have permission to perform this action.',
    solution: 'Contact your organization administrator to request access.'
  },

  // GitHub errors
  GITHUB_NOT_CONNECTED: {
    code: 400,
    error: 'GitHub Not Connected',
    message: 'Your GitHub account is not connected.',
    solution: 'Please connect your GitHub account in Settings before proceeding.'
  },
  GITHUB_OAUTH_FAILED: {
    code: 400,
    error: 'GitHub Connection Failed',
    message: 'Failed to connect your GitHub account.',
    solution: 'Please try connecting again. If the problem persists, check that you\'ve authorized the required permissions.'
  },
  GITHUB_API_ERROR: {
    code: 500,
    error: 'GitHub API Error',
    message: 'Unable to communicate with GitHub.',
    solution: 'This is usually temporary. Please try again in a few moments.'
  },
  GITHUB_RATE_LIMIT: {
    code: 429,
    error: 'GitHub Rate Limit Exceeded',
    message: 'Too many requests to GitHub API.',
    solution: 'Please wait a few minutes before trying again.'
  },

  // AWS errors
  AWS_NOT_CONNECTED: {
    code: 400,
    error: 'AWS Not Connected',
    message: 'Your AWS credentials are not configured.',
    solution: 'Please connect your AWS account in Settings before proceeding.'
  },
  AWS_INVALID_CREDENTIALS: {
    code: 400,
    error: 'Invalid AWS Credentials',
    message: 'The AWS credentials you provided are invalid or expired.',
    solution: 'Please verify your credentials and try again. Make sure you\'re using temporary credentials with the correct permissions.'
  },
  AWS_INSUFFICIENT_PERMISSIONS: {
    code: 403,
    error: 'Insufficient AWS Permissions',
    message: 'Your AWS credentials don\'t have the required permissions.',
    solution: 'Ensure your IAM role has permissions for CloudFormation, S3, and IAM operations.'
  },
  AWS_REGION_ERROR: {
    code: 400,
    error: 'Invalid AWS Region',
    message: 'The specified AWS region is invalid or unavailable.',
    solution: 'Please select a valid AWS region (e.g., us-east-1, us-west-2).'
  },

  // CloudFormation errors
  CLOUDFORMATION_STACK_EXISTS: {
    code: 409,
    error: 'Stack Already Exists',
    message: 'A CloudFormation stack with this name already exists.',
    solution: 'Use a different stack name or delete the existing stack first.'
  },
  CLOUDFORMATION_CREATE_FAILED: {
    code: 500,
    error: 'Stack Creation Failed',
    message: 'Failed to create the CloudFormation stack.',
    solution: 'Check the AWS CloudFormation console for detailed error messages. Common issues include resource limits or permission problems.'
  },
  CLOUDFORMATION_TIMEOUT: {
    code: 504,
    error: 'Stack Creation Timeout',
    message: 'The CloudFormation stack creation took too long.',
    solution: 'Check the AWS CloudFormation console to see the current status. The stack may still be creating.'
  },

  // Project errors
  PROJECT_NOT_FOUND: {
    code: 404,
    error: 'Project Not Found',
    message: 'The requested project doesn\'t exist or you don\'t have access to it.',
    solution: 'Verify the project ID and ensure you have the necessary permissions.'
  },
  PROJECT_NAME_REQUIRED: {
    code: 400,
    error: 'Project Name Required',
    message: 'A project name is required.',
    solution: 'Please provide a name for your project.'
  },
  PROJECT_ALREADY_EXISTS: {
    code: 409,
    error: 'Project Already Exists',
    message: 'A project with this name already exists in your organization.',
    solution: 'Please choose a different name for your project.'
  },

  // Deployment errors
  DEPLOYMENT_NOT_FOUND: {
    code: 404,
    error: 'Deployment Not Found',
    message: 'The requested deployment doesn\'t exist.',
    solution: 'Verify the deployment ID and try again.'
  },
  DEPLOYMENT_ALREADY_IN_PROGRESS: {
    code: 409,
    error: 'Deployment In Progress',
    message: 'A deployment is already in progress for this project.',
    solution: 'Wait for the current deployment to complete before starting a new one.'
  },
  DEPLOYMENT_FAILED: {
    code: 500,
    error: 'Deployment Failed',
    message: 'The deployment process encountered an error.',
    solution: 'Check the deployment logs for details. Common issues include build failures or GitHub API errors.'
  },

  // Build errors
  BUILD_NOT_FOUND: {
    code: 404,
    error: 'Build Not Found',
    message: 'The requested build doesn\'t exist.',
    solution: 'Verify the build ID and try again.'
  },
  BUILD_FAILED: {
    code: 500,
    error: 'Build Failed',
    message: 'The build process encountered an error.',
    solution: 'Check the build logs for specific error messages. Common issues include syntax errors or missing dependencies.'
  },

  // Validation errors
  VALIDATION_ERROR: {
    code: 400,
    error: 'Validation Error',
    message: 'The provided data is invalid.',
    solution: 'Please check your input and try again.'
  },
  MISSING_REQUIRED_FIELD: {
    code: 400,
    error: 'Missing Required Field',
    message: 'One or more required fields are missing.',
    solution: 'Please provide all required information.'
  },

  // Service errors
  SERVICE_UNAVAILABLE: {
    code: 503,
    error: 'Service Temporarily Unavailable',
    message: 'The service is temporarily unavailable.',
    solution: 'Please try again in a few moments. If the problem persists, contact support.'
  },
  QUEUE_UNAVAILABLE: {
    code: 503,
    error: 'Job Queue Unavailable',
    message: 'The job queue service is not available.',
    solution: 'Please try again later. This is usually a temporary issue.'
  },
  DATABASE_ERROR: {
    code: 500,
    error: 'Database Error',
    message: 'A database error occurred.',
    solution: 'Please try again. If the problem persists, contact support.'
  },

  // Generic errors
  INTERNAL_ERROR: {
    code: 500,
    error: 'Internal Server Error',
    message: 'An unexpected error occurred.',
    solution: 'Please try again. If the problem persists, contact support with the error details.'
  },
  NOT_FOUND: {
    code: 404,
    error: 'Not Found',
    message: 'The requested resource was not found.',
    solution: 'Please check the URL and try again.'
  },
  BAD_REQUEST: {
    code: 400,
    error: 'Bad Request',
    message: 'The request could not be understood.',
    solution: 'Please check your request and try again.'
  }
};

/**
 * Create a user-friendly error response
 * @param {string} errorType - Error type from ERROR_TEMPLATES
 * @param {Object} options - Additional options
 * @param {string} options.details - Additional error details
 * @param {string} options.customMessage - Override default message
 * @param {string} options.customSolution - Override default solution
 * @param {Object} options.metadata - Additional metadata to include
 * @returns {Object} Error response object
 */
function createErrorResponse(errorType, options = {}) {
  const template = ERROR_TEMPLATES[errorType] || ERROR_TEMPLATES.INTERNAL_ERROR;
  
  const response = {
    success: false,
    error: template.error,
    message: options.customMessage || template.message,
    solution: options.customSolution || template.solution
  };

  if (options.details) {
    response.details = options.details;
  }

  if (options.metadata) {
    response.metadata = options.metadata;
  }

  return {
    code: template.code,
    body: response
  };
}

/**
 * Send a user-friendly error response
 * @param {Object} reply - Fastify reply object
 * @param {string} errorType - Error type from ERROR_TEMPLATES
 * @param {Object} options - Additional options
 */
function sendErrorResponse(reply, errorType, options = {}) {
  const { code, body } = createErrorResponse(errorType, options);
  return reply.code(code).send(body);
}

/**
 * Create error response from exception
 * @param {Error} error - Error object
 * @param {string} defaultType - Default error type if not matched
 * @returns {Object} Error response
 */
function createErrorFromException(error, defaultType = 'INTERNAL_ERROR') {
  const message = error.message || '';

  // Match common error patterns
  if (message.includes('not found') || message.includes('does not exist')) {
    return createErrorResponse('NOT_FOUND', { details: message });
  }
  
  if (message.includes('already exists')) {
    return createErrorResponse('PROJECT_ALREADY_EXISTS', { details: message });
  }

  if (message.includes('permission') || message.includes('access denied')) {
    return createErrorResponse('AUTH_INSUFFICIENT_PERMISSIONS', { details: message });
  }

  if (message.includes('GitHub')) {
    return createErrorResponse('GITHUB_API_ERROR', { details: message });
  }

  if (message.includes('AWS') || message.includes('credentials')) {
    return createErrorResponse('AWS_INVALID_CREDENTIALS', { details: message });
  }

  if (message.includes('validation') || message.includes('invalid')) {
    return createErrorResponse('VALIDATION_ERROR', { details: message });
  }

  if (message.includes('required')) {
    return createErrorResponse('MISSING_REQUIRED_FIELD', { details: message });
  }

  // Default error
  return createErrorResponse(defaultType, { details: message });
}

/**
 * Send error response from exception
 * @param {Object} reply - Fastify reply object
 * @param {Error} error - Error object
 * @param {string} defaultType - Default error type
 */
function sendErrorFromException(reply, error, defaultType = 'INTERNAL_ERROR') {
  const { code, body } = createErrorFromException(error, defaultType);
  return reply.code(code).send(body);
}

module.exports = {
  ERROR_TEMPLATES,
  createErrorResponse,
  sendErrorResponse,
  createErrorFromException,
  sendErrorFromException
};
