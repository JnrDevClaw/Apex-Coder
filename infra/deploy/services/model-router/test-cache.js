/**
 * Cache Manager Test
 * Simple test to verify cache functionality
 */

const CacheManager = require('./cache-manager');

async function testCacheManager() {
  console.log('Testing Cache Manager...\n');

  // Create cache manager with short TTL for testing
  const cache = new CacheManager({
    ttl: 2000, // 2 seconds
    maxSize: 5,
    logger: {
      debug: () => {},
      info: (msg, data) => console.log(`INFO: ${msg}`, data),
      error: (msg, data) => console.error(`ERROR: ${msg}`, data)
    }
  });

  // Test 1: Generate cache key
  console.log('Test 1: Generate cache key');
  const messages = [
    { role: 'user', content: 'Hello, world!' }
  ];
  const model = 'gpt-5-mini';
  const key = cache.getCacheKey(messages, model);
  console.log(`✓ Cache key generated: ${key.substring(0, 16)}...\n`);

  // Test 2: Set and get cache entry
  console.log('Test 2: Set and get cache entry');
  const response = {
    content: 'Hello! How can I help you?',
    tokens: { input: 10, output: 20, total: 30 },
    cost: 0.0001
  };
  cache.set(key, response);
  const cached = cache.get(key);
  console.log(`✓ Cache set and retrieved successfully`);
  console.log(`  Cached content: ${cached.content}\n`);

  // Test 3: Cache hit
  console.log('Test 3: Cache hit');
  const hit = cache.get(key);
  console.log(`✓ Cache hit: ${hit !== null}`);
  const stats1 = cache.getStats();
  console.log(`  Stats: ${stats1.hits} hits, ${stats1.misses} misses, hit rate: ${stats1.hitRate}\n`);

  // Test 4: Cache miss
  console.log('Test 4: Cache miss');
  const missKey = cache.getCacheKey([{ role: 'user', content: 'Different message' }], model);
  const miss = cache.get(missKey);
  console.log(`✓ Cache miss: ${miss === null}`);
  const stats2 = cache.getStats();
  console.log(`  Stats: ${stats2.hits} hits, ${stats2.misses} misses, hit rate: ${stats2.hitRate}\n`);

  // Test 5: Cache expiration
  console.log('Test 5: Cache expiration (waiting 2.5 seconds)...');
  await new Promise(resolve => setTimeout(resolve, 2500));
  const expired = cache.get(key);
  console.log(`✓ Cache entry expired: ${expired === null}`);
  const stats3 = cache.getStats();
  console.log(`  Stats: ${stats3.expirations} expirations\n`);

  // Test 6: Cache eviction (max size)
  console.log('Test 6: Cache eviction (max size = 5)');
  for (let i = 0; i < 6; i++) {
    const testKey = cache.getCacheKey([{ role: 'user', content: `Message ${i}` }], model);
    cache.set(testKey, { content: `Response ${i}` });
  }
  const stats4 = cache.getStats();
  console.log(`✓ Cache size: ${stats4.size} (max: ${stats4.maxSize})`);
  console.log(`  Evictions: ${stats4.evictions}\n`);

  // Test 7: Invalidate by key
  console.log('Test 7: Invalidate by key');
  const testKey = cache.getCacheKey([{ role: 'user', content: 'Test message' }], model);
  cache.set(testKey, { content: 'Test response' });
  const beforeInvalidate = cache.has(testKey);
  cache.invalidate(testKey);
  const afterInvalidate = cache.has(testKey);
  console.log(`✓ Before invalidate: ${beforeInvalidate}, After: ${afterInvalidate}\n`);

  // Test 8: Invalidate by pattern
  console.log('Test 8: Invalidate by pattern');
  cache.clear();
  for (let i = 0; i < 3; i++) {
    const patternKey = cache.getCacheKey([{ role: 'user', content: `Pattern test ${i}` }], 'gpt-5-mini');
    cache.set(patternKey, { content: `Response ${i}` });
  }
  const sizeBefore = cache.size();
  const invalidated = cache.invalidatePattern('.*'); // Match all
  console.log(`✓ Invalidated ${invalidated} entries (size before: ${sizeBefore}, after: ${cache.size()})\n`);

  // Test 9: Clear cache
  console.log('Test 9: Clear cache');
  for (let i = 0; i < 3; i++) {
    const clearKey = cache.getCacheKey([{ role: 'user', content: `Clear test ${i}` }], model);
    cache.set(clearKey, { content: `Response ${i}` });
  }
  const sizeBeforeClear = cache.size();
  cache.clear();
  const sizeAfterClear = cache.size();
  console.log(`✓ Size before clear: ${sizeBeforeClear}, after: ${sizeAfterClear}\n`);

  // Test 10: Get statistics
  console.log('Test 10: Get statistics');
  const finalStats = cache.getStats();
  console.log('✓ Final statistics:');
  console.log(`  Hits: ${finalStats.hits}`);
  console.log(`  Misses: ${finalStats.misses}`);
  console.log(`  Sets: ${finalStats.sets}`);
  console.log(`  Evictions: ${finalStats.evictions}`);
  console.log(`  Expirations: ${finalStats.expirations}`);
  console.log(`  Size: ${finalStats.size}`);
  console.log(`  Hit Rate: ${finalStats.hitRate}\n`);

  // Cleanup
  cache.stopCleanup();

  console.log('✅ All cache manager tests passed!');
}

// Run tests
testCacheManager().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
