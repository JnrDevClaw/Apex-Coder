const Project = require('../../models/project');

describe('Project Model', () => {
  describe('constructor and properties', () => {
    test('should create project with required fields', () => {
      const projectData = {
        orgId: 'org123',
        name: 'Test Project',
        owner: 'user123'
      };
      
      const project = new Project(projectData);
      
      expect(project.orgId).toBe('org123');
      expect(project.name).toBe('Test Project');
      expect(project.owner).toBe('user123');
      expect(project.projectId).toBeDefined();
      expect(project.status).toBe('draft');
      expect(project.visibility).toBe('private');
      expect(project.createdAt).toBeDefined();
      expect(project.updatedAt).toBeDefined();
    });

    test('should generate correct PK', () => {
      const project = new Project({
        orgId: 'org123',
        projectId: 'proj456',
        name: 'Test',
        owner: 'user123'
      });
      
      expect(project.PK).toBe('org123#proj456');
    });

    test('should convert to DynamoDB item correctly', () => {
      const project = new Project({
        orgId: 'org123',
        projectId: 'proj456',
        name: 'Test Project',
        owner: 'user123',
        specJson: { test: 'data' }
      });
      
      const item = project.toDynamoItem();
      
      expect(item.PK).toBe('org123#proj456');
      expect(item.orgId).toBe('org123');
      expect(item.projectId).toBe('proj456');
      expect(item.name).toBe('Test Project');
      expect(item.owner).toBe('user123');
      expect(item.specJson).toEqual({ test: 'data' });
      expect(item.status).toBe('draft');
      expect(item.visibility).toBe('private');
    });
  });

  describe('fromDynamoItem', () => {
    test('should create Project from DynamoDB item', () => {
      const item = {
        PK: 'org123#proj456',
        orgId: 'org123',
        projectId: 'proj456',
        name: 'Test Project',
        owner: 'user123',
        specJson: { test: 'data' },
        status: 'building',
        visibility: 'organization',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        latestBuildId: 'build123',
        deploymentEndpoints: ['https://example.com']
      };
      
      const project = Project.fromDynamoItem(item);
      
      expect(project).toBeInstanceOf(Project);
      expect(project.orgId).toBe('org123');
      expect(project.projectId).toBe('proj456');
      expect(project.name).toBe('Test Project');
      expect(project.owner).toBe('user123');
      expect(project.specJson).toEqual({ test: 'data' });
      expect(project.status).toBe('building');
      expect(project.visibility).toBe('organization');
      expect(project.latestBuildId).toBe('build123');
      expect(project.deploymentEndpoints).toEqual(['https://example.com']);
    });
  });
});