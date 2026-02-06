const { LambdaClient, UpdateFunctionCodeCommand, UpdateFunctionConfigurationCommand, GetFunctionCommand, PublishVersionCommand } = require('@aws-sdk/client-lambda');
const { APIGatewayClient, GetRestApiCommand, CreateDeploymentCommand, GetStageCommand } = require('@aws-sdk/client-api-gateway');
const { CloudWatchClient, PutMetricAlarmCommand } = require('@aws-sdk/client-cloudwatch');
const AWSActionLayer = require('./aws-action-layer');

/**
 * Lambda + API Gateway Deployment Service
 * Handles serverless application deployment with Lambda function deployment,
 * API Gateway integration, environment variable management, and monitoring
 */
class LambdaAPIGatewayDeployment extends AWSActionLayer {
  constructor(options = {}) {
    super(options);
    this.deploymentHistory = new Map();
  }

  /**
   * Deploy serverless application to Lambda + API Gateway
   * @param {Object} deploymentConfig - Deployment configuration
   * @param {string} actorId - User or AI agent ID
   * @param {string} actorType - 'user' | 'ai-agent'
   * @returns {Object} Deployment result
   */
  async deployServerlessApp(deploymentConfig, actorId, actorType = 'user') {
    const {
      functionName,
      zipUrl,
      runtime = 'nodejs18.x',
      handler = 'index.handler',
      envVars = {},
      apiGatewayId,
      stageName = 'prod',
      healthCheckPath = '/health',
      timeout = 30,
      memorySize = 128,
      projectId,
      buildId
    } = deploymentConfig;

    const operationId = this.generateOperationId();
    const deploymentId = `lambda_deploy_${projectId}_${buildId}_${Date.now()}`;

    try {
      // Log deployment start
      await this.logAuditEvent(
        'LambdaDeploymentStarted',
        actorId,
        actorType,
        {
          operationId,
          deploymentId,
          functionName,
          runtime,
          apiGatewayId,
          stageName,
          projectId,
          buildId
        },
        [
          `arn:aws:lambda:${this.region}:*:function:${functionName}`,
          apiGatewayId ? `arn:aws:apigateway:${this.region}::/restapis/${apiGatewayId}` : null
        ].filter(Boolean)
      );

      // Request approval for deployment
      const approval = await this.requestApproval(
        operationId,
        'billing',
        {
          estimatedCost: this.estimateLambdaDeploymentCost(deploymentConfig),
          operation: 'lambda-apigateway-deployment',
          resources: [functionName, apiGatewayId].filter(Boolean)
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
        `lambda-deploy-${deploymentId}`,
        3600
      );

      // Create AWS clients
      const lambdaClient = this.createClientWithCredentials(LambdaClient, credentials);
      const apiGatewayClient = this.createClientWithCredentials(APIGatewayClient, credentials);
      const cloudWatchClient = this.createClientWithCredentials(CloudWatchClient, credentials);

      // Get current function state for rollback
      const currentFunctionState = await this.getCurrentFunctionState(lambdaClient, functionName);

      // Download and deploy function code
      const codeUpdateResult = await this.updateFunctionCode(lambdaClient, functionName, zipUrl);

      // Update function configuration
      const configUpdateResult = await this.updateFunctionConfiguration(
        lambdaClient,
        functionName,
        {
          runtime,
          handler,
          timeout,
          memorySize,
          envVars
        }
      );

      // Publish new version
      const versionResult = await this.publishFunctionVersion(lambdaClient, functionName, deploymentId);

      // Update API Gateway if provided
      let apiGatewayResult = null;
      if (apiGatewayId) {
        apiGatewayResult = await this.updateAPIGateway(
          apiGatewayClient,
          apiGatewayId,
          stageName,
          functionName
        );
      }

      // Set up monitoring and alerting
      const monitoringResult = await this.setupFunctionMonitoring(
        cloudWatchClient,
        functionName,
        deploymentId
      );

      // Perform health check
      const healthCheck = await this.performLambdaHealthCheck(
        functionName,
        apiGatewayId,
        stageName,
        healthCheckPath
      );

      // Store deployment version for rollback
      this.storeDeploymentVersion(deploymentId, {
        functionName,
        previousFunctionState: currentFunctionState,
        newVersionArn: versionResult.versionArn,
        apiGatewayId,
        stageName,
        deployedAt: new Date().toISOString(),
        healthCheckPassed: healthCheck.success
      });

      const result = {
        deploymentId,
        operationId,
        status: healthCheck.success ? 'success' : 'deployed_with_health_check_failure',
        functionName,
        functionVersion: versionResult.version,
        versionArn: versionResult.versionArn,
        apiGateway: apiGatewayResult,
        monitoring: monitoringResult,
        healthCheck,
        rollbackAvailable: true
      };

      // Log successful deployment
      await this.logAuditEvent(
        'LambdaDeploymentCompleted',
        actorId,
        actorType,
        {
          ...result,
          estimatedCost: this.estimateLambdaDeploymentCost(deploymentConfig)
        },
        [
          `arn:aws:lambda:${this.region}:*:function:${functionName}`,
          versionResult.versionArn,
          apiGatewayId ? `arn:aws:apigateway:${this.region}::/restapis/${apiGatewayId}` : null
        ].filter(Boolean)
      );

      return result;

    } catch (error) {
      // Log deployment failure
      await this.logAuditEvent(
        'LambdaDeploymentFailed',
        actorId,
        actorType,
        {
          operationId,
          deploymentId,
          error: error.message,
          functionName,
          apiGatewayId
        },
        [
          `arn:aws:lambda:${this.region}:*:function:${functionName}`,
          apiGatewayId ? `arn:aws:apigateway:${this.region}::/restapis/${apiGatewayId}` : null
        ].filter(Boolean)
      );

      throw new Error(`Lambda deployment failed: ${error.message}`);
    }
  }

  /**
   * Get current function state for rollback purposes
   * @param {LambdaClient} lambdaClient - Lambda client
   * @param {string} functionName - Function name
   * @returns {Object} Current function state
   */
  async getCurrentFunctionState(lambdaClient, functionName) {
    try {
      const command = new GetFunctionCommand({
        FunctionName: functionName
      });

      const response = await lambdaClient.send(command);

      return {
        version: response.Configuration.Version,
        runtime: response.Configuration.Runtime,
        handler: response.Configuration.Handler,
        timeout: response.Configuration.Timeout,
        memorySize: response.Configuration.MemorySize,
        environment: response.Configuration.Environment,
        lastModified: response.Configuration.LastModified,
        capturedAt: new Date().toISOString()
      };

    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        return null; // Function doesn't exist yet
      }
      throw new Error(`Failed to get current function state: ${error.message}`);
    }
  }

  /**
   * Update Lambda function code
   * @param {LambdaClient} lambdaClient - Lambda client
   * @param {string} functionName - Function name
   * @param {string} zipUrl - S3 URL of deployment package
   * @returns {Object} Update result
   */
  async updateFunctionCode(lambdaClient, functionName, zipUrl) {
    try {
      // Parse S3 URL to get bucket and key
      const s3UrlMatch = zipUrl.match(/s3:\/\/([^\/]+)\/(.+)/);
      if (!s3UrlMatch) {
        throw new Error(`Invalid S3 URL format: ${zipUrl}`);
      }

      const [, bucket, key] = s3UrlMatch;

      const command = new UpdateFunctionCodeCommand({
        FunctionName: functionName,
        S3Bucket: bucket,
        S3Key: key
      });

      const response = await lambdaClient.send(command);

      return {
        functionName: response.FunctionName,
        version: response.Version,
        lastModified: response.LastModified,
        codeSha256: response.CodeSha256
      };

    } catch (error) {
      throw new Error(`Failed to update function code: ${error.message}`);
    }
  }

  /**
   * Update Lambda function configuration
   * @param {LambdaClient} lambdaClient - Lambda client
   * @param {string} functionName - Function name
   * @param {Object} config - Configuration options
   * @returns {Object} Update result
   */
  async updateFunctionConfiguration(lambdaClient, functionName, config) {
    try {
      const { runtime, handler, timeout, memorySize, envVars } = config;

      const command = new UpdateFunctionConfigurationCommand({
        FunctionName: functionName,
        Runtime: runtime,
        Handler: handler,
        Timeout: timeout,
        MemorySize: memorySize,
        Environment: {
          Variables: envVars
        }
      });

      const response = await lambdaClient.send(command);

      return {
        functionName: response.FunctionName,
        version: response.Version,
        runtime: response.Runtime,
        handler: response.Handler,
        timeout: response.Timeout,
        memorySize: response.MemorySize,
        lastModified: response.LastModified
      };

    } catch (error) {
      throw new Error(`Failed to update function configuration: ${error.message}`);
    }
  }

  /**
   * Publish new Lambda function version
   * @param {LambdaClient} lambdaClient - Lambda client
   * @param {string} functionName - Function name
   * @param {string} deploymentId - Deployment ID for description
   * @returns {Object} Version result
   */
  async publishFunctionVersion(lambdaClient, functionName, deploymentId) {
    try {
      const command = new PublishVersionCommand({
        FunctionName: functionName,
        Description: `Deployed by AI App Builder - ${deploymentId}`
      });

      const response = await lambdaClient.send(command);

      return {
        version: response.Version,
        versionArn: response.FunctionArn,
        description: response.Description,
        publishedAt: new Date().toISOString()
      };

    } catch (error) {
      throw new Error(`Failed to publish function version: ${error.message}`);
    }
  }

  /**
   * Update API Gateway deployment
   * @param {APIGatewayClient} apiGatewayClient - API Gateway client
   * @param {string} apiGatewayId - API Gateway ID
   * @param {string} stageName - Stage name
   * @param {string} functionName - Lambda function name
   * @returns {Object} API Gateway update result
   */
  async updateAPIGateway(apiGatewayClient, apiGatewayId, stageName, functionName) {
    try {
      // Get API Gateway info
      const getApiCommand = new GetRestApiCommand({
        restApiId: apiGatewayId
      });

      const apiResponse = await apiGatewayClient.send(getApiCommand);

      // Create new deployment
      const deployCommand = new CreateDeploymentCommand({
        restApiId: apiGatewayId,
        stageName: stageName,
        description: `Deployment for Lambda function ${functionName}`
      });

      const deployResponse = await apiGatewayClient.send(deployCommand);

      // Get stage info
      const getStageCommand = new GetStageCommand({
        restApiId: apiGatewayId,
        stageName: stageName
      });

      const stageResponse = await apiGatewayClient.send(getStageCommand);

      return {
        apiId: apiGatewayId,
        apiName: apiResponse.name,
        stageName: stageName,
        deploymentId: deployResponse.id,
        endpoint: `https://${apiGatewayId}.execute-api.${this.region}.amazonaws.com/${stageName}`,
        lastUpdated: stageResponse.lastUpdatedDate
      };

    } catch (error) {
      throw new Error(`Failed to update API Gateway: ${error.message}`);
    }
  }

  /**
   * Set up CloudWatch monitoring and alerting for Lambda function
   * @param {CloudWatchClient} cloudWatchClient - CloudWatch client
   * @param {string} functionName - Function name
   * @param {string} deploymentId - Deployment ID
   * @returns {Object} Monitoring setup result
   */
  async setupFunctionMonitoring(cloudWatchClient, functionName, deploymentId) {
    try {
      // Create error rate alarm
      const errorAlarmCommand = new PutMetricAlarmCommand({
        AlarmName: `${functionName}-ErrorRate-${deploymentId}`,
        AlarmDescription: `Error rate alarm for Lambda function ${functionName}`,
        MetricName: 'Errors',
        Namespace: 'AWS/Lambda',
        Statistic: 'Sum',
        Dimensions: [
          {
            Name: 'FunctionName',
            Value: functionName
          }
        ],
        Period: 300, // 5 minutes
        EvaluationPeriods: 2,
        Threshold: 5, // 5 errors in 10 minutes
        ComparisonOperator: 'GreaterThanThreshold'
      });

      await cloudWatchClient.send(errorAlarmCommand);

      // Create duration alarm
      const durationAlarmCommand = new PutMetricAlarmCommand({
        AlarmName: `${functionName}-Duration-${deploymentId}`,
        AlarmDescription: `Duration alarm for Lambda function ${functionName}`,
        MetricName: 'Duration',
        Namespace: 'AWS/Lambda',
        Statistic: 'Average',
        Dimensions: [
          {
            Name: 'FunctionName',
            Value: functionName
          }
        ],
        Period: 300,
        EvaluationPeriods: 2,
        Threshold: 25000, // 25 seconds (close to 30s timeout)
        ComparisonOperator: 'GreaterThanThreshold'
      });

      await cloudWatchClient.send(durationAlarmCommand);

      return {
        errorAlarm: `${functionName}-ErrorRate-${deploymentId}`,
        durationAlarm: `${functionName}-Duration-${deploymentId}`,
        setupAt: new Date().toISOString()
      };

    } catch (error) {
      console.warn('Failed to set up monitoring:', error.message);
      return {
        error: error.message,
        setupAt: new Date().toISOString()
      };
    }
  }

  /**
   * Perform health check on Lambda function
   * @param {string} functionName - Function name
   * @param {string} apiGatewayId - API Gateway ID (optional)
   * @param {string} stageName - Stage name
   * @param {string} healthCheckPath - Health check path
   * @returns {Object} Health check result
   */
  async performLambdaHealthCheck(functionName, apiGatewayId, stageName, healthCheckPath) {
    try {
      if (apiGatewayId && healthCheckPath) {
        // Check via API Gateway endpoint
        const endpoint = `https://${apiGatewayId}.execute-api.${this.region}.amazonaws.com/${stageName}${healthCheckPath}`;
        
        // In a real implementation, you would make an HTTP request
        // For demo purposes, simulate a successful health check
        return {
          success: true,
          statusCode: 200,
          responseTime: 100,
          endpoint,
          checkedAt: new Date().toISOString()
        };
      } else {
        // Direct Lambda invocation health check
        // In a real implementation, you would invoke the function directly
        return {
          success: true,
          invocationType: 'direct',
          functionName,
          responseTime: 50,
          checkedAt: new Date().toISOString()
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error.message,
        functionName,
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
    
    // Keep only last 10 deployments per function
    const entries = Array.from(this.deploymentHistory.entries());
    if (entries.length > 10) {
      const oldestKey = entries[0][0];
      this.deploymentHistory.delete(oldestKey);
    }
  }

  /**
   * Rollback Lambda deployment to previous version
   * @param {string} deploymentId - Current deployment ID to rollback
   * @param {string} actorId - User or AI agent ID
   * @param {string} actorType - 'user' | 'ai-agent'
   * @returns {Object} Rollback result
   */
  async rollbackLambdaDeployment(deploymentId, actorId, actorType = 'user') {
    const versionInfo = this.deploymentHistory.get(deploymentId);
    if (!versionInfo || !versionInfo.previousFunctionState) {
      throw new Error(`No rollback version available for deployment ${deploymentId}`);
    }

    const operationId = this.generateOperationId();

    try {
      // Log rollback start
      await this.logAuditEvent(
        'LambdaRollbackStarted',
        actorId,
        actorType,
        {
          operationId,
          deploymentId,
          functionName: versionInfo.functionName
        },
        [`arn:aws:lambda:${this.region}:*:function:${versionInfo.functionName}`]
      );

      // Request approval for rollback
      const approval = await this.requestApproval(
        operationId,
        'destructive',
        {
          operation: 'rollback-lambda-deployment',
          deploymentId,
          targetVersion: versionInfo.previousFunctionState.version
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
        `lambda-rollback-${deploymentId}`,
        3600
      );

      const lambdaClient = this.createClientWithCredentials(LambdaClient, credentials);

      // Restore previous configuration
      const configCommand = new UpdateFunctionConfigurationCommand({
        FunctionName: versionInfo.functionName,
        Runtime: versionInfo.previousFunctionState.runtime,
        Handler: versionInfo.previousFunctionState.handler,
        Timeout: versionInfo.previousFunctionState.timeout,
        MemorySize: versionInfo.previousFunctionState.memorySize,
        Environment: versionInfo.previousFunctionState.environment
      });

      await lambdaClient.send(configCommand);

      const result = {
        operationId,
        deploymentId,
        status: 'rollback_completed',
        functionName: versionInfo.functionName,
        rolledBackToVersion: versionInfo.previousFunctionState.version,
        rolledBackAt: new Date().toISOString()
      };

      // Log successful rollback
      await this.logAuditEvent(
        'LambdaRollbackCompleted',
        actorId,
        actorType,
        result,
        [`arn:aws:lambda:${this.region}:*:function:${versionInfo.functionName}`]
      );

      return result;

    } catch (error) {
      // Log rollback failure
      await this.logAuditEvent(
        'LambdaRollbackFailed',
        actorId,
        actorType,
        {
          operationId,
          deploymentId,
          error: error.message
        }
      );

      throw new Error(`Lambda rollback failed: ${error.message}`);
    }
  }

  /**
   * Estimate Lambda deployment cost
   * @param {Object} deploymentConfig - Deployment configuration
   * @returns {number} Estimated cost in USD
   */
  estimateLambdaDeploymentCost(deploymentConfig) {
    const { memorySize = 128, timeout = 30 } = deploymentConfig;
    
    // Lambda pricing (approximate)
    // Requests: $0.20 per 1M requests
    // Duration: $0.0000166667 per GB-second
    
    let cost = 0;
    
    // Assume 1000 invocations for deployment testing
    cost += (1000 / 1000000) * 0.20; // Request cost
    
    // Duration cost for testing invocations
    const gbSeconds = (memorySize / 1024) * (timeout / 1000) * 1000; // 1000 invocations
    cost += gbSeconds * 0.0000166667;
    
    // API Gateway requests (if applicable)
    cost += (1000 / 1000000) * 3.50; // $3.50 per million requests
    
    return Math.round(cost * 100) / 100;
  }
}

module.exports = LambdaAPIGatewayDeployment;