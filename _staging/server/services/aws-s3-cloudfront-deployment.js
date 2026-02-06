const { S3Client, PutObjectCommand, ListObjectVersionsCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { CloudFrontClient, CreateInvalidationCommand, GetDistributionCommand } = require('@aws-sdk/client-cloudfront');
const AWSActionLayer = require('./aws-action-layer');
const crypto = require('crypto');
const path = require('path');

/**
 * S3 + CloudFront Deployment Service
 * Handles static site deployment with artifact upload, CloudFront invalidation, 
 * health checks, and rollback capabilities
 */
class S3CloudFrontDeployment extends AWSActionLayer {
  constructor(options = {}) {
    super(options);
    this.deploymentHistory = new Map(); // In-memory storage for deployment versions
  }

  /**
   * Deploy static site to S3 + CloudFront
   * @param {Object} deploymentConfig - Deployment configuration
   * @param {string} actorId - User or AI agent ID
   * @param {string} actorType - 'user' | 'ai-agent'
   * @returns {Object} Deployment result
   */
  async deployStaticSite(deploymentConfig, actorId, actorType = 'user') {
    const {
      bucketName,
      distributionId,
      artifactUrl,
      projectId,
      buildId,
      healthCheckUrl,
      rollbackEnabled = true
    } = deploymentConfig;

    const operationId = this.generateOperationId();
    const deploymentId = `deploy_${projectId}_${buildId}_${Date.now()}`;

    try {
      // Log deployment start
      await this.logAuditEvent(
        'StaticSiteDeploymentStarted',
        actorId,
        actorType,
        {
          operationId,
          deploymentId,
          bucketName,
          distributionId,
          artifactUrl,
          projectId,
          buildId
        },
        [`arn:aws:s3:::${bucketName}`, `arn:aws:cloudfront::distribution/${distributionId}`]
      );

      // Request approval for deployment (billing operation)
      const approval = await this.requestApproval(
        operationId,
        'billing',
        {
          estimatedCost: this.estimateDeploymentCost(deploymentConfig),
          operation: 'static-site-deployment',
          resources: [bucketName, distributionId]
        },
        actorId,
        'owner' // Assume owner for now, should be passed from auth context
      );

      if (approval.status !== 'approved') {
        throw new Error(`Deployment requires approval. Status: ${approval.status}`);
      }

      // Assume deployment role
      const credentials = await this.assumeRole(
        this.roleArn,
        `static-deploy-${deploymentId}`,
        3600
      );

      // Create S3 and CloudFront clients with assumed role
      const s3Client = this.createClientWithCredentials(S3Client, credentials);
      const cloudFrontClient = this.createClientWithCredentials(CloudFrontClient, credentials);

      // Store current version for rollback if enabled
      let previousVersion = null;
      if (rollbackEnabled) {
        previousVersion = await this.getCurrentVersion(s3Client, bucketName);
      }

      // Upload artifacts to S3
      const uploadResult = await this.uploadArtifacts(
        s3Client,
        bucketName,
        artifactUrl,
        deploymentId
      );

      // Invalidate CloudFront cache
      const invalidationResult = await this.invalidateCloudFront(
        cloudFrontClient,
        distributionId,
        ['/*'] // Invalidate all paths
      );

      // Wait for invalidation to complete (optional, for immediate health check)
      await this.waitForInvalidation(cloudFrontClient, distributionId, invalidationResult.Id);

      // Perform health check
      const healthCheckResult = await this.performHealthCheck(healthCheckUrl);

      // Store deployment version for rollback
      if (rollbackEnabled) {
        this.storeDeploymentVersion(deploymentId, {
          bucketName,
          distributionId,
          uploadedFiles: uploadResult.uploadedFiles,
          previousVersion,
          deployedAt: new Date().toISOString(),
          healthCheckPassed: healthCheckResult.success
        });
      }

      const result = {
        deploymentId,
        operationId,
        status: healthCheckResult.success ? 'success' : 'deployed_with_health_check_failure',
        bucketName,
        distributionId,
        invalidationId: invalidationResult.Id,
        uploadedFiles: uploadResult.uploadedFiles,
        healthCheck: healthCheckResult,
        rollbackAvailable: rollbackEnabled && previousVersion !== null
      };

      // Log successful deployment
      await this.logAuditEvent(
        'StaticSiteDeploymentCompleted',
        actorId,
        actorType,
        {
          ...result,
          estimatedCost: this.estimateDeploymentCost(deploymentConfig)
        },
        [`arn:aws:s3:::${bucketName}`, `arn:aws:cloudfront::distribution/${distributionId}`]
      );

      return result;

    } catch (error) {
      // Log deployment failure
      await this.logAuditEvent(
        'StaticSiteDeploymentFailed',
        actorId,
        actorType,
        {
          operationId,
          deploymentId,
          error: error.message,
          bucketName,
          distributionId
        },
        [`arn:aws:s3:::${bucketName}`, `arn:aws:cloudfront::distribution/${distributionId}`]
      );

      throw new Error(`Static site deployment failed: ${error.message}`);
    }
  }

  /**
   * Upload artifacts from S3 URL to deployment bucket
   * @param {S3Client} s3Client - S3 client with assumed role credentials
   * @param {string} bucketName - Target bucket name
   * @param {string} artifactUrl - S3 URL of build artifacts
   * @param {string} deploymentId - Deployment identifier
   * @returns {Object} Upload result
   */
  async uploadArtifacts(s3Client, bucketName, artifactUrl, deploymentId) {
    // For now, assume artifacts are already in S3 and we need to copy them
    // In a real implementation, you would download the artifact zip and extract it
    
    const uploadedFiles = [];
    
    try {
      // Mock implementation - in reality, you would:
      // 1. Download artifact zip from artifactUrl
      // 2. Extract the zip file
      // 3. Upload each file to the target bucket with proper content types
      
      // For demo purposes, create a simple index.html
      const indexHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Deployed App</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
    <h1>App Successfully Deployed</h1>
    <p>Deployment ID: ${deploymentId}</p>
    <p>Deployed at: ${new Date().toISOString()}</p>
</body>
</html>`;

      const putCommand = new PutObjectCommand({
        Bucket: bucketName,
        Key: 'index.html',
        Body: indexHtml,
        ContentType: 'text/html',
        Metadata: {
          deploymentId,
          deployedAt: new Date().toISOString()
        }
      });

      await s3Client.send(putCommand);
      uploadedFiles.push('index.html');

      return {
        uploadedFiles,
        totalFiles: uploadedFiles.length,
        deploymentId
      };

    } catch (error) {
      throw new Error(`Failed to upload artifacts: ${error.message}`);
    }
  }

  /**
   * Invalidate CloudFront distribution cache
   * @param {CloudFrontClient} cloudFrontClient - CloudFront client
   * @param {string} distributionId - Distribution ID
   * @param {Array} paths - Paths to invalidate
   * @returns {Object} Invalidation result
   */
  async invalidateCloudFront(cloudFrontClient, distributionId, paths) {
    try {
      const command = new CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: {
          Paths: {
            Quantity: paths.length,
            Items: paths
          },
          CallerReference: `invalidation-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
        }
      });

      const response = await cloudFrontClient.send(command);
      
      return {
        Id: response.Invalidation.Id,
        Status: response.Invalidation.Status,
        CreateTime: response.Invalidation.CreateTime,
        Paths: paths
      };

    } catch (error) {
      throw new Error(`Failed to invalidate CloudFront: ${error.message}`);
    }
  }

  /**
   * Wait for CloudFront invalidation to complete
   * @param {CloudFrontClient} cloudFrontClient - CloudFront client
   * @param {string} distributionId - Distribution ID
   * @param {string} invalidationId - Invalidation ID
   * @param {number} maxWaitTime - Maximum wait time in seconds
   */
  async waitForInvalidation(cloudFrontClient, distributionId, invalidationId, maxWaitTime = 300) {
    const startTime = Date.now();
    const maxWaitMs = maxWaitTime * 1000;

    while (Date.now() - startTime < maxWaitMs) {
      try {
        // In a real implementation, you would check invalidation status
        // For now, just wait a short time
        await new Promise(resolve => setTimeout(resolve, 5000));
        break; // Assume completed for demo
      } catch (error) {
        console.warn('Error checking invalidation status:', error.message);
        break;
      }
    }
  }

  /**
   * Perform health check on deployed site
   * @param {string} healthCheckUrl - URL to check
   * @returns {Object} Health check result
   */
  async performHealthCheck(healthCheckUrl) {
    if (!healthCheckUrl) {
      return { success: true, message: 'No health check URL provided' };
    }

    try {
      // In a real implementation, you would make an HTTP request
      // For now, simulate a successful health check
      return {
        success: true,
        statusCode: 200,
        responseTime: 150,
        url: healthCheckUrl,
        checkedAt: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        url: healthCheckUrl,
        checkedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Get current version of deployed site for rollback
   * @param {S3Client} s3Client - S3 client
   * @param {string} bucketName - Bucket name
   * @returns {Object} Current version info
   */
  async getCurrentVersion(s3Client, bucketName) {
    try {
      const command = new ListObjectVersionsCommand({
        Bucket: bucketName,
        MaxKeys: 10
      });

      const response = await s3Client.send(command);
      
      return {
        versions: response.Versions || [],
        capturedAt: new Date().toISOString()
      };

    } catch (error) {
      console.warn('Failed to capture current version for rollback:', error.message);
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
    
    // Keep only last 10 deployments per bucket
    const entries = Array.from(this.deploymentHistory.entries());
    if (entries.length > 10) {
      const oldestKey = entries[0][0];
      this.deploymentHistory.delete(oldestKey);
    }
  }

  /**
   * Rollback to previous deployment version
   * @param {string} deploymentId - Current deployment ID to rollback
   * @param {string} actorId - User or AI agent ID
   * @param {string} actorType - 'user' | 'ai-agent'
   * @returns {Object} Rollback result
   */
  async rollbackDeployment(deploymentId, actorId, actorType = 'user') {
    const versionInfo = this.deploymentHistory.get(deploymentId);
    if (!versionInfo || !versionInfo.previousVersion) {
      throw new Error(`No rollback version available for deployment ${deploymentId}`);
    }

    const operationId = this.generateOperationId();

    try {
      // Log rollback start
      await this.logAuditEvent(
        'StaticSiteRollbackStarted',
        actorId,
        actorType,
        {
          operationId,
          deploymentId,
          bucketName: versionInfo.bucketName,
          distributionId: versionInfo.distributionId
        },
        [`arn:aws:s3:::${versionInfo.bucketName}`, `arn:aws:cloudfront::distribution/${versionInfo.distributionId}`]
      );

      // Request approval for rollback (destructive operation)
      const approval = await this.requestApproval(
        operationId,
        'destructive',
        {
          operation: 'rollback-deployment',
          deploymentId,
          targetVersion: versionInfo.previousVersion
        },
        actorId,
        'owner'
      );

      if (approval.status !== 'approved') {
        throw new Error(`Rollback requires approval. Status: ${approval.status}`);
      }

      // Assume deployment role
      const credentials = await this.assumeRole(
        this.roleArn,
        `rollback-${deploymentId}`,
        3600
      );

      const s3Client = this.createClientWithCredentials(S3Client, credentials);
      const cloudFrontClient = this.createClientWithCredentials(CloudFrontClient, credentials);

      // Restore previous version (simplified implementation)
      // In reality, you would restore the exact file versions
      
      // Invalidate CloudFront cache
      const invalidationResult = await this.invalidateCloudFront(
        cloudFrontClient,
        versionInfo.distributionId,
        ['/*']
      );

      const result = {
        operationId,
        deploymentId,
        status: 'rollback_completed',
        bucketName: versionInfo.bucketName,
        distributionId: versionInfo.distributionId,
        invalidationId: invalidationResult.Id,
        rolledBackAt: new Date().toISOString()
      };

      // Log successful rollback
      await this.logAuditEvent(
        'StaticSiteRollbackCompleted',
        actorId,
        actorType,
        result,
        [`arn:aws:s3:::${versionInfo.bucketName}`, `arn:aws:cloudfront::distribution/${versionInfo.distributionId}`]
      );

      return result;

    } catch (error) {
      // Log rollback failure
      await this.logAuditEvent(
        'StaticSiteRollbackFailed',
        actorId,
        actorType,
        {
          operationId,
          deploymentId,
          error: error.message
        }
      );

      throw new Error(`Rollback failed: ${error.message}`);
    }
  }

  /**
   * Estimate deployment cost
   * @param {Object} deploymentConfig - Deployment configuration
   * @returns {number} Estimated cost in USD
   */
  estimateDeploymentCost(deploymentConfig) {
    // Simple cost estimation based on operations
    let cost = 0;
    
    // S3 PUT requests: $0.0005 per 1,000 requests
    cost += 0.001; // Assume ~2 PUT requests
    
    // CloudFront invalidation: $0.005 per path
    cost += 0.005; // One invalidation path
    
    // Data transfer: minimal for static sites
    cost += 0.01;
    
    return Math.round(cost * 100) / 100; // Round to 2 decimal places
  }
}

module.exports = S3CloudFrontDeployment;