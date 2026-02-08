'use strict'

const fp = require('fastify-plugin')
const rateLimit = require('@fastify/rate-limit')

/**
 * Rate limiting plugin to prevent abuse and excessive API calls
 * 
 * Applies different rate limits to different endpoint categories:
 * - OAuth endpoints: 10 requests per 15 minutes
 * - Deployment triggers: 5 requests per hour
 * - General API: 100 requests per 15 minutes
 */
module.exports = fp(async function (fastify, opts) {
  // Register global rate limiter with Redis store for distributed rate limiting
  const rateLimitOptions = {
    global: true,
    max: 100, // Default: 100 requests
    timeWindow: '15 minutes',
    skipOnError: true, // Don't block requests if Redis is down
    errorResponseBuilder: (request, context) => {
      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil(context.after / 1000)} seconds.`,
        retryAfter: context.after
      }
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true
    }
  }

  // Use Redis if available, otherwise fall back to in-memory store
  if (fastify.redis && typeof fastify.redis.get === 'function') {
    rateLimitOptions.redis = fastify.redis;
    fastify.log.info('Rate limiting using Redis store');
  } else {
    fastify.log.warn('Rate limiting using in-memory store (Redis not available)');
  }

  await fastify.register(rateLimit, rateLimitOptions)

  // Decorate fastify with custom rate limit configurations
  fastify.decorate('rateLimitConfig', {
    oauth: {
      max: 10,
      timeWindow: '15 minutes'
    },
    deployment: {
      max: 5,
      timeWindow: '1 hour'
    },
    aws: {
      max: 20,
      timeWindow: '15 minutes'
    },
    strict: {
      max: 3,
      timeWindow: '5 minutes'
    }
  })
}, {
  name: 'rate-limit',
  dependencies: ['redis']
})
