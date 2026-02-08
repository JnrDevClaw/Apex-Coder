/**
 * Test AWS Deployment Stage Handler
 * 
 * Verifies that handleAWSDeploymentStage:
 * 1. Detects application type from file structure
 * 2. Calls appropriate AWS deployment service
 * 3. Returns proper artifacts structure
 * 4. Handles missing credentials gracefully
 */

describe('AWS Deployment Stage', () => {
  test('should return proper artifacts structure when credentials are missing', async () => {
  // Mock context
  const mockContext = {
    buildId: 'test-build-123',
    projectId: 'test-project-456',
    userId: 'test-user-789',
    orgId: 'test-org-000',
    artifacts: {
      8: {
        repoUrl: 'https://github.com/test/repo',
        github_repo_url: 'https://github.com/test/repo'
      },
      5: {
        'frontend/index.html': 'Main page',
        'static/styles.css': 'Styles'
      }
    }
  };

  // Mock models
  const mockProjectModel = {
    findById: async () => ({
      projectType: 'static',
      name: 'Test Project'
    })
  };

  const mockBuildModel = {
    getUser: async () => null // No AWS credentials
  };

  // Create orchestrator instance
  const PipelineOrchestrator = require('../../services/pipeline-orchestrator');
  const orchestrator = new PipelineOrchestrator({
    projectModel: mockProjectModel,
    buildModel: mockBuildModel
  });

    // Test 1: Verify skipped deployment returns proper artifacts
    const result = await orchestrator.handleAWSDeploymentStage({}, mockContext);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.artifacts).toBeDefined();
    expect(result.artifacts.deployment_status).toBe('skipped');
    expect(result.artifacts.deployment_url).toBeNull();
    expect(result.artifacts.skip_reason).toBeDefined();
  });

  test('should detect project type from file structure', async () => {
    const PipelineOrchestrator = require('../../services/pipeline-orchestrator');
    const orchestrator = new PipelineOrchestrator({});

    // Test static site detection
    const staticContext = {
      artifacts: {
        5: {
          'index.html': 'Main page',
          'static/styles.css': 'Styles'
        }
      }
    };
    const staticType = orchestrator.inferProjectType(staticContext);
    expect(staticType).toBe('static');

    // Test containerized app detection
    const containerContext = {
      artifacts: {
        5: {
          'Dockerfile': 'Container config',
          'src/index.js': 'App code'
        }
      }
    };
    const containerType = orchestrator.inferProjectType(containerContext);
    expect(containerType).toBe('containerized');

    // Test serverless detection
    const serverlessContext = {
      artifacts: {
        5: {
          'lambda/handler.js': 'Lambda function',
          'serverless.yml': 'Serverless config'
        }
      }
    };
    const serverlessType = orchestrator.inferProjectType(serverlessContext);
    expect(serverlessType).toBe('serverless');
  });

  test('should select correct deployment type', async () => {
    const PipelineOrchestrator = require('../../services/pipeline-orchestrator');
    const orchestrator = new PipelineOrchestrator({});

    expect(orchestrator.selectDeploymentType('static')).toBe('s3-cloudfront');
    expect(orchestrator.selectDeploymentType('containerized')).toBe('ecs-fargate');
    expect(orchestrator.selectDeploymentType('serverless')).toBe('lambda');
    expect(orchestrator.selectDeploymentType('unknown')).toBe('s3-cloudfront');
  });
});
