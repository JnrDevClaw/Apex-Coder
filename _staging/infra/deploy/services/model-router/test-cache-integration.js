/**
 * Cache Integration Test
 * Test cache integration with Model Router
 */

const ModelRouter = require('./model-router');
const CacheManager = require('./cache-manager');
const providerRegistry = require('./provider-registry');
const config = require('../../config/model-router-config');

// Mock provider for testing
class MockProvider {
  constructor(name) {
    this.name = name;
    this.callCount = 0;
    this.rateLimiter = {
      schedule: async (fn) => fn()
    };
  }

  async call(model, messages, options) {
    this.callCount++;
    return {
      content: `Mock response from ${this.name} (call #${this.callCount})`,
      tokens: { input: 10, output: 20, total: 30 },
      metadata: { model }
    };
  }

  calculateCost(inputTokens, outputTokens, model) {
    return 0.0001;
  }

  isRetryableError(error) {
    return false;
  }
}

async function testCacheIntegration() {
  console.log('Testing Cache Integration with Model Router...\n');

  // Create mock provider
  const mockProvider = new MockProvider('mock-provider');
  
  // Register mock provider
  providerRegistry.registerProvider('mock-provider', mockProvider);

  // Create cache manager
  const cacheManager = new CacheManager({
    ttl: 5000, // 5 seconds
    logger: {
      debug: () => {},
      info: (msg, data) => console.log(`  ${msg}`),
      error: (msg, data) => console.error(`  ERROR: ${msg}`, data)
    }
  });

  // Create router with cache
  const router = new ModelRouter({
    registry: providerRegistry,
    config,
    cacheManager,
    logger: {
      info: (msg, data) => console.log(`  ${msg}`),
      warn: (msg, data) => console.log(`  WARN: ${msg}`),
      error: (msg, data) => console.error(`  ERROR: ${msg}`, data)
    }
  });

  const messages = [
    { role: 'user', content: 'Hello, test message!' }
  ];

  // Test 1: First call should miss cache and call provider
  console.log('Test 1: First call (cache miss)');
  const response1 = await router.call('mock-provider', 'test-model', messages, {
    projectId: 'test-project',
    useCache: true
  });
  console.log(`✓ Response: ${response1.content}`);
  console.log(`  Provider call count: ${mockProvider.callCount}`);
  console.log(`  Cached: ${response1.cached}`);
  const stats1 = cacheManager.getStats();
  console.log(`  Cache stats: ${stats1.hits} hits, ${stats1.misses} misses\n`);

  // Test 2: Second call with same messages should hit cache
  console.log('Test 2: Second call with same messages (cache hit)');
  const response2 = await router.call('mock-provider', 'test-model', messages, {
    projectId: 'test-project',
    useCache: true
  });
  console.log(`✓ Response: ${response2.content}`);
  console.log(`  Provider call count: ${mockProvider.callCount} (should be same as before)`);
  console.log(`  Cached: ${response2.cached}`);
  const stats2 = cacheManager.getStats();
  console.log(`  Cache stats: ${stats2.hits} hits, ${stats2.misses} misses\n`);

  // Test 3: Call with different messages should miss cache
  console.log('Test 3: Call with different messages (cache miss)');
  const differentMessages = [
    { role: 'user', content: 'Different message!' }
  ];
  const response3 = await router.call('mock-provider', 'test-model', differentMessages, {
    projectId: 'test-project',
    useCache: true
  });
  console.log(`✓ Response: ${response3.content}`);
  console.log(`  Provider call count: ${mockProvider.callCount}`);
  console.log(`  Cached: ${response3.cached}`);
  const stats3 = cacheManager.getStats();
  console.log(`  Cache stats: ${stats3.hits} hits, ${stats3.misses} misses\n`);

  // Test 4: Disable cache for a call
  console.log('Test 4: Call with cache disabled');
  const response4 = await router.call('mock-provider', 'test-model', messages, {
    projectId: 'test-project',
    useCache: false
  });
  console.log(`✓ Response: ${response4.content}`);
  console.log(`  Provider call count: ${mockProvider.callCount} (should increment)`);
  console.log(`  Cached: ${response4.cached}`);
  const stats4 = cacheManager.getStats();
  console.log(`  Cache stats: ${stats4.hits} hits, ${stats4.misses} misses (should be same)\n`);

  // Test 5: Cache invalidation
  console.log('Test 5: Cache invalidation');
  const cacheKey = cacheManager.getCacheKey(messages, 'test-model');
  console.log(`  Invalidating cache key: ${cacheKey.substring(0, 16)}...`);
  cacheManager.invalidate(cacheKey);
  const response5 = await router.call('mock-provider', 'test-model', messages, {
    projectId: 'test-project',
    useCache: true
  });
  console.log(`✓ Response: ${response5.content}`);
  console.log(`  Provider call count: ${mockProvider.callCount} (should increment)`);
  console.log(`  Cached: ${response5.cached}\n`);

  // Test 6: Cache with callByRole
  console.log('Test 6: Cache with callByRole');
  
  // Mock role mapping
  const originalGetRoleMapping = config.getRoleMapping;
  config.getRoleMapping = (role) => {
    if (role === 'test-role') {
      return {
        primary: { provider: 'mock-provider', model: 'test-model' },
        fallbacks: []
      };
    }
    return originalGetRoleMapping.call(config, role);
  };

  const roleMessages = [
    { role: 'user', content: 'Role-based test message' }
  ];

  const roleResponse1 = await router.callByRole('test-role', roleMessages, {
    projectId: 'test-project',
    useCache: true
  });
  console.log(`✓ First role call: ${roleResponse1.content}`);
  console.log(`  Provider call count: ${mockProvider.callCount}`);
  console.log(`  Cached: ${roleResponse1.cached}`);

  const roleResponse2 = await router.callByRole('test-role', roleMessages, {
    projectId: 'test-project',
    useCache: true
  });
  console.log(`✓ Second role call: ${roleResponse2.content}`);
  console.log(`  Provider call count: ${mockProvider.callCount} (should be same)`);
  console.log(`  Cached: ${roleResponse2.cached}\n`);

  // Restore original config
  config.getRoleMapping = originalGetRoleMapping;

  // Final statistics
  console.log('Final Cache Statistics:');
  const finalStats = cacheManager.getStats();
  console.log(`  Hits: ${finalStats.hits}`);
  console.log(`  Misses: ${finalStats.misses}`);
  console.log(`  Sets: ${finalStats.sets}`);
  console.log(`  Hit Rate: ${finalStats.hitRate}`);
  console.log(`  Total Provider Calls: ${mockProvider.callCount}\n`);

  // Cleanup
  cacheManager.stopCleanup();

  console.log('✅ All cache integration tests passed!');
}

// Run tests
testCacheIntegration().catch(error => {
  console.error('❌ Test failed:', error);
  console.error(error.stack);
  process.exit(1);
});
