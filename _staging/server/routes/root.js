'use strict'

module.exports = async function (fastify, opts) {
  fastify.get('/', async function (request, reply) {
    return { 
      name: 'AI App Builder API',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
      endpoints: {
        health: '/health',
        questionnaire: '/api/questionnaire',
        config: '/api/questionnaire/config'
      },
      documentation: 'See README.md for complete API documentation'
    }
  })
}
