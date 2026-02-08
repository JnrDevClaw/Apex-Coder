const enhancedSpecProcessor = require('../services/enhanced-spec-processor');
const technicalInferenceService = require('../services/technical-inference-service');
const aiGuidanceEngine = require('../services/ai-guidance-engine');
const questionnaireValidator = require('../services/questionnaire-validator');
const questionnaireErrorHandler = require('../services/questionnaire-error-handler');
const structuredLogger = require('../services/structured-logger');
const configManager = require('../config/config-manager');

/**
 * Sanitize questionnaire data to prevent XSS and injection attacks
 */
function sanitizeQuestionnaireData(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      // Basic HTML/script tag removal and length limiting
      sanitized[key] = value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<[^>]*>/g, '')
        .trim()
        .substring(0, 10000); // Limit string length
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item =>
        typeof item === 'string'
          ? item.replace(/<[^>]*>/g, '').trim().substring(0, 1000)
          : sanitizeQuestionnaireData(item)
      ).slice(0, 100); // Limit array length
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeQuestionnaireData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Perform basic security checks on questionnaire data
 */
function performSecurityCheck(data) {
  const issues = [];
  const suspiciousPatterns = [
    /javascript:/i,
    /data:text\/html/i,
    /vbscript:/i,
    /onload=/i,
    /onerror=/i,
    /eval\(/i,
    /document\.cookie/i,
    /window\.location/i
  ];

  function checkValue(value, path = '') {
    if (typeof value === 'string') {
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(value)) {
          issues.push(`Suspicious content detected in ${path}: ${pattern.source}`);
        }
      }

      // Check for excessively long strings that might be attacks
      if (value.length > 50000) {
        issues.push(`Excessively long content in ${path}`);
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        checkValue(item, `${path}[${index}]`);
      });
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, val] of Object.entries(value)) {
        checkValue(val, path ? `${path}.${key}` : key);
      }
    }
  }

  checkValue(data);

  return {
    safe: issues.length === 0,
    issues
  };
}

/**
 * Enhanced Questionnaire API Routes
 * Provides endpoints for processing enhanced questionnaire structure with AI guidance
 */
async function questionnaireRoutes(fastify, options) {

  // Add timeout handling middleware
  fastify.addHook('onRequest', async (request, reply) => {
    // Set timeout for AI processing endpoints
    const aiEndpoints = ['/process', '/infer-tech', '/guidance'];
    const isAIEndpoint = aiEndpoints.some(endpoint => request.url.includes(endpoint));

    if (isAIEndpoint) {
      request.setTimeout = setTimeout(() => {
        if (!reply.sent) {
          const timeoutResponse = questionnaireErrorHandler.handleProcessingTimeout(
            'questionnaire-api',
            { endpoint: request.url, method: request.method }
          );
          reply.code(408).send(timeoutResponse);
        }
      }, 45000); // 45 second timeout for AI operations
    }
  });

  // Add cleanup hook
  fastify.addHook('onResponse', async (request, reply) => {
    if (request.setTimeout) {
      clearTimeout(request.setTimeout);
    }
  });

  // Configuration endpoint for frontend
  fastify.get('/config', async (request, reply) => {
    try {
      const config = {
        featureFlags: {
          enhancedProcessing: configManager.isFeatureEnabled('enhancedProcessing'),
          aiGuidance: configManager.isFeatureEnabled('aiGuidance'),
          technicalInference: configManager.isFeatureEnabled('technicalInference'),
          contextualHelp: configManager.isFeatureEnabled('contextualHelp'),
          enhancedValidation: configManager.isFeatureEnabled('enhancedValidation')
        },
        aiServices: {
          guidance: {
            enabled: configManager.getAIServiceConfig('guidance').enabled,
            timeout: configManager.getAIServiceConfig('guidance').timeout
          },
          technicalInference: {
            enabled: configManager.getAIServiceConfig('technicalInference').enabled,
            includeAlternatives: configManager.getAIServiceConfig('technicalInference').includeAlternatives
          }
        },
        environment: configManager.getEnvironmentConfig().debugMode ? 'development' : 'production'
      };

      reply.send({
        success: true,
        data: config
      });
    } catch (error) {
      structuredLogger.error('Failed to get configuration', {
        error: error.message
      });

      reply.code(500).send({
        success: false,
        error: 'Configuration unavailable'
      });
    }
  });

  // Enhanced questionnaire processing endpoint
  fastify.post('/process', {
    schema: {
      body: {
        type: 'object',
        required: ['questionnaireData', 'userMode'],
        properties: {
          questionnaireData: {
            type: 'object',
            required: ['project_overview', 'app_structure'],
            properties: {
              userMode: { type: 'string', enum: ['developer', 'non-developer'] },
              sessionId: { type: 'string' },
              project_overview: {
                type: 'object',
                required: ['app_name'],
                properties: {
                  app_name: { type: 'string', minLength: 1 },
                  app_summary: { type: 'string' },
                  app_details: { type: 'string' },
                  niche: { type: 'string' },
                  potential_users: { type: 'string' },
                  estimated_user_count: { type: 'string' },
                  complexity_level: { type: 'number', minimum: 1, maximum: 10 }
                }
              },
              app_structure: {
                type: 'object',
                required: ['app_type'],
                properties: {
                  app_type: { type: 'string' },
                  authentication_needed: { type: 'boolean' },
                  roles_or_permissions: { type: 'array', items: { type: 'string' } },
                  deployment_preference: { type: 'string' }
                }
              }
            }
          },
          userMode: { type: 'string', enum: ['developer', 'non-developer'] },
          options: {
            type: 'object',
            properties: {
              allowIncomplete: { type: 'boolean', default: false },
              includeAlternatives: { type: 'boolean', default: true },
              generatePreview: { type: 'boolean', default: false }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Check if enhanced processing is enabled
      if (!configManager.isFeatureEnabled('enhancedProcessing')) {
        return reply.code(503).send({
          success: false,
          error: 'Enhanced questionnaire processing is currently disabled',
          fallback: 'Please use the standard questionnaire processing'
        });
      }

      const { questionnaireData, userMode, options = {} } = request.body;

      structuredLogger.info('Processing enhanced questionnaire', {
        projectName: questionnaireData.project_overview?.app_name,
        userMode,
        sessionId: questionnaireData.sessionId,
        enhancedProcessingEnabled: true
      });

      // Sanitize input data
      const sanitizedData = sanitizeQuestionnaireData(questionnaireData);

      // Validate input data first
      const validation = questionnaireValidator.validateEnhancedSchema(sanitizedData, userMode);

      if (!validation.isValid && !options.allowIncomplete) {
        const errorResponse = questionnaireErrorHandler.handleValidationError(validation, {
          userMode,
          projectName: sanitizedData.project_overview?.app_name
        });
        return reply.code(400).send(errorResponse);
      }

      // Check for potential security issues
      const securityCheck = performSecurityCheck(sanitizedData);
      if (!securityCheck.safe) {
        structuredLogger.warn('Security check failed for questionnaire data', {
          issues: securityCheck.issues,
          projectName: sanitizedData.project_overview?.app_name
        });

        return reply.code(400).send({
          success: false,
          error: 'Input data contains potentially unsafe content',
          details: securityCheck.issues
        });
      }

      // Process questionnaire with enhanced spec processor
      const result = await enhancedSpecProcessor.processQuestionnaire(
        sanitizedData,
        userMode,
        options
      );

      reply.send({
        success: true,
        data: {
          processedSpec: result.processedSpec,
          validation: result.validation,
          recommendations: result.recommendations,
          metadata: result.metadata,
          inputValidation: validation // Include input validation results
        }
      });
    } catch (error) {
      const errorResponse = questionnaireErrorHandler.handleAIServiceError(
        error,
        'enhanced-spec-processor',
        {
          userMode: request.body.userMode,
          questionnaireData: request.body.questionnaireData
        }
      );

      reply.code(500).send(errorResponse);
    }
  });

  // Technical inference endpoint for non-developers
  fastify.post('/infer-tech', {
    schema: {
      body: {
        type: 'object',
        required: ['projectData'],
        properties: {
          projectData: {
            type: 'object',
            required: ['project_overview', 'app_structure'],
            properties: {
              project_overview: {
                type: 'object',
                properties: {
                  app_name: { type: 'string' },
                  app_summary: { type: 'string' },
                  complexity_level: { type: 'number', minimum: 1, maximum: 10 }
                }
              },
              app_structure: {
                type: 'object',
                properties: {
                  app_type: { type: 'string' },
                  authentication_needed: { type: 'boolean' },
                  deployment_preference: { type: 'string' }
                }
              }
            }
          },
          options: {
            type: 'object',
            properties: {
              includeAlternatives: { type: 'boolean', default: true },
              includeReasoning: { type: 'boolean', default: true }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Check if technical inference is enabled
      if (!configManager.isFeatureEnabled('technicalInference')) {
        return reply.code(503).send({
          success: false,
          error: 'Technical inference is currently disabled',
          fallback: 'Please specify technical requirements manually'
        });
      }

      const { projectData, options = {} } = request.body;

      structuredLogger.info('Inferring technical stack', {
        projectName: projectData.project_overview?.app_name,
        complexity: projectData.project_overview?.complexity_level,
        technicalInferenceEnabled: true
      });

      // Infer technical stack using technical inference service
      const result = await technicalInferenceService.inferTechnicalStack(projectData, options);

      reply.send({
        success: true,
        data: {
          recommendedStack: result.recommended_stack,
          compatibility: result.compatibility,
          reasoning: result.reasoning,
          confidence: result.confidence,
          alternatives: options.includeAlternatives ? result.alternatives : undefined
        }
      });
    } catch (error) {
      const errorResponse = questionnaireErrorHandler.handleAIServiceError(
        error,
        'technical-inference-service',
        {
          projectData: request.body.projectData
        }
      );

      reply.code(500).send(errorResponse);
    }
  });

  // AI guidance generation endpoint
  fastify.post('/guidance', {
    schema: {
      body: {
        type: 'object',
        required: ['questionnaireData', 'userMode'],
        properties: {
          questionnaireData: {
            type: 'object',
            required: ['project_overview'],
            properties: {
              project_overview: { type: 'object' },
              user_flow: { type: 'object' },
              pages: { type: 'array' },
              data_flow: { type: 'object' },
              app_structure: { type: 'object' },
              technical_blueprint: { type: 'object' }
            }
          },
          userMode: { type: 'string', enum: ['developer', 'non-developer'] },
          guidanceType: {
            type: 'string',
            enum: ['follow-up', 'summary', 'validation', 'comprehensive'],
            default: 'comprehensive'
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      // Check if AI guidance is enabled
      if (!configManager.isFeatureEnabled('aiGuidance')) {
        return reply.code(503).send({
          success: false,
          error: 'AI guidance is currently disabled',
          fallback: 'Please proceed without AI guidance'
        });
      }

      const { questionnaireData, userMode, guidanceType = 'comprehensive' } = request.body;

      structuredLogger.info('Generating AI guidance', {
        projectName: questionnaireData.project_overview?.app_name,
        userMode,
        guidanceType,
        aiGuidanceEnabled: true
      });

      // Generate AI guidance using AI guidance engine
      const result = await aiGuidanceEngine.generateContextualGuidance(
        questionnaireData,
        userMode,
        { type: guidanceType }
      );

      reply.send({
        success: true,
        data: {
          guidance: result.guidance,
          metadata: result.metadata
        }
      });
    } catch (error) {
      const errorResponse = questionnaireErrorHandler.handleAIServiceError(
        error,
        'ai-guidance-engine',
        {
          userMode: request.body.userMode,
          questionnaireData: request.body.questionnaireData,
          guidanceType: request.body.guidanceType
        }
      );

      reply.code(500).send(errorResponse);
    }
  });

  // Validate questionnaire endpoint
  fastify.post('/validate', {
    schema: {
      body: {
        type: 'object',
        required: ['questionnaireData', 'userMode'],
        properties: {
          questionnaireData: { type: 'object' },
          userMode: { type: 'string', enum: ['developer', 'non-developer'] },
          validationType: {
            type: 'string',
            enum: ['structure', 'completeness', 'consistency', 'comprehensive'],
            default: 'comprehensive'
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { questionnaireData, userMode, validationType = 'comprehensive' } = request.body;

      structuredLogger.info('Validating questionnaire', {
        projectName: questionnaireData.project_overview?.app_name,
        userMode,
        validationType
      });

      // Validate using enhanced spec processor
      const validation = questionnaireValidator.validateEnhancedSchema(
        questionnaireData,
        userMode
      );

      // Generate validation guidance if comprehensive validation requested
      let guidanceResult = null;
      if (validationType === 'comprehensive') {
        guidanceResult = await aiGuidanceEngine.generateContextualGuidance(
          questionnaireData,
          userMode,
          { type: 'validation' }
        );
      }

      reply.send({
        success: true,
        data: {
          validation,
          guidance: guidanceResult?.guidance || null
        }
      });
    } catch (error) {
      const errorResponse = questionnaireErrorHandler.handleAIServiceError(
        error,
        'questionnaire-validator',
        {
          userMode: request.body.userMode,
          validationType: request.body.validationType
        }
      );

      reply.code(500).send(errorResponse);
    }
  });

  // Draft management endpoints
  // In-memory draft storage (replace with database in production)
  const draftStorage = new Map();

  // Save questionnaire draft
  fastify.post('/drafts', {
    schema: {
      body: {
        type: 'object',
        required: ['draftData'],
        properties: {
          draftData: {
            type: 'object',
            required: ['sessionId', 'userMode', 'questionnaireData'],
            properties: {
              sessionId: { type: 'string' },
              userMode: { type: 'string', enum: ['developer', 'non-developer'] },
              questionnaireData: { type: 'object' },
              stageCompletions: {
                type: 'object',
                additionalProperties: { type: 'boolean' }
              },
              lastModified: { type: 'string' },
              metadata: { type: 'object' }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { draftData } = request.body;

      structuredLogger.info('Saving questionnaire draft', {
        sessionId: draftData.sessionId,
        userMode: draftData.userMode,
        projectName: draftData.questionnaireData?.project_overview?.app_name
      });

      const savedDraft = {
        draftId: `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...draftData,
        savedAt: new Date().toISOString(),
        version: '2.0'
      };

      // Store draft in memory (keyed by sessionId)
      draftStorage.set(draftData.sessionId, savedDraft);

      reply.code(201).send({
        success: true,
        data: {
          draftId: savedDraft.draftId,
          savedAt: savedDraft.savedAt,
          sessionId: savedDraft.sessionId
        }
      });
    } catch (error) {
      structuredLogger.error('Draft save failed', {
        error: error.message,
        sessionId: request.body.draftData?.sessionId
      });

      reply.code(500).send({
        success: false,
        error: 'Draft save failed',
        message: error.message
      });
    }
  });

  // Load questionnaire draft
  fastify.get('/drafts/:sessionId', {
    schema: {
      params: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { sessionId } = request.params;

      structuredLogger.info('Loading questionnaire draft', {
        sessionId
      });

      // Retrieve draft from in-memory storage
      const draft = draftStorage.get(sessionId);

      if (!draft) {
        return reply.code(404).send({
          success: false,
          error: 'Draft not found',
          message: `No draft found for session ${sessionId}`
        });
      }

      reply.send({
        success: true,
        data: draft
      });
    } catch (error) {
      structuredLogger.error('Draft load failed', {
        error: error.message,
        sessionId: request.params.sessionId
      });

      reply.code(500).send({
        success: false,
        error: 'Draft load failed',
        message: error.message
      });
    }
  });
  // Refine specification endpoint
  fastify.post('/refine', {
    schema: {
      body: {
        type: 'object',
        required: ['currentSpec', 'conversationHistory'],
        properties: {
          currentSpec: { type: 'object' },
          conversationHistory: { type: 'array' },
          userMode: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { currentSpec, conversationHistory, userMode } = request.body;
      const refinedSpec = await enhancedSpecProcessor.refineSpec(currentSpec, conversationHistory, userMode);
      reply.send({ success: true, data: refinedSpec });
    } catch (error) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Generate documentation endpoint
  fastify.post('/generate-docs', {
    schema: {
      body: {
        type: 'object',
        required: ['spec'],
        properties: {
          spec: { type: 'object' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { spec } = request.body;
      const docs = await enhancedSpecProcessor.generateDocs(spec);
      reply.send({ success: true, data: { documentation: docs } });
    } catch (error) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Generate schema endpoint
  fastify.post('/generate-schema', {
    schema: {
      body: {
        type: 'object',
        required: ['docs'],
        properties: {
          docs: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { docs } = request.body;
      const schema = await enhancedSpecProcessor.generateSchema(docs);
      reply.send({ success: true, data: { schema } });
    } catch (error) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Generate file structure endpoint
  fastify.post('/generate-file-structure', {
    schema: {
      body: {
        type: 'object',
        required: ['docs', 'schema'],
        properties: {
          docs: { type: 'string' },
          schema: { type: 'object' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { docs, schema } = request.body;
      const fileStructure = await enhancedSpecProcessor.generateFileStructure(docs, schema);
      reply.send({ success: true, data: { fileStructure } });
    } catch (error) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });
}

module.exports = questionnaireRoutes;