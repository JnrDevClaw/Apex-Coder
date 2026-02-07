const { createGitHubOIDCStack } = require('../services/cloudformation-service');
const { sendErrorResponse } = require('../utils/error-responses');

module.exports = async function (fastify, opts) {
  // Create CloudFormation stack for GitHub OIDC
  fastify.post('/api/aws/setup', {
    preHandler: fastify.authenticate,
    config: {
      rateLimit: fastify.rateLimitConfig.aws
    },
    schema: {
      body: {
        type: 'object',
        required: ['githubOwner'],
        properties: {
          githubOwner: { type: 'string' },
          githubRepo: { type: 'string', default: '*' },
          region: { type: 'string', default: 'us-east-1' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { githubOwner, githubRepo, region } = request.body;
      const userId = request.user.id;

      fastify.log.info(`User ${userId} creating CloudFormation stack for ${githubOwner}/${githubRepo}`);

      const result = await createGitHubOIDCStack(fastify, userId, {
        githubOwner,
        githubRepo,
        region
      });

      // Log audit event for stack creation
      const auditLogger = require('../services/audit-logger');
      await auditLogger.logUserAction(userId, 'cloudformation_stack_created', {
        stackName: result.stackName,
        stackId: result.stackId,
        region: result.region,
        githubOwner,
        githubRepo,
        roleArn: result.roleArn,
        bucketName: result.bucketName,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      return reply.code(201).send({
        success: true,
        message: 'CloudFormation stack created successfully',
        data: result
      });
    } catch (error) {
      fastify.log.error('Error creating CloudFormation stack:', error);
      
      if (error.message === 'AWS credentials not configured') {
        return sendErrorResponse(reply, 'AWS_NOT_CONNECTED');
      }

      if (error.message && error.message.includes('AlreadyExistsException')) {
        return sendErrorResponse(reply, 'CLOUDFORMATION_STACK_EXISTS', {
          details: error.message
        });
      }

      if (error.message && error.message.includes('LimitExceeded')) {
        return sendErrorResponse(reply, 'AWS_INSUFFICIENT_PERMISSIONS', {
          customMessage: 'AWS resource limit exceeded.',
          customSolution: 'Check your AWS account limits or try a different region.',
          details: error.message
        });
      }

      return sendErrorResponse(reply, 'CLOUDFORMATION_CREATE_FAILED', {
        details: error.message
      });
    }
  });

  // Get CloudFormation stack status
  fastify.get('/api/aws/setup/status', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      const userId = request.user.id;

      const result = await fastify.db.query(
        `SELECT id, stack_name, region, role_arn, bucket_name, github_owner, github_repo, created_at
         FROM cloudformation_stacks
         WHERE user_id = $1 AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [userId]
      );

      return reply.send({
        success: true,
        stacks: result.rows
      });
    } catch (error) {
      fastify.log.error('Error fetching CloudFormation stacks:', error);
      return sendErrorResponse(reply, 'DATABASE_ERROR', {
        customMessage: 'Failed to fetch CloudFormation stacks.',
        details: error.message
      });
    }
  });
}
