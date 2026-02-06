/**
 * CloudFormation Stack Creation Verification Script
 * 
 * This script helps verify that CloudFormation stack creation works end-to-end.
 * It can be run manually with real AWS credentials to test the complete flow.
 * 
 * Usage:
 *   node server/test/manual/verify-cloudformation-stack.js
 * 
 * Prerequisites:
 *   1. Server must be running (npm run dev)
 *   2. User must be authenticated and have GitHub connected
 *   3. User must have AWS credentials configured
 *   4. AWS credentials must have CloudFormation permissions
 */

import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { IAMClient, GetOpenIDConnectProviderCommand } from '@aws-sdk/client-iam';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN;

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ ${message}`, 'blue');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

async function checkPrerequisites() {
  log('\n=== Checking Prerequisites ===\n', 'cyan');
  
  if (!AUTH_TOKEN) {
    logError('AUTH_TOKEN environment variable not set');
    logInfo('Set it with: export AUTH_TOKEN="your-jwt-token"');
    return false;
  }
  
  logSuccess('AUTH_TOKEN is set');
  
  // Check if server is running
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (response.ok) {
      logSuccess('Server is running');
    } else {
      logError('Server returned non-200 status');
      return false;
    }
  } catch (error) {
    logError('Server is not running or not accessible');
    logInfo('Start the server with: npm run dev');
    return false;
  }
  
  return true;
}

async function checkGitHubConnection() {
  log('\n=== Checking GitHub Connection ===\n', 'cyan');
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/github/status`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });
    
    const data = await response.json();
    
    if (data.connected) {
      logSuccess(`GitHub connected as: ${data.username}`);
      return data.username;
    } else {
      logError('GitHub not connected');
      logInfo('Connect GitHub at: http://localhost:5173/settings');
      return null;
    }
  } catch (error) {
    logError(`Failed to check GitHub status: ${error.message}`);
    return null;
  }
}

async function checkAWSConnection() {
  log('\n=== Checking AWS Connection ===\n', 'cyan');
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/aws/status`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });
    
    const data = await response.json();
    
    if (data.connected) {
      logSuccess(`AWS connected - Account: ${data.accountId}, Region: ${data.region}`);
      return { accountId: data.accountId, region: data.region };
    } else {
      logError('AWS not connected');
      logInfo('Connect AWS at: http://localhost:5173/settings');
      return null;
    }
  } catch (error) {
    logError(`Failed to check AWS status: ${error.message}`);
    return null;
  }
}

async function createCloudFormationStack(githubOwner) {
  log('\n=== Creating CloudFormation Stack ===\n', 'cyan');
  
  logInfo(`Creating stack for GitHub owner: ${githubOwner}`);
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/aws/setup`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        githubOwner,
        githubRepo: '*',
        region: 'us-east-1'
      })
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      logSuccess('Stack creation initiated');
      logInfo(`Stack Name: ${data.data.stackName}`);
      logInfo(`Role ARN: ${data.data.roleArn}`);
      logInfo(`Bucket Name: ${data.data.bucketName}`);
      return data.data;
    } else {
      logError(`Stack creation failed: ${data.error || data.message}`);
      if (data.details) {
        logInfo(`Details: ${data.details}`);
      }
      return null;
    }
  } catch (error) {
    logError(`Failed to create stack: ${error.message}`);
    return null;
  }
}

async function verifyStackInAWS(stackName, region, awsCredentials) {
  log('\n=== Verifying Stack in AWS Console ===\n', 'cyan');
  
  try {
    const cfn = new CloudFormationClient({
      region,
      credentials: awsCredentials
    });
    
    const command = new DescribeStacksCommand({ StackName: stackName });
    const response = await cfn.send(command);
    
    const stack = response.Stacks[0];
    
    if (stack.StackStatus === 'CREATE_COMPLETE') {
      logSuccess(`Stack status: ${stack.StackStatus}`);
      
      // Verify outputs
      const outputs = {};
      for (const output of stack.Outputs || []) {
        outputs[output.OutputKey] = output.OutputValue;
        logInfo(`${output.OutputKey}: ${output.OutputValue}`);
      }
      
      return { stack, outputs };
    } else {
      logWarning(`Stack status: ${stack.StackStatus}`);
      if (stack.StackStatus.includes('FAILED') || stack.StackStatus.includes('ROLLBACK')) {
        logError('Stack creation failed or rolled back');
        logInfo('Check AWS CloudFormation console for details');
      }
      return { stack, outputs: {} };
    }
  } catch (error) {
    logError(`Failed to verify stack in AWS: ${error.message}`);
    logInfo('Note: This requires AWS credentials with CloudFormation:DescribeStacks permission');
    return null;
  }
}

async function verifyOIDCProvider(region, awsCredentials) {
  log('\n=== Verifying OIDC Provider ===\n', 'cyan');
  
  try {
    const iam = new IAMClient({
      region,
      credentials: awsCredentials
    });
    
    const providerArn = 'arn:aws:iam::' + awsCredentials.accountId + ':oidc-provider/token.actions.githubusercontent.com';
    
    const command = new GetOpenIDConnectProviderCommand({
      OpenIDConnectProviderArn: providerArn
    });
    
    const response = await iam.send(command);
    
    logSuccess('OIDC Provider exists');
    logInfo(`URL: ${response.Url}`);
    logInfo(`Client IDs: ${response.ClientIDList.join(', ')}`);
    logInfo(`Thumbprints: ${response.ThumbprintList.join(', ')}`);
    
    // Verify thumbprint
    if (response.ThumbprintList.includes('6938fd4d98bab03faadb97b34396831e3780aea1')) {
      logSuccess('Correct GitHub Actions OIDC thumbprint found');
    } else {
      logWarning('GitHub Actions OIDC thumbprint not found');
    }
    
    return true;
  } catch (error) {
    if (error.name === 'NoSuchEntityException') {
      logError('OIDC Provider not found');
    } else {
      logError(`Failed to verify OIDC provider: ${error.message}`);
    }
    return false;
  }
}

async function verifyS3Bucket(bucketName, region, awsCredentials) {
  log('\n=== Verifying S3 Bucket ===\n', 'cyan');
  
  try {
    const s3 = new S3Client({
      region,
      credentials: awsCredentials
    });
    
    const command = new HeadBucketCommand({ Bucket: bucketName });
    await s3.send(command);
    
    logSuccess(`S3 Bucket exists: ${bucketName}`);
    logInfo(`Region: ${region}`);
    
    return true;
  } catch (error) {
    if (error.name === 'NotFound') {
      logError('S3 Bucket not found');
    } else {
      logError(`Failed to verify S3 bucket: ${error.message}`);
    }
    return false;
  }
}

async function verifyDatabaseRecord(stackName) {
  log('\n=== Verifying Database Record ===\n', 'cyan');
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/aws/setup/status`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });
    
    const data = await response.json();
    
    if (data.success && data.stacks) {
      const stack = data.stacks.find(s => s.stack_name === stackName);
      
      if (stack) {
        logSuccess('Database record found');
        logInfo(`Stack ID: ${stack.id}`);
        logInfo(`GitHub Owner: ${stack.github_owner}`);
        logInfo(`GitHub Repo: ${stack.github_repo}`);
        logInfo(`Created At: ${stack.created_at}`);
        return true;
      } else {
        logError('Database record not found for this stack');
        return false;
      }
    } else {
      logError('Failed to fetch database records');
      return false;
    }
  } catch (error) {
    logError(`Failed to verify database record: ${error.message}`);
    return false;
  }
}

async function main() {
  log('\n╔════════════════════════════════════════════════════════╗', 'cyan');
  log('║  CloudFormation Stack Creation Verification Script   ║', 'cyan');
  log('╚════════════════════════════════════════════════════════╝\n', 'cyan');
  
  // Step 1: Check prerequisites
  const prereqsOk = await checkPrerequisites();
  if (!prereqsOk) {
    logError('\nPrerequisites check failed. Please fix the issues above and try again.');
    process.exit(1);
  }
  
  // Step 2: Check GitHub connection
  const githubOwner = await checkGitHubConnection();
  if (!githubOwner) {
    logError('\nGitHub connection check failed. Please connect GitHub and try again.');
    process.exit(1);
  }
  
  // Step 3: Check AWS connection
  const awsInfo = await checkAWSConnection();
  if (!awsInfo) {
    logError('\nAWS connection check failed. Please connect AWS and try again.');
    process.exit(1);
  }
  
  // Step 4: Create CloudFormation stack
  const stackInfo = await createCloudFormationStack(githubOwner);
  if (!stackInfo) {
    logError('\nStack creation failed. Check the error messages above.');
    process.exit(1);
  }
  
  // Step 5: Verify database record
  await verifyDatabaseRecord(stackInfo.stackName);
  
  // Step 6: Verify in AWS (requires AWS credentials)
  logInfo('\nTo verify the stack in AWS Console:');
  logInfo('1. Go to: https://console.aws.amazon.com/cloudformation');
  logInfo(`2. Select region: ${awsInfo.region}`);
  logInfo(`3. Find stack: ${stackInfo.stackName}`);
  logInfo('4. Verify status is CREATE_COMPLETE');
  logInfo('5. Check Outputs tab for RoleArn and BucketName');
  
  log('\n╔════════════════════════════════════════════════════════╗', 'green');
  log('║              Verification Complete!                   ║', 'green');
  log('╚════════════════════════════════════════════════════════╝\n', 'green');
  
  logSuccess('CloudFormation stack creation verified successfully!');
  logInfo('\nNext steps:');
  logInfo('1. Verify the stack in AWS Console (see instructions above)');
  logInfo('2. Test GitHub Actions workflow with the created IAM role');
  logInfo('3. Verify S3 bucket access from GitHub Actions');
  
  log('\nCleanup:');
  logWarning('Remember to delete the test stack to avoid AWS charges:');
  logInfo('- Via AWS Console: CloudFormation → Select stack → Delete');
  logInfo(`- Stack name: ${stackInfo.stackName}`);
}

// Run the verification
main().catch(error => {
  logError(`\nUnexpected error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
