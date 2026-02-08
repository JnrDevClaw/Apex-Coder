/**
 * Fallback Strategy Test
 * 
 * Tests the fallback logic implementation for the Model Router.
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
 */

const ModelRouter = require('./model-router');
const HealthMonitor = require('./health-monitor');
const { FallbackExhaustedError } = require('./errors');

// Mock provider registry
const mockRegistry = {
  providers: new Map(),
  
  getProvider(name) {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider ${name} not found`);
    }
    return provider;
  },
  
  registerProvider(name, provider) {
    this.providers.set(name, provider);
  },
  
  listProviders() {
    return Array.from(this.providers.keys());
  }
};

// Mock config
const mockConfig = {
  getRoleMapping(role) {
    const mappings = {
      'test-role': {
        primary: { provider: 'primary-provider', model: 'primary-model' },
        fallbacks: [
          { provider: 'fallback-1', model: 'fallback-model-1' },
          { provider: 'fallback-2', model: 'fallback-model-2' }
        ]
      },
      'no-fallback-role': {
        primary: { provider: 'primary-provider', model: 'primary-model' }
      }
    };
    return mappings[role];
  }
};

// Create mock providers
function createMockProvider(name, shouldFail = false, isConnectionError = false) {
  return {
    name,
    rateLimiter: {
      schedule: async (fn) => fn()
    },
    retries: 2,
    async call(model, messages, options) {
      if (shouldFail) {
        const error = new Error(`${name} failed`);
        if (isConnectionError) {
          error.statusCode = 503;
          error.name = 'ProviderUnavailableError';
        } else {
          error.statusCode = 400;
          error.name = 'InvalidRequestError';
        }
        throw error;
      }
      
      return {
        content: `Response from ${name}`,
        tokens: { input: 10, output: 20, total: 30 },
        metadata: {}
      };
    },
    calculateCost(inputTokens, outputTokens, model) {
      return (inputTokens * 0.001 + outputTokens * 0.002) / 1000;
    },
    isRetryableError(error) {
      return error.statusCode >= 500;
    }
  };
}

// Test logger
const testLogger = {
  logs: [],
  info(...args) {
    this.logs.push({ level: 'info', args });
    console.log('[INFO]', ...args);
  },
  warn(...args) {
    this.logs.push({ level: 'warn', args });
    console.log('[WARN]', ...args);
  },
  error(...args) {
    this.logs.push({ level: 'error', args });
    console.log('[ERROR]', ...args);
  },
  clear() {
    this.logs = [];
  }
};

async function runTests() {
  console.log('=== Fallback Strategy Tests ===\n');

  // Test 1: Primary succeeds, no fallback needed
  console.log('Test 1: Primary provider succeeds');
  try {
    testLogger.clear();
    mockRegistry.providers.clear();
    
    mockRegistry.registerProvider('primary-provider', createMockProvider('primary-provider', false));
    mockRegistry.registerProvider('fallback-1', createMockProvider('fallback-1', false));
    mockRegistry.registerProvider('fallback-2', createMockProvider('fallback-2', false));
    
    const router = new ModelRouter({
      registry: mockRegistry,
      config: mockConfig,
      logger: testLogger
    });
    
    const response = await router.callByRole('test-role', [
      { role: 'user', content: 'Test message' }
    ]);
    
    console.log('✓ Primary provider succeeded');
    console.log('  Response:', response.content);
    console.log('  Provider:', response.provider);
    
    if (response.provider !== 'primary-provider') {
      throw new Error('Expected primary provider to be used');
    }
  } catch (error) {
    console.error('✗ Test 1 failed:', error.message);
  }
  console.log('');

  // Test 2: Primary fails with connection error, fallback succeeds
  console.log('Test 2: Primary fails (connection error), fallback succeeds');
  try {
    testLogger.clear();
    mockRegistry.providers.clear();
    
    mockRegistry.registerProvider('primary-provider', createMockProvider('primary-provider', true, true));
    mockRegistry.registerProvider('fallback-1', createMockProvider('fallback-1', false));
    mockRegistry.registerProvider('fallback-2', createMockProvider('fallback-2', false));
    
    const router = new ModelRouter({
      registry: mockRegistry,
      config: mockConfig,
      logger: testLogger
    });
    
    const response = await router.callByRole('test-role', [
      { role: 'user', content: 'Test message' }
    ]);
    
    console.log('✓ Fallback provider succeeded');
    console.log('  Response:', response.content);
    console.log('  Provider:', response.provider);
    
    if (response.provider !== 'fallback-1') {
      throw new Error('Expected fallback-1 to be used');
    }
    
    // Check that fallback was logged
    const fallbackLogs = testLogger.logs.filter(l => 
      l.args[0] && l.args[0].includes('fallback')
    );
    console.log('  Fallback events logged:', fallbackLogs.length);
  } catch (error) {
    console.error('✗ Test 2 failed:', error.message);
  }
  console.log('');

  // Test 3: Primary fails with model error, no fallback attempted
  console.log('Test 3: Primary fails (model error), no fallback attempted');
  try {
    testLogger.clear();
    mockRegistry.providers.clear();
    
    mockRegistry.registerProvider('primary-provider', createMockProvider('primary-provider', true, false));
    mockRegistry.registerProvider('fallback-1', createMockProvider('fallback-1', false));
    mockRegistry.registerProvider('fallback-2', createMockProvider('fallback-2', false));
    
    const router = new ModelRouter({
      registry: mockRegistry,
      config: mockConfig,
      logger: testLogger
    });
    
    try {
      await router.callByRole('test-role', [
        { role: 'user', content: 'Test message' }
      ]);
      console.error('✗ Expected error to be thrown');
    } catch (error) {
      console.log('✓ Error thrown as expected');
      console.log('  Error:', error.message);
      
      // Check that fallback was NOT attempted
      const fallbackLogs = testLogger.logs.filter(l => 
        l.args[0] && typeof l.args[0] === 'string' && l.args[0].includes('Attempting fallback')
      );
      
      if (fallbackLogs.length > 0) {
        throw new Error('Fallback should not be attempted for model errors');
      }
      console.log('  Fallback correctly not attempted for model error');
    }
  } catch (error) {
    console.error('✗ Test 3 failed:', error.message);
  }
  console.log('');

  // Test 4: All providers fail, FallbackExhaustedError thrown
  console.log('Test 4: All providers fail, FallbackExhaustedError thrown');
  try {
    testLogger.clear();
    mockRegistry.providers.clear();
    
    mockRegistry.registerProvider('primary-provider', createMockProvider('primary-provider', true, true));
    mockRegistry.registerProvider('fallback-1', createMockProvider('fallback-1', true, true));
    mockRegistry.registerProvider('fallback-2', createMockProvider('fallback-2', true, true));
    
    const router = new ModelRouter({
      registry: mockRegistry,
      config: mockConfig,
      logger: testLogger
    });
    
    try {
      await router.callByRole('test-role', [
        { role: 'user', content: 'Test message' }
      ]);
      console.error('✗ Expected FallbackExhaustedError to be thrown');
    } catch (error) {
      if (error instanceof FallbackExhaustedError) {
        console.log('✓ FallbackExhaustedError thrown as expected');
        console.log('  Role:', error.role);
        console.log('  Attempted providers:', error.attemptedProviders.length);
        console.log('  Providers:', error.attemptedProviders.map(a => a.provider).join(', '));
        
        if (error.attemptedProviders.length !== 3) {
          throw new Error('Expected 3 attempted providers');
        }
      } else {
        throw new Error(`Expected FallbackExhaustedError, got ${error.constructor.name}`);
      }
    }
  } catch (error) {
    console.error('✗ Test 4 failed:', error.message);
  }
  console.log('');

  // Test 5: First fallback fails, second fallback succeeds
  console.log('Test 5: First fallback fails, second fallback succeeds');
  try {
    testLogger.clear();
    mockRegistry.providers.clear();
    
    mockRegistry.registerProvider('primary-provider', createMockProvider('primary-provider', true, true));
    mockRegistry.registerProvider('fallback-1', createMockProvider('fallback-1', true, true));
    mockRegistry.registerProvider('fallback-2', createMockProvider('fallback-2', false));
    
    const router = new ModelRouter({
      registry: mockRegistry,
      config: mockConfig,
      logger: testLogger
    });
    
    const response = await router.callByRole('test-role', [
      { role: 'user', content: 'Test message' }
    ]);
    
    console.log('✓ Second fallback provider succeeded');
    console.log('  Response:', response.content);
    console.log('  Provider:', response.provider);
    
    if (response.provider !== 'fallback-2') {
      throw new Error('Expected fallback-2 to be used');
    }
  } catch (error) {
    console.error('✗ Test 5 failed:', error.message);
  }
  console.log('');

  // Test 6: Health monitor integration
  console.log('Test 6: Health monitor integration with fallback');
  try {
    testLogger.clear();
    mockRegistry.providers.clear();
    
    const healthMonitor = new HealthMonitor({ logger: testLogger });
    
    mockRegistry.registerProvider('primary-provider', createMockProvider('primary-provider', true, true));
    mockRegistry.registerProvider('fallback-1', createMockProvider('fallback-1', false));
    
    const router = new ModelRouter({
      registry: mockRegistry,
      config: mockConfig,
      logger: testLogger,
      healthMonitor
    });
    
    const response = await router.callByRole('test-role', [
      { role: 'user', content: 'Test message' }
    ]);
    
    console.log('✓ Fallback succeeded with health monitoring');
    
    // Check health status
    const primaryHealth = healthMonitor.getProviderHealth('primary-provider');
    const fallbackHealth = healthMonitor.getProviderHealth('fallback-1');
    
    console.log('  Primary health:', primaryHealth.status);
    console.log('  Fallback health:', fallbackHealth.status);
  } catch (error) {
    console.error('✗ Test 6 failed:', error.message);
  }
  console.log('');

  // Test 7: Automatic recovery monitoring
  console.log('Test 7: Automatic recovery monitoring');
  try {
    const healthMonitor = new HealthMonitor({ 
      logger: testLogger,
      recoveryCheckInterval: 1000 // 1 second for testing
    });
    
    // Mark a provider as unhealthy
    healthMonitor.markProviderUnhealthy('test-provider', 'Test');
    
    console.log('✓ Provider marked as unhealthy');
    
    // Start recovery monitoring
    healthMonitor.startRecoveryMonitoring();
    console.log('✓ Recovery monitoring started');
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Stop monitoring
    healthMonitor.stopRecoveryMonitoring();
    console.log('✓ Recovery monitoring stopped');
    
    // Check unhealthy providers
    const unhealthy = healthMonitor.getUnhealthyProviders();
    console.log('  Unhealthy providers:', unhealthy);
  } catch (error) {
    console.error('✗ Test 7 failed:', error.message);
  }
  console.log('');

  console.log('=== All Tests Complete ===');
}

// Run tests
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests };
