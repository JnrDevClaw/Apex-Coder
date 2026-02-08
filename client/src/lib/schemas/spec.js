/**
 * Enhanced SpecJSON Schema Definition and Validation
 * Platform is developer-only (non-developer mode removed)
 */

// Define the complete enhanced SpecJSON schema structure
export const specJsonSchema = {
  // User mode detection (developer only now)
  userMode: {
    type: 'string',
    required: true,
    enum: ['developer'],
    description: 'User mode - developer platform only'
  },

  // Core project context (required for all users)
  project_overview: {
    type: 'object',
    required: true,
    properties: {
      app_name: {
        type: 'string',
        required: true,
        minLength: 1,
        maxLength: 100,
        pattern: /^[a-zA-Z0-9\s\-_]+$/,
        description: 'Project name (alphanumeric, spaces, hyphens, underscores only)'
      },
      app_summary: {
        type: 'string',
        required: true,
        minLength: 10,
        maxLength: 200,
        description: 'Brief one-liner purpose summary'
      },
      app_details: {
        type: 'string',
        required: true,
        minLength: 20,
        maxLength: 1000,
        description: 'Core functions or modules description'
      },
      niche: {
        type: 'string',
        required: true,
        enum: ['music', 'social-media', 'education', 'finance', 'healthcare', 'ecommerce', 'productivity', 'entertainment', 'business', 'other'],
        description: 'Application niche/category'
      },
      potential_users: {
        type: 'string',
        required: true,
        minLength: 5,
        maxLength: 200,
        description: 'Target user groups'
      },
      estimated_user_count: {
        type: 'string',
        required: true,
        enum: ['1-100', '100-1000', '1000-10000', '10000+'],
        description: 'Expected user scale'
      },
      complexity_level: {
        type: 'number',
        required: true,
        min: 1,
        max: 10,
        description: 'Project complexity (1-10 scale)'
      }
    }
  },

  // User flow definition
  user_flow: {
    type: 'object',
    required: true,
    properties: {
      overview_flow: {
        type: 'string',
        required: true,
        minLength: 20,
        maxLength: 500,
        description: 'High-level user journey overview'
      },
      key_user_actions: {
        type: 'string',
        required: true,
        minLength: 10,
        maxLength: 300,
        description: 'Main actions users will perform'
      },
      user_journey: {
        type: 'array',
        required: false,
        items: {
          type: 'object',
          properties: {
            stage_name: { type: 'string', required: true },
            user_action: { type: 'string', required: true },
            system_response: { type: 'string', required: true },
            optional_data: { type: 'string', required: false },
            next_stage: { type: 'string', required: false }
          }
        },
        description: 'Detailed user journey stages'
      }
    }
  },

  // Page definitions
  pages: {
    type: 'array',
    required: true,
    minItems: 1,
    items: {
      type: 'object',
      properties: {
        page_name: { type: 'string', required: true },
        page_description: { type: 'string', required: true },
        data_collected_from_user: { type: 'array', items: { type: 'string' }, required: true },
        data_displayed_to_user: { type: 'array', items: { type: 'string' }, required: true },
        user_actions: { type: 'array', items: { type: 'string' }, required: true },
        access_level: { 
          type: 'string', 
          enum: ['public', 'authenticated', 'admin', 'premium'],
          required: true 
        }
      }
    },
    description: 'Application pages and their functionality'
  },

  // Data flow and privacy
  data_flow: {
    type: 'object',
    required: true,
    properties: {
      data_sources: {
        type: 'array',
        items: { type: 'string' },
        required: true,
        description: 'Where data comes from'
      },
      data_privacy: {
        type: 'string',
        required: true,
        enum: ['public', 'private', 'enterprise', 'healthcare'],
        description: 'Data privacy level'
      },
      user_data_storage: {
        type: 'string',
        required: true,
        enum: ['local', 'cloud', 'hybrid', 'none'],
        description: 'How user data is stored'
      },
      user_data_editable: {
        type: 'boolean',
        required: true,
        description: 'Can users edit their data'
      },
      data_shared_publicly: {
        type: 'boolean',
        required: true,
        description: 'Is any data shared publicly'
      },
      analytics_or_tracking: {
        type: 'boolean',
        required: true,
        description: 'Include analytics/tracking'
      }
    }
  },

  // Design preferences
  design_preferences: {
    type: 'object',
    required: true,
    properties: {
      theme_style: {
        type: 'string',
        required: true,
        enum: ['minimal', 'modern', 'dark', 'neon', 'classic', 'colorful', 'professional'],
        description: 'Overall design theme'
      },
      accent_color: {
        type: 'string',
        required: true,
        pattern: /^#[0-9A-Fa-f]{6}$/,
        description: 'Primary accent color (hex format)'
      },
      secondary_colors: {
        type: 'array',
        items: { 
          type: 'string',
          pattern: /^#[0-9A-Fa-f]{6}$/
        },
        required: false,
        description: 'Additional colors (hex format)'
      },
      general_vibe: {
        type: 'string',
        required: true,
        enum: ['playful', 'serious', 'elegant', 'energetic', 'calm', 'bold', 'friendly'],
        description: 'Overall application vibe'
      }
    }
  },

  // App structure and technical details
  app_structure: {
    type: 'object',
    required: true,
    properties: {
      app_type: {
        type: 'string',
        required: true,
        enum: ['web-app', 'mobile-first', 'pwa', 'desktop', 'api-only'],
        description: 'Application type'
      },
      authentication_needed: {
        type: 'boolean',
        required: true,
        description: 'Does the app need user authentication'
      },
      roles_or_permissions: {
        type: 'array',
        items: { type: 'string' },
        required: false,
        description: 'User roles and permissions'
      },
      deployment_preference: {
        type: 'string',
        required: true,
        enum: ['aws', 'gcp', 'azure', 'vercel', 'netlify', 'heroku', 'self-hosted'],
        description: 'Preferred deployment platform'
      }
    }
  },

  // Project clarification (AI-assisted project understanding)
  project_clarification: {
    type: 'object',
    required: false,
    properties: {
      project_goals: {
        type: 'string',
        minLength: 20,
        maxLength: 500,
        description: 'Main project goals and objectives'
      },
      success_metrics: {
        type: 'string',
        minLength: 10,
        maxLength: 300,
        description: 'How success will be measured'
      },
      similar_apps: {
        type: 'string',
        maxLength: 200,
        description: 'Similar applications for reference'
      },
      unique_features: {
        type: 'string',
        minLength: 15,
        maxLength: 400,
        description: 'What makes this app unique'
      }
    }
  },

  // AI guidance and validation
  ai_guidance: {
    type: 'object',
    required: false,
    properties: {
      clarity_check: {
        type: 'string',
        description: 'AI assessment of requirement clarity'
      },
      missing_info_questions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Questions to clarify missing information'
      },
      summary_of_understanding: {
        type: 'string',
        description: 'AI summary of the project understanding'
      },
      technical_recommendations: {
        type: 'array',
        items: { type: 'string' },
        description: 'AI-generated technical recommendations'
      },
      generated_at: {
        type: 'string',
        description: 'Timestamp when guidance was generated'
      },
      user_mode: {
        type: 'string',
        enum: ['developer'],
        description: 'User mode when guidance was generated'
      }
    }
  },

  // Review confirmation
  review_confirmation: {
    type: 'boolean',
    required: false,
    description: 'User confirmation that review is complete'
  }
};

/**
 * Validation error class for spec validation
 */
export class SpecValidationError extends Error {
  constructor(field, message, value = null) {
    super(`Validation error for field '${field}': ${message}`);
    this.field = field;
    this.value = value;
    this.name = 'SpecValidationError';
  }
}

/**
 * Validate a single field against its schema definition
 */
function validateField(fieldName, value, schema, path = '') {
  const errors = [];
  const fullPath = path ? `${path}.${fieldName}` : fieldName;
  
  // Check if required field is missing
  if (schema.required && (value === undefined || value === null || value === '')) {
    errors.push(new SpecValidationError(fullPath, 'Field is required'));
    return errors;
  }
  
  // Skip validation if field is not required and empty
  if (!schema.required && (value === undefined || value === null || value === '')) {
    return errors;
  }
  
  // Type validation
  if (schema.type === 'string' && typeof value !== 'string') {
    errors.push(new SpecValidationError(fullPath, `Expected string, got ${typeof value}`, value));
  } else if (schema.type === 'number' && typeof value !== 'number') {
    errors.push(new SpecValidationError(fullPath, `Expected number, got ${typeof value}`, value));
  } else if (schema.type === 'boolean' && typeof value !== 'boolean') {
    errors.push(new SpecValidationError(fullPath, `Expected boolean, got ${typeof value}`, value));
  } else if (schema.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
    errors.push(new SpecValidationError(fullPath, `Expected object, got ${typeof value}`, value));
  }
  
  // String-specific validations
  if (schema.type === 'string' && typeof value === 'string') {
    if (schema.minLength && value.length < schema.minLength) {
      errors.push(new SpecValidationError(fullPath, `Minimum length is ${schema.minLength}`, value));
    }
    if (schema.maxLength && value.length > schema.maxLength) {
      errors.push(new SpecValidationError(fullPath, `Maximum length is ${schema.maxLength}`, value));
    }
    if (schema.pattern && !schema.pattern.test(value)) {
      errors.push(new SpecValidationError(fullPath, `Value does not match required pattern`, value));
    }
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(new SpecValidationError(fullPath, `Value must be one of: ${schema.enum.join(', ')}`, value));
    }
  }
  
  // Number-specific validations
  if (schema.type === 'number' && typeof value === 'number') {
    if (schema.min !== undefined && value < schema.min) {
      errors.push(new SpecValidationError(fullPath, `Minimum value is ${schema.min}`, value));
    }
    if (schema.max !== undefined && value > schema.max) {
      errors.push(new SpecValidationError(fullPath, `Maximum value is ${schema.max}`, value));
    }
  }
  
  // Object validation (recursive)
  if (schema.type === 'object' && typeof value === 'object' && schema.properties) {
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const propErrors = validateField(propName, value[propName], propSchema, fullPath);
      errors.push(...propErrors);
    }
  }
  
  return errors;
}

/**
 * Validate complete spec.json against schema
 * @param {Object} spec - The spec object to validate
 * @returns {Object} - { isValid: boolean, errors: SpecValidationError[] }
 */
export function validateSpec(spec) {
  const errors = [];
  
  if (!spec || typeof spec !== 'object') {
    errors.push(new SpecValidationError('root', 'Spec must be an object'));
    return { isValid: false, errors };
  }
  
  // Validate each top-level field
  for (const [fieldName, fieldSchema] of Object.entries(specJsonSchema)) {
    const fieldErrors = validateField(fieldName, spec[fieldName], fieldSchema);
    errors.push(...fieldErrors);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Check if spec is complete (all required fields filled)
 * @param {Object} spec - The spec object to check
 * @returns {boolean} - True if spec is complete
 */
export function isSpecComplete(spec) {
  const { isValid } = validateSpec(spec);
  return isValid;
}

/**
 * Get validation errors as user-friendly messages
 * @param {SpecValidationError[]} errors - Array of validation errors
 * @returns {Object} - Grouped errors by field path
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

/**
 * Create an empty spec template with default values
 * @returns {Object} - Empty spec template
 */
export function createEmptySpec() {
  return {
    userMode: '',
    project_overview: {
      app_name: '',
      app_summary: '',
      app_details: '',
      niche: '',
      potential_users: '',
      estimated_user_count: '',
      complexity_level: 5
    },
    user_flow: {
      overview_flow: '',
      key_user_actions: '',
      user_journey: []
    },
    pages: [],
    data_flow: {
      data_sources: [],
      data_privacy: '',
      user_data_storage: '',
      user_data_editable: false,
      data_shared_publicly: false,
      analytics_or_tracking: false
    },
    design_preferences: {
      theme_style: '',
      accent_color: '#3B82F6',
      secondary_colors: [],
      general_vibe: ''
    },
    app_structure: {
      app_type: '',
      authentication_needed: false,
      roles_or_permissions: [],
      deployment_preference: ''
    },
    // Project clarification (AI-assisted understanding)
    project_clarification: {
      project_goals: '',
      success_metrics: '',
      similar_apps: '',
      unique_features: ''
    },
    // AI guidance and processing results
    ai_guidance: {
      clarity_check: '',
      missing_info_questions: [],
      summary_of_understanding: '',
      technical_recommendations: [],
      generated_at: null,
      user_mode: ''
    },
    // Review confirmation
    review_confirmation: false
  };
}