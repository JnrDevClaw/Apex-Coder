const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const telemetryService = require('../../services/telemetry');
const redisService = require('../../services/redis');

// Mock Redis service
jest.mock('../../services/redis', () => ({
  connect: jest.fn().mockResolvedValue({
    smembers: jest.fn().mockResolvedValue([]),
    sadd: jest.fn().mockResolvedValue(1),
    srem: jest.fn().mockResolvedValue(1),
    hset: jest.fn().mockResolvedValue(1),
    hgetall: jest.fn().mockResolvedValue({}),
    expire: jest.fn().mockResolvedValue(1),
    hincrby: jest.fn().mockResolvedValue(1),
    hincrbyfloat: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    lpush: jest.fn().mockResolvedValue(1),
    ltrim: jest.fn().mockResolvedValue('OK'),
    lrange: jest.fn().mockResolvedValue([]),
    del: jest.fn().mockResolvedValue(1)
  })
}));

describe('TelemetryService', () => {
  let mockRedis;

  beforeEach(async () => {
    mockRedis = await redisService.connect();
    await telemetryService.initialize();
  });

  afterEach(async () => {
    await telemetryService.shutdown();
    jest.clearAllMocks();
  });

  describe('User Opt-in Management', () => {
    it('should set user opt-in status', async () => {
      const userId = 'user123';
      const result = await telemetryService.setUserOptIn(userId, true);

      expect(result.success).toBe(true);
      expect(result.optIn).toBe(true);
      expect(mockRedis.sadd).toHaveBeenCalled();
    });

    it('should set user opt-out status', async () => {
      const userId = 'user123';
      const result = await telemetryService.setUserOptIn(userId, false);

      expect(result.success).toBe(true);
      expect(result.optIn).toBe(false);
      expect(mockRedis.srem).toHaveBeenCalled();
    });

    it('should get user opt-in status', async () => {
      const userId = 'user123';
      
      // First opt in
      await telemetryService.setUserOptIn(userId, true);
      let status = await telemetryService.getUserOptInStatus(userId);
      expect(status).toBe(true);

      // Then opt out
      await telemetryService.setUserOptIn(userId, false);
      status = await telemetryService.getUserOptInStatus(userId);
      expect(status).toBe(false);
    });
  });

  describe('Prompt Usage Recording', () => {
    it('should record prompt usage for opted-in user', async () => {
      const userId = 'user123';
      await telemetryService.setUserOptIn(userId, true);

      const promptData = {
        prompt: 'Test prompt',
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.01,
        responseTime: 1500,
        success: true
      };

      await telemetryService.recordPromptUsage(userId, 'coder', 'openai', 'gpt-4', promptData);

      expect(mockRedis.hset).toHaveBeenCalledWith(
        expect.stringContaining('telemetry:prompt:'),
        expect.objectContaining({
          agentRole: 'coder',
          provider: 'openai',
          model: 'gpt-4',
          inputTokens: 100,
          outputTokens: 50,
          cost: 0.01,
          responseTime: 1500,
          success: true
        })
      );
    });

    it('should not record prompt usage for opted-out user', async () => {
      const userId = 'user123';
      await telemetryService.setUserOptIn(userId, false);

      const promptData = {
        prompt: 'Test prompt',
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.01
      };

      await telemetryService.recordPromptUsage(userId, 'coder', 'openai', 'gpt-4', promptData);

      // Should not call hset for prompt recording
      expect(mockRedis.hset).not.toHaveBeenCalledWith(
        expect.stringContaining('telemetry:prompt:'),
        expect.any(Object)
      );
    });
  });

  describe('Usage Analytics', () => {
    it('should generate usage analytics', async () => {
      // Mock Redis responses for analytics
      mockRedis.keys.mockResolvedValue([
        'telemetry:daily:2024-01-01:role:coder',
        'telemetry:daily:2024-01-01:provider:openai'
      ]);
      
      mockRedis.hgetall
        .mockResolvedValueOnce({
          count: '10',
          inputTokens: '1000',
          outputTokens: '500',
          cost: '0.10',
          responseTime: '15000',
          successes: '9',
          failures: '1'
        })
        .mockResolvedValueOnce({
          count: '10',
          inputTokens: '1000',
          outputTokens: '500',
          cost: '0.10',
          successes: '9',
          failures: '1'
        });

      const analytics = await telemetryService.getUsageAnalytics(7);

      expect(analytics).toHaveProperty('totalPrompts');
      expect(analytics).toHaveProperty('totalTokens');
      expect(analytics).toHaveProperty('totalCost');
      expect(analytics).toHaveProperty('successRate');
      expect(analytics).toHaveProperty('agentRoleBreakdown');
      expect(analytics).toHaveProperty('providerBreakdown');
      expect(analytics).toHaveProperty('insights');
    });
  });

  describe('A/B Testing', () => {
    it('should create A/B test', async () => {
      const testName = 'questionnaire_optimization';
      const variants = ['variant_a', 'variant_b'];
      const trafficSplit = 0.5;

      const test = await telemetryService.createABTest(testName, variants, trafficSplit);

      expect(test).toHaveProperty('testId');
      expect(test.testName).toBe(testName);
      expect(test.variants).toEqual(variants);
      expect(test.trafficSplit).toBe(trafficSplit);
      expect(mockRedis.hset).toHaveBeenCalled();
    });

    it('should record A/B test event for opted-in user', async () => {
      const userId = 'user123';
      await telemetryService.setUserOptIn(userId, true);

      const testId = 'test123';
      const variant = 'variant_a';
      const event = 'conversion';

      await telemetryService.recordABTestEvent(testId, userId, variant, event, 1);

      expect(mockRedis.hincrby).toHaveBeenCalledWith(
        `telemetry:ab_event:${testId}:${variant}:${event}`,
        'count',
        1
      );
    });

    it('should get A/B test results', async () => {
      const testId = 'test123';
      
      mockRedis.hgetall.mockResolvedValueOnce({
        testId,
        testName: 'test',
        variants: JSON.stringify(['variant_a', 'variant_b']),
        startTime: '1640995200000',
        status: 'active'
      });

      mockRedis.keys.mockResolvedValue([
        `telemetry:ab_event:${testId}:variant_a:view`,
        `telemetry:ab_event:${testId}:variant_a:conversion`
      ]);

      mockRedis.hgetall
        .mockResolvedValueOnce({ count: '100' })
        .mockResolvedValueOnce({ count: '10' });

      const results = await telemetryService.getABTestResults(testId);

      expect(results).toHaveProperty('testId', testId);
      expect(results).toHaveProperty('results');
      expect(results).toHaveProperty('analysis');
    });
  });

  describe('Performance Benchmarks', () => {
    it('should record performance benchmark', async () => {
      const benchmarkType = 'build_time';
      const metrics = {
        duration: 120000,
        success: true,
        iterations: 2
      };

      await telemetryService.recordPerformanceBenchmark(benchmarkType, metrics);

      expect(mockRedis.hset).toHaveBeenCalledWith(
        expect.stringContaining(`telemetry:benchmark:${benchmarkType}:`),
        expect.objectContaining({
          benchmarkType,
          duration: 120000,
          success: true,
          iterations: 2
        })
      );
    });

    it('should get performance benchmarks', async () => {
      const benchmarkType = 'build_time';
      
      mockRedis.keys.mockResolvedValue([
        `telemetry:benchmark:${benchmarkType}:1640995200000`
      ]);

      mockRedis.hgetall.mockResolvedValue({
        benchmarkType,
        duration: '120000',
        success: 'true',
        iterations: '2',
        timestamp: '1640995200000'
      });

      mockRedis.lrange.mockResolvedValue(['120000', '110000', '130000']);

      const benchmarks = await telemetryService.getPerformanceBenchmarks(benchmarkType, 30);

      expect(benchmarks).toHaveProperty('benchmarkType', benchmarkType);
      expect(benchmarks).toHaveProperty('benchmarks');
      expect(benchmarks).toHaveProperty('averages');
    });
  });

  describe('Data Anonymization', () => {
    it('should hash user IDs consistently', () => {
      const userId = 'user123';
      const hash1 = telemetryService.hashUserId(userId);
      const hash2 = telemetryService.hashUserId(userId);

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(userId);
      expect(hash1.length).toBe(16);
    });

    it('should hash content consistently', () => {
      const content = 'This is test content';
      const hash1 = telemetryService.hashContent(content);
      const hash2 = telemetryService.hashContent(content);

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(content);
      expect(hash1.length).toBe(16);
    });
  });

  describe('Cleanup', () => {
    it('should clean up user telemetry data on opt-out', async () => {
      const userId = 'user123';
      
      // First opt in and record some data
      await telemetryService.setUserOptIn(userId, true);
      
      // Mock existing prompt data
      mockRedis.keys.mockResolvedValue(['telemetry:prompt:session123:1640995200000']);
      mockRedis.hgetall.mockResolvedValue({
        userId: telemetryService.hashUserId(userId),
        agentRole: 'coder'
      });

      // Then opt out (which should trigger cleanup)
      await telemetryService.setUserOptIn(userId, false);

      expect(mockRedis.srem).toHaveBeenCalled();
      expect(mockRedis.keys).toHaveBeenCalled();
    });
  });
});