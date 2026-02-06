const structuredLogger = require('./structured-logger');

/**
 * Questionnaire Error Handler Service
 * Provides comprehensive error handling and fallbacks for AI services
 */
class QuestionnaireErrorHandler {
  constructor() {
    this.errorCategories = this.initializeErrorCategories();
    this.fallbackStrategies = this.initializeFallbackStrategies();
    this.retryConfig = this.initializeRetryConfig();
  }

  /**
   * Handle AI service errors with appropriate fallbacks
   * @param {Error} error - The error that occurred
   * @param {string} service - The service that failed
   * @param {Object} context - Context information for the error
   * @returns {Object} Error response with fallback data
   */
  handleAIServiceError(error, service, context = {}) {
    try {
      const errorCategory = this.categorizeError(error);
      const fallbackStrategy = this.fallbackStrategies[service] || this.fallbackStrategies.default;
      
      structuredLogger.error('AI service error occurred', {
        service,
        errorCategory,
        errorMessage: error.message,
        context,
        stack: error.stack
      });

      // Generate fallback response based on service and error type
      const fallbackResponse = this.generateFallbackResponse(service, errorCategory, context);
      
      // Log fallback usage
      structuredLogger.info('Using fallback response for AI service', {
        service,
        errorCategory,
        fallbackType: fallbackResponse.type
      });

      return {
        success: false,
        error: this.createUserFriendlyError(error, service),
        fallback: fallbackResponse,
        metadata: {
          originalError: error.message,
          service,
          errorCategory,
          timestamp: new Date().toISOString()
        }
      };
    } catch (handlerError) {
      structuredLogger.error('Error handler itself failed', {
        originalError: error.message,
        handlerError: handlerError.message
      });
      
      return {
        success: false,
        error: 'Service temporarily unavailable',
        fallback: this.getMinimalFallback(service),
        metadata: {
          criticalError: true,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Handle validation errors with detailed feedback
   * @param {Object} validationResult - Validation result with errors
   * @param {Object} context - Context information
   * @returns {Object} Formatted validation error response
   */
  handleValidationError(validationResult, context = {}) {
    const response = {
      success: false,
      error: 'Validation failed',
      details: {
        errors: validationResult.errors || [],
        warnings: validationResult.warnings || [],
        suggestions: validationResult.suggestions || [],
        fieldErrors: validationResult.fieldErrors || {}
      },
      improvements: this.generateImprovementSuggestions(validationResult),
      metadata: {
        errorType: 'validation',
        timestamp: new Date().toISOString()
      }
    };

    structuredLogger.info('Validation error handled', {
      errorCount: response.details.errors.length,
      warningCount: response.details.warnings.length,
      context
    });

    return response;
  }

  /**
   * Handle processing timeouts with graceful degradation
   * @param {string} service - The service that timed out
   * @param {Object} context - Context information
   * @returns {Object} Timeout error response
   */
  handleProcessingTimeout(service, context = {}) {
    structuredLogger.warn('Processing timeout occurred', {
      service,
      context,
      timeout: this.retryConfig.timeout
    });

    const fallbackResponse = this.generateFallbackResponse(service, 'timeout', context);
    
    return {
      success: false,
      error: 'Processing is taking longer than expected',
      message: 'Your request is being processed. Please try again in a moment.',
      fallback: fallbackResponse,
      retryAfter: 30, // seconds
      metadata: {
        errorType: 'timeout',
        service,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Handle rate limiting errors
   * @param {string} service - The service that was rate limited
   * @param {Object} context - Context information
   * @returns {Object} Rate limit error response
   */
  handleRateLimitError(service, context = {}) {
    structuredLogger.warn('Rate limit exceeded', {
      service,
      context
    });

    return {
      success: false,
      error: 'Service temporarily busy',
      message: 'Too many requests. Please wait a moment and try again.',
      retryAfter: 60, // seconds
      fallback: this.generateFallbackResponse(service, 'rate_limit', context),
      metadata: {
        errorType: 'rate_limit',
        service,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Categorize errors for appropriate handling
   * @param {Error} error - The error to categorize
   * @returns {string} Error category
   */
  categorizeError(error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout') || message.includes('timed out')) {
      return 'timeout';
    }
    
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return 'rate_limit';
    }
    
    if (message.includes('network') || message.includes('connection')) {
      return 'network';
    }
    
    if (message.includes('authentication') || message.includes('unauthorized')) {
      return 'auth';
    }
    
    if (message.includes('validation') || message.includes('invalid')) {
      return 'validation';
    }
    
    if (message.includes('quota') || message.includes('limit exceeded')) {
      return 'quota';
    }
    
    return 'unknown';
  }

  /**
   * Generate fallback response based on service and error type
   * @param {string} service - The service that failed
   * @param {string} errorCategory - Category of the error
   * @param {Object} context - Context information
   * @returns {Object} Fallback response
   */
  generateFallbackResponse(service, errorCategory, context) {
    switch (service) {
      case 'enhanced-spec-processor':
        return this.getSpecProcessorFallback(context);
      
      case 'technical-inference-service':
        return this.getTechnicalInferenceFallback(context);
      
      case 'ai-guidance-engine':
        return this.getAIGuidanceFallback(context);
      
      default:
        return this.getGenericFallback(service, context);
    }
  }

  /**
   * Get fallback for enhanced spec processor
   */
  getSpecProcessorFallback(context) {
    const questionnaireData = context.questionnaireData || {};
    
    return {
      type: 'spec_processor_fallback',
      processedSpec: {
        ...questionnaireData,
        ai_guidance: {
          clarity_check: 'AI processing temporarily unavailable - basic validation completed',
          missing_info_questions: [],
          summary_of_understanding: this.generateBasicSummary(questionnaireData),
          technical_recommendations: ['Follow standard web development practices'],
          generated_at: new Date().toISOString(),
          user_mode: context.userMode || 'unknown',
          fallback_mode: true
        }
      },
      validation: {
        isComplete: !!questionnaireData.project_overview?.app_name,
        missingFields: questionnaireData.project_overview?.app_name ? [] : ['project_overview.app_name'],
        warnings: ['AI processing unavailable - using basic validation'],
        suggestions: ['Complete all required fields', 'Try again later for AI guidance']
      },
      recommendations: ['Use standard technology stack', 'Follow best practices'],
      confidence: 0.3
    };
  }

  /**
   * Get fallback for technical inference service
   */
  getTechnicalInferenceFallback(context) {
    const projectData = context.projectData || {};
    const appType = projectData.app_structure?.app_type || 'web-app';
    
    // Provide safe default stack based on project standards
    const defaultStack = {
      frontend_framework: 'svelte',
      backend_framework: 'node-fastify',
      database_engine: this.inferBasicDatabase(projectData),
      package_installer: 'pnpm',
      testing_library: 'vitest',
      utilities: ['prettier', 'eslint', 'tailwind']
    };

    return {
      type: 'technical_inference_fallback',
      recommendedStack: defaultStack,
      compatibility: {
        overall_compatible: true,
        compatibility_score: 8,
        conflicts: [],
        warnings: ['AI inference unavailable - using safe defaults'],
        optimizations: []
      },
      reasoning: {
        executive_summary: 'Default technology stack selected based on project standards',
        technology_rationale: {
          frontend: 'Svelte chosen as project default for performance and developer experience',
          backend: 'Fastify chosen for high performance and modern Node.js features',
          database: `${defaultStack.database_engine} chosen based on basic project requirements`
        }
      },
      confidence: 0.6,
      alternatives: []
    };
  }

  /**
   * Get fallback for AI guidance engine
   */
  getAIGuidanceFallback(context) {
    const questionnaireData = context.questionnaireData || {};
    const userMode = context.userMode || 'non-developer';
    
    return {
      type: 'ai_guidance_fallback',
      guidance: {
        clarity_assessment: 'AI guidance temporarily unavailable - basic assessment provided',
        project_understanding: this.generateBasicSummary(questionnaireData),
        follow_up_questions: this.generateBasicQuestions(questionnaireData, userMode),
        technical_recommendations: this.getBasicTechnicalRecommendations(userMode),
        architecture_guidance: 'Standard web application architecture recommended',
        implementation_roadmap: ['Planning', 'Design', 'Development', 'Testing', 'Deployment'],
        risk_analysis: 'Standard development risks apply - ensure proper planning and testing',
        success_factors: ['Clear requirements', 'Regular testing', 'User feedback'],
        next_steps: ['Complete questionnaire details', 'Review technology choices'],
        overall_confidence: 5
      }
    };
  }

  /**
   * Get generic fallback for unknown services
   */
  getGenericFallback(service, context) {
    return {
      type: 'generic_fallback',
      message: `${service} is temporarily unavailable`,
      suggestions: [
        'Please try again in a few moments',
        'Check your input data for any issues',
        'Contact support if the problem persists'
      ],
      fallback_data: null
    };
  }

  /**
   * Get minimal fallback for critical errors
   */
  getMinimalFallback(service) {
    return {
      type: 'minimal_fallback',
      message: 'Service temporarily unavailable',
      suggestions: ['Please try again later'],
      fallback_data: null
    };
  }

  /**
   * Create user-friendly error messages
   */
  createUserFriendlyError(error, service) {
    const category = this.categorizeError(error);
    
    const friendlyMessages = {
      timeout: 'The request is taking longer than expected. Please try again.',
      rate_limit: 'Service is busy right now. Please wait a moment and try again.',
      network: 'Connection issue occurred. Please check your internet and try again.',
      auth: 'Authentication issue. Please refresh the page and try again.',
      validation: 'There was an issue with your input data. Please check and try again.',
      quota: 'Service limit reached. Please try again later.',
      unknown: 'An unexpected error occurred. Please try again.'
    };

    return friendlyMessages[category] || friendlyMessages.unknown;
  }

  /**
   * Generate improvement suggestions for validation errors
   */
  generateImprovementSuggestions(validationResult) {
    const suggestions = [];
    
    if (validationResult.errors?.length > 0) {
      suggestions.push('Fix the required field errors to continue');
    }
    
    if (validationResult.completeness?.score < 50) {
      suggestions.push('Add more details to improve your project specification');
    }
    
    if (validationResult.warnings?.length > 3) {
      suggestions.push('Review the warnings to improve your project setup');
    }
    
    return suggestions;
  }

  /**
   * Helper methods for generating fallback content
   */
  generateBasicSummary(questionnaireData) {
    const appName = questionnaireData.project_overview?.app_name || 'the application';
    const appType = questionnaireData.app_structure?.app_type || 'web application';
    const summary = questionnaireData.project_overview?.app_summary;
    
    if (summary) {
      return `${appName} is a ${appType} that ${summary}`;
    }
    
    return `${appName} is a ${appType} that needs further specification`;
  }

  generateBasicQuestions(questionnaireData, userMode) {
    const questions = [];
    
    if (!questionnaireData.project_overview?.app_summary) {
      questions.push('What will your application do for users?');
    }
    
    if (!questionnaireData.project_overview?.potential_users) {
      questions.push('Who are your target users?');
    }
    
    if (userMode === 'developer' && !questionnaireData.technical_blueprint) {
      questions.push('What technologies do you prefer to use?');
    }
    
    if (userMode === 'non-developer' && (!questionnaireData.pages || questionnaireData.pages.length === 0)) {
      questions.push('What pages or screens will users see?');
    }
    
    return questions.slice(0, 3); // Limit to 3 questions
  }

  getBasicTechnicalRecommendations(userMode) {
    if (userMode === 'developer') {
      return [
        'Use modern web frameworks for better maintainability',
        'Implement proper error handling and logging',
        'Follow security best practices',
        'Set up automated testing'
      ];
    }
    
    return [
      'Choose technologies with good community support',
      'Prioritize user experience and performance',
      'Plan for scalability from the start',
      'Consider hiring experienced developers'
    ];
  }

  inferBasicDatabase(projectData) {
    const authNeeded = projectData.app_structure?.authentication_needed;
    const dataStorage = projectData.data_flow?.user_data_storage;
    
    if (dataStorage === 'none') {
      return 'none';
    }
    
    if (authNeeded || dataStorage) {
      return 'postgres'; // Safe default for data storage
    }
    
    return 'sqlite'; // Minimal default
  }

  /**
   * Initialize configuration
   */
  initializeErrorCategories() {
    return {
      timeout: 'Request timeout',
      rate_limit: 'Rate limit exceeded',
      network: 'Network error',
      auth: 'Authentication error',
      validation: 'Validation error',
      quota: 'Quota exceeded',
      unknown: 'Unknown error'
    };
  }

  initializeFallbackStrategies() {
    return {
      'enhanced-spec-processor': 'comprehensive_fallback',
      'technical-inference-service': 'default_stack_fallback',
      'ai-guidance-engine': 'basic_guidance_fallback',
      default: 'minimal_fallback'
    };
  }

  initializeRetryConfig() {
    return {
      timeout: 30000, // 30 seconds
      maxRetries: 3,
      retryDelay: 1000, // 1 second
      backoffMultiplier: 2
    };
  }
}

// Create singleton instance
const questionnaireErrorHandler = new QuestionnaireErrorHandler();

module.exports = questionnaireErrorHandler;