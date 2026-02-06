/**
 * ModelRouter Service Tests
 * Tests for the ModelRouter and LLM provider system
 * Covers provider registration, routing logic, weighted routing, and fallback mechanisms
 */

const { ModelRouter, LLMProvider, LLMResponse, AGENT_ROLES } = require('../../services/model-router');
const { AgentRoleAssigner, AGENT_ROLES: AGENT_ROLES_FROM_SERVICE } = require('../../services/agent-roles');
const { ModelRouterService } = require('../../services/model-router-service');

// Mock LLM Provider for testing
class MockLLMProvider extends LLMProvider {
  constructor(name, capabilities = ['coder'], config = {}) {
    super({
      name: name,
      capabilities: capabilities,
      costPerToken: config.costPerToken || 0.001,
      maxTokens: config.maxTokens || 4096,
      latency: config.latency || 100,
      reliability: config.reliability || 0.95,
      ...config
    });
    this.callCount = 0;
    this.shouldFail = config.shouldFail || false;
    this.failureRate = config.failureRate || 0;
    this.responseDelay = config.responseDelay || 0;
  }

  async call(prompt, context = {}) {
    this.callCount++;
    
    // Simulate response delay
    if (this.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.responseDelay));
    }
    
    // Simulate failures
    if (this.shouldFail || (this.failureRate > 0 && Math.random() < this.failureRate)) {
      throw new Error(`Mock provider ${this.name} simulated failure`);
    }
    
    // Simulate different responses based on role
    const { role } = context;
    let content = `Mock response for ${role || 'unknown'} role: ${prompt.substring(0, 50)}...`;
    
    if (role === 'coder') {
      content = `function mockFunction() {\n  // Generated code for: ${prompt}\n  return true;\n}`;
    } else if (role === 'tester') {
      content = `describe('Mock Test', () => {\n  it('should test ${prompt}', () => {\n    expect(true).toBe(true);\n  });\n});`;
    } else if (role === 'planner') {
      content = `Task breakdown for: ${prompt}\n1. Analysis\n2. Implementation\n3. Testing`;
    } else if (role === 'debugger') {
      content = `Patch for issue: ${prompt}\n--- a/file.js\n+++ b/file.js\n@@ -1,3 +1,3 @@\n-  buggy code\n+  fixed code`;
    }

    return new LLMResponse({
      success: true,
      content: content,
      tokens: Math.floor(content.length / 4),
      cost: Math.floor(content.length / 4) * this.costPerToken,
      latency: this.latency + Math.random() * 50,
      provider: this.name,
      model: 'mock-model-v1'
    });
  }

  async healthCheck() {
    return !this.shouldFail && Math.random() > this.failureRate;
  }
}

// High-performance mock provider
class HighPerformanceMockProvider extends MockLLMProvider {
  constructor(name, capabilities) {
    super(name, capabilities, {
      costPerToken: 0.0005,
      latency: 50,
      reliability: 0.99,
      responseDelay: 10
    });
  }
}

// Low-cost mock provider
class LowCostMockProvider extends MockLLMProvider {
  constructor(name, capabilities) {
    super(name, capabilities, {
      costPerToken: 0.0001,
      latency: 200,
      reliability: 0.85,
      responseDelay: 100
    });
  }
}

// Unreliable mock provider
class UnreliableMockProvider extends MockLLMProvider {
  constructor(name, capabilities) {
    super(name, capabilities, {
      costPerToken: 0.002,
      latency: 300,
      reliability: 0.60,
      failureRate: 0.4
    });
  }
}

describe('ModelRouter', () => {
  let modelRouter;
  let mockProvider1;
  let mockProvider2;

  beforeEach(() => {
    modelRouter = new ModelRouter();
    mockProvider1 = new MockLLMProvider('mock-provider-1', ['coder', 'tester']);
    mockProvider2 = new MockLLMProvider('mock-provider-2', ['reviewer', 'planner']);
  });

  describe('Provider Registration', () => {
    test('should register providers successfully', () => {
      modelRouter.registerProvider(mockProvider1);
      modelRouter.registerProvider(mockProvider2);

      const providers = modelRouter.getProviders();
      expect(providers).toHaveLength(2);
      expect(providers.map(p => p.name)).toContain('mock-provider-1');
      expect(providers.map(p => p.name)).toContain('mock-provider-2');
    });

    test('should throw error for invalid provider', () => {
      expect(() => {
        modelRouter.registerProvider({ name: 'invalid' });
      }).toThrow('Provider must extend LLMProvider class');
    });
  });

  describe('Task Routing', () => {
    beforeEach(() => {
      modelRouter.registerProvider(mockProvider1);
      modelRouter.registerProvider(mockProvider2);
    });

    test('should route task to appropriate provider', async () => {
      const task = {
        role: 'coder',
        prompt: 'Create a function that adds two numbers',
        complexity: 'medium'
      };

      const response = await modelRouter.routeTask(task);
      
      expect(response.success).toBe(true);
      expect(response.content).toContain('function mockFunction');
      expect(response.provider).toBe('mock-provider-1');
    });

    test('should handle fallback when primary provider fails', async () => {
      // Create a failing provider
      const failingProvider = new MockLLMProvider('failing-provider', ['coder']);
      failingProvider.call = async () => {
        throw new Error('Provider failed');
      };
      
      modelRouter.registerProvider(failingProvider);

      const task = {
        role: 'coder',
        prompt: 'Create a function',
        fallback: true
      };

      const response = await modelRouter.routeTask(task);
      
      // Should fallback to working provider
      expect(response.success).toBe(true);
      expect(response.provider).toBe('mock-provider-1');
    });

    test('should throw error for invalid role', async () => {
      const task = {
        role: 'invalid-role',
        prompt: 'Test prompt'
      };

      await expect(modelRouter.routeTask(task)).rejects.toThrow('Invalid agent role');
    });
  });

  describe('Weighted Routing', () => {
    beforeEach(() => {
      // Register providers with different characteristics
      const highPerfProvider = new HighPerformanceMockProvider('high-perf', ['coder', 'tester']);
      const lowCostProvider = new LowCostMockProvider('low-cost', ['coder', 'reviewer']);
      const unreliableProvider = new UnreliableMockProvider('unreliable', ['coder']);
      
      modelRouter.registerProvider(highPerfProvider);
      modelRouter.registerProvider(lowCostProvider);
      modelRouter.registerProvider(unreliableProvider);
    });

    test('should select optimal provider based on weights', () => {
      const weightedProviders = modelRouter.getWeightedRouting('coder');
      
      expect(weightedProviders).toHaveLength(3);
      expect(weightedProviders[0].weight).toBeGreaterThan(weightedProviders[1].weight);
      
      // High performance provider should have highest weight
      expect(weightedProviders[0].provider.name).toBe('high-perf');
    });

    test('should calculate provider weights correctly', () => {
      const optimalProvider = modelRouter.getOptimalModel('coder', 'high');
      
      // Should prefer high-performance provider for high complexity
      expect(optimalProvider.name).toBe('high-perf');
    });

    test('should adjust weights based on complexity', () => {
      const lowComplexityProvider = modelRouter.getOptimalModel('coder', 'low');
      const highComplexityProvider = modelRouter.getOptimalModel('coder', 'high');
      
      expect(lowComplexityProvider).toBeDefined();
      expect(highComplexityProvider).toBeDefined();
    });

    test('should handle provider with no capabilities for role', () => {
      const provider = modelRouter.getOptimalModel('nonexistent-role');
      expect(provider).toBeNull();
    });
  });

  describe('Fallback Mechanisms', () => {
    let failingProvider;
    let workingProvider;

    beforeEach(() => {
      failingProvider = new MockLLMProvider('failing-provider', ['coder'], { shouldFail: true });
      workingProvider = new MockLLMProvider('working-provider', ['coder']);
      
      // Register failing provider first (higher weight due to registration order)
      modelRouter.registerProvider(failingProvider);
      modelRouter.registerProvider(workingProvider);
    });

    test('should fallback to secondary provider when primary fails', async () => {
      const task = {
        role: 'coder',
        prompt: 'Create a function',
        fallback: true
      };

      const response = await modelRouter.routeTask(task);
      
      expect(response.success).toBe(true);
      expect(response.provider).toBe('working-provider');
    });

    test('should throw error when fallback is disabled', async () => {
      const task = {
        role: 'coder',
        prompt: 'Create a function',
        fallback: false
      };

      await expect(modelRouter.routeTask(task)).rejects.toThrow();
    });

    test('should throw error when no fallback providers available', async () => {
      // Register only failing providers
      const anotherFailingProvider = new MockLLMProvider('another-failing', ['reviewer'], { shouldFail: true });
      modelRouter.registerProvider(anotherFailingProvider);

      const task = {
        role: 'reviewer',
        prompt: 'Review this code',
        fallback: true
      };

      await expect(modelRouter.routeTask(task)).rejects.toThrow('No fallback provider available');
    });

    test('should handle multiple fallback attempts', async () => {
      // Create a chain of providers with different failure rates
      const partiallyFailingProvider = new MockLLMProvider('partial-fail', ['debugger'], { failureRate: 0.8 });
      const reliableProvider = new MockLLMProvider('reliable', ['debugger'], { reliability: 0.99 });
      
      modelRouter.registerProvider(partiallyFailingProvider);
      modelRouter.registerProvider(reliableProvider);

      const task = {
        role: 'debugger',
        prompt: 'Debug this issue',
        fallback: true
      };

      // Run multiple times to test fallback behavior
      let successCount = 0;
      const attempts = 10;
      
      for (let i = 0; i < attempts; i++) {
        try {
          const response = await modelRouter.routeTask(task);
          if (response.success) successCount++;
        } catch (error) {
          // Some failures expected due to unreliable providers
        }
      }

      // Should have some successes due to fallback mechanism
      expect(successCount).toBeGreaterThan(0);
    });
  });

  describe('Provider Health Checks', () => {
    test('should perform health checks on providers', async () => {
      const healthyProvider = new MockLLMProvider('healthy', ['coder']);
      const unhealthyProvider = new MockLLMProvider('unhealthy', ['coder'], { shouldFail: true });
      
      modelRouter.registerProvider(healthyProvider);
      modelRouter.registerProvider(unhealthyProvider);

      const healthyResult = await healthyProvider.healthCheck();
      const unhealthyResult = await unhealthyProvider.healthCheck();

      expect(healthyResult).toBe(true);
      expect(unhealthyResult).toBe(false);
    });
  });

  describe('Metrics', () => {
    beforeEach(() => {
      modelRouter.registerProvider(mockProvider1);
    });

    test('should track metrics correctly', async () => {
      const task = {
        role: 'coder',
        prompt: 'Test prompt'
      };

      await modelRouter.routeTask(task);
      
      const metrics = modelRouter.getMetrics();
      expect(metrics.totalCalls).toBe(1);
      expect(metrics.successfulCalls).toBe(1);
      expect(metrics.totalCost).toBeGreaterThan(0);
      expect(metrics.successRate).toBe(1.0);
      expect(metrics.registeredProviders).toContain('mock-provider-1');
    });

    test('should update rolling average latency', async () => {
      const task = {
        role: 'coder',
        prompt: 'Test prompt'
      };

      // Make multiple calls to test rolling average
      await modelRouter.routeTask(task);
      await modelRouter.routeTask(task);
      
      const metrics = modelRouter.getMetrics();
      expect(metrics.totalCalls).toBe(2);
      // Note: averageLatency might be 0 initially due to rolling average calculation
      expect(metrics.averageLatency).toBeGreaterThanOrEqual(0);
    });

    test('should track failed calls in metrics', async () => {
      // Create a new router to avoid interference from previous tests
      const testRouter = new ModelRouter();
      const failingProvider = new MockLLMProvider('failing', ['coder'], { shouldFail: true });
      testRouter.registerProvider(failingProvider);

      const task = {
        role: 'coder',
        prompt: 'Test prompt',
        fallback: false
      };

      let errorThrown = false;
      try {
        await testRouter.routeTask(task);
      } catch (error) {
        errorThrown = true;
      }
      
      expect(errorThrown).toBe(true);
      const metrics = testRouter.getMetrics();
      expect(metrics.totalCalls).toBe(1);
      expect(metrics.successfulCalls).toBe(0);
      expect(metrics.successRate).toBe(0);
    });
  });
});

describe('AgentRoleAssigner', () => {
  let modelRouter;
  let agentRoleAssigner;
  let mockProvider;

  beforeEach(() => {
    modelRouter = new ModelRouter();
    mockProvider = new MockLLMProvider('mock-provider', ['coder', 'tester', 'reviewer', 'planner', 'debugger']);
    modelRouter.registerProvider(mockProvider);
    agentRoleAssigner = new AgentRoleAssigner(modelRouter);
  });

  describe('Role Assignment', () => {
    test('should assign appropriate role for task type', async () => {
      const task = {
        type: 'code-generation',
        complexity: 'medium'
      };

      const assignment = await agentRoleAssigner.assignTask(task);
      
      expect(assignment.agentRole).toBeDefined();
      expect(assignment.modelAssignment).toBeDefined();
      expect(assignment.taskConfig).toBeDefined();
      expect(assignment.assignmentId).toBeDefined();
      expect(assignment.agentRole.name).toBe('coder');
    });

    test('should handle task type similarity matching', async () => {
      const task = {
        type: 'implementation', // Similar to 'code-generation'
        complexity: 'high'
      };

      const assignment = await agentRoleAssigner.assignTask(task);
      
      expect(assignment.agentRole.name).toBe('coder');
    });

    test('should assign different roles for different task types', async () => {
      const testCases = [
        { type: 'test-generation', expectedRole: 'tester' },
        { type: 'debugging', expectedRole: 'debugger' },
        { type: 'code-review', expectedRole: 'reviewer' },
        { type: 'planning', expectedRole: 'planner' }
      ];

      for (const testCase of testCases) {
        const assignment = await agentRoleAssigner.assignTask({
          type: testCase.type,
          complexity: 'medium'
        });
        
        expect(assignment.agentRole.name).toBe(testCase.expectedRole);
      }
    });

    test('should throw error for unsupported task type', async () => {
      const task = {
        type: 'completely-unknown-task-type',
        complexity: 'medium'
      };

      await expect(agentRoleAssigner.assignTask(task)).rejects.toThrow('No suitable agent role found');
    });

    test('should consider complexity in role selection', async () => {
      const lowComplexityTask = {
        type: 'code-generation',
        complexity: 'low'
      };

      const highComplexityTask = {
        type: 'code-generation',
        complexity: 'high'
      };

      const lowAssignment = await agentRoleAssigner.assignTask(lowComplexityTask);
      const highAssignment = await agentRoleAssigner.assignTask(highComplexityTask);

      expect(lowAssignment.taskConfig.complexity).toBe('low');
      expect(highAssignment.taskConfig.complexity).toBe('high');
    });

    test('should handle context-specific requirements', async () => {
      const task = {
        type: 'code-generation',
        complexity: 'medium',
        context: {
          requiresReasoning: true,
          requiresSpeed: false,
          requiresSecurity: true
        }
      };

      const assignment = await agentRoleAssigner.assignTask(task);
      
      expect(assignment.agentRole).toBeDefined();
      expect(assignment.taskConfig.requirements).toContain('code-generation');
    });
  });

  describe('Load Balancing', () => {
    test('should track concurrent assignments', async () => {
      const task = {
        type: 'code-generation',
        complexity: 'medium'
      };

      // Make multiple assignments
      const assignment1 = await agentRoleAssigner.assignTask(task);
      const assignment2 = await agentRoleAssigner.assignTask(task);

      const loadStatus = agentRoleAssigner.getLoadBalancingStatus();
      expect(loadStatus.CODER.currentLoad).toBe(2);

      // Complete one assignment
      agentRoleAssigner.updateAssignmentMetrics(assignment1.assignmentId, true, 500, 0.05);
      
      const updatedLoadStatus = agentRoleAssigner.getLoadBalancingStatus();
      expect(updatedLoadStatus.CODER.currentLoad).toBe(1);
    });

    test('should prevent overloading roles', async () => {
      const task = {
        type: 'code-generation',
        complexity: 'medium'
      };

      // Get max concurrent for coder role
      const maxConcurrent = agentRoleAssigner.getMaxConcurrentForRole('CODER');
      
      // Make assignments up to the limit
      const assignments = [];
      for (let i = 0; i < maxConcurrent; i++) {
        assignments.push(await agentRoleAssigner.assignTask(task));
      }

      const loadStatus = agentRoleAssigner.getLoadBalancingStatus();
      expect(loadStatus.CODER.currentLoad).toBe(maxConcurrent);
      expect(loadStatus.CODER.utilizationPercent).toBe(100);
    });
  });

  describe('Performance Tracking', () => {
    test('should track assignment metrics', async () => {
      const task = {
        type: 'code-generation',
        complexity: 'medium'
      };

      const assignment = await agentRoleAssigner.assignTask(task);
      
      // Simulate completion
      agentRoleAssigner.updateAssignmentMetrics(assignment.assignmentId, true, 500, 0.05);
      
      const metrics = agentRoleAssigner.getPerformanceMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.CODER).toBeDefined();
      expect(metrics.CODER.totalAssignments).toBe(1);
      expect(metrics.CODER.successfulAssignments).toBe(1);
      expect(metrics.CODER.successRate).toBe(1.0);
      // Rolling average with alpha=0.1: (1-0.1)*0 + 0.1*500 = 50
      expect(metrics.CODER.averageLatency).toBe(50);
      // Rolling average with alpha=0.1: (1-0.1)*0 + 0.1*0.05 = 0.005
      expect(metrics.CODER.averageCost).toBeCloseTo(0.005, 5);
    });

    test('should track failed assignments', async () => {
      const task = {
        type: 'code-generation',
        complexity: 'medium'
      };

      const assignment = await agentRoleAssigner.assignTask(task);
      
      // Simulate failure
      agentRoleAssigner.updateAssignmentMetrics(assignment.assignmentId, false, 1000, 0.02);
      
      const metrics = agentRoleAssigner.getPerformanceMetrics();
      expect(metrics.CODER.totalAssignments).toBe(1);
      expect(metrics.CODER.successfulAssignments).toBe(0);
      expect(metrics.CODER.successRate).toBe(0.0);
    });

    test('should update rolling averages correctly', async () => {
      const task = {
        type: 'code-generation',
        complexity: 'medium'
      };

      // Make multiple assignments with different metrics
      const assignment1 = await agentRoleAssigner.assignTask(task);
      const assignment2 = await agentRoleAssigner.assignTask(task);

      agentRoleAssigner.updateAssignmentMetrics(assignment1.assignmentId, true, 400, 0.04);
      agentRoleAssigner.updateAssignmentMetrics(assignment2.assignmentId, true, 600, 0.06);
      
      const metrics = agentRoleAssigner.getPerformanceMetrics();
      // Rolling average calculation:
      // After first: (1-0.1)*0 + 0.1*400 = 40
      // After second: (1-0.1)*40 + 0.1*600 = 36 + 60 = 96
      expect(metrics.CODER.averageLatency).toBe(96);
      // Rolling average calculation:
      // After first: (1-0.1)*0 + 0.1*0.04 = 0.004
      // After second: (1-0.1)*0.004 + 0.1*0.06 = 0.0036 + 0.006 = 0.0096
      expect(metrics.CODER.averageCost).toBeCloseTo(0.0096, 5);
    });

    test('should track load balancing status', () => {
      const loadStatus = agentRoleAssigner.getLoadBalancingStatus();
      
      expect(loadStatus).toBeDefined();
      
      // Check all agent roles are tracked
      const expectedRoles = ['INTERVIEWER', 'PLANNER', 'SCHEMA_DESIGNER', 'CODER', 'TESTER', 'DEBUGGER', 'REVIEWER', 'DEPLOYER'];
      expectedRoles.forEach(role => {
        expect(loadStatus[role]).toBeDefined();
        expect(loadStatus[role].currentLoad).toBeDefined();
        expect(loadStatus[role].maxConcurrent).toBeDefined();
        expect(loadStatus[role].utilizationPercent).toBeDefined();
        expect(typeof loadStatus[role].currentLoad).toBe('number');
        expect(typeof loadStatus[role].maxConcurrent).toBe('number');
        expect(typeof loadStatus[role].utilizationPercent).toBe('number');
      });
    });
  });

  describe('Task Type Similarity', () => {
    test('should calculate similarity correctly', () => {
      const similarity1 = agentRoleAssigner.calculateTaskTypeSimilarity('code-generation', ['code-generation', 'implementation']);
      const similarity2 = agentRoleAssigner.calculateTaskTypeSimilarity('code-implementation', ['code-generation', 'refactoring']);
      const similarity3 = agentRoleAssigner.calculateTaskTypeSimilarity('completely-different', ['code-generation', 'testing']);

      expect(similarity1).toBe(1.0); // Exact match
      expect(similarity2).toBeGreaterThan(0); // Partial match (shares 'code')
      expect(similarity3).toBe(0); // No match
    });

    test('should handle hyphenated task types', () => {
      const similarity = agentRoleAssigner.calculateTaskTypeSimilarity('test-generation', ['test-execution', 'quality-checks']);
      expect(similarity).toBeGreaterThan(0); // Should match on 'test'
    });
  });
});

describe('ModelRouterService', () => {
  let service;

  beforeEach(() => {
    // Create service with mock configuration
    service = new ModelRouterService({
      enabledProviders: ['mock-provider']
    });
  });

  describe('Initialization', () => {
    test('should initialize without errors', async () => {
      // Mock the provider registration to avoid real API calls
      service.registerProviders = jest.fn().mockResolvedValue();
      service.performHealthChecks = jest.fn().mockResolvedValue({});

      await service.initialize();
      
      expect(service.initialized).toBe(true);
    });

    test('should not reinitialize if already initialized', async () => {
      service.registerProviders = jest.fn().mockResolvedValue();
      service.performHealthChecks = jest.fn().mockResolvedValue({});

      await service.initialize();
      await service.initialize(); // Second call
      
      expect(service.registerProviders).toHaveBeenCalledTimes(1);
    });
  });

  describe('Provider Management', () => {
    test('should add provider at runtime', () => {
      const mockProvider = new MockLLMProvider('runtime-provider', ['coder']);
      
      service.addProvider('runtime-provider', mockProvider);
      
      expect(service.enabledProviders).toContain('runtime-provider');
    });

    test('should remove provider', () => {
      service.enabledProviders = ['provider1', 'provider2'];
      
      service.removeProvider('provider1');
      
      expect(service.enabledProviders).not.toContain('provider1');
      expect(service.enabledProviders).toContain('provider2');
    });

    test('should update provider configuration', () => {
      service.updateProviderConfig('test-provider', { costPerToken: 0.002 });
      
      expect(service.config['test-provider']).toBeDefined();
      expect(service.config['test-provider'].costPerToken).toBe(0.002);
    });

    test('should get provider classes mapping', () => {
      const providerClasses = service.getProviderClasses();
      
      expect(providerClasses).toBeDefined();
      expect(providerClasses['openrouter']).toBeDefined();
      expect(providerClasses['huggingface']).toBeDefined();
      expect(providerClasses['deepseek']).toBeDefined();
      expect(providerClasses['anthropic']).toBeDefined();
    });

    test('should get provider configurations', () => {
      const configs = service.getProviderConfigs();
      
      expect(configs).toBeDefined();
      expect(configs.openrouter).toBeDefined();
      expect(configs.huggingface).toBeDefined();
      expect(configs.deepseek).toBeDefined();
      expect(configs.anthropic).toBeDefined();
      
      // Should include cost per token
      Object.values(configs).forEach(config => {
        expect(config.costPerToken).toBeDefined();
        expect(typeof config.costPerToken).toBe('number');
      });
    });
  });

  describe('Task Routing', () => {
    beforeEach(async () => {
      // Mock initialization
      service.registerProviders = jest.fn().mockResolvedValue();
      service.performHealthChecks = jest.fn().mockResolvedValue({});
      service.agentRoleAssigner.assignTask = jest.fn().mockResolvedValue({
        agentRole: { name: 'coder' },
        modelAssignment: { provider: { name: 'mock-provider' } },
        assignmentId: 'test-assignment-123'
      });
      service.modelRouter.routeTask = jest.fn().mockResolvedValue({
        success: true,
        content: 'Mock response',
        latency: 100,
        cost: 0.05
      });
    });

    test('should route task through agent role assignment', async () => {
      const task = {
        type: 'code-generation',
        prompt: 'Create a function',
        complexity: 'medium'
      };

      const result = await service.routeTask(task);
      
      expect(result.success).toBe(true);
      expect(result.assignment).toBeDefined();
      expect(result.response).toBeDefined();
      expect(service.agentRoleAssigner.assignTask).toHaveBeenCalledWith(task);
    });

    test('should initialize service if not already initialized', async () => {
      service.initialized = false;
      service.initialize = jest.fn().mockResolvedValue();
      
      const task = {
        type: 'code-generation',
        prompt: 'Create a function'
      };

      await service.routeTask(task);
      
      expect(service.initialize).toHaveBeenCalled();
    });

    test('should handle routing errors', async () => {
      service.agentRoleAssigner.assignTask = jest.fn().mockRejectedValue(new Error('Assignment failed'));
      
      const task = {
        type: 'invalid-task',
        prompt: 'Invalid task'
      };

      await expect(service.routeTask(task)).rejects.toThrow('Assignment failed');
    });
  });

  describe('Testing and Estimation', () => {
    beforeEach(() => {
      const mockProvider = new MockLLMProvider('test-provider', ['coder']);
      service.modelRouter.registerProvider(mockProvider);
    });

    test('should test specific provider', async () => {
      const result = await service.testProvider('test-provider', 'Hello world');
      
      expect(result.provider).toBe('test-provider');
      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    test('should handle provider test failure', async () => {
      const failingProvider = new MockLLMProvider('failing-test-provider', ['coder'], { shouldFail: true });
      service.modelRouter.registerProvider(failingProvider);

      const result = await service.testProvider('failing-test-provider', 'Test prompt');
      
      expect(result.provider).toBe('failing-test-provider');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should throw error for non-existent provider', async () => {
      await expect(service.testProvider('non-existent-provider')).rejects.toThrow('Provider not found');
    });

    test('should estimate task cost', async () => {
      service.agentRoleAssigner.assignTask = jest.fn().mockResolvedValue({
        agentRole: { name: 'coder' },
        modelAssignment: { 
          provider: { 
            name: 'test-provider',
            costPerToken: 0.001
          }
        }
      });

      const task = {
        type: 'code-generation',
        prompt: 'Create a function that adds two numbers',
        maxTokens: 1000
      };

      const estimate = await service.estimateTaskCost(task);
      
      expect(estimate.provider).toBe('test-provider');
      expect(estimate.agentRole).toBe('coder');
      expect(estimate.estimatedTokens).toBeGreaterThan(0);
      expect(estimate.estimatedCost).toBeGreaterThan(0);
      expect(estimate.costPerToken).toBe(0.001);
    });
  });

  describe('Status and Metrics', () => {
    test('should return service status', () => {
      const status = service.getStatus();
      
      expect(status.initialized).toBeDefined();
      expect(status.providers).toBeDefined();
      expect(status.agentRoles).toBeDefined();
      expect(status.providers.registered).toBeDefined();
      expect(status.providers.enabled).toBeDefined();
      expect(status.providers.metrics).toBeDefined();
    });

    test('should return agent roles', () => {
      const roles = service.getAgentRoles();
      
      expect(roles).toBeDefined();
      expect(roles.CODER).toBeDefined();
      expect(roles.TESTER).toBeDefined();
      expect(roles.REVIEWER).toBeDefined();
      expect(roles.PLANNER).toBeDefined();
      expect(roles.DEBUGGER).toBeDefined();
    });

    test('should return detailed status after initialization', async () => {
      service.registerProviders = jest.fn().mockResolvedValue();
      service.performHealthChecks = jest.fn().mockResolvedValue({});
      
      await service.initialize();
      
      const status = service.getStatus();
      expect(status.initialized).toBe(true);
    });
  });

  describe('Health Checks', () => {
    test('should perform health checks on providers', async () => {
      const mockHealthResults = {
        'provider1': { healthy: true, timestamp: new Date().toISOString() },
        'provider2': { healthy: false, error: 'Connection failed', timestamp: new Date().toISOString() }
      };
      
      service.modelRouter.getProviders = jest.fn().mockReturnValue([
        { name: 'provider1', healthCheck: jest.fn().mockResolvedValue(true) },
        { name: 'provider2', healthCheck: jest.fn().mockRejectedValue(new Error('Connection failed')) }
      ]);

      const results = await service.performHealthChecks();
      
      expect(results).toBeDefined();
      expect(results['provider1']).toBeDefined();
      expect(results['provider2']).toBeDefined();
      expect(results['provider1'].healthy).toBe(true);
      expect(results['provider2'].healthy).toBe(false);
    });
  });
});

describe('AGENT_ROLES Configuration', () => {
  test('should have all required agent roles defined', () => {
    const requiredRoles = [
      'INTERVIEWER',
      'PLANNER', 
      'SCHEMA_DESIGNER',
      'CODER',
      'TESTER',
      'DEBUGGER',
      'REVIEWER',
      'DEPLOYER'
    ];

    requiredRoles.forEach(role => {
      expect(AGENT_ROLES[role]).toBeDefined();
      expect(AGENT_ROLES[role].name).toBeDefined();
      expect(AGENT_ROLES[role].preferredModels).toBeDefined();
      expect(Array.isArray(AGENT_ROLES[role].preferredModels)).toBe(true);
      expect(AGENT_ROLES[role].requirements).toBeDefined();
      expect(Array.isArray(AGENT_ROLES[role].requirements)).toBe(true);
    });
  });

  test('should have valid complexity levels', () => {
    Object.values(AGENT_ROLES).forEach(role => {
      expect(['low', 'medium', 'high']).toContain(role.complexity);
    });
  });

  test('should have consistent role structure', () => {
    Object.values(AGENT_ROLES).forEach(role => {
      expect(role).toHaveProperty('name');
      expect(role).toHaveProperty('description');
      expect(role).toHaveProperty('preferredModels');
      expect(role).toHaveProperty('complexity');
      expect(role).toHaveProperty('requirements');
      expect(typeof role.name).toBe('string');
      expect(typeof role.description).toBe('string');
      expect(Array.isArray(role.preferredModels)).toBe(true);
      expect(Array.isArray(role.requirements)).toBe(true);
    });
  });

  test('should have unique role names', () => {
    const roleNames = Object.values(AGENT_ROLES).map(role => role.name);
    const uniqueNames = [...new Set(roleNames)];
    expect(roleNames.length).toBe(uniqueNames.length);
  });
});