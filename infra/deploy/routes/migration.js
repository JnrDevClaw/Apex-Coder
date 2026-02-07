const { sendErrorResponse, sendErrorFromException } = require('../utils/error-responses');

/**
 * Migration API Routes
 * 
 * Provides endpoints for managing project migration from old agent role system
 * to new stage-based pipeline system.
 */
async function migrationRoutes(fastify, options) {
  const PipelineMigration = require('../services/pipeline-migration');
  const { Project, Build } = require('../models');

  // Get migration status for a project
  fastify.get('/api/migration/status/:orgId/:projectId', {
    preHandler: fastify.requireOrganizationAccess('dev')
  }, async (request, reply) => {
    try {
      const { orgId, projectId } = request.params;

      const migration = new PipelineMigration({
        buildModel: Build,
        projectModel: Project
      });

      const status = await migration.getMigrationStatus(orgId, projectId);

      reply.send({
        success: true,
        data: status
      });
    } catch (error) {
      fastify.log.error('Error getting migration status:', error);
      return sendErrorFromException(reply, error, 'INTERNAL_ERROR');
    }
  });

  // Migrate a single project
  fastify.post('/api/migration/migrate/:orgId/:projectId', {
    preHandler: fastify.requireOrganizationAccess('admin'),
    schema: {
      body: {
        type: 'object',
        properties: {
          dryRun: { type: 'boolean', default: false },
          preserveBuilds: { type: 'boolean', default: true }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { orgId, projectId } = request.params;
      const { dryRun = false, preserveBuilds = true } = request.body;

      const migration = new PipelineMigration({
        buildModel: Build,
        projectModel: Project
      });

      const result = await migration.migrateProject(orgId, projectId, {
        dryRun,
        preserveBuilds
      });

      // Log audit event
      if (!dryRun && result.success) {
        const auditLogger = require('../services/audit-logger');
        await auditLogger.logProjectEvent(
          projectId,
          'project_migrated',
          {
            actor: request.user.userId,
            actorType: 'user',
            orgId,
            migratedBuilds: result.migratedBuilds?.length || 0,
            preservedArtifacts: result.preservedArtifacts?.length || 0,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent']
          }
        );
      }

      reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      fastify.log.error('Error migrating project:', error);
      return sendErrorFromException(reply, error, 'INTERNAL_ERROR');
    }
  });

  // Batch migrate projects
  fastify.post('/api/migration/batch/:orgId', {
    preHandler: fastify.requireOrganizationAccess('admin'),
    schema: {
      body: {
        type: 'object',
        required: ['projectIds'],
        properties: {
          projectIds: { 
            type: 'array',
            items: { type: 'string' },
            minItems: 1
          },
          dryRun: { type: 'boolean', default: false },
          preserveBuilds: { type: 'boolean', default: true }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { orgId } = request.params;
      const { projectIds, dryRun = false, preserveBuilds = true } = request.body;

      const migration = new PipelineMigration({
        buildModel: Build,
        projectModel: Project
      });

      const result = await migration.batchMigrateProjects(orgId, projectIds, {
        dryRun,
        preserveBuilds
      });

      // Log audit event
      if (!dryRun) {
        const auditLogger = require('../services/audit-logger');
        await auditLogger.logOrganizationEvent(
          orgId,
          'batch_migration_completed',
          {
            actor: request.user.userId,
            actorType: 'user',
            totalProjects: result.total,
            successful: result.successful,
            failed: result.failed,
            skipped: result.skipped,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent']
          }
        );
      }

      reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      fastify.log.error('Error batch migrating projects:', error);
      return sendErrorFromException(reply, error, 'INTERNAL_ERROR');
    }
  });

  // Validate migration for a project
  fastify.get('/api/migration/validate/:orgId/:projectId', {
    preHandler: fastify.requireOrganizationAccess('dev')
  }, async (request, reply) => {
    try {
      const { orgId, projectId } = request.params;

      const migration = new PipelineMigration({
        buildModel: Build,
        projectModel: Project
      });

      const validation = await migration.validateMigration(orgId, projectId);

      reply.send({
        success: true,
        data: validation
      });
    } catch (error) {
      fastify.log.error('Error validating migration:', error);
      return sendErrorFromException(reply, error, 'INTERNAL_ERROR');
    }
  });
}

module.exports = migrationRoutes;
