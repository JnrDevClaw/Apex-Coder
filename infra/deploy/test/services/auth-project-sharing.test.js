const authService = require('../../services/auth');
const { User, Organization, Project } = require('../../models');

// Mock the models
jest.mock('../../models', () => ({
  User: {
    findByEmail: jest.fn(),
    findById: jest.fn()
  },
  Organization: {
    findById: jest.fn()
  },
  Project: {
    findById: jest.fn(),
    findByOrganization: jest.fn()
  }
}));

describe('AuthService Project Sharing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkProjectAccess', () => {
    test('should return true for project owner', async () => {
      const mockProject = {
        owner: 'user123',
        visibility: 'private',
        hasAccess: jest.fn().mockReturnValue(true)
      };
      
      Project.findById.mockResolvedValue(mockProject);
      User.findById.mockResolvedValue({
        userId: 'user123',
        organizations: [{ orgId: 'org123', role: 'admin' }]
      });
      
      const hasAccess = await authService.checkProjectAccess('user123', 'org123', 'project456');
      expect(hasAccess).toBe(true);
      expect(mockProject.hasAccess).toHaveBeenCalledWith('user123', null);
    });

    test('should return false for non-existent project', async () => {
      Project.findById.mockResolvedValue(null);
      
      const hasAccess = await authService.checkProjectAccess('user123', 'org123', 'project456');
      expect(hasAccess).toBe(false);
    });

    test('should check project-specific access for organization members', async () => {
      const mockProject = {
        owner: 'user456',
        visibility: 'private',
        hasAccess: jest.fn().mockReturnValue(true)
      };
      
      Project.findById.mockResolvedValue(mockProject);
      User.findById.mockResolvedValue({
        userId: 'user123',
        organizations: [{ orgId: 'org123', role: 'dev' }]
      });
      
      const hasAccess = await authService.checkProjectAccess('user123', 'org123', 'project456', 'viewer');
      expect(hasAccess).toBe(true);
      expect(mockProject.hasAccess).toHaveBeenCalledWith('user123', 'viewer');
    });
  });

  describe('shareProject', () => {
    test('should share project with user by email', async () => {
      const mockProject = {
        owner: 'user123',
        projectId: 'project456',
        shareWith: jest.fn().mockResolvedValue(true)
      };
      const mockMember = {
        userId: 'user789',
        email: 'member@example.com',
        firstName: 'John',
        lastName: 'Doe'
      };
      
      Project.findById.mockResolvedValue(mockProject);
      User.findByEmail.mockResolvedValue(mockMember);
      User.findById.mockResolvedValue({
        userId: 'user123',
        organizations: [{ orgId: 'org123', role: 'admin' }]
      });
      
      const result = await authService.shareProject(
        'user123', 
        'org123', 
        'project456', 
        'member@example.com', 
        'dev'
      );
      
      expect(result.user.userId).toBe('user789');
      expect(result.role).toBe('dev');
      expect(result.projectId).toBe('project456');
      expect(mockProject.shareWith).toHaveBeenCalledWith('user789', 'dev');
    });

    test('should throw error if project not found', async () => {
      Project.findById.mockResolvedValue(null);
      
      await expect(authService.shareProject(
        'user123', 
        'org123', 
        'project456', 
        'member@example.com'
      )).rejects.toThrow('Project not found');
    });

    test('should throw error if user not found', async () => {
      const mockProject = { owner: 'user123' };
      
      Project.findById.mockResolvedValue(mockProject);
      User.findByEmail.mockResolvedValue(null);
      User.findById.mockResolvedValue({
        userId: 'user123',
        organizations: [{ orgId: 'org123', role: 'admin' }]
      });
      
      await expect(authService.shareProject(
        'user123', 
        'org123', 
        'project456', 
        'nonexistent@example.com'
      )).rejects.toThrow('User not found');
    });

    test('should throw error if insufficient permissions', async () => {
      const mockProject = { owner: 'user456' };
      
      Project.findById.mockResolvedValue(mockProject);
      User.findById.mockResolvedValue({
        userId: 'user123',
        organizations: [{ orgId: 'org123', role: 'viewer' }]
      });
      
      await expect(authService.shareProject(
        'user123', 
        'org123', 
        'project456', 
        'member@example.com'
      )).rejects.toThrow('Insufficient permissions to share project');
    });
  });

  describe('unshareProject', () => {
    test('should unshare project from user', async () => {
      const mockProject = {
        owner: 'user123',
        unshareFrom: jest.fn().mockResolvedValue(true)
      };
      
      Project.findById.mockResolvedValue(mockProject);
      User.findById.mockResolvedValue({
        userId: 'user123',
        organizations: [{ orgId: 'org123', role: 'admin' }]
      });
      
      const result = await authService.unshareProject(
        'user123', 
        'org123', 
        'project456', 
        'user789'
      );
      
      expect(result.success).toBe(true);
      expect(mockProject.unshareFrom).toHaveBeenCalledWith('user789');
    });

    test('should throw error when trying to unshare from owner', async () => {
      const mockProject = { owner: 'user123' };
      
      Project.findById.mockResolvedValue(mockProject);
      User.findById.mockResolvedValue({
        userId: 'user123',
        organizations: [{ orgId: 'org123', role: 'admin' }]
      });
      
      await expect(authService.unshareProject(
        'user123', 
        'org123', 
        'project456', 
        'user123'
      )).rejects.toThrow('Cannot unshare project from owner');
    });
  });

  describe('getUserProjects', () => {
    test('should return accessible projects across organizations', async () => {
      const mockUser = {
        userId: 'user123',
        organizations: [
          { orgId: 'org123', role: 'admin' },
          { orgId: 'org456', role: 'dev' }
        ]
      };
      
      const mockProjects = [
        {
          projectId: 'project1',
          name: 'Project 1',
          updatedAt: '2024-01-02T00:00:00Z',
          hasAccess: jest.fn().mockReturnValue(true),
          visibility: 'private'
        },
        {
          projectId: 'project2',
          name: 'Project 2',
          updatedAt: '2024-01-01T00:00:00Z',
          hasAccess: jest.fn().mockReturnValue(false),
          visibility: 'organization'
        }
      ];
      
      User.findById.mockResolvedValue(mockUser);
      Project.findByOrganization
        .mockResolvedValueOnce([mockProjects[0]])
        .mockResolvedValueOnce([mockProjects[1]]);
      
      const projects = await authService.getUserProjects('user123');
      
      expect(projects).toHaveLength(2);
      expect(projects[0].projectId).toBe('project1'); // Most recent first
      expect(projects[1].projectId).toBe('project2');
    });

    test('should throw error if user not found', async () => {
      User.findById.mockResolvedValue(null);
      
      await expect(authService.getUserProjects('user123'))
        .rejects.toThrow('User not found');
    });
  });

  describe('account management', () => {
    test('should deactivate user account', async () => {
      const mockUser = {
        userId: 'user123',
        update: jest.fn().mockResolvedValue(true)
      };
      
      User.findById.mockResolvedValue(mockUser);
      
      const result = await authService.deactivateAccount('user123');
      
      expect(result.success).toBe(true);
      expect(mockUser.update).toHaveBeenCalledWith({ isActive: false });
    });

    test('should verify user email', async () => {
      const mockUser = {
        userId: 'user123',
        update: jest.fn().mockResolvedValue(true)
      };
      
      User.findById.mockResolvedValue(mockUser);
      
      const result = await authService.verifyEmail('user123');
      
      expect(result.success).toBe(true);
      expect(mockUser.update).toHaveBeenCalledWith({ emailVerified: true });
    });
  });
});