const Project = require('../../models/project');

describe('Project Sharing Functionality', () => {
  describe('project access control', () => {
    let project;
    
    beforeEach(() => {
      project = new Project({
        orgId: 'org123',
        name: 'Test Project',
        owner: 'user123',
        visibility: 'private'
      });
    });

    test('should allow owner access', () => {
      expect(project.hasAccess('user123')).toBe(true);
      expect(project.hasAccess('user123', 'admin')).toBe(true);
    });

    test('should allow public project access to anyone', () => {
      project.visibility = 'public';
      expect(project.hasAccess('user456')).toBe(true);
    });

    test('should deny access to non-members for private projects', () => {
      expect(project.hasAccess('user456')).toBe(false);
    });

    test('should allow access to project members', () => {
      project.addMember('user456', 'viewer');
      
      expect(project.hasAccess('user456')).toBe(true);
      expect(project.hasAccess('user456', 'viewer')).toBe(true);
      expect(project.hasAccess('user456', 'dev')).toBe(false);
    });

    test('should respect role hierarchy', () => {
      project.addMember('user456', 'dev');
      
      expect(project.hasAccess('user456', 'viewer')).toBe(true);
      expect(project.hasAccess('user456', 'dev')).toBe(true);
      expect(project.hasAccess('user456', 'admin')).toBe(false);
    });
  });

  describe('member management', () => {
    let project;
    
    beforeEach(() => {
      project = new Project({
        orgId: 'org123',
        name: 'Test Project',
        owner: 'user123'
      });
    });

    test('should add member with role', () => {
      project.addMember('user456', 'dev');
      
      expect(project.members).toHaveLength(1);
      expect(project.members[0].userId).toBe('user456');
      expect(project.members[0].role).toBe('dev');
      expect(project.members[0].addedAt).toBeDefined();
    });

    test('should update existing member role', () => {
      project.addMember('user456', 'viewer');
      project.addMember('user456', 'admin');
      
      expect(project.members).toHaveLength(1);
      expect(project.members[0].role).toBe('admin');
      expect(project.members[0].updatedAt).toBeDefined();
    });

    test('should check member existence and role', () => {
      project.addMember('user456', 'dev');
      
      expect(project.hasMember('user456')).toBe(true);
      expect(project.hasMember('user456', 'dev')).toBe(true);
      expect(project.hasMember('user456', 'admin')).toBe(false);
      expect(project.hasMember('user789')).toBe(false);
    });

    test('should get member role', () => {
      project.addMember('user456', 'dev');
      
      expect(project.getMemberRole('user456')).toBe('dev');
      expect(project.getMemberRole('user789')).toBeNull();
    });

    test('should remove member', () => {
      project.addMember('user456', 'dev');
      project.addMember('user789', 'viewer');
      
      project.removeMember('user456');
      
      expect(project.members).toHaveLength(1);
      expect(project.members[0].userId).toBe('user789');
    });
  });

  describe('fromDynamoItem with members', () => {
    test('should create Project with members from DynamoDB item', () => {
      const item = {
        PK: 'org123#project456',
        orgId: 'org123',
        projectId: 'project456',
        name: 'Test Project',
        specJson: {},
        owner: 'user123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        status: 'draft',
        latestBuildId: null,
        deploymentEndpoints: [],
        visibility: 'private',
        members: [
          { userId: 'user456', role: 'dev', addedAt: '2024-01-01T00:00:00Z' }
        ]
      };
      
      const project = Project.fromDynamoItem(item);
      
      expect(project).toBeInstanceOf(Project);
      expect(project.members).toHaveLength(1);
      expect(project.members[0]).toEqual({
        userId: 'user456',
        role: 'dev',
        addedAt: '2024-01-01T00:00:00Z'
      });
    });

    test('should handle missing members field', () => {
      const item = {
        PK: 'org123#project456',
        orgId: 'org123',
        projectId: 'project456',
        name: 'Test Project',
        specJson: {},
        owner: 'user123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        status: 'draft',
        latestBuildId: null,
        deploymentEndpoints: [],
        visibility: 'private'
        // members field missing
      };
      
      const project = Project.fromDynamoItem(item);
      
      expect(project).toBeInstanceOf(Project);
      expect(project.members).toEqual([]);
    });
  });
});