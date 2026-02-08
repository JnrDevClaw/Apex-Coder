const path = require('path');
const fs = require('fs').promises;
const PipelineOrchestrator = require('../../services/pipeline-orchestrator');

describe('handleRepoCreationStage', () => {
  let testDir;
  let codeDir;

  beforeEach(async () => {
    // Create test directory structure
    testDir = path.join(__dirname, '..', '..', '..', 'work', `test-${Date.now()}`);
    codeDir = path.join(testDir, 'code');
    await fs.mkdir(codeDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('creates GitHub repository and pushes files successfully', async () => {
    // Create test files
    await fs.writeFile(path.join(codeDir, 'index.js'), 'console.log("Hello");', 'utf8');
    await fs.writeFile(path.join(codeDir, 'package.json'), '{"name":"test"}', 'utf8');
    await fs.mkdir(path.join(codeDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(codeDir, 'src', 'app.js'), 'export default {};', 'utf8');

    // Mock dependencies
    const mockOctokit = {
      rest: {
        users: {
          getAuthenticated: jest.fn().mockResolvedValue({
            data: { login: 'test-user' }
          })
        },
        repos: {
          createForAuthenticatedUser: jest.fn().mockResolvedValue({
            data: {
              html_url: 'https://github.com/test-user/test-project',
              full_name: 'test-user/test-project',
              clone_url: 'https://github.com/test-user/test-project.git',
              ssh_url: 'git@github.com:test-user/test-project.git',
              owner: { login: 'test-user' },
              name: 'test-project'
            }
          })
        }
      }
    };

    const mockGithubClient = {
      getGitHubClient: jest.fn().mockResolvedValue(mockOctokit)
    };

    const mockUser = {
      id: 'user-123',
      githubToken: 'encrypted-token',
      githubUsername: 'test-user'
    };

    const mockUserModel = {
      findById: jest.fn().mockResolvedValue(mockUser)
    };

    const mockProject = {
      id: 'project-123',
      name: 'Test Project',
      description: 'Test project description',
      visibility: 'public',
      update: jest.fn().mockResolvedValue()
    };

    const mockProjectModel = {
      findById: jest.fn().mockResolvedValue(mockProject)
    };

    const mockBuildModel = {
      findById: jest.fn().mockResolvedValue({
        update: jest.fn(),
        updateStageStatus: jest.fn()
      })
    };

    const mockGithubRepoService = {
      pushGeneratedAppToGitHub: jest.fn().mockResolvedValue({
        repoUrl: 'https://github.com/test-user/test-project',
        commitSha: 'abc123def456',
        repoFullName: 'test-user/test-project'
      })
    };

    const mockEncryption = {
      decrypt: jest.fn().mockReturnValue('decrypted-github-token')
    };

    const mockWebsocket = {
      sendPhaseUpdate: jest.fn()
    };

    // Mock require calls
    jest.mock('./github-client', () => mockGithubClient, { virtual: true });
    jest.mock('../../workers/services/github-repo-service', () => mockGithubRepoService, { virtual: true });
    jest.mock('../models/user', () => mockUserModel, { virtual: true });
    jest.mock('./encryption', () => mockEncryption, { virtual: true });

    // Create orchestrator
    const orchestrator = new PipelineOrchestrator({
      projectModel: mockProjectModel,
      buildModel: mockBuildModel,
      websocket: mockWebsocket,
      workDir: path.join(__dirname, '..', '..', '..', 'work')
    });

    // Override require for this test
    const originalRequire = orchestrator.constructor.prototype.constructor.prototype.require;
    const Module = require('module');
    const originalModuleRequire = Module.prototype.require;
    
    Module.prototype.require = function (id) {
      if (id === './github-client') return mockGithubClient;
      if (id === '../../workers/services/github-repo-service') return mockGithubRepoService;
      if (id === '../models/user') return mockUserModel;
      if (id === './encryption') return mockEncryption;
      return originalModuleRequire.apply(this, arguments);
    };

    try {
      const context = {
        buildId: 'build-123',
        projectId: 'project-123',
        orgId: 'org-123',
        userId: 'user-123',
        projectDir: testDir,
        artifacts: {}
      };

      const stage = {
        name: 'repo-creation',
        handler: 'handleRepoCreationStage',
        timeout: 600000,
        retries: 2
      };

      // Execute stage
      const result = await orchestrator.handleRepoCreationStage(stage, context);

      // Verify result
      expect(result.success).toBe(true);
      expect(result.artifacts).toBeDefined();
      expect(result.artifacts.github_repo_url).toBe('https://github.com/test-user/test-project');
      expect(result.artifacts.github_repo_name).toBe('test-user/test-project');
      expect(result.artifacts.github_repo_owner).toBe('test-user');
      expect(result.artifacts.commit_sha).toBe('abc123def456');
      expect(result.artifacts.files_pushed).toBe(3);
      expect(result.artifacts.timestamp).toBeDefined();

      // Verify mocks were called
      expect(mockGithubClient.getGitHubClient).toHaveBeenCalledWith('user-123');
      expect(mockOctokit.rest.users.getAuthenticated).toHaveBeenCalled();
      expect(mockOctokit.rest.repos.createForAuthenticatedUser).toHaveBeenCalled();
      expect(mockGithubRepoService.pushGeneratedAppToGitHub).toHaveBeenCalled();
      expect(mockProject.update).toHaveBeenCalledWith(expect.objectContaining({
        githubRepoUrl: 'https://github.com/test-user/test-project',
        githubRepoName: 'test-user/test-project',
        lastCommitSha: 'abc123def456'
      }));
    } finally {
      Module.prototype.require = originalModuleRequire;
    }
  });

  test('handles missing GitHub token error', async () => {
    const mockGithubClient = {
      getGitHubClient: jest.fn().mockRejectedValue(
        new Error('GitHub token not found. Please connect your GitHub account.')
      )
    };

    const mockProjectModel = {
      findById: jest.fn().mockResolvedValue({
        name: 'Test Project',
        description: 'Test'
      })
    };

    const mockBuildModel = {
      findById: jest.fn().mockResolvedValue({
        update: jest.fn()
      })
    };

    const Module = require('module');
    const originalModuleRequire = Module.prototype.require;
    
    Module.prototype.require = function (id) {
      if (id === './github-client') return mockGithubClient;
      return originalModuleRequire.apply(this, arguments);
    };

    try {
      const orchestrator = new PipelineOrchestrator({
        projectModel: mockProjectModel,
        buildModel: mockBuildModel
      });

      const context = {
        buildId: 'build-789',
        projectId: 'project-789',
        orgId: 'org-123',
        userId: 'user-123',
        projectDir: testDir,
        artifacts: {}
      };

      const stage = {
        name: 'repo-creation',
        handler: 'handleRepoCreationStage'
      };

      await expect(orchestrator.handleRepoCreationStage(stage, context))
        .rejects
        .toThrow(/GitHub repository creation failed/);

    } finally {
      Module.prototype.require = originalModuleRequire;
    }
  });

  test('handles no generated files error', async () => {
    // Don't create any files in codeDir

    const mockOctokit = {
      rest: {
        users: {
          getAuthenticated: jest.fn().mockResolvedValue({
            data: { login: 'test-user' }
          })
        },
        repos: {
          createForAuthenticatedUser: jest.fn().mockResolvedValue({
            data: {
              html_url: 'https://github.com/test-user/empty-project',
              full_name: 'test-user/empty-project',
              owner: { login: 'test-user' },
              name: 'empty-project'
            }
          })
        }
      }
    };

    const mockGithubClient = {
      getGitHubClient: jest.fn().mockResolvedValue(mockOctokit)
    };

    const mockProject = {
      name: 'Empty Project',
      update: jest.fn()
    };

    const mockProjectModel = {
      findById: jest.fn().mockResolvedValue(mockProject)
    };

    const mockBuildModel = {
      findById: jest.fn().mockResolvedValue({
        update: jest.fn()
      })
    };

    const Module = require('module');
    const originalModuleRequire = Module.prototype.require;
    
    Module.prototype.require = function (id) {
      if (id === './github-client') return mockGithubClient;
      return originalModuleRequire.apply(this, arguments);
    };

    try {
      const orchestrator = new PipelineOrchestrator({
        projectModel: mockProjectModel,
        buildModel: mockBuildModel,
        workDir: path.join(__dirname, '..', '..', '..', 'work')
      });

      const context = {
        buildId: 'build-empty',
        projectId: 'project-empty',
        orgId: 'org-123',
        userId: 'user-123',
        projectDir: testDir,
        artifacts: {}
      };

      const stage = {
        name: 'repo-creation',
        handler: 'handleRepoCreationStage'
      };

      await expect(orchestrator.handleRepoCreationStage(stage, context))
        .rejects
        .toThrow(/No generated files found/);

    } finally {
      Module.prototype.require = originalModuleRequire;
    }
  });

  test('getAllFilesRecursive excludes hidden files and node_modules', async () => {
    // Create various files and directories
    await fs.writeFile(path.join(codeDir, 'index.js'), 'test', 'utf8');
    await fs.writeFile(path.join(codeDir, '.env'), 'secret', 'utf8');
    
    await fs.mkdir(path.join(codeDir, 'node_modules'), { recursive: true });
    await fs.writeFile(path.join(codeDir, 'node_modules', 'package.js'), 'test', 'utf8');
    
    await fs.mkdir(path.join(codeDir, '.github'), { recursive: true });
    await fs.writeFile(path.join(codeDir, '.github', 'workflow.yml'), 'test', 'utf8');
    
    await fs.mkdir(path.join(codeDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(codeDir, 'src', 'app.js'), 'test', 'utf8');

    const orchestrator = new PipelineOrchestrator({
      workDir: path.join(__dirname, '..', '..', '..', 'work')
    });

    const files = await orchestrator.getAllFilesRecursive(codeDir);

    // Should include index.js, .github/workflow.yml, and src/app.js
    // Should exclude .env and node_modules/package.js
    expect(files).toHaveLength(3);
    expect(files.some(f => f.endsWith('index.js'))).toBe(true);
    expect(files.some(f => f.includes('.github'))).toBe(true);
    expect(files.some(f => f.endsWith('app.js'))).toBe(true);
    expect(files.some(f => f.endsWith('.env'))).toBe(false);
    expect(files.some(f => f.includes('node_modules'))).toBe(false);
  });
});
