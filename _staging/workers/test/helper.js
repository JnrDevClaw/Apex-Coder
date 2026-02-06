'use strict'

// Test utilities for workers

/**
 * Mock job payload for testing
 */
const mockJobPayload = {
  projectId: 'project-123',
  buildId: 'build-456',
  task: 'generate',
  specJson: {
    projectName: 'Test App',
    stack: {
      frontend: 'svelte',
      backend: 'node',
      database: 'postgres'
    },
    features: {
      auth: true,
      payments: false,
      uploads: true
    }
  },
  agentRole: 'coder',
  iteration: 1
}

/**
 * Mock worker result for testing
 */
const mockWorkerResult = {
  success: true,
  logs: 'Build completed successfully...',
  artifacts: ['s3://bucket/artifact1.zip'],
  errors: [],
  selfFixSuggestion: null
}

/**
 * Mock Docker container utilities
 */
const mockDocker = {
  /**
   * Mock container creation
   */
  createContainer: jest.fn().mockResolvedValue({
    id: 'container-123',
    start: jest.fn().mockResolvedValue(true),
    stop: jest.fn().mockResolvedValue(true),
    remove: jest.fn().mockResolvedValue(true),
    logs: jest.fn().mockResolvedValue('Mock container logs')
  }),

  /**
   * Mock resource limits
   */
  resourceLimits: {
    memory: '2g',
    cpus: '1',
    timeout: 600000 // 10 minutes
  }
}

/**
 * Mock S3 utilities for artifact storage
 */
const mockS3 = {
  upload: jest.fn().mockResolvedValue({
    Location: 's3://bucket/test-artifact.zip',
    ETag: '"mock-etag"',
    Bucket: 'test-bucket',
    Key: 'test-artifact.zip'
  }),

  download: jest.fn().mockResolvedValue({
    Body: Buffer.from('mock file content'),
    ContentType: 'application/zip'
  })
}

/**
 * Mock Redis/BullMQ utilities
 */
const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-123' }),
  process: jest.fn(),
  on: jest.fn(),
  getJob: jest.fn().mockResolvedValue({
    id: 'job-123',
    data: mockJobPayload,
    progress: jest.fn(),
    log: jest.fn()
  })
}

module.exports = {
  mockJobPayload,
  mockWorkerResult,
  mockDocker,
  mockS3,
  mockQueue
}