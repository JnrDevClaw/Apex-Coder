const authService = require('../services/auth');
const { User, Organization, Project } = require('../models');

// Mock the models
jest.mock('../models', () => ({
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

describe('Authentication and Authorization Security Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('JWT Token Security', () => {
    test('should generate unique tokens for different users', () => {
      const user1Payload = {
        userId: 'user123',
        email: 'user1@example.com',
        organizations: [{ orgId: 'org123', role: 'admin' }]
      };
      
      const user2Payload = {
        userId: 'user456',
        email: 'user2@example.com',
        organizations: [{ orgId: 'org456', role: 'dev' }]
      };
      
      const token1 = authService.generateToken(user1Payload);
      const token2 = authService.generateToken(user2Payload);
      
      expect(token1).toBeDefined();
      expect(token2).toBeDefined();
      expect(token1).not.toBe(token2);
      
      const decoded1 = authService.verifyToken(token1);
      const decoded2 = authService.verifyToken(token2);
      
      expect(decoded1.userId).toBe('user123');
      expect(decoded2.userId).toBe('user456');
      expect(decoded1.email).toBe('user1@example.com');
      expect(decoded2.email).toBe('user2@example.com');
    });

    test('should include organization data in token payload', () => {
      const payload = {
        userId: 'user123',
        email: 'test@example.com',
        organizations: [
          { orgId: 'org123', role: 'admin' },
          { orgId: 'org456', role: 'dev' }
        ]
      };
      
      const token = authService.generateToken(payload);
      const decoded = authService.verifyToken(token);
      
      expect(decoded.organizations).toHaveLength(2);
      expect(decoded.organizations[0].orgId).toBe('org123');
      expect(decoded.organizations[0].role).toBe('admin');
      expect(decoded.organizations[1].orgId).toBe('org456');
      expect(decoded.organizations[1].role).toBe('dev');
    });

    test('should reject tampered tokens', () => {
      const payload = {
        userId: 'user123',
        email: 'test@example.com',
        organizations: []
      };
      
      const token = authService.generateToken(payload);
      const tamperedToken = token.slice(0, -5) + 'XXXXX';
      
      expect(() => {
        authService.verifyToken(tamperedToken);
      }).toThrow('Invalid or expired token');
    });

    test('should reject tokens with invalid format', () => {
      const invalidTokens = [
        'invalid-token',
        'header.payload',
        'header.payload.signature.extra',
        '',
        null,
        undefined
      ];
      
      invalidTokens.forEach(token => {
        expect(() => {
          authService.verifyToken(token);
        }).toThrow('Invalid or expired token');
      });
    });

    test('should handle token expiration gracefully', () => {
      // Mock jwt.verify to throw expiration error
      const jwt = require('jsonwebtoken');
      const originalVerify = jwt.verify;
      
      jwt.verify = jest.fn().mockImplementation(() => {
        const error = new Error('jwt expired');
        error.name = 'TokenExpiredError';
        throw error;
      });
      
      expect(() => {
        authService.verifyToken('expired-token');
      }).toThrow('Invalid or expired token');
      
      // Restore original function
      jwt.verify = originalVerify;
    });
  });

  describe('Role-Based Access Control', () => {
    test('should enforce role hierarchy correctly', async () => {
      const mockUser = {
        userId: 'user123',
        organizations: [
          { orgId: 'org123', role: 'dev' }
        ]
      };
      
      User.findById.mockResolvedValue(mockUser);
      
      // Dev should have viewer access
      const hasViewerAccess = await authService.checkOrganizationAccess('user123', 'org123', 'viewer');
      expect(hasViewerAccess).toBe(true);
      
      // Dev should have dev access
      const hasDevAccess = await authService.checkOrganizationAccess('user123', 'org123', 'dev');
      expect(hasDevAccess).toBe(true);
      
      // Dev should NOT have admin access
      const hasAdminAccess = await authService.checkOrganizationAccess('user123', 'org123', 'admin');
      expect(hasAdminAccess).toBe(false);
    });

    test('should validate admin role permissions', async () => {
      const mockUser = {
        userId: 'user123',
        organizations: [
          { orgId: 'org123', role: 'admin' }
        ]
      };
      
      User.findById.mockResolvedValue(mockUser);
      
      // Admin should have all levels of access
      const hasViewerAccess = await authService.checkOrganizationAccess('user123', 'org123', 'viewer');
      const hasDevAccess = await authService.checkOrganizationAccess('user123', 'org123', 'dev');
      const hasAdminAccess = await authService.checkOrganizationAccess('user123', 'org123', 'admin');
      
      expect(hasViewerAccess).toBe(true);
      expect(hasDevAccess).toBe(true);
      expect(hasAdminAccess).toBe(true);
    });

    test('should validate viewer role limitations', async () => {
      const mockUser = {
        userId: 'user123',
        organizations: [
          { orgId: 'org123', role: 'viewer' }
        ]
      };
      
      User.findById.mockResolvedValue(mockUser);
      
      // Viewer should only have viewer access
      const hasViewerAccess = await authService.checkOrganizationAccess('user123', 'org123', 'viewer');
      const hasDevAccess = await authService.checkOrganizationAccess('user123', 'org123', 'dev');
      const hasAdminAccess = await authService.checkOrganizationAccess('user123', 'org123', 'admin');
      
      expect(hasViewerAccess).toBe(true);
      expect(hasDevAccess).toBe(false);
      expect(hasAdminAccess).toBe(false);
    });

    test('should handle invalid roles gracefully', async () => {
      const mockUser = {
        userId: 'user123',
        organizations: [
          { orgId: 'org123', role: 'invalid-role' }
        ]
      };
      
      User.findById.mockResolvedValue(mockUser);
      
      // Invalid role should be treated as no access
      const hasViewerAccess = await authService.checkOrganizationAccess('user123', 'org123', 'viewer');
      const hasDevAccess = await authService.checkOrganizationAccess('user123', 'org123', 'dev');
      const hasAdminAccess = await authService.checkOrganizationAccess('user123', 'org123', 'admin');
      
      expect(hasViewerAccess).toBe(false);
      expect(hasDevAccess).toBe(false);
      expect(hasAdminAccess).toBe(false);
    });

    test('should deny access to users not in organization', async () => {
      const mockUser = {
        userId: 'user123',
        organizations: [
          { orgId: 'org456', role: 'admin' } // Different organization
        ]
      };
      
      User.findById.mockResolvedValue(mockUser);
      
      const hasAccess = await authService.checkOrganizationAccess('user123', 'org123', 'viewer');
      expect(hasAccess).toBe(false);
    });

    test('should handle multiple organization memberships', async () => {
      const mockUser = {
        userId: 'user123',
        organizations: [
          { orgId: 'org123', role: 'viewer' },
          { orgId: 'org456', role: 'admin' },
          { orgId: 'org789', role: 'dev' }
        ]
      };
      
      User.findById.mockResolvedValue(mockUser);
      
      // Check access to different organizations
      const hasOrg123ViewerAccess = await authService.checkOrganizationAccess('user123', 'org123', 'viewer');
      const hasOrg123AdminAccess = await authService.checkOrganizationAccess('user123', 'org123', 'admin');
      const hasOrg456AdminAccess = await authService.checkOrganizationAccess('user123', 'org456', 'admin');
      const hasOrg789DevAccess = await authService.checkOrganizationAccess('user123', 'org789', 'dev');
      
      expect(hasOrg123ViewerAccess).toBe(true);
      expect(hasOrg123AdminAccess).toBe(false);
      expect(hasOrg456AdminAccess).toBe(true);
      expect(hasOrg789DevAccess).toBe(true);
    });
  });

  describe('Organization Data Isolation', () => {
    test('should isolate project access between organizations', async () => {
      const mockUser = {
        userId: 'user123',
        organizations: [
          { orgId: 'org123', role: 'admin' }
        ]
      };
      
      const mockProject = {
        projectId: 'project456',
        owner: 'user456',
        visibility: 'private',
        hasAccess: jest.fn().mockReturnValue(false)
      };
      
      User.findById.mockResolvedValue(mockUser);
      Project.findById.mockResolvedValue(mockProject);
      
      // User should not have access to project in different organization
      const hasAccess = await authService.checkProjectAccess('user123', 'org456', 'project456');
      expect(hasAccess).toBe(false);
    });

    test('should allow access to organization projects for members', async () => {
      const mockUser = {
        userId: 'user123',
        organizations: [
          { orgId: 'org123', role: 'dev' }
        ]
      };
      
      const mockProject = {
        projectId: 'project456',
        owner: 'user456',
        visibility: 'organization',
        hasAccess: jest.fn().mockReturnValue(true)
      };
      
      User.findById.mockResolvedValue(mockUser);
      Project.findById.mockResolvedValue(mockProject);
      
      // User should have access to organization project
      const hasAccess = await authService.checkProjectAccess('user123', 'org123', 'project456');
      expect(hasAccess).toBe(true);
    });

    test('should prevent cross-organization data leakage in getUserProjects', async () => {
      const mockUser = {
        userId: 'user123',
        organizations: [
          { orgId: 'org123', role: 'dev' },
          { orgId: 'org456', role: 'viewer' }
        ]
      };
      
      const org123Projects = [
        {
          projectId: 'project123',
          name: 'Org 123 Project',
          updatedAt: '2024-01-02T00:00:00Z',
          hasAccess: jest.fn().mockReturnValue(true),
          visibility: 'organization'
        }
      ];
      
      const org456Projects = [
        {
          projectId: 'project456',
          name: 'Org 456 Project',
          updatedAt: '2024-01-01T00:00:00Z',
          hasAccess: jest.fn().mockReturnValue(true),
          visibility: 'organization'
        }
      ];
      
      User.findById.mockResolvedValue(mockUser);
      Project.findByOrganization
        .mockResolvedValueOnce(org123Projects)
        .mockResolvedValueOnce(org456Projects);
      
      const projects = await authService.getUserProjects('user123');
      
      expect(projects).toHaveLength(2);
      expect(projects.find(p => p.projectId === 'project123')).toBeDefined();
      expect(projects.find(p => p.projectId === 'project456')).toBeDefined();
      
      // Verify that projects are fetched per organization
      expect(Project.findByOrganization).toHaveBeenCalledWith('org123', 50);
      expect(Project.findByOrganization).toHaveBeenCalledWith('org456', 50);
    });

    test('should enforce project sharing permissions within organization boundaries', async () => {
      const mockUser = {
        userId: 'user123',
        organizations: [
          { orgId: 'org123', role: 'admin' }
        ]
      };
      
      const mockProject = {
        projectId: 'project456',
        owner: 'user123',
        shareWith: jest.fn().mockResolvedValue(true)
      };
      
      const mockMember = {
        userId: 'user789',
        email: 'member@example.com',
        firstName: 'John',
        lastName: 'Doe'
      };
      
      User.findById.mockResolvedValue(mockUser);
      User.findByEmail.mockResolvedValue(mockMember);
      Project.findById.mockResolvedValue(mockProject);
      
      // Should allow sharing within same organization
      const result = await authService.shareProject(
        'user123',
        'org123',
        'project456',
        'member@example.com',
        'dev'
      );
      
      expect(result.user.userId).toBe('user789');
      expect(result.projectId).toBe('project456');
      expect(mockProject.shareWith).toHaveBeenCalledWith('user789', 'dev');
    });

    test('should prevent unauthorized project sharing across organizations', async () => {
      const mockUser = {
        userId: 'user123',
        organizations: [
          { orgId: 'org456', role: 'viewer' } // Different org, insufficient role
        ]
      };
      
      const mockProject = {
        projectId: 'project456',
        owner: 'user456' // Different owner
      };
      
      User.findById.mockResolvedValue(mockUser);
      Project.findById.mockResolvedValue(mockProject);
      
      // Should throw error for insufficient permissions
      await expect(authService.shareProject(
        'user123',
        'org123',
        'project456',
        'member@example.com',
        'dev'
      )).rejects.toThrow('Insufficient permissions to share project');
    });

    test('should isolate organization member management', async () => {
      const mockOrganization = {
        orgId: 'org123',
        owner: 'user456',
        hasAdminAccess: jest.fn().mockReturnValue(false)
      };
      
      Organization.findById.mockResolvedValue(mockOrganization);
      
      // User without admin access should not be able to add members
      await expect(authService.addOrganizationMember(
        'user123',
        'org123',
        'newmember@example.com',
        'dev'
      )).rejects.toThrow('Insufficient permissions');
      
      expect(mockOrganization.hasAdminAccess).toHaveBeenCalledWith('user123');
    });

    test('should validate organization ownership for sensitive operations', async () => {
      const mockOrganization = {
        orgId: 'org123',
        owner: 'user456',
        members: [
          { userId: 'user123', role: 'admin' },
          { userId: 'user789', role: 'dev' }
        ],
        hasAdminAccess: jest.fn().mockReturnValue(true),
        removeMember: jest.fn().mockResolvedValue(true),
        update: jest.fn().mockResolvedValue(true)
      };
      
      const mockMember = {
        userId: 'user789',
        removeOrganization: jest.fn(),
        update: jest.fn().mockResolvedValue(true)
      };
      
      Organization.findById.mockResolvedValue(mockOrganization);
      User.findById.mockResolvedValue(mockMember);
      
      // Should prevent removing organization owner
      await expect(authService.removeOrganizationMember(
        'user123',
        'org123',
        'user456' // Owner
      )).rejects.toThrow('Cannot remove organization owner');
      
      // Should allow removing regular member
      const result = await authService.removeOrganizationMember(
        'user123',
        'org123',
        'user789'
      );
      
      expect(result.success).toBe(true);
      expect(mockOrganization.removeMember).toHaveBeenCalledWith('user789');
    });
  });

  describe('Security Edge Cases', () => {
    test('should handle non-existent users gracefully', async () => {
      User.findById.mockResolvedValue(null);
      
      const hasAccess = await authService.checkOrganizationAccess('nonexistent', 'org123');
      expect(hasAccess).toBe(false);
    });

    test('should handle malformed organization data', async () => {
      const mockUser = {
        userId: 'user123',
        organizations: null // Malformed data
      };
      
      User.findById.mockResolvedValue(mockUser);
      
      // The service should handle null organizations gracefully and return false
      const hasAccess = await authService.checkOrganizationAccess('user123', 'org123');
      expect(hasAccess).toBe(false);
    });

    test('should sanitize user data properly', () => {
      const userWithSensitiveData = {
        userId: 'user123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        passwordHash: 'sensitive-hash-data',
        organizations: []
      };
      
      const sanitized = authService.sanitizeUser(userWithSensitiveData);
      
      expect(sanitized.userId).toBe('user123');
      expect(sanitized.email).toBe('test@example.com');
      expect(sanitized.firstName).toBe('John');
      expect(sanitized.lastName).toBe('Doe');
      expect(sanitized.passwordHash).toBeUndefined();
      expect(sanitized.organizations).toBeDefined();
    });

    test('should handle empty organization arrays', async () => {
      const mockUser = {
        userId: 'user123',
        organizations: []
      };
      
      User.findById.mockResolvedValue(mockUser);
      
      const hasAccess = await authService.checkOrganizationAccess('user123', 'org123');
      expect(hasAccess).toBe(false);
    });

    test('should prevent privilege escalation through role manipulation', async () => {
      const mockUser = {
        userId: 'user123',
        organizations: [
          { orgId: 'org123', role: 'viewer' }
        ]
      };
      
      User.findById.mockResolvedValue(mockUser);
      
      // Attempt to check access with manipulated role parameter
      const hasAccess = await authService.checkOrganizationAccess('user123', 'org123', 'admin');
      expect(hasAccess).toBe(false);
    });
  });
});