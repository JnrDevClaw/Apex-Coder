'use strict'

// This file contains code that we reuse between our tests.

const { build: buildApplication } = require('fastify-cli/helper')
const path = require('node:path')
const AppPath = path.join(__dirname, '..', 'app.js')

// Fill in this config with all the configurations needed for testing the application
function config() {
  return {
    skipOverride: true // Register our application with fastify-plugin
  }
}

// Automatically build and tear down our instance for Jest
async function build() {
  // You can set all the options supported by the fastify CLI command
  const argv = [AppPath]

  // fastify-plugin ensures that all decorators are exposed for testing purposes,
  // this is different from the production setup
  const app = await buildApplication(argv, config())

  return app
}

// Mock utilities for testing
const mockHelpers = {
  /**
   * Create a mock JWT token for testing
   * @param {Object} payload - JWT payload
   * @returns {string} Mock JWT token
   */
  createMockJWT(payload = { userId: 'test-user', orgId: 'test-org' }) {
    // Simple mock JWT for testing - not cryptographically secure
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64')
    const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64')
    return `${header}.${payloadStr}.mock-signature`
  },

  /**
   * Create mock request headers with authentication
   * @param {string} token - JWT token
   * @returns {Object} Headers object
   */
  createAuthHeaders(token) {
    return {
      authorization: `Bearer ${token}`
    }
  },

  /**
   * Mock database responses
   */
  mockDB: {
    project: {
      id: 'project-123',
      name: 'Test Project',
      orgId: 'org-123',
      specJson: { projectName: 'Test App' },
      status: 'draft'
    },
    build: {
      id: 'build-456',
      projectId: 'project-123',
      status: 'queued',
      startedAt: new Date().toISOString()
    }
  }
}

module.exports = {
  config,
  build,
  mockHelpers
}
