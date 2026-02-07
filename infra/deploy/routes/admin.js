const adminConsoleService = require('../services/admin-console');
const costControlsService = require('../services/cost-controls');
const telemetryService = require('../services/telemetry');

async function adminRoutes(fastify, options) {
  // Middleware to check admin permissions
  fastify.addHook('preHandler', async (request, reply) => {
    if (!request.user) {
      throw new Error('Authentication required');
    }
    
    // Check if user has admin role
    if (!request.user.roles || !request.user.roles.includes('admin')) {
      reply.code(403);
      throw new Error('Admin access required');
    }
  });

  // Queue Management
  fastify.get('/queues', async (request, reply) => {
    const overview = await adminConsoleService.getQueueOverview();
    return overview;
  });

  fastify.get('/queues/:queueName', async (request, reply) => {
    const { queueName } = request.params;
    const { limit = 50 } = request.query;
    
    const details = await adminConsoleService.getQueueDetails(queueName, parseInt(limit));
    return details;
  });

  fastify.post('/queues/:queueName/pause', async (request, reply) => {
    const { queueName } = request.params;
    const result = await adminConsoleService.pauseQueue(queueName);
    return result;
  });

  fastify.post('/queues/:queueName/resume', async (request, reply) => {
    const { queueName } = request.params;
    const result = await adminConsoleService.resumeQueue(queueName);
    return result;
  });

  fastify.post('/queues/:queueName/retry-failed', async (request, reply) => {
    const { queueName } = request.params;
    const { maxJobs = 10 } = request.body;
    
    const result = await adminConsoleService.retryFailedJobs(queueName, maxJobs);
    return result;
  });

  fastify.post('/queues/:queueName/clean', async (request, reply) => {
    const { queueName } = request.params;
    const { grace = 5000, limit = 100 } = request.body;
    
    const result = await adminConsoleService.cleanQueue(queueName, grace, limit);
    return result;
  });

  fastify.delete('/queues/:queueName/jobs/:jobId', async (request, reply) => {
    const { queueName, jobId } = request.params;
    const result = await adminConsoleService.removeJob(queueName, jobId);
    return result;
  });

  // Cost Management
  fastify.get('/costs/dashboard', async (request, reply) => {
    const { days = 30 } = request.query;
    const dashboard = await adminConsoleService.getCostDashboard(parseInt(days));
    return dashboard;
  });

  fastify.get('/costs/limits', async (request, reply) => {
    const limits = await adminConsoleService.getCostLimits();
    return limits;
  });

  fastify.put('/costs/limits/:limitType', async (request, reply) => {
    const { limitType } = request.params;
    const { amount } = request.body;
    
    if (typeof amount !== 'number' || amount < 0) {
      reply.code(400);
      throw new Error('Amount must be a non-negative number');
    }
    
    const result = await adminConsoleService.setCostLimit(limitType, amount);
    return result;
  });

  fastify.post('/costs/limits/reset', async (request, reply) => {
    const result = await adminConsoleService.resetCostLimits();
    return result;
  });

  fastify.post('/costs/validate-build', async (request, reply) => {
    const { buildId, estimatedCost } = request.body;
    
    if (!buildId || typeof estimatedCost !== 'number') {
      reply.code(400);
      throw new Error('buildId and estimatedCost are required');
    }
    
    const validation = await adminConsoleService.validateBuildCost(buildId, estimatedCost);
    return validation;
  });

  fastify.get('/costs/alerts', async (request, reply) => {
    const { hours = 24 } = request.query;
    const alerts = await costControlsService.getRecentCostAlerts(parseInt(hours));
    return alerts;
  });

  fastify.get('/costs/actions', async (request, reply) => {
    const { days = 7 } = request.query;
    const actions = await costControlsService.getCostActions(parseInt(days));
    return actions;
  });

  // Emergency Controls
  fastify.post('/emergency/stop', async (request, reply) => {
    const { reason = 'Manual emergency stop' } = request.body;
    const result = await adminConsoleService.emergencyStop(reason);
    return result;
  });

  fastify.post('/emergency/resume', async (request, reply) => {
    const { reason = 'Manual emergency resume' } = request.body;
    const adminId = request.user.id;
    
    const result = await adminConsoleService.emergencyResume(reason, adminId);
    return result;
  });

  fastify.post('/emergency/cost-stop', async (request, reply) => {
    const { reason = 'Manual cost emergency stop' } = request.body;
    const result = await adminConsoleService.emergencyStopCosts(reason);
    return result;
  });

  fastify.post('/emergency/cost-resume', async (request, reply) => {
    const { reason = 'Manual cost emergency resume' } = request.body;
    const adminId = request.user.id;
    
    const result = await adminConsoleService.emergencyResumeCosts(reason, adminId);
    return result;
  });

  // Build Management
  fastify.get('/builds/overview', async (request, reply) => {
    const { days = 7 } = request.query;
    const overview = await adminConsoleService.getBuildOverview(parseInt(days));
    return overview;
  });

  // System Health
  fastify.get('/system/health', async (request, reply) => {
    const health = await adminConsoleService.getSystemHealth();
    return health;
  });

  fastify.get('/system/alerts', async (request, reply) => {
    const { hours = 24 } = request.query;
    const alerts = await adminConsoleService.getAlerts(parseInt(hours));
    return alerts;
  });

  fastify.put('/system/alert-thresholds', async (request, reply) => {
    const thresholds = request.body;
    const result = await adminConsoleService.updateAlertThresholds(thresholds);
    return result;
  });

  // Telemetry and Analytics
  fastify.get('/telemetry/analytics', async (request, reply) => {
    const { days = 30 } = request.query;
    const analytics = await adminConsoleService.getTelemetryAnalytics(parseInt(days));
    return analytics;
  });

  fastify.put('/telemetry/users/:userId/opt-in', async (request, reply) => {
    const { userId } = request.params;
    const { optIn = true } = request.body;
    
    const result = await adminConsoleService.setUserTelemetryOptIn(userId, optIn);
    return result;
  });

  fastify.get('/telemetry/users/:userId/status', async (request, reply) => {
    const { userId } = request.params;
    const status = await adminConsoleService.getUserTelemetryStatus(userId);
    return { userId, optedIn: status };
  });

  // A/B Testing
  fastify.post('/ab-tests', async (request, reply) => {
    const { testName, variants, trafficSplit = 0.5 } = request.body;
    
    if (!testName || !variants || !Array.isArray(variants)) {
      reply.code(400);
      throw new Error('testName and variants array are required');
    }
    
    const test = await adminConsoleService.createABTest(testName, variants, trafficSplit);
    return test;
  });

  fastify.get('/ab-tests/:testId/results', async (request, reply) => {
    const { testId } = request.params;
    const results = await adminConsoleService.getABTestResults(testId);
    
    if (!results) {
      reply.code(404);
      throw new Error('A/B test not found');
    }
    
    return results;
  });

  // Performance Benchmarks
  fastify.get('/benchmarks/:benchmarkType', async (request, reply) => {
    const { benchmarkType } = request.params;
    const { days = 30 } = request.query;
    
    const benchmarks = await adminConsoleService.getPerformanceBenchmarks(benchmarkType, parseInt(days));
    return benchmarks;
  });

  fastify.post('/benchmarks/:benchmarkType', async (request, reply) => {
    const { benchmarkType } = request.params;
    const metrics = request.body;
    
    if (!metrics || typeof metrics !== 'object') {
      reply.code(400);
      throw new Error('Metrics object is required');
    }
    
    await adminConsoleService.recordPerformanceBenchmark(benchmarkType, metrics);
    return { success: true, message: 'Benchmark recorded' };
  });

  // Approval Workflows
  fastify.get('/approvals/pending', async (request, reply) => {
    const approvals = await adminConsoleService.getPendingApprovals();
    return approvals;
  });

  fastify.post('/approvals/:operationId', async (request, reply) => {
    const { operationId } = request.params;
    const { approved = true, reason = '' } = request.body;
    const approverId = request.user.id;
    
    const result = await adminConsoleService.approveOperation(operationId, approverId, approved, reason);
    return result;
  });

  // Reporting
  fastify.get('/reports/:type', async (request, reply) => {
    const { type } = request.params;
    const { period = 7 } = request.query;
    
    const validTypes = ['builds', 'deployments', 'costs', 'queues', 'system'];
    if (!validTypes.includes(type)) {
      reply.code(400);
      throw new Error(`Invalid report type. Valid types: ${validTypes.join(', ')}`);
    }
    
    const report = await adminConsoleService.generateReport(type, parseInt(period));
    return report;
  });

  // Status endpoint
  fastify.get('/status', async (request, reply) => {
    return {
      adminConsole: adminConsoleService.initialized,
      costControls: costControlsService.getStatus(),
      telemetry: telemetryService.initialized,
      timestamp: Date.now()
    };
  });
}

module.exports = adminRoutes;