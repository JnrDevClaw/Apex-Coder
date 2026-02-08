/**
 * Pipeline Utility Functions
 * Helper functions for pipeline status calculations and formatting
 * Requirements: 6.1, 6.2, 8.1, 8.3
 */

/**
 * Format relative time (e.g., "2 minutes ago")
 */
export function formatRelativeTime(timestamp) {
  const now = new Date();
  const time = new Date(timestamp);
  const diffMs = now.getTime() - time.getTime();
  
  if (diffMs < 0) return 'in the future';
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else {
    return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
  }
}

/**
 * Format duration between two timestamps
 */
export function formatDuration(startTime, endTime = null) {
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : new Date();
  const diffMs = end.getTime() - start.getTime();
  
  if (diffMs < 0) return '0s';
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Check if pipeline can be cancelled
 */
export function canCancelPipeline(pipeline) {
  return pipeline && (
    pipeline.status === 'pending' || 
    pipeline.status === 'running'
  );
}

/**
 * Check if pipeline can be retried
 */
export function canRetryPipeline(pipeline) {
  return pipeline && pipeline.status === 'failed';
}

/**
 * Check if stage can be retried
 */
export function canRetryStage(stage) {
  return stage && (
    stage.status === 'failed' || 
    stage.status === 'error'
  );
}

/**
 * Get estimated completion time
 */
export function getEstimatedCompletion(pipeline) {
  if (!pipeline || !pipeline.stages) return null;
  
  const averageStageTime = 2; // minutes per stage (rough estimate)
  const remainingStages = pipeline.stages.filter(stage => 
    stage.status === 'pending' || stage.status === 'running'
  ).length;
  
  if (remainingStages === 0) return null;
  
  const estimatedMinutes = remainingStages * averageStageTime;
  const now = new Date();
  const estimated = new Date(now.getTime() + estimatedMinutes * 60000);
  
  return estimated.toISOString();
}

/**
 * Calculate pipeline progress percentage
 */
export function calculateProgress(stages) {
  if (!stages || stages.length === 0) return 0;
  
  let totalWeight = 0;
  let completedWeight = 0;
  
  stages.forEach(stage => {
    // Assign weights based on stage complexity
    const weight = getStageWeight(stage.id);
    totalWeight += weight;
    
    const completion = getStageCompletion(stage);
    completedWeight += weight * completion;
  });
  
  return totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
}

/**
 * Get stage weight for progress calculation
 */
function getStageWeight(stageId) {
  const weights = {
    'creating_specs': 5,
    'creating_docs': 5,
    'creating_schema': 8,
    'creating_workspace': 3,
    'creating_files': 15,
    'coding_file': 25,
    'running_tests': 15,
    'creating_repo': 5,
    'repo_created': 2,
    'pushing_files': 8,
    'deploying': 12,
    'deployment_complete': 2
  };
  
  return weights[stageId] || 5; // Default weight
}

/**
 * Get stage completion percentage (0-1)
 */
function getStageCompletion(stage) {
  switch (stage.status) {
    case 'done':
    case 'created':
    case 'passed':
    case 'pushed':
    case 'deployed':
      return 1.0;
    case 'running':
      return 0.5; // Running stages are 50% complete
    case 'failed':
    case 'error':
    case 'cancelled':
      return 0.0;
    case 'pending':
    default:
      return 0.0;
  }
}

/**
 * Determine overall pipeline status from stages
 */
export function calculatePipelineStatus(stages) {
  if (!stages || stages.length === 0) return 'pending';
  
  const statusCounts = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0
  };
  
  stages.forEach(stage => {
    switch (stage.status) {
      case 'pending':
        statusCounts.pending++;
        break;
      case 'running':
        statusCounts.running++;
        break;
      case 'done':
      case 'created':
      case 'passed':
      case 'pushed':
      case 'deployed':
        statusCounts.completed++;
        break;
      case 'failed':
      case 'error':
        statusCounts.failed++;
        break;
      case 'cancelled':
        statusCounts.cancelled++;
        break;
    }
  });
  
  // Determine overall status based on stage distribution
  if (statusCounts.failed > 0) {
    return 'failed';
  } else if (statusCounts.cancelled > 0 && statusCounts.running === 0 && statusCounts.pending === 0) {
    return 'cancelled';
  } else if (statusCounts.completed === stages.length) {
    return 'completed';
  } else if (statusCounts.running > 0) {
    return 'running';
  } else {
    return 'pending';
  }
}

/**
 * Get next expected stage
 */
export function getNextStage(stages) {
  if (!stages || stages.length === 0) return null;
  
  return stages.find(stage => stage.status === 'pending') || null;
}

/**
 * Get current running stage
 */
export function getCurrentStage(stages) {
  if (!stages || stages.length === 0) return null;
  
  return stages.find(stage => stage.status === 'running') || null;
}

/**
 * Get failed stages
 */
export function getFailedStages(stages) {
  if (!stages || stages.length === 0) return [];
  
  return stages.filter(stage => 
    stage.status === 'failed' || 
    stage.status === 'error'
  );
}

/**
 * Get completed stages
 */
export function getCompletedStages(stages) {
  if (!stages || stages.length === 0) return [];
  
  return stages.filter(stage => 
    stage.status === 'done' ||
    stage.status === 'created' ||
    stage.status === 'passed' ||
    stage.status === 'pushed' ||
    stage.status === 'deployed'
  );
}