/**
 * Stage Definition Validation Service
 * Provides comprehensive validation for stage definitions and configurations
 * Requirements: 4.1, 4.2, 4.4
 */

import { STAGE_STATUS } from '../schemas/pipeline.js';

/**
 * Stage validation error class
 */
export class StageValidationError extends Error {
  constructor(field, message, value = null, severity = 'error') {
    super(`Stage validation ${severity} for field '${field}': ${message}`);
    this.field = field;
    this.value = value;
    this.severity = severity; // 'error', 'warning', 'info'
    this.name = 'StageValidationError';
  }
}

/**
 * Stage validator class
 */
export class StageValidator {
  constructor() {
    this.rules = new Map();
    this.customValidators = new Map();
    this.initializeDefaultRules();
  }

  /**
   * Initialize default validation rules
   */
  initializeDefaultRules() {
    // ID validation rules
    this.addRule('id', {
      required: true,
      type: 'string',
      pattern: /^[a-z0-9_-]+$/,
      minLength: 1,
      maxLength: 50,
      message: 'Stage ID must contain only lowercase letters, numbers, underscores, and hyphens'
    });

    // Label validation rules
    this.addRule('label', {
      required: true,
      type: 'string',
      minLength: 1,
      maxLength: 100,
      message: 'Stage label must be between 1 and 100 characters'
    });

    // Description validation rules
    this.addRule('description', {
      required: true,
      type: 'string',
      minLength: 1,
      maxLength: 500,
      message: 'Stage description must be between 1 and 500 characters'
    });

    // supportsMultipleEvents validation
    this.addRule('supportsMultipleEvents', {
      required: true,
      type: 'boolean',
      message: 'supportsMultipleEvents must be a boolean value'
    });

    // allowedStatuses validation
    this.addRule('allowedStatuses', {
      required: true,
      type: 'array',
      minItems: 1,
      itemType: 'string',
      itemEnum: Object.values(STAGE_STATUS),
      message: 'allowedStatuses must be a non-empty array of valid stage statuses'
    });

    // Optional field rules
    this.addRule('dependencies', {
      required: false,
      type: 'array',
      itemType: 'string',
      message: 'dependencies must be an array of stage IDs'
    });

    this.addRule('timeout', {
      required: false,
      type: 'number',
      min: 1000,
      max: 3600000,
      message: 'timeout must be between 1000ms (1s) and 3600000ms (1h)'
    });

    this.addRule('retryable', {
      required: false,
      type: 'boolean',
      message: 'retryable must be a boolean value'
    });

    this.addRule('critical', {
      required: false,
      type: 'boolean',
      message: 'critical must be a boolean value'
    });

    this.addRule('version', {
      required: false,
      type: 'string',
      pattern: /^\d+\.\d+\.\d+$/,
      message: 'version must be a valid semver string (e.g., "1.0.0")'
    });

    this.addRule('category', {
      required: false,
      type: 'string',
      minLength: 1,
      maxLength: 50,
      message: 'category must be between 1 and 50 characters'
    });

    this.addRule('icon', {
      required: false,
      type: 'string',
      minLength: 1,
      maxLength: 50,
      message: 'icon must be between 1 and 50 characters'
    });
  }

  /**
   * Add a validation rule
   */
  addRule(field, rule) {
    this.rules.set(field, rule);
  }

  /**
   * Remove a validation rule
   */
  removeRule(field) {
    this.rules.delete(field);
  }

  /**
   * Add a custom validator function
   */
  addCustomValidator(name, validatorFunction) {
    if (typeof validatorFunction !== 'function') {
      throw new Error('Custom validator must be a function');
    }
    this.customValidators.set(name, validatorFunction);
  }

  /**
   * Validate a single stage definition
   */
  validateStageDefinition(stageDefinition, context = {}) {
    const errors = [];
    const warnings = [];

    if (!stageDefinition || typeof stageDefinition !== 'object') {
      errors.push(new StageValidationError('root', 'Stage definition must be an object'));
      return { isValid: false, errors, warnings };
    }

    // Validate each field against rules
    for (const [fieldName, rule] of this.rules.entries()) {
      const fieldErrors = this.validateField(fieldName, stageDefinition[fieldName], rule, stageDefinition);
      errors.push(...fieldErrors.filter(e => e.severity === 'error'));
      warnings.push(...fieldErrors.filter(e => e.severity === 'warning'));
    }

    // Run custom validators
    for (const [name, validator] of this.customValidators.entries()) {
      try {
        const result = validator(stageDefinition, context);
        if (result && result.errors) {
          errors.push(...result.errors.filter(e => e.severity === 'error'));
          warnings.push(...result.errors.filter(e => e.severity === 'warning'));
        }
      } catch (error) {
        errors.push(new StageValidationError('custom', `Custom validator '${name}' failed: ${error.message}`));
      }
    }

    // Cross-field validation
    const crossValidationErrors = this.performCrossFieldValidation(stageDefinition, context);
    errors.push(...crossValidationErrors.filter(e => e.severity === 'error'));
    warnings.push(...crossValidationErrors.filter(e => e.severity === 'warning'));

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate a field against its rule
   */
  validateField(fieldName, value, rule, stageDefinition) {
    const errors = [];

    // Check if required field is missing
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push(new StageValidationError(fieldName, 'Field is required'));
      return errors;
    }

    // Skip validation if field is not required and empty
    if (!rule.required && (value === undefined || value === null || value === '')) {
      return errors;
    }

    // Type validation
    if (rule.type && typeof value !== rule.type) {
      errors.push(new StageValidationError(fieldName, `Expected ${rule.type}, got ${typeof value}`, value));
      return errors; // Don't continue if type is wrong
    }

    // String-specific validations
    if (rule.type === 'string' && typeof value === 'string') {
      if (rule.minLength && value.length < rule.minLength) {
        errors.push(new StageValidationError(fieldName, `Minimum length is ${rule.minLength}`, value));
      }
      if (rule.maxLength && value.length > rule.maxLength) {
        errors.push(new StageValidationError(fieldName, `Maximum length is ${rule.maxLength}`, value));
      }
      if (rule.pattern && !rule.pattern.test(value)) {
        errors.push(new StageValidationError(fieldName, rule.message || 'Value does not match required pattern', value));
      }
    }

    // Number-specific validations
    if (rule.type === 'number' && typeof value === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        errors.push(new StageValidationError(fieldName, `Minimum value is ${rule.min}`, value));
      }
      if (rule.max !== undefined && value > rule.max) {
        errors.push(new StageValidationError(fieldName, `Maximum value is ${rule.max}`, value));
      }
    }

    // Array-specific validations
    if (rule.type === 'array' && Array.isArray(value)) {
      if (rule.minItems && value.length < rule.minItems) {
        errors.push(new StageValidationError(fieldName, `Minimum ${rule.minItems} items required`, value));
      }
      if (rule.maxItems && value.length > rule.maxItems) {
        errors.push(new StageValidationError(fieldName, `Maximum ${rule.maxItems} items allowed`, value));
      }

      // Validate array items
      if (rule.itemType) {
        value.forEach((item, index) => {
          if (typeof item !== rule.itemType) {
            errors.push(new StageValidationError(
              `${fieldName}[${index}]`,
              `Expected ${rule.itemType}, got ${typeof item}`,
              item
            ));
          }
        });
      }

      // Validate enum values
      if (rule.itemEnum) {
        value.forEach((item, index) => {
          if (!rule.itemEnum.includes(item)) {
            errors.push(new StageValidationError(
              `${fieldName}[${index}]`,
              `Invalid value: ${item}. Must be one of: ${rule.itemEnum.join(', ')}`,
              item
            ));
          }
        });
      }
    }

    return errors;
  }

  /**
   * Perform cross-field validation
   */
  performCrossFieldValidation(stageDefinition, context) {
    const errors = [];

    // Validate status transitions make sense
    if (stageDefinition.allowedStatuses && Array.isArray(stageDefinition.allowedStatuses)) {
      // Must include 'pending' as starting status
      if (!stageDefinition.allowedStatuses.includes(STAGE_STATUS.PENDING)) {
        errors.push(new StageValidationError(
          'allowedStatuses',
          'Must include "pending" as a valid status',
          stageDefinition.allowedStatuses,
          'warning'
        ));
      }

      // Should include at least one completion status
      const completionStatuses = [STAGE_STATUS.DONE, STAGE_STATUS.CREATED, STAGE_STATUS.PASSED, STAGE_STATUS.DEPLOYED];
      const hasCompletionStatus = stageDefinition.allowedStatuses.some(status => completionStatuses.includes(status));
      if (!hasCompletionStatus) {
        errors.push(new StageValidationError(
          'allowedStatuses',
          'Should include at least one completion status (done, created, passed, deployed)',
          stageDefinition.allowedStatuses,
          'warning'
        ));
      }
    }

    // Validate dependencies exist in context
    if (stageDefinition.dependencies && Array.isArray(stageDefinition.dependencies) && context.allStageIds) {
      stageDefinition.dependencies.forEach((depId, index) => {
        if (!context.allStageIds.includes(depId)) {
          errors.push(new StageValidationError(
            `dependencies[${index}]`,
            `Dependency stage '${depId}' does not exist`,
            depId
          ));
        }
        if (depId === stageDefinition.id) {
          errors.push(new StageValidationError(
            `dependencies[${index}]`,
            'Stage cannot depend on itself',
            depId
          ));
        }
      });
    }

    // Validate timeout is reasonable for stage type
    if (stageDefinition.timeout && stageDefinition.supportsMultipleEvents) {
      if (stageDefinition.timeout < 60000) { // Less than 1 minute
        errors.push(new StageValidationError(
          'timeout',
          'Multi-event stages should have timeout >= 60 seconds',
          stageDefinition.timeout,
          'warning'
        ));
      }
    }

    // Validate critical stages have appropriate settings
    if (stageDefinition.critical && stageDefinition.retryable === false) {
      errors.push(new StageValidationError(
        'retryable',
        'Critical stages should typically be retryable',
        stageDefinition.retryable,
        'warning'
      ));
    }

    return errors;
  }

  /**
   * Validate multiple stage definitions as a pipeline
   */
  validatePipelineStages(stages) {
    const errors = [];
    const warnings = [];

    if (!Array.isArray(stages)) {
      errors.push(new StageValidationError('stages', 'Stages must be an array'));
      return { isValid: false, errors, warnings };
    }

    if (stages.length === 0) {
      errors.push(new StageValidationError('stages', 'At least one stage is required'));
      return { isValid: false, errors, warnings };
    }

    const stageIds = new Set();
    const allStageIds = stages.map(stage => stage.id).filter(Boolean);

    // Validate each stage
    stages.forEach((stage, index) => {
      const context = { allStageIds, stageIndex: index };
      const validation = this.validateStageDefinition(stage, context);

      // Add stage index to error paths
      validation.errors.forEach(error => {
        error.field = `stages[${index}].${error.field}`;
        errors.push(error);
      });

      validation.warnings.forEach(warning => {
        warning.field = `stages[${index}].${warning.field}`;
        warnings.push(warning);
      });

      // Check for duplicate IDs
      if (stage.id) {
        if (stageIds.has(stage.id)) {
          errors.push(new StageValidationError(
            `stages[${index}].id`,
            `Duplicate stage ID: ${stage.id}`,
            stage.id
          ));
        } else {
          stageIds.add(stage.id);
        }
      }
    });

    // Check for circular dependencies
    const circularDeps = this.detectCircularDependencies(stages);
    if (circularDeps.length > 0) {
      circularDeps.forEach(cycle => {
        errors.push(new StageValidationError(
          'stages',
          `Circular dependency detected: ${cycle.join(' -> ')}`,
          cycle
        ));
      });
    }

    // Validate execution order
    const executionOrderErrors = this.validateExecutionOrder(stages);
    errors.push(...executionOrderErrors);

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Detect circular dependencies
   */
  detectCircularDependencies(stages) {
    const graph = new Map();
    const cycles = [];

    // Build dependency graph
    stages.forEach(stage => {
      if (stage.id) {
        graph.set(stage.id, stage.dependencies || []);
      }
    });

    // Detect cycles using DFS
    const visited = new Set();
    const recursionStack = new Set();

    function dfs(nodeId, path = []) {
      if (recursionStack.has(nodeId)) {
        // Found a cycle
        const cycleStart = path.indexOf(nodeId);
        if (cycleStart >= 0) {
          cycles.push([...path.slice(cycleStart), nodeId]);
        }
        return;
      }

      if (visited.has(nodeId)) {
        return;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const dependencies = graph.get(nodeId) || [];
      dependencies.forEach(depId => {
        dfs(depId, [...path, nodeId]);
      });

      recursionStack.delete(nodeId);
    }

    // Check each node
    graph.forEach((_, nodeId) => {
      if (!visited.has(nodeId)) {
        dfs(nodeId);
      }
    });

    return cycles;
  }

  /**
   * Validate execution order
   */
  validateExecutionOrder(stages) {
    const errors = [];
    const stageMap = new Map();

    // Build stage map
    stages.forEach(stage => {
      if (stage.id) {
        stageMap.set(stage.id, stage);
      }
    });

    // Check dependencies can be satisfied
    stages.forEach((stage, index) => {
      if (stage.dependencies && stage.dependencies.length > 0) {
        stage.dependencies.forEach(depId => {
          const depStage = stageMap.get(depId);
          if (!depStage) {
            errors.push(new StageValidationError(
              `stages[${index}].dependencies`,
              `Dependency stage '${depId}' does not exist`,
              depId
            ));
            return;
          }

          // Check if dependency comes before current stage in array
          const depIndex = stages.findIndex(s => s.id === depId);
          if (depIndex > index) {
            errors.push(new StageValidationError(
              `stages[${index}].dependencies`,
              `Dependency '${depId}' appears later in execution order`,
              depId,
              'warning'
            ));
          }
        });
      }
    });

    return errors;
  }

  /**
   * Validate payload schema definition
   */
  validatePayloadSchema(schema) {
    const errors = [];

    if (!schema || typeof schema !== 'object') {
      return { isValid: true, errors }; // Empty schema is valid
    }

    for (const [fieldName, fieldSchema] of Object.entries(schema)) {
      if (!fieldSchema || typeof fieldSchema !== 'object') {
        errors.push(new StageValidationError(
          `payloadSchema.${fieldName}`,
          'Field schema must be an object',
          fieldSchema
        ));
        continue;
      }

      // Validate field schema properties
      if (fieldSchema.type && !['string', 'number', 'boolean', 'array', 'object'].includes(fieldSchema.type)) {
        errors.push(new StageValidationError(
          `payloadSchema.${fieldName}.type`,
          'Invalid type. Must be one of: string, number, boolean, array, object',
          fieldSchema.type
        ));
      }

      if (fieldSchema.required !== undefined && typeof fieldSchema.required !== 'boolean') {
        errors.push(new StageValidationError(
          `payloadSchema.${fieldName}.required`,
          'required must be a boolean',
          fieldSchema.required
        ));
      }

      // Type-specific validations
      if (fieldSchema.type === 'string') {
        if (fieldSchema.minLength !== undefined && (typeof fieldSchema.minLength !== 'number' || fieldSchema.minLength < 0)) {
          errors.push(new StageValidationError(
            `payloadSchema.${fieldName}.minLength`,
            'minLength must be a non-negative number',
            fieldSchema.minLength
          ));
        }
        if (fieldSchema.maxLength !== undefined && (typeof fieldSchema.maxLength !== 'number' || fieldSchema.maxLength < 0)) {
          errors.push(new StageValidationError(
            `payloadSchema.${fieldName}.maxLength`,
            'maxLength must be a non-negative number',
            fieldSchema.maxLength
          ));
        }
      }

      if (fieldSchema.type === 'number') {
        if (fieldSchema.min !== undefined && typeof fieldSchema.min !== 'number') {
          errors.push(new StageValidationError(
            `payloadSchema.${fieldName}.min`,
            'min must be a number',
            fieldSchema.min
          ));
        }
        if (fieldSchema.max !== undefined && typeof fieldSchema.max !== 'number') {
          errors.push(new StageValidationError(
            `payloadSchema.${fieldName}.max`,
            'max must be a number',
            fieldSchema.max
          ));
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get validation summary
   */
  getValidationSummary(stages) {
    const validation = this.validatePipelineStages(stages);
    
    return {
      isValid: validation.isValid,
      totalErrors: validation.errors.length,
      totalWarnings: validation.warnings.length,
      stageCount: stages.length,
      errorsByStage: this.groupErrorsByStage(validation.errors),
      warningsByStage: this.groupErrorsByStage(validation.warnings),
      criticalErrors: validation.errors.filter(e => e.field.includes('id') || e.field.includes('allowedStatuses')),
      suggestions: this.generateSuggestions(validation.errors, validation.warnings)
    };
  }

  /**
   * Group errors by stage
   */
  groupErrorsByStage(errors) {
    const grouped = {};
    
    errors.forEach(error => {
      const match = error.field.match(/^stages\[(\d+)\]/);
      if (match) {
        const stageIndex = parseInt(match[1]);
        if (!grouped[stageIndex]) {
          grouped[stageIndex] = [];
        }
        grouped[stageIndex].push(error);
      } else {
        if (!grouped.global) {
          grouped.global = [];
        }
        grouped.global.push(error);
      }
    });
    
    return grouped;
  }

  /**
   * Generate suggestions based on errors and warnings
   */
  generateSuggestions(errors, warnings) {
    const suggestions = [];

    // Suggest common fixes
    if (errors.some(e => e.field.includes('allowedStatuses'))) {
      suggestions.push('Ensure all stages include valid status transitions including "pending" and at least one completion status');
    }

    if (errors.some(e => e.field.includes('dependencies'))) {
      suggestions.push('Check that all stage dependencies exist and are ordered correctly');
    }

    if (warnings.some(w => w.field.includes('timeout'))) {
      suggestions.push('Consider adjusting timeouts for multi-event stages to allow sufficient processing time');
    }

    if (errors.some(e => e.message.includes('Circular dependency'))) {
      suggestions.push('Remove circular dependencies by restructuring stage dependencies');
    }

    return suggestions;
  }
}

// Create singleton instance
export const stageValidator = new StageValidator();

export default stageValidator;