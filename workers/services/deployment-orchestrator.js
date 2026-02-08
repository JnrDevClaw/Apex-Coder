const User = require('../../server/models/user');
const CloudFormationStack = require('../../server/models/cloudformation-stack');
const Deployment = require('../../server/models/deployment');
const { pushGeneratedAppToGitHub } = require('./github-repo-service');
const { generateDeploymentWorkflow } = require('./workflow-generator');
const emailNotificationService = require('../../server/services/email-notifications');

/**
 * Helper: Get GitHub token for user
 */
async function getGitHubToken(userId) {
  const user = await User.findById(userId);
  if (!user || !user.githubToken) {
    return null;
  }
  return user.githubToken;
}

/**
 * Helper: Get CloudFormation stack for user
 */
async function getCloudFormationStack(userId) {
  const stacks = await CloudFormationStack.findByUserId(userId);
  if (!stacks || stacks.length === 0) {
    return null;
  }
  // Return the most recent stack
  return stacks[0];
}

/**
 * Orchestrate the complete deployment flow
 */
async function orchestrateDeployment({ 
  deploymentId, 
  userId, 
  projectId, 
  generatedFiles, 
  deploymentOptions = {} 
}) {
  let deployment = null;

  try {
    // Get deployment record
    if (deploymentId) {
      deployment = await Deployment.findById(deploymentId);
      if (deployment) {
        await deployment.updateStatus('in_progress');
      }
    }

    // 1. Get GitHub token
    const githubToken = await getGitHubToken(userId);
    if (!githubToken) {
      if (deployment) {
        await deployment.updateStatus('failed');
      }
      throw new Error('GitHub not connected. Please connect your GitHub account first.');
    }

    // 2. Get CloudFormation stack info
    const stack = await getCloudFormationStack(userId);
    if (!stack) {
      if (deployment) {
        await deployment.updateStatus('failed');
      }
      throw new Error('AWS infrastructure not provisioned. Please set up AWS integration first.');
    }

    // 3. Generate unique repo name
    const repoName = `ai-app-${projectId}-${Date.now()}`;

    // 4. Generate workflow file
    const workflowContent = generateDeploymentWorkflow({
      roleArn: stack.roleArn,
      bucketName: stack.bucketName,
      region: stack.region || 'us-east-1'
    });

    // 5. Determine webhook URL
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const webhookUrl = `${apiBaseUrl}/api/webhooks/github`;

    // 6. Push to GitHub with webhook registration
    const result = await pushGeneratedAppToGitHub({
      githubToken,
      owner: stack.githubOwner,
      repoName,
      generatedFiles,
      githubWorkflowYML: workflowContent,
      privateRepo: deploymentOptions.privateRepo !== false,
      webhookUrl
    });

    // 7. Update deployment record with success
    if (deployment) {
      await deployment.update({
        repoUrl: result.repoUrl,
        repoFullName: result.repoFullName,
        commitSha: result.commitSha,
        status: 'success',
        deployedAt: new Date().toISOString()
      });

      // 8. Send deployment started notification
      try {
        await emailNotificationService.sendDeploymentStartedNotification(userId, {
          repoFullName: result.repoFullName,
          repoUrl: result.repoUrl,
          commitSha: result.commitSha,
          createdAt: deployment.createdAt
        });
      } catch (emailError) {
        console.warn('Failed to send deployment started notification:', emailError);
      }
    }

    return {
      success: true,
      deploymentId: deployment?.id,
      repoUrl: result.repoUrl,
      repoFullName: result.repoFullName,
      commitSha: result.commitSha,
      message: 'Repository created and deployment workflow configured'
    };
  } catch (error) {
    // Update deployment record with failure
    if (deployment) {
      try {
        await deployment.updateStatus('failed');
        
        // Send deployment failure notification
        try {
          await emailNotificationService.sendDeploymentFailureNotification(userId, {
            repoFullName: deployment.repoFullName || 'Unknown',
            repoUrl: deployment.repoUrl,
            commitSha: deployment.commitSha,
            createdAt: deployment.createdAt
          }, error.message);
        } catch (emailError) {
          console.warn('Failed to send deployment failure notification:', emailError);
        }
      } catch (updateError) {
        console.error('Failed to update deployment status:', updateError);
      }
    }
    throw error;
  }
}

module.exports = {
  orchestrateDeployment,
  getGitHubToken,
  getCloudFormationStack
};
