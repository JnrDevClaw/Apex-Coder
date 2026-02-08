const AWSActionLayer = require('../../services/aws-action-layer');
const S3CloudFrontDeployment = require('../../services/aws-s3-cloudfront-deployment');
const ECSFargateDeployment = require('../../services/aws-ecs-fargate-deployment');
const LambdaAPIGatewayDeployment = require('../../services/aws-lambda-apigateway-deployment');
const IaCDeployment = require('../../services/aws-iac-deployment');

// Mock child_process for IaC deployment
jest.mock('child_process', () => ({
  spawn: jest.fn().mockImplementation(() => {
    const mockChild = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      })
    };
    
    // Simulate successful command output
    setTimeout(() => {
      mockChild.stdout.on.mock.calls.forEach(([event, callback]) => {
        if (event === 'data') {
          callback('{"bucketName": "test-bucket", "websiteUrl": "https://test.com"}');
        }
      });
    }, 5);
    
    return mockChild;
  })
}));

// Mock AWS SDK clients for integration tests
jest.mock('@aws-sdk/client-sts', () => ({
  STSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      Credentials: {
        AccessKeyId: 'AKIATEST123',
        SecretAccessKey: 'secret123',
        SessionToken: 'token123',
        Expiration: new Date()
      }
    })
  })),
  AssumeRoleCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-cloudtrail', () => ({
  CloudTrailClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({})
  })),
  PutEventsCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({})
  })),
  PutObjectCommand: jest.fn(),
  ListObjectVersionsCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-cloudfront', () => ({
  CloudFrontClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      Invalidation: {
        Id: 'I1234567890123',
        Status: 'InProgress',
        CreateTime: new Date()
      }
    })
  })),
  CreateInvalidationCommand: jest.fn(),
  GetDistributionCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-ecs', () => ({
  ECSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      services: [{
        taskDefinition: 'arn:aws:ecs:us-east-1:123456789012:task-definition/test:1',
        desiredCount: 1,
        runningCount: 1,
        status: 'ACTIVE',
        deployments: [{
          status: 'PRIMARY',
          runningCount: 1,
          desiredCount: 1
        }]
      }]
    })
  })),
  UpdateServiceCommand: jest.fn(),
  DescribeServicesCommand: jest.fn(),
  DescribeTasksCommand: jest.fn(),
  ListTasksCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-ecr', () => ({
  ECRClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      images: [{ imageId: { imageTag: 'latest' } }]
    })
  })),
  BatchGetImageCommand: jest.fn(),
  PutImageCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      Configuration: {
        Version: '1',
        Runtime: 'nodejs18.x',
        Handler: 'index.handler',
        Timeout: 30,
        MemorySize: 128,
        Environment: { Variables: {} },
        LastModified: new Date().toISOString()
      },
      FunctionName: 'test-function',
      FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function:1',
      Version: '1'
    })
  })),
  UpdateFunctionCodeCommand: jest.fn(),
  UpdateFunctionConfigurationCommand: jest.fn(),
  GetFunctionCommand: jest.fn(),
  PublishVersionCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-api-gateway', () => ({
  APIGatewayClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      name: 'test-api',
      id: 'abc123def456',
      lastUpdatedDate: new Date()
    })
  })),
  GetRestApiCommand: jest.fn(),
  CreateDeploymentCommand: jest.fn(),
  GetStageCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-cloudwatch', () => ({
  CloudWatchClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({})
  })),
  PutMetricAlarmCommand: jest.fn()
}));

describe('AWS Action Layer Integration', () => {
  const mockConfig = {
    region: 'us-east-1',
    roleArn: 'arn:aws:iam::123456789012:role/test-deployment-role',
    webhookSecret: 'test-webhook-secret',
    auditTrailName: 'test-audit-trail'
  };

  beforeEach(() => {
    process.env.COST_CAP_USD = '100';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Core AWS Action Layer', () => {
    it('should initialize with proper configuration', () => {
      const awsActionLayer = new AWSActionLayer(mockConfig);
      
      expect(awsActionLayer.region).toBe('us-east-1');
      expect(awsActionLayer.roleArn).toBe(mockConfig.roleArn);
      expect(awsActionLayer.webhookSecret).toBe(mockConfig.webhookSecret);
      expect(awsActionLayer.auditTrailName).toBe(mockConfig.auditTrailName);
    });

    it('should handle approval workflow for billing operations', async () => {
      const awsActionLayer = new AWSActionLayer(mockConfig);
      
      // Request approval for operation within cost cap
      const approval1 = await awsActionLayer.requestApproval(
        'op-test-1',
        'billing',
        { estimatedCost: 50 },
        'user-123',
        'owner'
      );
      
      expect(approval1.status).toBe('approved');
      
      // Request approval for operation exceeding cost cap
      const approval2 = await awsActionLayer.requestApproval(
        'op-test-2',
        'billing',
        { estimatedCost: 150 },
        'user-123',
        'owner'
      );
      
      expect(approval2.status).toBe('approved'); // Owner can approve billing
    });

    it('should handle approval workflow for destructive operations', async () => {
      const awsActionLayer = new AWSActionLayer(mockConfig);
      
      // Request approval for destructive operation
      const approval = await awsActionLayer.requestApproval(
        'op-test-3',
        'destructive',
        { operation: 'delete-resources' },
        'user-123',
        'owner'
      );
      
      expect(approval.status).toBe('needs_second_approval');
      
      // Add second approval
      const finalApproval = await awsActionLayer.addApproval(
        'op-test-3',
        'admin-456',
        'admin'
      );
      
      expect(finalApproval.status).toBe('approved');
      expect(finalApproval.approvals).toHaveLength(2);
    });
  });

  describe('S3 + CloudFront Deployment', () => {
    it('should deploy static site successfully', async () => {
      const s3CloudFrontService = new S3CloudFrontDeployment(mockConfig);
      
      const deploymentConfig = {
        bucketName: 'test-bucket',
        distributionId: 'E1234567890123',
        artifactUrl: 's3://artifacts/build.zip',
        projectId: 'project-123',
        buildId: 'build-456',
        healthCheckUrl: 'https://example.com/health'
      };
      
      const result = await s3CloudFrontService.deployStaticSite(
        deploymentConfig,
        'user-123',
        'user'
      );
      
      expect(result.deploymentId).toBeDefined();
      expect(result.status).toBe('success');
      expect(result.bucketName).toBe('test-bucket');
      expect(result.distributionId).toBe('E1234567890123');
      expect(result.rollbackAvailable).toBe(true);
    });

    it('should estimate deployment cost correctly', () => {
      const s3CloudFrontService = new S3CloudFrontDeployment(mockConfig);
      
      const cost = s3CloudFrontService.estimateDeploymentCost({
        bucketName: 'test-bucket',
        distributionId: 'E1234567890123'
      });
      
      expect(typeof cost).toBe('number');
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(1); // Should be small for static site
    });
  });

  describe('ECS/Fargate Deployment', () => {
    it('should deploy containerized app successfully', async () => {
      const ecsService = new ECSFargateDeployment(mockConfig);
      
      const deploymentConfig = {
        cluster: 'test-cluster',
        serviceName: 'test-service',
        imageUri: '123456789012.dkr.ecr.us-east-1.amazonaws.com/test:latest',
        taskDefinitionFamily: 'test-task-def',
        projectId: 'project-123',
        buildId: 'build-456',
        envVars: { NODE_ENV: 'production' }
      };
      
      const result = await ecsService.deployContainerizedApp(
        deploymentConfig,
        'user-123',
        'user'
      );
      
      expect(result.deploymentId).toBeDefined();
      expect(result.status).toBe('success');
      expect(result.cluster).toBe('test-cluster');
      expect(result.serviceName).toBe('test-service');
      expect(result.rollbackAvailable).toBe(true);
    });

    it('should estimate ECS deployment cost correctly', () => {
      const ecsService = new ECSFargateDeployment(mockConfig);
      
      const cost = ecsService.estimateECSDeploymentCost({
        memorySize: 512,
        timeout: 60
      });
      
      expect(typeof cost).toBe('number');
      expect(cost).toBeGreaterThan(0);
    });
  });

  describe('Lambda + API Gateway Deployment', () => {
    it('should deploy serverless app successfully', async () => {
      const lambdaService = new LambdaAPIGatewayDeployment(mockConfig);
      
      const deploymentConfig = {
        functionName: 'test-function',
        zipUrl: 's3://artifacts/lambda.zip',
        runtime: 'nodejs18.x',
        handler: 'index.handler',
        projectId: 'project-123',
        buildId: 'build-456',
        envVars: { NODE_ENV: 'production' }
      };
      
      const result = await lambdaService.deployServerlessApp(
        deploymentConfig,
        'user-123',
        'user'
      );
      
      expect(result.deploymentId).toBeDefined();
      expect(result.status).toBe('success');
      expect(result.functionName).toBe('test-function');
      expect(result.rollbackAvailable).toBe(true);
    });

    it('should estimate Lambda deployment cost correctly', () => {
      const lambdaService = new LambdaAPIGatewayDeployment(mockConfig);
      
      const cost = lambdaService.estimateLambdaDeploymentCost({
        memorySize: 128,
        timeout: 30
      });
      
      expect(typeof cost).toBe('number');
      expect(cost).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Infrastructure as Code Deployment', () => {
    it('should deploy infrastructure successfully', async () => {
      const iacService = new IaCDeployment(mockConfig);
      
      const deploymentConfig = {
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
      
      const result = await iacService.deployInfrastructure(
        deploymentConfig,
        'user-123',
        'user'
      );
      
      expect(result.deploymentId).toBeDefined();
      expect(result.status).toBe('success');
      expect(result.provider).toBe('pulumi');
      expect(result.rollbackAvailable).toBe(true);
    });

    it('should estimate IaC deployment cost correctly', () => {
      const iacService = new IaCDeployment(mockConfig);
      
      const cost = iacService.estimateIaCDeploymentCost({
        variables: { region: 'us-east-1', env: 'prod' }
      });
      
      expect(typeof cost).toBe('number');
      expect(cost).toBeGreaterThan(0);
    });
  });

  describe('Security and Audit', () => {
    it('should validate HMAC signatures correctly', () => {
      const awsActionLayer = new AWSActionLayer(mockConfig);
      const payload = JSON.stringify({ test: 'data' });
      
      // Create valid signature
      const crypto = require('crypto');
      const validSignature = crypto
        .createHmac('sha256', mockConfig.webhookSecret)
        .update(payload)
        .digest('hex');
      
      expect(awsActionLayer.validateSignature(validSignature, payload)).toBe(true);
      expect(awsActionLayer.validateSignature('invalid-signature', payload)).toBe(false);
    });

    it('should log audit events properly', async () => {
      const awsActionLayer = new AWSActionLayer(mockConfig);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const auditEvent = await awsActionLayer.logAuditEvent(
        'TestDeployment',
        'user-123',
        'user',
        { action: 'deploy', target: 's3' },
        ['arn:aws:s3:::test-bucket']
      );
      
      expect(auditEvent.eventName).toBe('TestDeployment');
      expect(auditEvent.actorId).toBe('user-123');
      expect(auditEvent.actorType).toBe('user');
      expect(auditEvent.resourceArns).toEqual(['arn:aws:s3:::test-bucket']);
      expect(consoleSpy).toHaveBeenCalledWith(
        'AWS_AUDIT_EVENT:',
        expect.stringContaining('TestDeployment')
      );
      
      consoleSpy.mockRestore();
    });

    it('should generate unique operation IDs', () => {
      const awsActionLayer = new AWSActionLayer(mockConfig);
      
      const id1 = awsActionLayer.generateOperationId();
      const id2 = awsActionLayer.generateOperationId();
      
      expect(id1).toMatch(/^op_\d+_[a-f0-9]{16}$/);
      expect(id2).toMatch(/^op_\d+_[a-f0-9]{16}$/);
      expect(id1).not.toBe(id2);
    });
  });
});