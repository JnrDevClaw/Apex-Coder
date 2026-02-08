const structuredLogger = require('./structured-logger');

/**
 * Questionnaire Validator Service
 * Provides comprehensive input validation for enhanced questionnaire schema
 */
class QuestionnaireValidator {
  constructor() {
    this.validationRules = this.initializeValidationRules();
    this.errorMessages = this.initializeErrorMessages();
  }

  /**
   * Validate enhanced questionnaire structure
   * @param {Object} questionnaireData - Questionnaire data to validate
   * @param {string} userMode - User mode for context-specific validation
   * @returns {Object} Validation result with detailed errors and suggestions
   */
  validateEnhancedSchema(questionnaireData, userMode) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      fieldErrors: {},
      completeness: {
        score: 0,
        missingRequired: [],
        missingOptional: []
      }
    };

    try {
      // Validate core structure
      this.validateCoreStructure(questionnaireData, validation);
      
      // Validate user mode specific requirements
      this.validateUserModeRequirements(questionnaireData, userMode, validation);
      
      // Validate field types and formats
      this.validateFieldTypes(questionnaireData, validation);
      
      // Validate business logic constraints
      this.validateBusinessLogic(questionnaireData, validation);
      
      // Calculate completeness score
      this.calculateCompleteness(questionnaireData, userMode, validation);
      
      // Generate improvement suggestions
      this.generateSuggestions(questionnaireData, userMode, validation);

      // Set overall validity
      validation.isValid = validation.errors.length === 0;

      structuredLogger.info('Questionnaire validation completed', {
        isValid: validation.isValid,
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length,
        completenessScore: validation.completeness.score
      });

      return validation;
    } catch (error) {
      structuredLogger.error('Validation process failed', {
        error: error.message,
        stack: error.stack
      });
      
      return {
        isValid: false,
        errors: ['Validation process failed'],
        warnings: [],
        suggestions: ['Please check your input data format'],
        fieldErrors: {},
        completeness: { score: 0, missingRequired: [], missingOptional: [] }
      };
    }
  }

  /**
   * Validate core questionnaire structure
   */
  validateCoreStructure(data, validation) {
    // Check required top-level sections
    const requiredSections = ['project_overview', 'app_structure'];
    
    for (const section of requiredSections) {
      if (!data[section]) {
        validation.errors.push(`Missing required section: ${section}`);
        validation.fieldErrors[section] = 'This section is required';
      } else if (typeof data[section] !== 'object') {
        validation.errors.push(`Invalid ${section}: must be an object`);
        validation.fieldErrors[section] = 'Must be a valid object';
      }
    }

    // Validate project_overview required fields
    if (data.project_overview) {
      this.validateProjectOverview(data.project_overview, validation);
    }

    // Validate app_structure required fields
    if (data.app_structure) {
      this.validateAppStructure(data.app_structure, validation);
    }
  }

  /**
   * Validate project overview section
   */
  validateProjectOverview(projectOverview, validation) {
    const requiredFields = ['app_name'];
    
    for (const field of requiredFields) {
      if (!projectOverview[field]) {
        validation.errors.push(`Missing required field: project_overview.${field}`);
        validation.fieldErrors[`project_overview.${field}`] = 'This field is required';
      } else if (typeof projectOverview[field] !== 'string' || projectOverview[field].trim() === '') {
        validation.errors.push(`Invalid project_overview.${field}: must be a non-empty string`);
        validation.fieldErrors[`project_overview.${field}`] = 'Must be a non-empty text value';
      }
    }

    // Validate app_name length and format
    if (projectOverview.app_name) {
      if (projectOverview.app_name.length < 2) {
        validation.warnings.push('App name is very short - consider a more descriptive name');
        validation.fieldErrors['project_overview.app_name'] = 'App name should be at least 2 characters';
      }
      
      if (projectOverview.app_name.length > 100) {
        validation.errors.push('App name is too long (maximum 100 characters)');
        validation.fieldErrors['project_overview.app_name'] = 'App name must be 100 characters or less';
      }
    }

    // Validate complexity level
    if (projectOverview.complexity_level !== undefined) {
      if (typeof projectOverview.complexity_level !== 'number' || 
          projectOverview.complexity_level < 1 || 
          projectOverview.complexity_level > 10) {
        validation.errors.push('Complexity level must be a number between 1 and 10');
        validation.fieldErrors['project_overview.complexity_level'] = 'Must be a number from 1 to 10';
      }
    }

    // Validate estimated user count
    if (projectOverview.estimated_user_count) {
      const validUserCounts = ['1-100', '100-1000', '1000-10000', '10000+'];
      if (!validUserCounts.includes(projectOverview.estimated_user_count)) {
        validation.warnings.push('Estimated user count should be one of: ' + validUserCounts.join(', '));
      }
    }
  }

  /**
   * Validate app structure section
   */
  validateAppStructure(appStructure, validation) {
    const requiredFields = ['app_type'];
    
    for (const field of requiredFields) {
      if (!appStructure[field]) {
        validation.errors.push(`Missing required field: app_structure.${field}`);
        validation.fieldErrors[`app_structure.${field}`] = 'This field is required';
      }
    }

    // Validate app_type
    if (appStructure.app_type) {
      const validAppTypes = [
        'web-app', 'mobile-app', 'desktop-app', 'pwa', 'dashboard', 
        'e-commerce', 'blog', 'portfolio', 'landing-page', 'api', 'other'
      ];
      
      if (!validAppTypes.includes(appStructure.app_type)) {
        validation.warnings.push(`App type "${appStructure.app_type}" is not in the standard list`);
      }
    }

    // Validate authentication_needed
    if (appStructure.authentication_needed !== undefined && 
        typeof appStructure.authentication_needed !== 'boolean') {
      validation.errors.push('authentication_needed must be true or false');
      validation.fieldErrors['app_structure.authentication_needed'] = 'Must be true or false';
    }

    // Validate roles_or_permissions
    if (appStructure.roles_or_permissions) {
      if (!Array.isArray(appStructure.roles_or_permissions)) {
        validation.errors.push('roles_or_permissions must be an array');
        validation.fieldErrors['app_structure.roles_or_permissions'] = 'Must be a list of roles';
      } else if (appStructure.roles_or_permissions.length > 10) {
        validation.warnings.push('Many roles defined - consider simplifying the permission structure');
      }
    }
  }

  /**
   * Validate user mode specific requirements
   */
  validateUserModeRequirements(data, userMode, validation) {
    if (userMode === 'developer') {
      this.validateDeveloperModeRequirements(data, validation);
    } else if (userMode === 'non-developer') {
      this.validateNonDeveloperModeRequirements(data, validation);
    }
  }

  /**
   * Validate developer mode specific requirements
   */
  validateDeveloperModeRequirements(data, validation) {
    // Technical blueprint should be present for developers
    if (!data.technical_blueprint) {
      validation.warnings.push('Developer mode typically includes technical blueprint details');
      validation.completeness.missingOptional.push('technical_blueprint');
    } else {
      this.validateTechnicalBlueprint(data.technical_blueprint, validation);
    }
  }

  /**
   * Validate non-developer mode specific requirements
   */
  validateNonDeveloperModeRequirements(data, validation) {
    // Non-developers should focus on functional requirements
    if (!data.user_flow || !data.user_flow.user_journey || data.user_flow.user_journey.length === 0) {
      validation.warnings.push('User journey helps clarify how the application will work');
      validation.completeness.missingOptional.push('user_journey');
    }

    if (!data.pages || data.pages.length === 0) {
      validation.warnings.push('Page definitions help specify what users will see and do');
      validation.completeness.missingOptional.push('pages');
    }
  }

  /**
   * Validate technical blueprint section
   */
  validateTechnicalBlueprint(technicalBlueprint, validation) {
    const recommendedFields = ['frontend_framework', 'backend_framework', 'database_engine'];
    
    for (const field of recommendedFields) {
      if (!technicalBlueprint[field]) {
        validation.warnings.push(`Technical blueprint missing ${field} - this helps with implementation planning`);
        validation.completeness.missingOptional.push(`technical_blueprint.${field}`);
      }
    }

    // Validate framework choices
    if (technicalBlueprint.frontend_framework) {
      const validFrontend = ['svelte', 'react', 'vue', 'angular', 'html-css', 'next', 'nuxt'];
      if (!validFrontend.includes(technicalBlueprint.frontend_framework)) {
        validation.warnings.push(`Frontend framework "${technicalBlueprint.frontend_framework}" is not commonly supported`);
      }
    }

    if (technicalBlueprint.backend_framework) {
      const validBackend = ['node-express', 'node-fastify', 'python-fastapi', 'python-django', 'go-gin', 'java-spring'];
      if (!validBackend.includes(technicalBlueprint.backend_framework)) {
        validation.warnings.push(`Backend framework "${technicalBlueprint.backend_framework}" is not commonly supported`);
      }
    }

    if (technicalBlueprint.database_engine) {
      const validDatabases = ['postgres', 'mysql', 'mongodb', 'sqlite', 'dynamodb', 'none'];
      if (!validDatabases.includes(technicalBlueprint.database_engine)) {
        validation.warnings.push(`Database engine "${technicalBlueprint.database_engine}" is not commonly supported`);
      }
    }
  }

  /**
   * Validate field types and formats
   */
  validateFieldTypes(data, validation) {
    // Validate user_flow structure
    if (data.user_flow) {
      this.validateUserFlow(data.user_flow, validation);
    }

    // Validate pages structure
    if (data.pages) {
      this.validatePages(data.pages, validation);
    }

    // Validate data_flow structure
    if (data.data_flow) {
      this.validateDataFlow(data.data_flow, validation);
    }

    // Validate design_preferences structure
    if (data.design_preferences) {
      this.validateDesignPreferences(data.design_preferences, validation);
    }
  }

  /**
   * Validate user flow structure
   */
  validateUserFlow(userFlow, validation) {
    if (userFlow.user_journey) {
      if (!Array.isArray(userFlow.user_journey)) {
        validation.errors.push('user_journey must be an array');
        validation.fieldErrors['user_flow.user_journey'] = 'Must be a list of journey steps';
      } else {
        userFlow.user_journey.forEach((step, index) => {
          if (!step.stage_name || typeof step.stage_name !== 'string') {
            validation.errors.push(`User journey step ${index + 1} missing stage_name`);
            validation.fieldErrors[`user_flow.user_journey[${index}].stage_name`] = 'Stage name is required';
          }
          
          if (!step.user_action || typeof step.user_action !== 'string') {
            validation.warnings.push(`User journey step ${index + 1} missing user_action`);
          }
        });
      }
    }
  }

  /**
   * Validate pages structure
   */
  validatePages(pages, validation) {
    if (!Array.isArray(pages)) {
      validation.errors.push('pages must be an array');
      validation.fieldErrors['pages'] = 'Must be a list of page definitions';
      return;
    }

    pages.forEach((page, index) => {
      if (!page.page_name || typeof page.page_name !== 'string') {
        validation.errors.push(`Page ${index + 1} missing page_name`);
        validation.fieldErrors[`pages[${index}].page_name`] = 'Page name is required';
      }

      if (page.data_collected_from_user && !Array.isArray(page.data_collected_from_user)) {
        validation.errors.push(`Page ${index + 1} data_collected_from_user must be an array`);
        validation.fieldErrors[`pages[${index}].data_collected_from_user`] = 'Must be a list of data fields';
      }

      if (page.user_actions && !Array.isArray(page.user_actions)) {
        validation.errors.push(`Page ${index + 1} user_actions must be an array`);
        validation.fieldErrors[`pages[${index}].user_actions`] = 'Must be a list of actions';
      }
    });
  }

  /**
   * Validate data flow structure
   */
  validateDataFlow(dataFlow, validation) {
    if (dataFlow.data_sources && !Array.isArray(dataFlow.data_sources)) {
      validation.errors.push('data_sources must be an array');
      validation.fieldErrors['data_flow.data_sources'] = 'Must be a list of data sources';
    }

    if (dataFlow.user_data_editable !== undefined && typeof dataFlow.user_data_editable !== 'boolean') {
      validation.errors.push('user_data_editable must be true or false');
      validation.fieldErrors['data_flow.user_data_editable'] = 'Must be true or false';
    }

    if (dataFlow.analytics_or_tracking !== undefined && typeof dataFlow.analytics_or_tracking !== 'boolean') {
      validation.errors.push('analytics_or_tracking must be true or false');
      validation.fieldErrors['data_flow.analytics_or_tracking'] = 'Must be true or false';
    }
  }

  /**
   * Validate design preferences structure
   */
  validateDesignPreferences(designPrefs, validation) {
    if (designPrefs.secondary_colors && !Array.isArray(designPrefs.secondary_colors)) {
      validation.errors.push('secondary_colors must be an array');
      validation.fieldErrors['design_preferences.secondary_colors'] = 'Must be a list of colors';
    }

    // Validate color formats if provided
    if (designPrefs.accent_color && !this.isValidColor(designPrefs.accent_color)) {
      validation.warnings.push('Accent color format may not be valid - use hex, rgb, or color names');
    }
  }

  /**
   * Validate business logic constraints
   */
  validateBusinessLogic(data, validation) {
    // Check authentication vs data storage consistency
    if (data.app_structure?.authentication_needed && 
        data.data_flow?.user_data_storage === 'none') {
      validation.warnings.push('Authentication typically requires user data storage');
      validation.suggestions.push('Consider enabling user data storage if authentication is needed');
    }

    // Check complexity vs features consistency
    const complexity = data.project_overview?.complexity_level || 5;
    const pageCount = data.pages?.length || 0;
    const journeySteps = data.user_flow?.user_journey?.length || 0;

    if (complexity >= 8 && pageCount <= 2) {
      validation.warnings.push('High complexity rating but few pages defined');
      validation.suggestions.push('Consider adding more page definitions for complex applications');
    }

    if (complexity <= 3 && journeySteps > 10) {
      validation.warnings.push('Low complexity rating but complex user journey');
      validation.suggestions.push('Consider increasing complexity rating or simplifying user journey');
    }

    // Check user count vs deployment consistency
    const userCount = data.project_overview?.estimated_user_count;
    const deployment = data.app_structure?.deployment_preference;

    if (userCount === '10000+' && deployment === 'netlify') {
      validation.warnings.push('High user count may require more robust hosting than Netlify');
      validation.suggestions.push('Consider AWS, GCP, or Azure for high-scale applications');
    }
  }

  /**
   * Calculate completeness score
   */
  calculateCompleteness(data, userMode, validation) {
    let score = 0;
    let maxScore = 0;
    const requiredFields = this.getRequiredFieldsByMode(userMode);
    const optionalFields = this.getOptionalFieldsByMode(userMode);

    // Check required fields
    for (const field of requiredFields) {
      maxScore += 2; // Required fields worth more
      if (this.hasValue(data, field.path)) {
        score += 2;
      } else {
        validation.completeness.missingRequired.push(field.path);
      }
    }

    // Check optional fields
    for (const field of optionalFields) {
      maxScore += 1;
      if (this.hasValue(data, field.path)) {
        score += 1;
      } else {
        validation.completeness.missingOptional.push(field.path);
      }
    }

    validation.completeness.score = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  }

  /**
   * Generate improvement suggestions
   */
  generateSuggestions(data, userMode, validation) {
    // Suggest based on missing required fields
    if (validation.completeness.missingRequired.length > 0) {
      validation.suggestions.push('Complete all required fields to improve your specification');
    }

    // Suggest based on user mode
    if (userMode === 'non-developer') {
      if (!data.user_flow?.user_journey || data.user_flow.user_journey.length === 0) {
        validation.suggestions.push('Adding a user journey helps clarify how people will use your app');
      }
      
      if (!data.pages || data.pages.length === 0) {
        validation.suggestions.push('Defining pages helps specify what users will see and do');
      }
    } else if (userMode === 'developer') {
      if (!data.technical_blueprint) {
        validation.suggestions.push('Technical blueprint helps with implementation planning and technology choices');
      }
    }

    // Suggest based on complexity
    const complexity = data.project_overview?.complexity_level || 5;
    if (complexity >= 7 && validation.completeness.score < 70) {
      validation.suggestions.push('Complex projects benefit from detailed specifications - consider adding more information');
    }

    // Suggest based on app type
    const appType = data.app_structure?.app_type;
    if (appType === 'e-commerce' && !data.app_structure?.authentication_needed) {
      validation.suggestions.push('E-commerce applications typically need user authentication for accounts and orders');
    }
  }

  /**
   * Helper methods
   */
  hasValue(obj, path) {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current === null || current === undefined || !(key in current)) {
        return false;
      }
      current = current[key];
    }
    
    return current !== null && current !== undefined && current !== '';
  }

  isValidColor(color) {
    // Basic color validation - could be enhanced
    const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    const rgbPattern = /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/;
    const colorNames = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'brown', 'black', 'white', 'gray'];
    
    return hexPattern.test(color) || rgbPattern.test(color) || colorNames.includes(color.toLowerCase());
  }

  getRequiredFieldsByMode(userMode) {
    const common = [
      { path: 'project_overview.app_name', label: 'App Name' },
      { path: 'app_structure.app_type', label: 'App Type' }
    ];

    if (userMode === 'developer') {
      return [
        ...common,
        { path: 'technical_blueprint.frontend_framework', label: 'Frontend Framework' },
        { path: 'technical_blueprint.backend_framework', label: 'Backend Framework' }
      ];
    }

    return common;
  }

  getOptionalFieldsByMode(userMode) {
    const common = [
      { path: 'project_overview.app_summary', label: 'App Summary' },
      { path: 'project_overview.niche', label: 'App Category' },
      { path: 'project_overview.potential_users', label: 'Target Users' },
      { path: 'project_overview.complexity_level', label: 'Complexity Level' },
      { path: 'app_structure.authentication_needed', label: 'Authentication' },
      { path: 'data_flow.data_privacy', label: 'Data Privacy' },
      { path: 'design_preferences.theme_style', label: 'Theme Style' }
    ];

    if (userMode === 'developer') {
      return [
        ...common,
        { path: 'technical_blueprint.database_engine', label: 'Database' },
        { path: 'technical_blueprint.package_installer', label: 'Package Manager' },
        { path: 'technical_blueprint.testing_library', label: 'Testing Library' }
      ];
    } else {
      return [
        ...common,
        { path: 'user_flow.user_journey', label: 'User Journey' },
        { path: 'pages', label: 'Page Definitions' }
      ];
    }
  }

  initializeValidationRules() {
    return {
      maxStringLength: {
        app_name: 100,
        app_summary: 500,
        app_details: 2000,
        page_description: 300
      },
      minStringLength: {
        app_name: 2,
        app_summary: 10
      },
      arrayMaxLength: {
        pages: 50,
        user_journey: 20,
        roles_or_permissions: 10,
        utilities: 15
      }
    };
  }

  initializeErrorMessages() {
    return {
      required: 'This field is required',
      invalidType: 'Invalid data type',
      tooLong: 'Value is too long',
      tooShort: 'Value is too short',
      invalidFormat: 'Invalid format',
      invalidChoice: 'Invalid choice from available options'
    };
  }
}

// Create singleton instance
const questionnaireValidator = new QuestionnaireValidator();

module.exports = questionnaireValidator;