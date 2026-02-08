'use strict'

const fp = require('fastify-plugin')
const { encrypt, decrypt } = require('../services/encryption.js')

// the use of fastify-plugin is required to be able
// to export the decorators to the outer scope

module.exports = fp(async function (fastify, opts) {
  if (!fastify.hasDecorator('someSupport')) {
    fastify.decorate('someSupport', function () {
      return 'hugs'
    })
  }
  
  // Register encryption/decryption helpers (only if not already decorated)
  if (!fastify.hasDecorator('encrypt')) {
    fastify.decorate('encrypt', encrypt)
  }
  if (!fastify.hasDecorator('decrypt')) {
    fastify.decorate('decrypt', decrypt)
  }
})
