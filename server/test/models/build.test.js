const Build = require('../../models/build');

describe('Build Model', () => {
  describe('constructor and properties', () => {
    test('should create build with required fields', () => {
      const buildData = {
        projectId: 'proj123',
        orgId: 'org123'
      };
      
      const build = new Build(buildData);
      
      expect(build.projectId).toBe('proj123');
      expect(build.orgId).toBe('org123');
      expect(build.buildId).toBeDefined();
      expect(build.status).toBe('queued');
      expect(build.attempts).toBe(1);
      expect(build.selfFixIterations).toBe(0);
      expect(build.startedAt).toBeDefined();
      expect(build.buildOptions).toEqual({ runTests: true, deploy: false });
    });

    test('should generate correct PK', () => {
      const build = new Build({
        projectId: 'proj123',
        buildId: 'build456',
        orgId: 'org123'
      });
      
      expect(build.PK).toBe('proj123#build456');
    });

    test('should convert to DynamoDB item correctly', () => {
      const build = new Build({
        projectId: 'proj123',
        buildId: 'build456',
        orgId: 'org123',
        status: 'running',
        specJson: { test: 'spec' }
      });
      
      const item = build.toDynamoItem();
      
      expect(item.PK).toBe('proj123#build456');
      expect(item.projectId).toBe('proj123');
      expect(item.buildId).toBe('build456');
      expect(item.orgId).toBe('org123');
      expect(item.status).toBe('running');
      expect(item.specJson).toEqual({ test: 'spec' });
      expect(item.attempts).toBe(1);
      expect(item.selfFixIterations).toBe(0);
    });
  });

  describe('fromDynamoItem', () => {
    test('should create Build from DynamoDB item', () => {
      const item = {
        PK: 'proj123#build456',
        projectId: 'proj123',
        buildId: 'build456',
        orgId: 'org123',
        status: 'completed',
        startedAt: '2024-01-01T00:00:00Z',
        completedAt: '2024-01-01T00:05:00Z',
        logsS3Url: 's3://bucket/logs.txt',
        artifactsS3Url: 's3://bucket/artifacts.zip',
        attempts: 2,
        selfFixIterations: 1,
        deploymentId: 'deploy123',
        errorMessage: null,
        buildOptions: { runTests: true, deploy: true },
        specJson: { test: 'spec' }
      };
      
      const build = Build.fromDynamoItem(item);
      
      expect(build).toBeInstanceOf(Build);
      expect(build.projectId).toBe('proj123');
      expect(build.buildId).toBe('build456');
      expect(build.orgId).toBe('org123');
      expect(build.status).toBe('completed');
      expect(build.completedAt).toBe('2024-01-01T00:05:00Z');
      expect(build.logsS3Url).toBe('s3://bucket/logs.txt');
      expect(build.artifactsS3Url).toBe('s3://bucket/artifacts.zip');
      expect(build.attempts).toBe(2);
      expect(build.selfFixIterations).toBe(1);
      expect(build.deploymentId).toBe('deploy123');
      expect(build.buildOptions).toEqual({ runTests: true, deploy: true });
    });
  });

  describe('stage tracking', () => {
    test('should initialize with default stage tracking fields', () => {
      const build = new Build({
        projectId: 'proj123',
        orgId: 'org123'
      });
      
      expect(build.currentStage).toBe(0);
      expect(build.stageStatuses).toEqual({});
      expect(build.artifacts).toEqual({});
      expect(build.failedAt).toBeNull();
      expect(build.errorLogs).toEqual([]);
    });

    test('should store stage artifacts correctly', () => {
      const build = new Build({
        projectId: 'proj123',
        orgId: 'org123'
      });
      
      const artifacts = {
        specsPath: '/project/proj123/specs/specs_refined.json',
        historyPath: '/project/proj123/specs/clarification_history.json'
      };
      
      // Mock the update method to avoid DB calls
      build.update = jest.fn().mockResolvedValue(build);
      
      return build.storeStageArtifacts('clarifier', artifacts).then(() => {
        expect(build.update).toHaveBeenCalledWith({
          artifacts: expect.objectContaining({
            clarifier: expect.objectContaining({
              specsPath: '/project/proj123/specs/specs_refined.json',
              historyPath: '/project/proj123/specs/clarification_history.json',
              storedAt: expect.any(String)
            })
          })
        });
      });
    });

    test('should retrieve stage artifacts correctly', () => {
      const build = new Build({
        projectId: 'proj123',
        orgId: 'org123',
        artifacts: {
          clarifier: {
            specsPath: '/project/proj123/specs/specs_refined.json',
            storedAt: '2024-01-01T00:00:00Z'
          }
        }
      });
      
      const artifacts = build.getStageArtifacts('clarifier');
      
      expect(artifacts).toEqual({
        specsPath: '/project/proj123/specs/specs_refined.json',
        storedAt: '2024-01-01T00:00:00Z'
      });
    });

    test('should return null for non-existent stage artifacts', () => {
      const build = new Build({
        projectId: 'proj123',
        orgId: 'org123'
      });
      
      const artifacts = build.getStageArtifacts('nonexistent');
      
      expect(artifacts).toBeNull();
    });

    test('should update stage status correctly', () => {
      const build = new Build({
        projectId: 'proj123',
        orgId: 'org123'
      });
      
      build.update = jest.fn().mockResolvedValue(build);
      
      const metadata = {
        artifactsPath: '/project/proj123/stage-1',
        artifactKeys: ['specs_refined.json', 'clarification_history.json']
      };
      
      return build.updateStageStatus('clarifier', 'completed', metadata).then(() => {
        expect(build.update).toHaveBeenCalledWith({
          stageStatuses: expect.objectContaining({
            clarifier: expect.objectContaining({
              status: 'completed',
              updatedAt: expect.any(String),
              artifactsPath: '/project/proj123/stage-1',
              artifactKeys: ['specs_refined.json', 'clarification_history.json']
            })
          })
        });
      });
    });

    test('should log stage errors correctly', () => {
      const build = new Build({
        projectId: 'proj123',
        orgId: 'org123',
        errorLogs: []
      });
      
      build.update = jest.fn().mockResolvedValue(build);
      
      const error = new Error('Model call failed');
      const context = {
        attempt: 2,
        isFinalFailure: false
      };
      
      return build.logStageError('clarifier', 1, error, context).then(() => {
        expect(build.update).toHaveBeenCalledWith({
          errorLogs: expect.arrayContaining([
            expect.objectContaining({
              stage: 'clarifier',
              stageNumber: 1,
              message: 'Model call failed',
              timestamp: expect.any(String),
              context: context,
              attempt: 2
            })
          ])
        });
      });
    });

    test('should mark build as failed at stage when final failure occurs', () => {
      const build = new Build({
        projectId: 'proj123',
        orgId: 'org123',
        errorLogs: []
      });
      
      build.update = jest.fn().mockResolvedValue(build);
      
      const error = new Error('All retries exhausted');
      const context = {
        attempt: 3,
        isFinalFailure: true
      };
      
      return build.logStageError('normalizer', 1.5, error, context).then(() => {
        expect(build.update).toHaveBeenCalledWith(
          expect.objectContaining({
            failedAt: 'stage-1.5',
            status: 'failed',
            errorMessage: 'All retries exhausted'
          })
        );
      });
    });

    test('should mark build as failed at specific stage', () => {
      const build = new Build({
        projectId: 'proj123',
        orgId: 'org123'
      });
      
      build.update = jest.fn().mockResolvedValue(build);
      
      return build.markFailedAtStage(3, 'schema-generator', 'DeepSeek API timeout').then(() => {
        expect(build.update).toHaveBeenCalledWith({
          status: 'failed',
          failedAt: 'stage-3',
          errorMessage: 'DeepSeek API timeout',
          completedAt: expect.any(String)
        });
      });
    });

    test('should include stage tracking fields in DynamoDB item', () => {
      const build = new Build({
        projectId: 'proj123',
        buildId: 'build456',
        orgId: 'org123',
        currentStage: 2,
        stageStatuses: {
          clarifier: { status: 'completed', updatedAt: '2024-01-01T00:00:00Z' },
          normalizer: { status: 'running', updatedAt: '2024-01-01T00:01:00Z' }
        },
        artifacts: {
          clarifier: { specsPath: '/specs/specs_refined.json' }
        },
        failedAt: null,
        errorLogs: []
      });
      
      const item = build.toDynamoItem();
      
      expect(item.currentStage).toBe(2);
      expect(item.stageStatuses).toEqual({
        clarifier: { status: 'completed', updatedAt: '2024-01-01T00:00:00Z' },
        normalizer: { status: 'running', updatedAt: '2024-01-01T00:01:00Z' }
      });
      expect(item.artifacts).toEqual({
        clarifier: { specsPath: '/specs/specs_refined.json' }
      });
      expect(item.failedAt).toBeNull();
      expect(item.errorLogs).toEqual([]);
    });

    test('should restore stage tracking fields from DynamoDB item', () => {
      const item = {
        projectId: 'proj123',
        buildId: 'build456',
        orgId: 'org123',
        status: 'running',
        currentStage: 3,
        stageStatuses: {
          clarifier: { status: 'completed' },
          normalizer: { status: 'completed' },
          'docs-creator': { status: 'running' }
        },
        artifacts: {
          clarifier: { specsPath: '/specs/specs_refined.json' },
          normalizer: { specsPath: '/specs/specs_clean.json' }
        },
        failedAt: null,
        errorLogs: [
          { stage: 'clarifier', message: 'Retry 1', attempt: 1 }
        ]
      };
      
      const build = Build.fromDynamoItem(item);
      
      expect(build.currentStage).toBe(3);
      expect(build.stageStatuses).toEqual({
        clarifier: { status: 'completed' },
        normalizer: { status: 'completed' },
        'docs-creator': { status: 'running' }
      });
      expect(build.artifacts).toEqual({
        clarifier: { specsPath: '/specs/specs_refined.json' },
        normalizer: { specsPath: '/specs/specs_clean.json' }
      });
      expect(build.failedAt).toBeNull();
      expect(build.errorLogs).toEqual([
        { stage: 'clarifier', message: 'Retry 1', attempt: 1 }
      ]);
    });
  });
});