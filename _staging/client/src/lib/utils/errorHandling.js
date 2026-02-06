/**
 * Error Handling Utilities
 * Centralized error handling and reporting functions
 * Requirements: 3.1, 3.2, 3.4
 */

import { showError, showPipelineError, showConnectionStatus } from '../stores/notifications.js';

/**
 * Error types for classification
 */
export const ErrorTypes = {
  NETWORK: 'network',
  VALIDATION: 'validation',
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  PIPELINE: 'pipeline',
  STAGE: 'stage',
  DEPLOYMENT: 'deployment',
  UNKNOWN: 'unknown'
};

/**
 * Error severity levels
 */
export const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Enhanced error class with additional context
 */
export class AppError extends Error {
  constructor(message, type = ErrorTypes.UNKNOWN, severity = ErrorSeverity.MEDIUM, context = {}) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.severity = severity;
    this.context = context;
    this.timestamp = new Date().toISOString();
    this.code = context.code || null;
    this.retryable = context.retryable !== false; // Default to retryable
  }
}

/**
 * Create a pipeline error
 */
export function createPipelineError(message, stage = null, details = {}) {
  return new AppError(message, ErrorTypes.PIPELINE, ErrorSeverity.HIGH, {
    stage,
    ...details,
    retryable: true
  });
}

/**
 * Create a stage error
 */
export function createStageError(message, stageId, details = {}) {
  return new AppError(message, ErrorTypes.STAGE, ErrorSeverity.MEDIUM, {
    stageId,
    ...details,
    retryable: true
  });
}

/**
 * Create a network error
 */
export function createNetworkError(message, url = null, status = null) {
  return new AppError(message, ErrorTypes.NETWORK, ErrorSeverity.MEDIUM, {
    url,
    status,
    retryable: true
  });
}

/**
 * Create a validation error
 */
export function createValidationError(message, field = null, value = null) {
  return new AppError(message, ErrorTypes.VALIDATION, ErrorSeverity.LOW, {
    field,
    value,
    retryable: false
  });
}

/**
 * Handle API errors with automatic retry logic
 */
export async function handleApiCall(apiCall, options = {}) {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    retryMultiplier = 2,
    showNotification = true,
    context = {}
  } = options;
  
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      lastError = error;
      
      // Don't retry on certain error types
      if (error.type === ErrorTypes.VALIDATION || 
          error.type === ErrorTypes.AUTHORIZATION ||
          !error.retryable) {
        break;
      }
      
      // Don't retry on final attempt
      if (attempt === maxRetries) {
        break;
      }
      
      // Wait before retry
      const delay = retryDelay * Math.pow(retryMultiplier, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // Handle final error
  if (showNotification) {
    handleError(lastError, context);
  }
  
  throw lastError;
}

/**
 * Handle errors with appropriate user feedback
 */
export function handleError(error, context = {}) {
  console.error('Error occurred:', error, context);
  
  // Enhance error with context if it's not already an AppError
  let enhancedError = error;
  if (!(error instanceof AppError)) {
    enhancedError = new AppError(
      error.message || 'An unexpected error occurred',
      classifyError(error),
      ErrorSeverity.MEDIUM,
      { originalError: error, ...context }
    );
  }
  
  // Show appropriate notification based on error type
  switch (enhancedError.type) {
    case ErrorTypes.PIPELINE:
      showPipelineError(enhancedError, context.onRetry);
      break;
    case ErrorTypes.NETWORK:
      showError(`Network error: ${enhancedError.message}`, {
        title: 'Connection Problem',
        persistent: true
      });
      break;
    case ErrorTypes.AUTHENTICATION:
      showError('Please log in to continue', {
        title: 'Authentication Required',
        persistent: true
      });
      break;
    case ErrorTypes.AUTHORIZATION:
      showError('You don\'t have permission to perform this action', {
        title: 'Access Denied',
        persistent: true
      });
      break;
    default:
      showError(enhancedError.message, {
        title: 'Error',
        persistent: enhancedError.severity === ErrorSeverity.HIGH || enhancedError.severity === ErrorSeverity.CRITICAL
      });
  }
  
  // Log to error reporting service
  reportError(enhancedError, context);
  
  return enhancedError;
}

/**
 * Classify error type based on error properties
 */
function classifyError(error) {
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return ErrorTypes.NETWORK;
  }
  
  if (error.status === 401) {
    return ErrorTypes.AUTHENTICATION;
  }
  
  if (error.status === 403) {
    return ErrorTypes.AUTHORIZATION;
  }
  
  if (error.status >= 400 && error.status < 500) {
    return ErrorTypes.VALIDATION;
  }
  
  if (error.status >= 500) {
    return ErrorTypes.NETWORK;
  }
  
  return ErrorTypes.UNKNOWN;
}

/**
 * Report error to logging service
 */
async function reportError(error, context = {}) {
  try {
    const errorReport = {
      message: error.message,
      type: error.type,
      severity: error.severity,
      timestamp: error.timestamp,
      context: {
        ...error.context,
        ...context,
        userAgent: navigator.userAgent,
        url: window.location.href,
        viewport: `${window.innerWidth}x${window.innerHeight}`
      },
      stack: error.stack
    };
    
    // Try to send to error reporting endpoint
    await fetch('/api/errors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(errorReport)
    });
  } catch (reportingError) {
    console.error('Failed to report error:', reportingError);
  }
}

/**
 * Handle pipeline cancellation
 */
export async function handlePipelineCancellation(pipelineId, onCancel) {
  try {
    await onCancel(pipelineId);
    return true;
  } catch (error) {
    handleError(createPipelineError(
      'Failed to cancel pipeline',
      null,
      { pipelineId, originalError: error }
    ));
    return false;
  }
}

/**
 * Handle stage retry
 */
export async function handleStageRetry(stageId, onRetry) {
  try {
    await onRetry(stageId);
    return true;
  } catch (error) {
    handleError(createStageError(
      'Failed to retry stage',
      stageId,
      { originalError: error }
    ));
    return false;
  }
}

/**
 * Handle connection errors
 */
export function handleConnectionError(service, error) {
  const connectionError = new AppError(
    `Failed to connect to ${service}`,
    ErrorTypes.NETWORK,
    ErrorSeverity.HIGH,
    { service, originalError: error }
  );
  
  showConnectionStatus(service, false, connectionError.message);
  reportError(connectionError);
  
  return connectionError;
}

/**
 * Wrap async functions with error handling
 */
export function withErrorHandling(asyncFn, context = {}) {
  return async (...args) => {
    try {
      return await asyncFn(...args);
    } catch (error) {
      handleError(error, context);
      throw error;
    }
  };
}

/**
 * Create error boundary for components
 */
export function createErrorBoundary(onError = null) {
  return {
    captureError: (error, context = {}) => {
      const handledError = handleError(error, context);
      if (onError) {
        onError(handledError, context);
      }
      return handledError;
    }
  };
}

/**
 * Validate and handle form errors
 */
export function handleFormError(error, formFields = {}) {
  if (error.type === ErrorTypes.VALIDATION && error.context.field) {
    // Handle field-specific validation error
    return {
      field: error.context.field,
      message: error.message
    };
  }
  
  // Handle general form error
  handleError(error, { formFields });
  return null;
}

/**
 * Handle batch operation errors
 */
export function handleBatchErrors(errors, operation = 'operation') {
  if (errors.length === 0) return;
  
  const criticalErrors = errors.filter(e => e.severity === ErrorSeverity.CRITICAL);
  const highErrors = errors.filter(e => e.severity === ErrorSeverity.HIGH);
  
  if (criticalErrors.length > 0) {
    showError(`${operation} failed with ${criticalErrors.length} critical error(s)`, {
      title: 'Critical Errors',
      persistent: true
    });
  } else if (highErrors.length > 0) {
    showError(`${operation} completed with ${highErrors.length} error(s)`, {
      title: 'Partial Success',
      persistent: true
    });
  }
  
  // Report all errors
  errors.forEach(error => reportError(error, { operation }));
}