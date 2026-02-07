const fastifyPlugin = require('fastify-plugin');
const { encrypt } = require('../services/encryption');
const { GoogleAuth } = require('google-auth-library');
const User = require('../models/user');

async function gcpIntegrationRoutes(fastify, options) {
    // Connect GCP Account
    fastify.post('/api/gcp/connect', {
        preHandler: fastify.authenticate,
        schema: {
            body: {
                type: 'object',
                required: ['serviceAccountKey'],
                properties: {
                    serviceAccountKey: { type: 'object' } // Expecting the full JSON object
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { serviceAccountKey } = request.body;
            const userId = request.user.userId;

            // 1. Basic Validation
            if (!serviceAccountKey.project_id || !serviceAccountKey.private_key || !serviceAccountKey.client_email) {
                return reply.code(400).send({
                    error: 'Invalid Service Account Key',
                    message: 'The provided JSON key is missing required fields (project_id, private_key, client_email).'
                });
            }

            // 2. Validate Credentials by creating a client (Dry Run)
            try {
                const auth = new GoogleAuth({
                    credentials: serviceAccountKey,
                    scopes: ['https://www.googleapis.com/auth/cloud-platform']
                });
                await auth.getClient(); // Attempts to initialize client
                // Ideally we'd make a lightweight API call like getting project details, but getClient() checks structure.
            } catch (authError) {
                fastify.log.warn(`GCP Validation failed for user ${userId}:`, authError);
                return reply.code(400).send({
                    error: 'Validation Failed',
                    message: 'Could not authenticate with the provided key. Please check the credentials.'
                });
            }

            // 3. Encrypt and Store
            const keyString = JSON.stringify(serviceAccountKey);
            const encryptedKey = encrypt(keyString);
            const gcpProjectId = serviceAccountKey.project_id;

            const user = await User.findById(userId);
            await user.update({
                gcpServiceAccountKey: encryptedKey,
                gcpProjectId: gcpProjectId,
                gcpConnectedAt: new Date().toISOString()
            });

            fastify.log.info(`User ${userId} connected GCP project ${gcpProjectId}`);

            reply.send({
                success: true,
                projectId: gcpProjectId,
                connectedAt: user.gcpConnectedAt
            });

        } catch (error) {
            fastify.log.error('GCP Connect Error:', error);
            reply.code(500).send({
                error: 'Internal Server Error',
                message: error.message
            });
        }
    });

    // Get GCP Connection Status
    fastify.get('/api/gcp/status', {
        preHandler: fastify.authenticate
    }, async (request, reply) => {
        try {
            const userId = request.user.userId;
            const user = await User.findById(userId);

            const isConnected = !!user.gcpServiceAccountKey && !!user.gcpProjectId;

            reply.send({
                connected: isConnected,
                projectId: user.gcpProjectId || null,
                connectedAt: user.gcpConnectedAt || null
            });

        } catch (error) {
            fastify.log.error('GCP Status Error:', error);
            reply.code(500).send({
                error: 'Internal Server Error',
                message: error.message
            });
        }
    });
}

module.exports = fastifyPlugin(gcpIntegrationRoutes);
