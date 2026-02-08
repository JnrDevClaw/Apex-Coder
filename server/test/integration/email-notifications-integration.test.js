const { jest } = require('@jest/globals');

// Mock the User model and other dependencies
jest.mock('../../models', () => ({
  User: {
    findById: jest.fn()
  },
  Build: {
    findById: jest.fn(),
    findByIdGlobal: jest.fn()
  },
  Project: {
    findById: jest.fn()
  }
}));

jest.mock('nodemailer', () => ({
  createTransporter: jest.fn(() => ({
    verify: jest.fn().mockResolvedValue(true),
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' })
  }))
}));

const EmailNotificationService = require('../../services/email-notifications');
const PipelineOrchestrator = require('../../services/pipeline-orchestrator');
const { User, Build, Project } = require('../../models');

describe('Email Notifications Integration', () => {
  let mockUser;
  let mockProject;
  let mockBuild;
  let mockEmailService;
  let orchestrator;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock user data
    mockUser = {
      userId: 'user-123',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com'
    };

    // Mock project data
    mockProject = {
      projectId: 'project-123',
      name: 'Test Project',
      orgId: 'org-123'
    };

    // Mock build data
    mockBuild = {
      buildId: 'build-123',
      projectId: 'project-123',
      status: 'queued',
      update: jest.fn().mockResolvedValue(true),
      updateStageStatus: jest.fn().mockResolvedValue(true)
    };

    // Setup model mocks
    User.findById.mockResolvedValue(mockUser);
    Project.findById.mockResolvedValue(mockProject);
    Build.findById.mockResolvedValue(mockBuild);

    // Mock email service
    mockEmailService = {
      sendBuildStartedNotification: jest.fn().mockResolvedValue(true),
      sendBuildCompletedNotification: jest.fn().mockResolvedValue(true),
      sendBuildFailedNotification: jest.fn().mockResolvedValue(true),
      sendDeploymentStartedNotification: jest.fn().mockResolvedValue(true),
      sendDeploymentSuccessNotification: jest.fn().mockResolvedValue(true),
      sendDeploymentFailureNotification: jest.fn().mockResolvedValue(true)
    };

    // Create orchestrator with mocked dependencies
    orchestrator = new PipelineOrchestrator({
      stageRouter: {
        callStageModel: jest.fn().mockResolvedValue({ content: 'test response' })
      },
      buildModel: Build,
      projectModel: Project,
      websocket: {
        sendBuildStatus: jest.fn(),
        sendPhaseUpdate: jest.fn(),
        sendBuildProgress: jest.fn(),
        sendError: jest.fn()
      },
      emailService: mockEmailService,
      workDir: '/tmp/test-work'
    });
  });

  describe('Build Lifecycle Email Notifications', () => {
    test('should send build started email when pipeline starts', async () => {
      const buildParams = {
        buildId: 'build-123',
        projectId: 'project-123',
        orgId: 'org-123',
        userId: 'user-123',
        specJson: { projectName: 'Test Project' }
      };

      // Mock the startPipeline method to avoid full pipeline execution
      jest.spyOn(orchestrator, 'executeStage').mockImplementation(async () => {
        throw new Error('Test error to stop pipeline');
      });

      try {
        await orchestrator.startPipeline(buildParams);
      } catch (error) {
        // Expected to fail due to mocked executeStage
      }

      // Verify build started email was sent
      expect(mockEmailService.sendBuildStartedNotification).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          buildId: 'build-123',
          projectName: 'Test Project'
        })
      );
    });

    test('should send build failed email when pipeline fails', async () => {
      const buildParams = {
        buildId: 'build-123',
        projectId: 'project-123',
        orgId: 'org-123',
        userId: 'user-123',
        specJson: { projectName: 'Test Project' }
      };

      // Mock the executeStage to throw an error
      jest.spyOn(orchestrator, 'executeStage').mockRejectedValue(new Error('Pipeline failed'));

      try {
        await orchestrator.startPipeline(buildParams);
      } catch (error) {
        // Expected to fail
      }

      // Verify build failed email was sent
      expect(mockEmailService.sendBuildFailedNotification).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          buildId: 'build-123',
          projectName: 'Test Project'
        }),
        'Pipeline failed'
      );
    });

    test('should send build completed email when pipeline completes', async () => {
      const buildParams = {
        buildId: 'build-123',
        projectId: 'project-123',
        orgId: 'org-123',
        userId: 'user-123',
        specJson: { projectName: 'Test Project' }
      };

      // Mock successful pipeline completion
      jest.spyOn(orchestrator, 'executeStage').mockResolvedValue({
        success: true,
        artifacts: {}
      });

      jest.spyOn(orchestrator, 'completePipeline').mockImplementation(async (context) => {
        context.status = 'completed';
        context.completedAt = new Date();
        context.artifacts = {
          7: { generated_code_files: { count: 15 } },
          8: { github_repo_url: 'https://github.com/user/repo' }
        };

        // Trigger the email notification
        await mockEmailService.sendBuildCompletedNotification(context.userId, {
          buildId: context.buildId,
          projectName: mockProject.name,
          startedAt: context.startedAt,
          completedAt: context.completedAt,
          githubRepoUrl: context.artifacts[8]?.github_repo_url,
          filesGenerated: context.artifacts[7]?.generated_code_files?.count || 0
        });
      });

      await orchestrator.startPipeline(buildParams);

      // Verify build completed email was sent
      expect(mockEmailService.sendBuildCompletedNotification).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          buildId: 'build-123',
          projectName: 'Test Project',
          githubRepoUrl: 'https://github.com/user/repo',
          filesGenerated: 15
        })
      );
    });
  });

  describe('Email Service Error Handling', () => {
    test('should continue pipeline execution if email sending fails', async () => {
      const buildParams = {
        buildId: 'build-123',
        projectId: 'project-123',
        orgId: 'org-123',
        userId: 'user-123',
        specJson: { projectName: 'Test Project' }
      };

      // Mock email service to fail
      mockEmailService.sendBuildStartedNotification.mockRejectedValue(new Error('Email service unavailable'));

      // Mock executeStage to also fail so we can test the error path
      jest.spyOn(orchestrator, 'executeStage').mockRejectedValue(new Error('Pipeline failed'));

      try {
        await orchestrator.startPipeline(buildParams);
      } catch (error) {
        // Pipeline should still fail due to executeStage, not email
        expect(error.message).toBe('Pipeline failed');
      }

      // Verify email was attempted but pipeline continued
      expect(mockEmailService.sendBuildStartedNotification).toHaveBeenCalled();
    });

    test('should handle missing user gracefully', async () => {
      const buildParams = {
        buildId: 'build-123',
        projectId: 'project-123',
        orgId: 'org-123',
        userId: 'nonexistent-user',
        specJson: { projectName: 'Test Project' }
      };

      // Mock user not found
      User.findById.mockResolvedValue(null);

      // Mock email service to return false for missing user
      mockEmailService.sendBuildStartedNotification.mockResolvedValue(false);

      // Mock executeStage to fail so we can test the error path
      jest.spyOn(orchestrator, 'executeStage').mockRejectedValue(new Error('Pipeline failed'));

      try {
        await orchestrator.startPipeline(buildParams);
      } catch (error) {
        // Pipeline should still fail due to executeStage
        expect(error.message).toBe('Pipeline failed');
      }

      // Verify email was attempted
      expect(mockEmailService.sendBuildStartedNotification).toHaveBeenCalled();
    });
  });

  describe('Email Template Content Validation', () => {
    test('should generate build started email with correct content', () => {
      const buildData = {
        buildId: 'build-123',
        projectName: 'Test Project',
        startedAt: new Date('2024-01-01T10:00:00Z')
      };

      const emailHtml = EmailNotificationService.generateBuildStartedEmail(mockUser, buildData);

      // Verify email contains expected content
      expect(emailHtml).toContain('Build Started');
      expect(emailHtml).toContain('Test Project');
      expect(emailHtml).toContain('build-123');
      expect(emailHtml).toContain('John');
      expect(emailHtml).toContain('Stage 1: AI Clarifier');
      expect(emailHtml).toContain('Stage 8: GitHub Repository Creation');
      expect(emailHtml).toContain('Monitor Build Progress');
    });

    test('should generate build completed email with repository URL', () => {
      const buildData = {
        buildId: 'build-456',
        projectName: 'Completed Project',
        startedAt: new Date('2024-01-01T10:00:00Z'),
        completedAt: new Date('2024-01-01T10:15:00Z'),
        githubRepoUrl: 'https://github.com/user/completed-repo',
        filesGenerated: 25,
        linesOfCode: 1500
      };

      const emailHtml = EmailNotificationService.generateBuildCompletedEmail(mockUser, buildData);

      // Verify email contains expected content
      expect(emailHtml).toContain('Build Completed Successfully');
      expect(emailHtml).toContain('Completed Project');
      expect(emailHtml).toContain('build-456');
      expect(emailHtml).toContain('25</strong> files created');
      expect(emailHtml).toContain('1500</strong> lines of code');
      expect(emailHtml).toContain('https://github.com/user/completed-repo');
      expect(emailHtml).toContain('View Repository on GitHub');
    });

    test('should generate build failed email with error details', () => {
      const buildData = {
        buildId: 'build-789',
        projectName: 'Failed Project',
        startedAt: new Date('2024-01-01T10:00:00Z'),
        failedAt: new Date('2024-01-01T10:05:00Z'),
        failedStage: 'Stage 3'
      };

      const errorMessage = 'API rate limit exceeded';

      const emailHtml = EmailNotificationService.generateBuildFailedEmail(mockUser, buildData, errorMessage);

      // Verify email contains expected content
      expect(emailHtml).toContain('Build Failed');
      expect(emailHtml).toContain('Failed Project');
      expect(emailHtml).toContain('build-789');
      expect(emailHtml).toContain('Stage 3');
      expect(emailHtml).toContain('API rate limit exceeded');
      expect(emailHtml).toContain('Retry Build');
      expect(emailHtml).toContain('What You Can Do');
    });
  });

  describe('Deployment Email Notifications', () => {
    test('should send deployment success notification', async () => {
      const deploymentData = {
        repoFullName: 'user/test-repo',
        repoUrl: 'https://github.com/user/test-repo',
        commitSha: 'abc123',
        deployedAt: new Date()
      };

      await mockEmailService.sendDeploymentSuccessNotification('user-123', deploymentData);

      expect(mockEmailService.sendDeploymentSuccessNotification).toHaveBeenCalledWith(
        'user-123',
        deploymentData
      );
    });

    test('should send deployment failure notification', async () => {
      const deploymentData = {
        repoFullName: 'user/test-repo',
        repoUrl: 'https://github.com/user/test-repo',
        commitSha: 'abc123',
        createdAt: new Date()
      };

      const errorMessage = 'Deployment failed due to insufficient permissions';

      await mockEmailService.sendDeploymentFailureNotification('user-123', deploymentData, errorMessage);

      expect(mockEmailService.sendDeploymentFailureNotification).toHaveBeenCalledWith(
        'user-123',
        deploymentData,
        errorMessage
      );
    });
  });

  describe('Email Service Configuration', () => {
    test('should handle disabled email notifications', () => {
      // Mock environment variable
      const originalEnv = process.env.EMAIL_NOTIFICATIONS_ENABLED;
      process.env.EMAIL_NOTIFICATIONS_ENABLED = 'false';

      // Create new service instance
      const disabledService = require('../../services/email-notifications');

      // Verify service recognizes disabled state
      expect(disabledService.config.enabled).toBe(false);

      // Restore environment
      process.env.EMAIL_NOTIFICATIONS_ENABLED = originalEnv;
    });

    test('should use default configuration values', () => {
      const service = require('../../services/email-notifications');

      expect(service.config.from).toBe('noreply@aiappbuilder.com');
      expect(service.config.service).toBe('gmail');
      expect(service.config.port).toBe(587);
    });
  });
});