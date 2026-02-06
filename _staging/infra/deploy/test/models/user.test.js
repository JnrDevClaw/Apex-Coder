const User = require('../../models/user');

describe('User Model', () => {
  describe('constructor and properties', () => {
    test('should create user with required fields', () => {
      const userData = {
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        firstName: 'John',
        lastName: 'Doe'
      };
      
      const user = new User(userData);
      
      expect(user.email).toBe('test@example.com');
      expect(user.passwordHash).toBe('hashed-password');
      expect(user.firstName).toBe('John');
      expect(user.lastName).toBe('Doe');
      expect(user.userId).toBeDefined();
      expect(user.isActive).toBe(true);
      expect(user.emailVerified).toBe(false);
      expect(user.organizations).toEqual([]);
    });

    test('should generate correct PK', () => {
      const user = new User({
        userId: 'user123',
        email: 'test@example.com',
        passwordHash: 'hashed'
      });
      
      expect(user.PK).toBe('user123');
    });

    test('should get full name correctly', () => {
      const user = new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'test@example.com',
        passwordHash: 'hashed'
      });
      
      expect(user.fullName).toBe('John Doe');
    });
  });

  describe('organization management', () => {
    let user;
    
    beforeEach(() => {
      user = new User({
        email: 'test@example.com',
        passwordHash: 'hashed',
        firstName: 'John',
        lastName: 'Doe'
      });
    });

    test('should add organization membership', () => {
      user.addOrganization('org123', 'admin');
      
      expect(user.organizations).toHaveLength(1);
      expect(user.organizations[0]).toEqual({
        orgId: 'org123',
        role: 'admin'
      });
    });

    test('should update existing organization role', () => {
      user.addOrganization('org123', 'viewer');
      user.addOrganization('org123', 'admin');
      
      expect(user.organizations).toHaveLength(1);
      expect(user.organizations[0].role).toBe('admin');
    });

    test('should check organization membership', () => {
      user.addOrganization('org123', 'admin');
      
      expect(user.hasOrganizationRole('org123')).toBe(true);
      expect(user.hasOrganizationRole('org123', 'admin')).toBe(true);
      expect(user.hasOrganizationRole('org123', 'viewer')).toBe(false);
      expect(user.hasOrganizationRole('org456')).toBe(false);
    });

    test('should remove organization membership', () => {
      user.addOrganization('org123', 'admin');
      user.addOrganization('org456', 'viewer');
      
      user.removeOrganization('org123');
      
      expect(user.organizations).toHaveLength(1);
      expect(user.organizations[0].orgId).toBe('org456');
    });
  });

  describe('fromDynamoItem', () => {
    test('should create User from DynamoDB item', () => {
      const item = {
        PK: 'user123',
        userId: 'user123',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        firstName: 'John',
        lastName: 'Doe',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        lastLoginAt: '2024-01-01T12:00:00Z',
        isActive: true,
        emailVerified: true,
        organizations: [
          { orgId: 'org123', role: 'admin' }
        ]
      };
      
      const user = User.fromDynamoItem(item);
      
      expect(user).toBeInstanceOf(User);
      expect(user.userId).toBe('user123');
      expect(user.email).toBe('test@example.com');
      expect(user.firstName).toBe('John');
      expect(user.lastName).toBe('Doe');
      expect(user.isActive).toBe(true);
      expect(user.emailVerified).toBe(true);
      expect(user.organizations).toHaveLength(1);
      expect(user.organizations[0]).toEqual({ orgId: 'org123', role: 'admin' });
    });
  });
});