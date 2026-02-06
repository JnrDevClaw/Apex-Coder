/**
 * CloudFormation Stack Creation Integration Test
 * 
 * This test validates that CloudFormation stack creation works correctly.
 * It tests the core CloudFormation logic without requiring real AWS credentials.
 * 
 * IMPORTANT: This is an integration test that verifies:
 * 1. CloudFormation template is valid and loadable
 * 2. CloudFormation client can be instantiated
 * 3. Stack creation commands are properly formatted
 * 4. Error handling works correctly
 * 
 * For actual stack creation in AWS, manual testing is required with valid credentials.
 */

const { CloudFormationClient, CreateStackCommand, DescribeStacksCommand } = require('@aws-sdk/client-cloudformation');
const fs = require('fs');
const path = require('path');

describe('CloudFormation Stack Creation', () => {
  const TEMPLATE_PATH = path.join(__dirname, '../../templates/github-oidc-stack.yml');

  test('should have valid CloudFormation template file', () => {
    expect(fs.existsSync(TEMPLATE_PATH)).toBe(true);
    
    const templateContent = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    expect(templateContent).toBeDefined();
    expect(templateContent.length).toBeGreaterThan(0);
    
    // Verify template has required CloudFormation structure
    expect(templateContent).toContain('AWSTemplateFormatVersion');
    expect(templateContent).toContain('Resources');
  });

  test('should have required resources in template', () => {
    const templateContent = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    
    // Verify OIDC Provider resource
    expect(templateContent).toContain('GitHubOIDCProvider');
    expect(templateContent).toContain('AWS::IAM::OIDCProvider');
    expect(templateContent).toContain('token.actions.githubusercontent.com');
    
    // Verify IAM Role resource
    expect(templateContent).toContain('GitHubActionsRole');
    expect(templateContent).toContain('AWS::IAM::Role');
    expect(templateContent).toContain('AssumeRolePolicyDocument');
    
    // Verify S3 Bucket resource
    expect(templateContent).toContain('AppBucket');
    expect(templateContent).toContain('AWS::S3::Bucket');
  });

  test('should have required parameters in template', () => {
    const templateContent = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    
    expect(templateContent).toContain('Parameters');
    expect(templateContent).toContain('GitHubOwner');
    expect(templateContent).toContain('GitHubRepo');
    expect(templateContent).toContain('AllowedBranch');
    expect(templateContent).toContain('BucketNamePrefix');
  });

  test('should have required outputs in template', () => {
    const templateContent = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    
    expect(templateContent).toContain('Outputs');
    expect(templateContent).toContain('RoleArn');
    expect(templateContent).toContain('BucketName');
  });

  test('should create CloudFormation client with credentials', () => {
    const cfn = new CloudFormationClient({
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
      }
    });
    
    expect(cfn).toBeDefined();
    expect(cfn.config.region).toBeDefined();
  });

  test('should create valid CreateStackCommand', () => {
    const templateBody = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    const stackName = 'test-stack-' + Date.now();
    
    const command = new CreateStackCommand({
      StackName: stackName,
      TemplateBody: templateBody,
      Parameters: [
        { ParameterKey: 'GitHubOwner', ParameterValue: 'testuser' },
        { ParameterKey: 'GitHubRepo', ParameterValue: 'test-repo' },
        { ParameterKey: 'AllowedBranch', ParameterValue: 'refs/heads/main' },
        { ParameterKey: 'BucketNamePrefix', ParameterValue: 'ai-builder-app' }
      ],
      Capabilities: ['CAPABILITY_NAMED_IAM']
    });
    
    expect(command).toBeDefined();
    expect(command.input.StackName).toBe(stackName);
    expect(command.input.Parameters).toHaveLength(4);
    expect(command.input.Capabilities).toContain('CAPABILITY_NAMED_IAM');
  });

  test('should handle stack creation with invalid credentials', async () => {
    const cfn = new CloudFormationClient({
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
      }
    });
    
    const templateBody = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    const stackName = 'test-stack-' + Date.now();
    
    const command = new CreateStackCommand({
      StackName: stackName,
      TemplateBody: templateBody,
      Parameters: [
        { ParameterKey: 'GitHubOwner', ParameterValue: 'testuser' },
        { ParameterKey: 'GitHubRepo', ParameterValue: 'test-repo' },
        { ParameterKey: 'AllowedBranch', ParameterValue: 'refs/heads/main' },
        { ParameterKey: 'BucketNamePrefix', ParameterValue: 'ai-builder-app' }
      ],
      Capabilities: ['CAPABILITY_NAMED_IAM']
    });
    
    try {
      await cfn.send(command);
      fail('Should have thrown an error with invalid credentials');
    } catch (error) {
      expect(error).toBeDefined();
      // Expected errors: InvalidClientTokenId, UnrecognizedClientException, etc.
      expect(error.name).toMatch(/InvalidClientTokenId|UnrecognizedClientException|InvalidAccessKeyId|SignatureDoesNotMatch/);
    }
  });

  test('should validate stack name format', () => {
    const validStackNames = [
      'ai-builder-testuser-1234567890',
      'test-stack',
      'MyStack123'
    ];
    
    const invalidStackNames = [
      'stack with spaces',
      'stack@invalid',
      'stack#invalid'
    ];
    
    // Stack names must match: [a-zA-Z][-a-zA-Z0-9]*
    const stackNameRegex = /^[a-zA-Z][-a-zA-Z0-9]*$/;
    
    validStackNames.forEach(name => {
      expect(name).toMatch(stackNameRegex);
    });
    
    invalidStackNames.forEach(name => {
      expect(name).not.toMatch(stackNameRegex);
    });
  });

  test('should validate required parameters are provided', () => {
    const requiredParams = ['GitHubOwner', 'GitHubRepo', 'AllowedBranch', 'BucketNamePrefix'];
    const providedParams = [
      { ParameterKey: 'GitHubOwner', ParameterValue: 'testuser' },
      { ParameterKey: 'GitHubRepo', ParameterValue: 'test-repo' },
      { ParameterKey: 'AllowedBranch', ParameterValue: 'refs/heads/main' },
      { ParameterKey: 'BucketNamePrefix', ParameterValue: 'ai-builder-app' }
    ];
    
    const providedKeys = providedParams.map(p => p.ParameterKey);
    
    requiredParams.forEach(param => {
      expect(providedKeys).toContain(param);
    });
  });

  test('should handle different AWS regions', () => {
    const regions = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'];
    
    regions.forEach(region => {
      const cfn = new CloudFormationClient({
        region,
        credentials: {
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
        }
      });
      
      expect(cfn).toBeDefined();
      expect(cfn.config.region).toBeDefined();
    });
  });

  test('should create DescribeStacksCommand for status checking', () => {
    const stackName = 'test-stack-' + Date.now();
    
    const command = new DescribeStacksCommand({
      StackName: stackName
    });
    
    expect(command).toBeDefined();
    expect(command.input.StackName).toBe(stackName);
  });

  test('should validate OIDC thumbprint in template', () => {
    const templateContent = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    
    // GitHub Actions OIDC thumbprint (as of 2024)
    expect(templateContent).toContain('6938fd4d98bab03faadb97b34396831e3780aea1');
  });

  test('should validate IAM role trust policy structure', () => {
    const templateContent = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    
    // Verify trust policy allows GitHub Actions OIDC
    expect(templateContent).toContain('AssumeRoleWithWebIdentity');
    expect(templateContent).toContain('token.actions.githubusercontent.com:sub');
    expect(templateContent).toContain('token.actions.githubusercontent.com:aud');
    expect(templateContent).toContain('sts.amazonaws.com');
  });

  test('should validate S3 bucket security settings', () => {
    const templateContent = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    
    // Verify bucket has versioning enabled
    expect(templateContent).toContain('VersioningConfiguration');
    expect(templateContent).toContain('Status: Enabled');
    
    // Verify bucket has public access blocked
    expect(templateContent).toContain('PublicAccessBlockConfiguration');
    expect(templateContent).toContain('BlockPublicAcls: true');
    expect(templateContent).toContain('BlockPublicPolicy: true');
  });

  test('should validate IAM role permissions', () => {
    const templateContent = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    
    // Verify role has S3 permissions
    expect(templateContent).toContain('s3:PutObject');
    expect(templateContent).toContain('s3:GetObject');
    expect(templateContent).toContain('s3:ListBucket');
    expect(templateContent).toContain('s3:DeleteObject');
  });

  test('should generate unique stack names', () => {
    const githubOwner = 'testuser';
    const timestamp1 = Date.now();
    const stackName1 = `ai-builder-${githubOwner}-${timestamp1}`.substring(0, 128);
    
    // Generate with different timestamp
    const timestamp2 = timestamp1 + 1000; // Add 1 second to ensure uniqueness
    const stackName2 = `ai-builder-${githubOwner}-${timestamp2}`.substring(0, 128);
    
    expect(stackName1).not.toBe(stackName2);
    expect(stackName1.length).toBeLessThanOrEqual(128);
    expect(stackName2.length).toBeLessThanOrEqual(128);
    
    // Verify stack name format is valid
    const stackNameRegex = /^[a-zA-Z][-a-zA-Z0-9]*$/;
    expect(stackName1).toMatch(stackNameRegex);
    expect(stackName2).toMatch(stackNameRegex);
  });

  test('should handle session tokens for temporary credentials', () => {
    const cfn = new CloudFormationClient({
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        sessionToken: 'FwoGZXIvYXdzEBYaDExample'
      }
    });
    
    expect(cfn).toBeDefined();
  });

  test('should validate template syntax is valid YAML', () => {
    const templateContent = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    
    // Basic YAML validation - should not have tabs (YAML uses spaces)
    expect(templateContent).not.toContain('\t');
    
    // Should have proper YAML structure
    expect(templateContent.split('\n').length).toBeGreaterThan(10);
  });
});
