const crypto = require('crypto');
const emailNotificationService = require('../services/email-notifications');

/**
 * GitHub Webhooks Route
 * Handles webhook events from GitHub Actions workflows
 */
async function githubWebhooksRoutes(fastify, options) {
  /**
   * Verify GitHub webhook signature
   */
  function verifyGitHubSignature(payload, signature, secret) {
    if (!signature) {
      return false;
    }

    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    );
  }

  /**
   * POST /api/webhooks/github
   * Receive webhook events from GitHub
   */
  fastify.post('/github', {
    config: {
      rawBody: true // Need raw body for signature verification
    }
  }, async (request, reply) => {
    try {
      const signature = request.headers['x-hub-signature-256'];
      const event = request.headers['x-github-event'];
      const deliveryId = request.headers['x-github-delivery'];

      // Verify webhook signature if secret is configured
      const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
      if (webhookSecret) {
        const rawBody = request.rawBody || JSON.stringify(request.body);
        const isValid = verifyGitHubSignature(rawBody, signature, webhookSecret);
        
        if (!isValid) {
          fastify.log.warn('Invalid GitHub webhook signature', { deliveryId });
          return reply.code(401).send({
            error: 'Invalid signature'
          });
        }
      }

      fastify.log.info('Received GitHub webhook', { 
        event, 
        deliveryId,
        action: request.body.action 
      });

      // Handle different event types
      switch (event) {
        case 'workflow_run':
          await handleWorkflowRun(fastify, request.body);
          break;
        
        case 'workflow_job':
          await handleWorkflowJob(fastify, request.body);
          break;
        
        case 'push':
          await handlePush(fastify, request.body);
          break;
        
        case 'ping':
          fastify.log.info('GitHub webhook ping received');
          break;
        
        default:
          fastify.log.info('Unhandled GitHub webhook event', { event });
      }

      reply.code(200).send({
        success: true,
        message: 'Webhook received',
        deliveryId
      });

    } catch (error) {
      fastify.log.error('Error processing GitHub webhook:', error);
      reply.code(500).send({
        error: 'Failed to process webhook',
        message: error.message
      });
    }
  });

  /**
   * GET /api/webhooks/github/status
   * Check webhook configuration status
   */
  fastify.get('/github/status', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    
    reply.send({
      success: true,
      data: {
        configured: !!webhookSecret,
        webhookUrl: `${process.env.API_BASE_URL || 'http://localhost:3000'}/api/webhooks/github`
      }
    });
  });
}

/**
 * Handle workflow_run events
 * Triggered when a GitHub Actions workflow is completed
 */
async function handleWorkflowRun(fastify, payload) {
  const { action, workflow_run, repository } = payload;

  // Only process completed workflows
  if (action !== 'completed') {
    return;
  }

  const {
    id: workflowRunId,
    name: workflowName,
    head_sha: commitSha,
    conclusion,
    html_url: workflowUrl,
    created_at: createdAt,
    updated_at: updatedAt
  } = workflow_run;

  const repoFullName = repository.full_name;

  fastify.log.info('Workflow run completed', {
    workflowRunId,
    workflowName,
    repoFullName,
    commitSha,
    conclusion
  });

  try {
    // Find deployment by repo and commit SHA
    const { Deployment } = require('../models');
    const deployments = await Deployment.findByRepoAndCommit(repoFullName, commitSha);

    if (!deployments || deployments.length === 0) {
      fastify.log.warn('No deployment found for workflow run', {
        repoFullName,
        commitSha
      });
      return;
    }

    // Update deployment status based on workflow conclusion
    for (const deployment of deployments) {
      let newStatus;
      
      switch (conclusion) {
        case 'success':
          newStatus = 'deployed';
          break;
        case 'failure':
        case 'cancelled':
        case 'timed_out':
          newStatus = 'failed';
          break;
        default:
          newStatus = deployment.status; // Keep current status
      }

      if (newStatus !== deployment.status) {
        await deployment.update({
          status: newStatus,
          deployedAt: conclusion === 'success' ? new Date().toISOString() : deployment.deployedAt
        });

        fastify.log.info('Updated deployment status', {
          deploymentId: deployment.id,
          oldStatus: deployment.status,
          newStatus,
          workflowUrl
        });

        // Send email notifications
        try {
          if (newStatus === 'deployed') {
            await emailNotificationService.sendDeploymentSuccessNotification(deployment.userId, {
              repoFullName: deployment.repoFullName,
              repoUrl: deployment.repoUrl,
              commitSha: deployment.commitSha,
              deployedAt: deployment.deployedAt,
              createdAt: deployment.createdAt
            });
          } else if (newStatus === 'failed') {
            await emailNotificationService.sendDeploymentFailureNotification(deployment.userId, {
              repoFullName: deployment.repoFullName,
              repoUrl: deployment.repoUrl,
              commitSha: deployment.commitSha,
              createdAt: deployment.createdAt
            }, `Workflow ${conclusion}: ${workflowUrl}`);
          }
        } catch (emailError) {
          fastify.log.warn('Failed to send deployment notification email:', emailError);
        }

        // Emit event for notifications
        fastify.emit('deployment:status_changed', {
          deploymentId: deployment.id,
          userId: deployment.userId,
          projectId: deployment.projectId,
          status: newStatus,
          workflowUrl,
          conclusion
        });
      }
    }

  } catch (error) {
    fastify.log.error('Error updating deployment from workflow run:', error);
    throw error;
  }
}

/**
 * Handle workflow_job events
 * Triggered when a workflow job status changes
 */
async function handleWorkflowJob(fastify, payload) {
  const { action, workflow_job, repository } = payload;

  fastify.log.debug('Workflow job event', {
    action,
    jobName: workflow_job.name,
    status: workflow_job.status,
    conclusion: workflow_job.conclusion,
    repoFullName: repository.full_name
  });

  // Can be used for more granular status updates
  // For now, we rely on workflow_run for final status
}

/**
 * Handle push events
 * Triggered when code is pushed to repository
 */
async function handlePush(fastify, payload) {
  const { ref, after: commitSha, repository, pusher } = payload;

  fastify.log.info('Push event received', {
    ref,
    commitSha,
    repoFullName: repository.full_name,
    pusher: pusher.name
  });

  // Can be used to track manual pushes or trigger re-deployments
  // For now, just log the event
}

module.exports = githubWebhooksRoutes;
