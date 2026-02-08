const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');

describe('Error Handling Integration', () => {
  let errorNotifier;
  let costControls;
  let monitoringService;
  let modelRouter;

  beforeAll(async () => {
    // Import services
    errorNotifier = require('../../services/error-notifier');
    costControls = require('../../services/cost-controls');
    monitoringService = require('../../services/monitoring');
    const { ModelRouter } = require('../../services/model-router');
    modelRouter = new ModelRouter();
  });

  describe('Error Notifier', () => {
    it('should create error notification with proper structure', async () => {
      const error = new Error('Test error');
      error.name = 'TestError';

      const result = await errorNotifier.notifyError(error, {
        severity: 'low', // Use low severity to avoid actual notifications in tests
        operation: 'test_operation',
        userId: 'test-user',
        projectId: 'test-project'
      });

      expect(result).toBeDefined();
      expect(result.sent).toBeDefined();
    });

    it('should respect severity thresholds', async () => {
      const error = new Error('Low severity error');
      
      const result = await errorNotifier.notifyError(error, {
        severity: 'low',
        operation: 'test'
      });

      // Low severity should not trigger notifications by default
      expect(result.sent).toBe(false);
      expect(result.reason).toBe('below_severity_threshold');
    });

    it('should rate limit duplicate errors', async () => {
      const error = new Error('Duplicate error');
      error.name = 'DuplicateError';

      // First notification should go through (if severity is high enough)
      const result1 = await errorNotifier.notifyError(error, {
        severity: 'critical',
        operation: 'test_duplicate'
      });

      // Immediately send same error again
      const result2 = await errorNotifier.notifyError(error, {
        severity: 'critical',
        operation: 'test_duplicate'
      });

      // Second should be rate limited if within window
      if (result1.sent) {
        expect(result2.sent).toBe(false);
        expect(result2.reason).toBe('rate_limited');
      }
    });
  });

  describe('Cost Controls', () => {
    it('should track job costs', async () => {
      const jobId = 'test-job-' + Date.now();
      const cost = 0.05;

      await costControls.trackJobCost(jobId, cost, {
        userId: 'test-user',
        projectId: 'test-project'
      });

      const jobCost = await costControls.getJobCost(jobId);
      expect(jobCost).toBe(cost);
    });

    it('should validate build costs against limits', async () => {
      const buildId = 'test-build-' + Date.now();
      const estimatedCost = 5.0; // Within default limit

      const validation = await costControls.validateBuildCost(buildId, estimatedCost);

      expect(validation).toBeDefined();
      expect(validation.allowed).toBeDefined();
      expect(Array.isArray(validation.reasons)).toBe(true);
      expect(Array.isArray(validation.warnings)).toBe(true);
    });

    it('should reject builds exceeding cost limits', async () => {
      const buildId = 'test-build-expensive-' + Date.now();
      const estimatedCost = 1000.0; // Way over default limit

      const validation = await costControls.validateBuildCost(buildId, estimatedCost);

      expect(validation.allowed).toBe(false);
      expect(validation.reasons.length).toBeGreaterThan(0);
    });

    it('should get cost limits', async () => {
      const limits = await costControls.getCostLimits();

      expect(limits).toBeDefined();
      expect(limits.dailyLimit).toBeDefined();
      expect(limits.monthlyLimit).toBeDefined();
      expect(limits.buildLimit).toBeDefined();
    });
  });

  describe('Performance Monitoring', () => {
    it('should track LLM call metrics', () => {
      const provider = 'test-provider';
      const latency = 1500;
      const success = true;

      monitoringService.trackLLMCall(provider, latency, success);

      const metrics = monitoringService.getLLMMetrics(provider);
      expect(metrics).toBeDefined();
      expect(metrics.calls).toBeGreaterThan(0);
      expect(metrics.avgLatency).toBeGreaterThan(0);
    });

    it('should track job execution metrics', () => {
      const jobType = 'test-job-type';
      const executionTime = 5000;
      const success = true;

      monitoringService.trackJobExecution(jobType, executionTime, success);

      const metrics = monitoringService.getJobMetrics(jobType);
      expect(metrics).toBeDefined();
      expect(metrics.executions).toBeGreaterThan(0);
      expect(metrics.avgExecutionTime).toBeGreaterThan(0);
    });

    it('should get performance dashboard', () => {
      const dashboard = monitoringService.getPerformanceDashboard();

      expect(dashboard).toBeDefined();
      expect(dashboard.timestamp).toBeDefined();
      expect(dashboard.llmMetrics).toBeDefined();
      expect(dashboard.jobMetrics).toBeDefined();
      expect(dashboard.systemMetrics).toBeDefined();
      expect(dashboard.thresholds).toBeDefined();
    });

    it('should calculate success rates correctly', () => {
      const provider = 'test-provider-' + Date.now();
      
      // Track some successful and failed calls
      monitoringService.trackLLMCall(provider, 1000, true);
      monitoringService.trackLLMCall(provider, 1500, true);
      monitoringService.trackLLMCall(provider, 2000, false);

      const metrics = monitoringService.getLLMMetrics(provider);
      expect(metrics.calls).toBe(3);
      expect(metrics.successes).toBe(2);
      expect(metrics.failures).toBe(1);
      expect(parseFloat(metrics.successRate)).toBeCloseTo(66.7, 0);
    });
  });

  describe('Model Router Error Handling', () => {
    it('should calculate timeout based on complexity', () => {
      const lowTimeout = modelRouter.getTimeoutForComplexity('low');
      const mediumTimeout = modelRouter.getTimeoutForComplexity('medium');
      const highTimeout = modelRouter.getTimeoutForComplexity('high');

      expect(lowTimeout).toBe(15000);
      expect(mediumTimeout).toBe(30000);
      expect(highTimeout).toBe(60000);
    });

    it('should calculate exponential backoff correctly', () => {
      const delay0 = modelRouter.calculateBackoffDelay(0);
      const delay1 = modelRouter.calculateBackoffDelay(1);
      const delay2 = modelRouter.calculateBackoffDelay(2);
      const delay3 = modelRouter.calculateBackoffDelay(3);

      expect(delay0).toBe(0);
      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay1).toBeLessThanOrEqual(1300); // 1s + 30% jitter
      expect(delay2).toBeGreaterThanOrEqual(2000);
      expect(delay2).toBeLessThanOrEqual(2600); // 2s + 30% jitter
      expect(delay3).toBeGreaterThanOrEqual(4000);
      expect(delay3).toBeLessThanOrEqual(5200); // 4s + 30% jitter
    });

    it('should track fallback metrics', () => {
      modelRouter.trackFallbackMetrics('provider-a', 'provider-b', true);
      modelRouter.trackFallbackMetrics('provider-a', 'provider-b', false);

      const metrics = modelRouter.getMetrics();
      expect(metrics.fallbacks).toBeDefined();
      expect(metrics.fallbacks.total).toBeGreaterThan(0);
      expect(metrics.fallbacks.byProvider).toBeDefined();
    });
  });

  describe('Integration: Error Flow', () => {
    it('should handle complete error flow with notifications and tracking', async () => {
      const error = new Error('Integration test error');
      error.name = 'IntegrationTestError';

      // Track in monitoring
      monitoringService.trackLLMCall('test-provider', 5000, false);

      // Track cost (even for failed operations)
      await costControls.trackJobCost('test-job-integration', 0.01, {
        userId: 'test-user',
        projectId: 'test-project'
      });

      // Send notification (low severity to avoid actual alerts)
      const notification = await errorNotifier.notifyError(error, {
        severity: 'low',
        operation: 'integration_test',
        userId: 'test-user',
        projectId: 'test-project'
      });

      // Verify all components tracked the error
      const llmMetrics = monitoringService.getLLMMetrics('test-provider');
      expect(llmMetrics.failures).toBeGreaterThan(0);

      const jobCost = await costControls.getJobCost('test-job-integration');
      expect(jobCost).toBe(0.01);

      expect(notification).toBeDefined();
    });
  });

  afterAll(async () => {
    // Cleanup
    if (modelRouter.shutdown) {
      modelRouter.shutdown();
    }
  });
});
