const authService = require('../../services/auth');
const { User, Organization } = require('../../models');

// Mock the models
jest.mock('../../models', () => ({
  User: {
    findByEmail: jest.fn(),
    findById: jest.fn()
  },
  Organization: {
    findById: jest.fn()
  }
}));

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('hashPassword and verifyPassword', () => {
    test('should hash and verify password correctly', async () => {
      const password = 'testpassword123';
      const hashedPassword = await authService.hashPassword(password);
      
      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(password);
      
      const isValid = await authService.verifyPassword(password, hashedPassword);
      expect(isValid).toBe(true);
      
      const isInvalid = await authService.verifyPassword('wrongpassword', hashedPassword);
      expect(isInvalid).toBe(false);
    });
  });

  describe('generateToken and verifyToken', () => {
    test('should generate and verify JWT token correctly', () => {
      const payload = {
        userId: 'user123',
        email: 'test@example.com',
        organizations: []
      };
      
      const token = authService.generateToken(payload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      
      const decoded = authService.verifyToken(token);
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
    });

    test('should throw error for invalid token', () => {
      expect(() => {
        authService.verifyToken('invalid-token');
      }).toThrow('Invalid or expired token');
    });
  });

  describe('sanitizeUser', () => {
    test('should remove passwordHash from user object', () => {
      const user = {
        userId: 'user123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        passwordHash: 'hashed-password'
      };
      
      const sanitized = authService.sanitizeUser(user);
      
      expect(sanitized.userId).toBe(user.userId);
      expect(sanitized.email).toBe(user.email);
      expect(sanitized.firstName).toBe(user.firstName);
      expect(sanitized.lastName).toBe(user.lastName);
      expect(sanitized.passwordHash).toBeUndefined();
    });
  });

  describe('checkOrganizationAccess', () => {
    test('should return true for user with organization access', async () => {
      const mockUser = {
        userId: 'user123',
        organizations: [
          { orgId: 'org123', role: 'admin' }
        ]
      };
      
      User.findById.mockResolvedValue(mockUser);
      
      const hasAccess = await authService.checkOrganizationAccess('user123', 'org123');
      expect(hasAccess).toBe(true);
    });

    test('should return false for user without organization access', async () => {
      const mockUser = {
        userId: 'user123',
        organizations: []
      };
      
      User.findById.mockResolvedValue(mockUser);
      
      const hasAccess = await authService.checkOrganizationAccess('user123', 'org123');
      expect(hasAccess).toBe(false);
    });

    test('should check role hierarchy correctly', async () => {
      const mockUser = {
        userId: 'user123',
        organizations: [
          { orgId: 'org123', role: 'dev' }
        ]
      };
      
      User.findById.mockResolvedValue(mockUser);
      
      // Dev role should have access to viewer-level operations
      const hasViewerAccess = await authService.checkOrganizationAccess('user123', 'org123', 'viewer');
      expect(hasViewerAccess).toBe(true);
      
      // Dev role should have access to dev-level operations
      const hasDevAccess = await authService.checkOrganizationAccess('user123', 'org123', 'dev');
      expect(hasDevAccess).toBe(true);
      
      // Dev role should NOT have access to admin-level operations
      const hasAdminAccess = await authService.checkOrganizationAccess('user123', 'org123', 'admin');
      expect(hasAdminAccess).toBe(false);
    });
  });
});