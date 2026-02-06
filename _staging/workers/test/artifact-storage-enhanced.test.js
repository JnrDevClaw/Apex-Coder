const ArtifactStorage = require('../services/artifact-storage');

// Mock AWS SDK
jest.mock('aws-sdk', () => {
  const mockS3 = {
    headBucket: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({})
    }),
    putObject: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        ETag: '"mock-etag"',
        VersionId: 'v1'
      })
    }),
    upload: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Location: 'https://bucket.s3.region.amazonaws.com/key',
        ETag: '"mock-etag"',
        VersionId: 'v1'
      })
    }),
    getObject: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Body: Buffer.from(JSON.stringify({ test: 'data' })),
        Metadata: { projectId: 'test-project' },
        ContentType: 'application/json',
        LastModified: new Date(),
        VersionId: 'v1'
      })
    }),
    listObjectsV2: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Contents: [
          {
            Key: 'projects/test-project/specs/specs.json',
            Size: 1024,
            LastModified: new Date()
          }
        ]
      })
    }),
    headObject: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        ContentLength: 1024,
        LastModified: new Date()
      })
    })
  };

  return {
    S3: jest.fn(() => ({
      ...mockS3,
      config: { region: 'us-east-1' }
    }))
  };
});

describe('ArtifactStorage - Enhanced Features', () => {
  let storage;

  beforeEach(() => {
    storage = new ArtifactStorage({
      bucketName: 'test-bucket',
      region: 'us-east-1'
    });
    jest.clearAllMocks();
  });

  describe('Canonical Directory Structure', () => {
    test('should have correct subdirectory constants', () => {
      expect(storage.subdirectories).toEqual({
        SPECS: 'specs',
        DOCS: 'docs',
        CODE: 'code'
      });
    });

    test('should create project directory structure', async () => {
      const result = await storage.createProjectDirectoryStructure('test-project');

      expect(result).toHaveProperty('projectId', 'test-project');
      expect(result).toHaveProperty('basePrefix', 'projects/test-project/');
      expect(result.subdirectories).toHaveLength(3);
      expect(result.subdirectories).toContain('projects/test-project/specs/');
      expect(result.subdirectories).toContain('projects/test-project/docs/');
      expect(result.subdirectories).toContain('projects/test-project/code/');
    });
  });

  describe('Stage Artifact Storage', () => {
    test('should store JSON artifact in specs subdirectory', async () => {
      const content = { test: 'data' };
      const result = await storage.storeStageArtifact(
        'test-project',
        'specs',
        'specs.json',
        content
      );

      expect(result).toHaveProperty('key', 'projects/test-project/specs/specs.json');
      expect(result).toHaveProperty('subdirectory', 'specs');
      expect(result).toHaveProperty('filename', 'specs.json');
    });

    test('should store markdown artifact in docs subdirectory', async () => {
      const content = '# Documentation';
      const result = await storage.storeStageArtifact(
        'test-project',
        'docs',
        'docs.md',
        content
      );

      expect(result).toHaveProperty('key', 'projects/test-project/docs/docs.md');
      expect(result).toHaveProperty('subdirectory', 'docs');
      expect(result).toHaveProperty('filename', 'docs.md');
    });

    test('should reject invalid subdirectory', async () => {
      await expect(
        storage.storeStageArtifact('test-project', 'invalid', 'test.json', {})
      ).rejects.toThrow('Invalid subdirectory');
    });

    test('should store multiple stage artifacts', async () => {
      const artifacts = {
        'specs.json': { test: 'data' },
        'schema.json': { schema: 'data' }
      };

      const results = await storage.storeStageArtifacts('test-project', 1, artifacts);

      expect(results).toHaveLength(2);
      expect(results[0]).toHaveProperty('filename', 'specs.json');
      expect(results[1]).toHaveProperty('filename', 'schema.json');
    });
  });

  describe('Stage Artifact Retrieval', () => {
    test('should retrieve artifact from subdirectory', async () => {
      const result = await storage.retrieveStageArtifact(
        'test-project',
        'specs',
        'specs.json'
      );

      expect(result).toHaveProperty('content');
      expect(result.content).toEqual({ test: 'data' });
    });

    test('should retrieve multiple artifacts', async () => {
      const artifacts = await storage.retrieveStageArtifacts('test-project', [
        'specs.json',
        'schema.json'
      ]);

      expect(artifacts['specs.json']).toBeDefined();
      expect(artifacts['schema.json']).toBeDefined();
    });

    test('should return null for non-existent artifact', async () => {
      storage.s3.getObject = jest.fn().mockReturnValue({
        promise: jest.fn().mockRejectedValue({ code: 'NoSuchKey' })
      });

      const result = await storage.retrieveStageArtifact(
        'test-project',
        'specs',
        'nonexistent.json'
      );

      expect(result).toBeNull();
    });
  });

  describe('Artifact Persistence on Failure', () => {
    test('should persist artifacts with error metadata', async () => {
      const artifacts = {
        'specs.json': { test: 'data' },
        'docs.md': '# Documentation'
      };

      const errorInfo = {
        message: 'Stage failed',
        code: 'STAGE_ERROR'
      };

      const result = await storage.persistArtifactsOnFailure(
        'test-project',
        2,
        artifacts,
        errorInfo
      );

      expect(result).toHaveProperty('artifactsPersisted');
      expect(result).toHaveProperty('errorLog');
      expect(result.artifactsPersisted).toHaveLength(2);
    });
  });

  describe('Code File Management', () => {
    test('should store code file with proper path', async () => {
      const content = 'console.log("test");';
      const result = await storage.storeCodeFile(
        'test-project',
        'src/index.js',
        content
      );

      expect(result).toHaveProperty('key', 'projects/test-project/code/src/index.js');
      expect(result).toHaveProperty('filePath', 'src/index.js');
    });

    test('should retrieve code file', async () => {
      storage.s3.getObject = jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue({
          Body: Buffer.from('console.log("test");'),
          Metadata: {},
          ContentType: 'application/javascript',
          LastModified: new Date()
        })
      });

      const result = await storage.retrieveCodeFile('test-project', 'src/index.js');

      expect(result).toHaveProperty('content', 'console.log("test");');
    });

    test('should list code files', async () => {
      const files = await storage.listCodeFiles('test-project');

      expect(Array.isArray(files)).toBe(true);
    });
  });

  describe('Subdirectory Listing', () => {
    test('should list artifacts in subdirectory', async () => {
      const artifacts = await storage.listSubdirectoryArtifacts(
        'test-project',
        'specs'
      );

      expect(Array.isArray(artifacts)).toBe(true);
      expect(artifacts[0]).toHaveProperty('filename');
      expect(artifacts[0]).toHaveProperty('key');
    });
  });

  describe('Artifact Existence Check', () => {
    test('should return true for existing artifact', async () => {
      const exists = await storage.artifactExists(
        'test-project',
        'specs',
        'specs.json'
      );

      expect(exists).toBe(true);
    });

    test('should return false for non-existent artifact', async () => {
      storage.s3.headObject = jest.fn().mockReturnValue({
        promise: jest.fn().mockRejectedValue({ code: 'NotFound', statusCode: 404 })
      });

      const exists = await storage.artifactExists(
        'test-project',
        'specs',
        'nonexistent.json'
      );

      expect(exists).toBe(false);
    });
  });
});
