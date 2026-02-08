/**
 * Deployment Status Tracker
 * Tracks and manages AWS deployment status for builds
 */

class DeploymentStatusTracker {
  constructor() {
    this.deployments = new Map();
  }

  /**
   * Create a new deployment tracking entry
   * @param {string} buildId - Build identifier
   * @param {string} deploymentType - Type of deployment (s3-cloudfront, ecs-fargate, lambda-apigateway)
   * @param {Object} config - Deployment configuration
   * @returns {Object} Deployment tracking object
   */
  createDeployment(buildId, deploymentType, config = {}) {
    const deployment = {
      buildId,
      type: deploymentType,
      status: 'pending',
      progress: 0,
      resources: {},
      config,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stages: this.getDeploymentStages(deploymentType),
      currentStage: null,
      error: null,
      appUrl: null
    };

    this.deployments.set(buildId, deployment);
    return deployment;
  }

  /**
   * Get deployment stages based on type
   * @param {string} deploymentType - Type of deployment
   * @returns {Array} Array of deployment stages
   */
  getDeploymentStages(deploymentType) {
    const stagesByType = {
      's3-cloudfront': [
        { id: 'creating_bucket', label: 'Creating S3 Bucket', status: 'pending' },
        { id: 'uploading_files', label: 'Uploading Files', status: 'pending' },
        { id: 'creating_distribution', label: 'Creating CloudFront Distribution', status: 'pending' },
        { id: 'configuring_dns', label: 'Configuring DNS', status: 'pending' },
        { id: 'validating', label: 'Validating Deployment', status: 'pending' }
      ],
      'ecs-fargate': [
        { id: 'creating_cluster', label: 'Creating ECS Cluster', status: 'pending' },
        { id: 'building_image', label: 'Building Docker Image', status: 'pending' },
        { id: 'pushing_ecr', label: 'Pushing to ECR', status: 'pending' },
        { id: 'creating_service', label: 'Creating ECS Service', status: 'pending' },
        { id: 'configuring_lb', label: 'Configuring Load Balancer', status: 'pending' },
        { id: 'validating', label: 'Validating Deployment', status: 'pending' }
      ],
      'lambda-apigateway': [
        { id: 'creating_lambda', label: 'Creating Lambda Function', status: 'pending' },
        { id: 'uploading_code', label: 'Uploading Code', status: 'pending' },
        { id: 'creating_api', label: 'Creating API Gateway', status: 'pending' },
        { id: 'configuring_routes', label: 'Configuring Routes', status: 'pending' },
        { id: 'validating', label: 'Validating Deployment', status: 'pending' }
      ]
    };

    return stagesByType[deploymentType] || [];
  }

  /**
   * Update deployment status
   * @param {string} buildId - Build identifier
   * @param {string} status - New status
   * @param {Object} updates - Additional updates
   * @returns {Object} Updated deployment
   */
  updateDeploymentStatus(buildId, status, updates = {}) {
    const deployment = this.deployments.get(buildId);
    if (!deployment) {
      throw new Error(`Deployment not found for build ${buildId}`);
    }

    deployment.status = status;
    deployment.updatedAt = new Date().toISOString();

    // Update progress based on status
    if (status === 'creating_infrastructure') {
      deployment.progress = 20;
    } else if (status === 'deploying') {
      deployment.progress = 50;
    } else if (status === 'deployed') {
      deployment.progress = 100;
      deployment.completedAt = new Date().toISOString();
    } else if (status === 'failed') {
      deployment.progress = deployment.progress; // Keep current progress
      deployment.failedAt = new Date().toISOString();
    }

    // Apply additional updates
    Object.assign(deployment, updates);

    this.deployments.set(buildId, deployment);
    return deployment;
  }

  /**
   * Update deployment stage status
   * @param {string} buildId - Build identifier
   * @param {string} stageId - Stage identifier
   * @param {string} status - New status
   * @param {Object} data - Additional stage data
   * @returns {Object} Updated deployment
   */
  updateStageStatus(buildId, stageId, status, data = {}) {
    const deployment = this.deployments.get(buildId);
    if (!deployment) {
      throw new Error(`Deployment not found for build ${buildId}`);
    }

    const stage = deployment.stages.find(s => s.id === stageId);
    if (!stage) {
      throw new Error(`Stage ${stageId} not found in deployment`);
    }

    stage.status = status;
    stage.updatedAt = new Date().toISOString();
    Object.assign(stage, data);

    deployment.currentStage = stageId;
    deployment.updatedAt = new Date().toISOString();

    // Calculate overall progress based on completed stages
    const completedStages = deployment.stages.filter(s => 
      ['done', 'completed', 'success'].includes(s.status)
    ).length;
    deployment.progress = Math.round((completedStages / deployment.stages.length) * 100);

    this.deployments.set(buildId, deployment);
    return deployment;
  }

  /**
   * Add resource to deployment
   * @param {string} buildId - Build identifier
   * @param {string} resourceType - Type of resource (s3Bucket, cloudFrontDistribution, etc.)
   * @param {Object} resourceData - Resource data
   * @returns {Object} Updated deployment
   */
  addResource(buildId, resourceType, resourceData) {
    const deployment = this.deployments.get(buildId);
    if (!deployment) {
      throw new Error(`Deployment not found for build ${buildId}`);
    }

    deployment.resources[resourceType] = resourceData;
    deployment.updatedAt = new Date().toISOString();

    this.deployments.set(buildId, deployment);
    return deployment;
  }

  /**
   * Set deployment error
   * @param {string} buildId - Build identifier
   * @param {string} error - Error message
   * @param {Object} errorDetails - Additional error details
   * @returns {Object} Updated deployment
   */
  setDeploymentError(buildId, error, errorDetails = {}) {
    const deployment = this.deployments.get(buildId);
    if (!deployment) {
      throw new Error(`Deployment not found for build ${buildId}`);
    }

    deployment.status = 'failed';
    deployment.error = error;
    deployment.errorDetails = errorDetails;
    deployment.failedAt = new Date().toISOString();
    deployment.updatedAt = new Date().toISOString();

    this.deployments.set(buildId, deployment);
    return deployment;
  }

  /**
   * Set deployment app URL
   * @param {string} buildId - Build identifier
   * @param {string} appUrl - Application URL
   * @returns {Object} Updated deployment
   */
  setAppUrl(buildId, appUrl) {
    const deployment = this.deployments.get(buildId);
    if (!deployment) {
      throw new Error(`Deployment not found for build ${buildId}`);
    }

    deployment.appUrl = appUrl;
    deployment.updatedAt = new Date().toISOString();

    this.deployments.set(buildId, deployment);
    return deployment;
  }

  /**
   * Get deployment by build ID
   * @param {string} buildId - Build identifier
   * @returns {Object|null} Deployment object or null
   */
  getDeployment(buildId) {
    return this.deployments.get(buildId) || null;
  }

  /**
   * Get all deployments
   * @returns {Array} Array of all deployments
   */
  getAllDeployments() {
    return Array.from(this.deployments.values());
  }

  /**
   * Delete deployment
   * @param {string} buildId - Build identifier
   * @returns {boolean} True if deleted
   */
  deleteDeployment(buildId) {
    return this.deployments.delete(buildId);
  }

  /**
   * Clear all deployments
   */
  clearAll() {
    this.deployments.clear();
  }
}

// Singleton instance
const deploymentStatusTracker = new DeploymentStatusTracker();

module.exports = deploymentStatusTracker;
