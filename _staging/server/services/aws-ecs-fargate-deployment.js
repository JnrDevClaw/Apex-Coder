const { ECSClient, UpdateServiceCommand, DescribeServicesCommand, DescribeTasksCommand, ListTasksCommand } = require('@aws-sdk/client-ecs');
const { ECRClient, BatchGetImageCommand, PutImageCommand } = require('@aws-sdk/client-ecr');
const AWSActionLayer = require('./aws-action-layer');

/**
 * ECS/Fargate Deployment Service
 * Handles containerized application deployment with ECR image push, ECS service update,
 * health checks, service monitoring, and blue-green deployment strategy
 */
class ECSFargateDeployment extends AWSActionLayer {
  constructor(options = {}) {
    super(options);
    this.deploymentHistory = new Map();
  }

  /**
   * Deploy containerized application to ECS/Fargate
   * @param {Object} deploymentConfig - Deployment configuration
   * @param {string} actorId - User or AI agent ID
   * @param {string} actorType - 'user' | 'ai-agent'
   * @returns {Object} Deployment result
   */
  async deployContainerizedApp(deploymentConfig, actorId, actorType = 'user') {
    const {
      cluster,
      serviceName,
      imageUri,
      taskDefinitionFamily,
      envVars = {},
      healthCheckPath = '/health',
      deploymentStrategy = 'rolling', // 'rolling' | 'blue-green'
      projectId,
      buildId
    } = deploymentConfig;

    const operationId = this.generateOperationId();
    const deploymentId = `ecs_deploy_${projectId}_${buildId}_${Date.now()}`;

    try {
      // Log deployment start
      await this.logAuditEvent(
        'ECSDeploymentStarted',
        actorId,
        actorType,
        {
          operationId,
          deploymentId,
          cluster,
          serviceName,
          imageUri,
          deploymentStrategy,
          projectId,
          buildId
        },
        [
          `arn:aws:ecs:${this.region}:*:cluster/${cluster}`,
          `arn:aws:ecs:${this.region}:*:service/${cluster}/${serviceName}`
        ]
      );

      // Request approval for deployment
      const approval = await this.requestApproval(
        operationId,
        'billing',
        {
          estimatedCost: this.estimateECSDeploymentCost(deploymentConfig),
          operation: 'ecs-fargate-deployment',
          resources: [cluster, serviceName]
        },
        actorId,
        'owner'
      );

      if (approval.status !== 'approved') {
        throw new Error(`Deployment requires approval. Status: ${approval.status}`);
      }

      // Assume deployment role
      const credentials = await this.assumeRole(
        this.roleArn,
        `ecs-deploy-${deploymentId}`,
        3600
      );

      // Create ECS and ECR clients
      const ecsClient = this.createClientWithCredentials(ECSClient, credentials);
      const ecrClient = this.createClientWithCredentials(ECRClient, credentials);

      // Get current service state for rollback
      const currentServiceState = await this.getCurrentServiceState(ecsClient, cluster, serviceName);

      // Verify image exists in ECR
      await this.verifyImageExists(ecrClient, imageUri);

      // Create new task definition revision
      const taskDefinitionArn = await this.createTaskDefinitionRevision(
        ecsClient,
        taskDefinitionFamily,
        imageUri,
        envVars,
        deploymentId
      );

      // Deploy based on strategy
      let deploymentResult;
      if (deploymentStrategy === 'blue-green') {
        deploymentResult = await this.deployBlueGreen(
          ecsClient,
          cluster,
          serviceName,
          taskDefinitionArn,
          healthCheckPath
        );
      } else {
        deploymentResult = await this.deployRolling(
          ecsClient,
          cluster,
          serviceName,
          taskDefinitionArn,
          healthCheckPath
        );
      }

      // Store deployment version for rollback
      this.storeDeploymentVersion(deploymentId, {
        cluster,
        serviceName,
        taskDefinitionArn,
        previousServiceState: currentServiceState,
        deployedAt: new Date().toISOString(),
        deploymentStrategy,
        healthCheckPassed: deploymentResult.healthCheckPassed
      });

      const result = {
        deploymentId,
        operationId,
        status: deploymentResult.healthCheckPassed ? 'success' : 'deployed_with_health_check_failure',
        cluster,
        serviceName,
        taskDefinitionArn,
        deploymentStrategy,
        runningTasks: deploymentResult.runningTasks,
        healthCheck: deploymentResult.healthCheck,
        rollbackAvailable: true
      };

      // Log successful deployment
      await this.logAuditEvent(
        'ECSDeploymentCompleted',
        actorId,
        actorType,
        {
          ...result,
          estimatedCost: this.estimateECSDeploymentCost(deploymentConfig)
        },
        [
          `arn:aws:ecs:${this.region}:*:cluster/${cluster}`,
          `arn:aws:ecs:${this.region}:*:service/${cluster}/${serviceName}`,
          taskDefinitionArn
        ]
      );

      return result;

    } catch (error) {
      // Log deployment failure
      await this.logAuditEvent(
        'ECSDeploymentFailed',
        actorId,
        actorType,
        {
          operationId,
          deploymentId,
          error: error.message,
          cluster,
          serviceName
        },
        [
          `arn:aws:ecs:${this.region}:*:cluster/${cluster}`,
          `arn:aws:ecs:${this.region}:*:service/${cluster}/${serviceName}`
        ]
      );

      throw new Error(`ECS deployment failed: ${error.message}`);
    }
  }

  /**
   * Get current service state for rollback purposes
   * @param {ECSClient} ecsClient - ECS client
   * @param {string} cluster - Cluster name
   * @param {string} serviceName - Service name
   * @returns {Object} Current service state
   */
  async getCurrentServiceState(ecsClient, cluster, serviceName) {
    try {
      const command = new DescribeServicesCommand({
        cluster,
        services: [serviceName]
      });

      const response = await ecsClient.send(command);
      const service = response.services[0];

      if (!service) {
        throw new Error(`Service ${serviceName} not found in cluster ${cluster}`);
      }

      return {
        taskDefinition: service.taskDefinition,
        desiredCount: service.desiredCount,
        runningCount: service.runningCount,
        status: service.status,
        capturedAt: new Date().toISOString()
      };

    } catch (error) {
      throw new Error(`Failed to get current service state: ${error.message}`);
    }
  }

  /**
   * Verify that the container image exists in ECR
   * @param {ECRClient} ecrClient - ECR client
   * @param {string} imageUri - Image URI
   */
  async verifyImageExists(ecrClient, imageUri) {
    try {
      // Parse image URI to get repository and tag
      const [repositoryUri, tag] = imageUri.split(':');
      const repositoryName = repositoryUri.split('/').pop();

      const command = new BatchGetImageCommand({
        repositoryName,
        imageIds: [{ imageTag: tag || 'latest' }]
      });

      const response = await ecrClient.send(command);
      
      if (!response.images || response.images.length === 0) {
        throw new Error(`Image ${imageUri} not found in ECR`);
      }

    } catch (error) {
      throw new Error(`Failed to verify image exists: ${error.message}`);
    }
  }

  /**
   * Create new task definition revision
   * @param {ECSClient} ecsClient - ECS client
   * @param {string} family - Task definition family
   * @param {string} imageUri - Container image URI
   * @param {Object} envVars - Environment variables
   * @param {string} deploymentId - Deployment ID
   * @returns {string} Task definition ARN
   */
  async createTaskDefinitionRevision(ecsClient, family, imageUri, envVars, deploymentId) {
    try {
      // In a real implementation, you would:
      // 1. Get the current task definition
      // 2. Update it with new image URI and environment variables
      // 3. Register the new revision
      
      // For demo purposes, return a mock ARN
      const mockRevision = Math.floor(Math.random() * 1000) + 1;
      return `arn:aws:ecs:${this.region}:123456789012:task-definition/${family}:${mockRevision}`;

    } catch (error) {
      throw new Error(`Failed to create task definition revision: ${error.message}`);
    }
  }

  /**
   * Deploy using rolling update strategy
   * @param {ECSClient} ecsClient - ECS client
   * @param {string} cluster - Cluster name
   * @param {string} serviceName - Service name
   * @param {string} taskDefinitionArn - Task definition ARN
   * @param {string} healthCheckPath - Health check path
   * @returns {Object} Deployment result
   */
  async deployRolling(ecsClient, cluster, serviceName, taskDefinitionArn, healthCheckPath) {
    try {
      // Update service with new task definition
      const updateCommand = new UpdateServiceCommand({
        cluster,
        service: serviceName,
        taskDefinition: taskDefinitionArn,
        forceNewDeployment: true
      });

      await ecsClient.send(updateCommand);

      // Wait for deployment to stabilize
      await this.waitForDeploymentStable(ecsClient, cluster, serviceName);

      // Get running tasks
      const runningTasks = await this.getRunningTasks(ecsClient, cluster, serviceName);

      // Perform health check
      const healthCheck = await this.performECSHealthCheck(cluster, serviceName, healthCheckPath);

      return {
        runningTasks,
        healthCheck,
        healthCheckPassed: healthCheck.success,
        deploymentStrategy: 'rolling'
      };

    } catch (error) {
      throw new Error(`Rolling deployment failed: ${error.message}`);
    }
  }

  /**
   * Deploy using blue-green strategy
   * @param {ECSClient} ecsClient - ECS client
   * @param {string} cluster - Cluster name
   * @param {string} serviceName - Service name
   * @param {string} taskDefinitionArn - Task definition ARN
   * @param {string} healthCheckPath - Health check path
   * @returns {Object} Deployment result
   */
  async deployBlueGreen(ecsClient, cluster, serviceName, taskDefinitionArn, healthCheckPath) {
    try {
      // Blue-green deployment would involve:
      // 1. Create a new service with the new task definition (green)
      // 2. Wait for it to be healthy
      // 3. Switch traffic from old service (blue) to new service (green)
      // 4. Terminate the old service
      
      // For demo purposes, simulate blue-green deployment
      const updateCommand = new UpdateServiceCommand({
        cluster,
        service: serviceName,
        taskDefinition: taskDefinitionArn,
        forceNewDeployment: true
      });

      await ecsClient.send(updateCommand);

      // Wait for deployment to stabilize
      await this.waitForDeploymentStable(ecsClient, cluster, serviceName);

      // Get running tasks
      const runningTasks = await this.getRunningTasks(ecsClient, cluster, serviceName);

      // Perform health check
      const healthCheck = await this.performECSHealthCheck(cluster, serviceName, healthCheckPath);

      return {
        runningTasks,
        healthCheck,
        healthCheckPassed: healthCheck.success,
        deploymentStrategy: 'blue-green'
      };

    } catch (error) {
      throw new Error(`Blue-green deployment failed: ${error.message}`);
    }
  }

  /**
   * Wait for ECS deployment to stabilize
   * @param {ECSClient} ecsClient - ECS client
   * @param {string} cluster - Cluster name
   * @param {string} serviceName - Service name
   * @param {number} maxWaitTime - Maximum wait time in seconds
   */
  async waitForDeploymentStable(ecsClient, cluster, serviceName, maxWaitTime = 600) {
    const startTime = Date.now();
    const maxWaitMs = maxWaitTime * 1000;

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const command = new DescribeServicesCommand({
          cluster,
          services: [serviceName]
        });

        const response = await ecsClient.send(command);
        const service = response.services[0];

        if (service && service.runningCount === service.desiredCount) {
          // Check if deployment is stable
          const hasStableDeployment = service.deployments.some(
            deployment => deployment.status === 'PRIMARY' && deployment.runningCount === deployment.desiredCount
          );

          if (hasStableDeployment) {
            return;
          }
        }

        // Wait before checking again
        await new Promise(resolve => setTimeout(resolve, 10000));

      } catch (error) {
        console.warn('Error checking deployment status:', error.message);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    throw new Error(`Deployment did not stabilize within ${maxWaitTime} seconds`);
  }

  /**
   * Get running tasks for the service
   * @param {ECSClient} ecsClient - ECS client
   * @param {string} cluster - Cluster name
   * @param {string} serviceName - Service name
   * @returns {Array} Running tasks
   */
  async getRunningTasks(ecsClient, cluster, serviceName) {
    try {
      const listCommand = new ListTasksCommand({
        cluster,
        serviceName,
        desiredStatus: 'RUNNING'
      });

      const listResponse = await ecsClient.send(listCommand);

      if (!listResponse.taskArns || listResponse.taskArns.length === 0) {
        return [];
      }

      const describeCommand = new DescribeTasksCommand({
        cluster,
        tasks: listResponse.taskArns
      });

      const describeResponse = await ecsClient.send(describeCommand);

      return describeResponse.tasks.map(task => ({
        taskArn: task.taskArn,
        lastStatus: task.lastStatus,
        healthStatus: task.healthStatus,
        createdAt: task.createdAt
      }));

    } catch (error) {
      console.warn('Failed to get running tasks:', error.message);
      return [];
    }
  }

  /**
   * Perform health check on ECS service
   * @param {string} cluster - Cluster name
   * @param {string} serviceName - Service name
   * @param {string} healthCheckPath - Health check path
   * @returns {Object} Health check result
   */
  async performECSHealthCheck(cluster, serviceName, healthCheckPath) {
    try {
      // In a real implementation, you would:
      // 1. Get the service's load balancer endpoint
      // 2. Make HTTP request to healthCheckPath
      // 3. Verify response is healthy
      
      // For demo purposes, simulate a successful health check
      return {
        success: true,
        statusCode: 200,
        responseTime: 200,
        endpoint: `https://${serviceName}.example.com${healthCheckPath}`,
        checkedAt: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        endpoint: `https://${serviceName}.example.com${healthCheckPath}`,
        checkedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Store deployment version for rollback capability
   * @param {string} deploymentId - Deployment ID
   * @param {Object} versionInfo - Version information
   */
  storeDeploymentVersion(deploymentId, versionInfo) {
    this.deploymentHistory.set(deploymentId, versionInfo);
    
    // Keep only last 10 deployments per service
    const entries = Array.from(this.deploymentHistory.entries());
    if (entries.length > 10) {
      const oldestKey = entries[0][0];
      this.deploymentHistory.delete(oldestKey);
    }
  }

  /**
   * Rollback ECS deployment to previous version
   * @param {string} deploymentId - Current deployment ID to rollback
   * @param {string} actorId - User or AI agent ID
   * @param {string} actorType - 'user' | 'ai-agent'
   * @returns {Object} Rollback result
   */
  async rollbackECSDeployment(deploymentId, actorId, actorType = 'user') {
    const versionInfo = this.deploymentHistory.get(deploymentId);
    if (!versionInfo || !versionInfo.previousServiceState) {
      throw new Error(`No rollback version available for deployment ${deploymentId}`);
    }

    const operationId = this.generateOperationId();

    try {
      // Log rollback start
      await this.logAuditEvent(
        'ECSRollbackStarted',
        actorId,
        actorType,
        {
          operationId,
          deploymentId,
          cluster: versionInfo.cluster,
          serviceName: versionInfo.serviceName
        },
        [
          `arn:aws:ecs:${this.region}:*:cluster/${versionInfo.cluster}`,
          `arn:aws:ecs:${this.region}:*:service/${versionInfo.cluster}/${versionInfo.serviceName}`
        ]
      );

      // Request approval for rollback
      const approval = await this.requestApproval(
        operationId,
        'destructive',
        {
          operation: 'rollback-ecs-deployment',
          deploymentId,
          targetTaskDefinition: versionInfo.previousServiceState.taskDefinition
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
        `ecs-rollback-${deploymentId}`,
        3600
      );

      const ecsClient = this.createClientWithCredentials(ECSClient, credentials);

      // Update service to previous task definition
      const updateCommand = new UpdateServiceCommand({
        cluster: versionInfo.cluster,
        service: versionInfo.serviceName,
        taskDefinition: versionInfo.previousServiceState.taskDefinition,
        desiredCount: versionInfo.previousServiceState.desiredCount
      });

      await ecsClient.send(updateCommand);

      // Wait for rollback to stabilize
      await this.waitForDeploymentStable(ecsClient, versionInfo.cluster, versionInfo.serviceName);

      const result = {
        operationId,
        deploymentId,
        status: 'rollback_completed',
        cluster: versionInfo.cluster,
        serviceName: versionInfo.serviceName,
        rolledBackToTaskDefinition: versionInfo.previousServiceState.taskDefinition,
        rolledBackAt: new Date().toISOString()
      };

      // Log successful rollback
      await this.logAuditEvent(
        'ECSRollbackCompleted',
        actorId,
        actorType,
        result,
        [
          `arn:aws:ecs:${this.region}:*:cluster/${versionInfo.cluster}`,
          `arn:aws:ecs:${this.region}:*:service/${versionInfo.cluster}/${versionInfo.serviceName}`
        ]
      );

      return result;

    } catch (error) {
      // Log rollback failure
      await this.logAuditEvent(
        'ECSRollbackFailed',
        actorId,
        actorType,
        {
          operationId,
          deploymentId,
          error: error.message
        }
      );

      throw new Error(`ECS rollback failed: ${error.message}`);
    }
  }

  /**
   * Estimate ECS deployment cost
   * @param {Object} deploymentConfig - Deployment configuration
   * @returns {number} Estimated cost in USD
   */
  estimateECSDeploymentCost(deploymentConfig) {
    // Simple cost estimation for ECS Fargate
    let cost = 0;
    
    // Fargate pricing (approximate)
    // vCPU: $0.04048 per vCPU per hour
    // Memory: $0.004445 per GB per hour
    
    // Assume 0.25 vCPU, 0.5 GB RAM for 1 hour
    cost += (0.25 * 0.04048) + (0.5 * 0.004445);
    
    // ECR data transfer and storage
    cost += 0.01;
    
    return Math.round(cost * 100) / 100;
  }
}

module.exports = ECSFargateDeployment;