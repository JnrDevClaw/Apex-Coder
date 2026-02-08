'use strict'

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

/**
 * Test utilities for infrastructure testing
 */

/**
 * Mock AWS CLI responses for testing
 */
const mockAWS = {
  /**
   * Mock ECS service description
   */
  ecsService: {
    services: [{
      serviceName: 'ai-app-builder-production-app-service',
      status: 'ACTIVE',
      runningCount: 1,
      desiredCount: 1,
      taskDefinition: 'ai-app-builder-production-app:1'
    }]
  },

  /**
   * Mock RDS snapshot description
   */
  rdsSnapshot: {
    DBSnapshots: [{
      DBSnapshotIdentifier: 'ai-app-builder-production-manual-20241103120000',
      Status: 'available',
      SnapshotCreateTime: new Date().toISOString()
    }]
  },

  /**
   * Mock DynamoDB backup list
   */
  dynamoBackups: {
    BackupSummaries: [{
      BackupName: 'ai-app-builder-production-projects-20241103120000',
      BackupStatus: 'AVAILABLE',
      BackupCreationDateTime: new Date().toISOString()
    }]
  },

  /**
   * Mock ALB description
   */
  loadBalancer: {
    LoadBalancers: [{
      LoadBalancerName: 'ai-app-builder-production-alb',
      DNSName: 'ai-app-builder-production-alb-123456789.us-east-1.elb.amazonaws.com',
      State: { Code: 'active' }
    }]
  }
}

/**
 * Mock Terraform responses
 */
const mockTerraform = {
  /**
   * Mock terraform plan output
   */
  planOutput: `
Terraform will perform the following actions:

  # aws_ecs_cluster.main will be created
  + resource "aws_ecs_cluster" "main" {
      + arn  = (known after apply)
      + id   = (known after apply)
      + name = "ai-app-builder-production-cluster"
    }

Plan: 1 to add, 0 to change, 0 to destroy.
  `,

  /**
   * Mock terraform validate output
   */
  validateOutput: 'Success! The configuration is valid.'
}

/**
 * Utility functions for testing infrastructure
 */
const testUtils = {
  /**
   * Check if a command exists in the system
   * @param {string} command - Command to check
   * @returns {boolean} True if command exists
   */
  commandExists(command) {
    try {
      execSync(`command -v ${command}`, { stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  },

  /**
   * Read and parse a terraform file
   * @param {string} filePath - Path to terraform file
   * @returns {string} File content
   */
  readTerraformFile(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Terraform file not found: ${filePath}`)
    }
    return fs.readFileSync(filePath, 'utf8')
  },

  /**
   * Validate terraform syntax without executing
   * @param {string} terraformDir - Directory containing terraform files
   * @returns {boolean} True if syntax is valid
   */
  validateTerraformSyntax(terraformDir) {
    try {
      execSync('terraform fmt -check', { 
        cwd: terraformDir,
        stdio: 'pipe'
      })
      return true
    } catch {
      return false
    }
  },

  /**
   * Check if required environment variables are set
   * @param {string[]} requiredVars - Array of required environment variable names
   * @returns {Object} Object with missing variables
   */
  checkEnvironmentVariables(requiredVars) {
    const missing = []
    const present = []
    
    requiredVars.forEach(varName => {
      if (process.env[varName]) {
        present.push(varName)
      } else {
        missing.push(varName)
      }
    })
    
    return { missing, present }
  },

  /**
   * Mock Docker operations for testing
   */
  mockDocker: {
    /**
     * Mock docker build command
     */
    build: () => Promise.resolve({
      success: true,
      imageId: 'sha256:1234567890abcdef',
      logs: 'Successfully built image'
    }),

    /**
     * Mock docker push command
     */
    push: () => Promise.resolve({
      success: true,
      digest: 'sha256:abcdef1234567890',
      logs: 'Successfully pushed image'
    }),

    /**
     * Mock docker tag command
     */
    tag: () => Promise.resolve({
      success: true,
      logs: 'Successfully tagged image'
    })
  },

  /**
   * Create a temporary terraform configuration for testing
   * @param {Object} config - Terraform configuration object
   * @returns {string} Path to temporary terraform file
   */
  createTempTerraformConfig(config) {
    const tempDir = path.join(__dirname, 'temp')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
    
    const tempFile = path.join(tempDir, `test-${Date.now()}.tf`)
    const terraformContent = JSON.stringify(config, null, 2)
    fs.writeFileSync(tempFile, terraformContent)
    
    return tempFile
  },

  /**
   * Clean up temporary test files
   * @param {string} filePath - Path to file to clean up
   */
  cleanupTempFile(filePath) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }
}

/**
 * Test data for infrastructure testing
 */
const testData = {
  /**
   * Sample terraform variables
   */
  terraformVars: {
    aws_region: 'us-east-1',
    environment: 'test',
    project_name: 'ai-app-builder-test'
  },

  /**
   * Sample ECS task definition
   */
  ecsTaskDefinition: {
    family: 'ai-app-builder-test-app',
    networkMode: 'awsvpc',
    requiresCompatibilities: ['FARGATE'],
    cpu: '256',
    memory: '512',
    containerDefinitions: [{
      name: 'app',
      image: '123456789012.dkr.ecr.us-east-1.amazonaws.com/ai-app-builder-test-app:latest',
      portMappings: [{
        containerPort: 3000,
        protocol: 'tcp'
      }]
    }]
  },

  /**
   * Sample backup configuration
   */
  backupConfig: {
    retentionDays: 30,
    tables: ['projects', 'builds', 'audit-logs'],
    buckets: ['artifacts', 'logs'],
    schedules: {
      daily: '0 2 * * *',
      weekly: '0 3 * * 0'
    }
  }
}

module.exports = {
  mockAWS,
  mockTerraform,
  testUtils,
  testData
}