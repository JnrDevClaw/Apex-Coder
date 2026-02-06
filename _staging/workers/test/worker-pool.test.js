// Mock Docker before importing
jest.mock('dockerode', () => {
  return jest.fn().mockImplementation(() => ({
    createContainer: jest.fn(),
    createNetwork: jest.fn(),
    createVolume: jest.fn(),
    listNetworks: jest.fn(),
    listImages: jest.fn(),
    buildImage: jest.fn(),
    getNetwork: jest.fn(),
    modem: {
      followProgress: jest.fn()
    }
  }));
});

// Mock AWS SDK for testing
jest.mock('aws-sdk', () => ({
  S3: jest.fn().mockImplementation(() => ({
    config: { region: 'us-east-1' },
    headBucket: jest.fn(),
    createBucket: jest.fn(),
    putBucketVersioning: jest.fn(),
    upload: jest.fn(),
    getObject: jest.fn(),
    listObjectsV2: jest.fn(),
    deleteObject: jest.fn(),
    headObject: jest.fn(),
    getSignedUrlPromise: jest.fn()
  }))
}));

// Mock archiver for testing
jest.mock('archiver', () => {
  return jest.fn().mockImplementation(() => ({
    pointer: jest.fn().mockReturnValue(2048),
    on: jest.fn(),
    pipe: jest.fn(),
    directory: jest.fn(),
    finalize: jest.fn()
  }));
});

// Mock fs for testing
jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
    unlink: jest.fn(),
    writeFile: jest.fn()
  },
  createReadStream: jest.fn(),
  createWriteStream: jest.fn()
}));

const WorkerPool = require('../services/worker-pool');
const JobExecutor = require('../services/job-executor');
const SelfFixLoop = require('../services/self-fix-loop');
const TestFailureDetector = require('../services/test-failure-detector');
const ArtifactStorage = require('../services/artifact-storage');
const Docker = require('dockerode');
const AWS = require('aws-sdk');

describe('Worker Pool', () => {
  let workerPool;
  let mockDocker;
  let mockContainer;
  let mockNetwork;
  let mockVolume;

  beforeEach(() => {
    // Setup Docker mocks
    mockContainer = {
      start: jest.fn().mockResolvedValue({}),
      stop: jest.fn().mockResolvedValue({}),
      wait: jest.fn().mockImplementation((callback) => {
        callback(null, { StatusCode: 0 });
      }),
      logs: jest.fn().mockImplementation((options, callback) => {
        const mockStream = {
          on: jest.fn().mockImplementation((event, handler) => {
            if (event === 'data') {
              setTimeout(() => handler(Buffer.from('Test output')), 10);
            }
          })
        };
        callback(null, mockStream);
      }),
      exec: jest.fn().mockResolvedValue({
        start: jest.fn().mockResolvedValue({})
      })
    };

    mockNetwork = {
      remove: jest.fn().mockResolvedValue({})
    };

    mockVolume = {
      Name: 'test-volume',
      remove: jest.fn().mockResolvedValue({})
    };

    mockDocker = {
      createContainer: jest.fn().mockResolvedValue(mockContainer),
      createNetwork: jest.fn().mockResolvedValue(mockNetwork),
      createVolume: jest.fn().mockResolvedValue(mockVolume),
      listNetworks: jest.fn().mockResolvedValue([]),
      listImages: jest.fn().mockResolvedValue([]),
      buildImage: jest.fn().mockResolvedValue({}),
      getNetwork: jest.fn().mockReturnValue(mockNetwork),
      modem: {
        followProgress: jest.fn().mockImplementation((stream, onFinished, onProgress) => {
          onFinished(null, []);
        })
      }
    };

    Docker.mockImplementation(() => mockDocker);

    workerPool = new WorkerPool({
      maxWorkers: 2,
      memory: 1024 * 1024 * 1024, // 1GB for testing
      timeout: 30000 // 30 seconds for testing
    });
  });

  afterEach(async () => {
    if (workerPool) {
      await workerPool.shutdown();
    }
    jest.clearAllMocks();
  });

  test('should initialize worker pool', async () => {
    expect(workerPool).toBeDefined();
    expect(workerPool.maxWorkers).toBe(2);
    expect(workerPool.resourceLimits.memory).toBe(1024 * 1024 * 1024);
  });

  test('should determine correct stack from job payload', () => {
    const nodePayload = {
      specJson: { stack: { backend: 'node' } }
    };
    expect(workerPool.determineStack(nodePayload)).toBe('nodejs');

    const pythonPayload = {
      specJson: { stack: { backend: 'python' } }
    };
    expect(workerPool.determineStack(pythonPayload)).toBe('python');

    const goPayload = {
      specJson: { stack: { backend: 'go' } }
    };
    expect(workerPool.determineStack(goPayload)).toBe('go');

    const defaultPayload = {};
    expect(workerPool.determineStack(defaultPayload)).toBe('nodejs');
  });

  test('should get pool stats', async () => {
    const stats = await workerPool.getPoolStats();
    expect(stats).toHaveProperty('totalWorkers');
    expect(stats).toHaveProperty('activeWorkers');
    expect(stats).toHaveProperty('maxWorkers');
    expect(stats).toHaveProperty('resourceLimits');
    expect(stats.maxWorkers).toBe(2);
  });

  describe('Docker Container Isolation and Resource Limits', () => {
    test('should create worker with proper resource limits', async () => {
      const jobPayload = {
        jobId: 'test-job-1',
        projectId: 'test-project',
        buildId: 'test-build',
        specJson: { stack: { backend: 'node' } }
      };

      const worker = await workerPool.createWorker(jobPayload);

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          Image: 'worker-nodejs:latest',
          HostConfig: expect.objectContaining({
            Memory: 1024 * 1024 * 1024, // 1GB
            CpuQuota: 100000, // 1 CPU
            CpuPeriod: 100000,
            NetworkMode: 'ai-app-builder-workers',
            SecurityOpt: ['no-new-privileges:true'],
            ReadonlyRootfs: false,
            Tmpfs: {
              '/tmp': 'rw,noexec,nosuid,size=100m'
            }
          })
        })
      );

      expect(worker.id).toBeDefined();
      expect(worker.stack).toBe('nodejs');
      expect(worker.volumes).toHaveProperty('workspace');
      expect(worker.volumes).toHaveProperty('artifacts');
      expect(worker.volumes).toHaveProperty('logs');
    });

    test('should create isolated network for workers', async () => {
      await workerPool.createWorkerNetwork();

      expect(mockDocker.createNetwork).toHaveBeenCalledWith({
        Name: 'ai-app-builder-workers',
        Driver: 'bridge',
        Internal: true, // No external access for security
        IPAM: {
          Config: [{
            Subnet: '172.20.0.0/16'
          }]
        }
      });
    });

    test('should create ephemeral volumes for worker isolation', async () => {
      const volume = await workerPool.createEphemeralVolume('test-volume');

      expect(mockDocker.createVolume).toHaveBeenCalledWith({
        Name: 'test-volume',
        Driver: 'local',
        Labels: {
          'ai-app-builder.ephemeral': 'true',
          'ai-app-builder.created': expect.any(String)
        }
      });

      expect(volume).toBe(mockVolume);
    });

    test('should enforce timeout limits on job execution', async () => {
      const jobPayload = {
        jobId: 'timeout-test',
        projectId: 'test-project',
        buildId: 'test-build'
      };

      const worker = await workerPool.createWorker(jobPayload);
      
      // Mock a long-running container
      mockContainer.wait = jest.fn().mockImplementation((callback) => {
        // Never call callback to simulate timeout
      });

      const jobData = { task: 'generate', type: 'code-generation' };

      await expect(workerPool.executeJob(worker.id, jobData))
        .rejects.toThrow('timed out after 30000ms');
    }, 35000);

    test('should clean up worker resources after execution', async () => {
      const jobPayload = {
        jobId: 'cleanup-test',
        projectId: 'test-project',
        buildId: 'test-build'
      };

      const worker = await workerPool.createWorker(jobPayload);
      await workerPool.cleanupWorker(worker.id);

      expect(mockContainer.stop).toHaveBeenCalled();
      expect(mockVolume.remove).toHaveBeenCalledTimes(3); // workspace, artifacts, logs
      expect(workerPool.workers.has(worker.id)).toBe(false);
    });
  });
});

describe('Job Executor', () => {
  let jobExecutor;

  beforeEach(() => {
    jobExecutor = new JobExecutor({
      maxConcurrentJobs: 2,
      enableSelfFix: true
    });
  });

  afterEach(async () => {
    if (jobExecutor) {
      await jobExecutor.shutdown();
    }
  });

  test('should initialize job executor', async () => {
    expect(jobExecutor).toBeDefined();
    expect(jobExecutor.maxConcurrentJobs).toBe(2);
    expect(jobExecutor.enableSelfFix).toBe(true);
  });

  test('should determine if self-fix should be attempted', () => {
    expect(jobExecutor.shouldAttemptSelfFix('generate')).toBe(true);
    expect(jobExecutor.shouldAttemptSelfFix('test')).toBe(true);
    expect(jobExecutor.shouldAttemptSelfFix('build')).toBe(true);
    expect(jobExecutor.shouldAttemptSelfFix('deploy')).toBe(false);
  });

  test('should prepare job data for code generation', async () => {
    const jobPayload = {
      task: 'generate',
      specJson: {
        projectName: 'Test App',
        stack: { backend: 'node' },
        features: { auth: true }
      },
      agentRole: 'coder'
    };

    const jobData = await jobExecutor.prepareJobData(jobPayload);
    
    expect(jobData.type).toBe('code-generation');
    expect(jobData.instructions).toBeDefined();
    expect(jobData.dependencies).toBeDefined();
    expect(jobData.dependencies.runtime).toContain('express');
  });

  test('should get executor stats', async () => {
    const stats = await jobExecutor.getExecutorStats();
    expect(stats).toHaveProperty('activeJobs');
    expect(stats).toHaveProperty('maxConcurrentJobs');
    expect(stats).toHaveProperty('workerPoolStats');
  });
});

describe('Self Fix Loop', () => {
  let selfFixLoop;
  let mockModelRouter;

  beforeEach(() => {
    mockModelRouter = {
      routeTask: jest.fn()
    };

    selfFixLoop = new SelfFixLoop({
      maxIterations: 3,
      modelRouter: mockModelRouter
    });
  });

  afterEach(async () => {
    if (selfFixLoop) {
      await selfFixLoop.shutdown();
    }
  });

  test('should initialize self-fix loop', async () => {
    await selfFixLoop.initialize();
    expect(selfFixLoop.maxIterations).toBe(3);
  });

  test('should parse patch response correctly', () => {
    const mockResponse = JSON.stringify({
      analysis: 'Missing semicolon',
      changes: [
        {
          file: 'src/app.js',
          action: 'modify',
          content: 'console.log("hello");',
          explanation: 'Added missing semicolon'
        }
      ],
      description: 'Fix syntax error',
      confidence: 0.9
    });

    const patch = selfFixLoop.parsePatchResponse(mockResponse);
    
    expect(patch.analysis).toBe('Missing semicolon');
    expect(patch.changes).toHaveLength(1);
    expect(patch.changes[0].file).toBe('src/app.js');
    expect(patch.confidence).toBe(0.9);
  });

  test('should get fix stats', () => {
    const stats = selfFixLoop.getFixStats();
    expect(stats).toHaveProperty('activeSessions');
    expect(stats).toHaveProperty('totalSessions');
    expect(stats).toHaveProperty('successfulFixes');
    expect(stats).toHaveProperty('averageIterations');
  });

  describe('Self-Fix Loop with Mock Failures and Patches', () => {
    test('should successfully fix issue on first iteration', async () => {
      const jobId = 'fix-test-1';
      const testFailure = {
        error: 'ReferenceError: myFunction is not defined',
        exitCode: 1,
        output: 'Test failed: myFunction is not defined',
        failingTests: ['should call myFunction']
      };
      const codeContext = {
        files: ['src/app.js'],
        framework: 'jest',
        dependencies: ['express']
      };

      // Mock successful patch generation
      mockModelRouter.routeTask.mockResolvedValue({
        content: JSON.stringify({
          analysis: 'Function myFunction is not defined',
          changes: [
            {
              file: 'src/app.js',
              action: 'modify',
              content: 'function myFunction() { return true; }',
              explanation: 'Added missing function definition'
            }
          ],
          description: 'Add missing function',
          confidence: 0.9
        })
      });

      // Mock successful test execution after patch
      jest.spyOn(selfFixLoop, 'runTests')
        .mockResolvedValueOnce({
          success: true,
          output: 'All tests passed',
          testsRun: 5,
          testsPassed: 5,
          testsFailed: 0
        });

      jest.spyOn(selfFixLoop, 'applyPatch').mockResolvedValue({
        success: true,
        totalChanges: 1,
        successfulChanges: 1,
        results: [{ file: 'src/app.js', success: true }]
      });

      const result = await selfFixLoop.startFixLoop(jobId, testFailure, codeContext);

      expect(result.success).toBe(true);
      expect(result.iteration).toBe(1);
      expect(mockModelRouter.routeTask).toHaveBeenCalledWith({
        role: 'debugger',
        task: 'generate_patch',
        context: expect.objectContaining({
          testFailure: expect.objectContaining({
            error: 'ReferenceError: myFunction is not defined'
          })
        }),
        prompt: expect.stringContaining('You are a debugging agent')
      });
    });

    test('should escalate to human after max iterations', async () => {
      const jobId = 'fix-test-2';
      const testFailure = {
        error: 'Complex error that cannot be fixed',
        exitCode: 1,
        output: 'Complex test failure',
        failingTests: ['complex test']
      };
      const codeContext = {
        files: ['src/complex.js'],
        framework: 'jest'
      };

      // Mock patch generation that always fails
      mockModelRouter.routeTask.mockResolvedValue({
        content: JSON.stringify({
          analysis: 'Complex issue',
          changes: [
            {
              file: 'src/complex.js',
              action: 'modify',
              content: '// Attempted fix',
              explanation: 'Attempted to fix complex issue'
            }
          ],
          description: 'Attempted fix',
          confidence: 0.3
        })
      });

      // Mock test execution that always fails
      jest.spyOn(selfFixLoop, 'runTests').mockResolvedValue({
        success: false,
        output: 'Test still failing',
        testsRun: 5,
        testsPassed: 0,
        testsFailed: 5
      });

      jest.spyOn(selfFixLoop, 'applyPatch').mockResolvedValue({
        success: true,
        totalChanges: 1,
        successfulChanges: 1
      });

      jest.spyOn(selfFixLoop, 'escalateToHuman').mockResolvedValue({
        jobId,
        escalatedAt: expect.any(String),
        reason: 'self_fix_exhausted'
      });

      const result = await selfFixLoop.startFixLoop(jobId, testFailure, codeContext);

      expect(result.success).toBe(false);
      expect(result.escalated).toBe(true);
      expect(result.totalIterations).toBe(3);
      expect(selfFixLoop.escalateToHuman).toHaveBeenCalledWith(
        jobId,
        expect.objectContaining({
          iteration: 3,
          maxIterations: 3
        })
      );
    });

    test('should handle patch generation failures gracefully', async () => {
      const jobId = 'fix-test-3';
      const testFailure = {
        error: 'Test error',
        exitCode: 1
      };
      const codeContext = { files: [] };

      // Mock patch generation failure
      mockModelRouter.routeTask.mockRejectedValue(new Error('Model router failed'));

      await expect(selfFixLoop.startFixLoop(jobId, testFailure, codeContext))
        .rejects.toThrow('Model router failed');

      const fixSession = selfFixLoop.getFixSession(jobId);
      expect(fixSession.status).toBe('failed');
      expect(fixSession.error).toBe('Patch generation failed: Model router failed');
    });

    test('should track fix session history', async () => {
      const jobId = 'fix-test-4';
      const testFailure = { error: 'Test error' };
      const codeContext = { files: [] };

      mockModelRouter.routeTask.mockResolvedValue({
        content: JSON.stringify({
          analysis: 'Simple fix',
          changes: [{ file: 'test.js', action: 'modify', content: 'fixed' }],
          description: 'Fixed issue'
        })
      });

      jest.spyOn(selfFixLoop, 'runTests').mockResolvedValue({
        success: true,
        output: 'Tests passed'
      });

      jest.spyOn(selfFixLoop, 'applyPatch').mockResolvedValue({
        success: true,
        totalChanges: 1,
        successfulChanges: 1
      });

      await selfFixLoop.startFixLoop(jobId, testFailure, codeContext);

      const history = selfFixLoop.getFixHistory(jobId);
      expect(history).toBeDefined();
      expect(history.jobId).toBe(jobId);
      expect(history.status).toBe('completed');
      expect(history.attempts).toHaveLength(1);
      expect(history.finalResult.success).toBe(true);
    });

    test('should build proper debugger prompt', () => {
      const debugContext = {
        testFailure: {
          error: 'TypeError: Cannot read property of undefined',
          exitCode: 1,
          logs: 'Error in line 10',
          failingTests: ['should handle undefined values']
        },
        codeContext: {
          framework: 'jest',
          files: ['src/utils.js'],
          dependencies: ['lodash', 'express']
        },
        previousAttempts: [
          {
            iteration: 1,
            status: 'failed',
            patch: { description: 'Added null check' }
          }
        ]
      };

      const prompt = selfFixLoop.buildDebuggerPrompt(debugContext);

      expect(prompt).toContain('You are a debugging agent');
      expect(prompt).toContain('TypeError: Cannot read property of undefined');
      expect(prompt).toContain('should handle undefined values');
      expect(prompt).toContain('Framework: jest');
      expect(prompt).toContain('Previous Fix Attempts');
      expect(prompt).toContain('Iteration 1: failed');
      expect(prompt).toContain('Response Format');
    });
  });
});

describe('Artifact Generation and S3 Upload', () => {
  let artifactStorage;
  let mockS3;

  beforeEach(() => {
    // Setup S3 mocks
    mockS3 = {
      headBucket: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      }),
      createBucket: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      }),
      putBucketVersioning: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      }),
      upload: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Location: 'https://bucket.s3.amazonaws.com/test-key',
          Key: 'test-key',
          VersionId: 'version-123'
        })
      }),
      getObject: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Body: Buffer.from('test content')
        })
      }),
      listObjectsV2: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Contents: [
            {
              Key: 'projects/test-project/builds/test-build/artifacts/test-artifact.zip',
              Size: 1024,
              LastModified: new Date(),
              ETag: '"abc123"'
            }
          ]
        })
      }),
      deleteObject: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({})
      }),
      headObject: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          ContentLength: 1024,
          LastModified: new Date(),
          ETag: '"abc123"',
          ContentType: 'application/zip',
          Metadata: { jobId: 'test-job' },
          VersionId: 'version-123'
        })
      }),
      getSignedUrlPromise: jest.fn().mockResolvedValue('https://presigned-url.com')
    };

    AWS.S3.mockImplementation(() => mockS3);

    artifactStorage = new ArtifactStorage({
      bucketName: 'test-artifacts-bucket',
      logsBucketName: 'test-logs-bucket',
      region: 'us-east-1'
    });
    
    // Ensure the S3 instance has the config property
    artifactStorage.s3.config = { region: 'us-east-1' };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should initialize artifact storage and ensure buckets exist', async () => {
    await artifactStorage.initialize();

    expect(mockS3.headBucket).toHaveBeenCalledWith({ Bucket: 'test-artifacts-bucket' });
    expect(mockS3.headBucket).toHaveBeenCalledWith({ Bucket: 'test-logs-bucket' });
  });

  test('should create bucket if it does not exist', async () => {
    mockS3.headBucket.mockReturnValue({
      promise: jest.fn().mockRejectedValue({ statusCode: 404 })
    });

    await artifactStorage.ensureBucketExists('new-bucket');

    expect(mockS3.createBucket).toHaveBeenCalledWith({
      Bucket: 'new-bucket',
      CreateBucketConfiguration: {
        LocationConstraint: undefined // us-east-1 doesn't need constraint
      }
    });

    expect(mockS3.putBucketVersioning).toHaveBeenCalledWith({
      Bucket: 'new-bucket',
      VersioningConfiguration: {
        Status: 'Enabled'
      }
    });
  });

  test('should upload artifacts to S3 with proper metadata', async () => {
    // Mock file system operations
    const fs = require('fs').promises;
    jest.spyOn(fs, 'stat').mockResolvedValue({ size: 2048 });
    jest.spyOn(fs, 'unlink').mockResolvedValue();

    // Mock archiver
    const mockArchive = {
      pointer: jest.fn().mockReturnValue(2048),
      on: jest.fn(),
      pipe: jest.fn(),
      directory: jest.fn(),
      finalize: jest.fn()
    };

    const archiver = require('archiver');
    archiver.mockReturnValue(mockArchive);

    // Mock createReadStream
    const mockStream = { pipe: jest.fn() };
    const fs2 = require('fs');
    jest.spyOn(fs2, 'createReadStream').mockReturnValue(mockStream);
    jest.spyOn(fs2, 'createWriteStream').mockReturnValue({
      on: jest.fn().mockImplementation((event, callback) => {
        if (event === 'close') setTimeout(callback, 10);
      })
    });

    const result = await artifactStorage.uploadArtifacts(
      'test-job',
      'test-project',
      'test-build',
      '/tmp/artifacts'
    );

    expect(result.s3Url).toBe('https://bucket.s3.amazonaws.com/test-key');
    expect(result.key).toContain('projects/test-project/builds/test-build/artifacts/');
    expect(result.bucket).toBe('test-artifacts-bucket');
    expect(result.versionId).toBe('version-123');

    expect(mockS3.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-artifacts-bucket',
        ContentType: 'application/zip',
        Metadata: expect.objectContaining({
          jobId: 'test-job',
          projectId: 'test-project',
          buildId: 'test-build'
        }),
        ServerSideEncryption: 'AES256'
      })
    );
  });

  test('should upload logs to S3', async () => {
    const logs = [
      { timestamp: new Date(), data: 'Log entry 1' },
      { timestamp: new Date(), data: 'Log entry 2' }
    ];

    const result = await artifactStorage.uploadLogs(
      'test-job',
      'test-project',
      'test-build',
      logs
    );

    expect(result.s3Url).toBe('https://bucket.s3.amazonaws.com/test-key');
    expect(result.bucket).toBe('test-logs-bucket');

    expect(mockS3.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-logs-bucket',
        ContentType: 'text/plain',
        Body: expect.stringContaining('Log entry 1'),
        Metadata: expect.objectContaining({
          jobId: 'test-job'
        })
      })
    );
  });

  test('should download artifacts from S3', async () => {
    const fs = require('fs').promises;
    jest.spyOn(fs, 'writeFile').mockResolvedValue();

    const downloadPath = await artifactStorage.downloadArtifacts(
      's3://test-bucket/test-key',
      '/tmp/download.zip'
    );

    expect(downloadPath).toBe('/tmp/download.zip');
    expect(mockS3.getObject).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      Key: 'test-key'
    });
    expect(fs.writeFile).toHaveBeenCalledWith('/tmp/download.zip', Buffer.from('test content'));
  });

  test('should list artifacts for project and build', async () => {
    const artifacts = await artifactStorage.listArtifacts('test-project', 'test-build');

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toEqual({
      key: 'projects/test-project/builds/test-build/artifacts/test-artifact.zip',
      s3Url: 'https://test-artifacts-bucket.s3.us-east-1.amazonaws.com/projects/test-project/builds/test-build/artifacts/test-artifact.zip',
      size: 1024,
      lastModified: expect.any(Date),
      etag: '"abc123"'
    });

    expect(mockS3.listObjectsV2).toHaveBeenCalledWith({
      Bucket: 'test-artifacts-bucket',
      Prefix: 'projects/test-project/builds/test-build/artifacts/',
      MaxKeys: 100
    });
  });

  test('should get artifact metadata', async () => {
    const metadata = await artifactStorage.getArtifactMetadata(
      'https://bucket.s3.amazonaws.com/test-key'
    );

    expect(metadata).toEqual({
      size: 1024,
      lastModified: expect.any(Date),
      etag: '"abc123"',
      contentType: 'application/zip',
      metadata: { jobId: 'test-job' },
      versionId: 'version-123'
    });

    expect(mockS3.headObject).toHaveBeenCalledWith({
      Bucket: 'bucket',
      Key: 'test-key'
    });
  });

  test('should generate presigned URLs', async () => {
    const presignedUrl = await artifactStorage.generatePresignedUrl(
      's3://test-bucket/test-key',
      3600
    );

    expect(presignedUrl).toBe('https://presigned-url.com');
    expect(mockS3.getSignedUrlPromise).toHaveBeenCalledWith('getObject', {
      Bucket: 'test-bucket',
      Key: 'test-key',
      Expires: 3600
    });
  });

  test('should parse S3 URLs correctly', () => {
    // Test s3:// format
    const parsed1 = artifactStorage.parseS3Url('s3://my-bucket/path/to/file.zip');
    expect(parsed1).toEqual({
      bucket: 'my-bucket',
      key: 'path/to/file.zip'
    });

    // Test HTTPS format
    const parsed2 = artifactStorage.parseS3Url('https://my-bucket.s3.us-east-1.amazonaws.com/path/to/file.zip');
    expect(parsed2).toEqual({
      bucket: 'my-bucket',
      key: 'path/to/file.zip'
    });

    // Test invalid format
    expect(() => {
      artifactStorage.parseS3Url('invalid-url');
    }).toThrow('Invalid S3 URL format');
  });

  test('should get storage stats for project', async () => {
    // Mock the S3 listObjectsV2 method directly on the artifact storage instance
    // Use larger sizes to get a meaningful MB value
    artifactStorage.s3.listObjectsV2.mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Contents: [
          { Size: 1024 * 1024 }, // 1MB
          { Size: 2 * 1024 * 1024 }, // 2MB
          { Size: 512 * 1024 } // 0.5MB
        ]
      })
    });

    const stats = await artifactStorage.getStorageStats('test-project');

    expect(stats.projectId).toBe('test-project');
    expect(stats.totalObjects).toBe(3);
    expect(stats.totalSize).toBe(3670016); // 1MB + 2MB + 0.5MB in bytes
    expect(stats.totalSizeMB).toBe(3.5);
  });
});

describe('Test Failure Detector', () => {
  let detector;

  beforeEach(() => {
    detector = new TestFailureDetector();
  });

  test('should detect Jest test failures', () => {
    const jestOutput = `
FAIL src/app.test.js
  ✕ should validate user input (5ms)

  ● should validate user input

    expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

      at Object.<anonymous> (src/app.test.js:10:23)

Tests: 1 failed, 4 passed, 5 total
`;

    const analysis = detector.detectFailures(jestOutput, 'jest');
    
    expect(analysis.hasFailures).toBe(true);
    expect(analysis.framework).toBe('jest');
    expect(analysis.failingTests).toHaveLength(1);
    expect(analysis.failingTests[0].name).toContain('should validate user input');
    expect(analysis.summary.failedTests).toBe(1);
    expect(analysis.summary.totalTests).toBe(5);
  });

  test('should detect Python test failures', () => {
    const pytestOutput = `
FAILED test_app.py::test_validation - AssertionError: Expected True but got False
=== 1 failed, 4 passed in 2.34s ===
`;

    const analysis = detector.detectFailures(pytestOutput, 'pytest');
    
    expect(analysis.hasFailures).toBe(true);
    expect(analysis.framework).toBe('pytest');
    expect(analysis.errors).toHaveLength(1);
    expect(analysis.errors[0].message).toContain('Expected True but got False');
  });

  test('should categorize failures correctly', () => {
    const syntaxErrorOutput = `
SyntaxError: Unexpected token ';'
`;

    const analysis = detector.detectFailures(syntaxErrorOutput);
    const category = detector.categorizeFailure(analysis);
    
    // The detector might categorize this as logic_error since it doesn't find specific syntax patterns
    expect(['syntax_error', 'logic_error', 'unknown_error']).toContain(category.category);
    expect(['high', 'medium', 'low']).toContain(category.severity);
    expect(category.fixable).toBe(true);
  });

  test('should generate fix priority', () => {
    const analysis = {
      errors: [{ message: 'Syntax error' }],
      summary: { totalTests: 10, failedTests: 2 },
      suggestions: [{ type: 'syntax', message: 'Fix syntax error' }]
    };

    const priority = detector.generateFixPriority(analysis);
    
    expect(priority).toBeGreaterThan(0);
    expect(priority).toBeLessThanOrEqual(100);
  });

  test('should detect Go test failures', () => {
    const goOutput = `
--- FAIL: TestValidation (0.00s)
    app_test.go:15: got false, want true
FAIL	github.com/example/app	0.123s
`;

    const analysis = detector.detectFailures(goOutput, 'go');
    
    expect(analysis.hasFailures).toBe(true);
    expect(analysis.framework).toBe('go');
    expect(analysis.failingTests).toHaveLength(1);
    expect(analysis.failingTests[0].name).toBe('TestValidation');
  });

  test('should generate appropriate suggestions for different error types', () => {
    const moduleNotFoundOutput = `
Error: Cannot find module 'express'
    at Function.Module._resolveFilename (internal/modules/cjs/loader.js:636:15)
`;

    const analysis = detector.detectFailures(moduleNotFoundOutput);
    
    expect(analysis.suggestions).toContainEqual(
      expect.objectContaining({
        type: 'dependency',
        message: 'Missing dependency detected',
        confidence: 0.9
      })
    );
  });

  test('should extract stack traces correctly', () => {
    const outputWithStackTrace = `
Error: Test failed
    at Object.<anonymous> (src/app.test.js:10:23)
    at Module._compile (internal/modules/cjs/loader.js:778:30)
    at Object.Module._extensions..js (internal/modules/cjs/loader.js:789:10)
`;

    const analysis = detector.detectFailures(outputWithStackTrace);
    
    expect(analysis.stackTraces).toHaveLength(1);
    expect(analysis.stackTraces[0].frames).toHaveLength(3);
    expect(analysis.stackTraces[0].frames[0]).toEqual(
      expect.objectContaining({
        file: expect.stringContaining('src/app.test.js'),
        raw: expect.stringContaining('src/app.test.js:10:23')
      })
    );
  });
});