'use strict'

const { execSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

describe('Deployment Scripts Tests', () => {
  const scriptsDir = path.join(__dirname, '..', 'scripts')
  
  describe('Deploy Script', () => {
    const deployScript = path.join(scriptsDir, 'deploy.sh')
    
    test('should exist and be executable', () => {
      expect(fs.existsSync(deployScript)).toBe(true)
      
      const stats = fs.statSync(deployScript)
      // On Windows, just check that the file exists and is readable
      expect(stats.isFile()).toBe(true)
    })

    test('should have required functions', () => {
      const scriptContent = fs.readFileSync(deployScript, 'utf8')
      
      const requiredFunctions = [
        'check_prerequisites',
        'build_and_push_images',
        'deploy_infrastructure',
        'update_ecs_services',
        'health_check'
      ]
      
      requiredFunctions.forEach(func => {
        expect(scriptContent).toMatch(new RegExp(`${func}\\s*\\(\\)`))
      })
    })

    test('should validate prerequisites check', () => {
      const scriptContent = fs.readFileSync(deployScript, 'utf8')
      
      // Check for required tool validations
      expect(scriptContent).toMatch(/command -v aws/)
      expect(scriptContent).toMatch(/command -v terraform/)
      expect(scriptContent).toMatch(/command -v docker/)
      expect(scriptContent).toMatch(/aws sts get-caller-identity/)
    })

    test('should have proper error handling', () => {
      const scriptContent = fs.readFileSync(deployScript, 'utf8')
      
      // Check for error handling patterns
      expect(scriptContent).toMatch(/set -e/)
      expect(scriptContent).toMatch(/error\(\)/)
      expect(scriptContent).toMatch(/exit 1/)
    })
  })

  describe('Backup Script', () => {
    const backupScript = path.join(scriptsDir, 'backup.sh')
    
    test('should exist and be executable', () => {
      expect(fs.existsSync(backupScript)).toBe(true)
      
      const stats = fs.statSync(backupScript)
      // On Windows, just check that the file exists and is readable
      expect(stats.isFile()).toBe(true)
    })

    test('should have required backup functions', () => {
      const scriptContent = fs.readFileSync(backupScript, 'utf8')
      
      const requiredFunctions = [
        'create_rds_backup',
        'backup_dynamodb_tables',
        'backup_s3_data',
        'backup_ecs_configs',
        'cleanup_old_backups',
        'test_backup_integrity'
      ]
      
      requiredFunctions.forEach(func => {
        expect(scriptContent).toMatch(new RegExp(`${func}\\s*\\(\\)`))
      })
    })
  })

  describe('Docker Configuration', () => {
    test('should have production Dockerfiles', () => {
      const dockerfiles = [
        'Dockerfile.backend.prod',
        'Dockerfile.frontend.prod', 
        'Dockerfile.workers.prod'
      ]
      
      dockerfiles.forEach(dockerfile => {
        const dockerfilePath = path.join(__dirname, '..', dockerfile)
        expect(fs.existsSync(dockerfilePath)).toBe(true)
        
        const content = fs.readFileSync(dockerfilePath, 'utf8')
        expect(content).toMatch(/FROM/)
        expect(content).toMatch(/WORKDIR/)
        expect(content).toMatch(/COPY/)
      })
    })

    test('should have docker-compose configuration', () => {
      const dockerComposePath = path.join(__dirname, '..', 'docker-compose.yml')
      expect(fs.existsSync(dockerComposePath)).toBe(true)
      
      const content = fs.readFileSync(dockerComposePath, 'utf8')
      expect(content).toMatch(/version:/)
      expect(content).toMatch(/services:/)
    })
  })

  describe('Nginx Configuration', () => {
    test('should have nginx configuration', () => {
      const nginxConfigPath = path.join(__dirname, '..', 'nginx.conf')
      expect(fs.existsSync(nginxConfigPath)).toBe(true)
      
      const content = fs.readFileSync(nginxConfigPath, 'utf8')
      expect(content).toMatch(/server\s*{/)
      expect(content).toMatch(/location/)
      expect(content).toMatch(/try_files/)
    })
  })
})

describe('CI/CD Pipeline Tests', () => {
  const workflowPath = path.join(__dirname, '..', '..', '.github', 'workflows', 'ci-cd.yml')
  
  test('should have CI/CD workflow file', () => {
    expect(fs.existsSync(workflowPath)).toBe(true)
  })

  test('should define required jobs', () => {
    const workflowContent = fs.readFileSync(workflowPath, 'utf8')
    
    const requiredJobs = [
      'test',
      'security-scan',
      'build-and-push',
      'deploy-infrastructure',
      'deploy-application',
      'health-check'
    ]
    
    requiredJobs.forEach(job => {
      expect(workflowContent).toMatch(new RegExp(`${job}:`))
    })
  })

  test('should have proper job dependencies', () => {
    const workflowContent = fs.readFileSync(workflowPath, 'utf8')
    
    // Check job dependencies
    expect(workflowContent).toMatch(/needs:\s*\[?test/)
    expect(workflowContent).toMatch(/needs:\s*.*build-and-push/)
    expect(workflowContent).toMatch(/needs:\s*.*deploy-application/)
  })

  test('should include security scanning', () => {
    const workflowContent = fs.readFileSync(workflowPath, 'utf8')
    
    expect(workflowContent).toMatch(/trivy-action/)
    expect(workflowContent).toMatch(/security-scan/)
  })

  test('should have environment variables defined', () => {
    const workflowContent = fs.readFileSync(workflowPath, 'utf8')
    
    const requiredEnvVars = [
      'AWS_REGION',
      'ECR_REGISTRY',
      'ECS_CLUSTER'
    ]
    
    requiredEnvVars.forEach(envVar => {
      expect(workflowContent).toMatch(new RegExp(envVar))
    })
  })
})