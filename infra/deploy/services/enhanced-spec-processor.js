const modelRouter = require('./model-router');
const auditLogger = require('./audit-logger');
const structuredLogger = require('./structured-logger');
const questionnaireAuditLogger = require('./questionnaire-audit-logger');
const aiQuestionnaireProcessor = require('./ai-questionnaire-processor');
const technicalInferenceService = require('./technical-inference-service');
const aiGuidanceEngine = require('./ai-guidance-engine');

/**
 * Enhanced Spec Processor - Comprehensive questionnaire processing with user mode support
 * Integrates with existing AI questionnaire processor while adding enhanced capabilities
 */
class EnhancedSpecProcessor {
  constructor() {
    this.processingStrategies = {
      'developer': this.processDeveloperMode.bind(this),
      'non-developer': this.processNonDeveloperMode.bind(this)
    };
    
    this.validationRules = this.initializeValidationRules();
  }

  /**
   * Main entry point for processing enhanced questionnaire responses
   * @param {Object} questionnaireData - Enhanced questionnaire data
   * @param {string} userMode - User mode ('developer' or 'non-developer')
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processed specification with AI guidance
   */
  async processQuestionnaire(questionnaireData, userMode = 'non-developer', options = {}) {
    const correlationId = auditLogger.generateCorrelationId();
    auditLogger.setCorrelationId(correlationId);
    
    try {
      // Log questionnaire processing start with enhanced audit trail
      await questionnaireAuditLogger.logQuestionnaireProcessing({
        userId: options.userId,
        projectData: questionnaireData,
        userMode,
        action: 'start_processing',
        processingMetrics: {
          processingDuration: 0 // Will be updated on completion
        }
      });

      structuredLogger.info('Processing enhanced questionnaire', {
        userMode,
        projectName: questionnaireData.project_overview?.app_name,
        hasUserFlow: !!questionnaireData.user_flow,
        hasPages: !!questionnaireData.pages?.length,
        hasTechnicalBlueprint: !!questionnaireData.technical_blueprint,
        correlationId
      });

      // Validate input data structure
      const validation = await this.validateEnhancedStructure(questionnaireData, userMode);
      if (!validation.isValid && !options.allowIncomplete) {
        throw new Error(`Invalid questionnaire structure: ${validation.errors.join(', ')}`);
      }

      // Process based on user mode
      const processingStrategy = this.processingStrategies[userMode];
      if (!processingStrategy) {
        throw new Error(`Unsupported user mode: ${userMode}`);
      }

      const processedSpec = await processingStrategy(questionnaireData, options);

      // Generate comprehensive AI guidance
      const aiGuidance = await this.generateEnhancedAIGuidance(processedSpec, userMode);

      // Perform final validation and recommendations
      const finalValidation = await this.performFinalValidation(processedSpec, userMode);

      // Create enhanced result
      const result = {
        success: true,
        processedSpec: {
          ...processedSpec,
          ai_guidance: {
            ...aiGuidance,
            generated_at: new Date().toISOString(),
            user_mode: userMode,
            processing_version: '2.0'
          }
        },
        validation: finalValidation,
        recommendations: aiGuidance.technicalRecommendations,
        metadata: {
          processingTime: Date.now(),
          userMode,
          completeness: this.calculateCompleteness(processedSpec),
          complexity: this.assessComplexity(processedSpec)
        }
      };

      // Log processing completion with enhanced audit trail
      await questionnaireAuditLogger.logQuestionnaireProcessing({
        userId: options.userId,
        projectData: questionnaireData,
        userMode,
        action: 'complete_processing',
        processingResult: result,
        processingMetrics: {
          processingDuration: Date.now() - result.metadata.processingTime,
          totalAIModelCalls: 1, // Will be tracked more precisely in future
          validationTime: 0, // Placeholder for future metrics
          enhancementTime: 0,
          guidanceGenerationTime: 0
        }
      });

      await auditLogger.logAIAction(
        'enhanced-spec-processor',
        'process_questionnaire',
        this.createProcessingSnapshot(questionnaireData, userMode),
        [],
        {
          projectId: questionnaireData.project_overview?.app_name,
          userMode,
          completeness: result.metadata.completeness,
          complexity: result.metadata.complexity,
          correlationId
        }
      );

      return result;
    } catch (error) {
      // Log processing failure with enhanced audit trail
      await questionnaireAuditLogger.logQuestionnaireProcessing({
        userId: options.userId,
        projectData: questionnaireData,
        userMode,
        action: 'processing_failed',
        processingResult: {
          success: false,
          error: {
            message: error.message,
            type: error.constructor.name
          }
        },
        processingMetrics: {
          processingDuration: Date.now() - (new Date().getTime())
        }
      });

      structuredLogger.error('Enhanced questionnaire processing failed', {
        userMode,
        error: error.message,
        stack: error.stack,
        correlationId
      });
      throw error;
    }
  }

  /**
   * Process questionnaire for developer mode users
   * @param {Object} questionnaireData - Questionnaire data
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processed specification
   */
  async processDeveloperMode(questionnaireData, options = {}) {
    // Log user mode selection with enhanced audit trail
    await questionnaireAuditLogger.logUserModeSelection({
      userId: options.userId,
      selectedMode: 'developer',
      projectContext: {
        app_name: questionnaireData.project_overview?.app_name,
        app_type: questionnaireData.app_structure?.app_type,
        complexity_level: questionnaireData.project_overview?.complexity_level
      },
      sessionInfo: {
        hasTechnicalBlueprint: !!questionnaireData.technical_blueprint,
        frameworksSpecified: {
          frontend: !!questionnaireData.technical_blueprint?.frontend_framework,
          backend: !!questionnaireData.technical_blueprint?.backend_framework,
          database: !!questionnaireData.technical_blueprint?.database_engine
        },
        utilitiesCount: questionnaireData.technical_blueprint?.utilities?.length || 0
      }
    });

    structuredLogger.info('Processing developer mode questionnaire');

    // Validate technical blueprint completeness
    const technicalValidation = await this.validateTechnicalBlueprint(questionnaireData.technical_blueprint);
    
    // Enhance with framework compatibility analysis
    const compatibilityAnalysis = await this.analyzeFrameworkCompatibility(questionnaireData.technical_blueprint);
    
    // Process with existing AI questionnaire processor for base functionality
    const baseProcessing = await aiQuestionnaireProcessor.processQuestionnaire(questionnaireData, 'developer');
    
    // Enhance with developer-specific processing
    const enhancedSpec = {
      ...questionnaireData,
      technical_blueprint: {
        ...questionnaireData.technical_blueprint,
        compatibility_analysis: compatibilityAnalysis,
        validation_results: technicalValidation
      },
      processing_metadata: {
        mode: 'developer',
        enhanced_processing: true,
        base_processing_success: baseProcessing.success
      }
    };

    return enhancedSpec;
  }

  /**
   * Process questionnaire for non-developer mode users
   * @param {Object} questionnaireData - Questionnaire data
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processed specification
   */
  async processNonDeveloperMode(questionnaireData, options = {}) {
    // Log user mode selection with enhanced audit trail
    await questionnaireAuditLogger.logUserModeSelection({
      userId: options.userId,
      selectedMode: 'non-developer',
      projectContext: {
        app_name: questionnaireData.project_overview?.app_name,
        app_type: questionnaireData.app_structure?.app_type,
        complexity_level: questionnaireData.project_overview?.complexity_level
      },
      sessionInfo: {
        requiresTechnicalInference: true,
        hasUserJourney: !!questionnaireData.user_flow?.user_journey?.length,
        pagesCount: questionnaireData.pages?.length || 0
      }
    });

    structuredLogger.info('Processing non-developer mode questionnaire');

    // Process with existing AI questionnaire processor for base functionality
    const baseProcessing = await aiQuestionnaireProcessor.processQuestionnaire(questionnaireData, 'non-developer');
    
    // Enhance with technical inference (will be handled by TechnicalInferenceService)
    const technicalInference = await this.requestTechnicalInference(questionnaireData);
    
    // Simplify and group conceptual information
    const simplifiedSpec = await this.simplifyForNonDeveloper(questionnaireData);
    
    const enhancedSpec = {
      ...simplifiedSpec,
      technical_inference: technicalInference,
      processing_metadata: {
        mode: 'non-developer',
        enhanced_processing: true,
        base_processing_success: baseProcessing.success,
        technical_inference_applied: true
      }
    };

    return enhancedSpec;
  }

  /**
   * Generate enhanced AI guidance for processed specifications
   * @param {Object} processedSpec - Processed specification
   * @param {string} userMode - User mode
   * @returns {Promise<Object>} AI guidance object
   */
  async generateEnhancedAIGuidance(processedSpec, userMode) {
    try {
      // Use the new AI Guidance Engine for comprehensive guidance
      const guidanceResult = await aiGuidanceEngine.generateContextualGuidance(
        processedSpec, 
        userMode, 
        { type: 'comprehensive' }
      );

      if (guidanceResult.success) {
        const guidance = guidanceResult.guidance;
        return {
          clarity_check: guidance.clarity_assessment,
          missing_info_questions: guidance.follow_up_questions || [],
          summary_of_understanding: guidance.project_understanding,
          technical_recommendations: guidance.technical_recommendations || [],
          architecture_suggestions: guidance.architecture_guidance ? [guidance.architecture_guidance] : [],
          implementation_priorities: guidance.implementation_roadmap || [],
          risk_assessment: { 
            level: 'medium', 
            analysis: guidance.risk_analysis,
            factors: guidance.success_factors || []
          },
          clarity_score: guidance.overall_confidence || 7
        };
      }
      
      throw new Error('AI Guidance Engine returned unsuccessful result');
    } catch (error) {
      structuredLogger.error('Failed to generate enhanced AI guidance', {
        error: error.message
      });
      
      // Return fallback guidance
      return {
        clarity_check: 'Enhanced AI guidance unavailable - using fallback assessment',
        missing_info_questions: [],
        summary_of_understanding: 'Project concept processed but detailed AI analysis unavailable',
        technical_recommendations: [],
        architecture_suggestions: [],
        implementation_priorities: ['Core functionality', 'User interface', 'Data management'],
        risk_assessment: { level: 'medium', factors: ['AI service unavailable'] },
        clarity_score: 5
      };
    }
  }

  /**
   * Validate enhanced questionnaire structure
   * @param {Object} questionnaireData - Questionnaire data to validate
   * @param {string} userMode - User mode for validation context
   * @returns {Promise<Object>} Validation result
   */
  async validateEnhancedStructure(questionnaireData, userMode) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      missingFields: []
    };

    // Validate core structure
    const requiredSections = ['project_overview', 'app_structure'];
    for (const section of requiredSections) {
      if (!questionnaireData[section]) {
        validation.isValid = false;
        validation.errors.push(`Missing required section: ${section}`);
      }
    }

    // Validate user mode specific requirements
    if (userMode === 'developer') {
      if (!questionnaireData.technical_blueprint) {
        validation.warnings.push('Developer mode should include technical blueprint');
      }
    }

    // Validate enhanced structure fields
    if (questionnaireData.user_flow && !questionnaireData.user_flow.user_journey) {
      validation.warnings.push('User flow section incomplete - missing user journey');
    }

    if (questionnaireData.pages && questionnaireData.pages.length === 0) {
      validation.warnings.push('Pages array is empty - consider adding page definitions');
    }

    return validation;
  }

  /**
   * Validate technical blueprint for developer mode
   * @param {Object} technicalBlueprint - Technical blueprint to validate
   * @returns {Promise<Object>} Validation result
   */
  async validateTechnicalBlueprint(technicalBlueprint) {
    if (!technicalBlueprint) {
      return {
        isValid: false,
        errors: ['Technical blueprint is required for developer mode'],
        warnings: []
      };
    }

    const validation = {
      isValid: true,
      errors: [],
      warnings: []
    };

    const requiredFields = ['frontend_framework', 'backend_framework', 'database_engine'];
    for (const field of requiredFields) {
      if (!technicalBlueprint[field]) {
        validation.isValid = false;
        validation.errors.push(`Missing required technical field: ${field}`);
      }
    }

    return validation;
  }

  /**
   * Analyze framework compatibility
   * @param {Object} technicalBlueprint - Technical blueprint
   * @returns {Promise<Object>} Compatibility analysis
   */
  async analyzeFrameworkCompatibility(technicalBlueprint) {
    if (!technicalBlueprint) {
      return { compatible: false, analysis: 'No technical blueprint provided' };
    }

    const prompt = `Analyze the compatibility of this technical stack:

Frontend: ${technicalBlueprint.frontend_framework}
Backend: ${technicalBlueprint.backend_framework}
Database: ${technicalBlueprint.database_engine}
Package Manager: ${technicalBlueprint.package_installer}
Testing: ${technicalBlueprint.testing_library}
Utilities: ${technicalBlueprint.utilities?.join(', ')}

Provide compatibility analysis including:
1. Framework compatibility assessment
2. Known conflicts or issues
3. Recommended alternatives if conflicts exist
4. Best practices for this stack

Respond in JSON format:
{
  "compatible": true/false,
  "compatibility_score": 0-10,
  "conflicts": ["list of conflicts"],
  "recommendations": ["list of recommendations"],
  "alternatives": {"framework": "alternative"},
  "best_practices": ["list of practices"]
}`;

    try {
      const response = await modelRouter.routeTask({
        role: 'architect',
        prompt,
        complexity: 'medium'
      });

      return this.parseCompatibilityResponse(response.content);
    } catch (error) {
      structuredLogger.error('Failed to analyze framework compatibility', {
        error: error.message
      });
      
      return {
        compatible: true,
        compatibility_score: 7,
        conflicts: [],
        recommendations: ['Unable to perform detailed compatibility analysis'],
        alternatives: {},
        best_practices: ['Follow framework documentation', 'Use latest stable versions']
      };
    }
  }

  /**
   * Request technical inference for non-developer users
   * @param {Object} questionnaireData - Questionnaire data
   * @returns {Promise<Object>} Technical inference result
   */
  async requestTechnicalInference(questionnaireData) {
    try {
      // Use the new Technical Inference Service
      const inferenceResult = await technicalInferenceService.inferTechnicalStack(questionnaireData);
      
      if (inferenceResult.success) {
        return {
          success: true,
          inferred_stack: inferenceResult.recommended_stack,
          reasoning: inferenceResult.reasoning.executive_summary || 'Technical stack inferred based on project requirements',
          confidence: inferenceResult.confidence,
          compatibility_analysis: inferenceResult.compatibility,
          alternatives: inferenceResult.alternatives
        };
      }
      
      throw new Error('Technical inference service returned unsuccessful result');
    } catch (error) {
      structuredLogger.error('Failed to request technical inference', {
        error: error.message
      });
      
      // Fallback to existing AI questionnaire processor logic
      try {
        const inferredSpec = await aiQuestionnaireProcessor.inferTechnicalDetails(questionnaireData);
        return {
          success: true,
          inferred_stack: inferredSpec.technical_stack,
          reasoning: 'Technical stack inferred using fallback method',
          confidence: 0.6
        };
      } catch (fallbackError) {
        return {
          success: false,
          inferred_stack: null,
          reasoning: 'Technical inference failed - using defaults',
          confidence: 0.3
        };
      }
    }
  }

  /**
   * Simplify specification for non-developer users
   * @param {Object} questionnaireData - Original questionnaire data
   * @returns {Promise<Object>} Simplified specification
   */
  async simplifyForNonDeveloper(questionnaireData) {
    // Group and simplify complex technical concepts
    const simplified = {
      ...questionnaireData,
      simplified_summary: {
        what_it_does: questionnaireData.project_overview?.app_summary,
        who_uses_it: questionnaireData.project_overview?.potential_users,
        main_features: this.extractMainFeatures(questionnaireData),
        data_handling: this.simplifyDataFlow(questionnaireData.data_flow),
        design_style: questionnaireData.design_preferences?.theme_style
      }
    };

    return simplified;
  }

  /**
   * Extract main features from questionnaire data
   * @param {Object} questionnaireData - Questionnaire data
   * @returns {Array} List of main features
   */
  extractMainFeatures(questionnaireData) {
    const features = [];
    
    if (questionnaireData.app_structure?.authentication_needed) {
      features.push('User accounts and login');
    }
    
    if (questionnaireData.pages?.length > 0) {
      features.push(`${questionnaireData.pages.length} main pages/screens`);
    }
    
    if (questionnaireData.data_flow?.user_data_storage !== 'none') {
      features.push('Data storage and management');
    }
    
    if (questionnaireData.user_flow?.user_journey?.length > 0) {
      features.push('Multi-step user workflow');
    }
    
    return features.length > 0 ? features : ['Basic web application'];
  }

  /**
   * Simplify data flow information for non-developers
   * @param {Object} dataFlow - Data flow configuration
   * @returns {Object} Simplified data flow description
   */
  simplifyDataFlow(dataFlow) {
    if (!dataFlow) {
      return { description: 'No specific data requirements' };
    }

    return {
      description: dataFlow.user_data_storage === 'none' 
        ? 'No user data stored' 
        : 'Stores user information securely',
      privacy_level: dataFlow.data_privacy || 'standard',
      public_sharing: dataFlow.data_shared_publicly === 'yes' ? 'Some data may be public' : 'Data kept private'
    };
  }

  /**
   * Perform final validation on processed specification
   * @param {Object} processedSpec - Processed specification
   * @param {string} userMode - User mode
   * @returns {Promise<Object>} Final validation result
   */
  async performFinalValidation(processedSpec, userMode) {
    const validation = {
      isComplete: true,
      completeness_score: 0,
      missing_critical: [],
      missing_optional: [],
      warnings: [],
      suggestions: []
    };

    // Calculate completeness score
    validation.completeness_score = this.calculateCompleteness(processedSpec);
    validation.isComplete = validation.completeness_score >= 0.7;

    // Check for critical missing information
    if (!processedSpec.project_overview?.app_name) {
      validation.missing_critical.push('Project name is required');
    }

    if (!processedSpec.project_overview?.app_summary) {
      validation.missing_critical.push('Project description is required');
    }

    // Add mode-specific validation
    if (userMode === 'developer') {
      if (!processedSpec.technical_blueprint?.frontend_framework) {
        validation.missing_critical.push('Frontend framework selection required for developer mode');
      }
    }

    // Generate contextual suggestions
    validation.suggestions = await this.generateContextualSuggestions(processedSpec, userMode);

    return validation;
  }

  /**
   * Calculate specification completeness score
   * @param {Object} spec - Specification to evaluate
   * @returns {number} Completeness score (0-1)
   */
  calculateCompleteness(spec) {
    let score = 0;
    let maxScore = 0;

    // Core project information (40% weight)
    maxScore += 4;
    if (spec.project_overview?.app_name) score += 1;
    if (spec.project_overview?.app_summary) score += 1;
    if (spec.project_overview?.niche) score += 1;
    if (spec.project_overview?.potential_users) score += 1;

    // App structure (30% weight)
    maxScore += 3;
    if (spec.app_structure?.app_type) score += 1;
    if (spec.app_structure?.authentication_needed !== undefined) score += 1;
    if (spec.app_structure?.deployment_preference) score += 1;

    // User flow and pages (20% weight)
    maxScore += 2;
    if (spec.user_flow?.user_journey?.length > 0) score += 1;
    if (spec.pages?.length > 0) score += 1;

    // Data flow (10% weight)
    maxScore += 1;
    if (spec.data_flow?.data_privacy) score += 1;

    return maxScore > 0 ? score / maxScore : 0;
  }

  /**
   * Assess specification complexity
   * @param {Object} spec - Specification to evaluate
   * @returns {Object} Complexity assessment
   */
  assessComplexity(spec) {
    let complexityScore = 0;
    const factors = [];

    // User journey complexity
    const journeySteps = spec.user_flow?.user_journey?.length || 0;
    if (journeySteps > 5) {
      complexityScore += 2;
      factors.push('Complex user journey');
    } else if (journeySteps > 2) {
      complexityScore += 1;
      factors.push('Multi-step user flow');
    }

    // Page count complexity
    const pageCount = spec.pages?.length || 0;
    if (pageCount > 10) {
      complexityScore += 2;
      factors.push('Many pages/screens');
    } else if (pageCount > 5) {
      complexityScore += 1;
      factors.push('Multiple pages');
    }

    // Authentication and roles
    if (spec.app_structure?.authentication_needed) {
      complexityScore += 1;
      factors.push('User authentication');
      
      if (spec.app_structure?.roles_or_permissions?.length > 1) {
        complexityScore += 1;
        factors.push('Role-based permissions');
      }
    }

    // Data complexity
    if (spec.data_flow?.data_sources?.length > 1) {
      complexityScore += 1;
      factors.push('Multiple data sources');
    }

    // Technical complexity (for developer mode)
    if (spec.technical_blueprint) {
      if (spec.technical_blueprint.utilities?.length > 3) {
        complexityScore += 1;
        factors.push('Multiple utilities/tools');
      }
    }

    return {
      score: Math.min(complexityScore, 10),
      level: complexityScore <= 2 ? 'low' : complexityScore <= 5 ? 'medium' : 'high',
      factors
    };
  }

  /**
   * Generate contextual suggestions based on specification
   * @param {Object} spec - Processed specification
   * @param {string} userMode - User mode
   * @returns {Promise<Array>} List of suggestions
   */
  async generateContextualSuggestions(spec, userMode) {
    const suggestions = [];

    // Complexity-based suggestions
    const complexity = this.assessComplexity(spec);
    if (complexity.level === 'high') {
      suggestions.push('Consider breaking this into phases for easier development');
      suggestions.push('High complexity projects benefit from detailed planning');
    }

    // Mode-specific suggestions
    if (userMode === 'non-developer') {
      suggestions.push('Consider consulting with a developer for technical implementation');
      if (!spec.design_preferences?.theme_style) {
        suggestions.push('Adding design preferences will help create a better user experience');
      }
    }

    // Scale-based suggestions
    const userCount = spec.project_overview?.estimated_user_count;
    if (userCount === '10000+') {
      suggestions.push('High-scale applications require robust infrastructure planning');
      suggestions.push('Consider implementing monitoring and analytics from the start');
    }

    return suggestions;
  }

  /**
   * Build enhanced guidance prompt for AI processing
   * @param {Object} processedSpec - Processed specification
   * @param {string} userMode - User mode
   * @returns {string} AI guidance prompt
   */
  buildEnhancedGuidancePrompt(processedSpec, userMode) {
    return `You are an expert software architect providing comprehensive guidance for a ${userMode} user's project specification.

Project Specification:
${JSON.stringify(processedSpec, null, 2)}

Please provide detailed analysis including:

1. Clarity Assessment: Rate the specification clarity (1-10) and identify ambiguities
2. Missing Information: List specific questions to fill gaps
3. Project Summary: Clear summary of the intended application
4. Technical Recommendations: Suggest appropriate technologies and patterns
5. Architecture Suggestions: Recommend architectural approaches
6. Implementation Priorities: Suggest development phases and priorities
7. Risk Assessment: Identify potential challenges and mitigation strategies

Consider the user's ${userMode} experience level in your recommendations.

Respond in JSON format:
{
  "clarity_score": 8,
  "clarity_assessment": "The specification is clear but...",
  "missing_questions": ["What authentication method is preferred?", "..."],
  "project_summary": "This application will...",
  "technical_recommendations": ["Use PostgreSQL for data persistence", "..."],
  "architecture_suggestions": ["Implement microservices architecture", "..."],
  "implementation_priorities": ["Phase 1: Core functionality", "..."],
  "risk_assessment": {
    "level": "medium",
    "factors": ["Complex user flow", "..."],
    "mitigation": ["Break into smaller phases", "..."]
  }
}`;
  }

  /**
   * Parse enhanced AI guidance response
   * @param {string} response - AI response content
   * @returns {Object} Parsed guidance object
   */
  parseEnhancedGuidanceResponse(response) {
    try {
      return JSON.parse(response);
    } catch (error) {
      structuredLogger.error('Failed to parse enhanced AI guidance response', {
        error: error.message,
        response: response.substring(0, 200)
      });
      
      // Return fallback structure
      return {
        clarity_score: 5,
        clarity_assessment: 'Unable to parse AI guidance response',
        missing_questions: [],
        project_summary: 'Project analysis unavailable',
        technical_recommendations: [],
        architecture_suggestions: [],
        implementation_priorities: [],
        risk_assessment: { level: 'unknown', factors: [], mitigation: [] }
      };
    }
  }

  /**
   * Parse compatibility analysis response
   * @param {string} response - AI response content
   * @returns {Object} Parsed compatibility object
   */
  parseCompatibilityResponse(response) {
    try {
      return JSON.parse(response);
    } catch (error) {
      return {
        compatible: true,
        compatibility_score: 7,
        conflicts: [],
        recommendations: ['Unable to perform detailed compatibility analysis'],
        alternatives: {},
        best_practices: []
      };
    }
  }

  /**
   * Create processing snapshot for audit logging
   * @param {Object} questionnaireData - Original questionnaire data
   * @param {string} userMode - User mode
   * @returns {string} Processing snapshot
   */
  createProcessingSnapshot(questionnaireData, userMode) {
    return `Enhanced Questionnaire Processing
Project: ${questionnaireData.project_overview?.app_name || 'Unknown'}
Mode: ${userMode}
Summary: ${questionnaireData.project_overview?.app_summary || 'No summary'}
Pages: ${questionnaireData.pages?.length || 0}
User Journey Steps: ${questionnaireData.user_flow?.user_journey?.length || 0}
Has Technical Blueprint: ${!!questionnaireData.technical_blueprint}`;
  }

  /**
   * Initialize validation rules for enhanced questionnaire
   * @returns {Object} Validation rules configuration
   */
  initializeValidationRules() {
    return {
      required_fields: {
        all_modes: [
          'project_overview.app_name',
          'project_overview.app_summary',
          'app_structure.app_type'
        ],
        developer: [
          'technical_blueprint.frontend_framework',
          'technical_blueprint.backend_framework'
        ],
        non_developer: []
      },
      field_types: {
        'project_overview.complexity_level': 'number',
        'app_structure.authentication_needed': 'boolean',
        'data_flow.analytics_or_tracking': 'boolean'
      }
    };
  }
}

// Create singleton instance
const enhancedSpecProcessor = new EnhancedSpecProcessor();

module.exports = enhancedSpecProcessor;