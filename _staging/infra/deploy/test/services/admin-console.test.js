const adminConsoleService = require('../../services/admin-console');
const jobQueueService = require('../../services/job-queue');
const metricsCollector = require('../../services/metrics-collector');
const monitoringService = require('../../services/monitoring');

// Mock dependencies
jest.mock('../../services/job-queue');
jest.mock('../../services/metrics-collector');
jest.mock('../../services/monitoring');

describe('AdminConsoleService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    adminConsoleService.initialized = false;
  });

  describe('initialization', () => {
    test('should initialize successfully', async () => {
      await adminConsoleService.initialize();
      
      expect(adminConsoleService.initialized).toBe(true);
    });
  });

  describe('queue management', () => {
    beforeEach(async () => {
      await adminConsoleService.initialize();
    });

    test('should get queue overview', async () => {
      jobQueueService.isInitialized.mockReturnValue(true);
      jobQueueService.getQueueNames.mockReturnValue(['build-queue', 'deploy-queue']);
      jobQueueService.getQueueStats
        .mockResolvedValueOnce({
          waiting: 5,
          active: 2,
          completed: 100,
          failed: 3
        })
        .mockResolvedValueOnce({
          waiting: 1,
          active: 0,
          completed: 50,
          failed: 1
        });
      
      const overview = await adminConsoleService.getQueueOverview();
      
      expect(overview).toEqual({
        totalQueues: 2,
        queues: {
          'build-queue': {
            waiting: 5,
            active: 2,
            completed: 100,
            failed: 3,
            health: 'active'
          },
          'deploy-queue': {
            waiting: 1,
            active: 0,
            completed: 50,
            failed: 1,
            health: 'idle'
          }
        },
        summary: {
          totalWaiting: 6,
          totalActive: 2,
          totalCompleted: 150,
          totalFailed: 4
        }
      });
    });

    test('should assess queue health correctly', () => {
      // Critical: high waiting or high failure rate
      expect(adminConsoleService.assessQueueHealth({
        waiting: 150,
        active: 2,
        completed: 100,
        failed: 10
      })).toBe('critical');

      // Warning: moderate waiting or moderate failure rate
      expect(adminConsoleService.assessQueueHealth({
        waiting: 75,
        active: 1,
        completed: 100,
        failed: 20
      })).toBe('warning');

      // Active: has jobs running
      expect(adminConsoleService.assessQueueHealth({
        waiting: 10,
        active: 5,
        completed: 100,
        failed: 5
      })).toBe('active');

      // Idle: no active jobs
      expect(adminConsoleService.assessQueueHealth({
        waiting: 0,
        active: 0,
        completed: 100,
        failed: 5
      })).toBe('idle');
    });

    test('should throw error when queue service not initialized', async () => {
      jobQueueService.isInitialized.mockReturnValue(false);
      
      await expect(adminConsoleService.getQueueOverview()).rejects.toThrow('Job queue service not initialized');
    });

    test('should get queue details', async () => {
      const mockQueue = {
        getWaiting: jest.fn().mockResolvedValue([
          { id: 'job1', name: 'build', data: { projectId: 'p1' }, progress: 0 }
        ]),
        getActive: jest.fn().mockResolvedValue([
          { id: 'job2', name: 'build', data: { projectId: 'p2' }, progress: 50 }
        ]),
        getCompleted: jest.fn().mockResolvedValue([
          { id: 'job3', name: 'build', data: { projectId: 'p3' }, progress: 100 }
        ]),
        getFailed: jest.fn().mockResolvedValue([
          { id: 'job4', name: 'build', data: { projectId: 'p4' }, failedReason: 'Timeout' }
        ])
      };
      
      jobQueueService.isInitialized.mockReturnValue(true);
      jobQueueService.queues = new Map([['build-queue', mockQueue]]);
      jobQueueService.getQueueStats.mockResolvedValue({
        waiting: 1,
        active: 1,
        completed: 1,
        failed: 1
      });
      
      const details = await adminConsoleService.getQueueDetails('build-queue');
      
      expect(details).toEqual({
        queueName: 'build-queue',
        jobs: {
          waiting: [expect.objectContaining({ id: 'job1' })],
          active: [expect.objectContaining({ id: 'job2' })],
          completed: [expect.objectContaining({ id: 'job3' })],
          failed: [expect.objectContaining({ id: 'job4' })]
        },
        stats: {
          waiting: 1,
          active: 1,
          completed: 1,
          failed: 1
        }
      });
    });

    test('should pause queue', async () => {
      jobQueueService.pauseQueue.mockResolvedValue();
      
      const result = await adminConsoleService.pauseQueue('build-queue');
      
      expect(result).toEqual({
        success: true,
        message: "Queue 'build-queue' paused"
      });
      expect(jobQueueService.pauseQueue).toHaveBeenCalledWith('build-queue');
    });

    test('should resume queue', async () => {
      jobQueueService.resumeQueue.mockResolvedValue();
      
      const result = await adminConsoleService.resumeQueue('build-queue');
      
      expect(result).toEqual({
        success: true,
        message: "Queue 'build-queue' resumed"
      });
      expect(jobQueueService.resumeQueue).toHaveBeenCalledWith('build-queue');
    });

    test('should retry failed jobs', async () => {
      jobQueueService.retryFailedJobs.mockResolvedValue(5);
      
      const result = await adminConsoleService.retryFailedJobs('build-queue', 10);
      
      expect(result).toEqual({
        success: true,
        message: "Retried 5 failed jobs in queue 'build-queue'",
        retriedCount: 5
      });
      expect(jobQueueService.retryFailedJobs).toHaveBeenCalledWith('build-queue', 10);
    });

    test('should clean queue', async () => {
      jobQueueService.cleanQueue.mockResolvedValue(25);
      
      const result = await adminConsoleService.cleanQueue('build-queue', 5000, 100);
      
      expect(result).toEqual({
        success: true,
        message: "Cleaned 25 completed jobs from queue 'build-queue'",
        cleanedCount: 25
      });
      expect(jobQueueService.cleanQueue).toHaveBeenCalledWith('build-queue', 5000, 100);
    });

    test('should remove job', async () => {
      const mockJob = {
        remove: jest.fn().mockResolvedValue()
      };
      const mockQueue = {
        getJob: jest.fn().mockResolvedValue(mockJob)
      };
      
      jobQueueService.queues = new Map([['build-queue', mockQueue]]);
      
      const result = await adminConsoleService.removeJob('build-queue', 'job-123');
      
      expect(result).toEqual({
        success: true,
        message: "Job 'job-123' removed from queue 'build-queue'"
      });
      expect(mockJob.remove).toHaveBeenCalled();
    });

    test('should throw error when removing non-existent job', async () => {
      const mockQueue = {
        getJob: jest.fn().mockResolvedValue(null)
      };
      
      jobQueueService.queues = new Map([['build-queue', mockQueue]]);
      
      await expect(adminConsoleService.removeJob('build-queue', 'job-123')).rejects.toThrow("Job 'job-123' not found");
    });
  });

  describe('cost management', () => {
    beforeEach(async () => {
      await adminConsoleService.initialize();
    });

    test('should get cost dashboard', async () => {
      const mockCostMetrics = {
        totalCost: '150.50',
        costByType: {
          llm_tokens: 75.25,
          aws_compute: 50.00,
          aws_storage: 25.25
        },
        dailyCosts: {
          '2024-01-01': '50.00',
          '2024-01-02': '75.25',
          '2024-01-03': '25.25'
        }
      };
      
      const mockBuildMetrics = {
        totalBuilds: 30
      };
      
      metricsCollector.getCostMetrics.mockResolvedValue(mockCostMetrics);
      metricsCollector.getBuildMetrics.mockResolvedValue(mockBuildMetrics);
      metricsCollector.getTodayTotalCost.mockResolvedValue(25.25);
      
      const dashboard = await adminConsoleService.getCostDashboard(30);
      
      expect(dashboard).toEqual({
        period: '30 days',
        totalCost: '150.50',
        costByType: mockCostMetrics.costByType,
        dailyCosts: mockCostMetrics.dailyCosts,
        costPerBuild: '5.02', // 150.50 / 30
        projectedMonthlyCost: '1502.50', // (150.50 / 3) * 30
        budgetStatus: expect.objectContaining({
          monthlyBudget: 3000,
          todayCost: '25.25'
        })
      });
    });

    test('should calculate projected monthly cost', () => {
      const dailyCosts = {
        '2024-01-01': '10.00',
        '2024-01-02': '15.00',
        '2024-01-03': '20.00'
      };
      
      const projected = adminConsoleService.calculateProjectedMonthlyCost(dailyCosts);
      
      expect(projected).toBe('450.00'); // (10+15+20)/3 * 30
    });

    test('should get budget status', async () => {
      metricsCollector.getTodayTotalCost.mockResolvedValue(50.00);
      
      const budgetStatus = await adminConsoleService.getBudgetStatus(1500.00);
      
      expect(budgetStatus).toEqual({
        monthlyBudget: 3000,
        dailyBudget: '100.00',
        todayCost: '50.00',
        monthlyUsed: 1500.00,
        monthlyRemaining: '1500.00',
        dailyBudgetUsed: '50.0',
        monthlyBudgetUsed: '50.0'
      });
    });

    test('should set budget alert', async () => {
      monitoringService.getAlertThresholds.mockReturnValue({
        dailyCostLimit: 100
      });
      monitoringService.updateAlertThresholds.mockImplementation();
      
      const result = await adminConsoleService.setBudgetAlert('daily', 150, true);
      
      expect(result).toEqual({
        success: true,
        message: 'Budget alert enabled for daily threshold: 150'
      });
      expect(monitoringService.updateAlertThresholds).toHaveBeenCalledWith({
        dailyCostLimit: 150
      });
    });
  });

  describe('build management', () => {
    beforeEach(async () => {
      await adminConsoleService.initialize();
    });

    test('should get build overview', async () => {
      const mockBuildMetrics = {
        totalBuilds: 50,
        successfulBuilds: 45,
        failedBuilds: 5
      };
      
      const mockDeploymentMetrics = {
        totalDeployments: 40,
        successfulDeployments: 38,
        failedDeployments: 2
      };
      
      metricsCollector.getBuildMetrics.mockResolvedValue(mockBuildMetrics);
      metricsCollector.getDeploymentMetrics.mockResolvedValue(mockDeploymentMetrics);
      
      const overview = await adminConsoleService.getBuildOverview(7);
      
      expect(overview).toEqual({
        period: '7 days',
        builds: mockBuildMetrics,
        deployments: mockDeploymentMetrics,
        efficiency: {
          buildsPerDay: '7.1', // 50/7
          deploymentsPerDay: '5.7', // 40/7
          deploymentRate: '80.0' // (40/50)*100
        }
      });
    });
  });

  describe('system health', () => {
    beforeEach(async () => {
      await adminConsoleService.initialize();
    });

    test('should get system health', async () => {
      const mockHealth = {
        status: 'healthy',
        services: { jobQueue: { status: 'healthy' } },
        metrics: {},
        alerts: []
      };
      
      monitoringService.getSystemHealth.mockResolvedValue(mockHealth);
      
      const health = await adminConsoleService.getSystemHealth();
      
      expect(health).toBe(mockHealth);
      expect(monitoringService.getSystemHealth).toHaveBeenCalled();
    });

    test('should get alerts', async () => {
      const mockAlerts = [
        { type: 'high_failure_rate', severity: 'warning', timestamp: Date.now() }
      ];
      
      monitoringService.getRecentAlerts.mockResolvedValue(mockAlerts);
      
      const alerts = await adminConsoleService.getAlerts(24);
      
      expect(alerts).toBe(mockAlerts);
      expect(monitoringService.getRecentAlerts).toHaveBeenCalledWith(24);
    });

    test('should update alert thresholds', async () => {
      const newThresholds = { buildFailureRate: 0.3 };
      const updatedThresholds = { buildFailureRate: 0.3, dailyCostLimit: 100 };
      
      monitoringService.updateAlertThresholds.mockImplementation();
      monitoringService.getAlertThresholds.mockReturnValue(updatedThresholds);
      
      const result = await adminConsoleService.updateAlertThresholds(newThresholds);
      
      expect(result).toEqual({
        success: true,
        message: 'Alert thresholds updated',
        thresholds: updatedThresholds
      });
      expect(monitoringService.updateAlertThresholds).toHaveBeenCalledWith(newThresholds);
    });
  });

  describe('approval workflows', () => {
    beforeEach(async () => {
      await adminConsoleService.initialize();
    });

    test('should get pending approvals', async () => {
      const approvals = await adminConsoleService.getPendingApprovals();
      
      expect(approvals).toEqual({
        destructiveOperations: [],
        highCostOperations: [],
        deployments: []
      });
    });

    test('should approve operation', async () => {
      const result = await adminConsoleService.approveOperation('op-123', 'admin-456', true, 'Approved for testing');
      
      expect(result).toEqual({
        success: true,
        message: 'Operation op-123 approved by admin-456',
        operationId: 'op-123',
        approverId: 'admin-456',
        approved: true,
        reason: 'Approved for testing',
        timestamp: expect.any(Number)
      });
    });

    test('should reject operation', async () => {
      const result = await adminConsoleService.approveOperation('op-123', 'admin-456', false, 'Security concerns');
      
      expect(result).toEqual({
        success: true,
        message: 'Operation op-123 rejected by admin-456',
        operationId: 'op-123',
        approverId: 'admin-456',
        approved: false,
        reason: 'Security concerns',
        timestamp: expect.any(Number)
      });
    });
  });

  describe('emergency controls', () => {
    beforeEach(async () => {
      await adminConsoleService.initialize();
    });

    test('should execute emergency stop', async () => {
      jobQueueService.getQueueNames.mockReturnValue(['build-queue', 'deploy-queue']);
      jobQueueService.pauseQueue
        .mockResolvedValueOnce()
        .mockResolvedValueOnce();
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const result = await adminConsoleService.emergencyStop('System overload detected');
      
      expect(result).toEqual({
        success: true,
        message: 'Emergency stop executed',
        reason: 'System overload detected',
        timestamp: expect.any(Number),
        results: [
          { queue: 'build-queue', status: 'paused' },
          { queue: 'deploy-queue', status: 'paused' }
        ]
      });
      
      expect(consoleSpy).toHaveBeenCalledWith('EMERGENCY STOP: System overload detected');
      consoleSpy.mockRestore();
    });

    test('should handle emergency stop errors', async () => {
      jobQueueService.getQueueNames.mockReturnValue(['build-queue']);
      jobQueueService.pauseQueue.mockRejectedValue(new Error('Queue pause failed'));
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const result = await adminConsoleService.emergencyStop();
      
      expect(result.results[0]).toEqual({
        queue: 'build-queue',
        status: 'error',
        error: 'Queue pause failed'
      });
      
      consoleSpy.mockRestore();
    });

    test('should execute emergency resume', async () => {
      jobQueueService.getQueueNames.mockReturnValue(['build-queue', 'deploy-queue']);
      jobQueueService.resumeQueue
        .mockResolvedValueOnce()
        .mockResolvedValueOnce();
      
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const result = await adminConsoleService.emergencyResume('Issue resolved');
      
      expect(result).toEqual({
        success: true,
        message: 'Emergency resume executed',
        reason: 'Issue resolved',
        timestamp: expect.any(Number),
        results: [
          { queue: 'build-queue', status: 'resumed' },
          { queue: 'deploy-queue', status: 'resumed' }
        ]
      });
      
      expect(consoleSpy).toHaveBeenCalledWith('EMERGENCY RESUME: Issue resolved');
      consoleSpy.mockRestore();
    });
  });

  describe('reporting', () => {
    beforeEach(async () => {
      await adminConsoleService.initialize();
    });

    test('should generate builds report', async () => {
      const mockBuildMetrics = { totalBuilds: 100 };
      metricsCollector.getBuildMetrics.mockResolvedValue(mockBuildMetrics);
      
      const report = await adminConsoleService.generateReport('builds', 7);
      
      expect(report).toEqual({
        type: 'builds',
        period: '7 days',
        generatedAt: expect.any(Number),
        data: mockBuildMetrics
      });
    });

    test('should generate deployments report', async () => {
      const mockDeploymentMetrics = { totalDeployments: 50 };
      metricsCollector.getDeploymentMetrics.mockResolvedValue(mockDeploymentMetrics);
      
      const report = await adminConsoleService.generateReport('deployments', 7);
      
      expect(report.data).toBe(mockDeploymentMetrics);
    });

    test('should generate costs report', async () => {
      const mockCostMetrics = { totalCost: '500.00' };
      metricsCollector.getCostMetrics.mockResolvedValue(mockCostMetrics);
      
      const report = await adminConsoleService.generateReport('costs', 30);
      
      expect(report.data).toBe(mockCostMetrics);
    });

    test('should generate queues report', async () => {
      jobQueueService.isInitialized.mockReturnValue(true);
      jobQueueService.getQueueNames.mockReturnValue(['build-queue']);
      jobQueueService.getQueueStats.mockResolvedValue({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3
      });
      
      const report = await adminConsoleService.generateReport('queues', 7);
      
      expect(report.data).toEqual(expect.objectContaining({
        totalQueues: 1,
        queues: expect.any(Object)
      }));
    });

    test('should generate system report', async () => {
      const mockSystemHealth = { status: 'healthy' };
      monitoringService.getSystemHealth.mockResolvedValue(mockSystemHealth);
      
      const report = await adminConsoleService.generateReport('system', 7);
      
      expect(report.data).toBe(mockSystemHealth);
    });

    test('should throw error for unknown report type', async () => {
      await expect(adminConsoleService.generateReport('unknown', 7)).rejects.toThrow('Unknown report type: unknown');
    });
  });
});