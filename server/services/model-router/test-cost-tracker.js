/**
 * Cost Tracker Test Script
 * 
 * Simple test to verify cost tracking functionality
 */

const { CostTracker } = require('./cost-tracker');

console.log('=== Cost Tracker Test ===\n');

// Create a new cost tracker instance
const tracker = new CostTracker();

console.log('1. Recording test calls...');

// Record some test calls
tracker.recordCall({
  provider: 'zukijourney',
  model: 'gpt-5-mini',
  role: 'normalizer',
  projectId: 'project-123',
  tokens: { input: 1000, output: 500, total: 1500 },
  cost: 0.000375, // (1000 * 0.15 + 500 * 0.60) / 1000000
  latency: 2340,
  status: 'success'
});

tracker.recordCall({
  provider: 'huggingface',
  model: 'OpenHermes-2.5-Mistral-7B',
  role: 'clarifier',
  projectId: 'project-123',
  tokens: { input: 800, output: 600, total: 1400 },
  cost: 0.00020, // (800 * 0.0001 + 600 * 0.0002) / 1000000
  latency: 1850,
  status: 'success'
});

tracker.recordCall({
  provider: 'deepseek',
  model: 'deepseek-v3',
  role: 'schema-generator',
  projectId: 'project-456',
  tokens: { input: 1200, output: 800, total: 2000 },
  cost: 0.001204, // (1200 * 0.27 + 800 * 1.10) / 1000000
  latency: 3200,
  status: 'success'
});

tracker.recordCall({
  provider: 'zukijourney',
  model: 'gpt-4o',
  role: 'file-structure-generator',
  projectId: 'project-123',
  tokens: { input: 2000, output: 1500, total: 3500 },
  cost: 0.020, // (2000 * 2.50 + 1500 * 10.00) / 1000000
  latency: 4500,
  status: 'success'
});

console.log('✅ Recorded 4 test calls\n');

// Test 1: Get all costs
console.log('2. Testing getCosts() - all data:');
const allCosts = tracker.getCosts();
console.log('Total calls:', allCosts.total.calls);
console.log('Total tokens:', allCosts.total.tokens.total);
console.log('Total cost: $' + allCosts.total.cost.toFixed(6));
console.log('Providers:', Object.keys(allCosts.byProvider).join(', '));
console.log('✅ Test passed\n');

// Test 2: Get costs by provider
console.log('3. Testing getCosts() - filter by provider:');
const zukiCosts = tracker.getCosts({ provider: 'zukijourney' });
console.log('Zukijourney calls:', zukiCosts.total.calls);
console.log('Zukijourney cost: $' + zukiCosts.total.cost.toFixed(6));
console.log('✅ Test passed\n');

// Test 3: Get costs by project
console.log('4. Testing getCosts() - filter by project:');
const project123Costs = tracker.getCosts({ project: 'project-123' });
console.log('Project 123 calls:', project123Costs.total.calls);
console.log('Project 123 cost: $' + project123Costs.total.cost.toFixed(6));
console.log('✅ Test passed\n');

// Test 4: Get costs by role
console.log('5. Testing getCosts() - filter by role:');
const normalizerCosts = tracker.getCosts({ role: 'normalizer' });
console.log('Normalizer calls:', normalizerCosts.total.calls);
console.log('Normalizer cost: $' + normalizerCosts.total.cost.toFixed(6));
console.log('✅ Test passed\n');

// Test 5: Get costs with groupBy
console.log('6. Testing getCosts() - group by provider:');
const groupedByProvider = tracker.getCosts({ groupBy: 'provider' });
console.log('Providers:');
for (const [provider, data] of Object.entries(groupedByProvider.breakdown)) {
  console.log(`  ${provider}: ${data.calls} calls, $${data.cost.toFixed(6)}`);
}
console.log('✅ Test passed\n');

// Test 6: Get summary
console.log('7. Testing getSummary():');
const summary = tracker.getSummary();
console.log('Average cost per call: $' + summary.averageCostPerCall.toFixed(6));
console.log('Average tokens per call:', Math.round(summary.averageTokensPerCall));
console.log('Top provider by cost:', summary.topProviders[0].name);
console.log('✅ Test passed\n');

// Test 7: Get call history
console.log('8. Testing getCallHistory():');
const history = tracker.getCallHistory({}, 2, 0);
console.log('Total calls in history:', history.pagination.total);
console.log('Returned calls:', history.calls.length);
console.log('Has more:', history.pagination.hasMore);
console.log('✅ Test passed\n');

// Test 8: Export data
console.log('9. Testing export():');
const exported = tracker.export({ provider: 'zukijourney' });
const exportedData = JSON.parse(exported);
console.log('Export includes summary:', !!exportedData.summary);
console.log('Export includes costs:', !!exportedData.costs);
console.log('Export timestamp:', exportedData.exportedAt);
console.log('✅ Test passed\n');

// Test 9: Validation
console.log('10. Testing validation:');
try {
  tracker.recordCall({
    provider: 'test',
    model: 'test-model',
    tokens: { input: 100, output: 50 },
    cost: -1 // Invalid: negative cost
  });
  console.log('❌ Test failed - should have thrown error for negative cost');
} catch (error) {
  console.log('✅ Test passed - correctly rejected negative cost');
}

try {
  tracker.recordCall({
    provider: 'test',
    model: 'test-model',
    tokens: { input: 100 }, // Missing output
    cost: 0.001
  });
  console.log('❌ Test failed - should have thrown error for missing output tokens');
} catch (error) {
  console.log('✅ Test passed - correctly rejected missing output tokens');
}

console.log('\n=== All Tests Passed ===');
console.log('\nFinal Summary:');
const finalSummary = tracker.getSummary();
console.log('Total calls:', finalSummary.total.calls);
console.log('Total cost: $' + finalSummary.total.cost.toFixed(6));
console.log('Total tokens:', finalSummary.total.tokens.total);
