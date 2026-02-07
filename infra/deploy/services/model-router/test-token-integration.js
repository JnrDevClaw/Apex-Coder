/**
 * Token Tracker Integration Test
 * 
 * Test token tracking integration with ModelRouter
 */

const ModelRouter = require('./model-router');
const { TokenTracker } = require('./token-tracker');
const providerRegistry = require('./provider-registry');

console.log('Testing Token Tracker Integration with ModelRouter...\n');

// Create a mock provider for testing
class MockProvider {
  constructor(name) {
    this.name = name;
    this.rateLimiter = {
      schedule: async (fn) => fn()
    };
    this.retries = 2;
  }

  async call(model, messages, options) {
    return {
      content: 'Mock response',
      tokens: {
        input: 1000,
        output: 500,
        total: 1500
      }
    };
  }

  calculateCost(inputTokens, outputTokens, model) {
    return (inputTokens * 0.0001 + outputTokens * 0.0002) / 1000000;
  }

  isRetryableError(error) {
    return false;
  }
}

// Create mock config
const mockConfig = {
  getRoleMapping: (role) => {
    if (role === 'test-role') {
      return {
        primary: {
          provider: 'mock-provider',
          model: 'mock-model'
        }
      };
    }
    return null;
  }
};

// Register mock provider
const mockProvider = new MockProvider('mock-provider');
providerRegistry.registerProvider('mock-provider', mockProvider);

// Create token tracker
const tokenTracker = new TokenTracker();

// Create router with token tracker
const router = new ModelRouter({
  registry: providerRegistry,
  config: mockConfig,
  tokenTracker,
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {}
  }
});

// Test 1: Token tracking on successful call
console.log('Test 1: Token tracking on successful call by role');
(async () => {
  try {
    const response = await router.callByRole('test-role', [
      { role: 'user', content: 'Test message' }
    ], {
      projectId: 'test-project',
      userId: 'test-user'
    });

    console.log('Response received:', {
      content: response.content.substring(0, 20) + '...',
      tokens: response.tokens,
      provider: response.provider,
      model: response.model
    });

    // Check token tracker
    const tokens = tokenTracker.getTokens();
    console.log('Token tracker total:', tokens.total);

    if (tokens.total.calls !== 1) {
      throw new Error(`Expected 1 call, got ${tokens.total.calls}`);
    }
    if (tokens.total.inputTokens !== 1000) {
      throw new Error(`Expected 1000 input tokens, got ${tokens.total.inputTokens}`);
    }
    if (tokens.total.outputTokens !== 500) {
      throw new Error(`Expected 500 output tokens, got ${tokens.total.outputTokens}`);
    }

    console.log('✓ Token tracking on successful call works\n');
  } catch (error) {
    console.error('✗ Test 1 failed:', error.message);
    process.exit(1);
  }

  // Test 2: Token tracking on direct call
  console.log('Test 2: Token tracking on direct call');
  try {
    const response = await router.call('mock-provider', 'mock-model', [
      { role: 'user', content: 'Test message 2' }
    ], {
      projectId: 'test-project-2',
      userId: 'test-user',
      role: 'test-role-2'
    });

    console.log('Response received:', {
      content: response.content.substring(0, 20) + '...',
      tokens: response.tokens
    });

    // Check token tracker
    const tokens = tokenTracker.getTokens();
    console.log('Token tracker total:', tokens.total);

    if (tokens.total.calls !== 2) {
      throw new Error(`Expected 2 calls, got ${tokens.total.calls}`);
    }
    if (tokens.total.inputTokens !== 2000) {
      throw new Error(`Expected 2000 input tokens, got ${tokens.total.inputTokens}`);
    }
    if (tokens.total.outputTokens !== 1000) {
      throw new Error(`Expected 1000 output tokens, got ${tokens.total.outputTokens}`);
    }

    console.log('✓ Token tracking on direct call works\n');
  } catch (error) {
    console.error('✗ Test 2 failed:', error.message);
    process.exit(1);
  }

  // Test 3: Token aggregation by project
  console.log('Test 3: Token aggregation by project');
  try {
    const byProject = tokenTracker.getTokens({ groupBy: 'project' });
    console.log('Tokens by project:', JSON.stringify(byProject.breakdown, null, 2));

    if (!byProject.breakdown['test-project']) {
      throw new Error('Missing test-project');
    }
    if (byProject.breakdown['test-project'].inputTokens !== 1000) {
      throw new Error(`Expected 1000 input tokens for test-project, got ${byProject.breakdown['test-project'].inputTokens}`);
    }

    if (!byProject.breakdown['test-project-2']) {
      throw new Error('Missing test-project-2');
    }
    if (byProject.breakdown['test-project-2'].inputTokens !== 1000) {
      throw new Error(`Expected 1000 input tokens for test-project-2, got ${byProject.breakdown['test-project-2'].inputTokens}`);
    }

    console.log('✓ Token aggregation by project works\n');
  } catch (error) {
    console.error('✗ Test 3 failed:', error.message);
    process.exit(1);
  }

  // Test 4: Token aggregation by role
  console.log('Test 4: Token aggregation by role');
  try {
    const byRole = tokenTracker.getTokens({ groupBy: 'role' });
    console.log('Tokens by role:', JSON.stringify(byRole.breakdown, null, 2));

    if (!byRole.breakdown['test-role']) {
      throw new Error('Missing test-role');
    }
    if (byRole.breakdown['test-role'].calls !== 1) {
      throw new Error(`Expected 1 call for test-role, got ${byRole.breakdown['test-role'].calls}`);
    }

    if (!byRole.breakdown['test-role-2']) {
      throw new Error('Missing test-role-2');
    }
    if (byRole.breakdown['test-role-2'].calls !== 1) {
      throw new Error(`Expected 1 call for test-role-2, got ${byRole.breakdown['test-role-2'].calls}`);
    }

    console.log('✓ Token aggregation by role works\n');
  } catch (error) {
    console.error('✗ Test 4 failed:', error.message);
    process.exit(1);
  }

  // Test 5: Token aggregation by provider
  console.log('Test 5: Token aggregation by provider');
  try {
    const byProvider = tokenTracker.getTokens({ groupBy: 'provider' });
    console.log('Tokens by provider:', JSON.stringify(byProvider.breakdown, null, 2));

    if (!byProvider.breakdown['mock-provider']) {
      throw new Error('Missing mock-provider');
    }
    if (byProvider.breakdown['mock-provider'].calls !== 2) {
      throw new Error(`Expected 2 calls for mock-provider, got ${byProvider.breakdown['mock-provider'].calls}`);
    }
    if (byProvider.breakdown['mock-provider'].totalTokens !== 3000) {
      throw new Error(`Expected 3000 total tokens for mock-provider, got ${byProvider.breakdown['mock-provider'].totalTokens}`);
    }

    console.log('✓ Token aggregation by provider works\n');
  } catch (error) {
    console.error('✗ Test 5 failed:', error.message);
    process.exit(1);
  }

  // Test 6: Get metrics from router
  console.log('Test 6: Getting metrics from router');
  try {
    const metrics = router.getMetrics();
    console.log('Router metrics:', JSON.stringify({
      tokens: metrics.tokens?.total
    }, null, 2));

    if (!metrics.tokens) {
      throw new Error('Missing tokens in metrics');
    }
    if (metrics.tokens.total.calls !== 2) {
      throw new Error(`Expected 2 calls in metrics, got ${metrics.tokens.total.calls}`);
    }

    console.log('✓ Getting metrics from router works\n');
  } catch (error) {
    console.error('✗ Test 6 failed:', error.message);
    process.exit(1);
  }

  console.log('✅ All token tracker integration tests passed!');
})();
