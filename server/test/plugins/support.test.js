'use strict'

const Fastify = require('fastify')
const Support = require('../../plugins/support')

describe('Support Plugin', () => {
  test('should work standalone', async () => {
    const fastify = Fastify()
    fastify.register(Support)

    await fastify.ready()
    expect(fastify.someSupport()).toBe('hugs')
    
    await fastify.close()
  })
})
