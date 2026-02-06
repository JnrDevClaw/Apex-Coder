const modelRouter = require('./model-router');
const auditLogger = require('./audit-logger');
const structuredLogger = require('./structured-logger');
const questionnaireAuditLogger = require('./questionnaire-audit-logger');
const MockAIService = require('./mock-ai-service');

/**
 * Technical Inference Service - Automatic technical stack inference for non-developers
 * Analyzes project requirements and recommends appropriate technical solutions
 */
class TechnicalInferenceService {
  constructor() {
    this.frameworkDatabase = this.initializeFrameworkDatabase();
    this.compatibilityMatrix = this.initializeCompatibilityMatrix();
    this.inferenceRules = this.initializeInferenceRules();
    this.mockService = new MockAIService();
    this.useMockService = process.env.MOCK_AI_RESPONSES === 'true' || !this.hasRealAIKeys();
  }

  hasRealAIKeys() {
    return !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.HUGGINGFACE_API_KEY);
  }

  /**
   * Infer complete technical stack based on project requirements
   * @param {Object} projectData - Project questionnaire data
   * @param {Object} options - Inference options
   * @returns {Promise<Object>} Technical stack recommendations with reasoning
   */
  async inferTechnicalStack(projectData, options = {}) {
    const correlationId = auditLogger.getCorrelationId() || auditLogger.generateCorrelationId();
    
    try {
      // Track processing start time for metrics
      const startTime = Date.now();

      structuredLogger.info('Starting technical stack inference', {
        projectName: projectData.project_overview?.app_name,
        complexity: projectData.project_overview?.complexity_level,
        userCount: projectData.project_overview?.estimated_user_count,
        appType: projectData.app_structure?.app_type,
        useMockService: this.useMockService,
        correlationId
      });

      // Use mock service if configured or no real AI keys available
      if (this.useMockService) {
        structuredLogger.info('Using mock AI service for technical inference');
        return await this.mockService.inferTechnicalStack(projectData, options);
      }

      // Analyze project requirements
      const requirements = await this.analyzeProjectRequirements(projectData);
      
      // Generate stack recommendations
      const stackRecommendations = await this.generateStackRecommendations(requirements, projectData);
      
      // Validate compatibility
      const compatibilityCheck = await this.validateStackCompatibility(stackRecommendations);
      
      // Generate reasoning
      const reasoning = await this.generateStackReasoning(stackRecommendations, requirements, projectData);
      
      // Calculate confidence score
      const confidence = this.calculateConfidenceScore(stackRecommendations, requirements);

      const result = {
        success: true,
        recommended_stack: stackRecommendations,
        compatibility: compatibilityCheck,
        reasoning,
        confidence,
        requirements_analysis: requirements,
        alternatives: await this.generateAlternatives(stackRecommendations, requirements),
        metadata: {
          inference_version: '1.0',
          generated_at: new Date().toISOString(),
          project_complexity: requirements.complexity_level
        }
      };

      // Log inference completion with enhanced audit trail
      const processingTime = Date.now() - startTime;
      await questionnaireAuditLogger.logTechnicalInference({
        userId: options.userId,
        projectData,
        inferenceResult: result,
        processingMetrics: {
          processingTime,
          aiModelCalls: 2, // Approximate - will be tracked more precisely in future
          requirementsAnalysisTime: Math.round(processingTime * 0.3),
          stackGenerationTime: Math.round(processingTime * 0.4),
          compatibilityCheckTime: Math.round(processingTime * 0.2),
          reasoningGenerationTime: Math.round(processingTime * 0.1)
        }
      });

      return result;
    } catch (error) {
      // Log inference failure with enhanced audit trail
      const processingTime = Date.now() - startTime;
      await questionnaireAuditLogger.logTechnicalInference({
        userId: options.userId,
        projectData,
        inferenceResult: {
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

      structuredLogger.error('Technical stack inference failed', {
        error: error.message,
        stack: error.stack,
        correlationId
      });
      throw error;
    }
  }

  /**
   * Analyze project requirements to determine technical needs
   * @param {Object} projectData - Project questionnaire data
   * @returns {Promise<Object>} Requirements analysis
   */
  async analyzeProjectRequirements(projectData) {
    const analysis = {
      complexity_level: projectData.project_overview?.complexity_level || 5,
      scale_requirements: this.analyzeScaleRequirements(projectData),
      data_requirements: this.analyzeDataRequirements(projectData),
      ui_requirements: this.analyzeUIRequirements(projectData),
      performance_requirements: this.analyzePerformanceRequirements(projectData),
      security_requirements: this.analyzeSecurityRequirements(projectData),
      deployment_requirements: this.analyzeDeploymentRequirements(projectData),
      integration_requirements: this.analyzeIntegrationRequirements(projectData)
    };

    // Use AI to enhance requirements analysis
    const aiEnhancedAnalysis = await this.enhanceRequirementsWithAI(analysis, projectData);
    
    return {
      ...analysis,
      ai_insights: aiEnhancedAnalysis,
      overall_complexity: this.calculateOverallComplexity(analysis)
    };
  }

  /**
   * Generate technical stack recommendations based on requirements
   * @param {Object} requirements - Analyzed requirements
   * @param {Object} projectData - Original project data
   * @returns {Promise<Object>} Stack recommendations
   */
  async generateStackRecommendations(requirements, projectData) {
    // Apply inference rules to determine optimal stack
    const frontend = await this.inferFrontendFramework(requirements, projectData);
    const backend = await this.inferBackendFramework(requirements, projectData);
    const database = await this.inferDatabase(requirements, projectData);
    const utilities = await this.inferUtilities(requirements, projectData);
    const architecture = await this.inferArchitecturePattern(requirements, projectData);

    return {
      frontend_framework: frontend.recommendation,
      frontend_reasoning: frontend.reasoning,
      backend_framework: backend.recommendation,
      backend_reasoning: backend.reasoning,
      database_engine: database.recommendation,
      database_reasoning: database.reasoning,
      package_installer: 'pnpm', // Following project standards
      testing_library: this.inferTestingLibrary(frontend.recommendation, backend.recommendation),
      utilities: utilities.recommendations,
      utilities_reasoning: utilities.reasoning,
      architecture_pattern: architecture.pattern,
      architecture_reasoning: architecture.reasoning,
      environment_variables: this.generateEnvironmentVariables(requirements, projectData)
    };
  }

  /**
   * Infer optimal frontend framework
   * @param {Object} requirements - Project requirements
   * @param {Object} projectData - Project data
   * @returns {Promise<Object>} Frontend recommendation
   */
  async inferFrontendFramework(requirements, projectData) {
    const appType = projectData.app_structure?.app_type;
    const complexity = requirements.complexity_level;
    const userCount = projectData.project_overview?.estimated_user_count;

    // Apply inference rules
    let recommendation = 'svelte'; // Default following project standards
    let reasoning = [];

    // Rule-based inference
    if (appType === 'mobile-first' || appType === 'pwa') {
      if (complexity >= 7 || userCount === '10000+') {
        recommendation = 'svelte';
        reasoning.push('Svelte chosen for mobile-first apps requiring high performance');
      } else {
        recommendation = 'svelte';
        reasoning.push('Svelte provides excellent mobile performance with smaller bundle sizes');
      }
    } else if (appType === 'dashboard' || appType === 'admin-panel') {
      if (complexity >= 8) {
        recommendation = 'svelte';
        reasoning.push('Svelte chosen for complex dashboards with excellent state management');
      } else {
        recommendation = 'svelte';
        reasoning.push('Svelte provides clean component architecture for dashboard interfaces');
      }
    } else if (appType === 'e-commerce' || appType === 'marketplace') {
      recommendation = 'svelte';
      reasoning.push('Svelte chosen for e-commerce with fast loading and SEO benefits via SvelteKit');
    } else {
      recommendation = 'svelte';
      reasoning.push('Svelte chosen as default framework for excellent developer experience and performance');
    }

    // Consider specific requirements
    if (requirements.performance_requirements.seo_critical) {
      reasoning.push('SvelteKit provides excellent SSR capabilities for SEO');
    }

    if (requirements.ui_requirements.real_time) {
      reasoning.push('Svelte\'s reactive nature handles real-time updates efficiently');
    }

    return {
      recommendation,
      reasoning: reasoning.join('. '),
      alternatives: this.getFrontendAlternatives(recommendation, requirements)
    };
  }

  /**
   * Infer optimal backend framework
   * @param {Object} requirements - Project requirements
   * @param {Object} projectData - Project data
   * @returns {Promise<Object>} Backend recommendation
   */
  async inferBackendFramework(requirements, projectData) {
    const complexity = requirements.complexity_level;
    const scale = requirements.scale_requirements;
    const dataNeeds = requirements.data_requirements;

    let recommendation = 'node-fastify'; // Default following project standards
    let reasoning = [];

    // Rule-based inference
    if (scale.expected_users === 'high' || complexity >= 8) {
      recommendation = 'node-fastify';
      reasoning.push('Fastify chosen for high-performance requirements and excellent scalability');
    } else if (dataNeeds.complexity === 'high' || dataNeeds.real_time) {
      recommendation = 'node-fastify';
      reasoning.push('Fastify chosen for complex data operations and real-time capabilities');
    } else if (complexity <= 3 && scale.expected_users === 'low') {
      recommendation = 'node-express';
      reasoning.push('Express chosen for simple applications with lower complexity requirements');
    } else {
      recommendation = 'node-fastify';
      reasoning.push('Fastify chosen for balanced performance and developer experience');
    }

    // Consider specific requirements
    if (requirements.performance_requirements.high_throughput) {
      recommendation = 'node-fastify';
      reasoning.push('Fastify provides superior performance for high-throughput applications');
    }

    if (requirements.integration_requirements.apis > 3) {
      reasoning.push('Framework supports extensive API integration capabilities');
    }

    return {
      recommendation,
      reasoning: reasoning.join('. '),
      alternatives: this.getBackendAlternatives(recommendation, requirements)
    };
  }

  /**
   * Infer optimal database solution
   * @param {Object} requirements - Project requirements
   * @param {Object} projectData - Project data
   * @returns {Promise<Object>} Database recommendation
   */
  async inferDatabase(requirements, projectData) {
    const dataNeeds = requirements.data_requirements;
    const scale = requirements.scale_requirements;
    const complexity = requirements.complexity_level;

    let recommendation = 'postgres';
    let reasoning = [];

    // Rule-based inference
    if (dataNeeds.type === 'none' || dataNeeds.storage === 'none') {
      recommendation = 'none';
      reasoning.push('No database needed - application does not store persistent data');
    } else if (dataNeeds.type === 'simple' && scale.expected_users === 'low') {
      recommendation = 'sqlite';
      reasoning.push('SQLite chosen for simple data needs and low user count');
    } else if (dataNeeds.relationships === 'complex' || dataNeeds.transactions) {
      recommendation = 'postgres';
      reasoning.push('PostgreSQL chosen for complex relationships and ACID transaction support');
    } else if (dataNeeds.type === 'document' || dataNeeds.schema === 'flexible') {
      recommendation = 'mongodb';
      reasoning.push('MongoDB chosen for flexible document-based data structure');
    } else if (scale.expected_users === 'high' && requirements.deployment_requirements.cloud === 'aws') {
      recommendation = 'postgres';
      reasoning.push('PostgreSQL chosen for high-scale applications with excellent AWS support');
    } else {
      recommendation = 'postgres';
      reasoning.push('PostgreSQL chosen as robust default for relational data needs');
    }

    // Consider specific requirements
    if (requirements.performance_requirements.high_throughput && scale.expected_users === 'high') {
      if (recommendation === 'postgres') {
        reasoning.push('PostgreSQL provides excellent performance optimization capabilities');
      }
    }

    if (requirements.security_requirements.compliance) {
      reasoning.push('Database choice supports compliance and audit requirements');
    }

    return {
      recommendation,
      reasoning: reasoning.join('. '),
      alternatives: this.getDatabaseAlternatives(recommendation, requirements)
    };
  }

  /**
   * Infer utility libraries and tools
   * @param {Object} requirements - Project requirements
   * @param {Object} projectData - Project data
   * @returns {Promise<Object>} Utilities recommendation
   */
  async inferUtilities(requirements, projectData) {
    const utilities = ['prettier', 'eslint']; // Base utilities
    const reasoning = [];

    // Add CSS framework based on design needs
    if (projectData.design_preferences?.theme_style || requirements.ui_requirements.styling_needs) {
      utilities.push('tailwind');
      reasoning.push('Tailwind CSS for utility-first styling and rapid UI development');
    }

    // Add testing utilities based on complexity
    if (requirements.complexity_level >= 6) {
      utilities.push('vitest');
      reasoning.push('Vitest for comprehensive testing of complex application logic');
    }

    // Add state management if needed
    if (requirements.ui_requirements.state_complexity === 'high') {
      utilities.push('zustand');
      reasoning.push('Zustand for simplified state management in complex applications');
    }

    // Add validation library for forms
    if (requirements.data_requirements.user_input) {
      utilities.push('zod');
      reasoning.push('Zod for runtime type validation and form schema validation');
    }

    // Add date handling if needed
    if (requirements.data_requirements.temporal_data) {
      utilities.push('date-fns');
      reasoning.push('Date-fns for efficient date manipulation and formatting');
    }

    return {
      recommendations: utilities,
      reasoning: reasoning.join('. ')
    };
  }

  /**
   * Infer architecture pattern
   * @param {Object} requirements - Project requirements
   * @param {Object} projectData - Project data
   * @returns {Promise<Object>} Architecture recommendation
   */
  async inferArchitecturePattern(requirements, projectData) {
    const complexity = requirements.complexity_level;
    const scale = requirements.scale_requirements;

    let pattern = 'monolithic';
    let reasoning = [];

    if (complexity <= 4 && scale.expected_users === 'low') {
      pattern = 'monolithic';
      reasoning.push('Monolithic architecture chosen for simple applications with straightforward deployment');
    } else if (complexity >= 7 || scale.expected_users === 'high') {
      pattern = 'layered';
      reasoning.push('Layered architecture chosen for complex applications requiring clear separation of concerns');
    } else if (requirements.integration_requirements.apis > 5) {
      pattern = 'microservices';
      reasoning.push('Microservices architecture considered for extensive API integration needs');
    } else {
      pattern = 'layered';
      reasoning.push('Layered architecture chosen for balanced complexity and maintainability');
    }

    return {
      pattern,
      reasoning: reasoning.join('. ')
    };
  }

  /**
   * Validate stack compatibility
   * @param {Object} stackRecommendations - Recommended stack
   * @returns {Promise<Object>} Compatibility validation
   */
  async validateStackCompatibility(stackRecommendations) {
    const compatibility = {
      overall_compatible: true,
      compatibility_score: 10,
      conflicts: [],
      warnings: [],
      optimizations: []
    };

    // Check frontend-backend compatibility
    const frontendBackendCompat = this.checkFrontendBackendCompatibility(
      stackRecommendations.frontend_framework,
      stackRecommendations.backend_framework
    );
    
    if (!frontendBackendCompat.compatible) {
      compatibility.overall_compatible = false;
      compatibility.conflicts.push(frontendBackendCompat.issue);
      compatibility.compatibility_score -= 3;
    }

    // Check database compatibility
    const databaseCompat = this.checkDatabaseCompatibility(
      stackRecommendations.backend_framework,
      stackRecommendations.database_engine
    );
    
    if (!databaseCompat.compatible) {
      compatibility.warnings.push(databaseCompat.warning);
      compatibility.compatibility_score -= 1;
    }

    // Check utility compatibility
    const utilityCompat = this.checkUtilityCompatibility(
      stackRecommendations.frontend_framework,
      stackRecommendations.utilities
    );
    
    compatibility.optimizations.push(...utilityCompat.optimizations);

    // Use AI for advanced compatibility analysis
    const aiCompatibilityCheck = await this.performAICompatibilityAnalysis(stackRecommendations);
    if (aiCompatibilityCheck.insights) {
      compatibility.ai_insights = aiCompatibilityCheck.insights;
    }

    return compatibility;
  }

  /**
   * Generate technical reasoning for stack choices
   * @param {Object} stackRecommendations - Recommended stack
   * @param {Object} requirements - Project requirements
   * @param {Object} projectData - Original project data
   * @returns {Promise<Object>} Detailed reasoning
   */
  async generateStackReasoning(stackRecommendations, requirements, projectData) {
    const prompt = `Generate comprehensive technical reasoning for this recommended stack:

Project: ${projectData.project_overview?.app_name}
Type: ${projectData.app_structure?.app_type}
Complexity: ${requirements.complexity_level}/10
Scale: ${requirements.scale_requirements.expected_users}

Recommended Stack:
- Frontend: ${stackRecommendations.frontend_framework}
- Backend: ${stackRecommendations.backend_framework}
- Database: ${stackRecommendations.database_engine}
- Utilities: ${stackRecommendations.utilities?.join(', ')}

Requirements Analysis:
${JSON.stringify(requirements, null, 2)}

Provide detailed reasoning covering:
1. Why each technology was chosen
2. How the stack addresses project requirements
3. Scalability considerations
4. Development efficiency factors
5. Maintenance and long-term considerations

Respond in JSON format:
{
  "executive_summary": "Brief overview of stack rationale",
  "technology_rationale": {
    "frontend": "Why this frontend choice",
    "backend": "Why this backend choice",
    "database": "Why this database choice"
  },
  "requirement_alignment": ["How stack meets requirement 1", "..."],
  "scalability_analysis": "How stack handles growth",
  "development_efficiency": "Developer experience benefits",
  "maintenance_considerations": "Long-term maintenance factors",
  "risk_mitigation": ["Risk 1 and mitigation", "..."]
}`;

    try {
      const response = await modelRouter.routeTask({
        role: 'architect',
        prompt,
        complexity: 'high'
      });

      return this.parseReasoningResponse(response.content);
    } catch (error) {
      structuredLogger.error('Failed to generate AI reasoning', {
        error: error.message
      });
      
      return {
        executive_summary: 'Technical stack chosen based on project requirements and best practices',
        technology_rationale: {
          frontend: stackRecommendations.frontend_reasoning || 'Chosen for project requirements',
          backend: stackRecommendations.backend_reasoning || 'Chosen for scalability and performance',
          database: stackRecommendations.database_reasoning || 'Chosen for data requirements'
        },
        requirement_alignment: ['Stack addresses core project needs'],
        scalability_analysis: 'Stack supports expected growth patterns',
        development_efficiency: 'Technologies chosen for developer productivity',
        maintenance_considerations: 'Stack uses well-supported, stable technologies',
        risk_mitigation: ['Regular updates and security patches recommended']
      };
    }
  }

  /**
   * Calculate confidence score for recommendations
   * @param {Object} stackRecommendations - Recommended stack
   * @param {Object} requirements - Project requirements
   * @returns {number} Confidence score (0-1)
   */
  calculateConfidenceScore(stackRecommendations, requirements) {
    let confidence = 0.8; // Base confidence

    // Increase confidence for well-defined requirements
    if (requirements.complexity_level >= 1 && requirements.complexity_level <= 10) {
      confidence += 0.1;
    }

    // Increase confidence for clear app type
    if (requirements.ui_requirements.app_type_clear) {
      confidence += 0.05;
    }

    // Decrease confidence for edge cases
    if (requirements.complexity_level >= 9) {
      confidence -= 0.1; // High complexity has more variables
    }

    if (requirements.integration_requirements.apis > 10) {
      confidence -= 0.05; // Many integrations add complexity
    }

    return Math.max(0.3, Math.min(1.0, confidence));
  }

  /**
   * Generate alternative stack options
   * @param {Object} primaryStack - Primary recommended stack
   * @param {Object} requirements - Project requirements
   * @returns {Promise<Array>} Alternative stack options
   */
  async generateAlternatives(primaryStack, requirements) {
    const alternatives = [];

    // Generate performance-focused alternative
    if (requirements.performance_requirements.high_throughput) {
      alternatives.push({
        name: 'Performance Optimized',
        stack: {
          frontend_framework: 'svelte',
          backend_framework: 'node-fastify',
          database_engine: 'postgres',
          focus: 'Maximum performance and minimal overhead'
        }
      });
    }

    // Generate simplicity-focused alternative
    if (requirements.complexity_level <= 5) {
      alternatives.push({
        name: 'Simplicity Focused',
        stack: {
          frontend_framework: 'svelte',
          backend_framework: 'node-express',
          database_engine: 'sqlite',
          focus: 'Minimal complexity and easy maintenance'
        }
      });
    }

    // Generate cloud-native alternative
    if (requirements.scale_requirements.expected_users === 'high') {
      alternatives.push({
        name: 'Cloud Native',
        stack: {
          frontend_framework: 'svelte',
          backend_framework: 'node-fastify',
          database_engine: 'postgres',
          focus: 'Optimized for cloud deployment and scaling'
        }
      });
    }

    return alternatives;
  }

  // Analysis helper methods

  /**
   * Analyze scale requirements from project data
   */
  analyzeScaleRequirements(projectData) {
    const userCount = projectData.project_overview?.estimated_user_count;
    const complexity = projectData.project_overview?.complexity_level || 5;

    let expectedUsers = 'medium';
    if (userCount === '1-100') expectedUsers = 'low';
    else if (userCount === '10000+') expectedUsers = 'high';

    return {
      expected_users: expectedUsers,
      concurrent_users: this.estimateConcurrentUsers(userCount),
      growth_potential: complexity >= 7 ? 'high' : 'medium',
      performance_critical: userCount === '10000+' || complexity >= 8
    };
  }

  /**
   * Analyze data requirements from project data
   */
  analyzeDataRequirements(projectData) {
    const dataFlow = projectData.data_flow || {};
    const pages = projectData.pages || [];
    const userJourney = projectData.user_flow?.user_journey || [];

    const hasUserData = dataFlow.user_data_storage !== 'none';
    const hasComplexFlow = userJourney.length > 3;
    const hasMultiplePages = pages.length > 5;

    return {
      type: hasUserData ? (hasComplexFlow ? 'complex' : 'simple') : 'none',
      storage: dataFlow.user_data_storage || 'none',
      relationships: hasMultiplePages ? 'complex' : 'simple',
      user_input: hasUserData,
      real_time: this.detectRealTimeNeeds(projectData),
      transactions: hasUserData && dataFlow.data_privacy !== 'none',
      schema: hasComplexFlow ? 'structured' : 'flexible',
      temporal_data: this.detectTemporalDataNeeds(projectData),
      complexity: hasComplexFlow && hasUserData ? 'high' : hasUserData ? 'medium' : 'low'
    };
  }

  /**
   * Analyze UI requirements from project data
   */
  analyzeUIRequirements(projectData) {
    const appType = projectData.app_structure?.app_type;
    const pages = projectData.pages || [];
    const designPrefs = projectData.design_preferences || {};

    return {
      app_type_clear: !!appType,
      complexity: pages.length > 5 ? 'high' : pages.length > 2 ? 'medium' : 'low',
      real_time: this.detectRealTimeNeeds(projectData),
      styling_needs: !!designPrefs.theme_style,
      state_complexity: pages.length > 3 ? 'high' : 'medium',
      responsive_needs: appType === 'mobile-first' || appType === 'pwa'
    };
  }

  /**
   * Analyze performance requirements
   */
  analyzePerformanceRequirements(projectData) {
    const userCount = projectData.project_overview?.estimated_user_count;
    const complexity = projectData.project_overview?.complexity_level || 5;
    const appType = projectData.app_structure?.app_type;

    return {
      high_throughput: userCount === '10000+',
      low_latency: appType === 'real-time' || appType === 'gaming',
      seo_critical: appType === 'e-commerce' || appType === 'blog' || appType === 'marketing',
      mobile_optimized: appType === 'mobile-first' || appType === 'pwa',
      offline_support: appType === 'pwa',
      bundle_size_critical: appType === 'mobile-first'
    };
  }

  /**
   * Analyze security requirements
   */
  analyzeSecurityRequirements(projectData) {
    const authNeeded = projectData.app_structure?.authentication_needed;
    const dataPrivacy = projectData.data_flow?.data_privacy;
    const niche = projectData.project_overview?.niche;

    return {
      authentication: authNeeded,
      authorization: projectData.app_structure?.roles_or_permissions?.length > 1,
      data_protection: dataPrivacy !== 'none',
      compliance: niche === 'healthcare' || niche === 'finance',
      encryption_needed: dataPrivacy === 'healthcare' || dataPrivacy === 'financial',
      audit_trail: niche === 'healthcare' || niche === 'finance'
    };
  }

  /**
   * Analyze deployment requirements
   */
  analyzeDeploymentRequirements(projectData) {
    const deploymentPref = projectData.app_structure?.deployment_preference;
    const userCount = projectData.project_overview?.estimated_user_count;

    return {
      cloud: deploymentPref === 'aws' || deploymentPref === 'gcp' ? deploymentPref : 'generic',
      scaling_needs: userCount === '10000+' ? 'high' : 'medium',
      cdn_needed: userCount === '10000+',
      monitoring_needed: userCount === '10000+',
      backup_needed: projectData.data_flow?.user_data_storage !== 'none'
    };
  }

  /**
   * Analyze integration requirements
   */
  analyzeIntegrationRequirements(projectData) {
    const dataSources = projectData.data_flow?.data_sources || [];
    const complexity = projectData.project_overview?.complexity_level || 5;

    return {
      apis: dataSources.length,
      third_party: dataSources.some(source => source.includes('api')),
      payment: projectData.project_overview?.niche === 'e-commerce',
      analytics: projectData.data_flow?.analytics_or_tracking,
      social_auth: projectData.app_structure?.authentication_needed
    };
  }

  // Utility methods

  /**
   * Detect real-time needs from project data
   */
  detectRealTimeNeeds(projectData) {
    const appType = projectData.app_structure?.app_type;
    const niche = projectData.project_overview?.niche;
    
    return appType === 'chat' || 
           appType === 'real-time' || 
           niche === 'gaming' || 
           niche === 'collaboration';
  }

  /**
   * Detect temporal data needs
   */
  detectTemporalDataNeeds(projectData) {
    const niche = projectData.project_overview?.niche;
    const appType = projectData.app_structure?.app_type;
    
    return niche === 'scheduling' || 
           niche === 'calendar' || 
           appType === 'booking' ||
           appType === 'events';
  }

  /**
   * Estimate concurrent users based on total users
   */
  estimateConcurrentUsers(userCount) {
    switch (userCount) {
      case '1-100': return 'low';
      case '100-1000': return 'medium';
      case '1000-10000': return 'medium-high';
      case '10000+': return 'high';
      default: return 'medium';
    }
  }

  /**
   * Enhance requirements analysis with AI insights
   */
  async enhanceRequirementsWithAI(analysis, projectData) {
    const prompt = `Analyze this project and provide additional technical insights:

Project: ${JSON.stringify(projectData.project_overview, null, 2)}
Current Analysis: ${JSON.stringify(analysis, null, 2)}

Provide insights on:
1. Hidden complexity factors
2. Scalability challenges
3. Integration complexity
4. Performance bottlenecks
5. Security considerations

Respond with brief, actionable insights in JSON format:
{
  "complexity_factors": ["factor1", "factor2"],
  "scalability_challenges": ["challenge1", "challenge2"],
  "performance_considerations": ["consideration1", "consideration2"],
  "security_insights": ["insight1", "insight2"]
}`;

    try {
      const response = await modelRouter.routeTask({
        role: 'architect',
        prompt,
        complexity: 'medium'
      });

      return JSON.parse(response.content);
    } catch (error) {
      return {
        complexity_factors: ['Standard web application complexity'],
        scalability_challenges: ['Database scaling', 'Frontend performance'],
        performance_considerations: ['Bundle size optimization', 'API response times'],
        security_insights: ['Input validation', 'Authentication security']
      };
    }
  }

  /**
   * Perform AI-powered compatibility analysis
   */
  async performAICompatibilityAnalysis(stackRecommendations) {
    const prompt = `Analyze the compatibility of this technical stack:

${JSON.stringify(stackRecommendations, null, 2)}

Check for:
1. Framework version compatibility
2. Known integration issues
3. Performance implications
4. Development workflow conflicts
5. Deployment considerations

Provide compatibility insights in JSON format:
{
  "compatibility_score": 9,
  "potential_issues": ["issue1", "issue2"],
  "optimization_suggestions": ["suggestion1", "suggestion2"],
  "version_recommendations": {"framework": "version"}
}`;

    try {
      const response = await modelRouter.routeTask({
        role: 'architect',
        prompt,
        complexity: 'medium'
      });

      return { insights: JSON.parse(response.content) };
    } catch (error) {
      return { insights: null };
    }
  }

  // Compatibility checking methods

  checkFrontendBackendCompatibility(frontend, backend) {
    // All combinations are generally compatible in modern web development
    return { compatible: true };
  }

  checkDatabaseCompatibility(backend, database) {
    if (database === 'none') return { compatible: true };
    
    // Node.js backends are compatible with all database choices
    return { compatible: true };
  }

  checkUtilityCompatibility(frontend, utilities) {
    const optimizations = [];
    
    if (frontend === 'svelte' && utilities.includes('tailwind')) {
      optimizations.push('Tailwind integrates excellently with Svelte');
    }
    
    return { optimizations };
  }

  // Alternative generation methods

  getFrontendAlternatives(primary, requirements) {
    const alternatives = ['svelte', 'react', 'vue'];
    return alternatives.filter(alt => alt !== primary).slice(0, 2);
  }

  getBackendAlternatives(primary, requirements) {
    const alternatives = ['node-fastify', 'node-express', 'python-fastapi'];
    return alternatives.filter(alt => alt !== primary).slice(0, 2);
  }

  getDatabaseAlternatives(primary, requirements) {
    const alternatives = ['postgres', 'mysql', 'mongodb', 'sqlite'];
    return alternatives.filter(alt => alt !== primary).slice(0, 2);
  }

  // Utility inference methods

  inferTestingLibrary(frontend, backend) {
    return 'vitest'; // Standard choice for the project
  }

  generateEnvironmentVariables(requirements, projectData) {
    const envVars = ['NODE_ENV', 'PORT'];
    
    if (requirements.data_requirements.storage !== 'none') {
      envVars.push('DATABASE_URL');
    }
    
    if (requirements.security_requirements.authentication) {
      envVars.push('JWT_SECRET', 'SESSION_SECRET');
    }
    
    if (requirements.integration_requirements.apis > 0) {
      envVars.push('API_BASE_URL');
    }
    
    return envVars;
  }

  calculateOverallComplexity(analysis) {
    let score = analysis.complexity_level;
    
    if (analysis.data_requirements.complexity === 'high') score += 1;
    if (analysis.scale_requirements.expected_users === 'high') score += 1;
    if (analysis.security_requirements.compliance) score += 1;
    if (analysis.integration_requirements.apis > 5) score += 1;
    
    return Math.min(10, score);
  }

  parseReasoningResponse(response) {
    try {
      return JSON.parse(response);
    } catch (error) {
      return {
        executive_summary: 'Technical stack reasoning unavailable',
        technology_rationale: {},
        requirement_alignment: [],
        scalability_analysis: 'Standard scalability considerations apply',
        development_efficiency: 'Stack chosen for developer productivity',
        maintenance_considerations: 'Regular updates recommended',
        risk_mitigation: []
      };
    }
  }

  createInferenceSnapshot(projectData, stackRecommendations) {
    return `Technical Stack Inference
Project: ${projectData.project_overview?.app_name || 'Unknown'}
Type: ${projectData.app_structure?.app_type || 'Unknown'}
Complexity: ${projectData.project_overview?.complexity_level || 'Unknown'}/10
Recommended Stack:
- Frontend: ${stackRecommendations.frontend_framework}
- Backend: ${stackRecommendations.backend_framework}
- Database: ${stackRecommendations.database_engine}`;
  }

  initializeFrameworkDatabase() {
    return {
      frontend: {
        svelte: { performance: 9, learning_curve: 8, ecosystem: 7 },
        react: { performance: 7, learning_curve: 6, ecosystem: 10 },
        vue: { performance: 8, learning_curve: 8, ecosystem: 8 }
      },
      backend: {
        'node-fastify': { performance: 9, scalability: 9, learning_curve: 7 },
        'node-express': { performance: 7, scalability: 7, learning_curve: 9 },
        'python-fastapi': { performance: 8, scalability: 8, learning_curve: 8 }
      },
      database: {
        postgres: { performance: 9, scalability: 9, complexity: 7 },
        mysql: { performance: 8, scalability: 8, complexity: 6 },
        mongodb: { performance: 7, scalability: 8, complexity: 5 },
        sqlite: { performance: 6, scalability: 3, complexity: 3 }
      }
    };
  }

  initializeCompatibilityMatrix() {
    return {
      'svelte-node-fastify': { score: 10, notes: 'Excellent performance combination' },
      'svelte-node-express': { score: 9, notes: 'Good balance of simplicity and performance' },
      'react-node-fastify': { score: 9, notes: 'High performance full-stack solution' },
      'vue-node-express': { score: 8, notes: 'Balanced and developer-friendly' }
    };
  }

  initializeInferenceRules() {
    return {
      frontend: {
        'mobile-first': 'svelte',
        'dashboard': 'svelte',
        'e-commerce': 'svelte',
        'default': 'svelte'
      },
      backend: {
        'high-performance': 'node-fastify',
        'simple': 'node-express',
        'default': 'node-fastify'
      },
      database: {
        'no-data': 'none',
        'simple': 'sqlite',
        'complex': 'postgres',
        'document': 'mongodb',
        'default': 'postgres'
      }
    };
  }

  /**
   * Assess project complexity for model selection
   */
  assessProjectComplexity(projectData) {
    let complexity = 5; // Default medium complexity
    
    // Adjust based on explicit complexity level
    if (projectData.project_overview?.complexity_level) {
      complexity = projectData.project_overview.complexity_level;
    }
    
    // Adjust based on estimated user count
    const userCount = projectData.project_overview?.estimated_user_count;
    if (userCount === '10000+') {
      complexity += 3;
    } else if (userCount === '1000-10000') {
      complexity += 2;
    } else if (userCount === '100-1000') {
      complexity += 1;
    }
    
    // Adjust based on app type
    const appType = projectData.app_structure?.app_type;
    if (appType === 'e-commerce' || appType === 'marketplace') {
      complexity += 2;
    } else if (appType === 'dashboard' || appType === 'admin-panel') {
      complexity += 1;
    }
    
    // Adjust based on data requirements
    if (projectData.data_flow?.user_data_storage !== 'none') {
      complexity += 1;
    }
    
    return Math.min(complexity, 10);
  }

  /**
   * Build inference prompt for AI models
   */
  buildInferencePrompt(projectData, options) {
    const projectName = projectData.project_overview?.app_name || 'the project';
    const projectType = projectData.project_overview?.niche || 'application';
    const complexity = projectData.project_overview?.complexity_level || 5;
    const userCount = projectData.project_overview?.estimated_user_count || 'unknown';
    
    let prompt = `Recommend a comprehensive technical stack for ${projectName}, a ${projectType}.\\n\\n`;
    prompt += `Project Details:\\n`;
    prompt += `- Complexity Level: ${complexity}/10\\n`;
    prompt += `- Expected Users: ${userCount}\\n`;
    prompt += `- App Type: ${projectData.app_structure?.app_type || 'web application'}\\n\\n`;
    
    if (projectData.project_overview?.app_summary) {
      prompt += `Project Description: ${projectData.project_overview.app_summary}\\n\\n`;
    }
    
    prompt += `Please recommend:\\n`;
    prompt += `- Frontend Framework (prefer Svelte for performance)\\n`;
    prompt += `- Backend Framework (Node.js preferred)\\n`;
    prompt += `- Database Solution\\n`;
    prompt += `- Key Utilities and Libraries\\n`;
    prompt += `- Architecture Pattern\\n\\n`;
    
    prompt += `Consider:\\n`;
    prompt += `- Performance requirements\\n`;
    prompt += `- Scalability needs\\n`;
    prompt += `- Development efficiency\\n`;
    prompt += `- Maintenance complexity\\n\\n`;
    
    prompt += `Technical Stack Recommendation:`;
    
    return prompt;
  }

  /**
   * Process inference result from model router
   */
  processInferenceResult(result, projectData) {
    // If the result is already structured (from Hugging Face provider)
    if (result.recommendedStack) {
      return result;
    }
    
    // If it's a text response, structure it
    const text = result.text || result.response || '';
    
    // Parse the text response into structured format
    return this.parseInferenceText(text, projectData);
  }

  /**
   * Parse unstructured inference text into structured format
   */
  parseInferenceText(text, projectData) {
    const lines = text.split('\\n').filter(line => line.trim());
    
    // Extract recommendations using keyword matching
    let frontend = 'svelte';
    let backend = 'node-fastify';
    let database = 'postgres';
    
    const textLower = text.toLowerCase();
    
    // Frontend detection
    if (textLower.includes('react')) frontend = 'react';
    else if (textLower.includes('vue')) frontend = 'vue';
    else if (textLower.includes('angular')) frontend = 'angular';
    
    // Backend detection
    if (textLower.includes('express')) backend = 'node-express';
    else if (textLower.includes('fastapi')) backend = 'python-fastapi';
    else if (textLower.includes('django')) backend = 'python-django';
    
    // Database detection
    if (textLower.includes('mongodb') || textLower.includes('mongo')) database = 'mongodb';
    else if (textLower.includes('mysql')) database = 'mysql';
    else if (textLower.includes('sqlite')) database = 'sqlite';
    
    return {
      success: true,
      recommended_stack: {
        frontend_framework: frontend,
        backend_framework: backend,
        database_engine: database,
        package_installer: 'pnpm',
        testing_library: 'vitest',
        utilities: ['prettier', 'eslint'],
        architecture_pattern: 'layered'
      },
      reasoning: text,
      confidence: 0.8
    };
  }
}

// Create singleton instance
const technicalInferenceService = new TechnicalInferenceService();

module.exports = technicalInferenceService;