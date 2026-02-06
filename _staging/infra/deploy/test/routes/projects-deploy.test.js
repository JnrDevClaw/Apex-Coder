'use strict';

const { build } = require('../helper');

describe('Project Deployment Routes', () => {
  let app;

  beforeAll(async () => {
    app = await build();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/projects/:orgId/:projectId/deploy', () => {
    test('should queue deployment job successfully', async () => {
      // Mock authentication
      const mockUser = {
        userId: 'test-user-123',
        organizations: [{ orgId: 'test-org-123', role: 'dev' }]
      };

      // Mock project
      const mockProject = {
        projectId: 'test-project-123',
        orgId: 'test-org-123',
        name: 'Test Project',
        specJson: { projectName: 'test-app' },
        update: jest.fn().mockResolvedValue(true)
      };

      // Mock deployment
      const mockDeployment = {
        id: 'test-deployment-123',
        status: 'pending',
        save: jest.fn().mockResolvedValue(true)
      };

      // Mock models
      jest.mock('../../models', () => ({
        Project: {
          findById: jest.fn().mockResolvedValue(mockProject)
        },
        Deployment: jest.fn().mockImplementation(() => mockDeployment)
      }));

      const res = await app.inject({
        method: 'POST',
        url: '/api/projects/test-org-123/test-project-123/deploy',
        headers: {
          authorization: 'Bearer mock-token'
        },
        payload: {
          generatedFiles: {
            'index.html': '<html><body>Test</body></html>',
            'package.json': '{"name": "test-app"}'
          },
          deploymentOptions: {
            privateRepo: true,
            autoTriggerWorkflow: true
          }
        }
      });

      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('deploymentId');
      expect(body.data).toHaveProperty('status');
      expect(body.data.message).toBe('Deployment queued successfully');
    });

    test('should return 404 if project not found', async () => {
      jest.mock('../../models', () => ({
        Project: {
          findById: jest.fn().mockResolvedValue(null)
        }
      }));

      const res = await app.inject({
        method: 'POST',
        url: '/api/projects/test-org-123/nonexistent-project/deploy',
        headers: {
          authorization: 'Bearer mock-token'
        },
        payload: {
          generatedFiles: {}
        }
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('Project not found');
    });

    test('should return 503 if job queue not available', async () => {
      const mockProject = {
        projectId: 'test-project-123',
        orgId: 'test-org-123',
        name: 'Test Project'
      };

      jest.mock('../../models', () => ({
        Project: {
          findById: jest.fn().mockResolvedValue(mockProject)
        },
        Deployment: jest.fn().mockImplementation(() => ({
          id: 'test-deployment-123',
          save: jest.fn().mockResolvedValue(true)
        }))
      }));

      // Mock job queue as unavailable
      app.jobQueue = null;

      const res = await app.inject({
        method: 'POST',
        url: '/api/projects/test-org-123/test-project-123/deploy',
        headers: {
          authorization: 'Bearer mock-token'
        },
        payload: {
          generatedFiles: {}
        }
      });

      expect(res.statusCode).toBe(503);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('Job queue service not available');
    });
  });

  describe('GET /api/projects/:orgId/:projectId/deployments/:deploymentId', () => {
    test('should return deployment status', async () => {
      const mockDeployment = {
        id: 'test-deployment-123',
        projectId: 'test-project-123',
        userId: 'test-user-123',
        status: 'success',
        repoUrl: 'https://github.com/test/repo',
        commitSha: 'abc123'
      };

      jest.mock('../../models', () => ({
        Deployment: {
          findById: jest.fn().mockResolvedValue(mockDeployment)
        }
      }));

      const res = await app.inject({
        method: 'GET',
        url: '/api/projects/test-org-123/test-project-123/deployments/test-deployment-123',
        headers: {
          authorization: 'Bearer mock-token'
        }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('id');
      expect(body.data).toHaveProperty('status');
    });

    test('should return 404 if deployment not found', async () => {
      jest.mock('../../models', () => ({
        Deployment: {
          findById: jest.fn().mockResolvedValue(null)
        }
      }));

      const res = await app.inject({
        method: 'GET',
        url: '/api/projects/test-org-123/test-project-123/deployments/nonexistent',
        headers: {
          authorization: 'Bearer mock-token'
        }
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('Deployment not found');
    });
  });

  describe('GET /api/projects/:orgId/:projectId/deployments', () => {
    test('should return list of deployments for project', async () => {
      const mockDeployments = [
        {
          id: 'deployment-1',
          projectId: 'test-project-123',
          status: 'success',
          createdAt: '2024-01-01T00:00:00Z'
        },
        {
          id: 'deployment-2',
          projectId: 'test-project-123',
          status: 'pending',
          createdAt: '2024-01-02T00:00:00Z'
        }
      ];

      jest.mock('../../models', () => ({
        Deployment: {
          findByProjectId: jest.fn().mockResolvedValue(mockDeployments)
        }
      }));

      const res = await app.inject({
        method: 'GET',
        url: '/api/projects/test-org-123/test-project-123/deployments',
        headers: {
          authorization: 'Bearer mock-token'
        }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(2);
    });
  });
});
