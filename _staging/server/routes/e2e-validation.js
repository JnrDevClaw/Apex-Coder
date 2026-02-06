/**
 * E2E Demo Validation API Routes
 * 
 * Provides endpoints for running and monitoring end-to-end validation
 */

const E2EDemoValidator = require('../services/e2e-demo-validator');
const structuredLogger = require('../services/structured-logger');

async function e2eValidationRoutes(fastify, options) {
  // Initialize E2E validator
  const validator = new E2EDemoValidator({
    workerPool: {
      maxWorkers: 2,
      memory: 1024 * 1024 * 1024, // 1GB for demo
      timeout: 300000 // 5 minutes
    },
    aws: {
      region: process.env.AWS_REGION || 'us-east-1'
    }
  });

  await validator.initialize();

  // Store validator instance for cleanup
  fastify.decorate('e2eValidator', validator);
  
  // Set prefix for all routes in this file
  const prefix = '/api/e2e-validation';

  /**
   * Run complete end-to-end validation
   * POST /api/e2e-validation/run
   */
  fastify.post(`${prefix}/run`, {
    schema: {
      description: 'Run complete end-to-end validation pipeline',
      tags: ['E2E Validation'],
      body: {
        type: 'object',
        properties: {
          customSpec: {
            type: 'object',
            description: 'Custom spec to validate (optional, uses demo spec if not provided)'
          },
          options: {
            type: 'object',
            properties: {
              skipStages: {
                type: 'array',
                items: { type: 'string' },
                description: 'Stages to skip during validation'
              },
              timeoutMs: {
                type: 'number',
                description: 'Validation timeout in milliseconds'
              }
            }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            validationId: { type: 'string' },
            success: { type: 'boolean' },
            duration: { type: 'number' },
            stages: {
              type: 'object',
              properties: {
                questionnaire: { type: 'boolean' },
                taskTree: { type: 'boolean' },
                codeGeneration: { type: 'boolean' },
                deployment: { type: 'boolean' },
                selfFixLoop: { type: 'boolean' }
              }
            },
            liveUrl: { type: 'string' },
            details: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      structuredLogger.info('Starting E2E validation via API', {
        userId: request.user?.id,
        customSpec: !!request.body.customSpec
      });

      // Override demo spec if custom spec provided
      if (request.body.customSpec) {
        validator.demoSpec = request.body.customSpec;
      }

      const result = await validator.runCompleteValidation(request.body.options || {});

      return {
        validationId: result.validationId,
        success: result.success,
        duration: result.duration,
        stages: result.stages,
        liveUrl: result.liveUrl,
        details: result.details,
        completedAt: result.completedAt
      };

    } catch (error) {
      structuredLogger.error('E2E validation failed via API', {
        error: error.message,
        userId: request.user?.id
      });

      reply.code(500);
      return {
        error: 'E2E validation failed',
        message: error.message,
        timestamp: new Date().toISOString()
      };
    }
  });

  /**
   * Run individual validation stage
   * POST /api/e2e-validation/stage/:stageName
   */
  fastify.post(`${prefix}/stage/:stageName`, {
    schema: {
      description: 'Run individual validation stage',
      tags: ['E2E Validation'],
      params: {
        type: 'object',
        properties: {
          stageName: {
            type: 'string',
            enum: ['questionnaire', 'taskTree', 'codeGeneration', 'deployment', 'selfFixLoop']
          }
        }
      },
      body: {
        type: 'object',
        properties: {
          input: {
            type: 'object',
            description: 'Input data for the stage'
          }
        }
      }
    }
  }, async (request, reply) => {
    const { stageName } = request.params;
    const { input } = request.body;

    try {
      let result;

      switch (stageName) {
        case 'questionnaire':
          result = await validator.validateQuestionnaireToSpec();
          break;
        case 'taskTree':
          result = await validator.validateTaskTreeGeneration(input || validator.demoSpec);
          break;
        case 'codeGeneration':
          if (!input || !input.tasks) {
            throw new Error('Tasks input required for code generation stage');
          }
          result = await validator.validateCodeGeneration(input.tasks);
          break;
        case 'deployment':
          if (!input || !input.artifacts) {
            throw new Error('Artifacts input required for deployment stage');
          }
          result = await validator.validateDeployment(input.artifacts);
          break;
        case 'selfFixLoop':
          if (!input || !input.testFailure) {
            throw new Error('Test failure input required for self-fix loop stage');
          }
          result = await validator.validateSelfFixLoop(input.testFailure);
          break;
        default:
          throw new Error(`Unknown stage: ${stageName}`);
      }

      return {
        stage: stageName,
        success: result.success,
        result,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      reply.code(400);
      return {
        error: `Stage ${stageName} validation failed`,
        message: error.message,
        timestamp: new Date().toISOString()
      };
    }
  });

  /**
   * Get validation results
   * GET /api/e2e-validation/results/:validationId
   */
  fastify.get(`${prefix}/results/:validationId`, {
    schema: {
      description: 'Get validation results by ID',
      tags: ['E2E Validation'],
      params: {
        type: 'object',
        properties: {
          validationId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { validationId } = request.params;

    try {
      const results = await validator.getValidationResults(validationId);

      if (!results) {
        reply.code(404);
        return {
          error: 'Validation not found',
          validationId
        };
      }

      return {
        validationId,
        status: results.status,
        startedAt: results.startedAt,
        completedAt: results.completedAt,
        stages: results.stages,
        finalResult: results.finalResult,
        errors: results.errors
      };

    } catch (error) {
      reply.code(500);
      return {
        error: 'Failed to get validation results',
        message: error.message
      };
    }
  });

  /**
   * List active validations
   * GET /api/e2e-validation/active
   */
  fastify.get(`${prefix}/active`, {
    schema: {
      description: 'List currently active validations',
      tags: ['E2E Validation']
    }
  }, async (request, reply) => {
    try {
      const activeValidations = await validator.listActiveValidations();

      return {
        activeValidations,
        count: activeValidations.length,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      reply.code(500);
      return {
        error: 'Failed to list active validations',
        message: error.message
      };
    }
  });

  /**
   * Get validation statistics
   * GET /api/e2e-validation/stats
   */
  fastify.get(`${prefix}/stats`, {
    schema: {
      description: 'Get validation statistics and metrics',
      tags: ['E2E Validation']
    }
  }, async (request, reply) => {
    try {
      const stats = await validator.getValidationStats();

      return {
        stats,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      reply.code(500);
      return {
        error: 'Failed to get validation stats',
        message: error.message
      };
    }
  });

  /**
   * Get demo spec
   * GET /api/e2e-validation/demo-spec
   */
  fastify.get(`${prefix}/demo-spec`, {
    schema: {
      description: 'Get the demo spec used for validation',
      tags: ['E2E Validation']
    }
  }, async (request, reply) => {
    return {
      demoSpec: validator.demoSpec,
      description: 'Demo spec with auth + file upload features for E2E validation'
    };
  });

  /**
   * Update demo spec
   * PUT /api/e2e-validation/demo-spec
   */
  fastify.put(`${prefix}/demo-spec`, {
    schema: {
      description: 'Update the demo spec used for validation',
      tags: ['E2E Validation'],
      body: {
        type: 'object',
        required: ['spec'],
        properties: {
          spec: {
            type: 'object',
            description: 'New demo spec'
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { spec } = request.body;

      // Validate the new spec
      const { validateSpec } = require('../../Frontend/src/lib/schemas/spec.js');
      const validation = validateSpec(spec);

      if (!validation.isValid) {
        reply.code(400);
        return {
          error: 'Invalid spec provided',
          validationErrors: validation.errors.map(e => e.message)
        };
      }

      validator.demoSpec = spec;

      return {
        success: true,
        message: 'Demo spec updated successfully',
        spec: validator.demoSpec
      };

    } catch (error) {
      reply.code(500);
      return {
        error: 'Failed to update demo spec',
        message: error.message
      };
    }
  });

  /**
   * Health check for E2E validation system
   * GET /api/e2e-validation/health
   */
  fastify.get(`${prefix}/health`, {
    schema: {
      description: 'Health check for E2E validation system',
      tags: ['E2E Validation']
    }
  }, async (request, reply) => {
    try {
      const workerPoolStats = await validator.workerPool.getPoolStats();
      const selfFixStats = validator.selfFixLoop.getFixStats();

      return {
        status: 'healthy',
        components: {
          workerPool: {
            status: 'healthy',
            stats: workerPoolStats
          },
          selfFixLoop: {
            status: 'healthy',
            stats: selfFixStats
          },
          validator: {
            status: 'healthy',
            activeValidations: validator.activeValidations.size,
            totalValidations: validator.validationResults.size
          }
        },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      reply.code(503);
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  });

  // Cleanup on server shutdown
  fastify.addHook('onClose', async () => {
    await validator.shutdown();
  });
}

module.exports = e2eValidationRoutes;