/**
 * Mock Backend API for Demo
 * Simulates GitHub and AWS connections for presentation purposes
 */

// Mock GitHub OAuth flow
export async function mockGitHubOAuth() {
  // Simulate OAuth redirect and callback
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        user: {
          username: 'demo-user',
          avatar: 'https://github.com/identicons/demo-user.png',
          accessToken: 'mock_github_token_' + Date.now()
        }
      });
    }, 2000);
  });
}

// Mock AWS connection
export async function mockAWSConnection(credentials) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        account: {
          accountId: '123456789012',
          region: credentials.region || 'us-east-1',
          accessKeyId: 'AKIA...' + Math.random().toString(36).substr(2, 8).toUpperCase()
        }
      });
    }, 2500);
  });
}

// Mock repository creation
export async function mockCreateRepository(repoData) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const repoName = repoData.name.toLowerCase().replace(/\s+/g, '-');
      resolve({
        success: true,
        repository: {
          name: repoName,
          fullName: `demo-user/${repoName}`,
          url: `https://github.com/demo-user/${repoName}`,
          cloneUrl: `https://github.com/demo-user/${repoName}.git`,
          defaultBranch: 'main'
        }
      });
    }, 1500);
  });
}

// Mock AWS deployment
export async function mockAWSDeployment(deploymentData) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const appName = deploymentData.appName.toLowerCase().replace(/\s+/g, '-');
      resolve({
        success: true,
        deployment: {
          appUrl: `https://${appName}.demo-app.com`,
          resources: {
            s3Bucket: `${appName}-assets-bucket`,
            cloudFrontDistribution: `E${Math.random().toString(36).substr(2, 13).toUpperCase()}`,
            lambdaFunction: `${appName}-api-function`,
            apiGateway: `https://api-${appName}.demo-app.com`,
            rdsDatabase: `${appName}-db.cluster-xyz.us-east-1.rds.amazonaws.com`
          },
          status: 'deployed'
        }
      });
    }, 3000);
  });
}

// Mock build status updates
export function mockBuildStatusStream(onUpdate) {
  const stages = [
    { id: 'specs', name: 'Creating specs.json', duration: 2000 },
    { id: 'docs', name: 'Creating documentation', duration: 3000 },
    { id: 'schema', name: 'Generating database schema', duration: 2500 },
    { id: 'files', name: 'Creating file structure', duration: 1500 },
    { id: 'coding', name: 'Generating code with AI', duration: 6000 },
    { id: 'testing', name: 'Running tests', duration: 3000 },
    { id: 'repo', name: 'Creating GitHub repository', duration: 2000 },
    { id: 'deploy', name: 'Deploying to AWS', duration: 5000 }
  ];

  let currentStage = 0;

  function processNextStage() {
    if (currentStage >= stages.length) {
      onUpdate({
        stage: 'complete',
        status: 'success',
        message: 'Build completed successfully!',
        timestamp: new Date().toISOString()
      });
      return;
    }

    const stage = stages[currentStage];
    
    // Start stage
    onUpdate({
      stage: stage.id,
      status: 'running',
      message: `${stage.name}...`,
      timestamp: new Date().toISOString()
    });

    // Complete stage
    setTimeout(() => {
      onUpdate({
        stage: stage.id,
        status: 'completed',
        message: `${stage.name} - completed`,
        timestamp: new Date().toISOString()
      });

      currentStage++;
      setTimeout(processNextStage, 500);
    }, stage.duration);
  }

  // Start the process
  setTimeout(processNextStage, 1000);
}

// Validate environment for real connections
export function validateEnvironment() {
  return {
    canConnectGitHub: typeof window !== 'undefined',
    canConnectAWS: typeof window !== 'undefined',
    isDemo: true,
    features: {
      realGitHubOAuth: false,
      realAWSDeployment: false,
      mockConnections: true
    }
  };
}