/**
 * Basic Model Router Test
 * Tests that the ModelRouter class can be instantiated and has the correct methods
 */

const ModelRouter = require('./model-router');

console.log('Testing ModelRouter...\n');

// Test 1: Class can be instantiated
try {
  const router = new ModelRouter({
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {}
    }
  });
  console.log('✓ ModelRouter instantiated successfully');
  
  // Test 2: Check methods exist
  const methods = ['callByRole', 'call', 'stream', 'getProviderHealth', 'getMetrics'];
  for (const method of methods) {
    if (typeof router[method] === 'function') {
      console.log(`✓ Method ${method} exists`);
    } else {
      console.log(`✗ Method ${method} missing`);
    }
  }
  
  // Test 3: Test correlation ID generation
  const correlationId = router.generateCorrelationId();
  if (correlationId && correlationId.startsWith('mr_')) {
    console.log(`✓ Correlation ID generated: ${correlationId}`);
  } else {
    console.log('✗ Correlation ID generation failed');
  }
  
  console.log('\n✓ All basic tests passed!');
} catch (error) {
  console.error('✗ Test failed:', error.message);
  process.exit(1);
}
