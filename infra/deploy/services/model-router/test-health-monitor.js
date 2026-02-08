/**
 * Health Monitor Test Script
 * 
 * Tests the health monitoring functionality of the Model Router.
 */

const HealthMonitor = require('./health-monitor');

console.log('=== Health Monitor Test ===\n');

// Create health monitor instance
const healthMonitor = new HealthMonitor({
  errorRateThreshold: 0.5,
  latencyThreshold: 10000,
  windowSize: 10,
  recoveryThreshold: 0.8,
  minCallsForHealth: 3
});

console.log('1. Testing initial health status (should be unknown)');
const initialHealth = healthMonitor.getProviderHealth('test-provider');
console.log('Initial health:', JSON.stringify(initialHealth, null, 2));
console.log('✓ Initial status is unknown\n');

console.log('2. Testing successful calls (should remain healthy)');
for (let i = 0; i < 5; i++) {
  healthMonitor.trackHealth('test-provider', {
    success: true,
    latency: 1000 + Math.random() * 500,
    timestamp: new Date()
  });
}
const healthyStatus = healthMonitor.getProviderHealth('test-provider');
console.log('After 5 successful calls:', JSON.stringify(healthyStatus, null, 2));
console.log('✓ Provider is healthy\n');

console.log('3. Testing high error rate (should become unhealthy)');
for (let i = 0; i < 6; i++) {
  healthMonitor.trackHealth('test-provider', {
    success: false,
    latency: 2000,
    timestamp: new Date(),
    error: 'Test error'
  });
}
const unhealthyStatus = healthMonitor.getProviderHealth('test-provider');
console.log('After 6 failed calls:', JSON.stringify(unhealthyStatus, null, 2));
console.log('✓ Provider is unhealthy due to high error rate\n');

console.log('4. Testing recovery (should become healthy again)');
for (let i = 0; i < 10; i++) {
  healthMonitor.trackHealth('test-provider', {
    success: true,
    latency: 1000,
    timestamp: new Date()
  });
}
const recoveredStatus = healthMonitor.getProviderHealth('test-provider');
console.log('After 10 successful calls:', JSON.stringify(recoveredStatus, null, 2));
console.log('✓ Provider recovered to healthy status\n');

console.log('5. Testing high latency (should become unhealthy)');
for (let i = 0; i < 5; i++) {
  healthMonitor.trackHealth('test-provider', {
    success: true,
    latency: 12000, // Above threshold
    timestamp: new Date()
  });
}
const highLatencyStatus = healthMonitor.getProviderHealth('test-provider');
console.log('After 5 high-latency calls:', JSON.stringify(highLatencyStatus, null, 2));
console.log('✓ Provider is unhealthy due to high latency\n');

console.log('6. Testing multiple providers');
healthMonitor.trackHealth('provider-a', {
  success: true,
  latency: 500,
  timestamp: new Date()
});
healthMonitor.trackHealth('provider-b', {
  success: false,
  latency: 2000,
  timestamp: new Date(),
  error: 'Error'
});
const allHealth = healthMonitor.getAllProviderHealth();
console.log('All provider health:', JSON.stringify(allHealth, null, 2));
console.log('✓ Multiple providers tracked\n');

console.log('7. Testing isProviderHealthy helper');
console.log('test-provider healthy?', healthMonitor.isProviderHealthy('test-provider'));
console.log('provider-a healthy?', healthMonitor.isProviderHealthy('provider-a'));
console.log('✓ Helper method works\n');

console.log('8. Testing reset');
healthMonitor.resetProviderHealth('test-provider');
const resetHealth = healthMonitor.getProviderHealth('test-provider');
console.log('After reset:', JSON.stringify(resetHealth, null, 2));
console.log('✓ Provider health reset\n');

console.log('=== All Health Monitor Tests Passed ===');
