const User = require('../models/user');
const { sendErrorResponse, sendErrorFromException } = require('../utils/error-responses');

/**
 * AWS Credentials Management Routes
 * Handles storing and validating AWS temporary credentials
 */
module.exports = async function (fastify) {
  // Store AWS credentials (encrypted)
  fastify.post('/api/aws/credentials', {
    preHandler: fastify.authenticate,
    config: {
      rateLimit: fastify.rateLimitConfig.aws
    }
  }, async (request, reply) => {
    const { accessKeyId, secretAccessKey, sessionToken, region } = request.body;
    const userId = request.user.userId;

    // Validate required fields
    if (!accessKeyId || !secretAccessKey) {
      return sendErrorResponse(reply, 'MISSING_REQUIRED_FIELD', {
        customMessage: 'AWS Access Key ID and Secret Access Key are required.',
        details: 'Both accessKeyId and secretAccessKey must be provided'
      });
    }

    // Validate credentials by testing them with AWS STS
    try {
      const { STSClient, GetCallerIdentityCommand } = await import('@aws-sdk/client-sts');
      
      const sts = new STSClient({
        region: region || 'us-east-1',
        credentials: {
          accessKeyId,
          secretAccessKey,
          ...(sessionToken && { sessionToken })
        }
      });

      const identity = await sts.send(new GetCallerIdentityCommand({}));

      // Fetch user from database
      const user = await User.findById(userId);
      if (!user) {
        return sendErrorResponse(reply, 'NOT_FOUND', {
          customMessage: 'User account not found.',
          details: 'Unable to locate your user account'
        });
      }

      // Store encrypted credentials
      await user.update({
        awsAccessKey: fastify.encrypt(accessKeyId),
        awsSecretKey: fastify.encrypt(secretAccessKey),
        awsSessionToken: sessionToken ? fastify.encrypt(sessionToken) : null,
        awsRegion: region || 'us-east-1',
        awsAccountId: identity.Account,
        awsConnectedAt: new Date().toISOString()
      });

      fastify.log.info({ userId, accountId: identity.Account }, 'AWS credentials stored successfully');

      // Log audit event for AWS connection
      const auditLogger = require('../services/audit-logger');
      await auditLogger.logSecurityEvent('aws_credentials_connected', userId, {
        actorType: 'user',
        accountId: identity.Account,
        region: region || 'us-east-1',
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      return {
        success: true,
        accountId: identity.Account,
        region: region || 'us-east-1'
      };

    } catch (error) {
      fastify.log.error({ error, userId }, 'AWS credentials validation failed');
      const { logAWSError } = require('../services/deployment-error-logger');
      logAWSError('validate_credentials', error, { userId, region, operation: 'store_credentials' });
      
      return sendErrorResponse(reply, 'AWS_INVALID_CREDENTIALS', {
        details: error.message
      });
    }
  });

  // Get AWS connection status
  fastify.get('/api/aws/status', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    const userId = request.user.userId;

    try {
      const user = await User.findById(userId);
      if (!user) {
        return sendErrorResponse(reply, 'NOT_FOUND', {
          customMessage: 'User account not found.'
        });
      }

      return {
        connected: !!user.awsAccountId,
        accountId: user.awsAccountId || null,
        region: user.awsRegion || null,
        connectedAt: user.awsConnectedAt || null
      };
    } catch (error) {
      fastify.log.error({ error, userId }, 'Failed to fetch AWS status');
      return sendErrorResponse(reply, 'DATABASE_ERROR', {
        customMessage: 'Failed to check AWS connection status.',
        details: error.message
      });
    }
  });

  // Disconnect AWS
  fastify.post('/api/aws/disconnect', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    const userId = request.user.userId;

    try {
      const user = await User.findById(userId);
      if (!user) {
        return sendErrorResponse(reply, 'NOT_FOUND', {
          customMessage: 'User account not found.'
        });
      }

      // Clear AWS credentials
      await user.update({
        awsAccessKey: null,
        awsSecretKey: null,
        awsSessionToken: null,
        awsRegion: null,
        awsAccountId: null,
        awsConnectedAt: null
      });

      fastify.log.info({ userId }, 'AWS credentials disconnected');

      // Log audit event for AWS disconnection
      const auditLogger = require('../services/audit-logger');
      await auditLogger.logSecurityEvent('aws_credentials_disconnected', userId, {
        actorType: 'user',
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      return { success: true };
    } catch (error) {
      fastify.log.error({ error, userId }, 'Failed to disconnect AWS');
      return sendErrorResponse(reply, 'AWS_API_ERROR', {
        customMessage: 'Failed to disconnect AWS credentials.',
        details: error.message
      });
    }
  });
}
