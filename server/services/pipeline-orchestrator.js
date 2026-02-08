const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;

/**
 * Pipeline Orchestrator Service
 * 
 * Implements the canonical 8-stage pipeline from the Guide.md:
 * Stage 0: Questionnaire → specs.json (no AI)
 * Stage 1: HF Clarifier → specs_refined.json
 * Stage 1.5: GPT-5 Mini Normalizer → specs_clean.json
 * Stage 2: Llama 4 Scout → docs.md
 * Stage 3: DeepSeek-V3 → schema.json
 * Stage 3.5: GPT-5 Mini Structural Validator → structural_issues.json
 * Stage 4: GPT-4o → file_structure.json
 * Stage 5: Claude 3.5 Haiku → validated_structure.json
 * Stage 6: Worker creates empty files
 * Stage 7: GPT-5 Mini + Gemini-3 → code files
 * Stage 8: GitHub repo creation
 */
class PipelineOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.stageRouter = options.stageRouter;
    this.artifactStorage = options.artifactStorage;
    this.buildModel = options.buildModel;
    this.projectModel = options.projectModel;
    this.websocket = options.websocket;
    this.emailService = options.emailService || require('./email-notifications');
    this.workDir = options.workDir || process.env.WORK_DIR || path.resolve(process.cwd(), 'work');

    // Track active builds
    this.activeBuilds = new Map();

    // Define the User-Specified 9-Stage Pipeline (from Audio Instructions)
    this.PIPELINE_STAGES = {
      0: {
        name: 'questionnaire',
        description: 'User input → specs.json',
        requiresAI: false,
        inputArtifacts: [],
        outputArtifacts: ['specs.json'],
        handler: 'handleQuestionnaireStage',
        timeout: 0
      },
      1: {
        name: 'refinement', // User: "OpenRouter to refine specs"
        description: 'OpenRouter Refines Specs',
        requiresAI: true,
        model: 'openrouter',
        modelName: 'mistralai/mistral-7b-instruct', // Efficient refiner
        inputArtifacts: ['specs.json'],
        outputArtifacts: ['refined_specs.json'],
        handler: 'handleClarifierStage', // Reusing handler logic for refinement
        promptTemplate: 'refinement',
        timeout: 300000,
        retries: 2
      },
      2: {
        name: 'docs-creation', // User: "Llama creates full documentation"
        description: 'Llama 3.1 Creates Documentation',
        requiresAI: true,
        model: 'github-models',
        modelName: 'Meta-Llama-3.1-8B-Instruct',
        inputArtifacts: ['refined_specs.json'],
        outputArtifacts: ['documentation.md'],
        handler: 'handleDocsCreatorStage',
        promptTemplate: 'docs-creator',
        timeout: 600000,
        retries: 2
      },
      3: {
        name: 'schema-creation', // User: "ElectronHub DeepSeek creates schema"
        description: 'DeepSeek Creates Schema',
        requiresAI: true,
        model: 'electronhub',
        modelName: 'deepseek-r1', // or specific model if available
        inputArtifacts: ['documentation.md'],
        outputArtifacts: ['schema.json', 'documentation_with_schema.md'], // User: "Attach schema to docs"
        handler: 'handleSchemaGeneratorStage',
        promptTemplate: 'schema-generator',
        timeout: 600000,
        retries: 2
      },
      4: {
        name: 'file-structure', // User: "GPT-4o via ElectronHub creates file structure"
        description: 'GPT-4o Creates File Structure',
        requiresAI: true,
        model: 'electronhub',
        modelName: 'gpt-4o',
        inputArtifacts: ['documentation_with_schema.md'], // Uses master doc
        outputArtifacts: ['file_structure.json'],
        handler: 'handleFileStructureGeneratorStage',
        promptTemplate: 'file-structure-generator',
        timeout: 600000,
        retries: 2
      },
      5: {
        name: 'structure-validation', // User: "Claude validator checks design vs structure"
        description: 'Claude Validator Checks Structure',
        requiresAI: true,
        model: 'electronhub',
        modelName: 'claude-sonnet-3.5', // Smart validator
        inputArtifacts: ['documentation_with_schema.md', 'file_structure.json'],
        outputArtifacts: ['validated_structure.json'],
        handler: 'handleValidatorStage',
        promptTemplate: 'validator',
        timeout: 300000,
        retries: 2
      },
      6: {
        name: 'empty-file-creation',
        description: 'Worker Creates Empty Files',
        requiresAI: false,
        inputArtifacts: ['validated_structure.json'],
        outputArtifacts: ['empty_files_created'],
        handler: 'handleEmptyFileCreationStage',
        timeout: 300000,
        retries: 1
      },
      7: {
        name: 'prompt-builder', // User: "GPT-5 Mini creates prompt per file"
        description: 'Prompt Builder (Architect)',
        requiresAI: true,
        model: 'electronhub',
        modelName: 'gpt-5-mini',
        inputArtifacts: ['validated_structure.json', 'documentation_with_schema.md'],
        outputArtifacts: ['gemini_prompts.json'], // Collection of prompts
        handler: 'handlePromptBuilderStage',
        promptTemplate: 'prompt-builder',
        timeout: 600000,
        retries: 2
      },
      8: {
        name: 'code-generation', // User: "Gemini-3 writes code from prompts"
        description: 'Gemini-3 Code Generator',
        requiresAI: true,
        model: 'gemini',
        modelName: 'gemini-3-flash-preview',
        inputArtifacts: ['gemini_prompts.json'], // Takes pre-built prompts
        outputArtifacts: ['generated_code_files'],
        handler: 'handleCodeGenerationStage',
        promptTemplate: 'gemini-coder', // Simpler template, mostly pass-through
        timeout: 3600000,
        retries: 3,
        concurrency: 5 // Gemini is fast
      },
      9: {
        name: 'repo-push',
        description: 'Push to GitHub',
        requiresAI: false,
        inputArtifacts: ['generated_code_files'],
        outputArtifacts: ['github_repo_url'],
        handler: 'handleRepoCreationStage',
        timeout: 600000,
        retries: 2
      }
    };
  }

  /**
   * Start the 8-stage pipeline for a project
   * @param {Object} params - Build parameters
   * @param {string} params.buildId - Build ID
   * @param {string} params.projectId - Project ID
   * @param {string} params.orgId - Organization ID
   * @param {Object} params.specJson - Initial specification
   * @param {string} params.userId - User ID
   * @returns {Promise<Object>} Build result
   */
  async startPipeline(params) {
    const {
      buildId,
      projectId,
      orgId,
      specJson,
      userId
    } = params;

    console.log(`Starting pipeline for build ${buildId}`);

    // Create build context
    const context = {
      buildId,
      projectId,
      orgId,
      userId,
      specJson,
      userId,
      startedAt: new Date(),
      currentStage: 0,
      completedStages: [],
      failedStage: null,
      artifacts: {},
      status: 'running',
      projectDir: path.join(this.workDir, projectId)
    };

    // Process initial artifacts if provided (from interactive refinement)
    if (params.initialArtifacts) {
      console.log(`[Build ${buildId}] Initial artifacts provided:`, Object.keys(params.initialArtifacts));

      // Map initial artifacts to pipeline stages
      // Stage 1: Refined Specs
      if (params.initialArtifacts.refinedSpec) {
        context.artifacts[1] = {
          'refined_specs.json': params.initialArtifacts.refinedSpec,
          'specs_refined.json': params.initialArtifacts.refinedSpec // Alias for compatibility
        };
        context.completedStages.push(1);
      }

      // Stage 2: Documentation
      if (params.initialArtifacts.generatedDocs) {
        context.artifacts[2] = {
          'documentation.md': params.initialArtifacts.generatedDocs,
          'docs.md': params.initialArtifacts.generatedDocs // Alias for compatibility
        };
        context.completedStages.push(2);
      }

      // Stage 3: Schema
      if (params.initialArtifacts.schema) {
        context.artifacts[3] = {
          'schema.json': params.initialArtifacts.schema
        };
        context.completedStages.push(3);
      }

      // Stage 4: File Structure
      if (params.initialArtifacts.fileStructure) {
        context.artifacts[4] = {
          'file_structure.json': params.initialArtifacts.fileStructure
        };
        context.completedStages.push(4);
      }
    }

    this.activeBuilds.set(buildId, context);

    try {
      // Create project directory structure
      await this.createProjectDirectoryStructure(context.projectDir);

      // Update build status
      const build = await this.buildModel.findById(projectId, buildId);
      if (build) {
        await build.update({
          status: 'running',
          currentStage: 0
        });
      }

      // Emit pipeline started event
      this.emit('pipeline:started', { buildId, projectId });

      // Send build started email notification
      try {
        const project = await this.projectModel.findById(orgId, projectId);
        if (project && userId) {
          await this.emailService.sendBuildStartedNotification(userId, {
            buildId,
            projectName: project.name || 'Untitled Project',
            startedAt: context.startedAt
          });
          console.log(`[Build ${buildId}] Build started email sent to user ${userId}`);
        }
      } catch (emailError) {
        console.warn(`[Build ${buildId}] Failed to send build started email:`, emailError.message);
        // Don't fail the build if email fails
      }

      // Send WebSocket update
      if (this.websocket) {
        this.websocket.sendBuildStatus(buildId, 'running', {
          message: 'Pipeline started',
          totalStages: Object.keys(this.PIPELINE_STAGES).length
        });
      }

      // Start with stage 0 (questionnaire)
      await this.executeStage(0, context);

      return {
        success: true,
        buildId,
        status: 'running',
        message: 'Pipeline started successfully'
      };
    } catch (error) {
      console.error(`Pipeline failed for build ${buildId}:`, error);

      context.status = 'failed';
      context.error = error.message;
      context.completedAt = new Date();

      // Update build status
      const build = await this.buildModel.findById(projectId, buildId);
      if (build) {
        await build.update({
          status: 'failed',
          errorMessage: error.message,
          failedAt: `stage-${context.currentStage}`
        });
      }

      this.emit('pipeline:failed', { buildId, projectId, error: error.message });

      // Send build failed email notification
      try {
        if (userId) {
          const project = await this.projectModel.findById(orgId, projectId);
          await this.emailService.sendBuildFailedNotification(userId, {
            buildId,
            projectName: project?.name || 'Untitled Project',
            startedAt: context.startedAt,
            failedAt: new Date(),
            failedStage: `Stage ${context.currentStage}`
          }, error.message);
          console.log(`[Build ${buildId}] Build failed email sent to user ${userId}`);
        }
      } catch (emailError) {
        console.warn(`[Build ${buildId}] Failed to send build failed email:`, emailError.message);
        // Don't fail further if email fails
      }

      // Send WebSocket error
      if (this.websocket) {
        this.websocket.sendError(buildId, {
          message: error.message,
          stage: context.currentStage
        });
      }

      throw error;
    }
  }

  /**
   * Create project directory structure
   * @param {string} projectDir - Project directory path
   */
  async createProjectDirectoryStructure(projectDir) {
    const subdirs = ['specs', 'docs', 'code'];

    for (const subdir of subdirs) {
      const dirPath = path.join(projectDir, subdir);
      await fs.mkdir(dirPath, { recursive: true });
    }

    console.log(`Created project directory structure at ${projectDir}`);
  }

  /**
   * Execute a specific pipeline stage
   * @param {number} stageNumber - Stage number (0-8)
   * @param {Object} context - Build context with artifacts
   * @returns {Promise<Object>} Stage result
   */
  async executeStage(stageNumber, context) {
    const stage = this.PIPELINE_STAGES[stageNumber];
    if (!stage) {
      throw new Error(`Invalid stage number: ${stageNumber}`);
    }

    console.log(`Executing stage ${stageNumber}: ${stage.name} for build ${context.buildId}`);

    context.currentStage = stageNumber;

    // Emit stage started event
    this.emit('stage:started', {
      buildId: context.buildId,
      stage: stageNumber,
      stageName: stage.name
    });

    // Send WebSocket update
    if (this.websocket) {
      this.websocket.sendPhaseUpdate(context.buildId, stage.name, 'started', {
        stageNumber,
        completedStages: context.completedStages.length,
        totalStages: Object.keys(this.PIPELINE_STAGES).length
      });
    }

    // Update build with current stage
    const build = await this.buildModel.findById(context.projectId, context.buildId);
    if (build) {
      await build.update({ currentStage: stageNumber });
      await build.updateStageStatus(stage.name, 'running');
    }

    try {
      // Check if artifacts for this stage were already provided (skipped execution)
      if (context.artifacts[stageNumber] && Object.keys(context.artifacts[stageNumber]).length > 0) {
        console.log(`[Build ${context.buildId}] Stage ${stageNumber} (${stage.name}) artifacts already provided. Skipping execution.`);

        // Emulate successful completion
        const result = {
          success: true,
          artifacts: context.artifacts[stageNumber],
          skipped: true,
          message: 'Stage skipped using provided artifacts'
        };

        // Persist provided artifacts to ensure they exist on disk (Requirement 7.4)
        await this.persistStageArtifacts(stageNumber, stage, context, result.artifacts);

        // Update build stage status
        if (build) {
          await build.updateStageStatus(stage.name, 'completed', {
            artifacts: result.artifacts,
            skipped: true
          });
        }

        // Emit stage completed event
        this.emit('stage:completed', {
          buildId: context.buildId,
          stage: stageNumber,
          stageName: stage.name,
          result
        });

        // Send WebSocket update for skip
        if (this.websocket) {
          this.websocket.sendPhaseUpdate(context.buildId, stage.name, 'completed', {
            stageNumber,
            completedStages: context.completedStages.length,
            totalStages: Object.keys(this.PIPELINE_STAGES).length,
            result,
            skipped: true
          });

          const progress = ((context.completedStages.length) / Object.keys(this.PIPELINE_STAGES).length) * 100;
          this.websocket.sendBuildProgress(context.buildId, {
            percentage: Math.round(progress),
            currentStage: stage.name,
            status: 'completed'
          });
        }

        // Move to next stage
        const nextStageNumber = this.getNextStage(stageNumber);
        if (nextStageNumber !== null) {
          await this.executeStage(nextStageNumber, context);
        } else {
          await this.completePipeline(context);
        }

        return result;
      }

      // Execute stage handler with retry logic (Requirements 7.1, 7.2)
      const result = await this.executeStageWithRetry(stageNumber, stage, context);

      // Store stage artifacts
      context.artifacts[stageNumber] = result.artifacts || {};
      context.completedStages.push(stageNumber);

      // Persist artifacts to storage (Requirements 7.4, 8.1-8.10)
      await this.persistStageArtifacts(stageNumber, stage, context, result.artifacts);

      // Update build stage status
      if (build) {
        await build.updateStageStatus(stage.name, 'completed', {
          artifacts: result.artifacts
        });
      }

      // Emit stage completed event
      this.emit('stage:completed', {
        buildId: context.buildId,
        stage: stageNumber,
        stageName: stage.name,
        result
      });

      // Send WebSocket update
      if (this.websocket) {
        this.websocket.sendPhaseUpdate(context.buildId, stage.name, 'completed', {
          stageNumber,
          completedStages: context.completedStages.length,
          totalStages: Object.keys(this.PIPELINE_STAGES).length,
          result
        });

        // Send progress update
        const progress = ((context.completedStages.length) / Object.keys(this.PIPELINE_STAGES).length) * 100;
        this.websocket.sendBuildProgress(context.buildId, {
          percentage: Math.round(progress),
          currentStage: stage.name,
          status: 'completed'
        });
      }

      // Move to next stage
      const nextStageNumber = this.getNextStage(stageNumber);
      if (nextStageNumber !== null) {
        await this.executeStage(nextStageNumber, context);
      } else {
        await this.completePipeline(context);
      }

      return result;
    } catch (error) {
      console.error(`[Build ${context.buildId}] Stage ${stageNumber} (${stage.name}) failed permanently:`, error);

      context.failedStage = stageNumber;
      context.status = 'failed';
      context.error = error.message;

      // Persist artifacts even on failure (Requirements 7.4)
      // This ensures we don't lose intermediate work
      console.log(`[Build ${context.buildId}] Persisting intermediate artifacts before halting pipeline...`);
      await this.persistStageArtifacts(stageNumber, stage, context, context.artifacts[stageNumber] || {});

      // Update build status (Requirements 7.3, 7.5)
      if (build) {
        await build.update({
          status: 'failed',
          errorMessage: error.message,
          failedAt: `stage-${stageNumber}`,
          completedAt: new Date().toISOString()
        });
        await build.updateStageStatus(stage.name, 'failed', {
          error: error.message,
          failedAt: new Date().toISOString()
        });
      }

      // Emit stage failed event
      this.emit('stage:failed', {
        buildId: context.buildId,
        stage: stageNumber,
        stageName: stage.name,
        error: error.message
      });

      // Send WebSocket error
      if (this.websocket) {
        this.websocket.sendError(context.buildId, {
          message: error.message,
          stage: stage.name,
          stageNumber,
          failedAt: `stage-${stageNumber}`
        }, stage.name);

        this.websocket.sendPhaseUpdate(context.buildId, stage.name, 'failed', {
          error: error.message,
          stageNumber,
          failedAt: `stage-${stageNumber}`
        });
      }

      // Pipeline halts here - do not proceed to next stage (Requirements 7.5)
      console.log(`[Build ${context.buildId}] 🛑 Pipeline halted at stage ${stageNumber} (${stage.name})`);

      throw error;
    }
  }

  /**
   * Execute stage with retry logic (Requirements 7.1, 7.2)
   * Implements exponential backoff: 500ms → 1500ms
   * @param {number} stageNumber - Stage number
   * @param {Object} stage - Stage configuration
   * @param {Object} context - Build context
   * @returns {Promise<Object>} Stage result
   */
  async executeStageWithRetry(stageNumber, stage, context) {
    const maxRetries = stage.retries || 0;
    const backoffDelays = [0, 500, 1500]; // Initial attempt (0ms), 1st retry (500ms), 2nd retry (1500ms)
    let attempt = 0;
    let lastError;

    // Get build for error logging
    const build = await this.buildModel.findById(context.projectId, context.buildId);

    while (attempt <= maxRetries) {
      try {
        // Calculate backoff delay (Requirements 7.1)
        if (attempt > 0) {
          const backoff = backoffDelays[attempt] || 1500; // Default to 1500ms for any additional retries
          console.log(`[Build ${context.buildId}] Retrying stage ${stageNumber} (${stage.name}) after ${backoff}ms (attempt ${attempt + 1}/${maxRetries + 1})`);

          // Send WebSocket retry notification
          if (this.websocket) {
            this.websocket.sendPhaseUpdate(context.buildId, stage.name, 'retrying', {
              attempt: attempt + 1,
              maxAttempts: maxRetries + 1,
              backoffMs: backoff,
              previousError: lastError?.message
            });
          }

          await this.sleep(backoff);
        }

        // Log attempt
        console.log(`[Build ${context.buildId}] Executing stage ${stageNumber} (${stage.name}) - attempt ${attempt + 1}/${maxRetries + 1}`);

        // Execute stage handler
        const handler = this[stage.handler];
        if (!handler) {
          throw new Error(`Handler ${stage.handler} not found for stage ${stageNumber}`);
        }

        const result = await handler.call(this, stage, context);

        // If we succeeded after retries, log success (Requirements 7.2)
        if (attempt > 0) {
          console.log(`[Build ${context.buildId}] ✅ Stage ${stageNumber} (${stage.name}) succeeded after ${attempt} retries`);

          if (this.websocket) {
            this.websocket.sendPhaseUpdate(context.buildId, stage.name, 'retry-success', {
              attempt: attempt + 1,
              retriesNeeded: attempt
            });
          }
        }

        return result;
      } catch (error) {
        lastError = error;
        attempt++;

        // Log error (Requirements 7.3, 7.4)
        console.error(`[Build ${context.buildId}] ❌ Stage ${stageNumber} (${stage.name}) attempt ${attempt} failed:`, error.message);

        // Store error log in build model
        if (build) {
          await build.logStageError(stage.name, stageNumber, error, {
            attempt,
            maxRetries,
            isFinalFailure: attempt > maxRetries
          });
        }

        // If we've exhausted retries, break
        if (attempt > maxRetries) {
          break;
        }
      }
    }

    // All retries exhausted (Requirements 7.3, 7.5)
    const finalError = new Error(
      `Stage ${stageNumber} (${stage.name}) failed after ${maxRetries + 1} attempts: ${lastError.message}`
    );

    console.error(`[Build ${context.buildId}] 🚫 Stage ${stageNumber} (${stage.name}) failed permanently after ${maxRetries + 1} attempts`);

    // Mark build as failed at this stage
    if (build) {
      await build.markFailedAtStage(stageNumber, stage.name, finalError.message);
    }

    throw finalError;
  }

  /**
   * Persist stage artifacts to storage (Requirements 7.4, 8.1-8.10)
   * Ensures artifacts are saved even on failure
   * @param {number} stageNumber - Stage number
   * @param {Object} stage - Stage configuration
   * @param {Object} context - Build context
   * @param {Object} artifacts - Stage artifacts
   */
  async persistStageArtifacts(stageNumber, stage, context, artifacts) {
    try {
      if (!artifacts || Object.keys(artifacts).length === 0) {
        console.log(`[Build ${context.buildId}] No artifacts to persist for stage ${stageNumber} (${stage.name})`);
        return;
      }

      console.log(`[Build ${context.buildId}] Persisting ${Object.keys(artifacts).length} artifacts for stage ${stageNumber} (${stage.name})...`);

      // Write artifacts to project directory
      const persistedArtifacts = [];
      for (const [artifactName, artifactData] of Object.entries(artifacts)) {
        try {
          const artifactPath = this.getArtifactPath(context.projectDir, artifactName);
          await this.writeArtifact(artifactPath, artifactData);
          persistedArtifacts.push(artifactName);
          console.log(`[Build ${context.buildId}]   ✅ Persisted: ${artifactName}`);
        } catch (artifactError) {
          console.error(`[Build ${context.buildId}]   ❌ Failed to persist ${artifactName}:`, artifactError.message);
          // Continue with other artifacts even if one fails
        }
      }

      // Store artifact metadata in build model
      const build = await this.buildModel.findById(context.projectId, context.buildId);
      if (build) {
        await build.storeStageArtifacts(stage.name, {
          artifactNames: persistedArtifacts,
          artifactCount: persistedArtifacts.length,
          projectDir: context.projectDir,
          persistedAt: new Date().toISOString()
        });
      }

      console.log(`[Build ${context.buildId}] ✅ Successfully persisted ${persistedArtifacts.length}/${Object.keys(artifacts).length} artifacts for stage ${stageNumber} (${stage.name})`);
    } catch (error) {
      console.error(`[Build ${context.buildId}] ⚠️  Failed to persist artifacts for stage ${stageNumber}:`, error.message);
      // Don't throw - artifact persistence failure shouldn't stop the pipeline
      // But log the error for debugging

      const build = await this.buildModel.findById(context.projectId, context.buildId);
      if (build) {
        await build.logStageError(stage.name, stageNumber, error, {
          type: 'artifact_persistence_failure',
          artifactNames: Object.keys(artifacts)
        });
      }
    }
  }

  /**
   * Get artifact file path
   * @param {string} projectDir - Project directory
   * @param {string} artifactName - Artifact name
   * @returns {string} Artifact path
   */
  getArtifactPath(projectDir, artifactName) {
    // Determine subdirectory based on artifact type
    let subdir = 'specs';
    if (artifactName.endsWith('.md')) {
      subdir = 'docs';
    } else if (artifactName.includes('code') || artifactName.includes('file')) {
      subdir = 'code';
    }

    return path.join(projectDir, subdir, artifactName);
  }

  /**
   * Write artifact to file
   * @param {string} filePath - File path
   * @param {any} data - Artifact data
   */
  async writeArtifact(filePath, data) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    if (typeof data === 'string') {
      await fs.writeFile(filePath, data, 'utf8');
    } else {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    }
  }

  /**
   * Read artifact from file
   * @param {string} filePath - File path
   * @returns {Promise<any>} Artifact data
   */
  async readArtifact(filePath) {
    const content = await fs.readFile(filePath, 'utf8');

    // Try to parse as JSON
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }

  /**
   * Get next stage number
   * @param {number} currentStage - Current stage number
   * @returns {number|null} Next stage number or null if complete
   */
  getNextStage(currentStage) {
    const stageNumbers = Object.keys(this.PIPELINE_STAGES).map(Number).sort((a, b) => a - b);
    const currentIndex = stageNumbers.indexOf(currentStage);

    if (currentIndex === -1 || currentIndex === stageNumbers.length - 1) {
      return null;
    }

    return stageNumbers[currentIndex + 1];
  }

  /**
   * Complete pipeline
   * @param {Object} context - Build context
   */
  async completePipeline(context) {
    console.log(`Pipeline completed for build ${context.buildId}`);

    context.status = 'completed';
    context.completedAt = new Date();

    // Update build status
    const build = await this.buildModel.findById(context.projectId, context.buildId);
    if (build) {
      await build.update({
        status: 'completed',
        completedAt: new Date().toISOString(),
        artifactsS3Url: context.artifacts[7]?.artifactsUrl || null
      });
    }

    // Update project status
    const project = await this.projectModel.findById(context.orgId, context.projectId);
    if (project) {
      await project.update({
        status: 'built'
      });
    }

    // Emit pipeline completed event
    this.emit('pipeline:completed', {
      buildId: context.buildId,
      projectId: context.projectId,
      artifacts: context.artifacts
    });

    // Send build completed email notification
    try {
      if (context.userId) {
        const githubRepoUrl = context.artifacts[8]?.github_repo_url;
        const filesGenerated = context.artifacts[7]?.generated_code_files?.count || 0;

        await this.emailService.sendBuildCompletedNotification(context.userId, {
          buildId: context.buildId,
          projectName: project?.name || 'Untitled Project',
          startedAt: context.startedAt,
          completedAt: context.completedAt,
          githubRepoUrl,
          filesGenerated
        });
        console.log(`[Build ${context.buildId}] Build completed email sent to user ${context.userId}`);
      }
    } catch (emailError) {
      console.warn(`[Build ${context.buildId}] Failed to send build completed email:`, emailError.message);
      // Don't fail the build if email fails
    }

    // Send WebSocket completion update
    if (this.websocket) {
      this.websocket.sendBuildStatus(context.buildId, 'completed', {
        message: 'Pipeline completed successfully',
        artifacts: context.artifacts,
        duration: new Date() - context.startedAt
      });

      this.websocket.sendBuildProgress(context.buildId, {
        percentage: 100,
        status: 'completed'
      });
    }

    // Clean up
    this.activeBuilds.delete(context.buildId);
  }

  /**
   * Get pipeline status
   * @param {string} buildId - Build ID
   * @returns {Object} Pipeline status
   */
  getPipelineStatus(buildId) {
    const context = this.activeBuilds.get(buildId);
    if (!context) {
      return null;
    }

    return {
      buildId: context.buildId,
      projectId: context.projectId,
      status: context.status,
      currentStage: context.currentStage,
      completedStages: context.completedStages,
      failedStage: context.failedStage,
      startedAt: context.startedAt,
      completedAt: context.completedAt,
      error: context.error
    };
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Stage handlers (to be implemented)
  async handleQuestionnaireStage(stage, context) {
    // Stage 0: specs.json already exists from questionnaire
    return {
      success: true,
      artifacts: {
        'specs.json': context.specJson
      }
    };
  }

  async handleClarifierStage(stage, context) {
    // Stage 1: OpenRouter refines specs through batch Q&A
    console.log(`[Build ${context.buildId}] Stage 1: OpenRouter Refinement (Batch Q&A)`);

    try {
      // Load specs.json from previous stage
      const specsPath = path.join(context.projectDir, 'specs', 'specs.json');
      const specs = await this.readArtifact(specsPath).catch(error => {
        throw new Error(`Failed to load specs.json: ${error.message}. Ensure Stage 0 completed successfully.`);
      });

      // Initialize conversation history
      const conversationHistory = [];
      let specsRefined = { ...specs };

      // Get prompt template manager
      const promptTemplateManager = require('./prompt-templates');

      // Build prompt to generate ALL questions at once
      let prompt;
      try {
        prompt = promptTemplateManager.getTemplate('clarifier', {
          specs_json: JSON.stringify(specs, null, 2),
          conversation_history: '' // Empty for first batch
        });
      } catch (error) {
        throw new Error(`Failed to load clarifier prompt template: ${error.message}`);
      }

      console.log(`[Build ${context.buildId}] Generating batch clarification questions...`);

      // Call HuggingFace clarifier model via stage router to get ALL questions
      const response = await this.stageRouter.callStageModel(1, prompt, {
        context: {
          buildId: context.buildId,
          projectId: context.projectId,
          batchMode: true
        },
        timeout: stage.timeout
      }).catch(error => {
        throw new Error(`HuggingFace clarifier model call failed: ${error.message}. Check model availability and API credentials.`);
      });

      // Extract response content
      if (!response || !response.content) {
        throw new Error('Clarifier model returned empty response. Check model configuration and input data.');
      }

      const clarifierResponse = response.content.trim();

      // Check if specification is already complete
      if (clarifierResponse.includes('SPECIFICATION_COMPLETE')) {
        console.log(`[Build ${context.buildId}] Specification is already complete, no clarification needed`);

        conversationHistory.push({
          role: 'clarifier',
          content: 'Specification is complete',
          timestamp: new Date().toISOString()
        });

        return {
          success: true,
          artifacts: {
            'specs_refined.json': specs,
            'clarification_history.json': conversationHistory
          }
        };
      }

      // Parse the numbered questions from the response
      const questions = this.parseNumberedQuestions(clarifierResponse);

      if (questions.length === 0) {
        console.log(`[Build ${context.buildId}] No questions generated, using original specs`);
        return {
          success: true,
          artifacts: {
            'specs_refined.json': specs,
            'clarification_history.json': conversationHistory
          }
        };
      }

      console.log(`[Build ${context.buildId}] Generated ${questions.length} clarification questions`);

      // Store questions in conversation history
      conversationHistory.push({
        role: 'clarifier',
        content: clarifierResponse,
        questions: questions,
        timestamp: new Date().toISOString()
      });

      // Send WebSocket update with all questions
      if (this.websocket) {
        this.websocket.sendPhaseUpdate(context.buildId, 'clarifier', 'questions_generated', {
          questionCount: questions.length,
          questions: questions
        });
      }

      // In production, we would wait for user to provide batch answers
      // For now, auto-generate responses for all questions
      console.log(`[Build ${context.buildId}] Auto-generating responses for ${questions.length} questions...`);

      const batchAnswers = this.generateBatchAnswers(questions, specs);

      if (!batchAnswers || batchAnswers.length === 0) {
        throw new Error('Failed to generate batch answers for clarification questions. Check answer generation logic.');
      }

      // Store user responses in conversation history
      conversationHistory.push({
        role: 'user',
        content: this.formatBatchAnswers(batchAnswers),
        answers: batchAnswers,
        timestamp: new Date().toISOString()
      });

      // --- CONSOLIDATION STEP (User Audio Requirement) ---
      console.log(`[Build ${context.buildId}] Consolidating conversation into refined specs...`);

      try {
        // Build consolidation prompt
        const consolidationPrompt = promptTemplateManager.getTemplate('refinement-consolidation', {
          specs_json: JSON.stringify(specs, null, 2),
          conversation_history: JSON.stringify(conversationHistory, null, 2)
        });

        // Call model for consolidation (using same stage model, potentially falling back)
        const consolidationResponse = await this.stageRouter.callStageModel(1, consolidationPrompt, {
          context: {
            buildId: context.buildId,
            projectId: context.projectId,
            task: 'consolidation'
          },
          timeout: stage.timeout
        });

        // Parse JSON from response
        let refinedContent = consolidationResponse.content.trim();
        // Remove markdown code blocks if present
        if (refinedContent.includes('```json')) {
          refinedContent = refinedContent.split('```json')[1].split('```')[0].trim();
        } else if (refinedContent.includes('```')) {
          refinedContent = refinedContent.split('```')[1].split('```')[0].trim();
        }

        specsRefined = JSON.parse(refinedContent);
        console.log(`[Build ${context.buildId}] ✅ Specs successfully refined via AI consolidation`);

      } catch (error) {
        console.warn(`[Build ${context.buildId}] ⚠️ AI Consolidation failed, falling back to manual update: ${error.message}`);
        // Fallback to manual update
        specsRefined = this.updateSpecsFromBatchAnswers(specs, questions, batchAnswers);
      }

      if (!specsRefined || Object.keys(specsRefined).length === 0) {
        throw new Error('Failed to update specs from batch answers. Refined specs are empty.');
      }

      console.log(`[Build ${context.buildId}] ✅ Clarification complete with ${questions.length} Q&A pairs`);

      // Send WebSocket update for completion
      if (this.websocket) {
        this.websocket.sendPhaseUpdate(context.buildId, 'clarifier', 'completed', {
          questionCount: questions.length,
          answersReceived: batchAnswers.length
        });
      }

      // Return refined specs and conversation history
      return {
        success: true,
        artifacts: {
          'specs_refined.json': specsRefined,
          'clarification_history.json': conversationHistory
        }
      };
    } catch (error) {
      // Enhance error with stage context (Requirements 1.4, 7.3)
      const enhancedError = new Error(
        `Stage 1 (Clarifier) failed: ${error.message}. ` +
        `Build ID: ${context.buildId}, Project ID: ${context.projectId}. ` +
        `Ensure HuggingFace API is accessible and specs.json is valid.`
      );
      enhancedError.stage = 'clarifier';
      enhancedError.stageNumber = 1;
      enhancedError.buildId = context.buildId;
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  /**
   * Parse numbered questions from clarifier response
   * @param {string} response - Clarifier response with numbered questions
   * @returns {Array<Object>} Array of question objects with number and text
   */
  parseNumberedQuestions(response) {
    const questions = [];

    // Match numbered questions (1., 2., 3., etc.)
    const questionRegex = /(\d+)\.\s*(.+?)(?=\n\d+\.|$)/gs;
    let match;

    while ((match = questionRegex.exec(response)) !== null) {
      const questionNumber = parseInt(match[1], 10);
      const questionText = match[2].trim();

      if (questionText && questionText.length > 0) {
        questions.push({
          number: questionNumber,
          text: questionText
        });
      }
    }

    return questions;
  }

  /**
   * Generate batch answers for all questions
   * In production, this would come from user input
   * @param {Array<Object>} questions - Array of question objects
   * @param {Object} specs - Current specs
   * @returns {Array<Object>} Array of answer objects
   */
  generateBatchAnswers(questions, specs) {
    return questions.map(question => {
      const answer = this.generateAutoResponse(question.text, specs);
      return {
        number: question.number,
        question: question.text,
        answer: answer
      };
    });
  }

  /**
   * Format batch answers in "question_number: answer" format
   * @param {Array<Object>} answers - Array of answer objects
   * @returns {string} Formatted batch answers
   */
  formatBatchAnswers(answers) {
    return answers.map(a => `${a.number}: ${a.answer}`).join('\n');
  }

  /**
   * Update specs from batch answers
   * @param {Object} specs - Original specs
   * @param {Array<Object>} questions - Array of question objects
   * @param {Array<Object>} answers - Array of answer objects
   * @returns {Object} Updated specs
   */
  updateSpecsFromBatchAnswers(specs, questions, answers) {
    let updated = { ...specs };

    // Process each Q&A pair
    for (const answer of answers) {
      updated = this.updateSpecsFromClarification(updated, answer.question, answer.answer);
    }

    // Add batch clarification metadata
    updated._clarifications = updated._clarifications || [];
    updated._clarifications.push({
      type: 'batch',
      questionCount: questions.length,
      timestamp: new Date().toISOString(),
      questions: questions.map(q => q.text),
      answers: answers.map(a => a.answer)
    });

    return updated;
  }

  /**
   * Generate an automatic response to a clarifier question
   * In production, this would come from the user
   * @param {string} question - Clarifier question
   * @param {Object} specs - Current specs
   * @returns {string} Auto-generated response
   */
  generateAutoResponse(question, specs) {
    // Simple heuristic-based response generation
    const questionLower = question.toLowerCase();

    if (questionLower.includes('authentication') || questionLower.includes('auth')) {
      return 'Yes, we need JWT-based authentication with email/password login.';
    }

    if (questionLower.includes('database') || questionLower.includes('storage')) {
      return 'We will use DynamoDB for data storage.';
    }

    if (questionLower.includes('deployment') || questionLower.includes('hosting')) {
      return 'The application should be deployed on AWS using ECS/Fargate.';
    }

    if (questionLower.includes('frontend') || questionLower.includes('ui')) {
      return 'The frontend should be built with SvelteKit and Tailwind CSS.';
    }

    if (questionLower.includes('api') || questionLower.includes('endpoint')) {
      return 'We need RESTful APIs with JSON responses.';
    }

    // Default response
    return 'Please use best practices and industry standards for this feature.';
  }

  /**
   * Update specs based on clarification Q&A
   * @param {Object} specs - Current specs
   * @param {string} question - Clarifier question
   * @param {string} answer - User answer
   * @returns {Object} Updated specs
   */
  updateSpecsFromClarification(specs, question, answer) {
    // Create a copy of specs
    const updated = { ...specs };

    // Extract key information from Q&A and update specs
    const questionLower = question.toLowerCase();
    const answerLower = answer.toLowerCase();

    if (questionLower.includes('authentication')) {
      updated.authentication = updated.authentication || {};
      if (answerLower.includes('jwt')) {
        updated.authentication.type = 'JWT';
      }
      if (answerLower.includes('email')) {
        updated.authentication.methods = ['email/password'];
      }
    }

    if (questionLower.includes('database')) {
      updated.database = updated.database || {};
      if (answerLower.includes('dynamodb')) {
        updated.database.type = 'DynamoDB';
      } else if (answerLower.includes('postgres')) {
        updated.database.type = 'PostgreSQL';
      }
    }

    if (questionLower.includes('deployment')) {
      updated.deployment = updated.deployment || {};
      if (answerLower.includes('aws')) {
        updated.deployment.platform = 'AWS';
      }
      if (answerLower.includes('ecs') || answerLower.includes('fargate')) {
        updated.deployment.service = 'ECS/Fargate';
      }
    }

    if (questionLower.includes('frontend')) {
      updated.frontend = updated.frontend || {};
      if (answerLower.includes('svelte')) {
        updated.frontend.framework = 'SvelteKit';
      }
      if (answerLower.includes('tailwind')) {
        updated.frontend.styling = 'Tailwind CSS';
      }
    }

    // Add clarification metadata
    updated._clarifications = updated._clarifications || [];
    updated._clarifications.push({
      question,
      answer,
      timestamp: new Date().toISOString()
    });

    return updated;
  }

  async handleNormalizerStage(stage, context) {
    // Stage 1.5: GPT-5 Mini normalizes specs
    console.log(`[Build ${context.buildId}] Stage 1.5: GPT-5 Mini Normalizer`);

    try {
      // Load specs_refined.json from previous stage (Requirement 1.1)
      const specsRefinedPath = path.join(context.projectDir, 'specs', 'specs_refined.json');
      const specsRefined = await this.readArtifact(specsRefinedPath).catch(error => {
        throw new Error(`Failed to load specs_refined.json: ${error.message}. Ensure Stage 1 (Clarifier) completed successfully.`);
      });

      if (!specsRefined || Object.keys(specsRefined).length === 0) {
        throw new Error('specs_refined.json is empty or invalid. Cannot proceed with normalization.');
      }

      // Get prompt template manager
      const promptTemplateManager = require('./prompt-templates');

      // Load and populate prompt template for normalizer
      const prompt = promptTemplateManager.getTemplate('normalizer', {
        specs_refined_json: JSON.stringify(specsRefined, null, 2)
      }).catch(error => {
        throw new Error(`Failed to load normalizer prompt template: ${error.message}`);
      });

      // Call GPT-5 Mini normalizer via stage router (Requirement 1.1)
      const response = await this.stageRouter.callStageModel(1.5, prompt, {
        context: {
          buildId: context.buildId,
          projectId: context.projectId
        },
        timeout: stage.timeout
      }).catch(error => {
        throw new Error(`GPT-5 Mini normalizer model call failed: ${error.message}. Check Zukijourney API availability and credentials.`);
      });

      if (!response || !response.content) {
        throw new Error('Normalizer model returned empty response. Check model configuration.');
      }

      // Extract and parse JSON response (Requirement 1.2)
      let specsClean;
      try {
        // Try to extract JSON from response
        const jsonMatch = response.content.match(/```json\s*([\s\S]*?)\s*```/) ||
          response.content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          specsClean = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        } else {
          specsClean = JSON.parse(response.content);
        }

        if (!specsClean || Object.keys(specsClean).length === 0) {
          throw new Error('Parsed specs_clean.json is empty');
        }

        console.log(`[Build ${context.buildId}] ✅ Successfully normalized specs`);
      } catch (parseError) {
        throw new Error(
          `Failed to parse normalized specs JSON: ${parseError.message}. ` +
          `Model response may not be valid JSON. Response preview: ${response.content.substring(0, 200)}...`
        );
      }

      // Return normalized specs artifact (Requirement 1.3)
      return {
        success: true,
        artifacts: {
          'specs_clean.json': specsClean
        }
      };
    } catch (error) {
      // Enhance error with stage context (Requirements 1.4, 7.3)
      const enhancedError = new Error(
        `Stage 1.5 (Normalizer) failed: ${error.message}. ` +
        `Build ID: ${context.buildId}, Project ID: ${context.projectId}. ` +
        `Ensure GPT-5 Mini is accessible via Zukijourney and specs_refined.json is valid.`
      );
      enhancedError.stage = 'normalizer';
      enhancedError.stageNumber = 1.5;
      enhancedError.buildId = context.buildId;
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  async handleDocsCreatorStage(stage, context) {
    // Stage 2: Llama 4 Scout generates comprehensive documentation
    console.log(`[Build ${context.buildId}] Stage 2: Llama 4 Scout Docs Creator`);

    try {
      // Load specs_clean.json and clarification_history.json (Requirement 2.1)
      const specsCleanPath = path.join(context.projectDir, 'specs', 'specs_clean.json');
      const clarificationHistoryPath = path.join(context.projectDir, 'specs', 'clarification_history.json');

      const specsClean = await this.readArtifact(specsCleanPath).catch(error => {
        throw new Error(`Failed to load specs_clean.json: ${error.message}. Ensure Stage 1.5 (Normalizer) completed successfully.`);
      });

      if (!specsClean || Object.keys(specsClean).length === 0) {
        throw new Error('specs_clean.json is empty or invalid. Cannot generate documentation.');
      }

      let clarificationHistory = [];

      try {
        clarificationHistory = await this.readArtifact(clarificationHistoryPath);
      } catch (error) {
        console.log(`[Build ${context.buildId}] No clarification history found, proceeding without it`);
      }

      // Get prompt template manager
      const promptTemplateManager = require('./prompt-templates');

      // Load and populate prompt template for docs-creator
      const prompt = promptTemplateManager.getTemplate('docs-creator', {
        specs_clean_json: JSON.stringify(specsClean, null, 2),
        clarification_history: JSON.stringify(clarificationHistory, null, 2)
      }).catch(error => {
        throw new Error(`Failed to load docs-creator prompt template: ${error.message}`);
      });

      // Call Llama 4 Scout via stage router (Requirement 2.1)
      const response = await this.stageRouter.callStageModel(2, prompt, {
        context: {
          buildId: context.buildId,
          projectId: context.projectId
        },
        timeout: stage.timeout
      }).catch(error => {
        throw new Error(`Llama 4 Scout model call failed: ${error.message}. Check GitHub Models API availability and credentials.`);
      });

      if (!response || !response.content) {
        throw new Error('Docs creator model returned empty response. Check model configuration.');
      }

      // Extract markdown from response (Requirement 2.2)
      let docsMd = response.content;

      // If response is wrapped in code blocks, extract it
      const mdMatch = docsMd.match(/```markdown\s*([\s\S]*?)\s*```/) ||
        docsMd.match(/```md\s*([\s\S]*?)\s*```/);

      if (mdMatch) {
        docsMd = mdMatch[1];
      }

      if (!docsMd || docsMd.trim().length === 0) {
        throw new Error('Generated docs.md is empty. Model may have failed to generate documentation.');
      }

      console.log(`[Build ${context.buildId}] ✅ Successfully generated docs.md (${docsMd.length} characters)`);

      // Return docs.md artifact (Requirement 2.3)
      return {
        success: true,
        artifacts: {
          'docs.md': docsMd
        }
      };
    } catch (error) {
      // Enhance error with stage context (Requirements 2.4, 7.3)
      const enhancedError = new Error(
        `Stage 2 (Docs Creator) failed: ${error.message}. ` +
        `Build ID: ${context.buildId}, Project ID: ${context.projectId}. ` +
        `Ensure Llama 4 Scout is accessible via GitHub Models and specs_clean.json is valid.`
      );
      enhancedError.stage = 'docs-creator';
      enhancedError.stageNumber = 2;
      enhancedError.buildId = context.buildId;
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  async handleSchemaGeneratorStage(stage, context) {
    // Stage 3: DeepSeek-V3 generates database schema
    console.log(`[Build ${context.buildId}] Stage 3: DeepSeek-V3 Schema Generator`);

    try {
      // Load docs.md from previous stage (Requirement 3.1)
      const docsPath = path.join(context.projectDir, 'docs', 'docs.md');
      const docsMd = await this.readArtifact(docsPath).catch(error => {
        throw new Error(`Failed to load docs.md: ${error.message}. Ensure Stage 2 (Docs Creator) completed successfully.`);
      });

      if (!docsMd || docsMd.trim().length === 0) {
        throw new Error('docs.md is empty or invalid. Cannot generate schema.');
      }

      // Get prompt template manager
      const promptTemplateManager = require('./prompt-templates');

      // Load and populate prompt template for schema-generator
      const prompt = promptTemplateManager.getTemplate('schema-generator', {
        docs_md: docsMd
      }).catch(error => {
        throw new Error(`Failed to load schema-generator prompt template: ${error.message}`);
      });

      // Call DeepSeek-V3 via stage router (Requirement 3.1)
      const response = await this.stageRouter.callStageModel(3, prompt, {
        context: {
          buildId: context.buildId,
          projectId: context.projectId
        },
        timeout: stage.timeout
      }).catch(error => {
        throw new Error(`DeepSeek-V3 model call failed: ${error.message}. Check DeepSeek API availability and credentials.`);
      });

      if (!response || !response.content) {
        throw new Error('Schema generator model returned empty response. Check model configuration.');
      }

      // Parse JSON schema from response (Requirement 3.2)
      let schemaJson;
      try {
        // Try to extract JSON from response
        const jsonMatch = response.content.match(/```json\s*([\s\S]*?)\s*```/) ||
          response.content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          schemaJson = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        } else {
          schemaJson = JSON.parse(response.content);
        }

        if (!schemaJson || Object.keys(schemaJson).length === 0) {
          throw new Error('Parsed schema.json is empty');
        }

        console.log(`[Build ${context.buildId}] ✅ Successfully generated schema.json`);
      } catch (parseError) {
        throw new Error(
          `Failed to parse schema JSON: ${parseError.message}. ` +
          `Model response may not be valid JSON. Response preview: ${response.content.substring(0, 200)}...`
        );
      }

      // Update docs.md with schema section (Requirement 3.3)
      const schemaSection = `\n\n## Database Schema (Auto-generated)\n\n\`\`\`json\n${JSON.stringify(schemaJson, null, 2)}\n\`\`\`\n`;
      const updatedDocs = docsMd + schemaSection;

      // Write updated docs back (Requirement 3.4)
      await this.writeArtifact(docsPath, updatedDocs).catch(error => {
        throw new Error(`Failed to write updated docs.md: ${error.message}`);
      });

      // Return schema.json and updated docs.md artifacts (Requirement 3.4)
      return {
        success: true,
        artifacts: {
          'schema.json': schemaJson,
          'docs.md': updatedDocs
        }
      };
    } catch (error) {
      // Enhance error with stage context (Requirements 3.5, 7.3)
      const enhancedError = new Error(
        `Stage 3 (Schema Generator) failed: ${error.message}. ` +
        `Build ID: ${context.buildId}, Project ID: ${context.projectId}. ` +
        `Ensure DeepSeek-V3 is accessible and docs.md is valid.`
      );
      enhancedError.stage = 'schema-generator';
      enhancedError.stageNumber = 3;
      enhancedError.buildId = context.buildId;
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  async handleStructuralValidatorStage(stage, context) {
    // Stage 3.5: GPT-5 Mini performs structural validation
    console.log(`[Build ${context.buildId}] Stage 3.5: GPT-5 Mini Structural Validator`);

    try {
      // Load docs.md and schema.json (Requirement 4.1)
      const docsPath = path.join(context.projectDir, 'docs', 'docs.md');
      const schemaPath = path.join(context.projectDir, 'specs', 'schema.json');

      const docsMd = await this.readArtifact(docsPath).catch(error => {
        throw new Error(`Failed to load docs.md: ${error.message}. Ensure Stage 3 (Schema Generator) completed successfully.`);
      });

      const schemaJson = await this.readArtifact(schemaPath).catch(error => {
        throw new Error(`Failed to load schema.json: ${error.message}. Ensure Stage 3 (Schema Generator) completed successfully.`);
      });

      if (!docsMd || docsMd.trim().length === 0) {
        throw new Error('docs.md is empty or invalid. Cannot perform structural validation.');
      }

      if (!schemaJson || Object.keys(schemaJson).length === 0) {
        throw new Error('schema.json is empty or invalid. Cannot perform structural validation.');
      }

      // Get prompt template manager
      const promptTemplateManager = require('./prompt-templates');

      // Load and populate prompt template for structural-validator
      const prompt = promptTemplateManager.getTemplate('structural-validator', {
        docs_md: docsMd,
        schema_json: JSON.stringify(schemaJson, null, 2)
      }).catch(error => {
        throw new Error(`Failed to load structural-validator prompt template: ${error.message}`);
      });

      // Call GPT-5 Mini via stage router (Requirement 4.1)
      const response = await this.stageRouter.callStageModel(3.5, prompt, {
        context: {
          buildId: context.buildId,
          projectId: context.projectId
        },
        timeout: stage.timeout
      }).catch(error => {
        throw new Error(`GPT-5 Mini structural validator model call failed: ${error.message}. Check Zukijourney API availability.`);
      });

      if (!response || !response.content) {
        throw new Error('Structural validator model returned empty response. Check model configuration.');
      }

      // Parse issues array from response (Requirement 4.2)
      let structuralIssues;
      try {
        // Try to extract JSON array from response
        const jsonMatch = response.content.match(/```json\s*([\s\S]*?)\s*```/) ||
          response.content.match(/\[[\s\S]*\]/);

        if (jsonMatch) {
          structuralIssues = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        } else {
          structuralIssues = JSON.parse(response.content);
        }

        // Ensure it's an array
        if (!Array.isArray(structuralIssues)) {
          console.log(`[Build ${context.buildId}] Response is not an array, assuming no issues`);
          structuralIssues = [];
        }

        console.log(`[Build ${context.buildId}] ✅ Structural validation complete: ${structuralIssues.length} issues found`);
      } catch (parseError) {
        console.log(`[Build ${context.buildId}] Failed to parse structural issues, assuming clean structure: ${parseError.message}`);
        structuralIssues = [];
      }

      // Check for critical issues (Requirement 4.4)
      const criticalIssues = structuralIssues.filter(issue =>
        issue.severity === 'critical' || issue.severity === 'error'
      );

      if (criticalIssues.length > 0) {
        console.warn(`[Build ${context.buildId}] ⚠️  Found ${criticalIssues.length} critical structural issues`);
        // Note: We don't halt the pipeline here, but log the warning
        // The user can decide whether to proceed based on the issues
      }

      // Return structural_issues.json artifact (Requirement 4.3)
      return {
        success: true,
        artifacts: {
          'structural_issues.json': structuralIssues
        }
      };
    } catch (error) {
      // Enhance error with stage context (Requirements 4.5, 7.3)
      const enhancedError = new Error(
        `Stage 3.5 (Structural Validator) failed: ${error.message}. ` +
        `Build ID: ${context.buildId}, Project ID: ${context.projectId}. ` +
        `Ensure GPT-5 Mini is accessible and docs.md/schema.json are valid.`
      );
      enhancedError.stage = 'structural-validator';
      enhancedError.stageNumber = 3.5;
      enhancedError.buildId = context.buildId;
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  async handleFileStructureGeneratorStage(stage, context) {
    // Stage 4: GPT-4o generates file structure
    console.log(`[Build ${context.buildId}] Stage 4: GPT-4o File Structure Generator`);

    try {
      // Load docs.md and schema.json (Requirement 5.1)
      const docsPath = path.join(context.projectDir, 'docs', 'docs.md');
      const schemaPath = path.join(context.projectDir, 'specs', 'schema.json');

      const docsMd = await this.readArtifact(docsPath).catch(error => {
        throw new Error(`Failed to load docs.md: ${error.message}. Ensure Stage 3 (Schema Generator) completed successfully.`);
      });

      const schemaJson = await this.readArtifact(schemaPath).catch(error => {
        throw new Error(`Failed to load schema.json: ${error.message}. Ensure Stage 3 (Schema Generator) completed successfully.`);
      });

      if (!docsMd || docsMd.trim().length === 0) {
        throw new Error('docs.md is empty or invalid. Cannot generate file structure.');
      }

      if (!schemaJson || Object.keys(schemaJson).length === 0) {
        throw new Error('schema.json is empty or invalid. Cannot generate file structure.');
      }

      // Get prompt template manager
      const promptTemplateManager = require('./prompt-templates');

      // Load and populate prompt template for file-structure-generator
      const prompt = promptTemplateManager.getTemplate('file-structure-generator', {
        docs_md: docsMd,
        schema_json: JSON.stringify(schemaJson, null, 2)
      }).catch(error => {
        throw new Error(`Failed to load file-structure-generator prompt template: ${error.message}`);
      });

      // Call GPT-4o via stage router (Requirement 5.1)
      const response = await this.stageRouter.callStageModel(4, prompt, {
        context: {
          buildId: context.buildId,
          projectId: context.projectId
        },
        timeout: stage.timeout
      }).catch(error => {
        throw new Error(`GPT-4o model call failed: ${error.message}. Check Zukijourney API availability and credentials.`);
      });

      if (!response || !response.content) {
        throw new Error('File structure generator model returned empty response. Check model configuration.');
      }

      // Parse file structure JSON from response (Requirement 5.2)
      let fileStructure;
      try {
        // Try to extract JSON from response
        const jsonMatch = response.content.match(/```json\s*([\s\S]*?)\s*```/) ||
          response.content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          fileStructure = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        } else {
          fileStructure = JSON.parse(response.content);
        }

        if (!fileStructure || Object.keys(fileStructure).length === 0) {
          throw new Error('Parsed file_structure.json is empty');
        }

        console.log(`[Build ${context.buildId}] ✅ Successfully generated file_structure.json`);
      } catch (parseError) {
        throw new Error(
          `Failed to parse file structure JSON: ${parseError.message}. ` +
          `Model response may not be valid JSON. Response preview: ${response.content.substring(0, 200)}...`
        );
      }

      // Return file_structure.json artifact (Requirement 5.3)
      return {
        success: true,
        artifacts: {
          'file_structure.json': fileStructure
        }
      };
    } catch (error) {
      // Enhance error with stage context (Requirements 5.4, 7.3)
      const enhancedError = new Error(
        `Stage 4 (File Structure Generator) failed: ${error.message}. ` +
        `Build ID: ${context.buildId}, Project ID: ${context.projectId}. ` +
        `Ensure GPT-4o is accessible via Zukijourney and docs.md/schema.json are valid.`
      );
      enhancedError.stage = 'file-structure-generator';
      enhancedError.stageNumber = 4;
      enhancedError.buildId = context.buildId;
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  async handleValidatorStage(stage, context) {
    // Stage 5: Claude 3.5 Haiku validates structure consistency
    console.log(`[Build ${context.buildId}] Stage 5: Claude 3.5 Haiku Validator`);

    try {
      // Load docs.md, schema.json, and file_structure.json (Requirement 6.1)
      const docsPath = path.join(context.projectDir, 'docs', 'docs.md');
      const schemaPath = path.join(context.projectDir, 'specs', 'schema.json');
      const fileStructurePath = path.join(context.projectDir, 'specs', 'file_structure.json');

      const docsMd = await this.readArtifact(docsPath).catch(error => {
        throw new Error(`Failed to load docs.md: ${error.message}. Ensure Stage 3 (Schema Generator) completed successfully.`);
      });

      const schemaJson = await this.readArtifact(schemaPath).catch(error => {
        throw new Error(`Failed to load schema.json: ${error.message}. Ensure Stage 3 (Schema Generator) completed successfully.`);
      });

      const fileStructure = await this.readArtifact(fileStructurePath).catch(error => {
        throw new Error(`Failed to load file_structure.json: ${error.message}. Ensure Stage 4 (File Structure Generator) completed successfully.`);
      });

      if (!docsMd || docsMd.trim().length === 0) {
        throw new Error('docs.md is empty or invalid. Cannot validate structure.');
      }

      if (!schemaJson || Object.keys(schemaJson).length === 0) {
        throw new Error('schema.json is empty or invalid. Cannot validate structure.');
      }

      if (!fileStructure || Object.keys(fileStructure).length === 0) {
        throw new Error('file_structure.json is empty or invalid. Cannot validate structure.');
      }

      // Get prompt template manager
      const promptTemplateManager = require('./prompt-templates');

      // Load and populate prompt template for validator
      const prompt = promptTemplateManager.getTemplate('validator', {
        docs_md: docsMd,
        schema_json: JSON.stringify(schemaJson, null, 2),
        file_structure_json: JSON.stringify(fileStructure, null, 2)
      }).catch(error => {
        throw new Error(`Failed to load validator prompt template: ${error.message}`);
      });

      // Call Claude 3.5 Haiku via stage router (Requirement 6.1)
      const response = await this.stageRouter.callStageModel(5, prompt, {
        context: {
          buildId: context.buildId,
          projectId: context.projectId
        },
        timeout: stage.timeout
      }).catch(error => {
        throw new Error(`Claude 3.5 Haiku model call failed: ${error.message}. Check Zukijourney/Anthropic API availability and credentials.`);
      });

      if (!response || !response.content) {
        throw new Error('Validator model returned empty response. Check model configuration.');
      }

      // Parse validated structure JSON from response (Requirement 6.2, 6.3)
      let validatedStructure;
      try {
        // Try to extract JSON from response
        const jsonMatch = response.content.match(/```json\s*([\s\S]*?)\s*```/) ||
          response.content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          validatedStructure = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        } else {
          validatedStructure = JSON.parse(response.content);
        }

        if (!validatedStructure || Object.keys(validatedStructure).length === 0) {
          throw new Error('Parsed validated_structure.json is empty');
        }

        console.log(`[Build ${context.buildId}] ✅ Successfully validated structure`);
      } catch (parseError) {
        console.warn(`[Build ${context.buildId}] Failed to parse validated structure, using file structure as fallback: ${parseError.message}`);
        validatedStructure = fileStructure;
      }

      // Return validated_structure.json artifact (Requirement 6.3)
      return {
        success: true,
        artifacts: {
          'validated_structure.json': validatedStructure
        }
      };
    } catch (error) {
      // Enhance error with stage context (Requirements 6.4, 7.3)
      const enhancedError = new Error(
        `Stage 5 (Validator) failed: ${error.message}. ` +
        `Build ID: ${context.buildId}, Project ID: ${context.projectId}. ` +
        `Ensure Claude 3.5 Haiku is accessible and all input artifacts are valid.`
      );
      enhancedError.stage = 'validator';
      enhancedError.stageNumber = 5;
      enhancedError.buildId = context.buildId;
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  async handleEmptyFileCreationStage(stage, context) {
    // Stage 6: Create all empty files from validated structure
    console.log(`Stage 6: Creating empty files for build ${context.buildId}`);

    try {
      // Load validated_structure.json (Requirement 7.1)
      const validatedStructurePath = path.join(context.projectDir, 'specs', 'validated_structure.json');
      const validatedStructure = await this.readArtifact(validatedStructurePath).catch(error => {
        throw new Error(`Failed to load validated_structure.json: ${error.message}. Ensure Stage 5 (Validator) completed successfully.`);
      });

      if (!validatedStructure || Object.keys(validatedStructure).length === 0) {
        throw new Error('validated_structure.json is empty or invalid. Cannot create files.');
      }

      const codeDir = path.join(context.projectDir, 'code');
      const createdFiles = [];

      // Flatten the structure to get all file paths
      const filesToCreate = this.flattenFileStructure(validatedStructure);

      if (filesToCreate.length === 0) {
        throw new Error('No files to create. validated_structure.json may be malformed.');
      }

      console.log(`Creating ${filesToCreate.length} empty files...`);

      // Create each file with placeholder comment (Requirement 7.2)
      for (const fileInfo of filesToCreate) {
        try {
          const filePath = path.join(codeDir, fileInfo.path);

          // Create directory if it doesn't exist
          await fs.mkdir(path.dirname(filePath), { recursive: true }).catch(error => {
            throw new Error(`Failed to create directory for ${fileInfo.path}: ${error.message}`);
          });

          // Create placeholder content based on file type (Requirement 7.3)
          const placeholder = this.generatePlaceholder(fileInfo.path, fileInfo.purpose);

          // Write empty file with placeholder
          await fs.writeFile(filePath, placeholder, 'utf8').catch(error => {
            throw new Error(`Failed to write file ${fileInfo.path}: ${error.message}`);
          });

          createdFiles.push({
            path: fileInfo.path,
            fullPath: filePath,
            purpose: fileInfo.purpose
          });

          console.log(`Created: ${fileInfo.path}`);
        } catch (fileError) {
          console.error(`[Build ${context.buildId}] Failed to create file ${fileInfo.path}:`, fileError.message);
          // Continue with other files but track the error
          throw fileError;
        }
      }

      // Verify all files were created
      const verificationResults = await this.verifyFilesCreated(codeDir, filesToCreate).catch(error => {
        throw new Error(`File verification failed: ${error.message}`);
      });

      if (!verificationResults.allCreated) {
        throw new Error(
          `Failed to create ${verificationResults.missing.length} files: ${verificationResults.missing.join(', ')}. ` +
          `Check file system permissions and disk space.`
        );
      }

      console.log(`✅ Successfully created ${createdFiles.length} empty files`);

      return {
        success: true,
        artifacts: {
          'empty_files_created': {
            count: createdFiles.length,
            files: createdFiles,
            timestamp: new Date().toISOString()
          }
        }
      };
    } catch (error) {
      // Enhance error with stage context (Requirements 7.4, 7.3)
      const enhancedError = new Error(
        `Stage 6 (Empty File Creation) failed: ${error.message}. ` +
        `Build ID: ${context.buildId}, Project ID: ${context.projectId}. ` +
        `Check file system permissions and validated_structure.json format.`
      );
      enhancedError.stage = 'empty-file-creation';
      enhancedError.stageNumber = 6;
      enhancedError.buildId = context.buildId;
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  /**
   * Flatten file structure to get list of all files
   * Enhanced to handle complex nested structures
   * @param {Object} structure - Validated structure
   * @returns {Array} Array of file info objects
   */
  flattenFileStructure(structure) {
    const files = [];
    const seen = new Set(); // Prevent duplicates

    const traverse = (obj, basePath = '') => {
      if (!obj || typeof obj !== 'object') {
        return;
      }

      // Handle array structures
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          if (typeof item === 'object') {
            traverse(item, basePath);
          }
        });
        return;
      }

      // Handle object structures
      for (const [key, value] of Object.entries(obj)) {
        // Skip metadata fields
        if (key.startsWith('_') || key === 'metadata') {
          continue;
        }

        // Construct full path
        const fullPath = basePath ? `${basePath}/${key}` : key;

        if (typeof value === 'string') {
          // This is a file with its purpose as the value
          if (!seen.has(fullPath)) {
            files.push({
              path: fullPath,
              purpose: value
            });
            seen.add(fullPath);
          }
        } else if (typeof value === 'object' && value !== null) {
          // Check if this object represents a file (has purpose/description field)
          if (value.purpose || value.description || value.type === 'file') {
            const purpose = value.purpose || value.description || 'Generated file';
            if (!seen.has(fullPath)) {
              files.push({
                path: fullPath,
                purpose
              });
              seen.add(fullPath);
            }
          } else {
            // This is a nested directory structure
            traverse(value, fullPath);
          }
        }
      }
    };

    traverse(structure);

    // Sort files by path for consistent ordering
    files.sort((a, b) => a.path.localeCompare(b.path));

    return files;
  }

  /**
   * Generate placeholder content for a file
   * @param {string} filePath - File path
   * @param {string} purpose - File purpose
   * @returns {string} Placeholder content
   */
  generatePlaceholder(filePath, purpose) {
    const ext = path.extname(filePath);
    const fileName = path.basename(filePath);

    let placeholder = '';

    // Add appropriate comment syntax based on file type
    if (ext === '.js' || ext === '.ts' || ext === '.jsx' || ext === '.tsx') {
      placeholder = `/**
 * ${fileName}
 * 
 * Purpose: ${purpose}
 * 
 * This file was generated by the AI App Builder pipeline.
 * Stage 6: Empty file creation
 * 
 * Code will be generated in Stage 7.
 */

// TODO: Implement ${fileName}
`;
    } else if (ext === '.svelte' || ext === '.vue') {
      placeholder = `<!--
  ${fileName}
  
  Purpose: ${purpose}
  
  This file was generated by the AI App Builder pipeline.
  Stage 6: Empty file creation
  
  Code will be generated in Stage 7.
-->

<script>
  // TODO: Implement component logic
</script>

<!-- TODO: Implement component template -->

<style>
  /* TODO: Implement component styles */
</style>
`;
    } else if (ext === '.css' || ext === '.scss') {
      placeholder = `/**
 * ${fileName}
 * 
 * Purpose: ${purpose}
 * 
 * This file was generated by the AI App Builder pipeline.
 * Stage 6: Empty file creation
 * 
 * Code will be generated in Stage 7.
 */

/* TODO: Implement styles */
`;
    } else if (ext === '.html') {
      placeholder = `<!--
  ${fileName}
  
  Purpose: ${purpose}
  
  This file was generated by the AI App Builder pipeline.
  Stage 6: Empty file creation
  
  Code will be generated in Stage 7.
-->

<!DOCTYPE html>
<html>
<head>
  <title>${fileName}</title>
</head>
<body>
  <!-- TODO: Implement HTML content -->
</body>
</html>
`;
    } else if (ext === '.md') {
      placeholder = `# ${fileName}

Purpose: ${purpose}

This file was generated by the AI App Builder pipeline.
Stage 6: Empty file creation

Code will be generated in Stage 7.

## TODO

- Implement documentation
`;
    } else if (ext === '.json') {
      placeholder = `{
  "_comment": "This file was generated by the AI App Builder pipeline",
  "_purpose": "${purpose}",
  "_stage": "Stage 6: Empty file creation",
  "_todo": "Implement JSON structure in Stage 7"
}
`;
    } else {
      // Generic placeholder
      placeholder = `# ${fileName}
# Purpose: ${purpose}
# This file was generated by the AI App Builder pipeline
# Stage 6: Empty file creation
# Code will be generated in Stage 7

# TODO: Implement ${fileName}
`;
    }

    return placeholder;
  }

  /**
   * Verify that all files were created
   * @param {string} codeDir - Code directory
   * @param {Array} expectedFiles - Expected files
   * @returns {Promise<Object>} Verification results
   */
  async verifyFilesCreated(codeDir, expectedFiles) {
    const missing = [];

    for (const fileInfo of expectedFiles) {
      const filePath = path.join(codeDir, fileInfo.path);

      try {
        await fs.access(filePath);
      } catch (error) {
        missing.push(fileInfo.path);
      }
    }

    return {
      allCreated: missing.length === 0,
      totalExpected: expectedFiles.length,
      created: expectedFiles.length - missing.length,
      missing
    };
  }

  /**
   * Stage 7: GPT-5 Mini Prompt Builder
   * Creates structured prompts for Gemini code generation
   * @param {Object} stage - Stage configuration
   * @param {Object} context - Build context
   * @returns {Promise<Object>} Stage result with gemini_prompts.json
   */
  async handlePromptBuilderStage(stage, context) {
    console.log(`[Build ${context.buildId}] Stage 7: GPT-5 Mini Prompt Builder`);

    try {
      // Load required artifacts
      const validatedStructurePath = path.join(context.projectDir, 'specs', 'validated_structure.json');
      const docsPath = path.join(context.projectDir, 'docs', 'documentation_with_schema.md');
      const schemaPath = path.join(context.projectDir, 'specs', 'schema.json');
      const refinedSpecsPath = path.join(context.projectDir, 'specs', 'refined_specs.json');

      const validatedStructure = await this.readArtifact(validatedStructurePath).catch(error => {
        throw new Error(`Failed to load validated_structure.json: ${error.message}`);
      });

      const docsMd = await this.readArtifact(docsPath).catch(async () => {
        // Fallback to docs.md if documentation_with_schema.md doesn't exist
        const fallbackPath = path.join(context.projectDir, 'docs', 'docs.md');
        return await this.readArtifact(fallbackPath).catch(error => {
          throw new Error(`Failed to load documentation: ${error.message}`);
        });
      });

      const schemaJson = await this.readArtifact(schemaPath).catch(() => ({}));
      const refinedSpecs = await this.readArtifact(refinedSpecsPath).catch(() => ({}));

      if (!validatedStructure || Object.keys(validatedStructure).length === 0) {
        throw new Error('validated_structure.json is empty or invalid.');
      }

      // Get all files to generate prompts for
      const filesToProcess = this.flattenFileStructure(validatedStructure);

      if (filesToProcess.length === 0) {
        throw new Error('No files to generate prompts for.');
      }

      console.log(`[Build ${context.buildId}] Building prompts for ${filesToProcess.length} files...`);

      const promptTemplateManager = require('./prompt-templates');
      const geminiPrompts = [];

      // Process each file and generate structured prompt
      for (const fileInfo of filesToProcess) {
        try {
          // Extract relevant docs and schema excerpts
          const docsExcerpt = this.extractRelevantDocs(docsMd, fileInfo.path, fileInfo.purpose);
          const schemaExcerpt = this.extractRelevantSchema(schemaJson, fileInfo.path, fileInfo.purpose);

          // Build the prompt using template
          const promptBuilderPrompt = promptTemplateManager.getTemplate('prompt-builder', {
            file_path: fileInfo.path,
            file_purpose: fileInfo.purpose,
            docs_excerpt: docsExcerpt,
            schema_excerpt: JSON.stringify(schemaExcerpt, null, 2)
          });

          // Call GPT-5 Mini via stage router
          const response = await this.stageRouter.callStageModel(7, promptBuilderPrompt, {
            context: {
              buildId: context.buildId,
              projectId: context.projectId,
              fileName: fileInfo.path
            },
            timeout: stage.timeout
          }).catch(error => {
            console.warn(`[Build ${context.buildId}] Prompt generation failed for ${fileInfo.path}: ${error.message}`);
            return { content: null };
          });

          // Build structured prompt in user-specified format
          const structuredPrompt = {
            filename: fileInfo.path,
            purpose: fileInfo.purpose,
            schema: schemaExcerpt || {},
            imports: this.inferImportsForFile(fileInfo.path, validatedStructure),
            generatedPrompt: response.content || this.buildFallbackPrompt(fileInfo, docsExcerpt, schemaExcerpt),
            functions: this.inferFunctionsForFile(fileInfo.path, fileInfo.purpose, docsMd)
          };

          geminiPrompts.push(structuredPrompt);

          // Send WebSocket progress update
          if (this.websocket) {
            this.websocket.sendPhaseUpdate(context.buildId, 'prompt-builder', 'progress', {
              currentFile: fileInfo.path,
              completed: geminiPrompts.length,
              total: filesToProcess.length,
              percentage: Math.round((geminiPrompts.length / filesToProcess.length) * 100)
            });
          }
        } catch (error) {
          console.error(`[Build ${context.buildId}] Failed to build prompt for ${fileInfo.path}:`, error.message);
        }
      }

      console.log(`[Build ${context.buildId}] ✅ Prompt building complete: ${geminiPrompts.length} prompts generated`);

      return {
        success: true,
        artifacts: {
          'gemini_prompts.json': geminiPrompts
        }
      };

    } catch (error) {
      const enhancedError = new Error(
        `Stage 7 (Prompt Builder) failed: ${error.message}. ` +
        `Build ID: ${context.buildId}, Project ID: ${context.projectId}.`
      );
      enhancedError.stage = 'prompt-builder';
      enhancedError.stageNumber = 7;
      enhancedError.buildId = context.buildId;
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  /**
   * Infer imports for a file based on its path and structure
   */
  inferImportsForFile(filePath, structure) {
    const imports = { filePaths: [], functions: [] };
    const ext = path.extname(filePath);

    if (filePath.includes('routes') || filePath.includes('api')) {
      imports.filePaths.push('./lib/db', './lib/auth', './lib/utils');
      imports.functions.push({
        functionName: 'authenticate',
        functionPurpose: 'Verify user authentication',
        methods: [{ method: 'verifyToken', usecase: 'Validate JWT token' }]
      });
    }

    if (filePath.includes('components') || ext === '.svelte') {
      imports.filePaths.push('$lib/stores', '$lib/utils');
    }

    return imports;
  }

  /**
   * Infer functions for a file based on its purpose
   */
  inferFunctionsForFile(filePath, purpose, docs) {
    const functions = [];
    const purposeLower = (purpose || '').toLowerCase();

    if (purposeLower.includes('crud') || purposeLower.includes('api')) {
      functions.push(
        { functionName: 'create', functionPurpose: 'Create resource', methods: [{ method: 'POST', usecase: 'Create' }] },
        { functionName: 'read', functionPurpose: 'Read resource', methods: [{ method: 'GET', usecase: 'Read' }] },
        { functionName: 'update', functionPurpose: 'Update resource', methods: [{ method: 'PUT', usecase: 'Update' }] },
        { functionName: 'delete', functionPurpose: 'Delete resource', methods: [{ method: 'DELETE', usecase: 'Delete' }] }
      );
    }

    if (purposeLower.includes('auth')) {
      functions.push(
        { functionName: 'login', functionPurpose: 'Authenticate user', methods: [{ method: 'validateCredentials', usecase: 'Verify credentials' }] },
        { functionName: 'register', functionPurpose: 'Register user', methods: [{ method: 'createUser', usecase: 'Create account' }] }
      );
    }

    return functions;
  }

  /**
   * Build fallback prompt when GPT-5 Mini fails
   */
  buildFallbackPrompt(fileInfo, docsExcerpt, schemaExcerpt) {
    return `Generate complete code for: ${fileInfo.path}
Purpose: ${fileInfo.purpose}

Documentation:
${docsExcerpt}

Schema:
${JSON.stringify(schemaExcerpt, null, 2)}

Requirements:
- Production-ready code
- Proper error handling
- Include necessary imports`;
  }

  async handleCodeGenerationStage(stage, context) {
    // Stage 8: Gemini-3 generates code from prompts
    console.log(`[Build ${context.buildId}] Stage 8: Gemini-3 Code Generation`);


    try {
      // Load gemini_prompts.json from Stage 7
      const promptsPath = path.join(context.projectDir, 'specs', 'gemini_prompts.json');
      const geminiPrompts = await this.readArtifact(promptsPath).catch(error => {
        throw new Error(`Failed to load gemini_prompts.json: ${error.message}. Ensure Stage 7 (Prompt Builder) completed successfully.`);
      });

      if (!geminiPrompts || !Array.isArray(geminiPrompts) || geminiPrompts.length === 0) {
        throw new Error('gemini_prompts.json is empty or invalid. Cannot generate code.');
      }

      console.log(`[Build ${context.buildId}] Generating code for ${geminiPrompts.length} files...`);

      const codeDir = path.join(context.projectDir, 'code');
      const generatedFiles = [];
      const failedFiles = [];

      // Process files with controlled concurrency
      const concurrency = stage.concurrency || 5;
      const promptTemplateManager = require('./prompt-templates');

      // Process files in batches
      for (let i = 0; i < geminiPrompts.length; i += concurrency) {
        const batch = geminiPrompts.slice(i, i + concurrency);

        const batchPromises = batch.map(async (promptInfo) => {
          try {
            console.log(`[Build ${context.buildId}] Generating code for: ${promptInfo.filename}`);

            // Send WebSocket update
            if (this.websocket) {
              this.websocket.sendPhaseUpdate(context.buildId, 'code-generation', 'progress', {
                currentFile: promptInfo.filename,
                completed: generatedFiles.length,
                total: geminiPrompts.length,
                percentage: Math.round((generatedFiles.length / geminiPrompts.length) * 100)
              });
            }

            // Build the Gemini prompt from the structured prompt info
            const geminiPrompt = promptTemplateManager.getTemplate('gemini-coder', {
              file_path: promptInfo.filename,
              file_purpose: promptInfo.purpose,
              docs_excerpt: promptInfo.generatedPrompt || '',
              schema_excerpt: JSON.stringify(promptInfo.schema || {}, null, 2),
              coding_rules: 'Follow best practices, use modern syntax, include error handling'
            });

            // Call Gemini-3 via stage router (Stage 8)
            const response = await this.stageRouter.callStageModel(8, geminiPrompt, {
              context: {
                buildId: context.buildId,
                projectId: context.projectId,
                fileName: promptInfo.filename
              },
              timeout: stage.timeout
            }).catch(error => {
              throw new Error(`Code generation failed for ${promptInfo.filename}: ${error.message}`);
            });

            if (!response || !response.content) {
              throw new Error(`Code generation returned empty result for ${promptInfo.filename}`);
            }

            // Extract code from response (handle markdown code blocks)
            let generatedCode = response.content;
            const codeBlockMatch = generatedCode.match(/```(?:\w+)?\s*([\s\S]*?)\s*```/);
            if (codeBlockMatch) {
              generatedCode = codeBlockMatch[1];
            }

            // Write generated code to file
            const filePath = path.join(codeDir, promptInfo.filename);
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, generatedCode, 'utf8').catch(error => {
              throw new Error(`Failed to write generated code to ${promptInfo.filename}: ${error.message}`);
            });

            generatedFiles.push({
              path: promptInfo.filename,
              fullPath: filePath,
              purpose: promptInfo.purpose,
              tokens: response.tokens || 0,
              cost: response.cost || 0
            });

            console.log(`[Build ${context.buildId}] ✅ Generated: ${promptInfo.filename}`);
          } catch (error) {
            console.error(`[Build ${context.buildId}] ❌ Failed to generate ${promptInfo.filename}:`, error.message);

            failedFiles.push({
              path: promptInfo.filename,
              error: error.message
            });
          }
        });

        // Wait for batch to complete
        await Promise.all(batchPromises);
      }

      console.log(`[Build ${context.buildId}] Code generation complete: ${generatedFiles.length} succeeded, ${failedFiles.length} failed`);

      // If too many files failed, throw error
      if (failedFiles.length > geminiPrompts.length * 0.3) {
        throw new Error(
          `Code generation failed for ${failedFiles.length} files (>30% failure rate). ` +
          `Failed files: ${failedFiles.map(f => f.path).join(', ')}.`
        );
      }

      // Return generated_code_files artifact with counts
      return {
        success: true,
        artifacts: {
          'generated_code_files': {
            count: generatedFiles.length,
            files: generatedFiles,
            failed: failedFiles,
            timestamp: new Date().toISOString()
          }
        }
      };
    } catch (error) {
      const enhancedError = new Error(
        `Stage 8 (Code Generation) failed: ${error.message}. ` +
        `Build ID: ${context.buildId}, Project ID: ${context.projectId}. ` +
        `Ensure Gemini-3 is accessible and gemini_prompts.json is valid.`
      );
      enhancedError.stage = 'code-generation';
      enhancedError.stageNumber = 8;
      enhancedError.buildId = context.buildId;
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }


  /**
   * Extract relevant documentation for a specific file
   * @param {string} docs - Full documentation
   * @param {string} filePath - File path
   * @param {string} purpose - File purpose
   * @returns {string} Relevant docs excerpt
   */
  extractRelevantDocs(docs, filePath, purpose) {
    // For now, return full docs
    // In production, this would use semantic search or keyword matching
    // to extract only relevant sections

    // Simple heuristic: if file is in frontend, extract frontend sections
    if (filePath.includes('frontend') || filePath.includes('src/lib') || filePath.includes('components')) {
      const frontendMatch = docs.match(/## Frontend.*?(?=##|$)/s);
      if (frontendMatch) {
        return frontendMatch[0];
      }
    }

    // If file is in backend/server, extract backend sections
    if (filePath.includes('backend') || filePath.includes('server') || filePath.includes('api')) {
      const backendMatch = docs.match(/## (Backend|API|Endpoints).*?(?=##|$)/s);
      if (backendMatch) {
        return backendMatch[0];
      }
    }

    // Return first 2000 characters as excerpt
    return docs.substring(0, 2000) + (docs.length > 2000 ? '\n\n... (truncated)' : '');
  }

  /**
   * Extract relevant schema for a specific file
   * @param {Object} schema - Full schema
   * @param {string} filePath - File path
   * @param {string} purpose - File purpose
   * @returns {string} Relevant schema excerpt
   */
  extractRelevantSchema(schema, filePath, purpose) {
    // For now, return full schema as JSON string
    // In production, this would extract only relevant entities

    return JSON.stringify(schema, null, 2);
  }

  /**
   * Stage 8: Create GitHub repository and push code
   * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
   * @param {Object} stage - Stage configuration
   * @param {Object} context - Build context
   * @returns {Promise<Object>} Stage result with repository URL and metadata
   */
  async handleRepoCreationStage(stage, context) {
    console.log(`[Build ${context.buildId}] Stage 8: Creating GitHub repository and pushing code`);

    try {
      // Requirement 9.1: Create GitHub repository using Octokit
      const githubClientModule = require('./github-client');

      // Get user's GitHub token
      const octokit = await githubClientModule.getGitHubClient(context.userId);

      if (!octokit) {
        throw new Error('GitHub token not found. Please connect your GitHub account.');
      }

      // Get authenticated user info to determine owner
      const { data: authUser } = await octokit.rest.users.getAuthenticated();
      const owner = authUser.login;

      // Get project details
      const project = await this.projectModel.findById(context.orgId, context.projectId);

      if (!project) {
        throw new Error(`Project ${context.projectId} not found`);
      }

      // Generate repository name from project (sanitize for GitHub)
      const repoName = project.name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 100); // GitHub repo name limit

      const repoDescription = project.description || 'Generated by AI App Builder';

      console.log(`[Build ${context.buildId}] Creating repository: ${owner}/${repoName}`);

      // Send WebSocket update
      if (this.websocket) {
        this.websocket.sendPhaseUpdate(context.buildId, 'repo-creation', 'creating', {
          repoName,
          owner
        });
      }

      // Create GitHub repository (Requirement 9.1)
      let repo;
      try {
        repo = await octokit.rest.repos.createForAuthenticatedUser({
          name: repoName,
          description: repoDescription,
          private: project.visibility === 'private' || false,
          auto_init: false, // We'll push our own initial commit
          has_issues: true,
          has_projects: false,
          has_wiki: false
        });

        console.log(`[Build ${context.buildId}] ✅ Repository created: ${repo.data.html_url}`);
      } catch (error) {
        if (error.status === 422 && error.message.includes('already exists')) {
          // Repository already exists, get it instead
          console.log(`[Build ${context.buildId}] Repository ${owner}/${repoName} already exists, using existing repo`);
          const { data } = await octokit.rest.repos.get({
            owner,
            repo: repoName
          });
          repo = { data };
        } else {
          throw error;
        }
      }

      // Requirement 9.2: Initialize git repository in code directory
      // Requirement 9.3: Commit all generated files with appropriate messages
      // Requirement 9.4: Push to main branch

      const codeDir = path.join(context.projectDir, 'code');

      // Get all generated files from code directory
      const files = await this.getAllFilesRecursive(codeDir);

      if (files.length === 0) {
        throw new Error('No generated files found to push to repository');
      }

      console.log(`[Build ${context.buildId}] Preparing to push ${files.length} files to repository...`);

      // Send WebSocket update
      if (this.websocket) {
        this.websocket.sendPhaseUpdate(context.buildId, 'repo-creation', 'pushing', {
          filesCount: files.length,
          repoUrl: repo.data.html_url
        });
      }

      // Read all files and prepare them for GitHub
      const generatedFiles = {};
      for (const filePath of files) {
        const relativePath = path.relative(codeDir, filePath);
        const content = await fs.readFile(filePath, 'utf8');
        generatedFiles[relativePath] = content;
      }

      // Use github-repo-service to push all files atomically
      const githubRepoService = require('../../workers/services/github-repo-service');

      // Get user's GitHub token (decrypted)
      const User = require('../models/user');
      const user = await User.findById(context.userId);
      const { decrypt } = require('./encryption');
      const githubToken = decrypt(user.githubToken);

      // Generate a basic GitHub Actions workflow (optional, can be empty)
      const githubWorkflowYML = `name: Deploy
on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm install || pnpm install || yarn install || true
      - name: Build
        run: npm run build || pnpm build || yarn build || true
`;

      // Push all files to GitHub (Requirements 9.2, 9.3, 9.4)
      const pushResult = await githubRepoService.pushGeneratedAppToGitHub({
        githubToken,
        owner,
        repoName,
        generatedFiles,
        githubWorkflowYML,
        privateRepo: project.visibility === 'private' || false,
        webhookUrl: null // No webhook for now
      });

      console.log(`[Build ${context.buildId}] ✅ Pushed ${files.length} files to repository`);
      console.log(`[Build ${context.buildId}] Commit SHA: ${pushResult.commitSha}`);

      // Requirement 9.5: Store repository URL in artifacts
      const artifactData = {
        'github_repo_url': repo.data.html_url,
        'github_repo_name': repo.data.full_name,
        'github_repo_owner': owner,
        'commit_sha': pushResult.commitSha,
        'files_pushed': files.length,
        'clone_url': repo.data.clone_url,
        'ssh_url': repo.data.ssh_url,
        'timestamp': new Date().toISOString()
      };

      // Update project with repository information
      await project.update({
        githubRepoUrl: repo.data.html_url,
        githubRepoName: repo.data.full_name,
        lastCommitSha: pushResult.commitSha
      });

      // Send WebSocket completion update
      if (this.websocket) {
        this.websocket.sendPhaseUpdate(context.buildId, 'repo-creation', 'completed', {
          repoUrl: repo.data.html_url,
          repoName: repo.data.full_name,
          commitSha: pushResult.commitSha,
          filesCount: files.length
        });
      }

      console.log(`[Build ${context.buildId}] ✅ Stage 8 complete: Repository ${repo.data.html_url}`);

      return {
        success: true,
        artifacts: artifactData
      };
    } catch (error) {
      console.error(`[Build ${context.buildId}] Stage 8 failed:`, error);

      // Send WebSocket error
      if (this.websocket) {
        this.websocket.sendPhaseUpdate(context.buildId, 'repo-creation', 'failed', {
          error: error.message
        });
      }

      throw new Error(`GitHub repository creation failed: ${error.message}`);
    }
  }

  /**
   * Get all files recursively from a directory
   * @param {string} dir - Directory path
   * @returns {Promise<string[]>} Array of file paths
   */
  async getAllFilesRecursive(dir) {
    const files = [];

    const traverse = async (currentDir) => {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);

          // Skip hidden files and directories (except .github)
          if (entry.name.startsWith('.') && entry.name !== '.github') {
            continue;
          }

          // Skip node_modules and other common directories to exclude
          if (entry.isDirectory() && ['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
            continue;
          }

          if (entry.isDirectory()) {
            await traverse(fullPath);
          } else {
            files.push(fullPath);
          }
        }
      } catch (error) {
        console.warn(`Warning: Could not read directory ${currentDir}:`, error.message);
      }
    };

    await traverse(dir);
    return files;
  }

  /**
   * Stage 9: Deploy to AWS
   * @param {Object} stage - Stage configuration
   * @param {Object} context - Build context
   * @returns {Promise<Object>} Stage result
   */
  async handleAWSDeploymentStage(stage, context) {
    console.log(`[Build ${context.buildId}] Stage 9: Deploying to AWS`);

    try {
      // Get project and user details
      const project = await this.projectModel.findById(context.projectId);
      const user = await this.buildModel.getUser(context.userId);

      if (!user || !user.aws_access_key) {
        console.log(`[Build ${context.buildId}] AWS credentials not configured, skipping deployment`);
        return {
          artifacts: {
            'deployment_url': null,
            'deployment_status': 'skipped',
            'skip_reason': 'AWS credentials not configured'
          }
        };
      }


      // Get repo info from Stage 8
      const repoInfo = context.artifacts[8];
      if (!repoInfo || !repoInfo.repoUrl) {
        throw new Error('Repository information not found from Stage 8');
      }

      // Determine deployment type based on project type
      const projectType = project.projectType || this.inferProjectType(context);
      const deploymentType = this.selectDeploymentType(projectType);

      console.log(`[Build ${context.buildId}] Deploying as ${deploymentType} (project type: ${projectType})`);

      // Send WebSocket update
      if (this.websocket) {
        this.websocket.sendPhaseUpdate(context.buildId, 'aws-deployment', 'started', {
          deploymentType,
          projectType
        });
      }

      let deploymentResult;

      switch (deploymentType) {
        case 's3-cloudfront':
          deploymentResult = await this.deployToS3CloudFront(context, repoInfo, user);
          break;
        case 'ecs-fargate':
          deploymentResult = await this.deployToECSFargate(context, repoInfo, user);
          break;
        case 'lambda':
          deploymentResult = await this.deployToLambda(context, repoInfo, user);
          break;
        default:
          // Default to S3+CloudFront for static sites
          deploymentResult = await this.deployToS3CloudFront(context, repoInfo, user);
      }

      console.log(`[Build ${context.buildId}] AWS deployment completed: ${deploymentResult.appUrl}`);

      // Send WebSocket update
      if (this.websocket) {
        this.websocket.sendPhaseUpdate(context.buildId, 'aws-deployment', 'completed', {
          appUrl: deploymentResult.appUrl,
          deploymentType,
          deploymentId: deploymentResult.deploymentId
        });
      }

      // Send email notification
      if (this.emailService) {
        await this.emailService.sendDeploymentSuccess({
          userEmail: user.email,
          projectName: project.name,
          appUrl: deploymentResult.appUrl,
          repoUrl: repoInfo.repoUrl
        });
      }

      // Return artifacts in the expected format
      return {
        success: true,
        artifacts: {
          'deployment_url': deploymentResult.appUrl,
          'deployment_id': deploymentResult.deploymentId,
          'deployment_type': deploymentResult.deploymentType,
          'deployment_details': deploymentResult
        }
      };
    } catch (error) {
      console.error(`[Build ${context.buildId}] Stage 9 failed:`, error);

      // Send email notification of failure
      if (this.emailService) {
        const user = await this.buildModel.getUser(context.userId);
        const project = await this.projectModel.findById(context.projectId);
        await this.emailService.sendDeploymentFailure({
          userEmail: user.email,
          projectName: project.name,
          error: error.message
        });
      }

      throw new Error(`AWS deployment failed: ${error.message}`);
    }
  }

  /**
   * Deploy to S3 + CloudFront (static sites)
   * @param {Object} context - Build context
   * @param {Object} repoInfo - Repository information
   * @param {Object} user - User object
   * @returns {Promise<Object>} Deployment result
   */
  async deployToS3CloudFront(context, repoInfo, user) {
    const S3CloudFrontDeployment = require('./aws-s3-cloudfront-deployment');

    const deploymentService = new S3CloudFrontDeployment({
      region: user.aws_region || 'us-east-1',
      roleArn: process.env.AWS_DEPLOYMENT_ROLE_ARN,
      webhookSecret: process.env.WEBHOOK_SECRET
    });

    // Get artifact URL from storage
    const artifactUrl = await this.artifactStorage.getArtifactUrl(context.buildId, 'code.zip');

    // Generate bucket name
    const bucketName = `${context.projectId}-${context.buildId}`.toLowerCase();

    const deploymentConfig = {
      bucketName,
      distributionId: user.cloudfront_distribution_id || await this.createCloudFrontDistribution(bucketName),
      artifactUrl,
      projectId: context.projectId,
      buildId: context.buildId,
      healthCheckUrl: `https://${bucketName}.s3-website-us-east-1.amazonaws.com`,
      rollbackEnabled: true
    };

    const result = await deploymentService.deployStaticSite(
      deploymentConfig,
      user.id,
      'user'
    );

    return {
      deploymentId: result.deploymentId,
      appUrl: `https://${bucketName}.s3-website-us-east-1.amazonaws.com`,
      deploymentType: 's3-cloudfront',
      bucketName: result.bucketName,
      distributionId: result.distributionId
    };
  }

  /**
   * Deploy to ECS Fargate (containerized apps)
   * @param {Object} context - Build context
   * @param {Object} repoInfo - Repository information
   * @param {Object} user - User object
   * @returns {Promise<Object>} Deployment result
   */
  async deployToECSFargate(context, repoInfo, user) {
    const ECSFargateDeployment = require('./aws-ecs-fargate-deployment');

    const deploymentService = new ECSFargateDeployment({
      region: user.aws_region || 'us-east-1',
      roleArn: process.env.AWS_DEPLOYMENT_ROLE_ARN,
      webhookSecret: process.env.WEBHOOK_SECRET
    });

    const serviceName = `${context.projectId}-service`.toLowerCase();
    const cluster = user.ecs_cluster || 'default';

    const deploymentConfig = {
      cluster,
      serviceName,
      imageUri: `${user.ecr_repository}:${context.buildId}`,
      taskDefinitionFamily: `${context.projectId}-task`,
      envVars: {},
      healthCheckPath: '/health',
      deploymentStrategy: 'rolling',
      projectId: context.projectId,
      buildId: context.buildId
    };

    const result = await deploymentService.deployContainerizedApp(
      deploymentConfig,
      user.id,
      'user'
    );

    return {
      deploymentId: result.deploymentId,
      appUrl: `https://${serviceName}.example.com`,
      deploymentType: 'ecs-fargate',
      cluster: result.cluster,
      serviceName: result.serviceName
    };
  }

  /**
   * Deploy to Lambda + API Gateway (serverless)
   * @param {Object} context - Build context
   * @param {Object} repoInfo - Repository information
   * @param {Object} user - User object
   * @returns {Promise<Object>} Deployment result
   */
  async deployToLambda(context, repoInfo, user) {
    const LambdaAPIGatewayDeployment = require('./aws-lambda-apigateway-deployment');

    const deploymentService = new LambdaAPIGatewayDeployment({
      region: user.aws_region || 'us-east-1',
      roleArn: process.env.AWS_DEPLOYMENT_ROLE_ARN,
      webhookSecret: process.env.WEBHOOK_SECRET
    });

    const functionName = `${context.projectId}-function`.toLowerCase();
    const zipUrl = await this.artifactStorage.getArtifactUrl(context.buildId, 'lambda.zip');

    const deploymentConfig = {
      functionName,
      zipUrl,
      runtime: 'nodejs18.x',
      handler: 'index.handler',
      envVars: {},
      apiGatewayId: user.api_gateway_id,
      stageName: 'prod',
      healthCheckPath: '/health',
      timeout: 30,
      memorySize: 256,
      projectId: context.projectId,
      buildId: context.buildId
    };

    const result = await deploymentService.deployServerlessApp(
      deploymentConfig,
      user.id,
      'user'
    );

    return {
      deploymentId: result.deploymentId,
      appUrl: result.apiUrl,
      deploymentType: 'lambda',
      functionName: result.functionName,
      apiGatewayId: result.apiGatewayId
    };
  }

  /**
   * Infer project type from generated code
   * @param {Object} context - Build context
   * @returns {string} Project type
   */
  inferProjectType(context) {
    // Check for common patterns in file structure
    const fileStructure = context.artifacts[5]; // validated_structure.json

    if (!fileStructure) {
      return 'static'; // Default to static
    }

    const files = JSON.stringify(fileStructure).toLowerCase();

    // Check for containerized app indicators
    if (files.includes('dockerfile') || files.includes('docker-compose')) {
      return 'containerized';
    }

    // Check for serverless indicators
    if (files.includes('lambda') || files.includes('serverless')) {
      return 'serverless';
    }

    // Check for static site indicators
    if (files.includes('index.html') || files.includes('static')) {
      return 'static';
    }

    // Default to static
    return 'static';
  }

  /**
   * Select deployment type based on project type
   * @param {string} projectType - Project type
   * @returns {string} Deployment type
   */
  selectDeploymentType(projectType) {
    const typeMap = {
      'static': 's3-cloudfront',
      'containerized': 'ecs-fargate',
      'serverless': 'lambda'
    };

    return typeMap[projectType] || 's3-cloudfront';
  }

  /**
   * Create CloudFront distribution for S3 bucket
   * @param {string} bucketName - S3 bucket name
   * @returns {Promise<string>} Distribution ID
   */
  async createCloudFrontDistribution(bucketName) {
    // This would create a CloudFront distribution
    // For now, return a placeholder
    return `E${Date.now()}`;
  }
  /**
   * Stage 10: Deploy to GCP Cloud Run
   * @param {Object} stage - Stage configuration
   * @param {Object} context - Build context
   * @returns {Promise<Object>} Stage result
   */
  async handleGCPDeploymentStage(stage, context) {
    console.log(`[Build ${context.buildId}] Stage 10: Deploying to GCP Cloud Run`);

    try {
      // Get project and user details
      const user = await this.buildModel.getUser(context.userId);

      // Check for GCP credentials
      if (!user || !user.gcpServiceAccountKey) {
        console.log(`[Build ${context.buildId}] GCP credentials not configured, skipping deployment`);
        return {
          success: true,
          skipped: true,
          artifacts: {
            'gcp_deployment_url': null,
            'deployment_status': 'skipped',
            'skip_reason': 'GCP credentials not configured'
          }
        };
      }

      // Get GitHub Repo Info from artifacts of Stage 8
      const repoUrl = context.artifacts['github_repo_url'];
      const repoNameFull = context.artifacts['github_repo_name']; // "owner/repo"
      const repoOwner = context.artifacts['github_repo_owner'];

      if (!repoUrl || !repoNameFull) {
        throw new Error('GitHub repository information missing from previous stages');
      }

      const [owner, repoName] = repoNameFull.split('/');

      // Send WebSocket update
      if (this.websocket) {
        this.websocket.sendPhaseUpdate(context.buildId, 'gcp-deployment', 'triggering', {
          repoName: repoNameFull
        });
      }

      // Trigger Cloud Build
      const gcpDeploymentService = require('./gcp-deployment');
      const deploymentResult = await gcpDeploymentService.deployFromGitHub(
        context.userId,
        context.projectId,
        owner,
        repoName,
        'main', // default branch
        context.artifacts['commit_sha']
      );

      console.log(`[Build ${context.buildId}] ✅ GCP Deployment triggered: ${deploymentResult.buildUrl}`);

      // Send WebSocket update
      if (this.websocket) {
        this.websocket.sendPhaseUpdate(context.buildId, 'gcp-deployment', 'deploying', {
          buildUrl: deploymentResult.buildUrl,
          serviceName: deploymentResult.serviceName
        });
      }

      return {
        success: true,
        artifacts: {
          'gcp_deployment_url': deploymentResult.serviceUrl,
          'gcp_build_url': deploymentResult.buildUrl,
          'gcp_build_id': deploymentResult.buildId,
          'gcp_project_id': deploymentResult.projectId,
          'timestamp': new Date().toISOString()
        }
      };

    } catch (error) {
      console.error(`[Build ${context.buildId}] Stage 10 failed:`, error);

      // Send WebSocket error
      if (this.websocket) {
        this.websocket.sendPhaseUpdate(context.buildId, 'gcp-deployment', 'failed', {
          error: error.message
        });
      }

      // If optional, we don't throw, just return failed attempt
      if (stage.optional) {
        return {
          success: false,
          error: error.message,
          artifacts: {
            'deployment_status': 'failed',
            'error': error.message
          }
        };
      }

      throw new Error(`GCP Deployment failed: ${error.message}`);
    }
  }
}

module.exports = PipelineOrchestrator;
