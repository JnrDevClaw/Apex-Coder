// Mock the User model to avoid database dependencies
jest.mock('../../models', () => ({
  User: {
    findById: jest.fn()
  }
}));

const EmailNotificationService = require('../../services/email-notifications');

describe('Email Notification Service', () => {
  test('should generate build started email template', () => {
    const mockUser = {
      firstName: 'John',
      email: 'john@example.com'
    };

    const mockBuildData = {
      buildId: 'build-123',
      projectName: 'My Test Project',
      startedAt: new Date('2024-01-01T10:00:00Z')
    };

    const emailHtml = EmailNotificationService.generateBuildStartedEmail(mockUser, mockBuildData);

    expect(emailHtml).toBeTruthy();
    expect(emailHtml).toContain('Build Started');
    expect(emailHtml).toContain('My Test Project');
    expect(emailHtml).toContain('build-123');
    expect(emailHtml).toContain('John');
    expect(emailHtml).toContain('Stage 1: AI Clarifier');
  });

  test('should generate build completed email template', () => {
    const mockUser = {
      firstName: 'Jane',
      email: 'jane@example.com'
    };

    const mockBuildData = {
      buildId: 'build-456',
      projectName: 'Another Project',
      startedAt: new Date('2024-01-01T10:00:00Z'),
      completedAt: new Date('2024-01-01T10:15:00Z'),
      githubRepoUrl: 'https://github.com/user/repo',
      filesGenerated: 42
    };

    const emailHtml = EmailNotificationService.generateBuildCompletedEmail(mockUser, mockBuildData);

    expect(emailHtml).toBeTruthy();
    expect(emailHtml).toContain('Build Completed Successfully');
    expect(emailHtml).toContain('Another Project');
    expect(emailHtml).toContain('build-456');
    expect(emailHtml).toContain('Jane');
    expect(emailHtml).toContain('42</strong> files created');
    expect(emailHtml).toContain('https://github.com/user/repo');
  });

  test('should generate build failed email template', () => {
    const mockUser = {
      firstName: 'Bob',
      email: 'bob@example.com'
    };

    const mockBuildData = {
      buildId: 'build-789',
      projectName: 'Failed Project',
      startedAt: new Date('2024-01-01T10:00:00Z'),
      failedAt: new Date('2024-01-01T10:05:00Z'),
      failedStage: 'Stage 3'
    };

    const errorMessage = 'API rate limit exceeded';

    const emailHtml = EmailNotificationService.generateBuildFailedEmail(mockUser, mockBuildData, errorMessage);

    expect(emailHtml).toBeTruthy();
    expect(emailHtml).toContain('Build Failed');
    expect(emailHtml).toContain('Failed Project');
    expect(emailHtml).toContain('build-789');
    expect(emailHtml).toContain('Bob');
    expect(emailHtml).toContain('Stage 3');
    expect(emailHtml).toContain('API rate limit exceeded');
  });

  test('should format duration correctly', () => {
    const startTime = new Date('2024-01-01T10:00:00Z');
    const endTime1 = new Date('2024-01-01T10:02:30Z'); // 2m 30s
    const endTime2 = new Date('2024-01-01T10:00:45Z'); // 45s

    const duration1 = EmailNotificationService.formatDuration(startTime, endTime1);
    const duration2 = EmailNotificationService.formatDuration(startTime, endTime2);

    expect(duration1).toBe('2m 30s');
    expect(duration2).toBe('45s');
  });

  test('should handle missing user data gracefully', () => {
    const mockUser = {
      // No firstName
      email: 'test@example.com'
    };

    const mockBuildData = {
      buildId: 'build-123',
      projectName: 'Test Project',
      startedAt: new Date()
    };

    const emailHtml = EmailNotificationService.generateBuildStartedEmail(mockUser, mockBuildData);

    expect(emailHtml).toBeTruthy();
    expect(emailHtml).toContain('Hi there');
  });

  test('should strip HTML from content for text version', () => {
    const htmlContent = '<h1>Test</h1><p>This is <strong>bold</strong> text.</p>';
    const textContent = EmailNotificationService.stripHtml(htmlContent);

    expect(textContent).toBe('Test This is bold text.');
  });
});