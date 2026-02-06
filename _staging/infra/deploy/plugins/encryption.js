'use strict';

const fp = require('fastify-plugin');
const { encrypt, decrypt } = require('../services/encryption');

/**
 * This plugin adds encryption/decryption helpers to Fastify
 * 
 * @see https://github.com/fastify/fastify-plugin
 */
module.exports = fp(async function (fastify, opts) {
  // Decorate fastify instance with encryption helpers
  fastify.decorate('encrypt', encrypt);
  fastify.decorate('decrypt', decrypt);

  fastify.log.info('Encryption plugin registered');
}, {
  name: 'encryption'
});
