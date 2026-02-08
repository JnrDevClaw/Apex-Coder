const Organization = require('../../models/organization');

describe('Organization Model', () => {
  describe('constructor and properties', () => {
    test('should create organization with required fields', () => {
      const orgData = {
        name: 'Test Organization',
        owner: 'user123'
      };
      
      const organization = new Organization(orgData);
      
      expect(organization.name).toBe('Test Organization');
      expect(organization.owner).toBe('user123');
      expect(organization.orgId).toBeDefined();
      expect(organization.isActive).toBe(true);
      expect(organization.members).toEqual([]);
      expect(organization.settings).toEqual({
        allowPublicProjects: false,
        defaultProjectVisibility: 'private',
        maxProjects: 100
      });
    });

    test('should generate correct PK', () => {
      const organization = new Organization({
        orgId: 'org123',
        name: 'Test Org',
        owner: 'user123'
      });
      
      expect(organization.PK).toBe('org123');
    });
  });

  describe('member management', () => {
    let organization;
    
    beforeEach(() => {
      organization = new Organization({
        name: 'Test Organization',
        owner: 'user123'
      });
    });

    test('should add member', () => {
      organization.addMember('user456', 'dev');
      
      expect(organization.members).toHaveLength(1);
      expect(organization.members[0].userId).toBe('user456');
      expect(organization.members[0].role).toBe('dev');
      expect(organization.members[0].addedAt).toBeDefined();
    });

    test('should update existing member role', () => {
      organization.addMember('user456', 'viewer');
      organization.addMember('user456', 'admin');
      
      expect(organization.members).toHaveLength(1);
      expect(organization.members[0].role).toBe('admin');
    });

    test('should check member existence and role', () => {
      organization.addMember('user456', 'dev');
      
      expect(organization.hasMember('user456')).toBe(true);
      expect(organization.hasMember('user456', 'dev')).toBe(true);
      expect(organization.hasMember('user456', 'admin')).toBe(false);
      expect(organization.hasMember('user789')).toBe(false);
    });

    test('should get member role', () => {
      organization.addMember('user456', 'dev');
      
      expect(organization.getMemberRole('user456')).toBe('dev');
      expect(organization.getMemberRole('user789')).toBeNull();
    });

    test('should remove member', () => {
      organization.addMember('user456', 'dev');
      organization.addMember('user789', 'viewer');
      
      organization.removeMember('user456');
      
      expect(organization.members).toHaveLength(1);
      expect(organization.members[0].userId).toBe('user789');
    });

    test('should check if user is owner', () => {
      expect(organization.isOwner('user123')).toBe(true);
      expect(organization.isOwner('user456')).toBe(false);
    });

    test('should check admin access', () => {
      organization.addMember('user456', 'admin');
      organization.addMember('user789', 'dev');
      
      expect(organization.hasAdminAccess('user123')).toBe(true); // owner
      expect(organization.hasAdminAccess('user456')).toBe(true); // admin
      expect(organization.hasAdminAccess('user789')).toBe(false); // dev
    });
  });

  describe('fromDynamoItem', () => {
    test('should create Organization from DynamoDB item', () => {
      const item = {
        PK: 'org123',
        orgId: 'org123',
        name: 'Test Organization',
        description: 'A test organization',
        owner: 'user123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        isActive: true,
        members: [
          { userId: 'user456', role: 'dev', addedAt: '2024-01-01T00:00:00Z' }
        ],
        settings: {
          allowPublicProjects: true,
          defaultProjectVisibility: 'organization',
          maxProjects: 50
        }
      };
      
      const organization = Organization.fromDynamoItem(item);
      
      expect(organization).toBeInstanceOf(Organization);
      expect(organization.orgId).toBe('org123');
      expect(organization.name).toBe('Test Organization');
      expect(organization.description).toBe('A test organization');
      expect(organization.owner).toBe('user123');
      expect(organization.isActive).toBe(true);
      expect(organization.members).toHaveLength(1);
      expect(organization.members[0]).toEqual({
        userId: 'user456',
        role: 'dev',
        addedAt: '2024-01-01T00:00:00Z'
      });
      expect(organization.settings).toEqual({
        allowPublicProjects: true,
        defaultProjectVisibility: 'organization',
        maxProjects: 50
      });
    });
  });
});