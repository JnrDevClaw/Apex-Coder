const GCPDeploymentService = require('../../services/gcp-deployment');
const { CloudBuildClient } = require('@google-cloud/cloudbuild');
const { GoogleAuth } = require('google-auth-library');
const User = require('../../models/user');
const { decrypt } = require('../../services/encryption');
const { logDeploymentError } = require('../../services/deployment-error-logger');

// Mocks
jest.mock('@google-cloud/cloudbuild');
jest.mock('google-auth-library');
jest.mock('../../models/user');
jest.mock('../../services/encryption');
jest.mock('../../services/deployment-error-logger');

describe('GCPDeploymentService', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Mock CloudBuildClient constructor and methods
        CloudBuildClient.mockImplementation(() => ({
            createBuild: jest.fn().mockResolvedValue([{
                metadata: { build: { id: 'build-123', logUrl: 'http://logs' } },
                promise: jest.fn().mockResolvedValue([{ status: 'SUCCESS' }])
            }])
        }));

        // Mock GoogleAuth
        GoogleAuth.mockImplementation(() => ({
            getClient: jest.fn()
        }));
    });

    describe('deployFromGitHub', () => {
        it('should deploy successfully from GitHub', async () => {
            const userId = 'user-123';
            const userMock = {
                _id: userId,
                gcpServiceAccountKey: 'encrypted-key',
                githubToken: 'encrypted-token',
                gcpProjectId: 'my-project'
            };

            User.findById.mockResolvedValue(userMock);
            decrypt.mockImplementation((val) => {
                if (val === 'encrypted-key') return '{"project_id": "my-project"}';
                if (val === 'encrypted-token') return 'gh-token';
                return val;
            });

            const result = await GCPDeploymentService.deployFromGitHub(
                userId, 'proj-uuid', 'owner', 'repo', 'main', 'sha123'
            );

            expect(result.success).toBe(true);
            expect(result.buildId).toBe('build-123');
            expect(CloudBuildClient).toHaveBeenCalled();
        });

        it('should fail if user not found', async () => {
            User.findById.mockResolvedValue(null);

            await expect(GCPDeploymentService.deployFromGitHub(
                'user-123', 'proj', 'owner', 'repo'
            )).rejects.toThrow('User not found');
        });

        it('should fail if service account missing', async () => {
            User.findById.mockResolvedValue({ _id: 'user-123' }); // No key

            await expect(GCPDeploymentService.deployFromGitHub(
                'user-123', 'proj', 'owner', 'repo'
            )).rejects.toThrow('GCP Service Account not connected');
        });

        it('should handle build failure', async () => {
            const userId = 'user-123';
            const userMock = {
                _id: userId,
                gcpServiceAccountKey: 'encrypted-key',
                githubToken: 'encrypted-token',
                gcpProjectId: 'my-project'
            };

            User.findById.mockResolvedValue(userMock);
            decrypt.mockReturnValue('{}'); // simplified

            // Mock failure
            CloudBuildClient.mockImplementation(() => ({
                createBuild: jest.fn().mockResolvedValue([{
                    metadata: { build: { id: 'build-123', logUrl: 'http://logs' } },
                    promise: jest.fn().mockResolvedValue([{ status: 'FAILURE' }])
                }])
            }));

            await expect(GCPDeploymentService.deployFromGitHub(
                userId, 'proj-uuid', 'owner', 'repo', 'main', 'sha123'
            )).rejects.toThrow('Cloud Build failed');

            expect(logDeploymentError).toHaveBeenCalled();
        });
    });
});
