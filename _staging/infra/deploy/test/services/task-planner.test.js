const taskPlanner = require('../../services/task-planner');

describe('TaskPlanner', () => {
  const mockSpecJson = {
    projectName: 'Test App',
    stack: {
      frontend: 'svelte',
      backend: 'node',
      database: 'postgres'
    },
    features: {
      auth: true,
      payments: false,
      uploads: true,
      realtime: false,
      web3: false
    },
    constraints: {
      offline: false,
      hipaa: false,
      audit: true
    },
    envPrefs: {
      hosting: 'aws',
      cicd: true,
      monitoring: true
    }
  };

  describe('analyzeRequiredFeatures', () => {
    test('should correctly analyze required features', () => {
      const features = taskPlanner.analyzeRequiredFeatures(mockSpecJson);
      
      expect(features.hasAuth).toBe(true);
      expect(features.hasPayments).toBe(false);
      expect(features.hasUploads).toBe(true);
      expect(features.requiresDatabase).toBe(true);
      expect(features.requiresAPI).toBe(true);
      expect(features.frontendFramework).toBe('svelte');
      expect(features.backendFramework).toBe('node');
      expect(features.databaseType).toBe('postgres');
    });

    test('should detect database requirement correctly', () => {
      const specWithoutAuth = {
        ...mockSpecJson,
        features: { auth: false, payments: false, uploads: false }
      };
      
      const features = taskPlanner.analyzeRequiredFeatures(specWithoutAuth);
      expect(features.requiresDatabase).toBe(true); // Still true because database is specified
    });
  });

  describe('spec decomposition into valid task trees', () => {
    test('should generate tasks for full-stack app with auth and uploads', async () => {
      const result = await taskPlanner.decomposeSpec(mockSpecJson);
      
      expect(result.tasks).toBeDefined();
      expect(result.tasks.length).toBeGreaterThan(0);
      expect(result.dependencyGraph).toBeDefined();
      expect(result.milestones).toBeDefined();
      expect(result.totalEstimation).toBeDefined();
      
      // Check that auth and upload tasks are included
      const taskNames = result.tasks.map(t => t.templateId);
      expect(taskNames).toContain('auth-system');
      expect(taskNames).toContain('file-uploads');
      expect(taskNames).toContain('frontend-setup');
      expect(taskNames).toContain('backend-setup');
    });

    test('should handle minimal spec without optional features', async () => {
      const minimalSpec = {
        projectName: 'Minimal App',
        stack: {
          frontend: 'svelte',
          backend: 'node',
          database: 'none'
        },
        features: {
          auth: false,
          payments: false,
          uploads: false,
          realtime: false,
          web3: false
        }
      };
      
      const result = await taskPlanner.decomposeSpec(minimalSpec);
      
      expect(result.tasks).toBeDefined();
      expect(result.tasks.length).toBeGreaterThan(0);
      
      // Should not include auth or upload tasks
      const taskNames = result.tasks.map(t => t.templateId);
      expect(taskNames).not.toContain('auth-system');
      expect(taskNames).not.toContain('file-uploads');
    });

    test('should create proper task dependencies', async () => {
      const result = await taskPlanner.decomposeSpec(mockSpecJson);
      
      // Find frontend and backend setup tasks
      const frontendSetup = result.tasks.find(t => t.templateId === 'frontend-setup');
      const frontendComponents = result.tasks.find(t => t.templateId === 'frontend-components');
      const backendSetup = result.tasks.find(t => t.templateId === 'backend-setup');
      const databaseModels = result.tasks.find(t => t.templateId === 'database-models');
      
      expect(frontendSetup).toBeDefined();
      expect(frontendComponents).toBeDefined();
      expect(backendSetup).toBeDefined();
      expect(databaseModels).toBeDefined();
      
      // Check dependencies
      expect(frontendComponents.dependencies).toContain(frontendSetup.id);
      expect(databaseModels.dependencies).toContain(backendSetup.id);
    });

    test('should generate valid task tree structure', async () => {
      const result = await taskPlanner.decomposeSpec(mockSpecJson);
      
      // Validate each task has required properties
      for (const task of result.tasks) {
        expect(task).toHaveProperty('id');
        expect(task).toHaveProperty('templateId');
        expect(task).toHaveProperty('name');
        expect(task).toHaveProperty('agentRole');
        expect(task).toHaveProperty('estimatedTime');
        expect(task).toHaveProperty('dependencies');
        expect(task).toHaveProperty('outputs');
        expect(task).toHaveProperty('requirements');
        
        // Validate types
        expect(typeof task.id).toBe('number');
        expect(typeof task.name).toBe('string');
        expect(typeof task.agentRole).toBe('string');
        expect(typeof task.estimatedTime).toBe('number');
        expect(Array.isArray(task.dependencies)).toBe(true);
        expect(Array.isArray(task.outputs)).toBe(true);
        expect(Array.isArray(task.requirements)).toBe(true);
      }
    });

    test('should generate tasks for different stack combinations', async () => {
      const reactNodeSpec = {
        projectName: 'React Node App',
        stack: {
          frontend: 'react',
          backend: 'node',
          database: 'mysql'
        },
        features: {
          auth: true,
          payments: true,
          uploads: false,
          realtime: true,
          web3: false
        }
      };
      
      const result = await taskPlanner.decomposeSpec(reactNodeSpec);
      
      expect(result.tasks.length).toBeGreaterThan(0);
      
      const taskTemplateIds = result.tasks.map(t => t.templateId);
      expect(taskTemplateIds).toContain('frontend-setup');
      expect(taskTemplateIds).toContain('backend-setup');
      expect(taskTemplateIds).toContain('auth-system');
      expect(taskTemplateIds).toContain('payment-system');
      expect(taskTemplateIds).toContain('realtime-system');
      expect(taskTemplateIds).not.toContain('file-uploads');
      
      // Check context is passed correctly
      const frontendTask = result.tasks.find(t => t.templateId === 'frontend-setup');
      expect(frontendTask.context.framework).toBe('react');
    });

    test('should handle frontend-only applications', async () => {
      const frontendOnlySpec = {
        projectName: 'Static Site',
        stack: {
          frontend: 'svelte',
          backend: 'none',
          database: 'none'
        },
        features: {
          auth: false,
          payments: false,
          uploads: false,
          realtime: false,
          web3: false
        }
      };
      
      const result = await taskPlanner.decomposeSpec(frontendOnlySpec);
      
      const taskTemplateIds = result.tasks.map(t => t.templateId);
      expect(taskTemplateIds).toContain('frontend-setup');
      expect(taskTemplateIds).toContain('frontend-components');
      expect(taskTemplateIds).not.toContain('backend-setup');
      expect(taskTemplateIds).not.toContain('database-models');
      expect(taskTemplateIds).not.toContain('api-endpoints');
    });

    test('should handle backend-only applications', async () => {
      const backendOnlySpec = {
        projectName: 'API Service',
        stack: {
          frontend: 'none',
          backend: 'node',
          database: 'postgres'
        },
        features: {
          auth: true,
          payments: false,
          uploads: true,
          realtime: false,
          web3: false
        }
      };
      
      const result = await taskPlanner.decomposeSpec(backendOnlySpec);
      
      const taskTemplateIds = result.tasks.map(t => t.templateId);
      expect(taskTemplateIds).not.toContain('frontend-setup');
      expect(taskTemplateIds).not.toContain('frontend-components');
      expect(taskTemplateIds).toContain('backend-setup');
      expect(taskTemplateIds).toContain('database-models');
      expect(taskTemplateIds).toContain('api-endpoints');
      expect(taskTemplateIds).toContain('auth-system');
      expect(taskTemplateIds).toContain('file-uploads');
    });

    test('should generate appropriate testing tasks', async () => {
      const result = await taskPlanner.decomposeSpec(mockSpecJson);
      
      const taskTemplateIds = result.tasks.map(t => t.templateId);
      expect(taskTemplateIds).toContain('unit-tests');
      expect(taskTemplateIds).toContain('integration-tests');
      
      // Testing tasks should depend on implementation tasks
      const unitTestTask = result.tasks.find(t => t.templateId === 'unit-tests');
      const integrationTestTask = result.tasks.find(t => t.templateId === 'integration-tests');
      
      expect(unitTestTask.dependencies.length).toBeGreaterThan(0);
      expect(integrationTestTask.dependencies.length).toBeGreaterThan(0);
    });

    test('should generate deployment tasks with proper dependencies', async () => {
      const result = await taskPlanner.decomposeSpec(mockSpecJson);
      
      const taskTemplateIds = result.tasks.map(t => t.templateId);
      expect(taskTemplateIds).toContain('containerization');
      expect(taskTemplateIds).toContain('deployment-config');
      
      // Deployment tasks should have proper dependencies
      const containerTask = result.tasks.find(t => t.templateId === 'containerization');
      const deployTask = result.tasks.find(t => t.templateId === 'deployment-config');
      
      expect(containerTask.dependencies.length).toBeGreaterThan(0);
      expect(deployTask.dependencies).toContain(containerTask.id);
    });

    test('should assign unique task IDs', async () => {
      const result = await taskPlanner.decomposeSpec(mockSpecJson);
      
      const taskIds = result.tasks.map(t => t.id);
      const uniqueIds = new Set(taskIds);
      
      expect(uniqueIds.size).toBe(taskIds.length);
    });

    test('should validate dependency graph completeness', async () => {
      const result = await taskPlanner.decomposeSpec(mockSpecJson);
      
      // All task IDs should exist in dependency graph
      for (const task of result.tasks) {
        expect(result.dependencyGraph.has(task.id)).toBe(true);
      }
      
      // All dependencies should reference valid task IDs
      for (const task of result.tasks) {
        for (const depId of task.dependencies) {
          const dependencyExists = result.tasks.some(t => t.id === depId);
          expect(dependencyExists).toBe(true);
        }
      }
    });

    test('should handle complex feature combinations', async () => {
      const complexSpec = {
        projectName: 'Complex App',
        stack: {
          frontend: 'svelte',
          backend: 'node',
          database: 'postgres'
        },
        features: {
          auth: true,
          payments: true,
          uploads: true,
          realtime: true,
          web3: true
        },
        constraints: {
          offline: true,
          hipaa: true,
          audit: true
        },
        envPrefs: {
          hosting: 'aws',
          cicd: true,
          monitoring: true
        }
      };
      
      const result = await taskPlanner.decomposeSpec(complexSpec);
      
      expect(result.tasks.length).toBeGreaterThan(10); // Should have many tasks
      
      const taskTemplateIds = result.tasks.map(t => t.templateId);
      expect(taskTemplateIds).toContain('auth-system');
      expect(taskTemplateIds).toContain('payment-system');
      expect(taskTemplateIds).toContain('file-uploads');
      expect(taskTemplateIds).toContain('realtime-system');
      
      // Should have proper task ordering
      const orderedTasks = result.tasks;
      const isProperlyOrdered = orderedTasks.every((task, index) => {
        return task.dependencies.every(depId => {
          const depIndex = orderedTasks.findIndex(t => t.id === depId);
          return depIndex < index;
        });
      });
      
      expect(isProperlyOrdered).toBe(true);
    });
  });

  describe('generateOpenAPIskeleton', () => {
    test('should generate OpenAPI spec with auth endpoints', async () => {
      const openApi = await taskPlanner.generateOpenAPIskeleton(mockSpecJson, []);
      
      expect(openApi.openapi).toBe('3.0.0');
      expect(openApi.info.title).toBe('Test App');
      expect(openApi.paths['/auth/login']).toBeDefined();
      expect(openApi.paths['/auth/register']).toBeDefined();
      expect(openApi.components.schemas.User).toBeDefined();
      expect(openApi.components.securitySchemes.bearerAuth).toBeDefined();
    });

    test('should include upload endpoints when uploads are enabled', async () => {
      const openApi = await taskPlanner.generateOpenAPIskeleton(mockSpecJson, []);
      
      expect(openApi.paths['/uploads']).toBeDefined();
      expect(openApi.paths['/uploads'].post).toBeDefined();
    });

    test('should not include auth endpoints when auth is disabled', async () => {
      const specWithoutAuth = {
        ...mockSpecJson,
        features: { ...mockSpecJson.features, auth: false }
      };
      
      const openApi = await taskPlanner.generateOpenAPIskeleton(specWithoutAuth, []);
      
      expect(openApi.paths['/auth/login']).toBeUndefined();
      expect(openApi.paths['/auth/register']).toBeUndefined();
      expect(openApi.components.securitySchemes.bearerAuth).toBeUndefined();
    });
  });

  describe('generateDatabaseSchema', () => {
    test('should generate schema with users table when auth is enabled', async () => {
      const schema = await taskPlanner.generateDatabaseSchema(mockSpecJson, []);
      
      expect(schema.database).toBe('postgres');
      expect(schema.tables).toBeDefined();
      
      const usersTable = schema.tables.find(t => t.name === 'users');
      expect(usersTable).toBeDefined();
      expect(usersTable.columns.find(c => c.name === 'email')).toBeDefined();
      expect(usersTable.columns.find(c => c.name === 'password_hash')).toBeDefined();
    });

    test('should generate uploads table when uploads are enabled', async () => {
      const schema = await taskPlanner.generateDatabaseSchema(mockSpecJson, []);
      
      const uploadsTable = schema.tables.find(t => t.name === 'uploads');
      expect(uploadsTable).toBeDefined();
      expect(uploadsTable.columns.find(c => c.name === 'filename')).toBeDefined();
      expect(uploadsTable.columns.find(c => c.name === 'user_id')).toBeDefined();
      
      // Check relationship
      const relationship = schema.relationships.find(r => 
        r.from === 'uploads.user_id' && r.to === 'users.id'
      );
      expect(relationship).toBeDefined();
    });

    test('should not generate users table when auth is disabled', async () => {
      const specWithoutAuth = {
        ...mockSpecJson,
        features: { ...mockSpecJson.features, auth: false }
      };
      
      const schema = await taskPlanner.generateDatabaseSchema(specWithoutAuth, []);
      
      const usersTable = schema.tables.find(t => t.name === 'users');
      expect(usersTable).toBeUndefined();
    });
  });

  describe('planProject', () => {
    test('should generate complete project plan', async () => {
      const plan = await taskPlanner.planProject(mockSpecJson);
      
      expect(plan.tasks).toBeDefined();
      expect(plan.dependencyGraph).toBeDefined();
      expect(plan.milestones).toBeDefined();
      expect(plan.totalEstimation).toBeDefined();
      expect(plan.openApiSkeleton).toBeDefined();
      expect(plan.databaseSchema).toBeDefined();
      expect(plan.projectName).toBe('Test App');
      expect(plan.specJson).toEqual(mockSpecJson);
      
      // Check estimation structure
      expect(plan.totalEstimation.totalTimeSeconds).toBeGreaterThan(0);
      expect(plan.totalEstimation.taskCount).toBe(plan.tasks.length);
      expect(plan.totalEstimation.estimatedCompletionDate).toBeDefined();
    });

    test('should generate milestones', async () => {
      const plan = await taskPlanner.planProject(mockSpecJson);
      
      expect(plan.milestones.length).toBeGreaterThan(0);
      
      for (const milestone of plan.milestones) {
        expect(milestone.id).toBeDefined();
        expect(milestone.name).toBeDefined();
        expect(milestone.tasks).toBeDefined();
        expect(milestone.estimatedTime).toBeGreaterThan(0);
      }
    });
  });

  describe('dependency resolution and task ordering', () => {
    test('should detect circular dependencies', async () => {
      const tasksWithCircularDep = [
        { id: 1, dependencies: [2] },
        { id: 2, dependencies: [3] },
        { id: 3, dependencies: [1] }
      ];
      
      const graph = taskPlanner.buildDependencyGraph(tasksWithCircularDep);
      
      expect(() => {
        taskPlanner.topologicalSort(tasksWithCircularDep, graph);
      }).toThrow('Circular dependency detected');
    });

    test('should sort tasks correctly with simple dependencies', async () => {
      const tasks = [
        { id: 3, dependencies: [1, 2] },
        { id: 1, dependencies: [] },
        { id: 2, dependencies: [1] }
      ];
      
      const graph = taskPlanner.buildDependencyGraph(tasks);
      const sorted = taskPlanner.topologicalSort(tasks, graph);
      
      expect(sorted.map(t => t.id)).toEqual([1, 2, 3]);
    });

    test('should handle complex dependency chains', async () => {
      const tasks = [
        { id: 1, name: 'frontend-setup', dependencies: [] },
        { id: 2, name: 'backend-setup', dependencies: [] },
        { id: 3, name: 'database-models', dependencies: [2] },
        { id: 4, name: 'api-endpoints', dependencies: [3] },
        { id: 5, name: 'frontend-components', dependencies: [1, 4] },
        { id: 6, name: 'auth-system', dependencies: [2] },
        { id: 7, name: 'integration-tests', dependencies: [4, 5, 6] }
      ];
      
      const graph = taskPlanner.buildDependencyGraph(tasks);
      const sorted = taskPlanner.topologicalSort(tasks, graph);
      
      // Verify ordering constraints
      const getIndex = (id) => sorted.findIndex(t => t.id === id);
      
      // Setup tasks should come first
      expect(getIndex(1)).toBeLessThan(getIndex(5)); // frontend-setup before frontend-components
      expect(getIndex(2)).toBeLessThan(getIndex(3)); // backend-setup before database-models
      
      // Database models before API endpoints
      expect(getIndex(3)).toBeLessThan(getIndex(4));
      
      // API endpoints before frontend components (due to dependency)
      expect(getIndex(4)).toBeLessThan(getIndex(5));
      
      // All implementation before integration tests
      expect(getIndex(4)).toBeLessThan(getIndex(7));
      expect(getIndex(5)).toBeLessThan(getIndex(7));
      expect(getIndex(6)).toBeLessThan(getIndex(7));
    });

    test('should build dependency graph with reverse dependencies', () => {
      const tasks = [
        { id: 1, dependencies: [] },
        { id: 2, dependencies: [1] },
        { id: 3, dependencies: [1, 2] }
      ];
      
      const graph = taskPlanner.buildDependencyGraph(tasks);
      
      // Check forward dependencies
      expect(graph.get(1).dependencies).toEqual([]);
      expect(graph.get(2).dependencies).toEqual([1]);
      expect(graph.get(3).dependencies).toEqual([1, 2]);
      
      // Check reverse dependencies (dependents)
      expect(graph.get(1).dependents).toEqual(expect.arrayContaining([2, 3]));
      expect(graph.get(2).dependents).toEqual([3]);
      expect(graph.get(3).dependents).toEqual([]);
    });

    test('should handle parallel task execution paths', async () => {
      const tasks = [
        { id: 1, name: 'setup', dependencies: [] },
        { id: 2, name: 'frontend-branch', dependencies: [1] },
        { id: 3, name: 'backend-branch', dependencies: [1] },
        { id: 4, name: 'database-branch', dependencies: [1] },
        { id: 5, name: 'integration', dependencies: [2, 3, 4] }
      ];
      
      const graph = taskPlanner.buildDependencyGraph(tasks);
      const sorted = taskPlanner.topologicalSort(tasks, graph);
      
      const getIndex = (id) => sorted.findIndex(t => t.id === id);
      
      // Setup should be first
      expect(getIndex(1)).toBe(0);
      
      // Parallel branches can be in any order but after setup
      expect(getIndex(2)).toBeGreaterThan(getIndex(1));
      expect(getIndex(3)).toBeGreaterThan(getIndex(1));
      expect(getIndex(4)).toBeGreaterThan(getIndex(1));
      
      // Integration should be last
      expect(getIndex(5)).toBe(sorted.length - 1);
    });

    test('should validate task dependencies exist', () => {
      const tasksWithInvalidDep = [
        { id: 1, dependencies: [] },
        { id: 2, dependencies: [999] } // Non-existent dependency
      ];
      
      const graph = taskPlanner.buildDependencyGraph(tasksWithInvalidDep);
      
      // Should handle gracefully - dependency node won't exist but shouldn't crash
      expect(graph.get(2).dependencies).toEqual([999]);
      expect(graph.get(999)).toBeUndefined();
    });

    test('should handle self-dependency detection', () => {
      const tasksWithSelfDep = [
        { id: 1, dependencies: [1] } // Self-dependency
      ];
      
      const graph = taskPlanner.buildDependencyGraph(tasksWithSelfDep);
      
      expect(() => {
        taskPlanner.topologicalSort(tasksWithSelfDep, graph);
      }).toThrow('Circular dependency detected');
    });

    test('should preserve task metadata during sorting', async () => {
      const tasks = [
        { id: 2, name: 'Second Task', agentRole: 'coder', estimatedTime: 600, dependencies: [1] },
        { id: 1, name: 'First Task', agentRole: 'planner', estimatedTime: 300, dependencies: [] }
      ];
      
      const graph = taskPlanner.buildDependencyGraph(tasks);
      const sorted = taskPlanner.topologicalSort(tasks, graph);
      
      expect(sorted).toHaveLength(2);
      expect(sorted[0]).toEqual(expect.objectContaining({
        id: 1,
        name: 'First Task',
        agentRole: 'planner',
        estimatedTime: 300
      }));
      expect(sorted[1]).toEqual(expect.objectContaining({
        id: 2,
        name: 'Second Task',
        agentRole: 'coder',
        estimatedTime: 600
      }));
    });
  });
});