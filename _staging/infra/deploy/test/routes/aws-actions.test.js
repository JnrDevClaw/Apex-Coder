const { build } = require('../helper');
const crypto = require('crypto');

describe('AWS Actions Routes', () => {
  let app;
  const mockWebhookSecret = 'test-webhook-secret';

  beforeAll(async () => {
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_DEPLOYMENT_ROLE_ARN = 'arn:aws:iam::123456789012:role/test-deployment-role';
    process.env.WEBHOOK_SECRET = mockWebhookSecret;
    process.env.AWS_AUDIT_TRAIL_NAME = 'test-audit-trail';
    process.env.COST_CAP_USD = '100';

    app = await build({ t: expect });
  });

  afterAll(async () => {
    await app.close();
  });

  const createValidSignature = (payload) => {
    return crypto
      .createHmac('sha256', mockWebhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
  };

  const mockAuthToken = 'valid-jwt-token';

  describe('POST /api/aws/deploy/s3-cloudfront', () => {
    const validPayload = {
      bucketName: 'test-bucket',
      distributionId: 'E1234567890123',
      artifactUrl: 's3://artifacts/build.zip',
      projectId: 'project-123',
      buildId: 'build-456',
      healthCheckUrl: 'https://example.com/health'
    };

    it('should deploy static site successfully', async () => {
      const signature = createValidSignature(validPayload);

      const response = await app.inject({
        method: 'POST',
        url: '/api/aws/deploy/s3-cloudfront',
        headers: {
          'authorization': `Bearer ${mockAuthToken}`,
          'x-signature': signature,
          'x-actor-id': 'user-123',
          'x-actor-type': 'user'
        },
        payload: validPayload
      });

      expect(response.statusCode).toBe(200);
      
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.deployment).toBeDefined();
      expect(result.deployment.deploymentId).toBeDefined();
      expect(result.deployment.status).toBe('success');
    });

    it('should reject request without signature', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/aws/deploy/s3-cloudfront',
        headers: {
          'authorization': `Bearer ${mockAuthToken}`,
          'x-actor-id': 'user-123'
        },
        payload: validPayload
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject request with invalid signature', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/aws/deploy/s3-cloudfront',
        headers: {
          'authorization': `Bearer ${mockAuthToken}`,
          'x-signature': 'invalid-signature',
          'x-actor-id': 'user-123'
        },
        payload: validPayload
      });

      expect(response.statusCode).toBe(401);
    });

    it('should validate required fields', async () => {
      const invalidPayload = {
        bucketName: 'test-bucket'
        // Missing required fields
      };
      const signature = createValidSignature(invalidPayload);

      const response = await app.inject({
        method: 'POST',
        url: '/api/aws/deploy/s3-cloudfront',
        headers: {
          'authorization': `Bearer ${mockAuthToken}`,
          'x-signature': signature,
          'x-actor-id': 'user-123'
        },
        payload: invalidPayload
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/aws/deploy/ecs-fargate', () => {
    const validPayload = {
      cluster: 'test-cluster',
      serviceName: 'test-service',
      imageUri: '123456789012.dkr.ecr.us-east-1.amazonaws.com/test:latest',
      taskDefinitionFamily: 'test-task-def',
      projectId: 'project-123',
      buildId: 'build-456',
      envVars: {
        NODE_ENV: 'production'
      }
    };

    it('should deploy containerized app successfully', async () => {
      const signature = createValidSignature(validPayload);

      const response = await app.inject({
        method: 'POST',
        url: '/api/aws/deploy/ecs-fargate',
        headers: {
          'authorization': `Bearer ${mockAuthToken}`,
          'x-signature': signature,
          'x-actor-id': 'user-123',
          'x-actor-type': 'user'
        },
        payload: validPayload
      });

      expect(response.statusCode).toBe(200);
      
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.deployment).toBeDefined();
      expect(result.deployment.deploymentId).toBeDefined();
      expect(result.deployment.cluster).toBe('test-cluster');
    });

    it('should validate deployment strategy enum', async () => {
      const invalidPayload = {
        ...validPayload,
        deploymentStrategy: 'invalid-strategy'
      };
      const signature = createValidSignature(invalidPayload);

      const response = await app.inject({
        method: 'POST',
        url: '/api/aws/deploy/ecs-fargate',
        headers: {
          'authorization': `Bearer ${mockAuthToken}`,
          'x-signature': signature,
          'x-actor-id': 'user-123'
        },
        payload: invalidPayload
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/aws/deploy/lambda-apigateway', () => {
    const validPayload = {
      functionName: 'test-function',
      zipUrl: 's3://artifacts/lambda.zip',
      projectId: 'project-123',
      buildId: 'build-456',
      runtime: 'nodejs18.x',
      handler: 'index.handler',
      envVars: {
        NODE_ENV: 'production'
      }
    };

    it('should deploy serverless app successfully', async () => {
      const signature = createValidSignature(validPayload);

      const response = await app.inject({
        method: 'POST',
        url: '/api/aws/deploy/lambda-apigateway',
        headers: {
          'authorization': `Bearer ${mockAuthToken}`,
          'x-signature': signature,
          'x-actor-id': 'user-123',
          'x-actor-type': 'user'
        },
        payload: validPayload
      });

      expect(response.statusCode).toBe(200);
      
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.deployment).toBeDefined();
      expect(result.deployment.functionName).toBe('test-function');
    });
  });

  describe('POST /api/aws/deploy/infrastructure', () => {
    const validPayload = {
      templateUrl: 's3://templates/pulumi.zip',
      provider: 'pulumi',
      projectId: 'project-123',
      buildId: 'build-456',
      variables: {
        region: 'us-east-1',
        environment: 'production'
      },
      outputsToCapture: ['bucketName', 'websiteUrl']
    };

    it('should deploy infrastructure successfully', async () => {
      const signature = createValidSignature(validPayload);

      const response = await app.inject({
        method: 'POST',
        url: '/api/aws/deploy/infrastructure',
        headers: {
          'authorization': `Bearer ${mockAuthToken}`,
          'x-signature': signature,
          'x-actor-id': 'user-123',
          'x-actor-type': 'user'
        },
        payload: validPayload
      });

      expect(response.statusCode).toBe(200);
      
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.deployment).toBeDefined();
      expect(result.deployment.provider).toBe('pulumi');
    });

    it('should validate provider enum', async () => {
      const invalidPayload = {
        ...validPayload,
        provider: 'invalid-provider'
      };
      const signature = createValidSignature(invalidPayload);

      const response = await app.inject({
        method: 'POST',
        url: '/api/aws/deploy/infrastructure',
        headers: {
          'authorization': `Bearer ${mockAuthToken}`,
          'x-signature': signature,
          'x-actor-id': 'user-123'
        },
        payload: invalidPayload
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Rollback Endpoints', () => {
    const deploymentId = 'deploy_project_build_123456789';

    it('should rollback S3 CloudFront deployment', async () => {
      const signature = createValidSignature({});

      const response = await app.inject({
        method: 'POST',
        url: `/api/aws/rollback/s3-cloudfront/${deploymentId}`,
        headers: {
          'authorization': `Bearer ${mockAuthToken}`,
          'x-signature': signature,
          'x-actor-id': 'user-123',
          'x-actor-type': 'user'
        },
        payload: {}
      });

      // This will fail because no deployment history exists, but validates the route
      expect(response.statusCode).toBe(500);
      
      const result = JSON.parse(response.payload);
      expect(result.message).toContain('No rollback version available');
    });

    it('should rollback ECS deployment', async () => {
      const signature = createValidSignature({});

      const response = await app.inject({
        method: 'POST',
        url: `/api/aws/rollback/ecs-fargate/${deploymentId}`,
        headers: {
          'authorization': `Bearer ${mockAuthToken}`,
          'x-signature': signature,
          'x-actor-id': 'user-123'
        },
        payload: {}
      });

      expect(response.statusCode).toBe(500);
    });

    it('should rollback Lambda deployment', async () => {
      const signature = createValidSignature({});

      const response = await app.inject({
        method: 'POST',
        url: `/api/aws/rollback/lambda-apigateway/${deploymentId}`,
        headers: {
          'authorization': `Bearer ${mockAuthToken}`,
          'x-signature': signature,
          'x-actor-id': 'user-123'
        },
        payload: {}
      });

      expect(response.statusCode).toBe(500);
    });

    it('should rollback infrastructure deployment', async () => {
      const signature = createValidSignature({});

      const response = await app.inject({
        method: 'POST',
        url: `/api/aws/rollback/infrastructure/${deploymentId}`,
        headers: {
          'authorization': `Bearer ${mockAuthToken}`,
          'x-signature': signature,
          'x-actor-id': 'user-123'
        },
        payload: {}
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('Approval Management', () => {
    it('should request approval for operation', async () => {
      const payload = {
        operationType: 'billing',
        operationDetails: {
          estimatedCost: 150,
          operation: 'deploy-infrastructure'
        }
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/aws/approvals/request',
        headers: {
          'authorization': `Bearer ${mockAuthToken}`,
          'x-actor-id': 'user-123'
        },
        payload
      });

      expect(response.statusCode).toBe(200);
      
      const result = JSON.parse(response.payload);
      expect(result.success).toBe(true);
      expect(result.approval).toBeDefined();
      expect(result.approval.operationType).toBe('billing');
    });

    it('should validate operation type enum', async () => {
      const payload = {
        operationType: 'invalid-type',
        operationDetails: {}
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/aws/approvals/request',
        headers: {
          'authorization': `Bearer ${mockAuthToken}`,
          'x-actor-id': 'user-123'
        },
        payload
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/aws/health', () => {
    it('should return health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/aws/health'
      });

      expect(response.statusCode).toBe(200);
      
      const result = JSON.parse(response.payload);
      expect(result.status).toBe('healthy');
      expect(result.services).toBeDefined();
      expect(result.services['s3-cloudfront']).toBe('available');
      expect(result.services['ecs-fargate']).toBe('available');
      expect(result.services['lambda-apigateway']).toBe('available');
      expect(result.services['infrastructure']).toBe('available');
    });
  });
});