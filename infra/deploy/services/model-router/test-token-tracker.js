/**
 * Token Tracker Test Script
 * 
 * Simple test to verify token tracking functionality
 */

const { TokenTracker } = require('./token-tracker');

console.log('Testing Token Tracker...\n');

// Create a new token tracker instance
const tracker = new TokenTracker();

// Test 1: Record tokens
console.log('Test 1: Recording token usage');
try {
  tracker.recordTokens({
    inputTokens: 1500,
    outputTokens: 800,
    provider: 'huggingface',
    model: 'OpenHermes-2.5-Mistral-7B',
    role: 'clarifier',
    projectId: 'proj_123',
    userId: 'user_456',
    status: 'success'
  });

  tracker.recordTokens({
    inputTokens: 2000,
    outputTokens: 1200,
    provider: 'zukijourney',
    model: 'gpt-5-mini',
    role: 'normalizer',
    projectId: 'proj_123',
    userId: 'user_456',
    status: 'success'
  });

  tracker.recordTokens({
    inputTokens: 1000,
    outputTokens: 500,
    provider: 'huggingface',
    model: 'OpenHermes-2.5-Mistral-7B',
    role: 'clarifier',
    projectId: 'proj_789',
    userId: 'user_456',
    status: 'success'
  });

  console.log('✓ Successfully recorded 3 token usage records\n');
} catch (error) {
  console.error('✗ Failed to record tokens:', error.message);
  process.exit(1);
}

// Test 2: Get total tokens
console.log('Test 2: Getting total token metrics');
try {
  const totalMetrics = tracker.getTokens();
  console.log('Total metrics:', JSON.stringify(totalMetrics.total, null, 2));
  
  if (totalMetrics.total.calls !== 3) {
    throw new Error(`Expected 3 calls, got ${totalMetrics.total.calls}`);
  }
  if (totalMetrics.total.inputTokens !== 4500) {
    throw new Error(`Expected 4500 input tokens, got ${totalMetrics.total.inputTokens}`);
  }
  if (totalMetrics.total.outputTokens !== 2500) {
    throw new Error(`Expected 2500 output tokens, got ${totalMetrics.total.outputTokens}`);
  }
  if (totalMetrics.total.totalTokens !== 7000) {
    throw new Error(`Expected 7000 total tokens, got ${totalMetrics.total.totalTokens}`);
  }
  
  console.log('✓ Total metrics are correct\n');
} catch (error) {
  console.error('✗ Failed to get total metrics:', error.message);
  process.exit(1);
}

// Test 3: Get tokens by provider
console.log('Test 3: Getting tokens by provider');
try {
  const byProvider = tracker.getTokens({ groupBy: 'provider' });
  console.log('By provider:', JSON.stringify(byProvider.breakdown, null, 2));
  
  if (!byProvider.breakdown.huggingface) {
    throw new Error('Missing huggingface provider');
  }
  if (byProvider.breakdown.huggingface.calls !== 2) {
    throw new Error(`Expected 2 calls for huggingface, got ${byProvider.breakdown.huggingface.calls}`);
  }
  if (byProvider.breakdown.huggingface.inputTokens !== 2500) {
    throw new Error(`Expected 2500 input tokens for huggingface, got ${byProvider.breakdown.huggingface.inputTokens}`);
  }
  
  console.log('✓ Provider metrics are correct\n');
} catch (error) {
  console.error('✗ Failed to get provider metrics:', error.message);
  process.exit(1);
}

// Test 4: Get tokens by project
console.log('Test 4: Getting tokens by project');
try {
  const byProject = tracker.getTokens({ groupBy: 'project' });
  console.log('By project:', JSON.stringify(byProject.breakdown, null, 2));
  
  if (!byProject.breakdown.proj_123) {
    throw new Error('Missing proj_123');
  }
  if (byProject.breakdown.proj_123.calls !== 2) {
    throw new Error(`Expected 2 calls for proj_123, got ${byProject.breakdown.proj_123.calls}`);
  }
  
  console.log('✓ Project metrics are correct\n');
} catch (error) {
  console.error('✗ Failed to get project metrics:', error.message);
  process.exit(1);
}

// Test 5: Get tokens by role
console.log('Test 5: Getting tokens by role');
try {
  const byRole = tracker.getTokens({ groupBy: 'role' });
  console.log('By role:', JSON.stringify(byRole.breakdown, null, 2));
  
  if (!byRole.breakdown.clarifier) {
    throw new Error('Missing clarifier role');
  }
  if (byRole.breakdown.clarifier.calls !== 2) {
    throw new Error(`Expected 2 calls for clarifier, got ${byRole.breakdown.clarifier.calls}`);
  }
  
  console.log('✓ Role metrics are correct\n');
} catch (error) {
  console.error('✗ Failed to get role metrics:', error.message);
  process.exit(1);
}

// Test 6: Filter by provider
console.log('Test 6: Filtering by provider');
try {
  const filtered = tracker.getTokens({ provider: 'huggingface' });
  console.log('Filtered by huggingface:', JSON.stringify(filtered.total, null, 2));
  
  if (filtered.total.calls !== 2) {
    throw new Error(`Expected 2 calls, got ${filtered.total.calls}`);
  }
  if (filtered.total.inputTokens !== 2500) {
    throw new Error(`Expected 2500 input tokens, got ${filtered.total.inputTokens}`);
  }
  
  console.log('✓ Filtering works correctly\n');
} catch (error) {
  console.error('✗ Failed to filter:', error.message);
  process.exit(1);
}

// Test 7: Get summary
console.log('Test 7: Getting summary statistics');
try {
  const summary = tracker.getSummary();
  console.log('Summary:', JSON.stringify(summary, null, 2));
  
  if (summary.averageInputTokensPerCall !== 1500) {
    throw new Error(`Expected 1500 avg input tokens, got ${summary.averageInputTokensPerCall}`);
  }
  if (summary.averageOutputTokensPerCall < 833 || summary.averageOutputTokensPerCall > 834) {
    throw new Error(`Expected ~833 avg output tokens, got ${summary.averageOutputTokensPerCall}`);
  }
  
  console.log('✓ Summary statistics are correct\n');
} catch (error) {
  console.error('✗ Failed to get summary:', error.message);
  process.exit(1);
}

// Test 8: Get token history
console.log('Test 8: Getting token history');
try {
  const history = tracker.getTokenHistory({}, 10, 0);
  console.log(`Token history: ${history.records.length} records, total: ${history.pagination.total}`);
  
  if (history.records.length !== 3) {
    throw new Error(`Expected 3 records, got ${history.records.length}`);
  }
  if (history.pagination.total !== 3) {
    throw new Error(`Expected total of 3, got ${history.pagination.total}`);
  }
  
  console.log('✓ Token history works correctly\n');
} catch (error) {
  console.error('✗ Failed to get token history:', error.message);
  process.exit(1);
}

// Test 9: Validation
console.log('Test 9: Testing validation');
try {
  // Should throw error for missing inputTokens
  try {
    tracker.recordTokens({
      outputTokens: 100,
      provider: 'test',
      model: 'test'
    });
    throw new Error('Should have thrown error for missing inputTokens');
  } catch (error) {
    if (!error.message.includes('inputTokens')) {
      throw error;
    }
  }

  // Should throw error for missing provider
  try {
    tracker.recordTokens({
      inputTokens: 100,
      outputTokens: 100,
      model: 'test'
    });
    throw new Error('Should have thrown error for missing provider');
  } catch (error) {
    if (!error.message.includes('Provider')) {
      throw error;
    }
  }

  console.log('✓ Validation works correctly\n');
} catch (error) {
  console.error('✗ Validation test failed:', error.message);
  process.exit(1);
}

console.log('✅ All token tracker tests passed!');
