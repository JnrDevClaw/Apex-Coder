const gdprComplianceService = require('../services/gdpr-compliance');
const questionnaireAuditLogger = require('../services/questionnaire-audit-logger');

module.exports = async function (fastify, opts) {
  // Export user data (GDPR right to data portability)
  fastify.get('/api/gdpr/export', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      const userId = request.user.id;
      const data = await gdprComplianceService.exportUserData(userId);
      
      return reply
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', `attachment; filename="user-data-${userId}.json"`)
        .send(data);
    } catch (error) {
      fastify.log.error('Error exporting user data:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to export user data'
      });
    }
  });

  // Delete user data (GDPR right to erasure)
  fastify.delete('/api/gdpr/delete', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      const userId = request.user.id;
      await gdprComplianceService.deleteUserData(userId);
      
      // Log the deletion
      await questionnaireAuditLogger.logUserAction(userId, 'gdpr_data_deletion', {
        timestamp: new Date().toISOString(),
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });
      
      return reply.send({
        success: true,
        message: 'User data deleted successfully'
      });
    } catch (error) {
      fastify.log.error('Error deleting user data:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to delete user data'
      });
    }
  });

  // Get user consent status
  fastify.get('/api/gdpr/consent', {
    preHandler: fastify.authenticate
  }, async (request, reply) => {
    try {
      const userId = request.user.id;
      const consent = await gdprComplianceService.getUserConsent(userId);
      
      return reply.send({
        success: true,
        consent
      });
    } catch (error) {
      fastify.log.error('Error getting user consent:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to get user consent'
      });
    }
  });

  // Update user consent
  fastify.post('/api/gdpr/consent', {
    preHandler: fastify.authenticate,
    schema: {
      body: {
        type: 'object',
        required: ['consentType', 'granted'],
        properties: {
          consentType: { type: 'string' },
          granted: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const userId = request.user.id;
      const { consentType, granted } = request.body;
      
      await gdprComplianceService.updateUserConsent(userId, consentType, granted);
      
      // Log the consent update
      await questionnaireAuditLogger.logUserAction(userId, 'gdpr_consent_update', {
        consentType,
        granted,
        timestamp: new Date().toISOString(),
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });
      
      return reply.send({
        success: true,
        message: 'Consent updated successfully'
      });
    } catch (error) {
      fastify.log.error('Error updating user consent:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to update consent'
      });
    }
  });
};
