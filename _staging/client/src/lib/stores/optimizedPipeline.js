/**
 * Optimized Pipeline Store
 * Performance-optimized version of pipeline store with memoization and efficient updates
 * Requirements: 6.1, 1.2
 */

import { writable, derived, get } from 'svelte/store';
import { memoize, debounce } from '../utils/performance.js';
import { 
  validatePipeline, 
  validateStage, 
  PIPELINE_STATUS, 
  STAGE_STATUS 
} from '../schemas/pipeline.js';

// Core stores
export const pipelines = writable(new Map());
export const pipelineFilters = writable({
  status: 'all',
  sortBy: 'createdAt',
  sortOrder: 'desc'
});

// Memoized calculation functions
const memoizedCalculateProgress = memoize((stages) => {
  if (!stages || stages.length === 0) return 0;
  
  let completedStages = 0;
  const totalStages = stages.length;
  
  for (const stage of stages) {
    if (stage.status === STAGE_STATUS.DONE || 
        stage.status === STAGE_STATUS.CREATED ||
        stage.status === STAGE_STATUS.PASSED ||
        stage.status === STAGE_STATUS.PUSHED ||
        stage.status === STAGE_STATUS.DEPLOYED) {
      completedStages++;
    } else if (stage.status === STAGE_STATUS.RUNNING) {
      completedStages += 0.5;
    }
  }
  
  return Math.round((completedStages / totalStages) * 100);
}, (stages) => {
  // Custom key generator based on stage statuses
  return stages.map(s => `${s.id}:${s.status}`).join('|');
});

const memoizedCalculateStatus = memoize((stages) => {
  if (!stages || stages.length === 0) return PIPELINE_STATUS.PENDING;
  
  let hasRunning = false;
  let hasError = false;
  let hasFailed = false;
  let hasCancelled = false;
  let allCompleted = true;
  
  for (const stage of stages) {
    switch (stage.status) {
      case STAGE_STATUS.RUNNING:
        hasRunning = true;
        allCompleted = false;
        break;
      case STAGE_STATUS.ERROR:
        hasError = true;
        allCompleted = false;
        break;
      case STAGE_STATUS.FAILED:
        hasFailed = true;
        allCompleted = false;
        break;
      case STAGE_STATUS.CANCELLED:
        hasCancelled = true;
        allCompleted = false;
        break;
      case STAGE_STATUS.PENDING:
        allCompleted = false;
        break;
    }
  }
  
  if (hasError || hasFailed) {
    return PIPELINE_STATUS.FAILED;
  } else if (hasCancelled) {
    return PIPELINE_STATUS.CANCELLED;
  } else if (allCompleted) {
    return PIPELINE_STATUS.COMPLETED;
  } else if (hasRunning) {
    return PIPELINE_STATUS.RUNNING;
  } else {
    return PIPELINE_STATUS.PENDING;
  }
}, (stages) => {
  // Custom key generator based on stage statuses
  return stages.map(s => `${s.id}:${s.status}`).join('|');
});

// Memoized filtering and sorting
const memoizedFilterAndSort = memoize((pipelinesArray, filters) => {
  let result = [...pipelinesArray];
  
  // Apply status filter
  if (filters.status !== 'all') {
    result = result.filter(pipeline => pipeline.status === filters.status);
  }
  
  // Apply sorting
  result.sort((a, b) => {
    let aValue = a[filters.sortBy];
    let bValue = b[filters.sortBy];
    
    // Handle date strings
    if (filters.sortBy.includes('At')) {
      aValue = new Date(aValue || 0).getTime();
      bValue = new Date(bValue || 0).getTime();
    }
    
    // Handle progress numbers
    if (filters.sortBy === 'progress') {
      aValue = aValue || 0;
      bValue = bValue || 0;
    }
    
    if (filters.sortOrder === 'desc') {
      return bValue > aValue ? 1 : -1;
    } else {
      return aValue > bValue ? 1 : -1;
    }
  });
  
  return result;
}, (pipelinesArray, filters) => {
  // Custom key generator
  const pipelineKey = pipelinesArray.map(p => `${p.id}:${p.status}:${p.progress}`).join('|');
  const filterKey = `${filters.status}:${filters.sortBy}:${filters.sortOrder}`;
  return `${pipelineKey}:${filterKey}`;
});

// Derived stores with memoization
export const filteredPipelines = derived(
  [pipelines, pipelineFilters],
  ([$pipelines, $filters]) => {
    const pipelinesArray = Array.from($pipelines.values());
    return memoizedFilterAndSort(pipelinesArray, $filters);
  }
);

export const pipelineStats = derived(
  pipelines,
  ($pipelines) => {
    const stats = {
      total: $pipelines.size,
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    };
    
    for (const pipeline of $pipelines.values()) {
      stats[pipeline.status] = (stats[pipeline.status] || 0) + 1;
    }
    
    return stats;
  }
);

// Debounced update function to batch rapid updates
const debouncedBatchUpdate = debounce((updates) => {
  pipelines.update(pipelineMap => {
    const newMap = new Map(pipelineMap);
    
    for (const [id, data] of updates) {
      newMap.set(id, data);
    }
    
    return newMap;
  });
}, 50);

// Batch update queue
let updateQueue = new Map();

/**
 * Efficiently update pipeline with batching
 */
export function updatePipeline(pipelineData) {
  const validation = validatePipeline(pipelineData);
  if (!validation.isValid) {
    console.error('Invalid pipeline data:', validation.errors);
    return false;
  }
  
  // Add to batch queue
  updateQueue.set(pipelineData.id, pipelineData);
  
  // Trigger debounced batch update
  debouncedBatchUpdate(updateQueue);
  
  // Clear queue after update
  setTimeout(() => {
    updateQueue = new Map();
  }, 100);
  
  return true;
}

/**
 * Efficiently update pipeline stage
 */
export function updatePipelineStage(pipelineId, stageData) {
  const validation = validateStage(stageData);
  if (!validation.isValid) {
    console.error('Invalid stage data:', validation.errors);
    return false;
  }
  
  pipelines.update(pipelineMap => {
    const newMap = new Map(pipelineMap);
    const pipeline = newMap.get(pipelineId);
    
    if (pipeline) {
      const updatedPipeline = { ...pipeline };
      const stageIndex = updatedPipeline.stages.findIndex(stage => stage.id === stageData.id);
      
      if (stageIndex >= 0) {
        updatedPipeline.stages[stageIndex] = { ...stageData };
      } else {
        updatedPipeline.stages.push({ ...stageData });
      }
      
      // Use memoized calculations
      updatedPipeline.progress = memoizedCalculateProgress(updatedPipeline.stages);
      updatedPipeline.status = memoizedCalculateStatus(updatedPipeline.stages);
      
      newMap.set(pipelineId, updatedPipeline);
    }
    
    return newMap;
  });
  
  return true;
}

/**
 * Batch update multiple pipelines at once
 */
export function batchUpdatePipelines(pipelineDataArray) {
  const validPipelines = pipelineDataArray.filter(data => {
    const validation = validatePipeline(data);
    if (!validation.isValid) {
      console.error('Invalid pipeline data:', validation.errors);
      return false;
    }
    return true;
  });
  
  if (validPipelines.length === 0) return false;
  
  pipelines.update(pipelineMap => {
    const newMap = new Map(pipelineMap);
    
    for (const pipelineData of validPipelines) {
      newMap.set(pipelineData.id, { ...pipelineData });
    }
    
    return newMap;
  });
  
  return true;
}

/**
 * Remove pipeline with cleanup
 */
export function removePipeline(pipelineId) {
  pipelines.update(pipelineMap => {
    const newMap = new Map(pipelineMap);
    newMap.delete(pipelineId);
    return newMap;
  });
}

/**
 * Get pipeline by ID (memoized)
 */
export const getPipelineById = memoize((pipelineId) => {
  const pipelineMap = get(pipelines);
  return pipelineMap.get(pipelineId) || null;
});

/**
 * Clear all pipelines and reset state
 */
export function clearPipelines() {
  pipelines.set(new Map());
  updateQueue.clear();
}

/**
 * Set pipeline filters
 */
export function setPipelineFilters(filters) {
  pipelineFilters.update(current => ({
    ...current,
    ...filters
  }));
}

/**
 * Optimized pipeline subscription
 * Only notifies when specific pipeline changes
 */
export function subscribeToPipeline(pipelineId, callback) {
  return pipelines.subscribe(pipelineMap => {
    const pipeline = pipelineMap.get(pipelineId);
    if (pipeline) {
      callback(pipeline);
    }
  });
}

/**
 * Get pipeline count by status (memoized)
 */
export const getPipelineCountByStatus = memoize((status) => {
  const stats = get(pipelineStats);
  return stats[status] || 0;
});

/**
 * Check if any pipelines are active (memoized)
 */
export const hasActivePipelines = derived(
  pipelines,
  ($pipelines) => {
    for (const pipeline of $pipelines.values()) {
      if (pipeline.status === PIPELINE_STATUS.RUNNING || 
          pipeline.status === PIPELINE_STATUS.PENDING) {
        return true;
      }
    }
    return false;
  }
);
