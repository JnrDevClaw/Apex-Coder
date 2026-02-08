'use strict'

const { mockJobPayload, mockWorkerResult, mockDocker } = require('./helper')

describe('Workers Testing Infrastructure', () => {
  test('should have mock utilities available', () => {
    expect(mockJobPayload).toBeDefined()
    expect(mockWorkerResult).toBeDefined()
    expect(mockDocker).toBeDefined()
  })

  test('should validate mock job payload structure', () => {
    expect(mockJobPayload).toHaveProperty('projectId')
    expect(mockJobPayload).toHaveProperty('buildId')
    expect(mockJobPayload).toHaveProperty('task')
    expect(mockJobPayload).toHaveProperty('specJson')
    expect(mockJobPayload).toHaveProperty('agentRole')
  })

  test('should validate mock worker result structure', () => {
    expect(mockWorkerResult).toHaveProperty('success')
    expect(mockWorkerResult).toHaveProperty('logs')
    expect(mockWorkerResult).toHaveProperty('artifacts')
    expect(mockWorkerResult).toHaveProperty('errors')
  })
})