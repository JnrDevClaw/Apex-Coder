const metricsCollector = require('../../services/metrics-collector');
const redisService = require('../../services/redis');

// Mock Redis service
jest.mock('../../services/redis');

describe('MetricsCollector', () => {
  let mockRedis;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Redis client
    mockRedis = {
      hset: jest.fn().mockResolvedValue(1),
      incr: jest.fn().mockResolvedValue(1),
      incrbyfloat: jest.fn().mockResolvedValue(1.5),
      expire: jest.fn().mockResolvedValue(1),
      zadd: jest.fn().mockResolvedValue(1),
      zremrangebyscore: jest.fn().mockResolvedValue(1),
      zremrangebyrank: jest.fn().mockResolvedValue(1),
      zrange: jest.fn().mockResolvedValue([]),
      zcount: jest.fn().mockResolvedValue(0),
      get: jest.fn().mockResolvedValue('0')
    };
    
    redisService.connect.mockResolvedValue(mockRedis);
    
    // Reset metrics collector state
    metricsCollector.initialized = false;
    metricsCollector.redis = null;
  });

  describe('initialization', () => {
    test('should initialize successfully', async () => {
      await metricsCollector.initialize();
      
      expect(metricsCollector.initialized).toBe(true);
      expect(metricsCollector.redis).toBe(mockRedis);
      expect(redisService.connect).toHaveBeenCalled();
    });

    test('should handle initialization failure', async () => {
      const error = new Error('Redis connection failed');
      redisService.connect.mockRejectedValue(error);
      
      await expect(metricsCollector.initialize()).rejects.toThrow('Redis connection failed');
      expect(metricsCollector.initialized).toBe(false);
    });
  });

  describe('build metrics recording', () => {
    beforeEach(async () => {
      await metricsCollector.initialize();
    });

    test('should record build start', async () => {
      const buildId = 'build-123';
      const projectId = 'project-456';
      const orgId = 'org-789';
      
      await metricsCollector.recordBuildStart(buildId, projectId, orgId);
      
      expect(mockRedis.hset).toHaveBeenCalledWith(
        'metrics:build:build-123',
        expect.objectContaining({
          buildId,
          projectId,
          orgId,
          status: 'running'
        })
      );
      expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('metrics:builds:'));
      expect(mockRedis.zadd).toHaveBeenCalledWith(
        'metrics:builds_per_sec',
        expect.any(Number),
        buildId
      );
    });

    test('should record build completion - success', async () => {
      const buildId = 'build-123';
      const duration = 300000; // 5 minutes
      const selfFixIterations = 2;
      
      await metricsCollector.recordBuildComplete(buildId, true, duration, selfFixIterations);
      
      expect(mockRedis.hset).toHaveBeenCalledWith(
        'metrics:build:build-123',
        expect.objectContaining({
          status: 'completed',
          duration,
          selfFixIterations
        })
      );
      expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('builds_success'));
      expect(mockRedis.zadd).toHaveBeenCalledWith('metrics:build_times', duration, expect.any(String));
    });

    test('should record build completion - failure', async () => {
      const buildId = 'build-123';
      const duration = 180000; // 3 minutes
      const errorMessage = 'Build failed due to syntax error';
      
      await metricsCollector.recordBuildComplete(buildId, false, duration, 0, errorMessage);
      
      expect(mockRedis.hset).toHaveBeenCalledWith(
        'metrics:build:build-123',
        expect.objectContaining({
          status: 'failed',
          duration,
          selfFixIterations: 0,
          errorMessage
        })
      );
      expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('builds_failed'));
    });

    test('should not record when not initialized', async () => {
      metricsCollector.initialized = false;
      
      await metricsCollector.recordBuildStart('build-123', 'project-456', 'org-789');
      
      expect(mockRedis.hset).not.toHaveBeenCalled();
    });
  });

  describe('deployment metrics recording', () => {
    beforeEach(async () => {
      await metricsCollector.initialize();
    });

    test('should record deployment start', async () => {
      const deploymentId = 'deploy-123';
      const buildId = 'build-456';
      const deploymentType = 'aws:ecs';
      
      await metricsCollector.recordDeploymentStart(deploymentId, buildId, deploymentType);
      
      expect(mockRedis.hset).toHaveBeenCalledWith(
        'metrics:deployment:deploy-123',
        expect.objectContaining({
          deploymentId,
          buildId,
          deploymentType,
          status: 'deploying'
        })
      );
      expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('deployments'));
    });

    test('should record deployment completion', async () => {
      const deploymentId = 'deploy-123';
      const duration = 120000; // 2 minutes
      const endpoint = 'https://myapp.example.com';
      
      await metricsCollector.recordDeploymentComplete(deploymentId, true, duration, endpoint);
      
      expect(mockRedis.hset).toHaveBeenCalledWith(
        'metrics:deployment:deploy-123',
        expect.objectContaining({
          status: 'deployed',
          duration,
          endpoint
        })
      );
      expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('deployments_success'));
    });
  });

  describe('cost tracking', () => {
    beforeEach(async () => {
      await metricsCollector.initialize();
    });

    test('should record cost', async () => {
      const buildId = 'build-123';
      const costType = 'llm_tokens';
      const amount = 2.50;
      
      await metricsCollector.recordCost(buildId, costType, amount);
      
      expect(mockRedis.hset).toHaveBeenCalledWith(
        'metrics:cost:build-123',
        expect.objectContaining({
          buildId,
          costType,
          amount,
          currency: 'USD'
        })
      );
      expect(mockRedis.incrbyfloat).toHaveBeenCalledWith(
        expect.stringContaining('cost_llm_tokens'),
        amount
      );
    });

    test('should record cost with custom currency', async () => {
      const buildId = 'build-123';
      const costType = 'aws_compute';
      const amount = 1.75;
      const currency = 'EUR';
      
      await metricsCollector.recordCost(buildId, costType, amount, currency);
      
      expect(mockRedis.hset).toHaveBeenCalledWith(
        'metrics:cost:build-123',
        expect.objectContaining({
          currency
        })
      );
    });
  });

  describe('LLM usage tracking', () => {
    beforeEach(async () => {
      await metricsCollector.initialize();
    });

    test('should record LLM usage', async () => {
      const buildId = 'build-123';
      const provider = 'openai';
      const model = 'gpt-4';
      const inputTokens = 1000;
      const outputTokens = 500;
      const cost = 0.03;
      
      await metricsCollector.recordLLMUsage(buildId, provider, model, inputTokens, outputTokens, cost);
      
      expect(mockRedis.hset).toHaveBeenCalledWith(
        expect.stringContaining('metrics:llm:build-123'),
        expect.objectContaining({
          buildId,
          provider,
          model,
          inputTokens,
          outputTokens,
          cost
        })
      );
      expect(mockRedis.incr).toHaveBeenCalledWith(
        expect.stringContaining('tokens_openai'),
        1500 // inputTokens + outputTokens
      );
    });
  });

  describe('metrics retrieval', () => {
    beforeEach(async () => {
      await metricsCollector.initialize();
    });

    test('should get build metrics', async () => {
      // Mock Redis responses for build metrics
      mockRedis.get
        .mockResolvedValueOnce('10') // total builds
        .mockResolvedValueOnce('8')  // successful builds
        .mockResolvedValueOnce('2'); // failed builds
      
      mockRedis.zrange
        .mockResolvedValueOnce(['build1:300000', '300000', 'build2:400000', '400000']) // build times
        .mockResolvedValueOnce(['build1:2', '2', 'build2:1', '1']); // self-fix iterations
      
      const metrics = await metricsCollector.getBuildMetrics(1);
      
      expect(metrics).toEqual(expect.objectContaining({
        totalBuilds: 10,
        successfulBuilds: 8,
        failedBuilds: 2,
        averageBuildTime: 350000,
        medianBuildTime: 350000,
        averageSelfFixIterations: '1.50'
      }));
    });

    test('should get deployment metrics', async () => {
      mockRedis.get
        .mockResolvedValueOnce('5') // total deployments
        .mockResolvedValueOnce('4') // successful deployments
        .mockResolvedValueOnce('1'); // failed deployments
      
      const metrics = await metricsCollector.getDeploymentMetrics(1);
      
      expect(metrics).toEqual(expect.objectContaining({
        totalDeployments: 5,
        successfulDeployments: 4,
        failedDeployments: 1
      }));
    });

    test('should get cost metrics', async () => {
      mockRedis.get
        .mockResolvedValueOnce('10.50') // llm_tokens cost
        .mockResolvedValueOnce('25.75') // aws_compute cost
        .mockResolvedValueOnce('5.25')  // aws_storage cost
        .mockResolvedValueOnce('2.00'); // aws_network cost
      
      const metrics = await metricsCollector.getCostMetrics(1);
      
      expect(metrics).toEqual(expect.objectContaining({
        totalCost: '43.50',
        costByType: {
          llm_tokens: 10.50,
          aws_compute: 25.75,
          aws_storage: 5.25,
          aws_network: 2.00
        }
      }));
    });

    test('should return null when not initialized', async () => {
      metricsCollector.initialized = false;
      
      const metrics = await metricsCollector.getBuildMetrics();
      
      expect(metrics).toBeNull();
    });
  });

  describe('current metrics', () => {
    beforeEach(async () => {
      await metricsCollector.initialize();
    });

    test('should get current builds per second', async () => {
      mockRedis.zcount.mockResolvedValue(5);
      
      const buildsPerSecond = await metricsCollector.getCurrentBuildsPerSecond();
      
      expect(buildsPerSecond).toBe(5);
      expect(mockRedis.zcount).toHaveBeenCalledWith(
        'metrics:builds_per_sec',
        expect.any(Number),
        expect.any(Number)
      );
    });

    test('should get today total cost', async () => {
      mockRedis.get
        .mockResolvedValueOnce('15.25') // llm_tokens
        .mockResolvedValueOnce('30.50') // aws_compute
        .mockResolvedValueOnce('8.75')  // aws_storage
        .mockResolvedValueOnce('3.00'); // aws_network
      
      const totalCost = await metricsCollector.getTodayTotalCost();
      
      expect(totalCost).toBe(57.50);
    });
  });

  describe('alert checking', () => {
    beforeEach(async () => {
      await metricsCollector.initialize();
    });

    test('should check alerts for high failure rate', async () => {
      mockRedis.get
        .mockResolvedValueOnce('20') // total builds
        .mockResolvedValueOnce('12'); // failed builds
      
      const alerts = await metricsCollector.checkAlerts();
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('high_failure_rate');
      expect(alerts[0].severity).toBe('warning');
    });

    test('should check alerts for cost threshold', async () => {
      mockRedis.get
        .mockResolvedValueOnce('150.00') // llm_tokens cost (exceeds $100 threshold)
        .mockResolvedValueOnce('0')      // aws_compute cost
        .mockResolvedValueOnce('0')      // aws_storage cost
        .mockResolvedValueOnce('0');     // aws_network cost
      
      const alerts = await metricsCollector.checkAlerts();
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('cost_threshold');
      expect(alerts[0].severity).toBe('critical');
    });

    test('should return no alerts for normal conditions', async () => {
      mockRedis.get
        .mockResolvedValueOnce('20') // total builds
        .mockResolvedValueOnce('2')  // failed builds (10% failure rate)
        .mockResolvedValueOnce('50.00') // llm_tokens cost
        .mockResolvedValueOnce('0')     // aws_compute cost
        .mockResolvedValueOnce('0')     // aws_storage cost
        .mockResolvedValueOnce('0');    // aws_network cost
      
      const alerts = await metricsCollector.checkAlerts();
      
      expect(alerts).toHaveLength(0);
    });
  });

  describe('utility methods', () => {
    test('should generate daily key', () => {
      const key = metricsCollector.getDailyKey('builds');
      
      expect(key).toMatch(/^metrics:builds:\d{4}-\d{2}-\d{2}$/);
    });

    test('should generate date key for days ago', () => {
      const key = metricsCollector.getDateKey(1); // Yesterday
      
      expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      expect(key).toBe(yesterday);
    });

    test('should handle cleanup', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await metricsCollector.cleanup();
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Cleaning up metrics older than'));
      
      consoleSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    beforeEach(async () => {
      await metricsCollector.initialize();
    });

    test('should handle empty build times for median calculation', async () => {
      mockRedis.get
        .mockResolvedValueOnce('0') // total builds
        .mockResolvedValueOnce('0') // successful builds
        .mockResolvedValueOnce('0'); // failed builds
      
      mockRedis.zrange.mockResolvedValue([]); // No build times
      
      const metrics = await metricsCollector.getBuildMetrics(1);
      
      expect(metrics.averageBuildTime).toBe(0);
      expect(metrics.medianBuildTime).toBe(0);
    });

    test('should handle odd number of build times for median', async () => {
      mockRedis.get
        .mockResolvedValueOnce('3') // total builds
        .mockResolvedValueOnce('3') // successful builds
        .mockResolvedValueOnce('0'); // failed builds
      
      mockRedis.zrange
        .mockResolvedValueOnce(['build1:100000', '100000', 'build2:200000', '200000', 'build3:300000', '300000'])
        .mockResolvedValueOnce([]); // No self-fix iterations
      
      const metrics = await metricsCollector.getBuildMetrics(1);
      
      expect(metrics.medianBuildTime).toBe(200000); // Middle value
    });

    test('should handle even number of build times for median', async () => {
      mockRedis.get
        .mockResolvedValueOnce('4') // total builds
        .mockResolvedValueOnce('4') // successful builds
        .mockResolvedValueOnce('0'); // failed builds
      
      mockRedis.zrange
        .mockResolvedValueOnce(['build1:100000', '100000', 'build2:200000', '200000', 'build3:300000', '300000', 'build4:400000', '400000'])
        .mockResolvedValueOnce([]); // No self-fix iterations
      
      const metrics = await metricsCollector.getBuildMetrics(1);
      
      expect(metrics.medianBuildTime).toBe(250000); // Average of middle two values
    });
  });
});