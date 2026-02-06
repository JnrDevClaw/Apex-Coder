const S3CloudFrontDeployment = require('../services/aws-s3-cloudfront-deployment');
const ECSFargateDeployment = require('../services/aws-ecs-fargate-deployment');
const LambdaAPIGatewayDeployment = require('../services/aws-lambda-apigateway-deployment');
const IaCDeployment = require('../services/aws-iac-deployment');

/**
 * AWS Action Layer Routes
 * Secure server-side endpoints for AWS operations with IAM role assumption,
 * HMAC signature validation, multi-step approval, and comprehensive audit logging
 */
async function awsActionsRoutes(fastify, options) {
  // Set route prefix
  fastify.register(async function (fastify) {
  // Initialize deployment services
  const s3CloudFrontService = new S3CloudFrontDeployment({
    region: process.env.AWS_REGION,
    roleArn: process.env.AWS_DEPLOYMENT_ROLE_ARN,
    webhookSecret: process.env.WEBHOOK_SECRET,
    auditTrailName: process.env.AWS_AUDIT_TRAIL_NAME
  });

  const ecsService = new ECSFargateDeployment({
    region: process.env.AWS_REGION,
    roleArn: process.env.AWS_DEPLOYMENT_ROLE_ARN,
    webhookSecret: process.env.WEBHOOK_SECRET,
    auditTrailName: process.env.AWS_AUDIT_TRAIL_NAME
  });

  const lambdaService = new LambdaAPIGatewayDeployment({
    region: process.env.AWS_REGION,
    roleArn: process.env.AWS_DEPLOYMENT_ROLE_ARN,
    webhookSecret: process.env.WEBHOOK_SECRET,
    auditTrailName: process.env.AWS_AUDIT_TRAIL_NAME
  });

  const iacService = new IaCDeployment({
    region: process.env.AWS_REGION,
    roleArn: process.env.AWS_DEPLOYMENT_ROLE_ARN,
    webhookSecret: process.env.WEBHOOK_SECRET,
    auditTrailName: process.env.AWS_AUDIT_TRAIL_NAME
  });

  // Middleware for HMAC signature validation
  const validateSignature = async (request, reply) => {
    const signature = request.headers['x-signature'];
    if (!signature) {
      throw fastify.httpErrors.unauthorized('Missing X-Signature header');
    }

    const payload = JSON.stringify(request.body);
    const isValid = s3CloudFrontService.validateSignature(signature, payload);
    
    if (!isValid) {
      throw fastify.httpErrors.unauthorized('Invalid signature');
    }
  };

  // Middleware for extracting actor information
  const extractActor = async (request, reply) => {
    // Extract actor from JWT token or request headers
    const actorId = request.user?.id || request.headers['x-actor-id'] || 'unknown';
    const actorType = request.headers['x-actor-type'] || 'user';
    
    request.actor = { id: actorId, type: actorType };
  };

  // Register middleware
  fastify.addHook('preHandler', extractActor);

  // S3 + CloudFront Static Site Deployment
  fastify.post('/deploy/s3-cloudfront', {
    preHandler: [fastify.authenticate, validateSignature],
    schema: {
      body: {
        type: 'object',
        required: ['bucketName', 'distributionId', 'artifactUrl', 'projectId', 'buildId'],
        properties: {
          bucketName: { type: 'string' },
          distributionId: { type: 'string' },
          artifactUrl: { type: 'string' },
          projectId: { type: 'string' },
          buildId: { type: 'string' },
          healthCheckUrl: { type: 'string' },
          rollbackEnabled: { type: 'boolean', default: true }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await s3CloudFrontService.deployStaticSite(
        request.body,
        request.actor.id,
        request.actor.type
      );

      return {
        success: true,
        deployment: result
      };
    } catch (error) {
      fastify.log.error('S3 CloudFront deployment failed:', error);
      throw fastify.httpErrors.internalServerError(error.message);
    }
  });

  // ECS/Fargate Containerized Deployment
  fastify.post('/deploy/ecs-fargate', {
    preHandler: [fastify.authenticate, validateSignature],
    schema: {
      body: {
        type: 'object',
        required: ['cluster', 'serviceName', 'imageUri', 'taskDefinitionFamily', 'projectId', 'buildId'],
        properties: {
          cluster: { type: 'string' },
          serviceName: { type: 'string' },
          imageUri: { type: 'string' },
          taskDefinitionFamily: { type: 'string' },
          envVars: { type: 'object' },
          healthCheckPath: { type: 'string', default: '/health' },
          deploymentStrategy: { type: 'string', enum: ['rolling', 'blue-green'], default: 'rolling' },
          projectId: { type: 'string' },
          buildId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await ecsService.deployContainerizedApp(
        request.body,
        request.actor.id,
        request.actor.type
      );

      return {
        success: true,
        deployment: result
      };
    } catch (error) {
      fastify.log.error('ECS Fargate deployment failed:', error);
      throw fastify.httpErrors.internalServerError(error.message);
    }
  });

  // Lambda + API Gateway Serverless Deployment
  fastify.post('/deploy/lambda-apigateway', {
    preHandler: [fastify.authenticate, validateSignature],
    schema: {
      body: {
        type: 'object',
        required: ['functionName', 'zipUrl', 'projectId', 'buildId'],
        properties: {
          functionName: { type: 'string' },
          zipUrl: { type: 'string' },
          runtime: { type: 'string', default: 'nodejs18.x' },
          handler: { type: 'string', default: 'index.handler' },
          envVars: { type: 'object' },
          apiGatewayId: { type: 'string' },
          stageName: { type: 'string', default: 'prod' },
          healthCheckPath: { type: 'string', default: '/health' },
          timeout: { type: 'number', default: 30 },
          memorySize: { type: 'number', default: 128 },
          projectId: { type: 'string' },
          buildId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await lambdaService.deployServerlessApp(
        request.body,
        request.actor.id,
        request.actor.type
      );

      return {
        success: true,
        deployment: result
      };
    } catch (error) {
      fastify.log.error('Lambda API Gateway deployment failed:', error);
      throw fastify.httpErrors.internalServerError(error.message);
    }
  });

  // Infrastructure as Code Deployment
  fastify.post('/deploy/infrastructure', {
    preHandler: [fastify.authenticate, validateSignature],
    schema: {
      body: {
        type: 'object',
        required: ['templateUrl', 'provider', 'projectId', 'buildId'],
        properties: {
          templateUrl: { type: 'string' },
          provider: { type: 'string', enum: ['pulumi', 'terraform'] },
          variables: { type: 'object' },
          outputsToCapture: { type: 'array', items: { type: 'string' } },
          stackName: { type: 'string' },
          projectId: { type: 'string' },
          buildId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await iacService.deployInfrastructure(
        request.body,
        request.actor.id,
        request.actor.type
      );

      return {
        success: true,
        deployment: result
      };
    } catch (error) {
      fastify.log.error('Infrastructure deployment failed:', error);
      throw fastify.httpErrors.internalServerError(error.message);
    }
  });

  // Rollback Endpoints

  // Rollback S3 + CloudFront deployment
  fastify.post('/rollback/s3-cloudfront/:deploymentId', {
    preHandler: [fastify.authenticate, validateSignature],
    schema: {
      params: {
        type: 'object',
        required: ['deploymentId'],
        properties: {
          deploymentId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await s3CloudFrontService.rollbackDeployment(
        request.params.deploymentId,
        request.actor.id,
        request.actor.type
      );

      return {
        success: true,
        rollback: result
      };
    } catch (error) {
      fastify.log.error('S3 CloudFront rollback failed:', error);
      throw fastify.httpErrors.internalServerError(error.message);
    }
  });

  // Rollback ECS deployment
  fastify.post('/rollback/ecs-fargate/:deploymentId', {
    preHandler: [fastify.authenticate, validateSignature],
    schema: {
      params: {
        type: 'object',
        required: ['deploymentId'],
        properties: {
          deploymentId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await ecsService.rollbackECSDeployment(
        request.params.deploymentId,
        request.actor.id,
        request.actor.type
      );

      return {
        success: true,
        rollback: result
      };
    } catch (error) {
      fastify.log.error('ECS Fargate rollback failed:', error);
      throw fastify.httpErrors.internalServerError(error.message);
    }
  });

  // Rollback Lambda deployment
  fastify.post('/rollback/lambda-apigateway/:deploymentId', {
    preHandler: [fastify.authenticate, validateSignature],
    schema: {
      params: {
        type: 'object',
        required: ['deploymentId'],
        properties: {
          deploymentId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await lambdaService.rollbackLambdaDeployment(
        request.params.deploymentId,
        request.actor.id,
        request.actor.type
      );

      return {
        success: true,
        rollback: result
      };
    } catch (error) {
      fastify.log.error('Lambda rollback failed:', error);
      throw fastify.httpErrors.internalServerError(error.message);
    }
  });

  // Rollback infrastructure deployment
  fastify.post('/rollback/infrastructure/:deploymentId', {
    preHandler: [fastify.authenticate, validateSignature],
    schema: {
      params: {
        type: 'object',
        required: ['deploymentId'],
        properties: {
          deploymentId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await iacService.rollbackInfrastructure(
        request.params.deploymentId,
        request.actor.id,
        request.actor.type
      );

      return {
        success: true,
        rollback: result
      };
    } catch (error) {
      fastify.log.error('Infrastructure rollback failed:', error);
      throw fastify.httpErrors.internalServerError(error.message);
    }
  });

  // Approval Management Endpoints

  // Request approval for operation
  fastify.post('/approvals/request', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['operationType', 'operationDetails'],
        properties: {
          operationType: { type: 'string', enum: ['billing', 'destructive'] },
          operationDetails: { type: 'object' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const operationId = s3CloudFrontService.generateOperationId();
      const result = await s3CloudFrontService.requestApproval(
        operationId,
        request.body.operationType,
        request.body.operationDetails,
        request.actor.id,
        request.user?.role || 'dev'
      );

      return {
        success: true,
        approval: result
      };
    } catch (error) {
      fastify.log.error('Approval request failed:', error);
      throw fastify.httpErrors.internalServerError(error.message);
    }
  });

  // Add approval to operation
  fastify.post('/approvals/:operationId/approve', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['operationId'],
        properties: {
          operationId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await s3CloudFrontService.addApproval(
        request.params.operationId,
        request.actor.id,
        request.user?.role || 'dev'
      );

      return {
        success: true,
        approval: result
      };
    } catch (error) {
      fastify.log.error('Add approval failed:', error);
      throw fastify.httpErrors.internalServerError(error.message);
    }
  });

  // Health check endpoint
  fastify.get('/health', async (request, reply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        's3-cloudfront': 'available',
        'ecs-fargate': 'available',
        'lambda-apigateway': 'available',
        'infrastructure': 'available'
      }
    };
  });
  
  }, { prefix: '/aws' });
}

module.exports = awsActionsRoutes;