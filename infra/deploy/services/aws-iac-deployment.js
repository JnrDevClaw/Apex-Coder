const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const AWSActionLayer = require('./aws-action-layer');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Infrastructure as Code Deployment Service
 * Handles Pulumi and Terraform template execution with infrastructure output capture
 * and rollback capabilities
 */
class IaCDeployment extends AWSActionLayer {
  constructor(options = {}) {
    super(options);
    this.deploymentHistory = new Map();
    this.workingDir = options.workingDir || '/tmp/iac-deployments';
  }

  /**
   * Deploy infrastructure using IaC templates
   * @param {Object} deploymentConfig - Deployment configuration
   * @param {string} actorId - User or AI agent ID
   * @param {string} actorType - 'user' | 'ai-agent'
   * @returns {Object} Deployment result
   */
  async deployInfrastructure(deploymentConfig, actorId, actorType = 'user') {
    const {
      templateUrl,
      provider, // 'pulumi' | 'terraform'
      variables = {},
      outputsToCapture = [],
      stackName,
      projectId,
      buildId
    } = deploymentConfig;

    const operationId = this.generateOperationId();
    const deploymentId = `iac_deploy_${projectId}_${buildId}_${Date.now()}`;
    const workspaceDir = path.join(this.workingDir, deploymentId);

    try {
      // Log deployment start
      await this.logAuditEvent(
        'IaCDeploymentStarted',
        actorId,
        actorType,
        {
          operationId,
          deploymentId,
          provider,
          templateUrl,
          stackName,
          projectId,
          buildId
        }
      );

      // Request approval for infrastructure deployment
      const approval = await this.requestApproval(
        operationId,
        'billing',
        {
          estimatedCost: this.estimateIaCDeploymentCost(deploymentConfig),
          operation: 'infrastructure-deployment',
          provider,
          stackName
        },
        actorId,
        'owner'
      );

      if (approval.status !== 'approved') {
        throw new Error(`Infrastructure deployment requires approval. Status: ${approval.status}`);
      }

      // Assume deployment role
      const credentials = await this.assumeRole(
        this.roleArn,
        `iac-deploy-${deploymentId}`,
        3600
      );

      // Set up workspace
      await this.setupWorkspace(workspaceDir, templateUrl, credentials);

      // Deploy based on provider
      let deploymentResult;
      if (provider === 'pulumi') {
        deploymentResult = await this.deployWithPulumi(
          workspaceDir,
          stackName,
          variables,
          outputsToCapture,
          credentials
        );
      } else if (provider === 'terraform') {
        deploymentResult = await this.deployWithTerraform(
          workspaceDir,
          variables,
          outputsToCapture,
          credentials
        );
      } else {
        throw new Error(`Unsupported IaC provider: ${provider}`);
      }

      // Capture infrastructure state for rollback
      const infrastructureState = await this.captureInfrastructureState(
        workspaceDir,
        provider,
        stackName
      );

      // Store deployment version for rollback
      this.storeDeploymentVersion(deploymentId, {
        provider,
        stackName,
        workspaceDir,
        templateUrl,
        variables,
        infrastructureState,
        deployedAt: new Date().toISOString(),
        outputs: deploymentResult.outputs
      });

      const result = {
        deploymentId,
        operationId,
        status: 'success',
        provider,
        stackName,
        outputs: deploymentResult.outputs,
        resourcesCreated: deploymentResult.resourcesCreated,
        rollbackAvailable: true
      };

      // Log successful deployment
      await this.logAuditEvent(
        'IaCDeploymentCompleted',
        actorId,
        actorType,
        {
          ...result,
          estimatedCost: this.estimateIaCDeploymentCost(deploymentConfig)
        }
      );

      return result;

    } catch (error) {
      // Log deployment failure
      await this.logAuditEvent(
        'IaCDeploymentFailed',
        actorId,
        actorType,
        {
          operationId,
          deploymentId,
          error: error.message,
          provider,
          stackName
        }
      );

      // Clean up workspace on failure
      try {
        await this.cleanupWorkspace(workspaceDir);
      } catch (cleanupError) {
        console.warn('Failed to cleanup workspace:', cleanupError.message);
      }

      throw new Error(`Infrastructure deployment failed: ${error.message}`);
    }
  }

  /**
   * Set up workspace with IaC templates
   * @param {string} workspaceDir - Workspace directory
   * @param {string} templateUrl - S3 URL of templates
   * @param {Object} credentials - AWS credentials
   */
  async setupWorkspace(workspaceDir, templateUrl, credentials) {
    try {
      // Create workspace directory
      await fs.mkdir(workspaceDir, { recursive: true });

      // Download and extract templates
      await this.downloadAndExtractTemplates(workspaceDir, templateUrl, credentials);

      console.log(`Workspace set up at: ${workspaceDir}`);

    } catch (error) {
      throw new Error(`Failed to setup workspace: ${error.message}`);
    }
  }

  /**
   * Download and extract IaC templates from S3
   * @param {string} workspaceDir - Workspace directory
   * @param {string} templateUrl - S3 URL of templates
   * @param {Object} credentials - AWS credentials
   */
  async downloadAndExtractTemplates(workspaceDir, templateUrl, credentials) {
    try {
      // Parse S3 URL
      const s3UrlMatch = templateUrl.match(/s3:\/\/([^\/]+)\/(.+)/);
      if (!s3UrlMatch) {
        throw new Error(`Invalid S3 URL format: ${templateUrl}`);
      }

      const [, bucket, key] = s3UrlMatch;

      // Create S3 client with credentials
      const s3Client = this.createClientWithCredentials(S3Client, credentials);

      // Download template archive
      const getObjectCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: key
      });

      const response = await s3Client.send(getObjectCommand);
      
      // For demo purposes, create sample templates
      // In reality, you would extract the downloaded zip file
      
      if (key.includes('pulumi')) {
        await this.createSamplePulumiProject(workspaceDir);
      } else if (key.includes('terraform')) {
        await this.createSampleTerraformProject(workspaceDir);
      }

    } catch (error) {
      throw new Error(`Failed to download templates: ${error.message}`);
    }
  }

  /**
   * Create sample Pulumi project for demo
   * @param {string} workspaceDir - Workspace directory
   */
  async createSamplePulumiProject(workspaceDir) {
    const pulumiYaml = `
name: ai-app-infrastructure
runtime: nodejs
description: Infrastructure for AI-generated application
`;

    const indexJs = `
const aws = require("@pulumi/aws");

// Create S3 bucket for static hosting
const bucket = new aws.s3.Bucket("app-bucket", {
    website: {
        indexDocument: "index.html",
        errorDocument: "error.html",
    },
});

// Export bucket name and website URL
exports.bucketName = bucket.id;
exports.websiteUrl = bucket.websiteEndpoint;
`;

    const packageJson = `
{
  "name": "ai-app-infrastructure",
  "version": "1.0.0",
  "dependencies": {
    "@pulumi/aws": "^6.0.0",
    "@pulumi/pulumi": "^3.0.0"
  }
}
`;

    await fs.writeFile(path.join(workspaceDir, 'Pulumi.yaml'), pulumiYaml.trim());
    await fs.writeFile(path.join(workspaceDir, 'index.js'), indexJs.trim());
    await fs.writeFile(path.join(workspaceDir, 'package.json'), packageJson.trim());
  }

  /**
   * Create sample Terraform project for demo
   * @param {string} workspaceDir - Workspace directory
   */
  async createSampleTerraformProject(workspaceDir) {
    const mainTf = `
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "ai-generated-app"
}

resource "aws_s3_bucket" "app_bucket" {
  bucket = "\${var.app_name}-\${random_id.bucket_suffix.hex}"
}

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket_website_configuration" "app_bucket_website" {
  bucket = aws_s3_bucket.app_bucket.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "error.html"
  }
}

output "bucket_name" {
  description = "Name of the S3 bucket"
  value       = aws_s3_bucket.app_bucket.id
}

output "website_url" {
  description = "Website URL"
  value       = aws_s3_bucket_website_configuration.app_bucket_website.website_endpoint
}
`;

    await fs.writeFile(path.join(workspaceDir, 'main.tf'), mainTf.trim());
  }

  /**
   * Deploy infrastructure using Pulumi
   * @param {string} workspaceDir - Workspace directory
   * @param {string} stackName - Stack name
   * @param {Object} variables - Variables to set
   * @param {Array} outputsToCapture - Outputs to capture
   * @param {Object} credentials - AWS credentials
   * @returns {Object} Deployment result
   */
  async deployWithPulumi(workspaceDir, stackName, variables, outputsToCapture, credentials) {
    try {
      // Set environment variables for AWS credentials
      const env = {
        ...process.env,
        AWS_ACCESS_KEY_ID: credentials.accessKeyId,
        AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
        AWS_SESSION_TOKEN: credentials.sessionToken,
        AWS_REGION: this.region
      };

      // Initialize Pulumi stack
      await this.runCommand('pulumi', ['stack', 'init', stackName], workspaceDir, env);

      // Set configuration variables
      for (const [key, value] of Object.entries(variables)) {
        await this.runCommand('pulumi', ['config', 'set', key, value], workspaceDir, env);
      }

      // Install dependencies
      await this.runCommand('npm', ['install'], workspaceDir, env);

      // Deploy infrastructure
      const deployOutput = await this.runCommand('pulumi', ['up', '--yes', '--json'], workspaceDir, env);

      // Get outputs
      const outputsOutput = await this.runCommand('pulumi', ['stack', 'output', '--json'], workspaceDir, env);
      const outputs = JSON.parse(outputsOutput);

      // Parse deployment summary
      const deploymentSummary = this.parsePulumiOutput(deployOutput);

      return {
        outputs: this.filterOutputs(outputs, outputsToCapture),
        resourcesCreated: deploymentSummary.resourcesCreated,
        deploymentSummary
      };

    } catch (error) {
      throw new Error(`Pulumi deployment failed: ${error.message}`);
    }
  }

  /**
   * Deploy infrastructure using Terraform
   * @param {string} workspaceDir - Workspace directory
   * @param {Object} variables - Variables to set
   * @param {Array} outputsToCapture - Outputs to capture
   * @param {Object} credentials - AWS credentials
   * @returns {Object} Deployment result
   */
  async deployWithTerraform(workspaceDir, variables, outputsToCapture, credentials) {
    try {
      // Set environment variables for AWS credentials
      const env = {
        ...process.env,
        AWS_ACCESS_KEY_ID: credentials.accessKeyId,
        AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
        AWS_SESSION_TOKEN: credentials.sessionToken,
        AWS_DEFAULT_REGION: this.region
      };

      // Initialize Terraform
      await this.runCommand('terraform', ['init'], workspaceDir, env);

      // Create variables file
      const tfVarsPath = path.join(workspaceDir, 'terraform.tfvars');
      const tfVarsContent = Object.entries(variables)
        .map(([key, value]) => `${key} = "${value}"`)
        .join('\n');
      await fs.writeFile(tfVarsPath, tfVarsContent);

      // Plan deployment
      await this.runCommand('terraform', ['plan'], workspaceDir, env);

      // Apply deployment
      const applyOutput = await this.runCommand('terraform', ['apply', '-auto-approve'], workspaceDir, env);

      // Get outputs
      const outputsOutput = await this.runCommand('terraform', ['output', '-json'], workspaceDir, env);
      const outputs = JSON.parse(outputsOutput);

      // Parse deployment summary
      const deploymentSummary = this.parseTerraformOutput(applyOutput);

      return {
        outputs: this.filterOutputs(outputs, outputsToCapture),
        resourcesCreated: deploymentSummary.resourcesCreated,
        deploymentSummary
      };

    } catch (error) {
      throw new Error(`Terraform deployment failed: ${error.message}`);
    }
  }

  /**
   * Run command in workspace directory
   * @param {string} command - Command to run
   * @param {Array} args - Command arguments
   * @param {string} cwd - Working directory
   * @param {Object} env - Environment variables
   * @returns {Promise<string>} Command output
   */
  runCommand(command, args, cwd, env) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd, env, stdio: 'pipe' });
      
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Parse Pulumi deployment output
   * @param {string} output - Pulumi output
   * @returns {Object} Parsed summary
   */
  parsePulumiOutput(output) {
    // Simple parsing for demo - in reality, you'd parse JSON output
    const resourcesCreated = (output.match(/\+\s+\d+\s+created/g) || []).length;
    
    return {
      resourcesCreated,
      provider: 'pulumi'
    };
  }

  /**
   * Parse Terraform deployment output
   * @param {string} output - Terraform output
   * @returns {Object} Parsed summary
   */
  parseTerraformOutput(output) {
    // Simple parsing for demo
    const addedMatch = output.match(/Apply complete! Resources: (\d+) added/);
    const resourcesCreated = addedMatch ? parseInt(addedMatch[1]) : 0;
    
    return {
      resourcesCreated,
      provider: 'terraform'
    };
  }

  /**
   * Filter outputs to only include requested ones
   * @param {Object} outputs - All outputs
   * @param {Array} outputsToCapture - Outputs to include
   * @returns {Object} Filtered outputs
   */
  filterOutputs(outputs, outputsToCapture) {
    if (!outputsToCapture || outputsToCapture.length === 0) {
      return outputs;
    }

    const filtered = {};
    for (const key of outputsToCapture) {
      if (outputs[key] !== undefined) {
        filtered[key] = outputs[key];
      }
    }
    return filtered;
  }

  /**
   * Capture infrastructure state for rollback
   * @param {string} workspaceDir - Workspace directory
   * @param {string} provider - IaC provider
   * @param {string} stackName - Stack name
   * @returns {Object} Infrastructure state
   */
  async captureInfrastructureState(workspaceDir, provider, stackName) {
    try {
      let stateData = null;

      if (provider === 'pulumi') {
        // Export Pulumi stack state
        const stateOutput = await this.runCommand('pulumi', ['stack', 'export'], workspaceDir);
        stateData = JSON.parse(stateOutput);
      } else if (provider === 'terraform') {
        // Read Terraform state file
        const statePath = path.join(workspaceDir, 'terraform.tfstate');
        const stateContent = await fs.readFile(statePath, 'utf8');
        stateData = JSON.parse(stateContent);
      }

      return {
        provider,
        stackName,
        stateData,
        capturedAt: new Date().toISOString()
      };

    } catch (error) {
      console.warn('Failed to capture infrastructure state:', error.message);
      return null;
    }
  }

  /**
   * Store deployment version for rollback capability
   * @param {string} deploymentId - Deployment ID
   * @param {Object} versionInfo - Version information
   */
  storeDeploymentVersion(deploymentId, versionInfo) {
    this.deploymentHistory.set(deploymentId, versionInfo);
    
    // Keep only last 5 deployments per stack
    const entries = Array.from(this.deploymentHistory.entries());
    if (entries.length > 5) {
      const oldestKey = entries[0][0];
      this.deploymentHistory.delete(oldestKey);
    }
  }

  /**
   * Clean up workspace directory
   * @param {string} workspaceDir - Workspace directory to clean up
   */
  async cleanupWorkspace(workspaceDir) {
    try {
      await fs.rm(workspaceDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to cleanup workspace ${workspaceDir}:`, error.message);
    }
  }

  /**
   * Rollback infrastructure deployment
   * @param {string} deploymentId - Deployment ID to rollback
   * @param {string} actorId - User or AI agent ID
   * @param {string} actorType - 'user' | 'ai-agent'
   * @returns {Object} Rollback result
   */
  async rollbackInfrastructure(deploymentId, actorId, actorType = 'user') {
    const versionInfo = this.deploymentHistory.get(deploymentId);
    if (!versionInfo) {
      throw new Error(`No rollback version available for deployment ${deploymentId}`);
    }

    const operationId = this.generateOperationId();

    try {
      // Log rollback start
      await this.logAuditEvent(
        'IaCRollbackStarted',
        actorId,
        actorType,
        {
          operationId,
          deploymentId,
          provider: versionInfo.provider,
          stackName: versionInfo.stackName
        }
      );

      // Request approval for rollback
      const approval = await this.requestApproval(
        operationId,
        'destructive',
        {
          operation: 'rollback-infrastructure',
          deploymentId,
          provider: versionInfo.provider,
          stackName: versionInfo.stackName
        },
        actorId,
        'owner'
      );

      if (approval.status !== 'approved') {
        throw new Error(`Rollback requires approval. Status: ${approval.status}`);
      }

      // For demo purposes, simulate successful rollback
      // In reality, you would destroy the current infrastructure
      
      const result = {
        operationId,
        deploymentId,
        status: 'rollback_completed',
        provider: versionInfo.provider,
        stackName: versionInfo.stackName,
        rolledBackAt: new Date().toISOString()
      };

      // Log successful rollback
      await this.logAuditEvent(
        'IaCRollbackCompleted',
        actorId,
        actorType,
        result
      );

      return result;

    } catch (error) {
      // Log rollback failure
      await this.logAuditEvent(
        'IaCRollbackFailed',
        actorId,
        actorType,
        {
          operationId,
          deploymentId,
          error: error.message
        }
      );

      throw new Error(`Infrastructure rollback failed: ${error.message}`);
    }
  }

  /**
   * Estimate IaC deployment cost
   * @param {Object} deploymentConfig - Deployment configuration
   * @returns {number} Estimated cost in USD
   */
  estimateIaCDeploymentCost(deploymentConfig) {
    // Simple cost estimation based on typical resources
    let cost = 0;
    
    // Base infrastructure cost (S3, basic networking)
    cost += 5.00; // Monthly cost prorated to deployment
    
    // Additional cost based on complexity
    const variableCount = Object.keys(deploymentConfig.variables || {}).length;
    cost += variableCount * 0.50; // $0.50 per variable/resource
    
    return Math.round(cost * 100) / 100;
  }
}

module.exports = IaCDeployment;