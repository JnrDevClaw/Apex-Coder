/**
 * Model Router Usage Example
 * 
 * Demonstrates how to use the Model Router service for AI calls.
 */

const { getRouter, createRouter } = require('./index');
const config = require('../../config/model-router-config');

// Initialize configuration
config.initialize();

/**
 * Example 1: Call by role (recommended approach)
 */
async function exampleCallByRole() {
  console.log('\n=== Example 1: Call by Role ===\n');
  
  const router = getRouter();
  
  try {
    const response = await router.callByRole('clarifier', [
      {
        role: 'user',
        content: 'What is the purpose of this application?'
      }
    ], {
      projectId: 'proj_123',
      userId: 'user_456',
      temperature: 0.7,
      maxTokens: 500
    });
    
    console.log('Response:', response.content);
    console.log('Provider:', response.provider);
    console.log('Model:', response.model);
    console.log('Tokens:', response.tokens);
    console.log('Cost:', `$${response.cost.toFixed(6)}`);
    console.log('Latency:', `${response.latency}ms`);
    console.log('Correlation ID:', response.correlationId);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * Example 2: Direct model call
 */
async function exampleDirectCall() {
  console.log('\n=== Example 2: Direct Model Call ===\n');
  
  const router = getRouter();
  
  try {
    const response = await router.call('zukijourney', 'gpt-5-mini', [
      {
        role: 'system',
        content: 'You are a helpful assistant.'
      },
      {
        role: 'user',
        content: 'Explain what a model router does in 2 sentences.'
      }
    ], {
      projectId: 'proj_123',
      temperature: 0.8
    });
    
    console.log('Response:', response.content);
    console.log('Cost:', `$${response.cost.toFixed(6)}`);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * Example 3: Streaming responses
 */
async function exampleStreaming() {
  console.log('\n=== Example 3: Streaming Responses ===\n');
  
  const router = getRouter();
  
  try {
    console.log('Streaming response:');
    
    for await (const chunk of router.stream('normalizer', [
      {
        role: 'user',
        content: 'Count from 1 to 5 slowly.'
      }
    ], {
      projectId: 'proj_123'
    })) {
      if (chunk.done) {
        console.log('\n\nFinal metadata:', chunk.metadata);
      } else {
        process.stdout.write(chunk.content || '');
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * Example 4: Get metrics
 */
async function exampleGetMetrics() {
  console.log('\n=== Example 4: Get Metrics ===\n');
  
  const router = getRouter();
  
  // Make a few calls first
  await router.callByRole('clarifier', [
    { role: 'user', content: 'Test message 1' }
  ], { projectId: 'proj_123' });
  
  await router.callByRole('normalizer', [
    { role: 'user', content: 'Test message 2' }
  ], { projectId: 'proj_123' });
  
  // Get metrics
  const metrics = router.getMetrics({
    projectId: 'proj_123'
  });
  
  console.log('Metrics:', JSON.stringify(metrics, null, 2));
}

/**
 * Example 5: Provider health check
 */
async function exampleHealthCheck() {
  console.log('\n=== Example 5: Provider Health Check ===\n');
  
  const router = getRouter();
  
  const health = router.getProviderHealth();
  
  console.log('Provider Health:', JSON.stringify(health, null, 2));
}

/**
 * Example 6: Using fallback providers
 */
async function exampleFallback() {
  console.log('\n=== Example 6: Fallback Provider ===\n');
  
  const router = getRouter();
  
  try {
    // The clarifier role has a fallback configured
    const response = await router.callByRole('clarifier', [
      {
        role: 'user',
        content: 'This will use fallback if primary fails'
      }
    ], {
      projectId: 'proj_123',
      useFallback: true // Enable fallback (default is true)
    });
    
    console.log('Response received from:', response.provider);
    console.log('Model:', response.model);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * Example 7: Using cache
 */
async function exampleCache() {
  console.log('\n=== Example 7: Response Caching ===\n');
  
  // Create router with cache manager
  const CacheManager = require('./cache-manager'); // Will be implemented in task 18
  const cacheManager = new CacheManager();
  
  const router = createRouter({ cacheManager });
  
  const messages = [
    { role: 'user', content: 'What is 2 + 2?' }
  ];
  
  // First call - not cached
  console.log('First call (not cached):');
  const response1 = await router.callByRole('clarifier', messages, {
    projectId: 'proj_123',
    useCache: true
  });
  console.log('Cached:', response1.cached);
  console.log('Latency:', response1.latency, 'ms');
  
  // Second call - should be cached
  console.log('\nSecond call (should be cached):');
  const response2 = await router.callByRole('clarifier', messages, {
    projectId: 'proj_123',
    useCache: true
  });
  console.log('Cached:', response2.cached);
  console.log('Latency:', response2.latency, 'ms');
}

/**
 * Example 8: Error handling
 */
async function exampleErrorHandling() {
  console.log('\n=== Example 8: Error Handling ===\n');
  
  const router = getRouter();
  
  try {
    // Try to call with invalid role
    await router.callByRole('invalid-role', [
      { role: 'user', content: 'Test' }
    ]);
  } catch (error) {
    console.log('Caught expected error:', error.message);
  }
  
  try {
    // Try to call with invalid provider
    await router.call('invalid-provider', 'some-model', [
      { role: 'user', content: 'Test' }
    ]);
  } catch (error) {
    console.log('Caught expected error:', error.message);
  }
}

// Main function to run examples
async function main() {
  console.log('Model Router Usage Examples');
  console.log('===========================');
  
  // Note: These examples require providers to be properly configured
  // with API keys in environment variables
  
  try {
    // Uncomment the examples you want to run:
    
    // await exampleCallByRole();
    // await exampleDirectCall();
    // await exampleStreaming();
    // await exampleGetMetrics();
    // await exampleHealthCheck();
    // await exampleFallback();
    // await exampleCache(); // Requires cache manager implementation
    await exampleErrorHandling();
    
  } catch (error) {
    console.error('Example failed:', error);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  exampleCallByRole,
  exampleDirectCall,
  exampleStreaming,
  exampleGetMetrics,
  exampleHealthCheck,
  exampleFallback,
  exampleCache,
  exampleErrorHandling
};
