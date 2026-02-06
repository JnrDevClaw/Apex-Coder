'use strict'

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { testUtils, mockAWS } = require('./helper')

describe('Infrastructure Integration Tests', () => {
  const infraDir = path.join(__dirname, '..')
  const terraformDir = path.join(infraDir, 'terraform')
  const scriptsDir = path.join(infraDir, 'scripts')
  
  // Skip integration tests if not in CI environment or if AWS credentials not available
  const skipIntegration = !process.env.CI && !process.env.AWS_ACCESS_KEY_ID
  
  beforeAll(() => {
    if (skipIntegration) {
      console.log('Skipping integration tests - not in CI environment or AWS credentials not available')
    }
  })

  describe('End-to-End Deployment Validation', () => {
    test('should validate complete terraform configuration', async () => {
      if (skipIntegration) return
      
      try {
        // Initialize terraform with backend=false for testing
        execSync('terraform init -backend=false', { 
          cwd: terraformDir,
          stdio: 'pipe'
        })
        
        // Validate configuration
        const validateOutput = execSync('terraform validate', { 
          cwd: terraformDir,
          encoding: 'utf8'
        })
        
        expect(validateOutput).toMatch(/Success! The configuration is valid/)
      } catch (error) {
        fail(`Terraform validation failed: ${error.message}`)
      }
    })

    test('should generate valid terraform plan', async () => {
      if (skipIntegration) return
      
      try {
        // Create a test tfvars file
        const testVars = `
aws_region = "us-east-1"
environment = "test"
project_name = "ai-app-builder-test"
`
        const testVarsPath = path.join(terraformDir, 'test.tfvars')
        fs.writeFileSync(testVarsPath, testVars)
        
        // Generate plan
        const planOutput = execSync(`terraform plan -var-file=test.tfvars -out=test.tfplan`, { 
          cwd: terraformDir,
          encoding: 'utf8'
        })
        
        expect(planOutput).toMatch(/Plan:/)
        expect(planOutput).not.toMatch(/Error:/)
        
        // Cleanup
        fs.unlinkSync(testVarsPath)
        const planPath = path.join(terraformDir, 'test.tfplan')
        if (fs.existsSync(planPath)) {
          fs.unlinkSync(planPath)
        }
      } catch (error) {
        fail(`Terraform plan failed: ${error.message}`)
      }
    })
  })

  describe('Script Integration Tests', () => {
    test('should validate deploy script prerequisites', () => {
      const deployScript = path.join(scriptsDir, 'deploy.sh')
      
      // Mock the script execution by checking its content
      const scriptContent = fs.readFileSync(deployScript, 'utf8')
      
      // Verify the script has proper structure
      expect(scriptContent).toMatch(/check_prerequisites/)
      expect(scriptContent).toMatch(/main\(\)/)
      expect(scriptContent).toMatch(/set -e/)
    })

    test('should validate backup script functionality', () => {
      const backupScript = path.join(scriptsDir, 'backup.sh')
      
      const scriptContent = fs.readFileSync(backupScript, 'utf8')
      
      // Verify backup script has all required functions
      const requiredFunctions = [
        'create_rds_backup',
        'backup_dynamodb_tables', 
        'backup_s3_data',
        'test_backup_integrity'
      ]
      
      requiredFunctions.forEach(func => {
        expect(scriptContent).toMatch(new RegExp(`${func}\\s*\\(`))
      })
    })
  })

  describe('Docker Build Integration', () => {
    test('should validate Dockerfile syntax', () => {
      const dockerfiles = [
        'Dockerfile.backend.prod',
        'Dockerfile.frontend.prod',
        'Dockerfile.workers.prod'
      ]
      
      dockerfiles.forEach(dockerfile => {
        const dockerfilePath = path.join(infraDir, dockerfile)
        expect(fs.existsSync(dockerfilePath)).toBe(true)
        
        const content = fs.readFileSync(dockerfilePath, 'utf8')
        
        // Basic Dockerfile validation
        expect(content).toMatch(/FROM\s+/)
        expect(content).toMatch(/WORKDIR/)
        expect(content).toMatch(/COPY/)
        
        // Should not have common security issues
        expect(content).not.toMatch(/ADD.*http/) // Avoid ADD with URLs
        expect(content).not.toMatch(/USER\s+root/) // Avoid running as root
      })
    })

    test('should have proper multi-stage builds', () => {
      const frontendDockerfile = path.join(infraDir, 'Dockerfile.frontend.prod')
      const content = fs.readFileSync(frontendDockerfile, 'utf8')
      
      // Frontend should use multi-stage build for optimization
      expect(content).toMatch(/FROM.*as\s+builder/i)
      expect(content).toMatch(/FROM.*nginx/i)
    })
  })

  describe('CI/CD Pipeline Integration', () => {
    test('should have valid GitHub Actions workflow', () => {
      const workflowPath = path.join(__dirname, '..', '..', '.github', 'workflows', 'ci-cd.yml')
      const workflowContent = fs.readFileSync(workflowPath, 'utf8')
      
      // Validate YAML structure (basic check)
      expect(workflowContent).toMatch(/^name:/)
      expect(workflowContent).toMatch(/on:/)
      expect(workflowContent).toMatch(/jobs:/)
      
      // Check for required secrets
      expect(workflowContent).toMatch(/AWS_ACCESS_KEY_ID/)
      expect(workflowContent).toMatch(/AWS_SECRET_ACCESS_KEY/)
    })

    test('should have proper job dependencies', () => {
      const workflowPath = path.join(__dirname, '..', '..', '.github', 'workflows', 'ci-cd.yml')
      const workflowContent = fs.readFileSync(workflowPath, 'utf8')
      
      // Security scan should depend on tests
      expect(workflowContent).toMatch(/security-scan:[\s\S]*needs:\s*test/)
      
      // Build should depend on tests and security scan
      expect(workflowContent).toMatch(/build-and-push:[\s\S]*needs:\s*\[.*test.*security-scan.*\]/)
      
      // Deploy should depend on build
      expect(workflowContent).toMatch(/deploy-infrastructure:[\s\S]*needs:.*build-and-push/)
    })
  })

  describe('Monitoring and Alerting Integration', () => {
    test('should configure comprehensive monitoring', () => {
      const monitoringConfig = path.join(terraformDir, 'monitoring.tf')
      
      // Skip if monitoring.tf doesn't exist or is empty
      if (!fs.existsSync(monitoringConfig)) {
        return
      }
      
      const content = fs.readFileSync(monitoringConfig, 'utf8')
      
      if (content.trim().length > 0) {
        // Should have CloudWatch alarms for critical metrics
        expect(content).toMatch(/aws_cloudwatch_metric_alarm/)
        expect(content).toMatch(/CPUUtilization/)
        expect(content).toMatch(/MemoryUtilization/)
        
        // Should have SNS topics for notifications
        expect(content).toMatch(/aws_sns_topic/)
      }
    })

    test('should have log aggregation configured', () => {
      const monitoringConfig = path.join(terraformDir, 'monitoring.tf')
      
      // Skip if monitoring.tf doesn't exist or is empty
      if (!fs.existsSync(monitoringConfig)) {
        return
      }
      
      const content = fs.readFileSync(monitoringConfig, 'utf8')
      
      if (content.trim().length > 0) {
        // Should have CloudWatch log groups
        expect(content).toMatch(/aws_cloudwatch_log_group/)
        expect(content).toMatch(/retention_in_days/)
      }
    })
  })

  describe('Security Configuration Integration', () => {
    test('should have WAF protection configured', () => {
      const wafConfig = path.join(terraformDir, 'waf.tf')
      const content = fs.readFileSync(wafConfig, 'utf8')
      
      expect(content).toMatch(/aws_wafv2_web_acl/)
      expect(content).toMatch(/aws_wafv2_web_acl_association/)
    })

    test('should have proper IAM roles and policies', () => {
      const securityConfig = path.join(terraformDir, 'security.tf')
      const content = fs.readFileSync(securityConfig, 'utf8')
      
      expect(content).toMatch(/aws_iam_role/)
      expect(content).toMatch(/aws_iam_role_policy/)
      expect(content).toMatch(/assume_role_policy/)
    })

    test('should have security groups configured', () => {
      const securityConfig = path.join(terraformDir, 'security.tf')
      const content = fs.readFileSync(securityConfig, 'utf8')
      
      expect(content).toMatch(/aws_security_group/)
      expect(content).toMatch(/ingress/)
    })
  })
})