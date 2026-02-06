/**
 * Pipeline State Management Store
 * Handles real-time pipeline monitoring and state updates
 * Requirements: 1.1, 4.1, 7.1
 */

import { writable, derived, get } from 'svelte/store';
import { 
  validatePipeline, 
  validateStage, 
  validateEventStreamMessage,
  PIPELINE_STATUS, 
  STAGE_STATUS,
  createEmptyPipeline,
  createEmptyStage,
  createEmptyStageEvent
} from '../schemas/pipeline.js';

// Core pipeline stores
export const pipelines = writable(new Map());
export const activePipelineId = writable(null);
export const connectionStatus = writable('disconnected'); // 'connected', 'connecting', 'disconnected', 'error'
export const eventStreamErrors = writable([]);

// UI state stores
export const selectedPipelineId = writable(null);
export const pipelineFilters = writable({
  status: 'all',
  sortBy: 'createdAt',
  sortOrder: 'desc'
});

// Real-time event processing
export const eventQueue = writable([]);
export const isProcessingEvents = writable(false);

/**
 * Get active pipeline
 */
export const activePipeline = derived(
  [pipelines, activePipelineId],
  ([$pipelines, $activePipelineId]) => {
    if (!$activePipelineId) return null;
    return $pipelines.get($activePipelineId) || null;
  }
);

/**
 * Get selected pipeline for detailed view
 */
export const selectedPipeline = derived(
  [pipelines, selectedPipelineId],
  ([$pipelines, $selectedPipelineId]) => {
    if (!$selectedPipelineId) return null;
    return $pipelines.get($selectedPipelineId) || null;
  }
);

/**
 * Get filtered and sorted pipelines for dashboard
 */
export const filteredPipelines = derived(
  [pipelines, pipelineFilters],
  ([$pipelines, $filters]) => {
    let pipelineArray = Array.from($pipelines.values());
    
    // Apply status filter
    if ($filters.status !== 'all') {
      pipelineArray = pipelineArray.filter(pipeline => pipeline.status === $filters.status);
    }
    
    // Apply sorting
    pipelineArray.sort((a, b) => {
      let aValue = a[$filters.sortBy];
      let bValue = b[$filters.sortBy];
      
      // Handle date strings
      if ($filters.sortBy.includes('At')) {
        aValue = new Date(aValue || 0).getTime();
        bValue = new Date(bValue || 0).getTime();
      }
      
      // Handle progress numbers
      if ($filters.sortBy === 'progress') {
        aValue = aValue || 0;
        bValue = bValue || 0;
      }
      
      if ($filters.sortOrder === 'desc') {
        return bValue > aValue ? 1 : -1;
      } else {
        return aValue > bValue ? 1 : -1;
      }
    });
    
    return pipelineArray;
  }
);

/**
 * Get pipeline statistics
 */
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

/**
 * Check if there are any active pipelines
 */
export const hasActivePipelines = derived(
  pipelines,
  ($pipelines) => {
    for (const pipeline of $pipelines.values()) {
      if (pipeline.status === PIPELINE_STATUS.RUNNING || pipeline.status === PIPELINE_STATUS.PENDING) {
        return true;
      }
    }
    return false;
  }
);

/**
 * Add or update a pipeline in the store
 */
export function updatePipeline(pipelineData) {
  const validation = validatePipeline(pipelineData);
  if (!validation.isValid) {
    console.error('Invalid pipeline data:', validation.errors);
    return false;
  }
  
  pipelines.update(pipelineMap => {
    const newMap = new Map(pipelineMap);
    newMap.set(pipelineData.id, { ...pipelineData });
    return newMap;
  });
  
  return true;
}

/**
 * Remove a pipeline from the store
 */
export function removePipeline(pipelineId) {
  pipelines.update(pipelineMap => {
    const newMap = new Map(pipelineMap);
    newMap.delete(pipelineId);
    return newMap;
  });
  
  // Clear active/selected if it was the removed pipeline
  if (get(activePipelineId) === pipelineId) {
    activePipelineId.set(null);
  }
  if (get(selectedPipelineId) === pipelineId) {
    selectedPipelineId.set(null);
  }
}

/**
 * Update a specific stage within a pipeline
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
      
      // Update pipeline progress based on stage completion
      updatedPipeline.progress = calculatePipelineProgress(updatedPipeline.stages);
      
      // Update pipeline status based on stage statuses
      updatedPipeline.status = calculatePipelineStatus(updatedPipeline.stages);
      
      newMap.set(pipelineId, updatedPipeline);
    }
    
    return newMap;
  });
  
  return true;
}

/**
 * Add an event to a specific stage
 */
export function addStageEvent(pipelineId, stageId, eventData) {
  pipelines.update(pipelineMap => {
    const newMap = new Map(pipelineMap);
    const pipeline = newMap.get(pipelineId);
    
    if (pipeline) {
      const updatedPipeline = { ...pipeline };
      const stageIndex = updatedPipeline.stages.findIndex(stage => stage.id === stageId);
      
      if (stageIndex >= 0) {
        const updatedStage = { ...updatedPipeline.stages[stageIndex] };
        
        if (!updatedStage.events) {
          updatedStage.events = [];
        }
        
        const newEvent = {
          ...createEmptyStageEvent(stageId, eventData.message),
          ...eventData,
          timestamp: eventData.timestamp || new Date().toISOString()
        };
        
        updatedStage.events.push(newEvent);
        updatedPipeline.stages[stageIndex] = updatedStage;
        
        // Update pipeline progress
        updatedPipeline.progress = calculatePipelineProgress(updatedPipeline.stages);
        updatedPipeline.status = calculatePipelineStatus(updatedPipeline.stages);
        
        newMap.set(pipelineId, updatedPipeline);
      }
    }
    
    return newMap;
  });
}

/**
 * Process incoming event stream message
 */
export function processEventStreamMessage(message) {
  const validation = validateEventStreamMessage(message);
  if (!validation.isValid) {
    console.error('Invalid event stream message:', validation.errors);
    eventStreamErrors.update(errors => [...errors, { 
      timestamp: new Date().toISOString(), 
      message: 'Invalid event format',
      details: validation.errors 
    }]);
    return false;
  }
  
  const { type, pipelineId, stage, status, message: eventMessage, timestamp, details } = message;
  
  switch (type) {
    case 'pipeline_update':
      updatePipelineFromEvent(pipelineId, { status, message: eventMessage, timestamp, details });
      break;
      
    case 'stage_update':
      updateStageFromEvent(pipelineId, stage, { status, message: eventMessage, timestamp, details });
      break;
      
    case 'pipeline_complete':
      completePipelineFromEvent(pipelineId, { message: eventMessage, timestamp, details });
      break;
      
    case 'pipeline_error':
      errorPipelineFromEvent(pipelineId, { message: eventMessage, timestamp, details });
      break;
      
    default:
      console.warn('Unknown event type:', type);
      return false;
  }
  
  return true;
}

/**
 * Update pipeline from event
 */
function updatePipelineFromEvent(pipelineId, eventData) {
  pipelines.update(pipelineMap => {
    const newMap = new Map(pipelineMap);
    const pipeline = newMap.get(pipelineId);
    
    if (pipeline) {
      const updatedPipeline = { ...pipeline };
      
      if (eventData.status) {
        updatedPipeline.status = eventData.status;
        
        // Update timestamps based on status
        if (eventData.status === PIPELINE_STATUS.RUNNING && !updatedPipeline.startedAt) {
          updatedPipeline.startedAt = eventData.timestamp;
        } else if (
          (eventData.status === PIPELINE_STATUS.COMPLETED || 
           eventData.status === PIPELINE_STATUS.FAILED || 
           eventData.status === PIPELINE_STATUS.CANCELLED) && 
          !updatedPipeline.completedAt
        ) {
          updatedPipeline.completedAt = eventData.timestamp;
        }
      }
      
      if (eventData.details && eventData.details.progress !== undefined) {
        updatedPipeline.progress = eventData.details.progress;
      }
      
      newMap.set(pipelineId, updatedPipeline);
    }
    
    return newMap;
  });
}

/**
 * Update stage from event
 */
function updateStageFromEvent(pipelineId, stageId, eventData) {
  pipelines.update(pipelineMap => {
    const newMap = new Map(pipelineMap);
    const pipeline = newMap.get(pipelineId);
    
    if (pipeline) {
      const updatedPipeline = { ...pipeline };
      const stageIndex = updatedPipeline.stages.findIndex(stage => stage.id === stageId);
      
      if (stageIndex >= 0) {
        const updatedStage = { ...updatedPipeline.stages[stageIndex] };
        
        if (eventData.status) {
          updatedStage.status = eventData.status;
          
          // Update timestamps based on status
          if (eventData.status === STAGE_STATUS.RUNNING && !updatedStage.startedAt) {
            updatedStage.startedAt = eventData.timestamp;
          } else if (
            (eventData.status === STAGE_STATUS.DONE || 
             eventData.status === STAGE_STATUS.CREATED ||
             eventData.status === STAGE_STATUS.PASSED ||
             eventData.status === STAGE_STATUS.FAILED || 
             eventData.status === STAGE_STATUS.ERROR ||
             eventData.status === STAGE_STATUS.CANCELLED) && 
            !updatedStage.completedAt
          ) {
            updatedStage.completedAt = eventData.timestamp;
          }
        }
        
        // Add event if stage supports multiple events
        if (updatedStage.supportsMultipleEvents) {
          if (!updatedStage.events) {
            updatedStage.events = [];
          }
          
          const newEvent = createEmptyStageEvent(stageId, eventData.message);
          newEvent.status = eventData.status || STAGE_STATUS.RUNNING;
          newEvent.timestamp = eventData.timestamp;
          newEvent.details = eventData.details || {};
          
          updatedStage.events.push(newEvent);
        }
        
        updatedPipeline.stages[stageIndex] = updatedStage;
        
        // Recalculate pipeline progress and status
        updatedPipeline.progress = calculatePipelineProgress(updatedPipeline.stages);
        updatedPipeline.status = calculatePipelineStatus(updatedPipeline.stages);
        
        newMap.set(pipelineId, updatedPipeline);
      }
    }
    
    return newMap;
  });
}

/**
 * Complete pipeline from event
 */
function completePipelineFromEvent(pipelineId, eventData) {
  pipelines.update(pipelineMap => {
    const newMap = new Map(pipelineMap);
    const pipeline = newMap.get(pipelineId);
    
    if (pipeline) {
      const updatedPipeline = { ...pipeline };
      updatedPipeline.status = PIPELINE_STATUS.COMPLETED;
      updatedPipeline.progress = 100;
      updatedPipeline.completedAt = eventData.timestamp;
      
      // Add resources if provided
      if (eventData.details && eventData.details.resources) {
        updatedPipeline.resources = eventData.details.resources;
      }
      
      newMap.set(pipelineId, updatedPipeline);
    }
    
    return newMap;
  });
}

/**
 * Error pipeline from event
 */
function errorPipelineFromEvent(pipelineId, eventData) {
  pipelines.update(pipelineMap => {
    const newMap = new Map(pipelineMap);
    const pipeline = newMap.get(pipelineId);
    
    if (pipeline) {
      const updatedPipeline = { ...pipeline };
      updatedPipeline.status = PIPELINE_STATUS.FAILED;
      updatedPipeline.completedAt = eventData.timestamp;
      updatedPipeline.error = eventData.message;
      
      newMap.set(pipelineId, updatedPipeline);
    }
    
    return newMap;
  });
}

/**
 * Calculate pipeline progress based on stage completion
 */
function calculatePipelineProgress(stages) {
  if (!stages || stages.length === 0) return 0;
  
  let completedStages = 0;
  let totalStages = stages.length;
  
  for (const stage of stages) {
    if (stage.status === STAGE_STATUS.DONE || 
        stage.status === STAGE_STATUS.CREATED ||
        stage.status === STAGE_STATUS.PASSED ||
        stage.status === STAGE_STATUS.PUSHED ||
        stage.status === STAGE_STATUS.DEPLOYED) {
      completedStages++;
    } else if (stage.status === STAGE_STATUS.RUNNING) {
      // Count running stages as half complete
      completedStages += 0.5;
    }
  }
  
  return Math.round((completedStages / totalStages) * 100);
}

/**
 * Calculate overall pipeline status based on stage statuses
 */
function calculatePipelineStatus(stages) {
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
      case STAGE_STATUS.DONE:
      case STAGE_STATUS.CREATED:
      case STAGE_STATUS.PASSED:
      case STAGE_STATUS.PUSHED:
      case STAGE_STATUS.DEPLOYED:
        // These are considered completed
        break;
      default:
        allCompleted = false;
    }
  }
  
  // Determine overall status
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
 * Clear all pipelines
 */
export function clearPipelines() {
  pipelines.set(new Map());
  activePipelineId.set(null);
  selectedPipelineId.set(null);
}

/**
 * Get pipeline by ID
 */
export function getPipelineById(pipelineId) {
  const pipelineMap = get(pipelines);
  return pipelineMap.get(pipelineId) || null;
}

/**
 * Check if pipeline exists
 */
export function pipelineExists(pipelineId) {
  const pipelineMap = get(pipelines);
  return pipelineMap.has(pipelineId);
}

/**
 * Get stage by ID within a pipeline
 */
export function getStageById(pipelineId, stageId) {
  const pipeline = getPipelineById(pipelineId);
  if (!pipeline) return null;
  
  return pipeline.stages.find(stage => stage.id === stageId) || null;
}

/**
 * Create a new pipeline
 */
export function createPipeline(projectName, userId, stages = []) {
  const pipeline = createEmptyPipeline(projectName, userId);
  pipeline.stages = stages.map(stageConfig => ({
    ...createEmptyStage(stageConfig.id, stageConfig.label, stageConfig.description),
    ...stageConfig
  }));
  
  updatePipeline(pipeline);
  return pipeline;
}

/**
 * Cancel a pipeline
 */
export function cancelPipeline(pipelineId) {
  pipelines.update(pipelineMap => {
    const newMap = new Map(pipelineMap);
    const pipeline = newMap.get(pipelineId);
    
    if (pipeline && (pipeline.status === PIPELINE_STATUS.PENDING || pipeline.status === PIPELINE_STATUS.RUNNING)) {
      const updatedPipeline = { ...pipeline };
      updatedPipeline.status = PIPELINE_STATUS.CANCELLED;
      updatedPipeline.completedAt = new Date().toISOString();
      
      // Cancel all pending and running stages
      updatedPipeline.stages = updatedPipeline.stages.map(stage => {
        if (stage.status === STAGE_STATUS.PENDING || stage.status === STAGE_STATUS.RUNNING) {
          return {
            ...stage,
            status: STAGE_STATUS.CANCELLED,
            completedAt: new Date().toISOString()
          };
        }
        return stage;
      });
      
      newMap.set(pipelineId, updatedPipeline);
    }
    
    return newMap;
  });
}

/**
 * Retry a failed pipeline
 */
export function retryPipeline(pipelineId) {
  pipelines.update(pipelineMap => {
    const newMap = new Map(pipelineMap);
    const pipeline = newMap.get(pipelineId);
    
    if (pipeline && pipeline.status === PIPELINE_STATUS.FAILED) {
      const updatedPipeline = { ...pipeline };
      updatedPipeline.status = PIPELINE_STATUS.PENDING;
      updatedPipeline.progress = 0;
      updatedPipeline.startedAt = null;
      updatedPipeline.completedAt = null;
      updatedPipeline.error = null;
      
      // Reset failed stages to pending
      updatedPipeline.stages = updatedPipeline.stages.map(stage => {
        if (stage.status === STAGE_STATUS.FAILED || stage.status === STAGE_STATUS.ERROR) {
          return {
            ...stage,
            status: STAGE_STATUS.PENDING,
            startedAt: null,
            completedAt: null,
            error: null,
            events: [] // Clear previous events
          };
        }
        return stage;
      });
      
      newMap.set(pipelineId, updatedPipeline);
    }
    
    return newMap;
  });
}