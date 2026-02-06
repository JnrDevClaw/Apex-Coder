/**
 * Pipeline Migration Service
 * 
 * Handles backward compatibility and migration between old agent role system
 * and new stage-based pipeline system.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

class PipelineMigration {
  constructor(options = {}) {
    this.buildModel = options.buildModel;
    this.projectModel = options.projectModel;
    this.pipelineMode = options.pipelineMode || process.env.PIPELINE_MODE || 'new';
  }

  /**
   * Detect if a project uses the old agent role system (Requirement 10.1)
   * @param {Object} project - Project object
   * @param {Object} build - Build object (optional)
   * @returns {boolean} True if project uses old system
   */
  isOldAgentRoleSystem(project, build = null) {
    // Check for indicators of old system
    const indicators = {
      // Old system used 'phase' field with values: planning, generation, testing, deployment
      hasOldPhaseField: build && build.phase && ['planning', 'generation', 'testing', 'deployment'].includes(build.phase),
      
      // Old system used 'phaseDetails' with these specific phases
      hasOldPhaseDetails: build && build.phaseDetails && 
        (build.phaseDetails.planning || build.phaseDetails.generation || 
         build.phaseDetails.testing || build.phaseDetails.deployment),
      
      // New system uses 'currentStage' (numeric) and 'stageStatuses'
      lacksNewStageFields: build && (build.currentStage === undefined || !build.stageStatuses),
      
      // Check project metadata for migration marker
      notMigrated: !project.pipelineVersion || project.pipelineVersion === 'v1-agent-roles',
      
      // Old system didn't have failedAt with stage numbers
      hasOldFailureFormat: build && build.errorMessage && !build.failedAt
    };

    // If any indicator suggests old system, return true
    const isOld = indicators.hasOldPhaseField || 
                  indicators.hasOldPhaseDetails || 
                  (indicators.lacksNewStageFields && indicators.notMigrated);

    if (isOld) {
      console.log(`[Migration] Detected old agent role system for project ${project.projectId}:`, {
        hasOldPhaseField: indicators.hasOldPhaseField,
        hasOldPhaseDetails: indicators.hasOldPhaseDetails,
        lacksNewStageFields: indicators.lacksNewStageFields,
        notMigrated: indicators.notMigrated
      });
    }

    return isOld;
  }

  /**
   * Determine which pipeline to use for a project (Requirement 10.2, 10.3)
   * @param {Object} project - Project object
   * @param {Object} build - Build object (optional)
   * @returns {string} 'old' or 'new'
   */
  selectPipeline(project, build = null) {
    // If pipeline mode is explicitly set to 'old', use old system
    if (this.pipelineMode === 'old') {
      console.log(`[Migration] Using old pipeline (forced by PIPELINE_MODE=old)`);
      return 'old';
    }

    // Check if project is marked as migrated
    if (project.pipelineVersion === 'v2-stage-based') {
      console.log(`[Migration] Using new pipeline (project marked as migrated)`);
      return 'new';
    }

    // Detect if project uses old system (Requirement 10.1, 10.2)
    if (this.isOldAgentRoleSystem(project, build)) {
      console.warn(`[Migration] ⚠️  Project ${project.projectId} uses old agent role system. Using old pipeline for backward compatibility.`);
      return 'old';
    }

    // Default to new pipeline for new projects (Requirement 10.3)
    console.log(`[Migration] Using new stage-based pipeline (default for new projects)`);
    return 'new';
  }

  /**
   * Migrate a project from old to new format (Requirement 10.4, 10.5)
   * @param {string} orgId - Organization ID
   * @param {string} projectId - Project ID
   * @param {Object} options - Migration options
   * @returns {Promise<Object>} Migration result
   */
  async migrateProject(orgId, projectId, options = {}) {
    const { dryRun = false, preserveBuilds = true } = options;

    console.log(`[Migration] Starting migration for project ${projectId} (dryRun: ${dryRun})`);

    try {
      // Load project
      const project = await this.projectModel.findById(orgId, projectId);
      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      // Check if already migrated
      if (project.pipelineVersion === 'v2-stage-based') {
        console.log(`[Migration] Project ${projectId} already migrated`);
        return {
          success: true,
          alreadyMigrated: true,
          message: 'Project already uses new stage-based pipeline'
        };
      }

      // Verify it's an old system project
      if (!this.isOldAgentRoleSystem(project)) {
        console.log(`[Migration] Project ${projectId} doesn't appear to use old system`);
        return {
          success: false,
          message: 'Project does not appear to use old agent role system'
        };
      }

      const migrationResult = {
        projectId,
        orgId,
        startedAt: new Date().toISOString(),
        preservedArtifacts: [],
        migratedBuilds: [],
        errors: []
      };

      // Preserve existing artifacts (Requirement 10.5)
      console.log(`[Migration] Preserving artifacts for project ${projectId}...`);
      
      // Load all builds for this project
      const builds = await this.buildModel.findByProject(projectId, 100);
      console.log(`[Migration] Found ${builds.length} builds to process`);

      // Migrate each build
      if (preserveBuilds) {
        for (const build of builds) {
          try {
            const buildMigration = await this.migrateBuild(build, dryRun);
            migrationResult.migratedBuilds.push(buildMigration);
            
            // Preserve artifact references
            if (build.artifactsS3Url) {
              migrationResult.preservedArtifacts.push({
                buildId: build.buildId,
                artifactsUrl: build.artifactsS3Url,
                logsUrl: build.logsS3Url
              });
            }
          } catch (buildError) {
            console.error(`[Migration] Failed to migrate build ${build.buildId}:`, buildError);
            migrationResult.errors.push({
              buildId: build.buildId,
              error: buildError.message
            });
          }
        }
      }

      // Update project metadata (Requirement 10.5)
      if (!dryRun) {
        await project.update({
          pipelineVersion: 'v2-stage-based',
          migratedAt: new Date().toISOString(),
          migrationMetadata: {
            previousVersion: 'v1-agent-roles',
            migratedBy: 'pipeline-migration-service',
            preservedBuilds: builds.length,
            preservedArtifacts: migrationResult.preservedArtifacts.length
          }
        });
        console.log(`[Migration] ✅ Updated project ${projectId} metadata`);
      } else {
        console.log(`[Migration] [DRY RUN] Would update project ${projectId} metadata`);
      }

      migrationResult.completedAt = new Date().toISOString();
      migrationResult.success = true;
      migrationResult.dryRun = dryRun;

      console.log(`[Migration] ✅ Migration completed for project ${projectId}:`, {
        migratedBuilds: migrationResult.migratedBuilds.length,
        preservedArtifacts: migrationResult.preservedArtifacts.length,
        errors: migrationResult.errors.length
      });

      return migrationResult;
    } catch (error) {
      console.error(`[Migration] ❌ Migration failed for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Migrate a single build from old to new format
   * @param {Object} build - Build object
   * @param {boolean} dryRun - Dry run mode
   * @returns {Promise<Object>} Migration result
   */
  async migrateBuild(build, dryRun = false) {
    console.log(`[Migration] Migrating build ${build.buildId}...`);

    const migration = {
      buildId: build.buildId,
      oldFormat: {
        phase: build.phase,
        phaseDetails: build.phaseDetails
      },
      newFormat: {
        currentStage: null,
        stageStatuses: {},
        artifacts: {},
        failedAt: null
      },
      changes: []
    };

    // Map old phases to new stages
    const phaseToStageMap = {
      'planning': { stage: 0, stageName: 'questionnaire' },
      'generation': { stage: 7, stageName: 'code-generation' },
      'testing': { stage: 7, stageName: 'code-generation' }, // Testing was part of generation
      'deployment': { stage: 8, stageName: 'repo-creation' }
    };

    // Determine current stage from old phase
    if (build.phase && phaseToStageMap[build.phase]) {
      const mapping = phaseToStageMap[build.phase];
      migration.newFormat.currentStage = mapping.stage;
      migration.changes.push(`Mapped phase '${build.phase}' to stage ${mapping.stage} (${mapping.stageName})`);
    }

    // Migrate phase details to stage statuses
    if (build.phaseDetails) {
      for (const [phaseName, phaseData] of Object.entries(build.phaseDetails)) {
        if (phaseToStageMap[phaseName]) {
          const mapping = phaseToStageMap[phaseName];
          migration.newFormat.stageStatuses[mapping.stageName] = {
            status: phaseData.status || 'pending',
            startedAt: phaseData.startedAt,
            completedAt: phaseData.completedAt,
            migratedFrom: phaseName
          };

          // Preserve artifacts
          if (phaseData.artifacts) {
            migration.newFormat.artifacts[mapping.stageName] = phaseData.artifacts;
          }

          migration.changes.push(`Migrated phase details '${phaseName}' to stage '${mapping.stageName}'`);
        }
      }
    }

    // Migrate failure information
    if (build.status === 'failed' && build.errorMessage) {
      // Try to determine which stage failed
      if (build.phase && phaseToStageMap[build.phase]) {
        const mapping = phaseToStageMap[build.phase];
        migration.newFormat.failedAt = `stage-${mapping.stage}`;
        migration.changes.push(`Mapped failure to stage ${mapping.stage}`);
      }
    }

    // Apply migration if not dry run
    if (!dryRun) {
      try {
        await build.update({
          currentStage: migration.newFormat.currentStage,
          stageStatuses: migration.newFormat.stageStatuses,
          artifacts: migration.newFormat.artifacts,
          failedAt: migration.newFormat.failedAt,
          migrationMetadata: {
            migratedAt: new Date().toISOString(),
            migratedFrom: 'v1-agent-roles',
            preservedPhase: build.phase,
            preservedPhaseDetails: build.phaseDetails
          }
        });
        migration.applied = true;
        console.log(`[Migration]   ✅ Migrated build ${build.buildId}`);
      } catch (updateError) {
        migration.applied = false;
        migration.error = updateError.message;
        console.error(`[Migration]   ❌ Failed to update build ${build.buildId}:`, updateError);
      }
    } else {
      migration.applied = false;
      migration.dryRun = true;
      console.log(`[Migration]   [DRY RUN] Would migrate build ${build.buildId}`);
    }

    return migration;
  }

  /**
   * Batch migrate multiple projects
   * @param {string} orgId - Organization ID
   * @param {Array<string>} projectIds - Array of project IDs
   * @param {Object} options - Migration options
   * @returns {Promise<Object>} Batch migration result
   */
  async batchMigrateProjects(orgId, projectIds, options = {}) {
    console.log(`[Migration] Starting batch migration for ${projectIds.length} projects`);

    const results = {
      total: projectIds.length,
      successful: 0,
      failed: 0,
      skipped: 0,
      projects: []
    };

    for (const projectId of projectIds) {
      try {
        const result = await this.migrateProject(orgId, projectId, options);
        
        if (result.success) {
          if (result.alreadyMigrated) {
            results.skipped++;
          } else {
            results.successful++;
          }
        } else {
          results.failed++;
        }

        results.projects.push({
          projectId,
          ...result
        });
      } catch (error) {
        results.failed++;
        results.projects.push({
          projectId,
          success: false,
          error: error.message
        });
      }
    }

    console.log(`[Migration] Batch migration completed:`, {
      total: results.total,
      successful: results.successful,
      failed: results.failed,
      skipped: results.skipped
    });

    return results;
  }

  /**
   * Get migration status for a project
   * @param {string} orgId - Organization ID
   * @param {string} projectId - Project ID
   * @returns {Promise<Object>} Migration status
   */
  async getMigrationStatus(orgId, projectId) {
    const project = await this.projectModel.findById(orgId, projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const builds = await this.buildModel.findByProject(projectId, 10);
    const latestBuild = builds.length > 0 ? builds[0] : null;

    return {
      projectId,
      pipelineVersion: project.pipelineVersion || 'v1-agent-roles',
      isMigrated: project.pipelineVersion === 'v2-stage-based',
      isOldSystem: this.isOldAgentRoleSystem(project, latestBuild),
      recommendedPipeline: this.selectPipeline(project, latestBuild),
      migrationMetadata: project.migrationMetadata || null,
      totalBuilds: builds.length,
      latestBuildStatus: latestBuild ? {
        buildId: latestBuild.buildId,
        status: latestBuild.status,
        phase: latestBuild.phase,
        currentStage: latestBuild.currentStage
      } : null
    };
  }

  /**
   * Validate migration for a project
   * @param {string} orgId - Organization ID
   * @param {string} projectId - Project ID
   * @returns {Promise<Object>} Validation result
   */
  async validateMigration(orgId, projectId) {
    console.log(`[Migration] Validating migration for project ${projectId}`);

    const project = await this.projectModel.findById(orgId, projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const validation = {
      projectId,
      isValid: true,
      issues: [],
      warnings: []
    };

    // Check if project is marked as migrated
    if (project.pipelineVersion !== 'v2-stage-based') {
      validation.issues.push('Project not marked as migrated (pipelineVersion !== v2-stage-based)');
      validation.isValid = false;
    }

    // Check builds
    const builds = await this.buildModel.findByProject(projectId, 50);
    for (const build of builds) {
      // Check if build has new format fields
      if (build.currentStage === undefined && build.status !== 'completed' && build.status !== 'failed') {
        validation.warnings.push(`Build ${build.buildId} missing currentStage field`);
      }

      // Check if old format fields are still present
      if (build.phase && !build.migrationMetadata) {
        validation.warnings.push(`Build ${build.buildId} has old 'phase' field without migration metadata`);
      }

      // Check artifact preservation
      if (build.artifactsS3Url && !build.artifacts) {
        validation.warnings.push(`Build ${build.buildId} has artifactsS3Url but no artifacts field`);
      }
    }

    validation.totalBuildsChecked = builds.length;
    validation.isValid = validation.issues.length === 0;

    console.log(`[Migration] Validation completed for project ${projectId}:`, {
      isValid: validation.isValid,
      issues: validation.issues.length,
      warnings: validation.warnings.length
    });

    return validation;
  }
}

module.exports = PipelineMigration;
