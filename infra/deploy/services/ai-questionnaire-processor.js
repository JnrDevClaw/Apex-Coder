const modelRouter = require('./model-router');
const auditLogger = require('./audit-logger');
const structuredLogger = require('./structured-logger');

class AIQuestionnaireProcessor {
  constructor() {
    this.clarificationPrompts = {
      'non-developer': this.getNonDeveloperClarificationPrompt(),
      'developer': this.getDeveloperClarificationPrompt()
    };
  }

  /**
   * Process questionnaire responses and generate AI guidance
   */
  async processQuestionnaire(questionnaireData, userMode = 'non-developer') {
    try {
      structuredLogger.info('Processing questionnaire with AI guidance', {
        userMode,
        projectName: questionnaireData.project_overview?.app_name
      });

      // Generate AI guidance based on user mode
      const aiGuidance = await this.generateAIGuidance(questionnaireData, userMode);
      
      // Validate and suggest improvements
      const validation = await this.validateProjectConcept(questionnaireData, userMode);
      
      // Generate missing technical details for non-developers
      let enhancedSpec = questionnaireData;
      if (userMode === 'non-developer') {
        enhancedSpec = await this.inferTechnicalDetails(questionnaireData);
      }

      // Create final spec with AI guidance
      const processedSpec = {
        ...enhancedSpec,
        ai_guidance: {
          clarity_check: aiGuidance.clarityAssessment,
          missing_info_questions: aiGuidance.missingInfoQuestions,
          summary_of_understanding: aiGuidance.projectSummary,
          technical_recommendations: aiGuidance.technicalRecommendations,
          generated_at: new Date().toISOString(),
          user_mode: userMode
        }
      };

      // Log AI processing
      await auditLogger.logAIAction(
        'questionnaire-processor',
        'process_questionnaire',
        this.createPromptSnapshot(questionnaireData, userMode),
        [],
        {
          projectId: questionnaireData.project_overview?.app_name,
          userMode,
          clarityScore: aiGuidance.clarityScore
        }
      );

      return {
        success: true,
        processedSpec,
        validation,
        recommendations: aiGuidance.technicalRecommendations
      };
    } catch (error) {
      structuredLogger.error('Failed to process questionnaire', {
        userMode,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate AI guidance based on questionnaire responses
   */
  async generateAIGuidance(questionnaireData, userMode) {
    const prompt = this.buildGuidancePrompt(questionnaireData, userMode);
    
    try {
      const response = await modelRouter.route({
        agentRole: 'architect',
        prompt,
        temperature: 0.3,
        maxTokens: 1000
      });

      const guidance = this.parseAIGuidanceResponse(response.content);
      
      return {
        clarityAssessment: guidance.clarity_check,
        missingInfoQuestions: guidance.missing_questions || [],
        projectSummary: guidance.summary,
        technicalRecommendations: guidance.recommendations || [],
        clarityScore: guidance.clarity_score || 7
      };
    } catch (error) {
      structuredLogger.error('Failed to generate AI guidance', {
        error: error.message
      });
      
      // Return fallback guidance
      return {
        clarityAssessment: 'Unable to generate AI guidance at this time',
        missingInfoQuestions: [],
        projectSummary: 'Project concept received but AI analysis unavailable',
        technicalRecommendations: [],
        clarityScore: 5
      };
    }
  }

  /**
   * Validate project concept and identify gaps
   */
  async validateProjectConcept(questionnaireData, userMode) {
    const validation = {
      isComplete: true,
      missingFields: [],
      warnings: [],
      suggestions: []
    };

    // Check required fields based on user mode
    const requiredFields = this.getRequiredFields(userMode);
    
    for (const field of requiredFields) {
      const value = this.getNestedValue(questionnaireData, field.path);
      
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        validation.isComplete = false;
        validation.missingFields.push({
          field: field.path,
          label: field.label,
          importance: field.importance || 'medium'
        });
      }
    }

    // Add contextual warnings and suggestions
    validation.warnings = this.generateWarnings(questionnaireData);
    validation.suggestions = this.generateSuggestions(questionnaireData, userMode);

    return validation;
  }

  /**
   * Infer technical details for non-developer users
   */
  async inferTechnicalDetails(questionnaireData) {
    const prompt = this.buildTechnicalInferencePrompt(questionnaireData);
    
    try {
      const response = await modelRouter.route({
        agentRole: 'architect',
        prompt,
        temperature: 0.2,
        maxTokens: 800
      });

      const technicalDetails = this.parseTechnicalInferenceResponse(response.content);
      
      // Merge inferred technical details
      const enhancedSpec = {
        ...questionnaireData,
        technical_stack: {
          frontend_framework: technicalDetails.frontend || 'svelte',
          backend_framework: technicalDetails.backend || 'node-fastify',
          database_choice: technicalDetails.database || 'postgres',
          package_manager: 'pnpm',
          testing_library: 'jest',
          utilities: technicalDetails.utilities || ['prettier', 'eslint', 'tailwind']
        }
      };

      // Log technical inference
      await auditLogger.logAIAction(
        'technical-inferencer',
        'infer_stack',
        this.createPromptSnapshot(questionnaireData, 'technical-inference'),
        [],
        {
          projectId: questionnaireData.project_overview?.app_name,
          inferredStack: enhancedSpec.technical_stack
        }
      );

      return enhancedSpec;
    } catch (error) {
      structuredLogger.error('Failed to infer technical details', {
        error: error.message
      });
      
      // Return with default technical stack
      return {
        ...questionnaireData,
        technical_stack: {
          frontend_framework: 'svelte',
          backend_framework: 'node-fastify',
          database_choice: 'postgres',
          package_manager: 'pnpm',
          testing_library: 'jest',
          utilities: ['prettier', 'eslint', 'tailwind']
        }
      };
    }
  }

  /**
   * Build AI guidance prompt
   */
  buildGuidancePrompt(questionnaireData, userMode) {
    return `You are an expert software architect helping to clarify a project concept.

User Mode: ${userMode}
Project Overview: ${JSON.stringify(questionnaireData.project_overview, null, 2)}
App Structure: ${JSON.stringify(questionnaireData.app_structure, null, 2)}
Data Flow: ${JSON.stringify(questionnaireData.data_flow, null, 2)}

Please analyze this project concept and provide:

1. Clarity Check: Rate the clarity of requirements (1-10) and explain any ambiguities
2. Missing Information: List specific questions to clarify gaps
3. Project Summary: Provide a clear summary of what you understand the user wants to build
4. Technical Recommendations: Suggest appropriate technologies and architecture patterns

Respond in JSON format:
{
  "clarity_score": 8,
  "clarity_check": "The project concept is mostly clear but...",
  "missing_questions": ["What specific music formats will be supported?", "..."],
  "summary": "The user wants to build a music streaming platform that...",
  "recommendations": ["Consider using WebRTC for real-time features", "..."]
}`;
  }

  /**
   * Build technical inference prompt for non-developers
   */
  buildTechnicalInferencePrompt(questionnaireData) {
    return `You are a technical architect. Based on this project description, recommend the best technical stack.

Project: ${questionnaireData.project_overview?.app_name}
Description: ${questionnaireData.project_overview?.app_summary}
Details: ${questionnaireData.project_overview?.app_details}
Niche: ${questionnaireData.project_overview?.niche}
Users: ${questionnaireData.project_overview?.potential_users}
Scale: ${questionnaireData.project_overview?.estimated_user_count}
Complexity: ${questionnaireData.project_overview?.complexity_level}/10

App Type: ${questionnaireData.app_structure?.app_type}
Authentication: ${questionnaireData.app_structure?.authentication_needed}
Data Privacy: ${questionnaireData.data_flow?.data_privacy}
Hosting: ${questionnaireData.app_structure?.deployment_preference}

Recommend the best technical stack. Respond in JSON:
{
  "frontend": "svelte|react|vue|angular|html-css",
  "backend": "node-express|node-fastify|python-fastapi|go-gin",
  "database": "postgres|mysql|dynamodb|mongodb|sqlite|none",
  "utilities": ["prettier", "eslint", "tailwind"],
  "reasoning": "Explanation of choices"
}`;
  }

  /**
   * Parse AI guidance response
   */
  parseAIGuidanceResponse(response) {
    try {
      // Try to parse JSON response
      const parsed = JSON.parse(response);
      return parsed;
    } catch (error) {
      // Fallback parsing for non-JSON responses
      return {
        clarity_check: response.substring(0, 200),
        missing_questions: [],
        summary: 'AI guidance parsing failed',
        recommendations: [],
        clarity_score: 5
      };
    }
  }

  /**
   * Parse technical inference response
   */
  parseTechnicalInferenceResponse(response) {
    try {
      const parsed = JSON.parse(response);
      return parsed;
    } catch (error) {
      // Return safe defaults
      return {
        frontend: 'svelte',
        backend: 'node-fastify',
        database: 'postgres',
        utilities: ['prettier', 'eslint', 'tailwind']
      };
    }
  }

  /**
   * Get required fields based on user mode
   */
  getRequiredFields(userMode) {
    const commonFields = [
      { path: 'project_overview.app_name', label: 'App Name', importance: 'high' },
      { path: 'project_overview.app_summary', label: 'App Summary', importance: 'high' },
      { path: 'project_overview.niche', label: 'App Category', importance: 'medium' },
      { path: 'app_structure.app_type', label: 'App Type', importance: 'high' }
    ];

    if (userMode === 'developer') {
      return [
        ...commonFields,
        { path: 'technical_stack.frontend_framework', label: 'Frontend Framework', importance: 'high' },
        { path: 'technical_stack.backend_framework', label: 'Backend Framework', importance: 'high' },
        { path: 'technical_stack.database_choice', label: 'Database', importance: 'high' }
      ];
    }

    return commonFields;
  }

  /**
   * Generate warnings based on questionnaire data
   */
  generateWarnings(questionnaireData) {
    const warnings = [];

    // Check for complexity vs scale mismatch
    const complexity = questionnaireData.project_overview?.complexity_level || 5;
    const userCount = questionnaireData.project_overview?.estimated_user_count;
    
    if (complexity <= 3 && userCount === '10000+') {
      warnings.push('Low complexity rating but high user count - consider increasing complexity for scalability');
    }

    // Check for healthcare data without proper privacy
    if (questionnaireData.project_overview?.niche === 'healthcare' && 
        questionnaireData.data_flow?.data_privacy !== 'healthcare') {
      warnings.push('Healthcare apps should use healthcare-level data privacy');
    }

    // Check for authentication needs
    if (questionnaireData.data_flow?.user_data_storage !== 'none' && 
        !questionnaireData.app_structure?.authentication_needed) {
      warnings.push('Apps that store user data typically need authentication');
    }

    return warnings;
  }

  /**
   * Generate suggestions based on questionnaire data
   */
  generateSuggestions(questionnaireData, userMode) {
    const suggestions = [];

    // Suggest PWA for mobile-first apps
    if (questionnaireData.app_structure?.app_type === 'mobile-first') {
      suggestions.push('Consider making this a Progressive Web App (PWA) for better mobile experience');
    }

    // Suggest monitoring for complex apps
    const complexity = questionnaireData.project_overview?.complexity_level || 5;
    if (complexity >= 7) {
      suggestions.push('High complexity apps benefit from comprehensive monitoring and logging');
    }

    // Suggest appropriate hosting based on scale
    const userCount = questionnaireData.project_overview?.estimated_user_count;
    if (userCount === '10000+' && questionnaireData.app_structure?.deployment_preference === 'netlify') {
      suggestions.push('For high-scale apps, consider AWS instead of Netlify');
    }

    return suggestions;
  }

  /**
   * Get non-developer clarification prompt template
   */
  getNonDeveloperClarificationPrompt() {
    return `You are helping a non-technical user build an app. Ask simple, grouped questions to understand their needs without overwhelming them with technical details.

Focus on:
- What the app does (core functionality)
- Who uses it (target audience)
- How it looks (design preferences)
- Basic requirements (auth, data, scale)

Avoid technical jargon. Group related concepts together.`;
  }

  /**
   * Get developer clarification prompt template
   */
  getDeveloperClarificationPrompt() {
    return `You are helping a developer build an app. You can ask detailed technical questions about:
- Specific frameworks and libraries
- Architecture patterns
- Database schemas
- API design
- Deployment strategies
- Testing approaches

Be precise and technical in your questions.`;
  }

  /**
   * Create prompt snapshot for audit logging
   */
  createPromptSnapshot(questionnaireData, context) {
    return `AI Questionnaire Processing - ${context}
Project: ${questionnaireData.project_overview?.app_name || 'Unknown'}
Summary: ${questionnaireData.project_overview?.app_summary || 'No summary'}
User Mode: ${questionnaireData.userMode || 'unknown'}
Complexity: ${questionnaireData.project_overview?.complexity_level || 'unknown'}/10`;
  }

  /**
   * Utility to get nested object values
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Generate follow-up questions based on incomplete data
   */
  async generateFollowUpQuestions(questionnaireData, userMode) {
    try {
      const prompt = `Based on this project information, what specific questions should I ask to complete the requirements?

${JSON.stringify(questionnaireData, null, 2)}

User Mode: ${userMode}

Generate 3-5 specific follow-up questions that would help clarify the project requirements. Focus on gaps that would impact the technical implementation.

Respond with a JSON array of questions:
["Question 1?", "Question 2?", "Question 3?"]`;

      const response = await modelRouter.route({
        agentRole: 'architect',
        prompt,
        temperature: 0.4,
        maxTokens: 500
      });

      try {
        return JSON.parse(response.content);
      } catch (parseError) {
        // Extract questions from text response
        const questions = response.content
          .split('\n')
          .filter(line => line.includes('?'))
          .map(line => line.trim())
          .slice(0, 5);
        
        return questions;
      }
    } catch (error) {
      structuredLogger.error('Failed to generate follow-up questions', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Validate framework compatibility
   */
  validateFrameworkCompatibility(technicalStack) {
    const compatibility = {
      isValid: true,
      conflicts: [],
      suggestions: []
    };

    // Check for known incompatibilities
    if (technicalStack.frontend_framework === 'svelte' && 
        technicalStack.backend_framework?.includes('next')) {
      compatibility.isValid = false;
      compatibility.conflicts.push('Svelte and Next.js cannot be used together');
      compatibility.suggestions.push('Use SvelteKit for Svelte or React for Next.js');
    }

    // Check database compatibility with hosting
    if (technicalStack.database_choice === 'dynamodb' && 
        !['aws'].includes(questionnaireData.app_structure?.deployment_preference)) {
      compatibility.warnings = compatibility.warnings || [];
      compatibility.warnings.push('DynamoDB works best with AWS hosting');
    }

    return compatibility;
  }

  /**
   * Generate project configuration files preview
   */
  async generateConfigPreview(processedSpec) {
    try {
      const prompt = `Generate configuration file previews for this project:

${JSON.stringify(processedSpec, null, 2)}

Generate previews for:
1. package.json
2. .env.example
3. Basic project structure

Respond in JSON format with file contents.`;

      const response = await modelRouter.route({
        agentRole: 'coder',
        prompt,
        temperature: 0.1,
        maxTokens: 1500
      });

      return this.parseConfigPreviewResponse(response.content);
    } catch (error) {
      structuredLogger.error('Failed to generate config preview', {
        error: error.message
      });
      return null;
    }
  }

  /**
   * Parse config preview response
   */
  parseConfigPreviewResponse(response) {
    try {
      return JSON.parse(response);
    } catch (error) {
      return {
        'package.json': '{\n  "name": "generated-app",\n  "version": "1.0.0"\n}',
        '.env.example': 'NODE_ENV=development\nPORT=3000',
        'structure': 'src/\n  components/\n  routes/\n  lib/'
      };
    }
  }
}

// Create singleton instance
const aiQuestionnaireProcessor = new AIQuestionnaireProcessor();

module.exports = aiQuestionnaireProcessor;