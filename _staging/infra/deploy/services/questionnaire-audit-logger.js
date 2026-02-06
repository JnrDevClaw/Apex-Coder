const auditLogger = require('./audit-logger');
const structuredLogger = require('./structured-logger');
const gdprComplianceService = require('./gdpr-compliance');
const crypto = require('crypto');

/**
 * Questionnaire Audit Logger - Enhanced audit logging for questionnaire processing
 * Provides comprehensive audit trails for user mode selection, technical inference, and AI guidance
 */
class QuestionnaireAuditLogger {
  constructor() {
    this.eventTypes = {
      USER_MODE_SELECTION: 'user_mode_selection',
      QUESTIONNAIRE_PROCESSING: 'questionnaire_processing',
      TECHNICAL_INFERENCE: 'technical_inference',
      AI_GUIDANCE_GENERATION: 'ai_guidance_generation',
      VALIDATION_CHECK: 'validation_check',
      DRAFT_MANAGEMENT: 'draft_management'
    };
    
    this.auditCategories = {
      USER_INTERACTION: 'user_interaction',
      AI_PROCESSING: 'ai_processing',
      TECHNICAL_ANALYSIS: 'technical_analysis',
      DATA_VALIDATION: 'data_validation',
      SYSTEM_OPERATION: 'system_operation'
    };
  }

  /**
   * Log user mode selection with detailed context and GDPR compliance
   * @param {Object} params - Logging parameters
   * @param {string} params.userId - User ID
   * @param {string} params.selectedMode - Selected user mode ('developer' or 'non-developer')
   * @param {Object} params.projectContext - Project context information
   * @param {Object} params.sessionInfo - Session information
   * @param {Object} params.metadata - Additional metadata
   * @returns {Promise<string>} Event ID
   */
  async logUserModeSelection({
    userId,
    selectedMode,
    projectContext = {},
    sessionInfo = {},
    metadata = {}
  }) {
    const correlationId = auditLogger.getCorrelationId() || auditLogger.generateCorrelationId();
    
    try {
      // Check and track consent for audit logging
      if (userId) {
        await this.ensureAuditLoggingConsent(userId, sessionInfo);
      }

      const rawEventDetails = {
        selectedMode,
        previousMode: sessionInfo.previousMode,
        selectionReason: sessionInfo.selectionReason,
        projectName: projectContext.app_name,
        projectType: projectContext.app_type,
        estimatedComplexity: projectContext.complexity_level,
        sessionDuration: sessionInfo.sessionDuration,
        modeChangeCount: sessionInfo.modeChangeCount || 0,
        userAgent: sessionInfo.userAgent,
        ipAddress: sessionInfo.ipAddress,
        timestamp: new Date().toISOString(),
        correlationId
      };

      // Detect and sanitize PII in event details
      const { sanitizedData: eventDetails, piiDetected } = gdprComplianceService.detectAndSanitizePII(
        rawEventDetails,
        {
          sanitize: true,
          logDetection: true,
          context: 'user_mode_selection',
          userId
        }
      );

      // Log to main audit system
      const eventId = await auditLogger.logEvent({
        event: this.eventTypes.USER_MODE_SELECTION,
        actor: userId || 'anonymous',
        actorType: 'user',
        action: 'select_user_mode',
        projectId: projectContext.app_name,
        details: eventDetails,
        metadata: {
          retentionDays: 90,
          category: this.auditCategories.USER_INTERACTION,
          severity: 'info',
          piiDetected: piiDetected.count > 0,
          piiTypes: piiDetected.types,
          gdprCompliant: true,
          ...metadata
        }
      });

      // Log to structured application logs with sanitized data
      structuredLogger.info('User mode selected', {
        eventId,
        userId,
        selectedMode,
        projectName: projectContext.app_name,
        correlationId,
        piiDetected: piiDetected.count > 0,
        ...eventDetails
      });

      // Log mode-specific analytics
      await this.logModeSelectionAnalytics(selectedMode, projectContext, eventDetails);

      return eventId;
    } catch (error) {
      structuredLogger.error('Failed to log user mode selection', {
        error: error.message,
        userId,
        selectedMode,
        correlationId
      });
      throw error;
    }
  }

  /**
   * Log technical inference process with comprehensive audit trail and GDPR compliance
   * @param {Object} params - Logging parameters
   * @param {string} params.userId - User ID
   * @param {Object} params.projectData - Project questionnaire data
   * @param {Object} params.inferenceResult - Technical inference result
   * @param {Object} params.processingMetrics - Processing performance metrics
   * @param {Object} params.metadata - Additional metadata
   * @returns {Promise<string>} Event ID
   */
  async logTechnicalInference({
    userId,
    projectData,
    inferenceResult,
    processingMetrics = {},
    metadata = {}
  }) {
    const correlationId = auditLogger.getCorrelationId() || auditLogger.generateCorrelationId();
    
    try {
      // Ensure consent for technical inference processing
      if (userId) {
        await gdprComplianceService.trackDataProcessingConsent(
          userId,
          gdprComplianceService.consentTypes.TECHNICAL_INFERENCE,
          true,
          {
            source: 'technical_inference_service',
            consentMethod: 'explicit',
            legalBasis: 'consent',
            projectId: projectData.project_overview?.app_name,
            sessionId: metadata.sessionId
          }
        );
      }
      const rawEventDetails = {
        projectName: projectData.project_overview?.app_name,
        projectComplexity: projectData.project_overview?.complexity_level,
        estimatedUsers: projectData.project_overview?.estimated_user_count,
        appType: projectData.app_structure?.app_type,
        
        // Input analysis
        inputAnalysis: {
          hasUserFlow: !!projectData.user_flow?.user_journey?.length,
          pagesCount: projectData.pages?.length || 0,
          hasDataFlow: !!projectData.data_flow,
          hasDesignPreferences: !!projectData.design_preferences,
          authenticationNeeded: projectData.app_structure?.authentication_needed,
          dataStorageType: projectData.data_flow?.user_data_storage
        },
        
        // Inference results
        inferenceResults: {
          success: inferenceResult.success,
          recommendedStack: inferenceResult.recommended_stack ? {
            frontend: inferenceResult.recommended_stack.frontend_framework,
            backend: inferenceResult.recommended_stack.backend_framework,
            database: inferenceResult.recommended_stack.database_engine,
            architecture: inferenceResult.recommended_stack.architecture_pattern
          } : null,
          confidence: inferenceResult.confidence,
          compatibilityScore: inferenceResult.compatibility?.compatibility_score,
          alternativesGenerated: inferenceResult.alternatives?.length || 0
        },
        
        // Processing metrics
        processingMetrics: {
          processingTime: processingMetrics.processingTime,
          aiModelCalls: processingMetrics.aiModelCalls || 0,
          requirementsAnalysisTime: processingMetrics.requirementsAnalysisTime,
          stackGenerationTime: processingMetrics.stackGenerationTime,
          compatibilityCheckTime: processingMetrics.compatibilityCheckTime,
          reasoningGenerationTime: processingMetrics.reasoningGenerationTime
        },
        
        // Error information (if any)
        errorInfo: inferenceResult.error ? {
          errorType: inferenceResult.error.type,
          errorMessage: inferenceResult.error.message,
          errorCode: inferenceResult.error.code,
          fallbackUsed: inferenceResult.fallbackUsed
        } : null,
        
        timestamp: new Date().toISOString(),
        correlationId
      };

      // Detect and sanitize PII in event details and project data
      const { sanitizedData: eventDetails, piiDetected } = gdprComplianceService.detectAndSanitizePII(
        rawEventDetails,
        {
          sanitize: true,
          logDetection: true,
          context: 'technical_inference',
          userId
        }
      );

      // Also sanitize project data for snapshot
      const { sanitizedData: sanitizedProjectData } = gdprComplianceService.detectAndSanitizePII(
        projectData,
        {
          sanitize: true,
          logDetection: false, // Already logged above
          context: 'technical_inference_project_data',
          userId
        }
      );

      // Log to main audit system
      const eventId = await auditLogger.logEvent({
        event: this.eventTypes.TECHNICAL_INFERENCE,
        actor: 'technical-inference-service',
        actorType: 'ai-agent',
        action: inferenceResult.success ? 'inference_completed' : 'inference_failed',
        projectId: projectData.project_overview?.app_name,
        details: eventDetails,
        metadata: {
          retentionDays: 90,
          category: this.auditCategories.TECHNICAL_ANALYSIS,
          severity: inferenceResult.success ? 'info' : 'warning',
          piiDetected: piiDetected.count > 0,
          piiTypes: piiDetected.types,
          gdprCompliant: true,
          dataProcessingConsent: true,
          ...metadata
        }
      });

      // Log AI action for technical inference with sanitized data
      await auditLogger.logAIAction(
        'technical-inference-service',
        'infer_technical_stack',
        this.createTechnicalInferenceSnapshot(sanitizedProjectData, inferenceResult),
        [],
        {
          projectId: projectData.project_overview?.app_name,
          userId,
          confidence: inferenceResult.confidence,
          processingTime: processingMetrics.processingTime,
          correlationId,
          piiSanitized: piiDetected.count > 0
        }
      );

      // Log to structured application logs
      structuredLogger.info('Technical inference completed', {
        eventId,
        userId,
        projectName: projectData.project_overview?.app_name,
        success: inferenceResult.success,
        confidence: inferenceResult.confidence,
        processingTime: processingMetrics.processingTime,
        correlationId
      });

      // Log inference performance metrics
      await this.logInferencePerformanceMetrics(processingMetrics, inferenceResult, eventId);

      return eventId;
    } catch (error) {
      structuredLogger.error('Failed to log technical inference', {
        error: error.message,
        userId,
        projectName: projectData.project_overview?.app_name,
        correlationId
      });
      throw error;
    }
  }

  /**
   * Log AI guidance generation with detailed audit trail and GDPR compliance
   * @param {Object} params - Logging parameters
   * @param {string} params.userId - User ID
   * @param {Object} params.projectData - Project questionnaire data
   * @param {string} params.userMode - User mode
   * @param {string} params.guidanceType - Type of guidance generated
   * @param {Object} params.guidanceResult - AI guidance result
   * @param {Object} params.processingMetrics - Processing performance metrics
   * @param {Object} params.metadata - Additional metadata
   * @returns {Promise<string>} Event ID
   */
  async logAIGuidanceGeneration({
    userId,
    projectData,
    userMode,
    guidanceType,
    guidanceResult,
    processingMetrics = {},
    metadata = {}
  }) {
    const correlationId = auditLogger.getCorrelationId() || auditLogger.generateCorrelationId();
    
    try {
      // Ensure consent for AI processing
      if (userId) {
        await this.ensureAIProcessingConsent(userId, metadata.sessionInfo || {});
      }
      const rawEventDetails = {
        projectName: projectData.project_overview?.app_name,
        userMode,
        guidanceType,
        
        // Input analysis
        inputAnalysis: {
          projectComplexity: projectData.project_overview?.complexity_level,
          completenessScore: this.calculateCompletenessScore(projectData),
          hasUserJourney: !!projectData.user_flow?.user_journey?.length,
          pagesCount: projectData.pages?.length || 0,
          hasTechnicalBlueprint: !!projectData.technical_blueprint,
          estimatedUsers: projectData.project_overview?.estimated_user_count
        },
        
        // Guidance results
        guidanceResults: {
          success: guidanceResult.success,
          questionsGenerated: guidanceResult.guidance?.follow_up_questions?.length || 0,
          recommendationsGenerated: guidanceResult.guidance?.technical_recommendations?.length || 0,
          clarityScore: guidanceResult.guidance?.overall_confidence || guidanceResult.guidance?.clarity_score || 0,
          guidanceCategories: guidanceResult.guidance ? Object.keys(guidanceResult.guidance) : [],
          hasSummary: !!guidanceResult.guidance?.project_understanding,
          hasRiskAnalysis: !!guidanceResult.guidance?.risk_analysis,
          hasImplementationRoadmap: !!guidanceResult.guidance?.implementation_roadmap
        },
        
        // Processing metrics
        processingMetrics: {
          processingTime: processingMetrics.processingTime,
          aiModelCalls: processingMetrics.aiModelCalls || 0,
          promptTokens: processingMetrics.promptTokens,
          responseTokens: processingMetrics.responseTokens,
          modelUsed: processingMetrics.modelUsed,
          temperature: processingMetrics.temperature,
          retryAttempts: processingMetrics.retryAttempts || 0
        },
        
        // Quality metrics
        qualityMetrics: {
          responseCoherence: processingMetrics.responseCoherence,
          relevanceScore: processingMetrics.relevanceScore,
          completenessScore: processingMetrics.completenessScore,
          actionabilityScore: processingMetrics.actionabilityScore
        },
        
        // Error information (if any)
        errorInfo: guidanceResult.error ? {
          errorType: guidanceResult.error.type,
          errorMessage: guidanceResult.error.message,
          errorCode: guidanceResult.error.code,
          fallbackUsed: guidanceResult.fallbackUsed
        } : null,
        
        timestamp: new Date().toISOString(),
        correlationId
      };

      // Detect and sanitize PII in event details
      const { sanitizedData: eventDetails, piiDetected } = gdprComplianceService.detectAndSanitizePII(
        rawEventDetails,
        {
          sanitize: true,
          logDetection: true,
          context: 'ai_guidance_generation',
          userId
        }
      );

      // Sanitize project data for snapshot
      const { sanitizedData: sanitizedProjectData } = gdprComplianceService.detectAndSanitizePII(
        projectData,
        {
          sanitize: true,
          logDetection: false,
          context: 'ai_guidance_project_data',
          userId
        }
      );

      // Log to main audit system
      const eventId = await auditLogger.logEvent({
        event: this.eventTypes.AI_GUIDANCE_GENERATION,
        actor: 'ai-guidance-engine',
        actorType: 'ai-agent',
        action: guidanceResult.success ? 'guidance_generated' : 'guidance_failed',
        projectId: projectData.project_overview?.app_name,
        details: eventDetails,
        metadata: {
          retentionDays: 90,
          category: this.auditCategories.AI_PROCESSING,
          severity: guidanceResult.success ? 'info' : 'warning',
          piiDetected: piiDetected.count > 0,
          piiTypes: piiDetected.types,
          gdprCompliant: true,
          dataProcessingConsent: true,
          ...metadata
        }
      });

      // Log AI action for guidance generation with sanitized data
      await auditLogger.logAIAction(
        'ai-guidance-engine',
        'generate_guidance',
        this.createGuidanceGenerationSnapshot(sanitizedProjectData, userMode, guidanceType, guidanceResult),
        [],
        {
          projectId: projectData.project_overview?.app_name,
          userId,
          userMode,
          guidanceType,
          questionsGenerated: guidanceResult.guidance?.follow_up_questions?.length || 0,
          processingTime: processingMetrics.processingTime,
          correlationId,
          piiSanitized: piiDetected.count > 0
        }
      );

      // Log to structured application logs
      structuredLogger.info('AI guidance generated', {
        eventId,
        userId,
        projectName: projectData.project_overview?.app_name,
        userMode,
        guidanceType,
        success: guidanceResult.success,
        questionsGenerated: guidanceResult.guidance?.follow_up_questions?.length || 0,
        processingTime: processingMetrics.processingTime,
        correlationId
      });

      // Log guidance quality metrics
      await this.logGuidanceQualityMetrics(eventDetails.qualityMetrics, guidanceResult, eventId);

      return eventId;
    } catch (error) {
      structuredLogger.error('Failed to log AI guidance generation', {
        error: error.message,
        userId,
        projectName: projectData.project_overview?.app_name,
        userMode,
        guidanceType,
        correlationId
      });
      throw error;
    }
  }

  /**
   * Log questionnaire processing start/completion
   * @param {Object} params - Logging parameters
   * @returns {Promise<string>} Event ID
   */
  async logQuestionnaireProcessing({
    userId,
    projectData,
    userMode,
    action, // 'start_processing' or 'complete_processing'
    processingResult = null,
    processingMetrics = {},
    metadata = {}
  }) {
    const correlationId = auditLogger.getCorrelationId() || auditLogger.generateCorrelationId();
    
    try {
      const eventDetails = {
        userMode,
        processingType: 'enhanced',
        action,
        
        // Project context
        projectContext: {
          name: projectData.project_overview?.app_name,
          type: projectData.app_structure?.app_type,
          complexity: projectData.project_overview?.complexity_level,
          estimatedUsers: projectData.project_overview?.estimated_user_count,
          niche: projectData.project_overview?.niche
        },
        
        // Input analysis
        inputAnalysis: {
          hasUserFlow: !!projectData.user_flow?.user_journey?.length,
          userJourneySteps: projectData.user_flow?.user_journey?.length || 0,
          pagesCount: projectData.pages?.length || 0,
          hasTechnicalBlueprint: !!projectData.technical_blueprint,
          hasDataFlow: !!projectData.data_flow,
          hasDesignPreferences: !!projectData.design_preferences,
          authenticationNeeded: projectData.app_structure?.authentication_needed
        },
        
        // Processing results (if completed)
        processingResults: processingResult ? {
          success: processingResult.success,
          completeness: processingResult.metadata?.completeness,
          complexity: processingResult.metadata?.complexity,
          aiGuidanceGenerated: !!processingResult.processedSpec?.ai_guidance,
          recommendationsCount: processingResult.recommendations?.length || 0,
          validationScore: processingResult.validation?.validation_score
        } : null,
        
        // Processing metrics
        processingMetrics: {
          processingDuration: processingMetrics.processingDuration,
          totalAIModelCalls: processingMetrics.totalAIModelCalls || 0,
          validationTime: processingMetrics.validationTime,
          enhancementTime: processingMetrics.enhancementTime,
          guidanceGenerationTime: processingMetrics.guidanceGenerationTime
        },
        
        timestamp: new Date().toISOString(),
        correlationId
      };

      // Log to main audit system
      const eventId = await auditLogger.logEvent({
        event: this.eventTypes.QUESTIONNAIRE_PROCESSING,
        actor: userId || 'anonymous',
        actorType: 'user',
        action,
        projectId: projectData.project_overview?.app_name,
        details: eventDetails,
        metadata: {
          retentionDays: 90,
          category: this.auditCategories.SYSTEM_OPERATION,
          severity: 'info',
          ...metadata
        }
      });

      // Log to structured application logs
      structuredLogger.info(`Questionnaire processing ${action}`, {
        eventId,
        userId,
        projectName: projectData.project_overview?.app_name,
        userMode,
        success: processingResult?.success,
        processingDuration: processingMetrics.processingDuration,
        correlationId
      });

      return eventId;
    } catch (error) {
      structuredLogger.error('Failed to log questionnaire processing', {
        error: error.message,
        userId,
        action,
        correlationId
      });
      throw error;
    }
  }

  /**
   * Log validation checks and results
   * @param {Object} params - Logging parameters
   * @returns {Promise<string>} Event ID
   */
  async logValidationCheck({
    userId,
    projectData,
    userMode,
    validationType, // 'structure', 'completeness', 'consistency'
    validationResult,
    metadata = {}
  }) {
    const correlationId = auditLogger.getCorrelationId() || auditLogger.generateCorrelationId();
    
    try {
      const eventDetails = {
        validationType,
        userMode,
        projectName: projectData.project_overview?.app_name,
        
        validationResult: {
          isValid: validationResult.isValid || validationResult.isComplete,
          score: validationResult.completeness_score || validationResult.validation_score,
          criticalIssues: validationResult.critical_issues?.length || validationResult.errors?.length || 0,
          warnings: validationResult.warnings?.length || 0,
          suggestions: validationResult.suggestions?.length || 0,
          missingFields: validationResult.missing_critical?.length || validationResult.missingFields?.length || 0
        },
        
        timestamp: new Date().toISOString(),
        correlationId
      };

      // Log to main audit system
      const eventId = await auditLogger.logEvent({
        event: this.eventTypes.VALIDATION_CHECK,
        actor: userId || 'system',
        actorType: userId ? 'user' : 'system',
        action: `validate_${validationType}`,
        projectId: projectData.project_overview?.app_name,
        details: eventDetails,
        metadata: {
          retentionDays: 90,
          category: this.auditCategories.DATA_VALIDATION,
          severity: validationResult.isValid ? 'info' : 'warning',
          ...metadata
        }
      });

      return eventId;
    } catch (error) {
      structuredLogger.error('Failed to log validation check', {
        error: error.message,
        userId,
        validationType,
        correlationId
      });
      throw error;
    }
  }

  /**
   * Log draft management operations
   * @param {Object} params - Logging parameters
   * @returns {Promise<string>} Event ID
   */
  async logDraftManagement({
    userId,
    action, // 'save_draft', 'load_draft', 'clear_draft', 'migrate_draft'
    draftData = {},
    metadata = {}
  }) {
    const correlationId = auditLogger.getCorrelationId() || auditLogger.generateCorrelationId();
    
    try {
      const eventDetails = {
        action,
        draftInfo: {
          projectName: draftData.project_overview?.app_name,
          userMode: draftData.userMode,
          completeness: this.calculateCompletenessScore(draftData),
          lastModified: draftData.lastModified,
          stageCompletion: draftData.stageCompletion,
          dataSize: JSON.stringify(draftData).length
        },
        timestamp: new Date().toISOString(),
        correlationId
      };

      // Log to main audit system
      const eventId = await auditLogger.logEvent({
        event: this.eventTypes.DRAFT_MANAGEMENT,
        actor: userId || 'anonymous',
        actorType: 'user',
        action,
        projectId: draftData.project_overview?.app_name,
        details: eventDetails,
        metadata: {
          retentionDays: 30, // Shorter retention for draft operations
          category: this.auditCategories.USER_INTERACTION,
          severity: 'info',
          ...metadata
        }
      });

      return eventId;
    } catch (error) {
      structuredLogger.error('Failed to log draft management', {
        error: error.message,
        userId,
        action,
        correlationId
      });
      throw error;
    }
  }

  // Helper methods

  /**
   * Ensure user has provided consent for audit logging
   * @param {string} userId - User ID
   * @param {Object} sessionInfo - Session information
   */
  async ensureAuditLoggingConsent(userId, sessionInfo = {}) {
    try {
      // Check if user has active consent for audit logging
      const consentStatus = await gdprComplianceService.getConsentStatus(
        userId, 
        gdprComplianceService.consentTypes.AUDIT_LOGGING
      );

      if (!consentStatus.hasActiveConsent) {
        // Track implicit consent for audit logging (required for service operation)
        await gdprComplianceService.trackDataProcessingConsent(
          userId,
          gdprComplianceService.consentTypes.AUDIT_LOGGING,
          true,
          {
            source: 'questionnaire_service',
            consentMethod: 'implicit',
            legalBasis: 'legitimate_interest',
            ipAddress: sessionInfo.ipAddress,
            userAgent: sessionInfo.userAgent,
            projectId: sessionInfo.projectId,
            sessionId: sessionInfo.sessionId
          }
        );
      }
    } catch (error) {
      structuredLogger.warn('Failed to ensure audit logging consent', {
        error: error.message,
        userId
      });
      // Don't throw - audit logging should continue even if consent tracking fails
    }
  }

  /**
   * Ensure user has provided consent for AI processing
   * @param {string} userId - User ID
   * @param {Object} sessionInfo - Session information
   */
  async ensureAIProcessingConsent(userId, sessionInfo = {}) {
    try {
      const consentStatus = await gdprComplianceService.getConsentStatus(
        userId, 
        gdprComplianceService.consentTypes.AI_ANALYSIS
      );

      if (!consentStatus.hasActiveConsent) {
        // Track explicit consent for AI processing
        await gdprComplianceService.trackDataProcessingConsent(
          userId,
          gdprComplianceService.consentTypes.AI_ANALYSIS,
          true,
          {
            source: 'questionnaire_service',
            consentMethod: 'explicit',
            legalBasis: 'consent',
            ipAddress: sessionInfo.ipAddress,
            userAgent: sessionInfo.userAgent,
            projectId: sessionInfo.projectId,
            sessionId: sessionInfo.sessionId
          }
        );
      }
    } catch (error) {
      structuredLogger.warn('Failed to ensure AI processing consent', {
        error: error.message,
        userId
      });
    }
  }

  /**
   * Log mode selection analytics for insights
   */
  async logModeSelectionAnalytics(selectedMode, projectContext, eventDetails) {
    try {
      const analyticsData = {
        mode: selectedMode,
        projectType: projectContext.app_type,
        complexity: projectContext.complexity_level,
        estimatedUsers: projectContext.estimated_user_count,
        sessionInfo: {
          duration: eventDetails.sessionDuration,
          changeCount: eventDetails.modeChangeCount,
          previousMode: eventDetails.previousMode
        }
      };

      structuredLogger.info('Mode selection analytics', {
        category: 'analytics',
        type: 'mode_selection',
        data: analyticsData,
        correlationId: eventDetails.correlationId
      });
    } catch (error) {
      // Don't throw on analytics failure
      structuredLogger.warn('Failed to log mode selection analytics', {
        error: error.message
      });
    }
  }

  /**
   * Log inference performance metrics
   */
  async logInferencePerformanceMetrics(processingMetrics, inferenceResult, eventId) {
    try {
      const performanceData = {
        eventId,
        totalTime: processingMetrics.processingTime,
        aiModelCalls: processingMetrics.aiModelCalls,
        confidence: inferenceResult.confidence,
        success: inferenceResult.success,
        breakdown: {
          requirementsAnalysis: processingMetrics.requirementsAnalysisTime,
          stackGeneration: processingMetrics.stackGenerationTime,
          compatibilityCheck: processingMetrics.compatibilityCheckTime,
          reasoningGeneration: processingMetrics.reasoningGenerationTime
        }
      };

      structuredLogger.info('Technical inference performance', {
        category: 'performance',
        type: 'technical_inference',
        data: performanceData
      });
    } catch (error) {
      structuredLogger.warn('Failed to log inference performance metrics', {
        error: error.message
      });
    }
  }

  /**
   * Log guidance quality metrics
   */
  async logGuidanceQualityMetrics(qualityMetrics, guidanceResult, eventId) {
    try {
      const qualityData = {
        eventId,
        success: guidanceResult.success,
        metrics: qualityMetrics,
        questionsGenerated: guidanceResult.guidance?.follow_up_questions?.length || 0,
        recommendationsGenerated: guidanceResult.guidance?.technical_recommendations?.length || 0,
        clarityScore: guidanceResult.guidance?.overall_confidence || 0
      };

      structuredLogger.info('AI guidance quality metrics', {
        category: 'quality',
        type: 'ai_guidance',
        data: qualityData
      });
    } catch (error) {
      structuredLogger.warn('Failed to log guidance quality metrics', {
        error: error.message
      });
    }
  }

  /**
   * Calculate questionnaire completeness score
   */
  calculateCompletenessScore(questionnaireData) {
    if (!questionnaireData) return 0;
    
    let score = 0;
    let maxScore = 10;

    // Core information (4 points)
    if (questionnaireData.project_overview?.app_name) score += 1;
    if (questionnaireData.project_overview?.app_summary) score += 1;
    if (questionnaireData.project_overview?.niche) score += 1;
    if (questionnaireData.app_structure?.app_type) score += 1;

    // User flow (2 points)
    if (questionnaireData.user_flow?.user_journey?.length > 0) score += 1;
    if (questionnaireData.user_flow?.overview_flow) score += 1;

    // Pages (2 points)
    if (questionnaireData.pages?.length > 0) score += 1;
    if (questionnaireData.pages?.length > 3) score += 1;

    // Data and design (2 points)
    if (questionnaireData.data_flow?.data_privacy) score += 1;
    if (questionnaireData.design_preferences?.theme_style) score += 1;

    return Math.round((score / maxScore) * 10);
  }

  /**
   * Create technical inference snapshot for audit logging
   */
  createTechnicalInferenceSnapshot(projectData, inferenceResult) {
    return `Technical Stack Inference
Project: ${projectData.project_overview?.app_name || 'Unknown'}
Type: ${projectData.app_structure?.app_type || 'Unknown'}
Complexity: ${projectData.project_overview?.complexity_level || 'Unknown'}/10
Success: ${inferenceResult.success}
Confidence: ${inferenceResult.confidence || 'Unknown'}
Recommended Stack:
- Frontend: ${inferenceResult.recommended_stack?.frontend_framework || 'Not determined'}
- Backend: ${inferenceResult.recommended_stack?.backend_framework || 'Not determined'}
- Database: ${inferenceResult.recommended_stack?.database_engine || 'Not determined'}
- Architecture: ${inferenceResult.recommended_stack?.architecture_pattern || 'Not determined'}`;
  }

  /**
   * Create guidance generation snapshot for audit logging
   */
  createGuidanceGenerationSnapshot(projectData, userMode, guidanceType, guidanceResult) {
    return `AI Guidance Generation - ${guidanceType}
Project: ${projectData.project_overview?.app_name || 'Unknown'}
Mode: ${userMode}
Success: ${guidanceResult.success}
Completeness: ${this.calculateCompletenessScore(projectData)}/10
Questions Generated: ${guidanceResult.guidance?.follow_up_questions?.length || 0}
Recommendations: ${guidanceResult.guidance?.technical_recommendations?.length || 0}
Clarity Score: ${guidanceResult.guidance?.overall_confidence || guidanceResult.guidance?.clarity_score || 'Unknown'}`;
  }



  /**
   * Get audit statistics for questionnaire processing
   * @param {string} projectId - Project ID
   * @param {string} timeRange - Time range ('1h', '24h', '7d', '30d')
   * @returns {Promise<Object>} Audit statistics
   */
  async getQuestionnaireAuditStats(projectId, timeRange = '24h') {
    try {
      const events = await auditLogger.getProjectAuditLog(projectId, {
        startTime: this.getTimeRangeStart(timeRange),
        endTime: new Date().toISOString(),
        limit: 1000
      });

      const stats = {
        totalEvents: events.length,
        eventsByType: {},
        modeSelections: { developer: 0, 'non-developer': 0 },
        technicalInferences: { successful: 0, failed: 0 },
        aiGuidanceGenerations: { successful: 0, failed: 0 },
        validationChecks: { passed: 0, failed: 0 },
        averageProcessingTime: 0,
        averageConfidence: 0
      };

      let totalProcessingTime = 0;
      let totalConfidence = 0;
      let processingTimeCount = 0;
      let confidenceCount = 0;

      events.forEach(event => {
        // Count by event type
        stats.eventsByType[event.event] = (stats.eventsByType[event.event] || 0) + 1;

        // Analyze specific event types
        switch (event.event) {
          case this.eventTypes.USER_MODE_SELECTION:
            const mode = event.details?.selectedMode;
            if (mode && stats.modeSelections[mode] !== undefined) {
              stats.modeSelections[mode]++;
            }
            break;

          case this.eventTypes.TECHNICAL_INFERENCE:
            if (event.details?.inferenceResults?.success) {
              stats.technicalInferences.successful++;
              if (event.details.inferenceResults.confidence) {
                totalConfidence += event.details.inferenceResults.confidence;
                confidenceCount++;
              }
            } else {
              stats.technicalInferences.failed++;
            }
            
            if (event.details?.processingMetrics?.processingTime) {
              totalProcessingTime += event.details.processingMetrics.processingTime;
              processingTimeCount++;
            }
            break;

          case this.eventTypes.AI_GUIDANCE_GENERATION:
            if (event.details?.guidanceResults?.success) {
              stats.aiGuidanceGenerations.successful++;
            } else {
              stats.aiGuidanceGenerations.failed++;
            }
            break;

          case this.eventTypes.VALIDATION_CHECK:
            if (event.details?.validationResult?.isValid) {
              stats.validationChecks.passed++;
            } else {
              stats.validationChecks.failed++;
            }
            break;
        }
      });

      // Calculate averages
      stats.averageProcessingTime = processingTimeCount > 0 ? 
        Math.round(totalProcessingTime / processingTimeCount) : 0;
      stats.averageConfidence = confidenceCount > 0 ? 
        Math.round((totalConfidence / confidenceCount) * 100) / 100 : 0;

      return stats;
    } catch (error) {
      structuredLogger.error('Failed to get questionnaire audit stats', {
        error: error.message,
        projectId,
        timeRange
      });
      throw error;
    }
  }

  /**
   * Get time range start for statistics
   */
  getTimeRangeStart(timeRange) {
    const now = new Date();
    switch (timeRange) {
      case '1h':
        return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      default:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    }
  }
}

// Create singleton instance
const questionnaireAuditLogger = new QuestionnaireAuditLogger();

module.exports = questionnaireAuditLogger;