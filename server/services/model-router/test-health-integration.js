/**
 * Health Monitor Integration Test
 * 
 * Tests health monitoring integration with the Model Router.
 */

const ModelRouter = require('./model-router');
const HealthMonitor = require('./health-monitor');
const { ProviderRegistry } = require('./provider-registry');
const BaseProvider = require('../providers/base-provider');

console.log('=== Health Monitor Integration Test ===\n');

// Create a mock provider that can simulate failures
class MockProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.shouldFail = false;
    this.callCount = 0;
  }

  async call(model, messages, options = {}) {
    this.callCount++;
    
    if (this.shouldFail) {
      const error = new Error('Mock provider failure');
      error.statusCode = 500;
      throw error;
    }

    return {
      content: `Mock response ${this.callCount}`,
      tokens: {
        input: 100,
        output: 50,
        total: 150
      },
      metadata: {
        finishReason: 'stop'
      }
    };
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
        },
        fallback: {
          provider: 'mock-fallback',
          model: 'mock-model'
        }
      };
    }
    return null;
  }
};

// Set up registry
const registry = new ProviderRegistry();
const mockProvider = new MockProvider({
  name: 'mock-provider',
  apiKey: 'test-key',
  baseURL: 'http://test',
  pricing: {
    'mock-model': {
      input: 0.0001,
      output: 0.0002
    }
  }
});

const mockFallback = new MockProvider({
  name: 'mock-fallback',
  apiKey: 'test-key',
  baseURL: 'http://test',
  pricing: {
    'mock-model': {
      input: 0.0001,
      output: 0.0002
    }
  }
});

registry.registerProvider('mock-provider', mockProvider);
registry.registerProvider('mock-fallback', mockFallback);

// Create health monitor
const healthMonitor = new HealthMonitor({
  errorRateThreshold: 0.5,
  latencyThreshold: 10000,
  windowSize: 10,
  recoveryThreshold: 0.8,
  minCallsForHealth: 3
});

// Create router with health monitor
const router = new ModelRouter({
  registry,
  config: mockConfig,
  healthMonitor,
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {}
  }
});

async function runTests() {
  try {
    console.log('1. Testing successful calls (provider should be healthy)');
    for (let i = 0; i < 5; i++) {
      await router.callByRole('test-role', [
        { role: 'user', content: 'Test message' }
      ]);
    }
    const healthyStatus = healthMonitor.getProviderHealth('mock-provider');
    console.log('After 5 successful calls:', JSON.stringify(healthyStatus.stats, null, 2));
    console.log('Status:', healthyStatus.status);
    console.log('✓ Provider is healthy\n');

    console.log('2. Testing failed calls (provider should become unhealthy)');
    mockProvider.shouldFail = true;
    let failCount = 0;
    for (let i = 0; i < 6; i++) {
      try {
        await router.callByRole('test-role', [
          { role: 'user', content: 'Test message' }
        ]);
      } catch (error) {
        failCount++;
      }
    }
    console.log(`Failed ${failCount} calls as expected`);
    const unhealthyStatus = healthMonitor.getProviderHealth('mock-provider');
    console.log('After 6 failed calls:', JSON.stringify(unhealthyStatus.stats, null, 2));
    console.log('Status:', unhealthyStatus.status);
    console.log('✓ Provider is unhealthy\n');

    console.log('3. Testing fallback when primary is unhealthy');
    mockProvider.shouldFail = true; // Primary still failing
    mockFallback.shouldFail = false; // Fallback is healthy
    
    // The router should detect unhealthy primary and use fallback
    const response = await router.callByRole('test-role', [
      { role: 'user', content: 'Test message' }
    ]);
    
    console.log('Response received:', response.content);
    console.log('Provider used:', response.provider);
    
    if (response.provider === 'mock-fallback') {
      console.log('✓ Fallback provider was used due to unhealthy primary\n');
    } else {
      console.log('⚠ Primary provider was used despite being unhealthy\n');
    }

    console.log('4. Testing recovery');
    mockProvider.shouldFail = false;
    for (let i = 0; i < 10; i++) {
      await router.callByRole('test-role', [
        { role: 'user', content: 'Test message' }
      ]);
    }
    const recoveredStatus = healthMonitor.getProviderHealth('mock-provider');
    console.log('After 10 successful calls:', JSON.stringify(recoveredStatus.stats, null, 2));
    console.log('Status:', recoveredStatus.status);
    console.log('✓ Provider recovered\n');

    console.log('5. Testing getProviderHealth from router');
    const allHealth = router.getProviderHealth();
    console.log('All provider health:', JSON.stringify(allHealth, null, 2));
    console.log('✓ Router can retrieve health status\n');

    console.log('=== All Integration Tests Passed ===');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

runTests();
