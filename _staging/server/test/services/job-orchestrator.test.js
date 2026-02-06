const JobOrchestrator = require('../../services/job-orchestrator');
const EventEmitter = require('events');

describe('JobOrchestrator', () => {
  test('should initialize with required dependencies', () => {
    const mockJobQueue = {
      queues: new Map(),
      queueEvents: new Map(),
      addJob: async () => ({ id: 'test-job-1' })
    };

    const mockBuildModel = {
      findById: async () => ({
        update: async () => {},
        updatePhaseStatus: async () => {},
        updateMetrics: async () => {}
      })
    };

    const mockProjectModel = {
      findById: async () => ({
        update: async () => {}
      })
    };

    const orchestrator = new JobOrchestrator({
      jobQueue: mockJobQueue,
      buildModel: mockBuildModel,
      projectModel: mockProjectModel
    });

    expect(orchestrator).toBeTruthy();
    expect(orchestrator).toBeInstanceOf(EventEmitter);
    expect(orchestrator.jobQueue).toBe(mockJobQueue);
    expect(orchestrator.buildModel).toBe(mockBuildModel);
    expect(orchestrator.projectModel).toBe(mockProjectModel);
  });

  test('should have correct phase definitions', () => {
    const orchestrator = new JobOrchestrator({
      jobQueue: {},
      buildModel: {},
      projectModel: {}
    });

    expect(orchestrator.phases.planning).toBeDefined();
    expect(orchestrator.phases.generation).toBeDefined();
    expect(orchestrator.phases.testing).toBeDefined();
    expect(orchestrator.phases.deployment).toBeDefined();

    expect(orchestrator.phases.planning.nextPhase).toBe('generation');
    expect(orchestrator.phases.generation.nextPhase).toBe('testing');
    expect(orchestrator.phases.testing.nextPhase).toBe('deployment');
    expect(orchestrator.phases.deployment.nextPhase).toBeNull();
  });

  test('should calculate total phases correctly', () => {
    const orchestrator = new JobOrchestrator({
      jobQueue: {},
      buildModel: {},
      projectModel: {}
    });

    // All phases enabled
    expect(orchestrator.getTotalPhases({ runTests: true, deploy: true })).toBe(4);

    // No testing
    expect(orchestrator.getTotalPhases({ runTests: false, deploy: true })).toBe(3);

    // No deployment
    expect(orchestrator.getTotalPhases({ runTests: true, deploy: false })).toBe(3);

    // Only planning and generation
    expect(orchestrator.getTotalPhases({ runTests: false, deploy: false })).toBe(2);
  });

  test('should determine if phase should execute', () => {
    const orchestrator = new JobOrchestrator({
      jobQueue: {},
      buildModel: {},
      projectModel: {}
    });

    const orchestration = {
      buildOptions: { runTests: true, deploy: true }
    };

    expect(orchestrator.shouldExecutePhase('planning', orchestration)).toBe(true);
    expect(orchestrator.shouldExecutePhase('generation', orchestration)).toBe(true);
    expect(orchestrator.shouldExecutePhase('testing', orchestration)).toBe(true);
    expect(orchestrator.shouldExecutePhase('deployment', orchestration)).toBe(true);

    orchestration.buildOptions.runTests = false;
    expect(orchestrator.shouldExecutePhase('testing', orchestration)).toBe(false);

    orchestration.buildOptions.deploy = false;
    expect(orchestrator.shouldExecutePhase('deployment', orchestration)).toBe(false);
  });

  test('should prepare job data correctly', () => {
    const orchestrator = new JobOrchestrator({
      jobQueue: {},
      buildModel: {},
      projectModel: {}
    });

    const orchestration = {
      buildId: 'build-123',
      projectId: 'proj-456',
      orgId: 'org-789',
      userId: 'user-abc',
      specJson: { name: 'Test Project' },
      buildOptions: { runTests: true, deploy: true },
      artifacts: {
        planning: { taskPlan: { tasks: [] } },
        generation: { artifactsUrl: 's3://bucket/artifacts.zip' }
      }
    };

    // Planning phase
    let jobData = orchestrator.prepareJobData('planning', orchestration);
    expect(jobData.operation).toBe('plan');
    expect(jobData.buildId).toBe('build-123');

    // Generation phase
    jobData = orchestrator.prepareJobData('generation', orchestration);
    expect(jobData.operation).toBe('generate');
    expect(jobData.taskPlan).toBeDefined();

    // Testing phase
    jobData = orchestrator.prepareJobData('testing', orchestration);
    expect(jobData.operation).toBe('test');
    expect(jobData.artifactsUrl).toBeDefined();

    // Deployment phase
    jobData = orchestrator.prepareJobData('deployment', orchestration);
    expect(jobData.operation).toBe('deploy');
    expect(jobData.artifactsUrl).toBeDefined();
  });

  test('should get job priority correctly', () => {
    const orchestrator = new JobOrchestrator({
      jobQueue: {},
      buildModel: {},
      projectModel: {}
    });

    expect(orchestrator.getJobPriority('planning')).toBe(1);
    expect(orchestrator.getJobPriority('generation')).toBe(2);
    expect(orchestrator.getJobPriority('testing')).toBe(3);
    expect(orchestrator.getJobPriority('deployment')).toBe(4);
    expect(orchestrator.getJobPriority('unknown')).toBe(5);
  });

  test('should track active orchestrations', () => {
    const orchestrator = new JobOrchestrator({
      jobQueue: {},
      buildModel: {},
      projectModel: {}
    });

    const orchestration = {
      buildId: 'build-123',
      projectId: 'proj-456',
      status: 'running',
      currentPhase: 'planning',
      startedAt: new Date()
    };

    orchestrator.activeOrchestrations.set('build-123', orchestration);

    const status = orchestrator.getOrchestrationStatus('build-123');
    expect(status).toBeDefined();
    expect(status.buildId).toBe('build-123');
    expect(status.status).toBe('running');

    const active = orchestrator.getActiveOrchestrations();
    expect(active).toHaveLength(1);
    expect(active[0].buildId).toBe('build-123');
  });
});
