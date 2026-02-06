const modelRouter = require('./model-router');
const auditLogger = require('./audit-logger');
const structuredLogger = require('./structured-logger');
const questionnaireAuditLogger = require('./questionnaire-audit-logger');
const MockAIService = require('./mock-ai-service');

/**
 * AI Guidance Engine - Enhanced AI guidance generation for questionnaire processing
 * Provides contextual follow-up questions, project understanding summaries, and intelligent guidance
 */
class AIGuidanceEngine {
  constructor() {
    this.guidanceTemplates = this.initializeGuidanceTemplates();
    this.questionCategories = this.initializeQuestionCategories();
    this.contextualPrompts = this.initializeContextualPrompts();
    this.mockService = new MockAIService();
    this.useMockService = process.env.MOCK_AI_RESPONSES === 'true' || !this.hasRealAIKeys();
  }

  hasRealAIKeys() {
    return !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.HUGGINGFACE_API_KEY);
  }

  /**
   * Generate comprehensive AI guidance for enhanced questionnaire structure
   * @param {Object} questionnaireData - Enhanced questionnaire data
   * @param {string} userMode - User mode ('developer' or 'non-developer')
   * @param {Object} options - Guidance generation options
   * @returns {Promise<Object>} Comprehensive AI guidance
   */
  async generateContextualGuidance(questionnaireData, userMode, options = {}) {
    const correlationId = auditLogger.getCorrelationId() || auditLogger.generateCorrelationId();
    
    try {
      // Log AI guidance generation start with enhanced audit trail
      const startTime = Date.now();

      structuredLogger.info('Generating contextual AI guidance', {
        userMode,
        projectName: questionnaireData.project_overview?.app_name,
        guidanceType: options.type || 'comprehensive',
        useMockService: this.useMockService,
        correlationId
      });

      // Use mock service if configured or no real AI keys available
      if (this.useMockService) {
        structuredLogger.info('Using mock AI service for guidance generation');
        return await this.mockService.generateGuidance(questionnaireData, userMode, options);
      }

      // Generate different types of guidance based on options
      const guidanceType = options.type || 'comprehensive';
      
      let guidance;
      switch (guidanceType) {
        case 'follow-up':
          guidance = await this.generateFollowUpQuestions(questionnaireData, userMode);
          break;
        case 'summary':
          guidance = await this.generateProjectSummary(questionnaireData, userMode);
          break;
        case 'validation':
          guidance = await this.generateValidationGuidance(questionnaireData, userMode);
          break;
        case 'comprehensive':
        default:
          guidance = await this.generateComprehensiveGuidance(questionnaireData, userMode);
          break;
      }

      // Log guidance generation completion with enhanced audit trail
      const processingTime = Date.now() - startTime;
      await questionnaireAuditLogger.logAIGuidanceGeneration({
        userId: options.userId,
        projectData: questionnaireData,
        userMode,
        guidanceType,
        guidanceResult: {
          success: true,
          guidance
        },
        processingMetrics: {
          processingTime,
          aiModelCalls: 1, // Will be tracked more precisely in future
          modelUsed: 'default',
          temperature: 0.3
        }
      });

      return {
        success: true,
        guidance,
        metadata: {
          generated_at: new Date().toISOString(),
          user_mode: userMode,
          guidance_type: guidanceType,
          engine_version: '2.0'
        }
      };
    } catch (error) {
      // Log guidance generation failure with enhanced audit trail
      const processingTime = Date.now() - startTime;
      await questionnaireAuditLogger.logAIGuidanceGeneration({
        userId: options.userId,
        projectData: questionnaireData,
        userMode,
        guidanceType: options.type || 'comprehensive',
        guidanceResult: {
          success: false,
          error: {
            message: error.message,
            type: error.constructor.name
          }
        },
        processingMetrics: {
          processingTime,
          aiModelCalls: 0
        }
      });

      structuredLogger.error('AI guidance generation failed', {
        userMode,
        error: error.message,
        stack: error.stack,
        correlationId
      });
      throw error;
    }
  }

  /**
   * Generate contextual follow-up questions based on incomplete or unclear data
   * @param {Object} questionnaireData - Questionnaire data
   * @param {string} userMode - User mode
   * @returns {Promise<Object>} Follow-up questions and guidance
   */
  async generateFollowUpQuestions(questionnaireData, userMode) {
    const incompleteness = this.analyzeIncompleteness(questionnaireData, userMode);
    const ambiguities = this.detectAmbiguities(questionnaireData);
    
    const prompt = this.buildFollowUpPrompt(questionnaireData, userMode, incompleteness, ambiguities);
    
    try {
      const response = await modelRouter.routeTask({
        role: 'interviewer',
        prompt,
        complexity: 'medium'
      });

      const parsedResponse = this.parseFollowUpResponse(response.content);
      
      return {
        follow_up_questions: parsedResponse.questions,
        question_categories: this.categorizeQuestions(parsedResponse.questions),
        priority_questions: parsedResponse.priority_questions || [],
        guidance_notes: parsedResponse.guidance_notes || [],
        completeness_assessment: {
          current_score: this.calculateCompletenessScore(questionnaireData),
          missing_areas: incompleteness.missing_areas,
          ambiguous_areas: ambiguities
        }
      };
    } catch (error) {
      structuredLogger.error('Failed to generate follow-up questions', {
        error: error.message
      });
      
      return {
        follow_up_questions: this.generateFallbackQuestions(incompleteness, userMode),
        question_categories: { clarification: [], enhancement: [], technical: [] },
        priority_questions: [],
        guidance_notes: ['AI guidance temporarily unavailable'],
        completeness_assessment: {
          current_score: this.calculateCompletenessScore(questionnaireData),
          missing_areas: incompleteness.missing_areas,
          ambiguous_areas: ambiguities
        }
      };
    }
  }

  /**
   * Generate project understanding summary
   * @param {Object} questionnaireData - Questionnaire data
   * @param {string} userMode - User mode
   * @returns {Promise<Object>} Project understanding summary
   */
  async generateProjectSummary(questionnaireData, userMode) {
    const prompt = this.buildSummaryPrompt(questionnaireData, userMode);
    
    try {
      const response = await modelRouter.routeTask({
        role: 'architect',
        prompt,
        complexity: 'medium'
      });

      const parsedResponse = this.parseSummaryResponse(response.content);
      
      return {
        executive_summary: parsedResponse.executive_summary,
        key_features: parsedResponse.key_features || [],
        user_journey_summary: parsedResponse.user_journey_summary,
        technical_overview: parsedResponse.technical_overview,
        complexity_assessment: parsedResponse.complexity_assessment,
        success_criteria: parsedResponse.success_criteria || [],
        potential_challenges: parsedResponse.potential_challenges || [],
        confidence_score: parsedResponse.confidence_score || 7
      };
    } catch (error) {
      structuredLogger.error('Failed to generate project summary', {
        error: error.message
      });
      
      return {
        executive_summary: this.generateFallbackSummary(questionnaireData),
        key_features: this.extractBasicFeatures(questionnaireData),
        user_journey_summary: 'User journey analysis unavailable',
        technical_overview: 'Technical analysis unavailable',
        complexity_assessment: 'Medium complexity assumed',
        success_criteria: ['Core functionality working', 'User-friendly interface'],
        potential_challenges: ['Standard development challenges'],
        confidence_score: 5
      };
    }
  }

  /**
   * Generate validation guidance for questionnaire responses
   * @param {Object} questionnaireData - Questionnaire data
   * @param {string} userMode - User mode
   * @returns {Promise<Object>} Validation guidance
   */
  async generateValidationGuidance(questionnaireData, userMode) {
    const validationIssues = this.identifyValidationIssues(questionnaireData, userMode);
    const consistencyChecks = this.performConsistencyChecks(questionnaireData);
    
    const prompt = this.buildValidationPrompt(questionnaireData, userMode, validationIssues, consistencyChecks);
    
    try {
      const response = await modelRouter.routeTask({
        role: 'reviewer',
        prompt,
        complexity: 'medium'
      });

      const parsedResponse = this.parseValidationResponse(response.content);
      
      return {
        validation_status: parsedResponse.validation_status,
        critical_issues: parsedResponse.critical_issues || [],
        warnings: parsedResponse.warnings || [],
        suggestions: parsedResponse.suggestions || [],
        consistency_analysis: parsedResponse.consistency_analysis,
        improvement_recommendations: parsedResponse.improvement_recommendations || [],
        validation_score: parsedResponse.validation_score || 7
      };
    } catch (error) {
      structuredLogger.error('Failed to generate validation guidance', {
        error: error.message
      });
      
      return {
        validation_status: 'partial',
        critical_issues: validationIssues.critical,
        warnings: validationIssues.warnings,
        suggestions: ['Complete all required fields', 'Review project scope'],
        consistency_analysis: 'Consistency check unavailable',
        improvement_recommendations: ['Add more detail to project description'],
        validation_score: 5
      };
    }
  }

  /**
   * Generate comprehensive guidance combining all aspects
   * @param {Object} questionnaireData - Questionnaire data
   * @param {string} userMode - User mode
   * @returns {Promise<Object>} Comprehensive guidance
   */
  async generateComprehensiveGuidance(questionnaireData, userMode) {
    const prompt = this.buildComprehensivePrompt(questionnaireData, userMode);
    
    try {
      const response = await modelRouter.routeTask({
        role: 'architect',
        prompt,
        complexity: 'high'
      });

      const parsedResponse = this.parseComprehensiveResponse(response.content);
      
      return {
        clarity_assessment: parsedResponse.clarity_assessment,
        project_understanding: parsedResponse.project_understanding,
        follow_up_questions: parsedResponse.follow_up_questions || [],
        technical_recommendations: parsedResponse.technical_recommendations || [],
        architecture_guidance: parsedResponse.architecture_guidance,
        implementation_roadmap: parsedResponse.implementation_roadmap || [],
        risk_analysis: parsedResponse.risk_analysis,
        success_factors: parsedResponse.success_factors || [],
        next_steps: parsedResponse.next_steps || [],
        overall_confidence: parsedResponse.overall_confidence || 7
      };
    } catch (error) {
      structuredLogger.error('Failed to generate comprehensive guidance', {
        error: error.message
      });
      
      return {
        clarity_assessment: 'Project concept received but detailed analysis unavailable',
        project_understanding: this.generateFallbackSummary(questionnaireData),
        follow_up_questions: this.generateFallbackQuestions({missing_areas: ['technical details']}, userMode),
        technical_recommendations: ['Use modern web technologies', 'Follow best practices'],
        architecture_guidance: 'Standard web application architecture recommended',
        implementation_roadmap: ['Plan', 'Design', 'Develop', 'Test', 'Deploy'],
        risk_analysis: 'Standard development risks apply',
        success_factors: ['Clear requirements', 'Good planning', 'Regular testing'],
        next_steps: ['Complete questionnaire', 'Review recommendations'],
        overall_confidence: 5
      };
    }
  }

  /**
   * Generate contextual help and suggestions for specific fields
   * @param {string} fieldName - Field name needing help
   * @param {Object} currentData - Current questionnaire data
   * @param {string} userMode - User mode
   * @returns {Promise<Object>} Contextual help
   */
  async generateContextualHelp(fieldName, currentData, userMode) {
    const prompt = this.buildContextualHelpPrompt(fieldName, currentData, userMode);
    
    try {
      const response = await modelRouter.routeTask({
        role: 'interviewer',
        prompt,
        complexity: 'low'
      });

      const parsedResponse = this.parseContextualHelpResponse(response.content);
      
      return {
        field_guidance: parsedResponse.field_guidance,
        examples: parsedResponse.examples || [],
        best_practices: parsedResponse.best_practices || [],
        common_mistakes: parsedResponse.common_mistakes || [],
        related_fields: parsedResponse.related_fields || []
      };
    } catch (error) {
      structuredLogger.error('Failed to generate contextual help', {
        fieldName,
        error: error.message
      });
      
      return {
        field_guidance: `Please provide information for ${fieldName}`,
        examples: [],
        best_practices: ['Be specific and clear'],
        common_mistakes: ['Being too vague'],
        related_fields: []
      };
    }
  }

  /**
   * Generate intelligent suggestions based on partial input
   * @param {string} partialInput - Partial user input
   * @param {string} fieldName - Field being filled
   * @param {Object} context - Current questionnaire context
   * @returns {Promise<Array>} Intelligent suggestions
   */
  async generateIntelligentSuggestions(partialInput, fieldName, context) {
    if (!partialInput || partialInput.length < 3) {
      return [];
    }

    const prompt = this.buildSuggestionPrompt(partialInput, fieldName, context);
    
    try {
      const response = await modelRouter.routeTask({
        role: 'interviewer',
        prompt,
        complexity: 'low'
      });

      const suggestions = this.parseSuggestionResponse(response.content);
      return suggestions.slice(0, 5); // Limit to 5 suggestions
    } catch (error) {
      structuredLogger.error('Failed to generate intelligent suggestions', {
        fieldName,
        error: error.message
      });
      
      return [];
    }
  }

  // Analysis methods

  /**
   * Analyze questionnaire incompleteness
   */
  analyzeIncompleteness(questionnaireData, userMode) {
    const missingAreas = [];
    const requiredFields = this.getRequiredFieldsByMode(userMode);
    
    // Check core project information
    if (!questionnaireData.project_overview?.app_name) {
      missingAreas.push('project_name');
    }
    if (!questionnaireData.project_overview?.app_summary) {
      missingAreas.push('project_description');
    }
    if (!questionnaireData.project_overview?.niche) {
      missingAreas.push('project_category');
    }

    // Check user flow information
    if (!questionnaireData.user_flow?.user_journey || questionnaireData.user_flow.user_journey.length === 0) {
      missingAreas.push('user_journey');
    }

    // Check page definitions
    if (!questionnaireData.pages || questionnaireData.pages.length === 0) {
      missingAreas.push('page_definitions');
    }

    // Check data flow
    if (!questionnaireData.data_flow?.data_privacy) {
      missingAreas.push('data_privacy');
    }

    // Check mode-specific requirements
    if (userMode === 'developer') {
      if (!questionnaireData.technical_blueprint?.frontend_framework) {
        missingAreas.push('frontend_framework');
      }
      if (!questionnaireData.technical_blueprint?.backend_framework) {
        missingAreas.push('backend_framework');
      }
    }

    return {
      missing_areas: missingAreas,
      completeness_score: this.calculateCompletenessScore(questionnaireData),
      critical_missing: missingAreas.filter(area => 
        ['project_name', 'project_description'].includes(area)
      )
    };
  }

  /**
   * Detect ambiguities in questionnaire responses
   */
  detectAmbiguities(questionnaireData) {
    const ambiguities = [];

    // Check for vague descriptions
    if (questionnaireData.project_overview?.app_summary?.length < 50) {
      ambiguities.push('project_description_too_brief');
    }

    // Check for inconsistent complexity vs features
    const complexity = questionnaireData.project_overview?.complexity_level || 5;
    const pageCount = questionnaireData.pages?.length || 0;
    
    if (complexity >= 8 && pageCount <= 2) {
      ambiguities.push('complexity_feature_mismatch');
    }

    // Check for unclear user journey
    const journeySteps = questionnaireData.user_flow?.user_journey?.length || 0;
    if (journeySteps > 0 && journeySteps < 3 && complexity >= 6) {
      ambiguities.push('incomplete_user_journey');
    }

    return ambiguities;
  }

  /**
   * Identify validation issues
   */
  identifyValidationIssues(questionnaireData, userMode) {
    const critical = [];
    const warnings = [];

    // Critical issues
    if (!questionnaireData.project_overview?.app_name) {
      critical.push('Missing project name');
    }

    if (!questionnaireData.project_overview?.app_summary) {
      critical.push('Missing project description');
    }

    // Warnings
    if (questionnaireData.project_overview?.complexity_level > 8 && 
        (!questionnaireData.pages || questionnaireData.pages.length < 5)) {
      warnings.push('High complexity but few pages defined');
    }

    if (questionnaireData.app_structure?.authentication_needed && 
        !questionnaireData.data_flow?.user_data_storage) {
      warnings.push('Authentication enabled but no user data storage specified');
    }

    return { critical, warnings };
  }

  /**
   * Perform consistency checks
   */
  performConsistencyChecks(questionnaireData) {
    const issues = [];

    // Check auth vs data storage consistency
    if (questionnaireData.app_structure?.authentication_needed && 
        questionnaireData.data_flow?.user_data_storage === 'none') {
      issues.push('Authentication requires user data storage');
    }

    // Check complexity vs user count consistency
    const complexity = questionnaireData.project_overview?.complexity_level || 5;
    const userCount = questionnaireData.project_overview?.estimated_user_count;
    
    if (complexity <= 3 && userCount === '10000+') {
      issues.push('Low complexity rating inconsistent with high user count');
    }

    return issues;
  }

  // Prompt building methods

  buildFollowUpPrompt(questionnaireData, userMode, incompleteness, ambiguities) {
    return `You are an expert interviewer helping to complete a ${userMode} user's project specification.

Current Project Data:
${JSON.stringify(questionnaireData, null, 2)}

Incompleteness Analysis:
- Missing areas: ${incompleteness.missing_areas.join(', ')}
- Completeness score: ${incompleteness.completeness_score}/10

Detected Ambiguities:
${ambiguities.join(', ')}

Generate 5-8 specific follow-up questions to:
1. Fill critical gaps in the specification
2. Clarify ambiguous or vague responses
3. Enhance the project understanding
4. ${userMode === 'developer' ? 'Gather technical details' : 'Understand user needs better'}

Prioritize questions by importance and group them logically.

Respond in JSON format:
{
  "questions": [
    {
      "question": "What specific features will users access on the main dashboard?",
      "category": "clarification",
      "priority": "high",
      "reasoning": "Dashboard functionality is unclear"
    }
  ],
  "priority_questions": ["Most important question 1", "Most important question 2"],
  "guidance_notes": ["Note about completing the questionnaire", "Suggestion for better responses"]
}`;
  }

  buildSummaryPrompt(questionnaireData, userMode) {
    return `You are an expert software architect. Analyze this ${userMode} user's project specification and provide a comprehensive understanding summary.

Project Specification:
${JSON.stringify(questionnaireData, null, 2)}

Provide a clear, comprehensive summary that demonstrates your understanding of:
1. What the user wants to build
2. Who will use it and how
3. Key features and functionality
4. Technical requirements (if specified)
5. Success criteria and goals

Tailor the summary to the ${userMode} user's level of technical expertise.

Respond in JSON format:
{
  "executive_summary": "Clear 2-3 sentence overview of the project",
  "key_features": ["Feature 1", "Feature 2", "Feature 3"],
  "user_journey_summary": "How users will interact with the application",
  "technical_overview": "Technical approach and architecture",
  "complexity_assessment": "Assessment of project complexity and challenges",
  "success_criteria": ["Success metric 1", "Success metric 2"],
  "potential_challenges": ["Challenge 1", "Challenge 2"],
  "confidence_score": 8
}`;
  }

  buildValidationPrompt(questionnaireData, userMode, validationIssues, consistencyChecks) {
    return `You are a project validation expert. Review this ${userMode} user's project specification for completeness, consistency, and feasibility.

Project Specification:
${JSON.stringify(questionnaireData, null, 2)}

Identified Issues:
- Critical: ${validationIssues.critical.join(', ')}
- Warnings: ${validationIssues.warnings.join(', ')}
- Consistency Issues: ${consistencyChecks.join(', ')}

Provide validation guidance including:
1. Overall validation status
2. Critical issues that must be addressed
3. Warnings and recommendations
4. Consistency analysis
5. Improvement suggestions

Respond in JSON format:
{
  "validation_status": "complete|partial|incomplete",
  "critical_issues": ["Issue 1", "Issue 2"],
  "warnings": ["Warning 1", "Warning 2"],
  "suggestions": ["Suggestion 1", "Suggestion 2"],
  "consistency_analysis": "Analysis of data consistency",
  "improvement_recommendations": ["Recommendation 1", "Recommendation 2"],
  "validation_score": 7
}`;
  }

  buildComprehensivePrompt(questionnaireData, userMode) {
    return `You are an expert software architect providing comprehensive guidance for a ${userMode} user's project.

Enhanced Project Specification:
${JSON.stringify(questionnaireData, null, 2)}

Provide comprehensive guidance covering:
1. Clarity assessment of the current specification
2. Project understanding summary
3. Critical follow-up questions
4. Technical recommendations appropriate for ${userMode} level
5. Architecture guidance
6. Implementation roadmap
7. Risk analysis and mitigation
8. Success factors
9. Recommended next steps

Tailor all guidance to the ${userMode} user's expertise level.

Respond in JSON format:
{
  "clarity_assessment": "Assessment of specification clarity",
  "project_understanding": "What you understand the user wants to build",
  "follow_up_questions": ["Question 1", "Question 2"],
  "technical_recommendations": ["Recommendation 1", "Recommendation 2"],
  "architecture_guidance": "Architectural approach recommendations",
  "implementation_roadmap": ["Phase 1", "Phase 2", "Phase 3"],
  "risk_analysis": "Potential risks and mitigation strategies",
  "success_factors": ["Factor 1", "Factor 2"],
  "next_steps": ["Step 1", "Step 2"],
  "overall_confidence": 8
}`;
  }

  buildContextualHelpPrompt(fieldName, currentData, userMode) {
    return `Provide contextual help for the "${fieldName}" field in a ${userMode} user's project questionnaire.

Current Project Context:
${JSON.stringify(currentData, null, 2)}

Provide helpful guidance for completing this field including:
1. Clear explanation of what information is needed
2. 2-3 relevant examples
3. Best practices for this field
4. Common mistakes to avoid
5. Related fields that might be affected

Tailor the help to the ${userMode} user's expertise level.

Respond in JSON format:
{
  "field_guidance": "Clear explanation of what's needed",
  "examples": ["Example 1", "Example 2", "Example 3"],
  "best_practices": ["Practice 1", "Practice 2"],
  "common_mistakes": ["Mistake 1", "Mistake 2"],
  "related_fields": ["Related field 1", "Related field 2"]
}`;
  }

  buildSuggestionPrompt(partialInput, fieldName, context) {
    return `Generate intelligent suggestions for completing the "${fieldName}" field.

Partial Input: "${partialInput}"
Project Context: ${JSON.stringify(context, null, 2)}

Based on the partial input and project context, suggest 3-5 relevant completions or alternatives.

Respond with a JSON array of suggestions:
["Suggestion 1", "Suggestion 2", "Suggestion 3"]`;
  }

  // Response parsing methods

  parseFollowUpResponse(response) {
    try {
      return JSON.parse(response);
    } catch (error) {
      return {
        questions: [
          {
            question: "Could you provide more details about the main functionality?",
            category: "clarification",
            priority: "high",
            reasoning: "More detail needed"
          }
        ],
        priority_questions: [],
        guidance_notes: []
      };
    }
  }

  parseSummaryResponse(response) {
    try {
      return JSON.parse(response);
    } catch (error) {
      return {
        executive_summary: "Project summary unavailable",
        key_features: [],
        user_journey_summary: "User journey analysis unavailable",
        technical_overview: "Technical analysis unavailable",
        complexity_assessment: "Medium complexity",
        success_criteria: [],
        potential_challenges: [],
        confidence_score: 5
      };
    }
  }

  parseValidationResponse(response) {
    try {
      return JSON.parse(response);
    } catch (error) {
      return {
        validation_status: "partial",
        critical_issues: [],
        warnings: [],
        suggestions: [],
        consistency_analysis: "Analysis unavailable",
        improvement_recommendations: [],
        validation_score: 5
      };
    }
  }

  parseComprehensiveResponse(response) {
    try {
      return JSON.parse(response);
    } catch (error) {
      return {
        clarity_assessment: "Assessment unavailable",
        project_understanding: "Understanding unavailable",
        follow_up_questions: [],
        technical_recommendations: [],
        architecture_guidance: "Guidance unavailable",
        implementation_roadmap: [],
        risk_analysis: "Analysis unavailable",
        success_factors: [],
        next_steps: [],
        overall_confidence: 5
      };
    }
  }

  parseContextualHelpResponse(response) {
    try {
      return JSON.parse(response);
    } catch (error) {
      return {
        field_guidance: "Please provide the requested information",
        examples: [],
        best_practices: [],
        common_mistakes: [],
        related_fields: []
      };
    }
  }

  parseSuggestionResponse(response) {
    try {
      const parsed = JSON.parse(response);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  // Utility methods

  calculateCompletenessScore(questionnaireData) {
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

  categorizeQuestions(questions) {
    const categories = {
      clarification: [],
      enhancement: [],
      technical: []
    };

    questions.forEach(q => {
      const category = q.category || 'clarification';
      if (categories[category]) {
        categories[category].push(q.question);
      }
    });

    return categories;
  }

  generateFallbackQuestions(incompleteness, userMode) {
    const questions = [];

    if (incompleteness.missing_areas.includes('project_description')) {
      questions.push({
        question: "Could you provide a more detailed description of what your application will do?",
        category: "clarification",
        priority: "high",
        reasoning: "Project description is missing"
      });
    }

    if (incompleteness.missing_areas.includes('user_journey')) {
      questions.push({
        question: "What are the main steps a user will take when using your application?",
        category: "clarification",
        priority: "medium",
        reasoning: "User journey is not defined"
      });
    }

    if (userMode === 'developer' && incompleteness.missing_areas.includes('frontend_framework')) {
      questions.push({
        question: "What frontend framework would you prefer to use for this project?",
        category: "technical",
        priority: "high",
        reasoning: "Technical stack not specified"
      });
    }

    return questions;
  }

  generateFallbackSummary(questionnaireData) {
    const appName = questionnaireData.project_overview?.app_name || 'the application';
    const appType = questionnaireData.app_structure?.app_type || 'web application';
    
    return `This project involves building ${appName}, which appears to be a ${appType}. ` +
           `The application will serve users with functionality that needs further clarification.`;
  }

  extractBasicFeatures(questionnaireData) {
    const features = [];
    
    if (questionnaireData.app_structure?.authentication_needed) {
      features.push('User authentication');
    }
    
    if (questionnaireData.pages?.length > 0) {
      features.push(`${questionnaireData.pages.length} main pages`);
    }
    
    if (questionnaireData.data_flow?.user_data_storage !== 'none') {
      features.push('Data storage');
    }
    
    return features.length > 0 ? features : ['Basic web functionality'];
  }

  getRequiredFieldsByMode(userMode) {
    const common = [
      'project_overview.app_name',
      'project_overview.app_summary',
      'app_structure.app_type'
    ];

    if (userMode === 'developer') {
      return [
        ...common,
        'technical_blueprint.frontend_framework',
        'technical_blueprint.backend_framework'
      ];
    }

    return common;
  }

  createGuidanceSnapshot(questionnaireData, userMode, guidanceType) {
    return `AI Guidance Generation - ${guidanceType}
Project: ${questionnaireData.project_overview?.app_name || 'Unknown'}
Mode: ${userMode}
Completeness: ${this.calculateCompletenessScore(questionnaireData)}/10
Pages: ${questionnaireData.pages?.length || 0}
User Journey Steps: ${questionnaireData.user_flow?.user_journey?.length || 0}`;
  }

  initializeGuidanceTemplates() {
    return {
      developer: {
        technical_focus: true,
        detail_level: 'high',
        terminology: 'technical'
      },
      'non-developer': {
        technical_focus: false,
        detail_level: 'medium',
        terminology: 'simple'
      }
    };
  }

  initializeQuestionCategories() {
    return {
      clarification: 'Questions to clarify existing responses',
      enhancement: 'Questions to enhance and expand the specification',
      technical: 'Technical questions for implementation details',
      validation: 'Questions to validate assumptions and requirements'
    };
  }

  initializeContextualPrompts() {
    return {
      follow_up: 'Generate follow-up questions based on incomplete data',
      summary: 'Create project understanding summary',
      validation: 'Validate questionnaire responses for consistency',
      comprehensive: 'Provide complete guidance package'
    };
  }
}

// Create singleton instance
const aiGuidanceEngine = new AIGuidanceEngine();

module.exports = aiGuidanceEngine;