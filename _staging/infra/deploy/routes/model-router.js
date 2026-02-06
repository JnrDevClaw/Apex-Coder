/**
 * Model Router API Routes
 * 
 * REST endpoints for model router operations including:
 * - Direct model calls
 * - Role-based calls
 * - Health monitoring
 * - Provider information
 * 
 * Requirements: 6.7, 11.1-11.5, 19.1
 */

'use strict';

/**
 * Model Router Routes
 * @param {FastifyInstance} fastify - Fastify instance
 * @param {Object} options - Route options
 */
async function modelRouterRoutes(fastify, options) {
  // Register routes under /api/model-router prefix
  fastify.register(async function (fastify) {
  /**
   * POST /api/model-router/call
   * 
   * Call a specific model directly
   * 
   * Body:
   * - provider: string (required) - Provider name
   * - model: string (required) - Model identifier
   * - messages: array (required) - Chat messages
   * - options: object (optional) - Call options
   *   - temperature: number
   *   - maxTokens: number
   *   - topP: number
   *   - useCache: boolean
   * 
   * Response:
   * - content: string - AI response content
   * - tokens: object - Token usage
   * - cost: number - Estimated cost
   * - provider: string - Provider used
   * - model: string - Model used
   * - latency: number - Response time in ms
   * - cached: boolean - Whether response was cached
   */
  fastify.post('/call', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    const { provider, model, messages, options = {} } = request.body;

    // Validate required fields
    if (!provider || !model || !messages) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'provider, model, and messages are required'
      });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'messages must be a non-empty array'
      });
    }

    try {
      // Check if ModelRouter is available
      if (!fastify.modelRouter) {
        return reply.code(503).send({
          error: 'Service Unavailable',
          message: 'ModelRouter not initialized'
        });
      }

      // Add user context to options
      const callOptions = {
        ...options,
        userId: request.user.id,
        projectId: options.projectId || request.user.defaultProjectId
      };

      // Make the call
      const response = await fastify.modelRouter.call(
        provider,
        model,
        messages,
        callOptions
      );

      return reply.send(response);
    } catch (error) {
      fastify.log.error('Model call failed:', error);
      
      return reply.code(error.statusCode || 500).send({
        error: error.name || 'Internal Server Error',
        message: error.message,
        provider: error.provider,
        details: error.details
      });
    }
  });

  /**
   * POST /api/model-router/call-by-role
   * 
   * Call a model by agent role
   * 
   * Body:
   * - role: string (required) - Agent role (clarifier, normalizer, etc.)
   * - messages: array (required) - Chat messages
   * - options: object (optional) - Call options
   *   - temperature: number
   *   - maxTokens: number
   *   - topP: number
   *   - useCache: boolean
   *   - useFallback: boolean
   * 
   * Response:
   * - content: string - AI response content
   * - tokens: object - Token usage
   * - cost: number - Estimated cost
   * - provider: string - Provider used
   * - model: string - Model used
   * - role: string - Role used
   * - latency: number - Response time in ms
   * - cached: boolean - Whether response was cached
   * - fallbackUsed: boolean - Whether fallback was used
   */
  fastify.post('/call-by-role', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    const { role, messages, options = {} } = request.body;

    // Validate required fields
    if (!role || !messages) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'role and messages are required'
      });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'messages must be a non-empty array'
      });
    }

    // Validate role
    const validRoles = [
      'clarifier',
      'normalizer',
      'docs-creator',
      'schema-generator',
      'validator',
      'code-generator',
      'prompt-builder',
      'file-structure-generator'
    ];

    if (!validRoles.includes(role)) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: `Invalid role. Must be one of: ${validRoles.join(', ')}`
      });
    }

    try {
      // Check if ModelRouter is available
      if (!fastify.modelRouter) {
        return reply.code(503).send({
          error: 'Service Unavailable',
          message: 'ModelRouter not initialized'
        });
      }

      // Add user context to options
      const callOptions = {
        ...options,
        userId: request.user.id,
        projectId: options.projectId || request.user.defaultProjectId
      };

      // Make the call
      const response = await fastify.modelRouter.callByRole(
        role,
        messages,
        callOptions
      );

      return reply.send(response);
    } catch (error) {
      fastify.log.error('Role-based call failed:', error);
      
      return reply.code(error.statusCode || 500).send({
        error: error.name || 'Internal Server Error',
        message: error.message,
        role: role,
        provider: error.provider,
        details: error.details
      });
    }
  });

  /**
   * POST /api/model-router/stream
   * 
   * Stream responses from a model by role
   * 
   * Body:
   * - role: string (required) - Agent role
   * - messages: array (required) - Chat messages
   * - options: object (optional) - Call options
   * 
   * Response: Server-Sent Events stream
   */
  fastify.post('/stream', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    const { role, messages, options = {} } = request.body;

    // Validate required fields
    if (!role || !messages) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'role and messages are required'
      });
    }

    try {
      // Check if ModelRouter is available
      if (!fastify.modelRouter) {
        return reply.code(503).send({
          error: 'Service Unavailable',
          message: 'ModelRouter not initialized'
        });
      }

      // Set up SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      // Add user context to options
      const callOptions = {
        ...options,
        userId: request.user.id,
        projectId: options.projectId || request.user.defaultProjectId
      };

      // Stream the response
      const stream = fastify.modelRouter.stream(role, messages, callOptions);

      for await (const chunk of stream) {
        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();
    } catch (error) {
      fastify.log.error('Streaming failed:', error);
      
      reply.raw.write(`data: ${JSON.stringify({
        error: error.name || 'Internal Server Error',
        message: error.message
      })}\n\n`);
      reply.raw.end();
    }
  });

  /**
   * GET /api/model-router/health
   * 
   * Get health status of all providers
   * 
   * Response:
   * - status: string - Overall health status
   * - providers: object - Health status per provider
   * - timestamp: string - Check timestamp
   */
  fastify.get('/health', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      // Check if ModelRouter is available
      if (!fastify.modelRouter) {
        return reply.code(503).send({
          status: 'unavailable',
          message: 'ModelRouter not initialized'
        });
      }

      const health = fastify.modelRouter.getProviderHealth();
      
      // Determine overall status
      const providers = Object.values(health);
      const allHealthy = providers.every(p => p.status === 'healthy');
      const anyHealthy = providers.some(p => p.status === 'healthy');
      
      let overallStatus = 'healthy';
      if (!anyHealthy) {
        overallStatus = 'unhealthy';
      } else if (!allHealthy) {
        overallStatus = 'degraded';
      }

      return reply.send({
        status: overallStatus,
        providers: health,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      fastify.log.error('Health check failed:', error);
      
      return reply.code(500).send({
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * GET /api/model-router/providers
   * 
   * Get list of available providers and their configurations
   * 
   * Response:
   * - providers: array - List of provider information
   */
  fastify.get('/providers', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      // Check if ModelRouter is available
      if (!fastify.modelRouter) {
        return reply.code(503).send({
          error: 'Service Unavailable',
          message: 'ModelRouter not initialized'
        });
      }

      const config = require('../config/model-router-config');
      const providers = config.providers || {};
      const roleMappings = config.roleMappings || {};

      // Build provider list with safe information (no API keys)
      const providerList = Object.entries(providers).map(([name, providerConfig]) => {
        // Find roles that use this provider
        const roles = Object.entries(roleMappings)
          .filter(([_, mapping]) => 
            mapping.primary?.provider === name || 
            mapping.fallback?.some(f => f.provider === name)
          )
          .map(([role, _]) => role);

        return {
          name,
          enabled: providerConfig.enabled !== false,
          models: providerConfig.models || {},
          rateLimit: {
            maxConcurrent: providerConfig.rateLimit?.maxConcurrent,
            minTime: providerConfig.rateLimit?.minTime
          },
          roles,
          configured: !!providerConfig.apiKey || !!process.env[`${name.toUpperCase()}_API_KEY`]
        };
      });

      return reply.send({
        providers: providerList,
        totalProviders: providerList.length,
        enabledProviders: providerList.filter(p => p.enabled).length,
        configuredProviders: providerList.filter(p => p.configured).length
      });
    } catch (error) {
      fastify.log.error('Failed to get providers:', error);
      
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });

  /**
   * GET /api/model-router/costs
   * 
   * Get cost tracking information
   * 
   * Query params:
   * - provider: string (optional) - Filter by provider
   * - projectId: string (optional) - Filter by project
   * - role: string (optional) - Filter by role
   * - startDate: string (optional) - Start date (ISO format)
   * - endDate: string (optional) - End date (ISO format)
   * 
   * Response:
   * - totalCost: number - Total cost
   * - byProvider: object - Cost breakdown by provider
   * - byRole: object - Cost breakdown by role
   * - byProject: object - Cost breakdown by project
   */
  fastify.get('/costs', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      // Check if ModelRouter is available
      if (!fastify.modelRouter) {
        return reply.code(503).send({
          error: 'Service Unavailable',
          message: 'ModelRouter not initialized'
        });
      }

      const filters = {
        provider: request.query.provider,
        projectId: request.query.projectId,
        role: request.query.role,
        startDate: request.query.startDate,
        endDate: request.query.endDate
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => 
        filters[key] === undefined && delete filters[key]
      );

      const metrics = fastify.modelRouter.getMetrics(filters);
      
      return reply.send({
        totalCost: metrics.costs?.total || 0,
        byProvider: metrics.costs?.byProvider || {},
        byRole: metrics.costs?.byRole || {},
        byProject: metrics.costs?.byProject || {},
        filters,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      fastify.log.error('Failed to get costs:', error);
      
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });

  /**
   * GET /api/model-router/roles
   * 
   * Get available agent roles and their model assignments
   * 
   * Response:
   * - roles: array - List of role configurations
   */
  fastify.get('/roles', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      const config = require('../config/model-router-config');
      const roleMappings = config.roleMappings || {};

      const roles = Object.entries(roleMappings).map(([role, mapping]) => ({
        role,
        primary: mapping.primary,
        fallback: mapping.fallback || [],
        description: getRoleDescription(role)
      }));

      return reply.send({
        roles,
        totalRoles: roles.length
      });
    } catch (error) {
      fastify.log.error('Failed to get roles:', error);
      
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });

  /**
   * Get description for a role
   * @param {string} role - Role name
   * @returns {string} Role description
   */
  function getRoleDescription(role) {
    const descriptions = {
      'clarifier': 'Asks follow-up questions to refine specifications',
      'normalizer': 'Normalizes and cleans specification data',
      'docs-creator': 'Generates project documentation',
      'schema-generator': 'Creates database schemas and API contracts',
      'validator': 'Validates structure and consistency',
      'code-generator': 'Generates production code',
      'prompt-builder': 'Assembles prompts for other models',
      'file-structure-generator': 'Creates project file structure'
    };

    return descriptions[role] || 'AI agent role';
  }
  }, { prefix: '/api/model-router' });
}

module.exports = modelRouterRoutes;
