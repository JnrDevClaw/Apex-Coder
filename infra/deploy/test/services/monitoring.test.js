const monitoringService = require('../../services/monitoring');
const metricsCollector = require('../../services/metrics-collector');
const jobQueueService = require('../../services/job-queue');

// Mock dependencies
jest.mock('../../services/metrics-collector');
jest.mock('../../services/job-queue');

describe('MonitoringService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset monitoring service state
    monitoringService.initialized = false;
    if (monitoringService.monitoringInterval) {
      clearInterval(monitoringService.monitoringInterval);
      monitoringService.monitoringInterval = null;
    }
    monitoringService.alertHistory.clear();
  });

  afterEach(async () => {
    await monitoringService.shutdown();
  });

  describe('initialization', () => {
    test('should initialize successfully', async () => {
      metricsCollector.initialize.mockResolvedValue();
      
      await monitoringService.initialize();
      
      expect(monitoringService.initialized).toBe(true);
      expect(metricsCollector.initialize).toHaveBeenCalled();
      expect(monitoringService.monitoringInterval).toBeTruthy();
    });

    test('should handle initialization failure', async () => {
      const error = new Error('Metrics collector failed');
      metricsCollector.initialize.mockRejectedValue(error);
      
      await expect(monitoringService.initialize()).rejects.toThrow('Metrics collector failed');
      expect(monitoringService.initialized).toBe(false);
    });
  });

  describe('build metrics monitoring', () => {
    beforeEach(async () => {
      metricsCollector.initialize.mockResolvedValue();
      await monitoringService.initialize();
    });

    test('should detect high build failure rate', async () => {
      const mockMetrics = {
        totalBuilds: 10,
        failedBuilds: 6,
        successRate: { '2024-01-01': '40.0' },
        averageBuildTime: 300000,
        averageSelfFixIterations: '2.0'
      };
      
      metricsCollector.getBuildMetrics.mockResolvedValue(mockMetrics);
      metricsCollector.getDateKey.mockReturnValue('2024-01-01');
      
      const alerts = await monitoringService.checkBuildMetrics();
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('high_build_failure_rate');
      expect(alerts[0].severity).toBe('warning');
      expect(alerts[0].data.failureRate).toBe(60);
    });

    test('should detect slow build times', async () => {
      const mockMetrics = {
        totalBuilds: 5,
        failedBuilds: 1,
        successRate: { '2024-01-01': '80.0' },
        averageBuildTime: 700000, // 11+ minutes
        averageSelfFixIterations: '1.0'
      };
      
      metricsCollector.getBuildMetrics.mockResolvedValue(mockMetrics);
      metricsCollector.getDateKey.mockReturnValue('2024-01-01');
      
      const alerts = await monitoringService.checkBuildMetrics();
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('slow_build_times');
      expect(alerts[0].severity).toBe('warning');
      expect(alerts[0].data.averageBuildTime).toBe(700000);
    });

    test('should detect high self-fix iterations', async () => {
      const mockMetrics = {
        totalBuilds: 5,
        failedBuilds: 1,
        successRate: { '2024-01-01': '80.0' },
        averageBuildTime: 300000,
        averageSelfFixIterations: '4.5' // Above threshold of 3
      };
      
      metricsCollector.getBuildMetrics.mockResolvedValue(mockMetrics);
      metricsCollector.getDateKey.mockReturnValue('2024-01-01');
      
      const alerts = await monitoringService.checkBuildMetrics();
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('high_self_fix_iterations');
      expect(alerts[0].severity).toBe('info');
      expect(alerts[0].data.averageSelfFixIterations).toBe('4.5');
    });

    test('should not alert for low build counts', async () => {
      const mockMetrics = {
        totalBuilds: 3, // Below threshold of 5
        failedBuilds: 2,
        successRate: { '2024-01-01': '33.3' },
        averageBuildTime: 300000,
        averageSelfFixIterations: '1.0'
      };
      
      metricsCollector.getBuildMetrics.mockResolvedValue(mockMetrics);
      metricsCollector.getDateKey.mockReturnValue('2024-01-01');
      
      const alerts = await monitoringService.checkBuildMetrics();
      
      expect(alerts).toHaveLength(0);
    });
  });

  describe('queue health monitoring', () => {
    beforeEach(async () => {
      metricsCollector.initialize.mockResolvedValue();
      await monitoringService.initialize();
    });

    test('should detect queue service down', async () => {
      jobQueueService.isInitialized.mockReturnValue(false);
      
      const alerts = await monitoringService.checkQueueHealth();
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('queue_service_down');
      expect(alerts[0].severity).toBe('critical');
    });

    test('should detect queue backlog', async () => {
      jobQueueService.isInitialized.mockReturnValue(true);
      jobQueueService.getAllQueueStats.mockResolvedValue({
        'build-queue': {
          waiting: 150, // Above threshold of 100
          active: 5,
          completed: 100,
          failed: 10
        }
      });
      
      const alerts = await monitoringService.checkQueueHealth();
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('queue_backlog');
      expect(alerts[0].severity).toBe('warning');
      expect(alerts[0].data.waitingJobs).toBe(150);
    });

    test('should detect stuck jobs', async () => {
      jobQueueService.isInitialized.mockReturnValue(true);
      jobQueueService.getAllQueueStats.mockResolvedValue({
        'build-queue': {
          waiting: 5,
          active: 15, // Above threshold of 10
          completed: 100,
          failed: 5
        }
      });
      
      const alerts = await monitoringService.checkQueueHealth();
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('potential_stuck_jobs');
      expect(alerts[0].severity).toBe('warning');
      expect(alerts[0].data.activeJobs).toBe(15);
    });

    test('should detect high job failure rate', async () => {
      jobQueueService.isInitialized.mockReturnValue(true);
      jobQueueService.getAllQueueStats.mockResolvedValue({
        'build-queue': {
          waiting: 5,
          active: 2,
          completed: 70,
          failed: 40 // 36.4% failure rate, above 30% threshold
        }
      });
      
      const alerts = await monitoringService.checkQueueHealth();
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('high_job_failure_rate');
      expect(alerts[0].severity).toBe('warning');
      expect(alerts[0].data.failureRate).toBeCloseTo(36.4, 1);
    });

    test('should handle queue stats error', async () => {
      jobQueueService.isInitialized.mockReturnValue(true);
      jobQueueService.getAllQueueStats.mockRejectedValue(new Error('Redis connection failed'));
      
      const alerts = await monitoringService.checkQueueHealth();
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('queue_health_check_failed');
      expect(alerts[0].severity).toBe('error');
    });
  });

  describe('cost threshold monitoring', () => {
    beforeEach(async () => {
      metricsCollector.initialize.mockResolvedValue();
      await monitoringService.initialize();
    });

    test('should detect daily cost exceeded', async () => {
      metricsCollector.getTodayTotalCost.mockResolvedValue(150); // Above $100 limit
      
      const alerts = await monitoringService.checkCostThresholds();
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('daily_cost_exceeded');
      expect(alerts[0].severity).toBe('critical');
      expect(alerts[0].data.currentCost).toBe(150);
    });

    test('should detect daily cost warning', async () => {
      metricsCollector.getTodayTotalCost.mockResolvedValue(85); // 85% of $100 limit
      
      const alerts = await monitoringService.checkCostThresholds();
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('daily_cost_warning');
      expect(alerts[0].severity).toBe('warning');
      expect(alerts[0].data.currentCost).toBe(85);
    });

    test('should not alert for normal costs', async () => {
      metricsCollector.getTodayTotalCost.mockResolvedValue(50); // 50% of limit
      
      const alerts = await monitoringService.checkCostThresholds();
      
      expect(alerts).toHaveLength(0);
    });

    test('should handle cost check error', async () => {
      metricsCollector.getTodayTotalCost.mockRejectedValue(new Error('Cost calculation failed'));
      
      const alerts = await monitoringService.checkCostThresholds();
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('cost_check_failed');
      expect(alerts[0].severity).toBe('error');
    });
  });

  describe('system performance monitoring', () => {
    beforeEach(async () => {
      metricsCollector.initialize.mockResolvedValue();
      await monitoringService.initialize();
    });

    test('should detect high build rate', async () => {
      metricsCollector.getCurrentBuildsPerSecond.mockResolvedValue(15); // Above 10 threshold
      
      const alerts = await monitoringService.checkSystemPerformance();
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('high_build_rate');
      expect(alerts[0].severity).toBe('info');
      expect(alerts[0].data.buildsPerSecond).toBe(15);
    });

    test('should detect high memory usage', async () => {
      metricsCollector.getCurrentBuildsPerSecond.mockResolvedValue(5);
      
      // Mock high memory usage
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockReturnValue({
        heapUsed: 600 * 1024 * 1024, // 600MB, above 500MB threshold
        heapTotal: 800 * 1024 * 1024,
        external: 50 * 1024 * 1024
      });
      
      const alerts = await monitoringService.checkSystemPerformance();
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('high_memory_usage');
      expect(alerts[0].severity).toBe('warning');
      expect(alerts[0].data.heapUsed).toBe(600);
      
      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });

    test('should handle performance check error', async () => {
      metricsCollector.getCurrentBuildsPerSecond.mockRejectedValue(new Error('Performance check failed'));
      
      const alerts = await monitoringService.checkSystemPerformance();
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('performance_check_failed');
      expect(alerts[0].severity).toBe('error');
    });
  });

  describe('alert processing', () => {
    beforeEach(async () => {
      metricsCollector.initialize.mockResolvedValue();
      await monitoringService.initialize();
    });

    test('should process alert and prevent spam', async () => {
      const alert = {
        type: 'test_alert',
        severity: 'warning',
        message: 'Test alert message',
        timestamp: Date.now()
      };
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // First alert should be processed
      await monitoringService.processAlert(alert);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[ALERT] WARNING: Test alert message'));
      
      // Second alert within 30 minutes should be ignored
      await monitoringService.processAlert(alert);
      expect(consoleSpy).toHaveBeenCalledTimes(2); // Only one additional call for sendAlert
      
      consoleSpy.mockRestore();
    });

    test('should allow alert after cooldown period', async () => {
      const alert = {
        type: 'test_alert',
        severity: 'warning',
        message: 'Test alert message',
        timestamp: Date.now()
      };
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Process first alert
      await monitoringService.processAlert(alert);
      
      // Simulate time passing (mock alert history)
      const alertKey = `${alert.type}_${alert.severity}`;
      monitoringService.alertHistory.set(alertKey, Date.now() - 31 * 60 * 1000); // 31 minutes ago
      
      // Second alert should be processed
      await monitoringService.processAlert(alert);
      expect(consoleSpy).toHaveBeenCalledTimes(4); // Two alerts, each with log + sendAlert
      
      consoleSpy.mockRestore();
    });
  });

  describe('system health', () => {
    beforeEach(async () => {
      metricsCollector.initialize.mockResolvedValue();
      await monitoringService.initialize();
    });

    test('should return healthy status', async () => {
      jobQueueService.isInitialized.mockReturnValue(true);
      jobQueueService.getAllQueueStats.mockResolvedValue({
        'build-queue': { waiting: 0, active: 0, completed: 10, failed: 1 }
      });
      metricsCollector.initialized = true;
      metricsCollector.getBuildMetrics.mockResolvedValue({ totalBuilds: 10 });
      metricsCollector.getDeploymentMetrics.mockResolvedValue({ totalDeployments: 5 });
      metricsCollector.getCostMetrics.mockResolvedValue({ totalCost: '50.00' });
      
      const health = await monitoringService.getSystemHealth();
      
      expect(health.status).toBe('healthy');
      expect(health.services.jobQueue.status).toBe('healthy');
      expect(health.services.metricsCollector.status).toBe('healthy');
    });

    test('should return unhealthy status for service issues', async () => {
      jobQueueService.isInitialized.mockReturnValue(false);
      metricsCollector.initialized = true;
      metricsCollector.getBuildMetrics.mockResolvedValue({ totalBuilds: 10 });
      metricsCollector.getDeploymentMetrics.mockResolvedValue({ totalDeployments: 5 });
      metricsCollector.getCostMetrics.mockResolvedValue({ totalCost: '50.00' });
      
      const health = await monitoringService.getSystemHealth();
      
      expect(health.status).toBe('unhealthy');
      expect(health.services.jobQueue.status).toBe('unhealthy');
    });

    test('should handle health check error', async () => {
      jobQueueService.isInitialized.mockImplementation(() => {
        throw new Error('Health check failed');
      });
      
      const health = await monitoringService.getSystemHealth();
      
      expect(health.status).toBe('error');
      expect(health.error).toBe('Health check failed');
    });
  });

  describe('configuration', () => {
    test('should update alert thresholds', () => {
      const newThresholds = {
        buildFailureRate: 0.3,
        dailyCostLimit: 200
      };
      
      monitoringService.updateAlertThresholds(newThresholds);
      
      const thresholds = monitoringService.getAlertThresholds();
      expect(thresholds.buildFailureRate).toBe(0.3);
      expect(thresholds.dailyCostLimit).toBe(200);
      expect(thresholds.queueBacklog).toBe(100); // Should keep existing values
    });

    test('should get current alert thresholds', () => {
      const thresholds = monitoringService.getAlertThresholds();
      
      expect(thresholds).toHaveProperty('buildFailureRate');
      expect(thresholds).toHaveProperty('dailyCostLimit');
      expect(thresholds).toHaveProperty('queueBacklog');
      expect(thresholds).toHaveProperty('buildTimeThreshold');
      expect(thresholds).toHaveProperty('selfFixIterationsThreshold');
    });
  });

  describe('monitoring loop', () => {
    test('should run monitoring checks periodically', async () => {
      metricsCollector.initialize.mockResolvedValue();
      metricsCollector.getBuildMetrics.mockResolvedValue({ totalBuilds: 5, failedBuilds: 1 });
      metricsCollector.getTodayTotalCost.mockResolvedValue(50);
      metricsCollector.getCurrentBuildsPerSecond.mockResolvedValue(2);
      jobQueueService.isInitialized.mockReturnValue(true);
      jobQueueService.getAllQueueStats.mockResolvedValue({});
      
      await monitoringService.initialize();
      
      // Manually trigger monitoring check
      const alerts = await monitoringService.runMonitoringChecks();
      
      expect(Array.isArray(alerts)).toBe(true);
      expect(metricsCollector.getBuildMetrics).toHaveBeenCalled();
      expect(jobQueueService.getAllQueueStats).toHaveBeenCalled();
    });

    test('should handle monitoring check errors gracefully', async () => {
      metricsCollector.initialize.mockResolvedValue();
      metricsCollector.getBuildMetrics.mockRejectedValue(new Error('Metrics failed'));
      
      await monitoringService.initialize();
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // This should not throw
      await expect(monitoringService.runMonitoringChecks()).resolves.toBeDefined();
      
      consoleSpy.mockRestore();
    });
  });

  describe('shutdown', () => {
    test('should shutdown cleanly', async () => {
      metricsCollector.initialize.mockResolvedValue();
      await monitoringService.initialize();
      
      expect(monitoringService.initialized).toBe(true);
      expect(monitoringService.monitoringInterval).toBeTruthy();
      
      await monitoringService.shutdown();
      
      expect(monitoringService.initialized).toBe(false);
      expect(monitoringService.monitoringInterval).toBeNull();
    });
  });
});