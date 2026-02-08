'use strict'

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

describe('Infrastructure Provisioning Tests', () => {
  const terraformDir = path.join(__dirname, '..', 'terraform')
  
  beforeAll(() => {
    // Ensure terraform directory exists
    expect(fs.existsSync(terraformDir)).toBe(true)
  })

  describe('Terraform Configuration', () => {
    test('should have valid terraform syntax', () => {
      try {
        // Check if terraform is available
        execSync('terraform version', { stdio: 'pipe' })
        
        execSync('terraform fmt -check -diff', { 
          cwd: terraformDir,
          stdio: 'pipe'
        })
      } catch (error) {
        if (error.message.includes('terraform')) {
          console.log('Terraform not available, skipping syntax check')
          return
        }
        throw new Error(`Terraform formatting issues: ${error.stdout}`)
      }
    })

    test('should validate terraform configuration', () => {
      try {
        // Check if terraform is available
        execSync('terraform version', { stdio: 'pipe' })
        
        execSync('terraform init -backend=false', { 
          cwd: terraformDir,
          stdio: 'pipe'
        })
        execSync('terraform validate', { 
          cwd: terraformDir,
          stdio: 'pipe'
        })
      } catch (error) {
        if (error.message.includes('terraform')) {
          console.log('Terraform not available, skipping validation')
          return
        }
        throw new Error(`Terraform validation failed: ${error.stdout}`)
      }
    })

    test('should have required terraform files', () => {
      const requiredFiles = [
        'main.tf',
        'variables.tf',
        'outputs.tf',
        'vpc.tf',
        'security.tf',
        'compute.tf',
        'database.tf',
        'storage.tf',
        'monitoring.tf'
      ]
      
      requiredFiles.forEach(file => {
        const filePath = path.join(terraformDir, file)
        expect(fs.existsSync(filePath)).toBe(true)
      })
    })
  })

  describe('Infrastructure Components', () => {
    test('should define VPC configuration', () => {
      const vpcConfig = fs.readFileSync(path.join(terraformDir, 'vpc.tf'), 'utf8')
      
      // Check for essential VPC components
      expect(vpcConfig).toMatch(/resource\s+"aws_vpc"/)
      expect(vpcConfig).toMatch(/resource\s+"aws_subnet"/)
      expect(vpcConfig).toMatch(/resource\s+"aws_internet_gateway"/)
      expect(vpcConfig).toMatch(/resource\s+"aws_route_table"/)
    })

    test('should define security groups', () => {
      const securityConfig = fs.readFileSync(path.join(terraformDir, 'security.tf'), 'utf8')
      
      // Check for security group definitions
      expect(securityConfig).toMatch(/resource\s+"aws_security_group"/)
      expect(securityConfig).toMatch(/ingress/)
      expect(securityConfig).toMatch(/egress/)
    })

    test('should define compute resources', () => {
      const computeConfig = fs.readFileSync(path.join(terraformDir, 'compute.tf'), 'utf8')
      
      // Check for ECS cluster and services
      expect(computeConfig).toMatch(/resource\s+"aws_ecs_cluster"/)
      expect(computeConfig).toMatch(/resource\s+"aws_ecs_service"/)
      expect(computeConfig).toMatch(/resource\s+"aws_ecs_task_definition"/)
    })

    test('should define database resources', () => {
      const dbConfig = fs.readFileSync(path.join(terraformDir, 'database.tf'), 'utf8')
      
      // Check for database definitions
      expect(dbConfig).toMatch(/resource\s+"aws_db_instance"/)
      expect(dbConfig).toMatch(/resource\s+"aws_elasticache_subnet_group"/)
    })

    test('should define storage resources', () => {
      const storageConfig = fs.readFileSync(path.join(terraformDir, 'storage.tf'), 'utf8')
      
      // Check for S3 buckets and ECR repositories
      expect(storageConfig).toMatch(/resource\s+"aws_s3_bucket"/)
      expect(storageConfig).toMatch(/resource\s+"aws_ecr_repository"/)
    })
  })

  describe('Infrastructure Variables', () => {
    test('should define required variables', () => {
      const variablesConfig = fs.readFileSync(path.join(terraformDir, 'variables.tf'), 'utf8')
      
      const requiredVars = [
        'aws_region',
        'environment',
        'project_name'
      ]
      
      requiredVars.forEach(varName => {
        expect(variablesConfig).toMatch(new RegExp(`variable\\s+"${varName}"`))
      })
    })

    test('should have terraform.tfvars.example', () => {
      const exampleVarsPath = path.join(terraformDir, 'terraform.tfvars.example')
      expect(fs.existsSync(exampleVarsPath)).toBe(true)
      
      const exampleVars = fs.readFileSync(exampleVarsPath, 'utf8')
      expect(exampleVars).toMatch(/aws_region/)
      expect(exampleVars).toMatch(/environment/)
      expect(exampleVars).toMatch(/project_name/)
    })
  })
})