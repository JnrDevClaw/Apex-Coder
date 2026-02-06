/**
 * Stage Registry Service
 * Manages dynamic stage definitions and provides plugin architecture
 * Requirements: 4.1, 4.2, 4.4
 */

import { STAGE_STATUS } from '../schemas/pipeline.js';

/**
 * Stage registry class for managing dynamic stage definitions
 */
class StageRegistry {
  constructor() {
    this.stages = new Map();
    this.renderers = new Map();
    this.validators = new Map();
    this.payloadSchemas = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the registry with default stages
   */
  async initialize() {
    if (this.initialized) return;

    // Register built-in stages
    await this.registerBuiltInStages();
    
    // Load custom stages from configuration
    await this.loadCustomStages();
    
    this.initialized = true;
  }

  /**
   * Register a new stage definition
   */
  registerStage(stageDefinition) {
    const validation = this.validateStageDefinition(stageDefinition);
    if (!validation.isValid) {
      throw new Error(`Invalid stage definition: ${validation.errors.join(', ')}`);
    }

    const normalizedStage = this.normalizeStageDefinition(stageDefinition);
    this.stages.set(normalizedStage.id, normalizedStage);

    // Register payload schema if provided
    if (normalizedStage.expectedPayloadSchema) {
      this.payloadSchemas.set(normalizedStage.id, normalizedStage.expectedPayloadSchema);
    }

    return normalizedStage;
  }

  /**
   * Register a custom renderer for a stage type
   */
  registerRenderer(stageId, rendererComponent) {
    if (typeof rendererComponent !== 'function' && typeof rendererComponent !== 'object') {
      throw new Error('Renderer must be a Svelte component or function');
    }

    this.renderers.set(stageId, rendererComponent);
  }

  /**
   * Register a custom validator for a stage type
   */
  registerValidator(stageId, validatorFunction) {
    if (typeof validatorFunction !== 'function') {
      throw new Error('Validator must be a function');
    }

    this.validators.set(stageId, validatorFunction);
  }

  /**
   * Get stage definition by ID
   */
  getStage(stageId) {
    return this.stages.get(stageId);
  }

  /**
   * Get all registered stages
   */
  getAllStages() {
    return Array.from(this.stages.values());
  }

  /**
   * Get renderer for a stage
   */
  getRenderer(stageId) {
    return this.renderers.get(stageId) || this.renderers.get('default');
  }

  /**
   * Get validator for a stage
   */
  getValidator(stageId) {
    return this.validators.get(stageId) || this.validators.get('default');
  }

  /**
   * Get payload schema for a stage
   */
  getPayloadSchema(stageId) {
    return this.payloadSchemas.get(stageId);
  }

  /**
   * Validate stage definition
   */
  validateStageDefinition(stageDefinition) {
    const errors = [];

    if (!stageDefinition || typeof stageDefinition !== 'object') {
      errors.push('Stage definition must be an object');
      return { isValid: false, errors };
    }

    // Required fields
    if (!stageDefinition.id) {
      errors.push('Stage ID is required');
    } else if (!/^[a-z0-9_-]+$/.test(stageDefinition.id)) {
      errors.push('Stage ID must contain only lowercase letters, numbers, underscores, and hyphens');
    }

    if (!stageDefinition.label) {
      errors.push('Stage label is required');
    }

    if (!stageDefinition.description) {
      errors.push('Stage description is required');
    }

    if (typeof stageDefinition.supportsMultipleEvents !== 'boolean') {
      errors.push('supportsMultipleEvents must be a boolean');
    }

    if (!stageDefinition.allowedStatuses || !Array.isArray(stageDefinition.allowedStatuses)) {
      errors.push('allowedStatuses must be an array');
    } else {
      // Validate each status
      stageDefinition.allowedStatuses.forEach((status, index) => {
        if (!Object.values(STAGE_STATUS).includes(status)) {
          errors.push(`Invalid status at index ${index}: ${status}`);
        }
      });
    }

    // Optional field validation
    if (stageDefinition.dependencies && !Array.isArray(stageDefinition.dependencies)) {
      errors.push('dependencies must be an array');
    }

    if (stageDefinition.timeout !== undefined) {
      if (typeof stageDefinition.timeout !== 'number' || stageDefinition.timeout < 1000) {
        errors.push('timeout must be a number >= 1000 (milliseconds)');
      }
    }

    if (stageDefinition.retryable !== undefined && typeof stageDefinition.retryable !== 'boolean') {
      errors.push('retryable must be a boolean');
    }

    if (stageDefinition.critical !== undefined && typeof stageDefinition.critical !== 'boolean') {
      errors.push('critical must be a boolean');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Normalize stage definition with defaults
   */
  normalizeStageDefinition(stageDefinition) {
    return {
      id: stageDefinition.id,
      label: stageDefinition.label,
      description: stageDefinition.description,
      supportsMultipleEvents: stageDefinition.supportsMultipleEvents || false,
      allowedStatuses: stageDefinition.allowedStatuses || [
        STAGE_STATUS.PENDING,
        STAGE_STATUS.RUNNING,
        STAGE_STATUS.DONE,
        STAGE_STATUS.ERROR
      ],
      expectedPayloadSchema: stageDefinition.expectedPayloadSchema || {},
      dependencies: stageDefinition.dependencies || [],
      timeout: stageDefinition.timeout || 300000, // 5 minutes default
      retryable: stageDefinition.retryable !== undefined ? stageDefinition.retryable : true,
      critical: stageDefinition.critical || false,
      version: stageDefinition.version || '1.0.0',
      category: stageDefinition.category || 'general',
      icon: stageDefinition.icon || 'default',
      metadata: stageDefinition.metadata || {}
    };
  }

  /**
   * Validate stage payload against schema
   */
  validateStagePayload(stageId, payload) {
    const schema = this.getPayloadSchema(stageId);
    if (!schema || Object.keys(schema).length === 0) {
      return { isValid: true, errors: [] };
    }

    const validator = this.getValidator(stageId);
    if (validator) {
      return validator(payload, schema);
    }

    // Default validation
    return this.defaultPayloadValidation(payload, schema);
  }

  /**
   * Default payload validation
   */
  defaultPayloadValidation(payload, schema) {
    const errors = [];

    if (!payload || typeof payload !== 'object') {
      errors.push('Payload must be an object');
      return { isValid: false, errors };
    }

    // Validate required fields
    for (const [fieldName, fieldSchema] of Object.entries(schema)) {
      if (fieldSchema.required && (payload[fieldName] === undefined || payload[fieldName] === null)) {
        errors.push(`Required field '${fieldName}' is missing`);
        continue;
      }

      const value = payload[fieldName];
      if (value === undefined || value === null) continue;

      // Type validation
      if (fieldSchema.type && typeof value !== fieldSchema.type) {
        errors.push(`Field '${fieldName}' must be of type ${fieldSchema.type}`);
      }

      // String validation
      if (fieldSchema.type === 'string' && typeof value === 'string') {
        if (fieldSchema.minLength && value.length < fieldSchema.minLength) {
          errors.push(`Field '${fieldName}' must be at least ${fieldSchema.minLength} characters`);
        }
        if (fieldSchema.maxLength && value.length > fieldSchema.maxLength) {
          errors.push(`Field '${fieldName}' must be at most ${fieldSchema.maxLength} characters`);
        }
        if (fieldSchema.pattern && !new RegExp(fieldSchema.pattern).test(value)) {
          errors.push(`Field '${fieldName}' does not match required pattern`);
        }
      }

      // Number validation
      if (fieldSchema.type === 'number' && typeof value === 'number') {
        if (fieldSchema.min !== undefined && value < fieldSchema.min) {
          errors.push(`Field '${fieldName}' must be at least ${fieldSchema.min}`);
        }
        if (fieldSchema.max !== undefined && value > fieldSchema.max) {
          errors.push(`Field '${fieldName}' must be at most ${fieldSchema.max}`);
        }
      }

      // Array validation
      if (fieldSchema.type === 'array' && Array.isArray(value)) {
        if (fieldSchema.minItems && value.length < fieldSchema.minItems) {
          errors.push(`Field '${fieldName}' must have at least ${fieldSchema.minItems} items`);
        }
        if (fieldSchema.maxItems && value.length > fieldSchema.maxItems) {
          errors.push(`Field '${fieldName}' must have at most ${fieldSchema.maxItems} items`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if stage supports status transition
   */
  canTransitionTo(stageId, fromStatus, toStatus) {
    const stage = this.getStage(stageId);
    if (!stage) return false;

    return stage.allowedStatuses.includes(toStatus);
  }

  /**
   * Get stage dependencies
   */
  getStageDependencies(stageId) {
    const stage = this.getStage(stageId);
    return stage ? stage.dependencies : [];
  }

  /**
   * Check if stage is retryable
   */
  isStageRetryable(stageId) {
    const stage = this.getStage(stageId);
    return stage ? stage.retryable : false;
  }

  /**
   * Check if stage is critical
   */
  isStageCritical(stageId) {
    const stage = this.getStage(stageId);
    return stage ? stage.critical : false;
  }

  /**
   * Register built-in stages
   */
  async registerBuiltInStages() {
    const builtInStages = [
      {
        id: 'creating_specs',
        label: 'Creating specs.json',
        description: 'Generate app specifications from questionnaire and inferred logic.',
        supportsMultipleEvents: false,
        allowedStatuses: ['pending', 'running', 'created', 'error', 'cancelled'],
        expectedPayloadSchema: {
          path: { type: 'string', required: false }
        },
        timeout: 120000,
        retryable: true,
        critical: true,
        category: 'initialization',
        icon: 'document'
      },
      {
        id: 'creating_docs',
        label: 'Creating docs',
        description: 'Generate documentation files, readmes, guides.',
        supportsMultipleEvents: false,
        allowedStatuses: ['pending', 'running', 'created', 'error', 'cancelled'],
        dependencies: ['creating_specs'],
        timeout: 180000,
        retryable: true,
        critical: false,
        category: 'documentation',
        icon: 'book'
      },
      {
        id: 'creating_schema',
        label: 'Creating schema',
        description: 'Create schema definitions (DB, API shape, domain objects).',
        supportsMultipleEvents: false,
        allowedStatuses: ['pending', 'running', 'created', 'error', 'cancelled'],
        dependencies: ['creating_docs'],
        timeout: 240000,
        retryable: true,
        critical: true,
        category: 'architecture',
        icon: 'database'
      },
      {
        id: 'creating_workspace',
        label: 'Creating workspace file structure',
        description: 'Prepare folders, configs, project directory.',
        supportsMultipleEvents: false,
        allowedStatuses: ['pending', 'running', 'created', 'error', 'cancelled'],
        expectedPayloadSchema: {
          workspaceRoot: { type: 'string', required: false }
        },
        dependencies: ['creating_schema'],
        timeout: 60000,
        retryable: true,
        critical: true,
        category: 'setup',
        icon: 'folder'
      },
      {
        id: 'creating_files',
        label: 'Creating files',
        description: 'Generate all source code files before filling in logic.',
        supportsMultipleEvents: true,
        allowedStatuses: ['pending', 'running', 'done', 'error', 'cancelled'],
        expectedPayloadSchema: {
          file: { type: 'string', required: true }
        },
        dependencies: ['creating_workspace'],
        timeout: 600000,
        retryable: true,
        critical: true,
        category: 'generation',
        icon: 'code'
      },
      {
        id: 'coding_file',
        label: 'Coding file',
        description: 'Inject logic into each generated file.',
        supportsMultipleEvents: true,
        allowedStatuses: ['pending', 'running', 'done', 'error', 'cancelled'],
        expectedPayloadSchema: {
          file: { type: 'string', required: true },
          error: { type: 'string', required: false }
        },
        dependencies: ['creating_files'],
        timeout: 1200000,
        retryable: true,
        critical: true,
        category: 'generation',
        icon: 'code'
      },
      {
        id: 'running_tests',
        label: 'Running tests',
        description: 'Execute runtime tests, type checks, linting, integration tests.',
        supportsMultipleEvents: true,
        allowedStatuses: ['pending', 'running', 'passed', 'failed', 'cancelled'],
        expectedPayloadSchema: {
          testName: { type: 'string', required: false },
          log: { type: 'string', required: false }
        },
        dependencies: ['coding_file'],
        timeout: 900000,
        retryable: true,
        critical: false,
        category: 'validation',
        icon: 'check-circle'
      },
      {
        id: 'creating_repo',
        label: 'Creating repository',
        description: 'Initialize Git repository on GitHub, configure branch, protection rules.',
        supportsMultipleEvents: false,
        allowedStatuses: ['pending', 'running', 'done', 'error', 'cancelled'],
        expectedPayloadSchema: {
          repoName: { type: 'string', required: false }
        },
        dependencies: ['running_tests'],
        timeout: 180000,
        retryable: true,
        critical: true,
        category: 'repository',
        icon: 'git-branch'
      },
      {
        id: 'repo_created',
        label: 'Repository created',
        description: 'Final repo metadata with name and URL.',
        supportsMultipleEvents: false,
        allowedStatuses: ['done', 'error', 'cancelled'],
        expectedPayloadSchema: {
          repoName: { type: 'string', required: true },
          repoUrl: { type: 'string', required: true }
        },
        dependencies: ['creating_repo'],
        timeout: 30000,
        retryable: false,
        critical: true,
        category: 'repository',
        icon: 'check'
      },
      {
        id: 'pushing_files',
        label: 'Pushing files to repo',
        description: 'Push all generated files to GitHub.',
        supportsMultipleEvents: false,
        allowedStatuses: ['pending', 'running', 'pushed', 'error', 'cancelled'],
        dependencies: ['repo_created'],
        timeout: 300000,
        retryable: true,
        critical: true,
        category: 'repository',
        icon: 'upload'
      },
      {
        id: 'deploying',
        label: 'Deploying to AWS',
        description: 'Provision infra (S3/Lambda/API Gateway/RDS) and deploy app.',
        supportsMultipleEvents: true,
        allowedStatuses: ['pending', 'running', 'deployed', 'error', 'cancelled'],
        expectedPayloadSchema: {
          resource: { type: 'string', required: false },
          log: { type: 'string', required: false }
        },
        dependencies: ['pushing_files'],
        timeout: 1800000,
        retryable: true,
        critical: false,
        category: 'deployment',
        icon: 'cloud'
      },
      {
        id: 'deployment_complete',
        label: 'App deployed',
        description: 'Final deployment result + all resource links.',
        supportsMultipleEvents: false,
        allowedStatuses: ['deployed', 'error', 'cancelled'],
        expectedPayloadSchema: {
          appUrl: { type: 'string', required: true },
          resources: {
            type: 'object',
            required: true,
            properties: {
              s3: { type: 'string', required: false },
              database: { type: 'string', required: false },
              lambdas: { type: 'array', required: false },
              api: { type: 'string', required: false }
            }
          }
        },
        dependencies: ['deploying'],
        timeout: 60000,
        retryable: false,
        critical: true,
        category: 'deployment',
        icon: 'check-circle'
      }
    ];

    // Register each built-in stage
    builtInStages.forEach(stage => {
      this.registerStage(stage);
    });

    // Register default renderer and validator
    this.registerRenderer('default', null); // Will be set by StageRenderer component
    this.registerValidator('default', this.defaultPayloadValidation.bind(this));
  }

  /**
   * Load custom stages from configuration
   */
  async loadCustomStages() {
    try {
      // Try to load custom stages from local storage or API
      const customStagesConfig = localStorage.getItem('customStages');
      if (customStagesConfig) {
        const customStages = JSON.parse(customStagesConfig);
        if (Array.isArray(customStages)) {
          customStages.forEach(stage => {
            try {
              this.registerStage(stage);
            } catch (error) {
              console.warn(`Failed to register custom stage ${stage.id}:`, error.message);
            }
          });
        }
      }
    } catch (error) {
      console.warn('Failed to load custom stages:', error.message);
    }
  }

  /**
   * Save custom stages to configuration
   */
  async saveCustomStages() {
    try {
      const customStages = this.getAllStages().filter(stage => !stage.metadata?.builtIn);
      localStorage.setItem('customStages', JSON.stringify(customStages));
    } catch (error) {
      console.warn('Failed to save custom stages:', error.message);
    }
  }

  /**
   * Remove stage from registry
   */
  unregisterStage(stageId) {
    const stage = this.getStage(stageId);
    if (stage && stage.metadata?.builtIn) {
      throw new Error('Cannot unregister built-in stage');
    }

    this.stages.delete(stageId);
    this.renderers.delete(stageId);
    this.validators.delete(stageId);
    this.payloadSchemas.delete(stageId);
  }

  /**
   * Get stage categories
   */
  getStageCategories() {
    const categories = new Set();
    this.stages.forEach(stage => {
      categories.add(stage.category);
    });
    return Array.from(categories).sort();
  }

  /**
   * Get stages by category
   */
  getStagesByCategory(category) {
    return this.getAllStages().filter(stage => stage.category === category);
  }

  /**
   * Create stage instance from definition
   */
  createStageInstance(stageId, overrides = {}) {
    const definition = this.getStage(stageId);
    if (!definition) {
      throw new Error(`Stage definition not found: ${stageId}`);
    }

    return {
      id: definition.id,
      label: definition.label,
      description: definition.description,
      status: STAGE_STATUS.PENDING,
      supportsMultipleEvents: definition.supportsMultipleEvents,
      allowedStatuses: [...definition.allowedStatuses],
      startedAt: null,
      completedAt: null,
      events: [],
      error: null,
      ...overrides
    };
  }
}

// Create singleton instance
export const stageRegistry = new StageRegistry();

// Initialize on module load
stageRegistry.initialize().catch(error => {
  console.error('Failed to initialize stage registry:', error);
});

export default stageRegistry;