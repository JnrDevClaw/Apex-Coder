const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const costControlsService = require('../../services/cost-controls');
const metricsCollector = require('../../services/metrics-collector');
const jobQueueService = require('../../services/job-queue');
const redisService = require('../../services/redis');

// Mock dependencies
jest.mock('../../services/metrics-collector', () => ({
  getTodayTotalCost: jest.fn().mockResolvedValue(50),
  getCostMetrics: jest.fn().mockResolvedValue({
    totalCost: '150.00',
    costByType: {
      llm_tokens: 100,
      aws_compute: 50
    },
    dailyCosts: {
      '2024-01-01': '50.00'
    }
  }),
  getBuildMetrics: jest.fn().mockResolvedValue({
    totalBuilds: 10
  })
}));

jest.mock('../../services/job-queue', () => ({
  isInitialized: jest.fn().mockReturnValue(true),
  getQueueNames: jest.fn().mockReturnValue(['build-queue', 'deploy-queue']),
  pauseQueue: jest.fn().mockResolvedValue(true),
  resumeQueue: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../services/redis', () => ({
  connect: jest.fn().mockResolvedValue({
    hgetall: jest.fn().mockResolvedValue({}),
    hset: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    expire: jest.fn().mockResolvedValue(1)
  })
}));

describe('CostControlsService', () => {
  let mockRedis;

  beforeEach(async () => {
    mockRedis = await redisService.connect();
    await costControlsService.initialize();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await costControlsService.shutdown();
  });

  describe('Cost Limit Management', () => {
    it('should set cost limit', async () => {
      const result = await costControlsService.setCostLimit('dailyLimit', 200);

      expect(result.success).toBe(true);
      expect(result.limitType).toBe('dailyLimit');
      expect(result.amount).toBe(200);
      expect(mockRedis.hset).toHaveBeenCalled();
    });

    it('should reject negative cost limits', async () => {
      await expect(costControlsService.setCostLimit('dailyLimit', -50))
        .rejects.toThrow('Cost limit must be non-negative');
    });

    it('should reject invalid limit types', async () => {
      await expect(costControlsService.setCostLimit('invalidLimit', 100))
        .rejects.toThrow('Invalid limit type');
    });

    it('should get cost limits', async () => {
      const limits = await costControlsService.getCostLimits();

      expect(limits).toHaveProperty('dailyLimit');
      expect(limits).toHaveProperty('monthlyLimit');
      expect(limits).toHaveProperty('buildLimit');
      expect(limits).toHaveProperty('emergencyStopThreshold');
    });

    it('should reset cost limits to defaults', async () => {
      // First set a custom limit
      await costControlsService.setCostLimit('dailyLimit', 200);
      
      // Then reset
      const result = await costControlsService.resetCostLimits();
      const limits = await costControlsService.getCostLimits();

      expect(result.success).toBe(true);
      expect(limits.dailyLimit).toBe(100); // Default value
    });
  });

  describe('Cost Validation', () => {
    it('should validate build cost within limits', async () => {
      const validation = await costControlsService.validateBuildCost('build123', 5);

      expect(validation.allowed).toBe(true);
      expect(validation.reasons).toHaveLength(0);
    });

    it('should reject build cost exceeding build limit', async () => {
      const validation = await costControlsService.validateBuildCost('build123', 15);

      expect(validation.allowed).toBe(false);
      expect(validation.reasons).toContain(
        expect.stringContaining('Build cost ($15.00) exceeds limit ($10)')
      );
    });

    it('should reject build cost that would exceed daily limit', async () => {
      // Mock today's cost to be 95, so adding 10 would exceed 100 limit
      metricsCollector.getTodayTotalCost.mockResolvedValueOnce(95);
      
      const validation = await costControlsService.validateBuildCost('build123', 10);

      expect(validation.allowed).toBe(false);
      expect(validation.reasons).toContain(
        expect.stringContaining('Build would exceed daily limit')
      );
    });

    it('should warn when build approaches daily limit', async () => {
      // Mock today's cost to be 85, so adding 10 would be 95 (95% of 100 limit)
      metricsCollector.getTodayTotalCost.mockResolvedValueOnce(85);
      
      const validation = await costControlsService.validateBuildCost('build123', 10);

      expect(validation.allowed).toBe(true);
      expect(validation.warnings).toContain(
        expect.stringContaining('Build would use 90%+ of daily limit')
      );
    });

    it('should reject builds when emergency stop is active', async () => {
      // Activate emergency stop
      await costControlsService.emergencyStop('Test emergency');
      
      const validation = await costControlsService.validateBuildCost('build123', 5);

      expect(validation.allowed).toBe(false);
      expect(validation.reasons).toContain('Emergency stop is active');
    });
  });

  describe('Emergency Controls', () => {
    it('should activate emergency stop', async () => {
      const result = await costControlsService.emergencyStop('Cost threshold exceeded');

      expect(result.success).toBe(true);
      expect(result.reason).toBe('Cost threshold exceeded');
      expect(jobQueueService.pauseQueue).toHaveBeenCalledWith('build-queue');
      expect(jobQueueService.pauseQueue).toHaveBeenCalledWith('deploy-queue');
    });

    it('should not activate emergency stop if already active', async () => {
      // First activation
      await costControlsService.emergencyStop('First stop');
      
      // Second activation should not do anything
      const result = await costControlsService.emergencyStop('Second stop');
      
      // Should still return success but not call pause again
      expect(result.success).toBe(true);
    });

    it('should resume from emergency stop', async () => {
      // First activate emergency stop
      await costControlsService.emergencyStop('Test emergency');
      
      // Then resume
      const result = await costControlsService.emergencyResume('Emergency resolved', 'admin123');

      expect(result.success).toBe(true);
      expect(result.reason).toBe('Emergency resolved');
      expect(result.adminId).toBe('admin123');
      expect(jobQueueService.resumeQueue).toHaveBeenCalledWith('build-queue');
      expect(jobQueueService.resumeQueue).toHaveBeenCalledWith('deploy-queue');
    });

    it('should reject resume when emergency stop is not active', async () => {
      await expect(costControlsService.emergencyResume('Not needed', 'admin123'))
        .rejects.toThrow('Emergency stop is not active');
    });
  });

  describe('Cost Monitoring', () => {
    it('should check cost limits and generate alerts', async () => {
      // Mock high cost to trigger alerts
      metricsCollector.getTodayTotalCost.mockResolvedValueOnce(120);
      
      const result = await costControlsService.checkCostLimits();

      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].type).toBe('daily_limit_exceeded');
      expect(result.actions).toContain('pause_builds');
    });

    it('should generate warning when approaching cost limit', async () => {
      // Mock cost at 85 (85% of 100 limit)
      metricsCollector.getTodayTotalCost.mockResolvedValueOnce(85);
      
      const result = await costControlsService.checkCostLimits();

      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].type).toBe('daily_limit_warning');
      expect(result.actions).toHaveLength(0);
    });

    it('should trigger emergency stop on threshold breach', async () => {
      // Mock cost exceeding emergency threshold (500)
      metricsCollector.getTodayTotalCost.mockResolvedValueOnce(600);
      
      const result = await costControlsService.checkCostLimits();

      expect(result.alerts.some(alert => alert.type === 'emergency_stop_triggered')).toBe(true);
      expect(result.actions).toContain('emergency_stop');
    });
  });

  describe('Cost Breakdown and Reporting', () => {
    it('should get cost breakdown', async () => {
      const breakdown = await costControlsService.getCostBreakdown(30);

      expect(breakdown).toHaveProperty('period', '30 days');
      expect(breakdown).toHaveProperty('totalCost');
      expect(breakdown).toHaveProperty('costByType');
      expect(breakdown).toHaveProperty('dailyCosts');
      expect(breakdown).toHaveProperty('averageCostPerBuild');
      expect(breakdown).toHaveProperty('projectedMonthlyCost');
      expect(breakdown).toHaveProperty('limits');
      expect(breakdown).toHaveProperty('utilizationRates');
    });

    it('should calculate projected monthly cost', () => {
      const dailyCosts = {
        '2024-01-01': '10.00',
        '2024-01-02': '15.00',
        '2024-01-03': '12.00'
      };
      
      const projected = costControlsService.calculateProjectedMonthlyCost(dailyCosts);
      
      // Average is (10 + 15 + 12) / 3 = 12.33, projected monthly = 12.33 * 30 = 370.00
      expect(parseFloat(projected)).toBeCloseTo(370, 0);
    });
  });

  describe('Action Logging', () => {
    it('should record cost actions', async () => {
      await costControlsService.recordCostAction('pause_builds', 'Cost limit exceeded', { queues: 2 });

      expect(mockRedis.hset).toHaveBeenCalledWith(
        expect.stringContaining('cost_controls:action:'),
        expect.objectContaining({
          action: 'pause_builds',
          reason: 'Cost limit exceeded',
          data: JSON.stringify({ queues: 2 })
        })
      );
    });

    it('should get cost actions', async () => {
      mockRedis.keys.mockResolvedValue(['cost_controls:action:1640995200000']);
      mockRedis.hgetall.mockResolvedValue({
        action: 'pause_builds',
        reason: 'Cost limit exceeded',
        data: JSON.stringify({ queues: 2 }),
        timestamp: '1640995200000'
      });

      const actions = await costControlsService.getCostActions(7);

      expect(actions).toHaveLength(1);
      expect(actions[0]).toHaveProperty('action', 'pause_builds');
      expect(actions[0]).toHaveProperty('reason', 'Cost limit exceeded');
      expect(actions[0]).toHaveProperty('data', { queues: 2 });
    });
  });

  describe('Status and Health', () => {
    it('should return service status', () => {
      const status = costControlsService.getStatus();

      expect(status).toHaveProperty('initialized', true);
      expect(status).toHaveProperty('emergencyStopActive', false);
      expect(status).toHaveProperty('costLimits');
      expect(status).toHaveProperty('monitoringActive', true);
    });
  });
});