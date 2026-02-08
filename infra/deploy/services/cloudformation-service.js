const fs = require('fs');
const path = require('path');
const {
  CloudFormationClient,
  CreateStackCommand,
  DescribeStacksCommand,
  DeleteStackCommand
} = require('@aws-sdk/client-cloudformation');
const { waitUntilStackCreateComplete } = require('@aws-sdk/client-cloudformation');
const { withRetry, AWS_RETRY_CONFIG } = require('../utils/retry');
const { logCloudFormationError, logAWSError, logDatabaseError } = require('./deployment-error-logger');

const TEMPLATE_PATH = path.join(__dirname, '../templates/github-oidc-stack.yml');

async function createGitHubOIDCStack(fastify, userId, options) {
  const { githubOwner, githubRepo = '*', region = 'us-east-1' } = options;

  try {
    // Get user's AWS credentials
    const userResult = await fastify.db.query(
      `SELECT aws_access_key, aws_secret_key, aws_session_token 
       FROM users WHERE id = $1`,
      [userId]
    );

    const user = userResult.rows[0];
    if (!user.aws_access_key) {
      const error = new Error('AWS credentials not configured');
      logAWSError('createGitHubOIDCStack', error, { userId, operation: 'credentials_missing' });
      throw error;
    }

    // Create CloudFormation client
    const cfn = new CloudFormationClient({
      region,
      credentials: {
        accessKeyId: fastify.decrypt(user.aws_access_key),
        secretAccessKey: fastify.decrypt(user.aws_secret_key),
        sessionToken: user.aws_session_token ? fastify.decrypt(user.aws_session_token) : undefined
      }
    });

    // Load template
    const templateBody = fs.readFileSync(TEMPLATE_PATH, 'utf8');

    // Generate unique stack name
    const stackName = `ai-builder-${githubOwner}-${Date.now()}`.substring(0, 128);

    // Create stack with retry logic
    const createCommand = new CreateStackCommand({
      StackName: stackName,
      TemplateBody: templateBody,
      Parameters: [
        { ParameterKey: 'GitHubOwner', ParameterValue: githubOwner },
        { ParameterKey: 'GitHubRepo', ParameterValue: githubRepo },
        { ParameterKey: 'AllowedBranch', ParameterValue: 'refs/heads/main' },
        { ParameterKey: 'BucketNamePrefix', ParameterValue: 'ai-builder-app' }
      ],
      Capabilities: ['CAPABILITY_NAMED_IAM']
    });

    fastify.log.info(`Creating CloudFormation stack: ${stackName}`);
    
    try {
      await withRetry(
        () => cfn.send(createCommand),
        { ...AWS_RETRY_CONFIG, logger: fastify.log }
      );
    } catch (error) {
      logCloudFormationError('createStack', error, {
        userId,
        stackName,
        region,
        githubOwner,
        githubRepo,
        operation: 'create_stack'
      });
      throw error;
    }

    // Wait for completion with retry logic
    fastify.log.info('Waiting for stack creation...');
    try {
      await withRetry(
        () => waitUntilStackCreateComplete(
          { client: cfn, maxWaitTime: 600 },
          { StackName: stackName }
        ),
        { ...AWS_RETRY_CONFIG, logger: fastify.log }
      );
    } catch (error) {
      logCloudFormationError('waitForStackCreation', error, {
        userId,
        stackName,
        region,
        operation: 'wait_for_completion'
      });
      throw error;
    }

    // Get outputs with retry logic
    const describeCommand = new DescribeStacksCommand({ StackName: stackName });
    let stacks;
    try {
      stacks = await withRetry(
        () => cfn.send(describeCommand),
        { ...AWS_RETRY_CONFIG, logger: fastify.log }
      );
    } catch (error) {
      logCloudFormationError('describeStack', error, {
        userId,
        stackName,
        region,
        operation: 'describe_stack'
      });
      throw error;
    }
    
    const stack = stacks.Stacks[0];

    const outputs = {};
    for (const output of stack.Outputs || []) {
      outputs[output.OutputKey] = output.OutputValue;
    }

    // Store stack info in database with retry logic
    try {
      await withRetry(
        () => fastify.db.query(
          `INSERT INTO cloudformation_stacks 
           (user_id, stack_name, region, role_arn, bucket_name, github_owner, github_repo, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [userId, stackName, region, outputs.RoleArn, outputs.BucketName, githubOwner, githubRepo]
        ),
        { maxRetries: 2, baseDelay: 500, logger: fastify.log }
      );
    } catch (error) {
      logDatabaseError('storeStackInfo', error, {
        userId,
        stackName,
        table: 'cloudformation_stacks',
        operation: 'insert_stack'
      });
      throw error;
    }

    return {
      stackName,
      roleArn: outputs.RoleArn,
      bucketName: outputs.BucketName
    };
  } catch (error) {
    // Log top-level errors if not already logged
    if (!error.message.includes('AWS credentials')) {
      logCloudFormationError('createGitHubOIDCStack', error, {
        userId,
        region,
        githubOwner,
        githubRepo,
        operation: 'top_level_error'
      });
    }
    throw error;
  }
}

module.exports = {
  createGitHubOIDCStack
};
