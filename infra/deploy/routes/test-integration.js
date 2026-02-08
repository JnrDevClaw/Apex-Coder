/**
 * Test Integration Routes
 * Simple endpoints to test the frontend-to-backend integration
 */

async function testIntegrationRoutes(fastify, options) {
  // Test endpoint to verify server is working
  fastify.get('/api/test/ping', async (request, reply) => {
    reply.send({
      success: true,
      message: 'Server is running',
      timestamp: new Date().toISOString(),
      user: request.user || null
    });
  });

  // Test endpoint to verify pipeline orchestrator
  fastify.get('/api/test/pipeline-status', async (request, reply) => {
    try {
      const hasOrchestrator = !!fastify.pipelineOrchestrator;
      const hasStageRouter = !!fastify.stageRouter;
      const hasModelRouter = !!fastify.modelRouter;
      const hasWebSocket = !!fastify.websocket;

      let stageConfigs = null;
      if (fastify.stageRouter) {
        try {
          stageConfigs = fastify.stageRouter.getAllStageConfigs();
        } catch (error) {
          console.error('Error getting stage configs:', error);
        }
      }

      reply.send({
        success: true,
        components: {
          pipelineOrchestrator: hasOrchestrator,
          stageRouter: hasStageRouter,
          modelRouter: hasModelRouter,
          webSocket: hasWebSocket
        },
        stageConfigs,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      fastify.log.error('Error checking pipeline status:', error);
      reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Test endpoint to start a simple build
  fastify.post('/api/test/simple-build', {
    schema: {
      body: {
        type: 'object',
        properties: {
          projectName: { type: 'string', default: 'Test Project' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { projectName = 'Test Project' } = request.body;

      // Create a simple test spec
      const testSpec = {
        project_overview: {
          app_name: projectName,
          app_summary: 'A simple test application',
          complexity_level: 3
        },
        app_structure: {
          app_type: 'web_app',
          authentication_needed: false,
          deployment_preference: 'aws'
        },
        userMode: 'developer'
      };

      // Start build using the direct endpoint
      const buildResponse = await fetch(`${request.protocol}://${request.headers.host}/api/builds/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          specJson: testSpec,
          projectName,
          projectDescription: 'Test project created via integration test',
          buildOptions: {
            userMode: 'developer',
            test: true
          }
        })
      });

      if (buildResponse.ok) {
        const buildResult = await buildResponse.json();
        reply.send({
          success: true,
          message: 'Test build started successfully',
          build: buildResult.data
        });
      } else {
        const error = await buildResponse.text();
        reply.code(500).send({
          success: false,
          error: `Build start failed: ${error}`
        });
      }
    } catch (error) {
      fastify.log.error('Error starting test build:', error);
      reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  });
}

module.exports = testIntegrationRoutes;