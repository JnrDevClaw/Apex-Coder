/**
 * Health Check Routes
 * Provides health status for monitoring and debugging
 */

async function healthRoutes(fastify, options) {
  // Basic health check
  fastify.get('/health', async (request, reply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };
  });

  // Detailed health check
  fastify.get('/health/detailed', async (request, reply) => {
    const memoryUsage = process.memoryUsage();
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`
      },
      features: {
        enhancedQuestionnaire: process.env.ENHANCED_QUESTIONNAIRE_ENABLED === 'true',
        aiGuidance: process.env.AI_GUIDANCE_ENABLED === 'true',
        technicalInference: process.env.TECHNICAL_INFERENCE_ENABLED === 'true'
      }
    };
  });
}

module.exports = healthRoutes;