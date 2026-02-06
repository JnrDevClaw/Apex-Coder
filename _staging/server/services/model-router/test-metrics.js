/**
 * Test script for metrics collection
 * Demonstrates metrics collector, logger, and aggregator functionality
 */

const metricsCollector = require('./metrics-collector');
const costTracker = require('./cost-tracker');
const tokenTracker = require('./token-tracker');
const MetricsAggregator = require('./metrics-aggregator');
const logger = require('./logger');

console.log('🧪 Testing Metrics Collection System\n');

// Reset all trackers
metricsCollector.reset();
costTracker.reset();
tokenTracker.reset();

// Create aggregator
const aggregator = new MetricsAggregator(metricsCollector, costTracker, tokenTracker);

// Simulate some AI calls
console.log('📊 Simulating AI calls...\n');

// Call 1: Successful HuggingFace call
const call1 = {
  provider: 'huggingface',
  model: 'OpenHermes-2.5-Mistral-7B',
  role: 'clarifier',
  projectId: 'proj_123',
  userId: 'user_456',
  tokens: { input: 150, output: 80, total: 230 },
  cost: 0.00023,
  latency: 2340,
  status: 'success',
  correlationId: 'test_001'
};

metricsCollector.recordMetric(call1);
costTracker.recordCall(call1);
tokenTracker.recordTokens({
  inputTokens: call1.tokens.input,
  outputTokens: call1.tokens.output,
  provider: call1.provider,
  model: call1.model,
  role: call1.role,
  projectId: call1.projectId,
  userId: call1.userId,
  status: call1.status
});

logger.logAICallComplete({
  correlationId: call1.correlationId,
  provider: call1.provider,
  model: call1.model,
  role: call1.role,
  projectId: call1.projectId,
  tokens: call1.tokens,
  cost: call1.cost,
  latency: call1.latency,
  status: call1.status,
  cached: false
});

// Call 2: Successful Zukijourney call
const call2 = {
  provider: 'zukijourney',
  model: 'gpt-5-mini',
  role: 'normalizer',
  projectId: 'proj_123',
  userId: 'user_456',
  tokens: { input: 200, output: 150, total: 350 },
  cost: 0.00035,
  latency: 1850,
  status: 'success',
  correlationId: 'test_002'
};

metricsCollector.recordMetric(call2);
costTracker.recordCall(call2);
tokenTracker.recordTokens({
  inputTokens: call2.tokens.input,
  outputTokens: call2.tokens.output,
  provider: call2.provider,
  model: call2.model,
  role: call2.role,
  projectId: call2.projectId,
  userId: call2.userId,
  status: call2.status
});

logger.logAICallComplete({
  correlationId: call2.correlationId,
  provider: call2.provider,
  model: call2.model,
  role: call2.role,
  projectId: call2.projectId,
  tokens: call2.tokens,
  cost: call2.cost,
  latency: call2.latency,
  status: call2.status,
  cached: false
});

// Call 3: Failed call
const call3 = {
  provider: 'huggingface',
  model: 'OpenHermes-2.5-Mistral-7B',
  role: 'clarifier',
  projectId: 'proj_456',
  userId: 'user_789',
  tokens: { input: 100, output: 0, total: 100 },
  cost: 0,
  latency: 5000,
  status: 'error',
  error: 'Rate limit exceeded',
  correlationId: 'test_003'
};

metricsCollector.recordMetric(call3);

logger.logAICallFailure({
  correlationId: call3.correlationId,
  provider: call3.provider,
  model: call3.model,
  role: call3.role,
  projectId: call3.projectId,
  error: call3.error,
  errorType: 'RateLimitError',
  statusCode: 429,
  latency: call3.latency
});

// Call 4: Cached call
const call4 = {
  provider: 'zukijourney',
  model: 'gpt-5-mini',
  role: 'normalizer',
  projectId: 'proj_123',
  userId: 'user_456',
  tokens: { input: 200, output: 150, total: 350 },
  cost: 0,
  latency: 50,
  status: 'success',
  cached: true,
  correlationId: 'test_004'
};

metricsCollector.recordMetric(call4);

logger.logCacheHit({
  correlationId: call4.correlationId,
  role: call4.role,
  model: call4.model,
  cacheKey: 'cache_key_123'
});

console.log('✅ Simulated 4 AI calls (3 success, 1 error, 1 cached)\n');

// Test metrics collector
console.log('📈 Metrics Collector Summary:');
const metricsSummary = metricsCollector.getSummary();
console.log(JSON.stringify(metricsSummary, null, 2));
console.log('');

// Test cost tracker
console.log('💰 Cost Tracker Summary:');
const costSummary = costTracker.getSummary();
console.log(JSON.stringify(costSummary, null, 2));
console.log('');

// Test token tracker
console.log('🎫 Token Tracker Summary:');
const tokenSummary = tokenTracker.getSummary();
console.log(JSON.stringify(tokenSummary, null, 2));
console.log('');

// Test aggregator
console.log('🔄 Aggregated Metrics:');
const aggregated = aggregator.getAggregatedMetrics();
console.log(JSON.stringify(aggregated.combined, null, 2));
console.log('');

// Test by provider
console.log('🏢 Metrics by Provider:');
const byProvider = aggregator.getByProvider();
console.log(JSON.stringify(byProvider, null, 2));
console.log('');

// Test by role
console.log('👤 Metrics by Role:');
const byRole = aggregator.getByRole();
console.log(JSON.stringify(byRole, null, 2));
console.log('');

// Test success rate
console.log('✅ Success Rate by Provider:');
const successRates = aggregator.getSuccessRateByProvider();
console.log(JSON.stringify(successRates, null, 2));
console.log('');

// Test average latency
console.log('⏱️  Average Latency by Provider:');
const latencies = aggregator.getAverageLatencyByProvider();
console.log(JSON.stringify(latencies, null, 2));
console.log('');

// Test total cost
console.log('💵 Total Cost by Provider:');
const costs = aggregator.getTotalCostByProvider();
console.log(JSON.stringify(costs, null, 2));
console.log('');

// Test logger redaction
console.log('🔒 Testing Logger Redaction:');
logger.info('Test log with sensitive data', {
  apiKey: 'sk-1234567890abcdef',
  email: 'user@example.com',
  phone: '555-123-4567',
  normalData: 'This should not be redacted'
});
console.log('');

console.log('✅ All tests completed successfully!');
