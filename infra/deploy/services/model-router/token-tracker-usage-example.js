/**
 * Token Tracker Usage Examples
 * 
 * Demonstrates how to use the token tracker service
 */

const { getRouter, tokenTracker } = require('./index');

console.log('Token Tracker Usage Examples\n');
console.log('=' .repeat(60));

// Example 1: Basic token tracking (automatic with router)
console.log('\n1. Automatic Token Tracking with Router\n');
console.log('When you use the ModelRouter, token tracking happens automatically:');
console.log(`
const { getRouter } = require('./model-router');
const router = getRouter();

// Make an AI call - tokens are tracked automatically
const response = await router.callByRole('clarifier', messages, {
  projectId: 'my-project',
  userId: 'user-123'
});

console.log('Tokens used:', response.tokens);
// Output: { input: 1500, output: 800, total: 2300 }
`);

// Example 2: Get total token usage
console.log('\n2. Get Total Token Usage\n');
console.log('Get overall token usage across all calls:');
console.log(`
const { tokenTracker } = require('./model-router');

const metrics = tokenTracker.getTokens();
console.log('Total tokens:', metrics.total);
// Output: {
//   calls: 150,
//   inputTokens: 225000,
//   outputTokens: 120000,
//   totalTokens: 345000
// }
`);

// Example 3: Get tokens by provider
console.log('\n3. Get Token Usage by Provider\n');
console.log('See which providers are using the most tokens:');
console.log(`
const byProvider = tokenTracker.getTokens({ groupBy: 'provider' });
console.log('Tokens by provider:', byProvider.breakdown);
// Output: {
//   huggingface: { calls: 50, inputTokens: 75000, outputTokens: 40000, ... },
//   zukijourney: { calls: 100, inputTokens: 150000, outputTokens: 80000, ... }
// }
`);

// Example 4: Get tokens by project
console.log('\n4. Get Token Usage by Project\n');
console.log('Track token usage per project:');
console.log(`
const byProject = tokenTracker.getTokens({ groupBy: 'project' });
console.log('Tokens by project:', byProject.breakdown);
// Output: {
//   'proj_123': { calls: 80, inputTokens: 120000, outputTokens: 64000, ... },
//   'proj_456': { calls: 70, inputTokens: 105000, outputTokens: 56000, ... }
// }
`);

// Example 5: Get tokens by role
console.log('\n5. Get Token Usage by Role\n');
console.log('See which agent roles use the most tokens:');
console.log(`
const byRole = tokenTracker.getTokens({ groupBy: 'role' });
console.log('Tokens by role:', byRole.breakdown);
// Output: {
//   clarifier: { calls: 30, inputTokens: 45000, outputTokens: 24000, ... },
//   normalizer: { calls: 40, inputTokens: 60000, outputTokens: 32000, ... },
//   'code-generator': { calls: 80, inputTokens: 120000, outputTokens: 64000, ... }
// }
`);

// Example 6: Filter tokens by specific criteria
console.log('\n6. Filter Token Usage\n');
console.log('Filter tokens by provider, project, role, or date range:');
console.log(`
// Get tokens for a specific provider
const hfTokens = tokenTracker.getTokens({ provider: 'huggingface' });

// Get tokens for a specific project
const projectTokens = tokenTracker.getTokens({ project: 'proj_123' });

// Get tokens for a specific role
const roleTokens = tokenTracker.getTokens({ role: 'clarifier' });

// Get tokens for a date range
const recentTokens = tokenTracker.getTokens({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31')
});

// Combine filters
const filtered = tokenTracker.getTokens({
  provider: 'huggingface',
  project: 'proj_123',
  startDate: new Date('2025-01-01')
});
`);

// Example 7: Get token summary statistics
console.log('\n7. Get Token Summary Statistics\n');
console.log('Get summary statistics including averages and top consumers:');
console.log(`
const summary = tokenTracker.getSummary();
console.log('Summary:', summary);
// Output: {
//   total: { calls: 150, inputTokens: 225000, outputTokens: 120000, ... },
//   topProviders: [ { name: 'zukijourney', totalTokens: 230000, ... }, ... ],
//   topProjects: [ { name: 'proj_123', totalTokens: 184000, ... }, ... ],
//   topRoles: [ { name: 'code-generator', totalTokens: 184000, ... }, ... ],
//   averageInputTokensPerCall: 1500,
//   averageOutputTokensPerCall: 800,
//   averageTotalTokensPerCall: 2300,
//   inputOutputRatio: 1.875
// }
`);

// Example 8: Get token history
console.log('\n8. Get Token Usage History\n');
console.log('Get detailed history of token usage with pagination:');
console.log(`
const history = tokenTracker.getTokenHistory(
  { provider: 'huggingface' },  // filters
  50,                            // limit
  0                              // offset
);

console.log('History:', history);
// Output: {
//   records: [
//     {
//       inputTokens: 1500,
//       outputTokens: 800,
//       totalTokens: 2300,
//       provider: 'huggingface',
//       model: 'OpenHermes-2.5-Mistral-7B',
//       role: 'clarifier',
//       projectId: 'proj_123',
//       timestamp: '2025-01-15T10:30:00Z'
//     },
//     ...
//   ],
//   pagination: {
//     total: 150,
//     limit: 50,
//     offset: 0,
//     hasMore: true
//   }
// }
`);

// Example 9: Get tokens by time period
console.log('\n9. Get Token Usage by Time Period\n');
console.log('Analyze token usage trends over time:');
console.log(`
// Get tokens by day
const byDay = tokenTracker.getTokensByTimePeriod('day', {
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31')
});

// Get tokens by hour
const byHour = tokenTracker.getTokensByTimePeriod('hour', {
  provider: 'huggingface'
});

// Get tokens by week
const byWeek = tokenTracker.getTokensByTimePeriod('week');

// Get tokens by month
const byMonth = tokenTracker.getTokensByTimePeriod('month');

console.log('Tokens by day:', byDay);
// Output: [
//   { period: '2025-01-01', calls: 10, inputTokens: 15000, outputTokens: 8000, ... },
//   { period: '2025-01-02', calls: 12, inputTokens: 18000, outputTokens: 9600, ... },
//   ...
// ]
`);

// Example 10: Export token data
console.log('\n10. Export Token Data\n');
console.log('Export token data as JSON for reporting:');
console.log(`
const jsonData = tokenTracker.export({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31')
});

// Save to file
const fs = require('fs');
fs.writeFileSync('token-report.json', jsonData);
`);

// Example 11: Manual token recording (advanced)
console.log('\n11. Manual Token Recording (Advanced)\n');
console.log('Manually record tokens if not using the router:');
console.log(`
const { tokenTracker } = require('./model-router');

// Record tokens manually
tokenTracker.recordTokens({
  inputTokens: 1500,
  outputTokens: 800,
  provider: 'custom-provider',
  model: 'custom-model',
  role: 'custom-role',
  projectId: 'proj_123',
  userId: 'user_456',
  status: 'success',
  timestamp: new Date()
});
`);

// Example 12: Get metrics from router
console.log('\n12. Get All Metrics from Router\n');
console.log('Get combined metrics including tokens, costs, and performance:');
console.log(`
const router = getRouter();

const metrics = router.getMetrics({
  provider: 'huggingface',
  startDate: new Date('2025-01-01')
});

console.log('All metrics:', metrics);
// Output: {
//   performance: { ... },  // from metrics collector
//   costs: { ... },        // from cost tracker
//   tokens: { ... },       // from token tracker
//   health: { ... }        // from health monitor
// }
`);

console.log('\n' + '='.repeat(60));
console.log('\nFor more information, see:');
console.log('- server/services/model-router/token-tracker.js');
console.log('- server/services/model-router/README.md');
console.log('- .kiro/specs/enhanced-model-router/design.md');
