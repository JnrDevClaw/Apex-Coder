const EventEmitter = require('events');

/**
 * Job Orchestrator Service
 * 
 * Manages the complete flow from questionnaire to deployment:
 * 1. Planning (task decomposition)
 * 2. Code Generation
 * 3. Testing
 * 4. Deployment
 * 
 * Handles job dependencies, progress tracking, and error recovery.
 */
class JobOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.jobQueue = options.jobQueue;
    this.buildModel = options.buildModel;
    this.projectModel = options.projectModel;
    this.websocket = options.websocket; // WebSocket instance for real-time updates
    
    // Track active orchestrations
    this.activeOrchestrations = new Map();
    
    // Job phase definitions with dependencies
    this.phases = {
      planning: {
        queue: 'task-planning',
        jobName: 'plan-project',
        nextPhase: 'generation',
        timeout: 300000, // 5 minutes
        retries: 2
      },
      generation: {
        queue: 'code-generation',
        jobName: 'generate-code',
        nextPhase: 'testing',
        timeout: 600000, // 10 minutes
        retries: 3
      },
      testing: {
        queue: 'code-generation',
        jobName: 'run-tests',
        nextPhase: 'deployment',
        timeout: 300000, // 5 minutes
        retries: 2,
        optional: true // Can skip if buildOptions.runTests = false
      },
      deployment: {
        queue: 'deployment',
        jobName: 'deploy-project',
        nextPhase: null,
        timeout: 600000, // 10 minutes
        retries: 2,
        optional: true // Can skip if buildOptions.deploy = false
      }
    };
  }

  /**
   * Start complete orchestration flow
   * @param {Object} params - Orchestration parameters
   * @param {string} params.buildId - Build ID
   * @param {string} params.projectId - Project ID
   * @param {string} params.orgId - Organization ID
   * @param {Object} params.specJson - Project specification
   * @param {Object} params.buildOptions - Build options (runTests, deploy)
   * @param {string} params.userId - User ID
   * @returns {Promise<Object>} Orchestration result
   */
  async startOrchestration(params) {
    const {
      buildId,
      projectId,
      orgId,
      specJson,
      buildOptions = { runTests: true, deploy: false },
      userId
    } = params;

    // Create orchestration context
    const orchestration = {
      buildId,
      projectId,
      orgId,
      userId,
      specJson,
      buildOptions,
      startedAt: new Date(),
      currentPhase: 'planning',
      completedPhases: [],
      failedPhases: [],
      jobs: {},
      artifacts: {},
      status: 'running'
    };

    this.activeOrchestrations.set(buildId, orchestration);

    try {
      // Update build status
      const build = await this.buildModel.findById(projectId, buildId);
      if (build) {
        await build.update({ 
          status: 'running',
          phase: 'planning'
        });
      }

      // Emit orchestration started event
      this.emit('orchestration:started', { buildId, projectId });

      // Send WebSocket update
      if (this.websocket) {
        this.websocket.sendBuildStatus(buildId, 'running', {
          message: 'Build orchestration started',
          totalPhases: this.getTotalPhases(buildOptions)
        });
      }

      // Start with planning phase
      await this.executePhase('planning', orchestration);

      return {
        success: true,
        buildId,
        status: 'running',
        message: 'Orchestration started successfully'
      };
    } catch (error) {
      console.error(`Orchestration failed for build ${buildId}:`, error);
      
      orchestration.status = 'failed';
      orchestration.error = error.message;
      orchestration.completedAt = new Date();

      // Update build status
      const build = await this.buildModel.findById(projectId, buildId);
      if (build) {
        await build.update({ 
          status: 'failed',
          errorMessage: error.message
        });
      }

      this.emit('orchestration:failed', { buildId, projectId, error: error.message });

      throw error;
    }
  }

  /**
   * Execute a specific phase
   * @param {string} phaseName - Phase name
   * @param {Object} orchestration - Orchestration context
   */
  async executePhase(phaseName, orchestration) {
    const phase = this.phases[phaseName];
    if (!phase) {
      throw new Error(`Unknown phase: ${phaseName}`);
    }

    // Check if phase is optional and should be skipped
    if (phase.optional && !this.shouldExecutePhase(phaseName, orchestration)) {
      console.log(`Skipping optional phase: ${phaseName}`);
      orchestration.completedPhases.push(phaseName);
      
      // Move to next phase
      if (phase.nextPhase) {
        await this.executePhase(phase.nextPhase, orchestration);
      } else {
        await this.completeOrchestration(orchestration);
      }
      return;
    }

    console.log(`Executing phase: ${phaseName} for build ${orchestration.buildId}`);
    
    orchestration.currentPhase = phaseName;
    
    // Emit phase started event
    this.emit('phase:started', { 
      buildId: orchestration.buildId, 
      phase: phaseName 
    });

    // Send WebSocket update
    if (this.websocket) {
      this.websocket.sendPhaseUpdate(orchestration.buildId, phaseName, 'started', {
        completedPhases: orchestration.completedPhases.length,
        totalPhases: this.getTotalPhases(orchestration.buildOptions)
      });
    }

    // Update build with current phase
    const build = await this.buildModel.findById(orchestration.projectId, orchestration.buildId);
    if (build) {
      await build.update({ phase: phaseName });
      await build.updatePhaseStatus(phaseName, 'running');
    }

    try {
      // Prepare job data
      const jobData = this.prepareJobData(phaseName, orchestration);

      // Add job to queue
      const job = await this.jobQueue.addJob(
        phase.queue,
        phase.jobName,
        jobData,
        {
          priority: this.getJobPriority(phaseName),
          attempts: phase.retries,
          timeout: phase.timeout,
          removeOnComplete: 10,
          removeOnFail: 50
        }
      );

      // Store job reference
      orchestration.jobs[phaseName] = {
        jobId: job.id,
        queueName: phase.queue,
        startedAt: new Date(),
        status: 'queued'
      };

      console.log(`Phase ${phaseName} job queued with ID: ${job.id}`);

      // Set up job completion handler
      this.setupJobHandler(phaseName, job.id, orchestration);

    } catch (error) {
      console.error(`Failed to execute phase ${phaseName}:`, error);
      orchestration.failedPhases.push(phaseName);
      orchestration.status = 'failed';
      orchestration.error = error.message;
      
      // Emit phase failed event
      this.emit('phase:failed', { 
        buildId: orchestration.buildId, 
        phase: phaseName,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Set up job completion handler
   * @param {string} phaseName - Phase name
   * @param {string} jobId - Job ID
   * @param {Object} orchestration - Orchestration context
   */
  setupJobHandler(phaseName, jobId, orchestration) {
    const phase = this.phases[phaseName];
    const queueEvents = this.jobQueue.queueEvents.get(phase.queue);

    if (!queueEvents) {
      console.warn(`No queue events found for ${phase.queue}`);
      return;
    }

    // Listen for job completion
    const completedHandler = async ({ jobId: completedJobId, returnvalue }) => {
      if (completedJobId !== jobId) return;

      console.log(`Phase ${phaseName} completed for build ${orchestration.buildId}`);
      
      orchestration.jobs[phaseName].status = 'completed';
      orchestration.jobs[phaseName].completedAt = new Date();
      orchestration.jobs[phaseName].result = returnvalue;
      orchestration.completedPhases.push(phaseName);

      // Store artifacts if any
      if (returnvalue && returnvalue.artifacts) {
        orchestration.artifacts[phaseName] = returnvalue.artifacts;
      }

      // Update build phase status
      const build = await this.buildModel.findById(orchestration.projectId, orchestration.buildId);
      if (build) {
        await build.updatePhaseStatus(phaseName, 'completed', {
          artifacts: returnvalue?.artifacts
        });
        
        // Update metrics if provided
        if (returnvalue?.metrics) {
          await build.updateMetrics(returnvalue.metrics);
        }
      }

      // Emit phase completed event
      this.emit('phase:completed', { 
        buildId: orchestration.buildId, 
        phase: phaseName,
        result: returnvalue
      });

      // Send WebSocket update
      if (this.websocket) {
        this.websocket.sendPhaseUpdate(orchestration.buildId, phaseName, 'completed', {
          completedPhases: orchestration.completedPhases.length,
          totalPhases: this.getTotalPhases(orchestration.buildOptions),
          result: returnvalue
        });
        
        // Send progress update
        const progress = (orchestration.completedPhases.length / this.getTotalPhases(orchestration.buildOptions)) * 100;
        this.websocket.sendBuildProgress(orchestration.buildId, {
          percentage: Math.round(progress),
          currentPhase: phaseName,
          status: 'completed'
        });
      }

      // Clean up listeners
      queueEvents.off('completed', completedHandler);
      queueEvents.off('failed', failedHandler);

      // Move to next phase
      if (phase.nextPhase) {
        await this.executePhase(phase.nextPhase, orchestration);
      } else {
        await this.completeOrchestration(orchestration);
      }
    };

    // Listen for job failure
    const failedHandler = async ({ jobId: failedJobId, failedReason }) => {
      if (failedJobId !== jobId) return;

      console.error(`Phase ${phaseName} failed for build ${orchestration.buildId}:`, failedReason);
      
      orchestration.jobs[phaseName].status = 'failed';
      orchestration.jobs[phaseName].completedAt = new Date();
      orchestration.jobs[phaseName].error = failedReason;
      orchestration.failedPhases.push(phaseName);
      orchestration.status = 'failed';
      orchestration.error = failedReason;

      // Emit phase failed event
      this.emit('phase:failed', { 
        buildId: orchestration.buildId, 
        phase: phaseName,
        error: failedReason
      });

      // Send WebSocket error notification
      if (this.websocket) {
        this.websocket.sendError(orchestration.buildId, {
          message: failedReason,
          phase: phaseName
        }, phaseName);
        
        this.websocket.sendPhaseUpdate(orchestration.buildId, phaseName, 'failed', {
          error: failedReason
        });
      }

      // Clean up listeners
      queueEvents.off('completed', completedHandler);
      queueEvents.off('failed', failedHandler);

      // Update build status and phase details
      const build = await this.buildModel.findById(orchestration.projectId, orchestration.buildId);
      if (build) {
        await build.update({ 
          status: 'failed',
          errorMessage: failedReason
        });
        await build.updatePhaseStatus(phaseName, 'failed', {
          error: failedReason
        });
      }

      // Emit orchestration failed event
      this.emit('orchestration:failed', { 
        buildId: orchestration.buildId, 
        projectId: orchestration.projectId,
        error: failedReason
      });
    };

    queueEvents.on('completed', completedHandler);
    queueEvents.on('failed', failedHandler);
  }

  /**
   * Complete orchestration
   * @param {Object} orchestration - Orchestration context
   */
  async completeOrchestration(orchestration) {
    console.log(`Orchestration completed for build ${orchestration.buildId}`);
    
    orchestration.status = 'completed';
    orchestration.completedAt = new Date();

    // Update build status
    const build = await this.buildModel.findById(orchestration.projectId, orchestration.buildId);
    if (build) {
      await build.update({ 
        status: 'completed',
        completedAt: new Date().toISOString(),
        artifactsS3Url: orchestration.artifacts.generation?.artifactsUrl || null
      });
    }

    // Update project status
    const project = await this.projectModel.findById(orchestration.orgId, orchestration.projectId);
    if (project) {
      await project.update({ 
        status: orchestration.buildOptions.deploy ? 'deployed' : 'built'
      });
    }

    // Emit orchestration completed event
    this.emit('orchestration:completed', { 
      buildId: orchestration.buildId, 
      projectId: orchestration.projectId,
      artifacts: orchestration.artifacts
    });

    // Send WebSocket completion update
    if (this.websocket) {
      this.websocket.sendBuildStatus(orchestration.buildId, 'completed', {
        message: 'Build completed successfully',
        artifacts: orchestration.artifacts,
        duration: new Date() - orchestration.startedAt
      });
      
      this.websocket.sendBuildProgress(orchestration.buildId, {
        percentage: 100,
        status: 'completed'
      });
    }

    // Clean up
    this.activeOrchestrations.delete(orchestration.buildId);
  }

  /**
   * Prepare job data for a specific phase
   * @param {string} phaseName - Phase name
   * @param {Object} orchestration - Orchestration context
   * @returns {Object} Job data
   */
  prepareJobData(phaseName, orchestration) {
    const baseData = {
      buildId: orchestration.buildId,
      projectId: orchestration.projectId,
      orgId: orchestration.orgId,
      userId: orchestration.userId,
      specJson: orchestration.specJson
    };

    switch (phaseName) {
      case 'planning':
        return {
          ...baseData,
          operation: 'plan'
        };

      case 'generation':
        return {
          ...baseData,
          operation: 'generate',
          taskPlan: orchestration.artifacts.planning?.taskPlan || null
        };

      case 'testing':
        return {
          ...baseData,
          operation: 'test',
          artifactsUrl: orchestration.artifacts.generation?.artifactsUrl || null
        };

      case 'deployment':
        return {
          ...baseData,
          operation: 'deploy',
          artifactsUrl: orchestration.artifacts.generation?.artifactsUrl || null,
          deploymentOptions: orchestration.buildOptions.deploymentOptions || {}
        };

      default:
        return baseData;
    }
  }

  /**
   * Check if a phase should be executed
   * @param {string} phaseName - Phase name
   * @param {Object} orchestration - Orchestration context
   * @returns {boolean} Should execute
   */
  shouldExecutePhase(phaseName, orchestration) {
    const { buildOptions } = orchestration;

    switch (phaseName) {
      case 'testing':
        return buildOptions.runTests !== false;
      
      case 'deployment':
        return buildOptions.deploy === true;
      
      default:
        return true;
    }
  }

  /**
   * Get job priority based on phase
   * @param {string} phaseName - Phase name
   * @returns {number} Priority (lower is higher priority)
   */
  getJobPriority(phaseName) {
    const priorities = {
      planning: 1,
      generation: 2,
      testing: 3,
      deployment: 4
    };
    return priorities[phaseName] || 5;
  }

  /**
   * Get orchestration status
   * @param {string} buildId - Build ID
   * @returns {Object|null} Orchestration status
   */
  getOrchestrationStatus(buildId) {
    const orchestration = this.activeOrchestrations.get(buildId);
    if (!orchestration) {
      return null;
    }

    return {
      buildId: orchestration.buildId,
      projectId: orchestration.projectId,
      status: orchestration.status,
      currentPhase: orchestration.currentPhase,
      completedPhases: orchestration.completedPhases,
      failedPhases: orchestration.failedPhases,
      startedAt: orchestration.startedAt,
      completedAt: orchestration.completedAt,
      jobs: orchestration.jobs,
      error: orchestration.error
    };
  }

  /**
   * Cancel orchestration
   * @param {string} buildId - Build ID
   */
  async cancelOrchestration(buildId) {
    const orchestration = this.activeOrchestrations.get(buildId);
    if (!orchestration) {
      throw new Error(`Orchestration not found for build ${buildId}`);
    }

    console.log(`Cancelling orchestration for build ${buildId}`);

    // Cancel all active jobs
    for (const [phaseName, jobInfo] of Object.entries(orchestration.jobs)) {
      if (jobInfo.status === 'queued' || jobInfo.status === 'running') {
        try {
          const queue = this.jobQueue.queues.get(this.phases[phaseName].queue);
          if (queue) {
            const job = await queue.getJob(jobInfo.jobId);
            if (job) {
              await job.remove();
              console.log(`Cancelled job ${jobInfo.jobId} for phase ${phaseName}`);
            }
          }
        } catch (error) {
          console.error(`Failed to cancel job ${jobInfo.jobId}:`, error);
        }
      }
    }

    orchestration.status = 'cancelled';
    orchestration.completedAt = new Date();

    // Update build status
    const build = await this.buildModel.findById(orchestration.projectId, buildId);
    if (build) {
      await build.update({ 
        status: 'cancelled'
      });
    }

    // Emit orchestration cancelled event
    this.emit('orchestration:cancelled', { 
      buildId, 
      projectId: orchestration.projectId 
    });

    // Clean up
    this.activeOrchestrations.delete(buildId);
  }

  /**
   * Get all active orchestrations
   * @returns {Array} Active orchestrations
   */
  getActiveOrchestrations() {
    return Array.from(this.activeOrchestrations.values()).map(o => ({
      buildId: o.buildId,
      projectId: o.projectId,
      status: o.status,
      currentPhase: o.currentPhase,
      startedAt: o.startedAt
    }));
  }

  /**
   * Get total number of phases based on build options
   * @param {Object} buildOptions - Build options
   * @returns {number} Total phases
   */
  getTotalPhases(buildOptions) {
    let total = 2; // planning + generation are always executed
    
    if (buildOptions.runTests !== false) {
      total += 1;
    }
    
    if (buildOptions.deploy === true) {
      total += 1;
    }
    
    return total;
  }
}

module.exports = JobOrchestrator;
