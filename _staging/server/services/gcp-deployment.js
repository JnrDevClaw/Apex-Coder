const { CloudBuildClient } = require('@google-cloud/cloudbuild');
const { GoogleAuth } = require('google-auth-library');
const User = require('../models/user');
const { decrypt } = require('./encryption');
const { logDeploymentError } = require('./deployment-error-logger');

class GCPDeploymentService {
    constructor() {
        // We instantiate clients per-request because credentials change per user
    }

    /**
     * Deploy to Cloud Run using Cloud Build, pulling source from GitHub
     * @param {string} userId - User ID
     * @param {string} projectUuid - Internal Project ID (for logging/metadata)
     * @param {string} repoOwner - GitHub Owner
     * @param {string} repoName - GitHub Repo Name
     * @param {string} branch - Branch to deploy (default: main)
     * @param {string} commitSha - Commit SHA (for tagging)
     * @returns {Promise<Object>} Deployment result
     */
    async deployFromGitHub(userId, projectUuid, repoOwner, repoName, branch = 'main', commitSha) {
        try {
            console.log(`[GCP-Deploy] Starting deployment for ${repoOwner}/${repoName} (User: ${userId})`);

            // 1. Get User and Credentials
            const user = await User.findById(userId);
            if (!user) throw new Error('User not found');

            if (!user.gcpServiceAccountKey) {
                throw new Error('GCP Service Account not connected');
            }

            let serviceAccountJson;
            try {
                const decryptedJson = decrypt(user.gcpServiceAccountKey);
                serviceAccountJson = JSON.parse(decryptedJson);
            } catch (err) {
                throw new Error('Failed to decrypt or parse GCP Service Account Key');
            }

            const gcpProjectId = user.gcpProjectId || serviceAccountJson.project_id;
            if (!gcpProjectId) {
                throw new Error('GCP Project ID could not be determined from Service Account Key');
            }

            // Get GitHub Token for cloning
            if (!user.githubToken) {
                throw new Error('GitHub token required for deployment');
            }
            const githubToken = decrypt(user.githubToken);

            // 2. Initialize Cloud Build Client with User Credentials
            const auth = new GoogleAuth({
                credentials: serviceAccountJson,
                scopes: ['https://www.googleapis.com/auth/cloud-platform']
            });

            const cbClient = new CloudBuildClient({ auth });

            // 3. Define Build Config
            // We use the standard 'cloud-sdk' image to run gcloud commands, and docker for building
            const imageName = `gcr.io/${gcpProjectId}/${repoName}:${commitSha || 'latest'}`;
            const serviceName = repoName.toLowerCase().replace(/[^a-z0-9-]/g, '').substring(0, 63); // Sanitize

            const buildRequest = {
                projectId: gcpProjectId,
                build: {
                    steps: [
                        // Step 0: Clone the repo
                        // We use a script to clone because we need to inject the token securely
                        {
                            name: 'gcr.io/cloud-builders/git',
                            entrypoint: 'bash',
                            args: [
                                '-c',
                                `git clone --branch ${branch} --depth 1 https://oauth2:$$GITHUB_TOKEN@github.com/${repoOwner}/${repoName}.git .`
                            ],
                            secretEnv: ['GITHUB_TOKEN']
                        },
                        // Step 1: Build Docker image
                        {
                            name: 'gcr.io/cloud-builders/docker',
                            args: ['build', '-t', imageName, '.']
                        },
                        // Step 2: Push Docker image
                        {
                            name: 'gcr.io/cloud-builders/docker',
                            args: ['push', imageName]
                        },
                        // Step 3: Deploy to Cloud Run
                        {
                            name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
                            entrypoint: 'gcloud',
                            args: [
                                'run', 'deploy', serviceName,
                                '--image', imageName,
                                '--region', 'us-central1', // Default region
                                '--platform', 'managed',
                                '--allow-unauthenticated' // Make it public by default for "One Click" apps
                            ]
                        }
                    ],
                    availableSecrets: {
                        secretManager: [], // Not used
                        inline: [{
                            envMap: {
                                GITHUB_TOKEN: Buffer.from(githubToken).toString('base64')
                            }
                        }]
                    },
                    timeout: '1200s'
                }
            };

            // 4. Trigger Build
            console.log(`[GCP-Deploy] Triggering Cloud Build in project ${gcpProjectId}...`);
            const [operation] = await cbClient.createBuild(buildRequest);

            console.log(`[GCP-Deploy] Build started. Operation metadata:`, operation.metadata);

            // Wait for build to complete?
            // For a user request, we might want to return "Deployment Started" and let them poll,
            // OR wait if it's within a pipeline stage with a long timeout.
            // The pipeline orchestrator waits.

            // We need the build ID to poll or wait
            const buildId = operation.metadata.build.id;
            const buildUrl = operation.metadata.build.logUrl;

            console.log(`[GCP-Deploy] Build ID: ${buildId}, Logs: ${buildUrl}`);

            // Wait for operation to complete
            const [response] = await operation.promise();

            if (response.status === 'SUCCESS') {
                // Construct Service URL
                // It's usually in the build logs or we can fetch the service details.
                // But 'gcloud run deploy' output isn't easily parsed from the API response object directly
                // unless we parse the logs or query Cloud Run API separately.
                // However, for "One Click", success is good.
                // We can guess the URL or query it.

                let serviceUrl = null;
                try {
                    serviceUrl = await this.getServiceUrl(gcpProjectId, serviceName, auth);
                } catch (e) {
                    console.warn('Could not fetch service URL:', e.message);
                }

                return {
                    success: true,
                    buildId,
                    buildUrl,
                    serviceUrl,
                    serviceName,
                    projectId: gcpProjectId
                };
            } else {
                throw new Error(`Cloud Build failed with status: ${response.status}`);
            }

        } catch (error) {
            console.error('[GCP-Deploy] Error:', error);
            logDeploymentError('deployFromGitHub', error, { userId, repoOwner, repoName });
            throw error;
        }
    }

    /**
     * Helper to get Cloud Run Service URL
     */
    async getServiceUrl(projectId, serviceName, auth) {
        // We can use the generic googleapis or a simple fetch if we don't want @google-cloud/run deps just for this
        // But since we are already authenticated...
        // Let's use gcloud output parsing from the build?? No, that's hard.
        // Let's rely on the predictable URL hash or just return null for now.
        // Actually, Cloud Run URLs are deterministic *if* we know the hash, but we don't.
        // TODO: Implement Cloud Run API select to get URL
        return `https://console.cloud.google.com/run/detail/us-central1/${serviceName}/metrics?project=${projectId}`;
    }
}

module.exports = new GCPDeploymentService();
