/**
 * Pipeline Schema Definition and Validation
 * Based on frontend-build-pipeline-integration requirements
 * Requirements: 1.1, 4.1, 7.1
 */

/**
 * Pipeline status enumeration
 */
export const PIPELINE_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * Stage status enumeration
 */
export const STAGE_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  CREATED: 'created',
  PASSED: 'passed',
  FAILED: 'failed',
  ERROR: 'error',
  CANCELLED: 'cancelled',
  PUSHED: 'pushed',
  DEPLOYED: 'deployed'
};

/**
 * Resource type enumeration
 */
export const RESOURCE_TYPE = {
  REPOSITORY: 'repository',
  DEPLOYMENT: 'deployment',
  S3: 's3',
  DATABASE: 'database',
  LAMBDA: 'lambda',
  API: 'api'
};

/**
 * Pipeline schema definition
 */
export const pipelineSchema = {
  id: {
    type: 'string',
    required: true,
    description: 'Unique pipeline identifier'
  },
  projectName: {
    type: 'string',
    required: true,
    minLength: 1,
    maxLength: 100,
    description: 'Human-readable project name'
  },
  userId: {
    type: 'string',
    required: true,
    description: 'User identifier who owns this pipeline'
  },
  status: {
    type: 'string',
    required: true,
    enum: Object.values(PIPELINE_STATUS),
    description: 'Overall pipeline status'
  },
  progress: {
    type: 'number',
    required: true,
    min: 0,
    max: 100,
    description: 'Progress percentage (0-100)'
  },
  createdAt: {
    type: 'string',
    required: true,
    description: 'ISO timestamp when pipeline was created'
  },
  startedAt: {
    type: 'string',
    required: false,
    description: 'ISO timestamp when pipeline started execution'
  },
  completedAt: {
    type: 'string',
    required: false,
    description: 'ISO timestamp when pipeline completed'
  },
  stages: {
    type: 'array',
    required: true,
    items: 'stageSchema',
    description: 'Array of pipeline stages'
  },
  resources: {
    type: 'array',
    required: false,
    items: 'resourceSchema',
    description: 'Generated resources from pipeline execution'
  },
  error: {
    type: 'string',
    required: false,
    description: 'Error message if pipeline failed'
  }
};

/**
 * Stage schema definition
 */
export const stageSchema = {
  id: {
    type: 'string',
    required: true,
    description: 'Unique stage identifier'
  },
  label: {
    type: 'string',
    required: true,
    description: 'Human-readable stage label'
  },
  description: {
    type: 'string',
    required: true,
    description: 'Stage description'
  },
  status: {
    type: 'string',
    required: true,
    enum: Object.values(STAGE_STATUS),
    description: 'Current stage status'
  },
  supportsMultipleEvents: {
    type: 'boolean',
    required: true,
    description: 'Whether stage supports multiple sub-events'
  },
  allowedStatuses: {
    type: 'array',
    required: true,
    items: { type: 'string', enum: Object.values(STAGE_STATUS) },
    description: 'Allowed status transitions for this stage'
  },
  startedAt: {
    type: 'string',
    required: false,
    description: 'ISO timestamp when stage started'
  },
  completedAt: {
    type: 'string',
    required: false,
    description: 'ISO timestamp when stage completed'
  },
  events: {
    type: 'array',
    required: false,
    items: 'stageEventSchema',
    description: 'Sub-events for stages that support multiple events'
  },
  error: {
    type: 'string',
    required: false,
    description: 'Error message if stage failed'
  }
};

/**
 * Stage event schema definition
 */
export const stageEventSchema = {
  id: {
    type: 'string',
    required: true,
    description: 'Unique event identifier'
  },
  stageId: {
    type: 'string',
    required: true,
    description: 'Parent stage identifier'
  },
  message: {
    type: 'string',
    required: true,
    description: 'Human-readable event message'
  },
  status: {
    type: 'string',
    required: true,
    enum: Object.values(STAGE_STATUS),
    description: 'Event status'
  },
  timestamp: {
    type: 'string',
    required: true,
    description: 'ISO timestamp when event occurred'
  },
  details: {
    type: 'object',
    required: false,
    description: 'Additional event-specific data'
  }
};

/**
 * Resource schema definition
 */
export const resourceSchema = {
  type: {
    type: 'string',
    required: true,
    enum: Object.values(RESOURCE_TYPE),
    description: 'Resource type'
  },
  name: {
    type: 'string',
    required: true,
    description: 'Resource name'
  },
  url: {
    type: 'string',
    required: true,
    description: 'Resource access URL'
  },
  metadata: {
    type: 'object',
    required: false,
    description: 'Additional resource metadata'
  }
};

/**
 * Event stream message schema
 */
export const eventStreamSchema = {
  type: {
    type: 'string',
    required: true,
    enum: ['pipeline_update', 'stage_update', 'pipeline_complete', 'pipeline_error'],
    description: 'Event type'
  },
  pipelineId: {
    type: 'string',
    required: true,
    description: 'Pipeline identifier'
  },
  stage: {
    type: 'string',
    required: false,
    description: 'Stage identifier (for stage-specific events)'
  },
  status: {
    type: 'string',
    required: false,
    enum: [...Object.values(PIPELINE_STATUS), ...Object.values(STAGE_STATUS)],
    description: 'New status'
  },
  message: {
    type: 'string',
    required: true,
    description: 'Human-readable message'
  },
  timestamp: {
    type: 'string',
    required: true,
    description: 'ISO timestamp'
  },
  details: {
    type: 'object',
    required: false,
    description: 'Additional event data'
  }
};

/**
 * Validation error class
 */
export class PipelineValidationError extends Error {
  constructor(field, message, value = null) {
    super(`Pipeline validation error for field '${field}': ${message}`);
    this.field = field;
    this.value = value;
    this.name = 'PipelineValidationError';
  }
}

/**
 * Validate a field against its schema definition
 */
function validateField(fieldName, value, schema, path = '') {
  const errors = [];
  const fullPath = path ? `${path}.${fieldName}` : fieldName;
  
  // Check if required field is missing
  if (schema.required && (value === undefined || value === null || value === '')) {
    errors.push(new PipelineValidationError(fullPath, 'Field is required'));
    return errors;
  }
  
  // Skip validation if field is not required and empty
  if (!schema.required && (value === undefined || value === null || value === '')) {
    return errors;
  }
  
  // Type validation
  if (schema.type === 'string' && typeof value !== 'string') {
    errors.push(new PipelineValidationError(fullPath, `Expected string, got ${typeof value}`, value));
  } else if (schema.type === 'number' && typeof value !== 'number') {
    errors.push(new PipelineValidationError(fullPath, `Expected number, got ${typeof value}`, value));
  } else if (schema.type === 'boolean' && typeof value !== 'boolean') {
    errors.push(new PipelineValidationError(fullPath, `Expected boolean, got ${typeof value}`, value));
  } else if (schema.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
    errors.push(new PipelineValidationError(fullPath, `Expected object, got ${typeof value}`, value));
  } else if (schema.type === 'array' && !Array.isArray(value)) {
    errors.push(new PipelineValidationError(fullPath, `Expected array, got ${typeof value}`, value));
  }
  
  // String-specific validations
  if (schema.type === 'string' && typeof value === 'string') {
    if (schema.minLength && value.length < schema.minLength) {
      errors.push(new PipelineValidationError(fullPath, `Minimum length is ${schema.minLength}`, value));
    }
    if (schema.maxLength && value.length > schema.maxLength) {
      errors.push(new PipelineValidationError(fullPath, `Maximum length is ${schema.maxLength}`, value));
    }
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(new PipelineValidationError(fullPath, `Value must be one of: ${schema.enum.join(', ')}`, value));
    }
  }
  
  // Number-specific validations
  if (schema.type === 'number' && typeof value === 'number') {
    if (schema.min !== undefined && value < schema.min) {
      errors.push(new PipelineValidationError(fullPath, `Minimum value is ${schema.min}`, value));
    }
    if (schema.max !== undefined && value > schema.max) {
      errors.push(new PipelineValidationError(fullPath, `Maximum value is ${schema.max}`, value));
    }
  }
  
  return errors;
}

/**
 * Validate pipeline object against schema
 */
export function validatePipeline(pipeline) {
  const errors = [];
  
  if (!pipeline || typeof pipeline !== 'object') {
    errors.push(new PipelineValidationError('root', 'Pipeline must be an object'));
    return { isValid: false, errors };
  }
  
  // Validate each field
  for (const [fieldName, fieldSchema] of Object.entries(pipelineSchema)) {
    if (fieldSchema.type === 'array' && fieldSchema.items) {
      // Handle array validation
      const arrayValue = pipeline[fieldName];
      if (arrayValue) {
        if (!Array.isArray(arrayValue)) {
          errors.push(new PipelineValidationError(fieldName, 'Expected array'));
        } else {
          // Validate array items
          arrayValue.forEach((item, index) => {
            if (fieldSchema.items === 'stageSchema') {
              const itemErrors = validateStage(item);
              itemErrors.errors.forEach(error => {
                error.field = `${fieldName}[${index}].${error.field}`;
                errors.push(error);
              });
            } else if (fieldSchema.items === 'resourceSchema') {
              const itemErrors = validateResource(item);
              itemErrors.errors.forEach(error => {
                error.field = `${fieldName}[${index}].${error.field}`;
                errors.push(error);
              });
            }
          });
        }
      } else if (fieldSchema.required) {
        errors.push(new PipelineValidationError(fieldName, 'Field is required'));
      }
    } else {
      const fieldErrors = validateField(fieldName, pipeline[fieldName], fieldSchema);
      errors.push(...fieldErrors);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate stage object against schema
 */
export function validateStage(stage) {
  const errors = [];
  
  if (!stage || typeof stage !== 'object') {
    errors.push(new PipelineValidationError('root', 'Stage must be an object'));
    return { isValid: false, errors };
  }
  
  // Validate each field
  for (const [fieldName, fieldSchema] of Object.entries(stageSchema)) {
    if (fieldName === 'events' && fieldSchema.type === 'array') {
      // Handle events array validation
      const eventsValue = stage[fieldName];
      if (eventsValue) {
        if (!Array.isArray(eventsValue)) {
          errors.push(new PipelineValidationError(fieldName, 'Expected array'));
        } else {
          eventsValue.forEach((event, index) => {
            const eventErrors = validateStageEvent(event);
            eventErrors.errors.forEach(error => {
              error.field = `${fieldName}[${index}].${error.field}`;
              errors.push(error);
            });
          });
        }
      }
    } else {
      const fieldErrors = validateField(fieldName, stage[fieldName], fieldSchema);
      errors.push(...fieldErrors);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate stage event object against schema
 */
export function validateStageEvent(event) {
  const errors = [];
  
  if (!event || typeof event !== 'object') {
    errors.push(new PipelineValidationError('root', 'Stage event must be an object'));
    return { isValid: false, errors };
  }
  
  // Validate each field
  for (const [fieldName, fieldSchema] of Object.entries(stageEventSchema)) {
    const fieldErrors = validateField(fieldName, event[fieldName], fieldSchema);
    errors.push(...fieldErrors);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate resource object against schema
 */
export function validateResource(resource) {
  const errors = [];
  
  if (!resource || typeof resource !== 'object') {
    errors.push(new PipelineValidationError('root', 'Resource must be an object'));
    return { isValid: false, errors };
  }
  
  // Validate each field
  for (const [fieldName, fieldSchema] of Object.entries(resourceSchema)) {
    const fieldErrors = validateField(fieldName, resource[fieldName], fieldSchema);
    errors.push(...fieldErrors);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate event stream message against schema
 */
export function validateEventStreamMessage(message) {
  const errors = [];
  
  if (!message || typeof message !== 'object') {
    errors.push(new PipelineValidationError('root', 'Event stream message must be an object'));
    return { isValid: false, errors };
  }
  
  // Validate each field
  for (const [fieldName, fieldSchema] of Object.entries(eventStreamSchema)) {
    const fieldErrors = validateField(fieldName, message[fieldName], fieldSchema);
    errors.push(...fieldErrors);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Create empty pipeline template
 */
export function createEmptyPipeline(projectName, userId) {
  return {
    id: generatePipelineId(),
    projectName: projectName || '',
    userId: userId || '',
    status: PIPELINE_STATUS.PENDING,
    progress: 0,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    stages: [],
    resources: [],
    error: null
  };
}

/**
 * Create empty stage template
 */
export function createEmptyStage(id, label, description) {
  return {
    id: id || '',
    label: label || '',
    description: description || '',
    status: STAGE_STATUS.PENDING,
    supportsMultipleEvents: false,
    allowedStatuses: [STAGE_STATUS.PENDING, STAGE_STATUS.RUNNING, STAGE_STATUS.DONE, STAGE_STATUS.ERROR],
    startedAt: null,
    completedAt: null,
    events: [],
    error: null
  };
}

/**
 * Create empty stage event template
 */
export function createEmptyStageEvent(stageId, message) {
  return {
    id: generateEventId(),
    stageId: stageId || '',
    message: message || '',
    status: STAGE_STATUS.PENDING,
    timestamp: new Date().toISOString(),
    details: {}
  };
}

/**
 * Create empty resource template
 */
export function createEmptyResource(type, name, url) {
  return {
    type: type || RESOURCE_TYPE.REPOSITORY,
    name: name || '',
    url: url || '',
    metadata: {}
  };
}

/**
 * Generate unique pipeline ID
 */
function generatePipelineId() {
  return 'pipeline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Generate unique event ID
 */
function generateEventId() {
  return 'event_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Get validation errors as user-friendly messages
 */
export function formatValidationErrors(errors) {
  const grouped = {};
  
  for (const error of errors) {
    if (!grouped[error.field]) {
      grouped[error.field] = [];
    }
    grouped[error.field].push(error.message);
  }
  
  return grouped;
}