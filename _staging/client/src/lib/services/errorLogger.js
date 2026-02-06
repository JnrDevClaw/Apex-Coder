/**
 * Error Logging Service
 * Handles error reporting and logging to backend services
 * Requirements: 3.1, 3.4
 */

/**
 * Log error to backend service
 */
export async function logError(error, context = {}) {
  try {
    const errorData = {
      message: error.message || 'Unknown error',
      stack: error.stack,
      type: error.type || 'unknown',
      severity: error.severity || 'medium',
      timestamp: error.timestamp || new Date().toISOString(),
      context: {
        ...error.context,
        ...context,
        userAgent: navigator.userAgent,
        url: window.location.href,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        timestamp: new Date().toISOString()
      }
    };
    
    const response = await fetch('/api/errors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(errorData)
    });
    
    if (!response.ok) {
      throw new Error(`Failed to log error: ${response.status}`);
    }
    
    const result = await response.json();
    return result.errorId;
    
  } catch (loggingError) {
    console.error('Failed to log error to backend:', loggingError);
    
    // Fallback to local storage for offline scenarios
    try {
      const localErrors = JSON.parse(localStorage.getItem('pendingErrors') || '[]');
      localErrors.push({
        error: {
          message: error.message,
          stack: error.stack,
          type: error.type,
          severity: error.severity
        },
        context,
        timestamp: new Date().toISOString()
      });
      
      // Keep only last 50 errors to prevent storage bloat
      if (localErrors.length > 50) {
        localErrors.splice(0, localErrors.length - 50);
      }
      
      localStorage.setItem('pendingErrors', JSON.stringify(localErrors));
    } catch (storageError) {
      console.error('Failed to store error locally:', storageError);
    }
    
    return null;
  }
}

/**
 * Submit error report with user details
 */
export async function submitErrorReport(reportData) {
  try {
    const response = await fetch('/api/error-reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...reportData,
        timestamp: new Date().toISOString()
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to submit error report: ${response.status}`);
    }
    
    const result = await response.json();
    return result.reportId;
    
  } catch (error) {
    console.error('Failed to submit error report:', error);
    throw error;
  }
}

/**
 * Get error statistics
 */
export async function getErrorStats(timeRange = '24h') {
  try {
    const response = await fetch(`/api/errors/stats?range=${timeRange}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get error stats: ${response.status}`);
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('Failed to get error stats:', error);
    return {
      total: 0,
      byType: {},
      bySeverity: {},
      trend: []
    };
  }
}

/**
 * Sync pending errors from local storage
 */
export async function syncPendingErrors() {
  try {
    const pendingErrors = JSON.parse(localStorage.getItem('pendingErrors') || '[]');
    
    if (pendingErrors.length === 0) {
      return { synced: 0, failed: 0 };
    }
    
    let synced = 0;
    let failed = 0;
    
    for (const errorEntry of pendingErrors) {
      try {
        await logError(errorEntry.error, errorEntry.context);
        synced++;
      } catch (syncError) {
        console.error('Failed to sync error:', syncError);
        failed++;
      }
    }
    
    // Clear synced errors from local storage
    if (synced > 0) {
      const remainingErrors = pendingErrors.slice(synced);
      localStorage.setItem('pendingErrors', JSON.stringify(remainingErrors));
    }
    
    return { synced, failed };
    
  } catch (error) {
    console.error('Failed to sync pending errors:', error);
    return { synced: 0, failed: 0 };
  }
}

/**
 * Initialize error logging service
 */
export function initializeErrorLogging() {
  // Sync pending errors on page load
  syncPendingErrors();
  
  // Set up periodic sync for pending errors
  setInterval(syncPendingErrors, 5 * 60 * 1000); // Every 5 minutes
  
  // Global error handlers
  window.addEventListener('error', (event) => {
    logError(event.error || new Error(event.message), {
      type: 'javascript',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });
  
  window.addEventListener('unhandledrejection', (event) => {
    logError(event.reason || new Error('Unhandled promise rejection'), {
      type: 'promise'
    });
  });
  
  console.log('Error logging service initialized');
}

/**
 * Create error context for pipeline operations
 */
export function createPipelineContext(pipelineId, stage = null) {
  return {
    pipelineId,
    stage,
    component: 'pipeline',
    timestamp: new Date().toISOString()
  };
}

/**
 * Create error context for API operations
 */
export function createApiContext(endpoint, method = 'GET', params = {}) {
  return {
    endpoint,
    method,
    params,
    component: 'api',
    timestamp: new Date().toISOString()
  };
}

/**
 * Create error context for UI operations
 */
export function createUIContext(component, action = null, data = {}) {
  return {
    component,
    action,
    data,
    timestamp: new Date().toISOString()
  };
}