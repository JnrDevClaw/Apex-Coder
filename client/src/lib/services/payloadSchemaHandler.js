/**
 * Payload Schema Handler
 * Manages custom payload schemas for different stage types
 * Requirements: 4.2
 */

import { stageRegistry } from './stageRegistry.js';

/**
 * Payload schema handler class
 */
export class PayloadSchemaHandler {
  constructor() {
    this.schemas = new Map();
    this.validators = new Map();
    this.transformers = new Map();
    this.formatters = new Map();
    this.initializeBuiltInSchemas();
  }

  /**
   * Initialize built-in payload schemas
   */
  initializeBuiltInSchemas() {
    // File-related payload schema
    this.registerSchema('file-operation', {
      file: {
        type: 'string',
        required: true,
        minLength: 1,
        maxLength: 500,
        description: 'File path or name'
      },
      operation: {
        type: 'string',
        required: false,
        enum: ['create', 'update', 'delete', 'read'],
        description: 'Type of file operation'
      },
      size: {
        type: 'number',
        required: false,
        min: 0,
        description: 'File size in bytes'
      },
      error: {
        type: 'string',
        required: false,
        description: 'Error message if operation failed'
      }
    });

    // Test-related payload schema
    this.registerSchema('test-execution', {
      testName: {
        type: 'string',
        required: false,
        minLength: 1,
        maxLength: 200,
        description: 'Name of the test being executed'
      },
      testSuite: {
        type: 'string',
        required: false,
        description: 'Test suite or category'
      },
      status: {
        type: 'string',
        required: false,
        enum: ['pending', 'running', 'passed', 'failed', 'skipped'],
        description: 'Test execution status'
      },
      duration: {
        type: 'number',
        required: false,
        min: 0,
        description: 'Test execution time in milliseconds'
      },
      log: {
        type: 'string',
        required: false,
        description: 'Test output or log messages'
      },
      assertions: {
        type: 'number',
        required: false,
        min: 0,
        description: 'Number of assertions in test'
      }
    });

    // Repository-related payload schema
    this.registerSchema('repository-operation', {
      repoName: {
        type: 'string',
        required: false,
        minLength: 1,
        maxLength: 100,
        pattern: /^[a-zA-Z0-9._-]+$/,
        description: 'Repository name'
      },
      repoUrl: {
        type: 'string',
        required: false,
        pattern: /^https?:\/\/.+/,
        description: 'Repository URL'
      },
      branch: {
        type: 'string',
        required: false,
        default: 'main',
        description: 'Git branch name'
      },
      commit: {
        type: 'string',
        required: false,
        minLength: 7,
        maxLength: 40,
        description: 'Git commit hash'
      },
      operation: {
        type: 'string',
        required: false,
        enum: ['create', 'clone', 'push', 'pull', 'commit'],
        description: 'Repository operation type'
      }
    });

    // Deployment-related payload schema
    this.registerSchema('deployment-operation', {
      resource: {
        type: 'string',
        required: false,
        description: 'Resource being deployed'
      },
      resourceType: {
        type: 'string',
        required: false,
        enum: ['s3', 'lambda', 'api-gateway', 'rds', 'cloudfront', 'ecs'],
        description: 'Type of AWS resource'
      },
      region: {
        type: 'string',
        required: false,
        pattern: /^[a-z0-9-]+$/,
        description: 'AWS region'
      },
      status: {
        type: 'string',
        required: false,
        enum: ['creating', 'updating', 'deleting', 'available', 'failed'],
        description: 'Resource deployment status'
      },
      url: {
        type: 'string',
        required: false,
        pattern: /^https?:\/\/.+/,
        description: 'Resource access URL'
      },
      log: {
        type: 'string',
        required: false,
        description: 'Deployment log messages'
      }
    });

    // Workspace-related payload schema
    this.registerSchema('workspace-operation', {
      workspaceRoot: {
        type: 'string',
        required: false,
        description: 'Root directory of workspace'
      },
      path: {
        type: 'string',
        required: false,
        description: 'File or directory path'
      },
      operation: {
        type: 'string',
        required: false,
        enum: ['create', 'delete', 'move', 'copy'],
        description: 'Workspace operation type'
      },
      permissions: {
        type: 'string',
        required: false,
        pattern: /^[0-7]{3,4}$/,
        description: 'File permissions (octal)'
      }
    });

    // Generic progress payload schema
    this.registerSchema('progress-update', {
      current: {
        type: 'number',
        required: false,
        min: 0,
        description: 'Current progress value'
      },
      total: {
        type: 'number',
        required: false,
        min: 1,
        description: 'Total progress value'
      },
      percentage: {
        type: 'number',
        required: false,
        min: 0,
        max: 100,
        description: 'Progress percentage'
      },
      message: {
        type: 'string',
        required: false,
        description: 'Progress message'
      },
      eta: {
        type: 'string',
        required: false,
        description: 'Estimated time of completion (ISO string)'
      }
    });

    // Register default validators and formatters
    this.registerValidator('default', this.defaultValidator.bind(this));
    this.registerFormatter('default', this.defaultFormatter.bind(this));
  }

  /**
   * Register a payload schema
   */
  registerSchema(schemaId, schema) {
    if (!schemaId || typeof schemaId !== 'string') {
      throw new Error('Schema ID must be a non-empty string');
    }

    if (!schema || typeof schema !== 'object') {
      throw new Error('Schema must be an object');
    }

    // Validate schema structure
    const validation = this.validateSchemaStructure(schema);
    if (!validation.isValid) {
      throw new Error(`Invalid schema structure: ${validation.errors.join(', ')}`);
    }

    this.schemas.set(schemaId, schema);
  }

  /**
   * Get payload schema by ID
   */
  getSchema(schemaId) {
    return this.schemas.get(schemaId);
  }

  /**
   * Get all registered schemas
   */
  getAllSchemas() {
    return new Map(this.schemas);
  }

  /**
   * Register a custom validator for a schema
   */
  registerValidator(schemaId, validatorFunction) {
    if (typeof validatorFunction !== 'function') {
      throw new Error('Validator must be a function');
    }

    this.validators.set(schemaId, validatorFunction);
  }

  /**
   * Register a payload transformer
   */
  registerTransformer(schemaId, transformerFunction) {
    if (typeof transformerFunction !== 'function') {
      throw new Error('Transformer must be a function');
    }

    this.transformers.set(schemaId, transformerFunction);
  }

  /**
   * Register a payload formatter
   */
  registerFormatter(schemaId, formatterFunction) {
    if (typeof formatterFunction !== 'function') {
      throw new Error('Formatter must be a function');
    }

    this.formatters.set(schemaId, formatterFunction);
  }

  /**
   * Validate payload against schema
   */
  validatePayload(payload, schemaId) {
    const schema = this.getSchema(schemaId);
    if (!schema) {
      return { isValid: true, errors: [], warnings: [] };
    }

    // Use custom validator if available
    const validator = this.validators.get(schemaId) || this.validators.get('default');
    return validator(payload, schema);
  }

  /**
   * Transform payload using registered transformer
   */
  transformPayload(payload, schemaId) {
    const transformer = this.transformers.get(schemaId);
    if (!transformer) {
      return payload;
    }

    try {
      return transformer(payload);
    } catch (error) {
      console.warn(`Payload transformation failed for schema ${schemaId}:`, error);
      return payload;
    }
  }

  /**
   * Format payload for display
   */
  formatPayload(payload, schemaId) {
    const formatter = this.formatters.get(schemaId) || this.formatters.get('default');
    return formatter(payload, this.getSchema(schemaId));
  }

  /**
   * Default payload validator
   */
  defaultValidator(payload, schema) {
    const errors = [];
    const warnings = [];

    if (!payload || typeof payload !== 'object') {
      if (this.hasRequiredFields(schema)) {
        errors.push('Payload must be an object when schema has required fields');
      }
      return { isValid: errors.length === 0, errors, warnings };
    }

    // Validate each field in schema
    for (const [fieldName, fieldSchema] of Object.entries(schema)) {
      const value = payload[fieldName];
      const fieldErrors = this.validateField(fieldName, value, fieldSchema);
      
      errors.push(...fieldErrors.filter(e => e.severity !== 'warning'));
      warnings.push(...fieldErrors.filter(e => e.severity === 'warning'));
    }

    // Check for unexpected fields
    for (const fieldName of Object.keys(payload)) {
      if (!(fieldName in schema)) {
        warnings.push({
          field: fieldName,
          message: `Unexpected field '${fieldName}' not defined in schema`,
          severity: 'warning'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate individual field
   */
  validateField(fieldName, value, fieldSchema) {
    const errors = [];

    // Check required fields
    if (fieldSchema.required && (value === undefined || value === null || value === '')) {
      errors.push({
        field: fieldName,
        message: 'Field is required',
        severity: 'error'
      });
      return errors;
    }

    // Skip validation if field is not required and empty
    if (!fieldSchema.required && (value === undefined || value === null || value === '')) {
      return errors;
    }

    // Type validation
    if (fieldSchema.type && typeof value !== fieldSchema.type) {
      errors.push({
        field: fieldName,
        message: `Expected ${fieldSchema.type}, got ${typeof value}`,
        severity: 'error'
      });
      return errors; // Don't continue if type is wrong
    }

    // String validations
    if (fieldSchema.type === 'string' && typeof value === 'string') {
      if (fieldSchema.minLength && value.length < fieldSchema.minLength) {
        errors.push({
          field: fieldName,
          message: `Minimum length is ${fieldSchema.minLength}`,
          severity: 'error'
        });
      }

      if (fieldSchema.maxLength && value.length > fieldSchema.maxLength) {
        errors.push({
          field: fieldName,
          message: `Maximum length is ${fieldSchema.maxLength}`,
          severity: 'error'
        });
      }

      if (fieldSchema.pattern && !fieldSchema.pattern.test(value)) {
        errors.push({
          field: fieldName,
          message: 'Value does not match required pattern',
          severity: 'error'
        });
      }

      if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
        errors.push({
          field: fieldName,
          message: `Value must be one of: ${fieldSchema.enum.join(', ')}`,
          severity: 'error'
        });
      }
    }

    // Number validations
    if (fieldSchema.type === 'number' && typeof value === 'number') {
      if (fieldSchema.min !== undefined && value < fieldSchema.min) {
        errors.push({
          field: fieldName,
          message: `Minimum value is ${fieldSchema.min}`,
          severity: 'error'
        });
      }

      if (fieldSchema.max !== undefined && value > fieldSchema.max) {
        errors.push({
          field: fieldName,
          message: `Maximum value is ${fieldSchema.max}`,
          severity: 'error'
        });
      }
    }

    // Array validations
    if (fieldSchema.type === 'array' && Array.isArray(value)) {
      if (fieldSchema.minItems && value.length < fieldSchema.minItems) {
        errors.push({
          field: fieldName,
          message: `Minimum ${fieldSchema.minItems} items required`,
          severity: 'error'
        });
      }

      if (fieldSchema.maxItems && value.length > fieldSchema.maxItems) {
        errors.push({
          field: fieldName,
          message: `Maximum ${fieldSchema.maxItems} items allowed`,
          severity: 'error'
        });
      }
    }

    return errors;
  }

  /**
   * Default payload formatter
   */
  defaultFormatter(payload, schema) {
    if (!payload || typeof payload !== 'object') {
      return 'No payload data';
    }

    const formatted = [];

    for (const [key, value] of Object.entries(payload)) {
      const fieldSchema = schema?.[key];
      const displayName = fieldSchema?.description || key;
      
      let displayValue = value;
      
      // Format based on type
      if (typeof value === 'object' && value !== null) {
        displayValue = JSON.stringify(value);
      } else if (typeof value === 'boolean') {
        displayValue = value ? 'Yes' : 'No';
      } else if (typeof value === 'number' && fieldSchema?.type === 'number') {
        // Format numbers based on schema hints
        if (key.includes('size') || key.includes('bytes')) {
          displayValue = this.formatBytes(value);
        } else if (key.includes('duration') || key.includes('time')) {
          displayValue = this.formatDuration(value);
        } else if (key.includes('percentage') || key.includes('percent')) {
          displayValue = `${value}%`;
        }
      }

      formatted.push(`${displayName}: ${displayValue}`);
    }

    return formatted.join(', ');
  }

  /**
   * Format bytes to human readable format
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Format duration to human readable format
   */
  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  }

  /**
   * Check if schema has required fields
   */
  hasRequiredFields(schema) {
    return Object.values(schema).some(fieldSchema => fieldSchema.required);
  }

  /**
   * Validate schema structure
   */
  validateSchemaStructure(schema) {
    const errors = [];

    for (const [fieldName, fieldSchema] of Object.entries(schema)) {
      if (!fieldSchema || typeof fieldSchema !== 'object') {
        errors.push(`Field '${fieldName}' schema must be an object`);
        continue;
      }

      // Validate field schema properties
      if (fieldSchema.type && !['string', 'number', 'boolean', 'array', 'object'].includes(fieldSchema.type)) {
        errors.push(`Field '${fieldName}' has invalid type: ${fieldSchema.type}`);
      }

      if (fieldSchema.required !== undefined && typeof fieldSchema.required !== 'boolean') {
        errors.push(`Field '${fieldName}' required property must be boolean`);
      }

      if (fieldSchema.enum && !Array.isArray(fieldSchema.enum)) {
        errors.push(`Field '${fieldName}' enum property must be an array`);
      }

      if (fieldSchema.pattern && !(fieldSchema.pattern instanceof RegExp)) {
        errors.push(`Field '${fieldName}' pattern property must be a RegExp`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Infer schema from payload examples
   */
  inferSchemaFromPayloads(payloads) {
    if (!Array.isArray(payloads) || payloads.length === 0) {
      return {};
    }

    const schema = {};
    const fieldStats = {};

    // Analyze all payloads
    payloads.forEach(payload => {
      if (payload && typeof payload === 'object') {
        for (const [key, value] of Object.entries(payload)) {
          if (!fieldStats[key]) {
            fieldStats[key] = {
              types: new Set(),
              required: 0,
              examples: []
            };
          }

          fieldStats[key].types.add(typeof value);
          if (value !== undefined && value !== null && value !== '') {
            fieldStats[key].required++;
          }
          
          if (fieldStats[key].examples.length < 5) {
            fieldStats[key].examples.push(value);
          }
        }
      }
    });

    // Generate schema from statistics
    for (const [fieldName, stats] of Object.entries(fieldStats)) {
      const fieldSchema = {};

      // Determine most common type
      const typeArray = Array.from(stats.types);
      if (typeArray.length === 1) {
        fieldSchema.type = typeArray[0];
      } else if (typeArray.includes('string')) {
        fieldSchema.type = 'string'; // Default to string for mixed types
      }

      // Determine if field is required (present in >50% of payloads)
      fieldSchema.required = (stats.required / payloads.length) > 0.5;

      // Add constraints based on examples
      if (fieldSchema.type === 'string') {
        const lengths = stats.examples.filter(v => typeof v === 'string').map(v => v.length);
        if (lengths.length > 0) {
          fieldSchema.maxLength = Math.max(...lengths) * 2; // Conservative estimate
        }

        // Check if all examples match a pattern
        const stringExamples = stats.examples.filter(v => typeof v === 'string');
        if (stringExamples.length > 0) {
          // Check for URL pattern
          if (stringExamples.every(v => /^https?:\/\//.test(v))) {
            fieldSchema.pattern = /^https?:\/\/.+/;
          }
          // Check for enum pattern (limited unique values)
          const uniqueValues = [...new Set(stringExamples)];
          if (uniqueValues.length <= 5 && stringExamples.length > uniqueValues.length) {
            fieldSchema.enum = uniqueValues;
          }
        }
      }

      schema[fieldName] = fieldSchema;
    }

    return schema;
  }

  /**
   * Merge schemas
   */
  mergeSchemas(baseSchema, extensionSchema) {
    const merged = { ...baseSchema };

    for (const [fieldName, fieldSchema] of Object.entries(extensionSchema)) {
      if (merged[fieldName]) {
        // Merge field schemas
        merged[fieldName] = {
          ...merged[fieldName],
          ...fieldSchema
        };
      } else {
        merged[fieldName] = fieldSchema;
      }
    }

    return merged;
  }

  /**
   * Create schema variant
   */
  createSchemaVariant(baseSchemaId, variantId, modifications) {
    const baseSchema = this.getSchema(baseSchemaId);
    if (!baseSchema) {
      throw new Error(`Base schema '${baseSchemaId}' not found`);
    }

    const variantSchema = { ...baseSchema };

    // Apply modifications
    if (modifications.add) {
      Object.assign(variantSchema, modifications.add);
    }

    if (modifications.remove) {
      modifications.remove.forEach(fieldName => {
        delete variantSchema[fieldName];
      });
    }

    if (modifications.modify) {
      for (const [fieldName, changes] of Object.entries(modifications.modify)) {
        if (variantSchema[fieldName]) {
          variantSchema[fieldName] = {
            ...variantSchema[fieldName],
            ...changes
          };
        }
      }
    }

    this.registerSchema(variantId, variantSchema);
    return variantSchema;
  }

  /**
   * Get schema suggestions for stage type
   */
  getSchemaSuggestions(stageId) {
    const suggestions = [];

    // Map stage types to suggested schemas
    const stageSchemaMap = {
      'creating_files': ['file-operation'],
      'coding_file': ['file-operation'],
      'running_tests': ['test-execution'],
      'creating_repo': ['repository-operation'],
      'repo_created': ['repository-operation'],
      'pushing_files': ['repository-operation'],
      'deploying': ['deployment-operation'],
      'deployment_complete': ['deployment-operation'],
      'creating_workspace': ['workspace-operation']
    };

    const suggestedSchemas = stageSchemaMap[stageId] || [];
    
    suggestedSchemas.forEach(schemaId => {
      const schema = this.getSchema(schemaId);
      if (schema) {
        suggestions.push({
          id: schemaId,
          schema,
          description: `Recommended schema for ${stageId} stage`
        });
      }
    });

    // Always include generic schemas
    suggestions.push({
      id: 'progress-update',
      schema: this.getSchema('progress-update'),
      description: 'Generic progress tracking schema'
    });

    return suggestions;
  }
}

// Create singleton instance
export const payloadSchemaHandler = new PayloadSchemaHandler();

export default payloadSchemaHandler;