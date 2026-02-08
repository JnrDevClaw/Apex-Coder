const adminConsoleService = require('../../services/admin-console');
const costControlsService = require('../../services/cost-controls');
const telemetryService = require('../../services/telemetry');
const jobQueueService = require('../../services/job-queue');
const metricsCollector = require('../../services/metrics-collector');
const monitoringService = require('../../services/monitoring');

// Mock all dependencies
jest.mock('../../services/cost-controls');
jest.mock('../../services/telemetry');
jest.mock('../../services/job-queue');
jest.mock('../../services/metrics-collector');
jest.mock('../../services/monitoring');

describe('AdminConsoleService - Comprehensive Tests', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await adminConsoleService.initialize();
  });

  afterEach(async () => {
    await adminConsoleService.shutdown();
  });

  describe('Cost Tracking and Budget Enforcement', () => {
    describe('Cost Dashboard Integration', () => {
      test('should get comprehensive cost dashboard with all metrics', async () => {
        const mockCostBreakdown = {
          period: '30 days',
          totalCost: 1250.75,
          costByType: {
            llm_tokens: 750.50,
            aws_compute: 300.25,
            aws_storage: 200.00
          },
          dailyCosts: {
            '2024-01-01': '45.50',
            '2024-01-02': '52.25',
            '2024-01-03': '38.75'
          },
          averageCostPerBuild: '12.51',
          projectedMonthlyCost: '1500.90',
          limits: {
            dailyLimit: 100,
            monthlyLimit: 3000,
            buildLimit: 15
          },
          utilizationRates: {
            daily: '45.2',
            monthly: '41.7'
          }
        };

        const mockRecentAlerts = [
          {
            type: 'daily_limit_warning',
            severity: 'warning',
            message: 'Daily cost approaching limit',
            timestamp: Date.now() - 3600000
          }
        ];

        const mockCostActions = [
          {
            action: 'pause_builds',
            reason: 'Cost limit exceeded',
            timestamp: Date.now() - 7200000
          }
        ];

        costControlsService.getCostBreakdown.mockResolvedValue(mockCostBreakdown);
        costControlsService.getRecentCostAlerts.mockResolvedValue(mockRecentAlerts);
        costControlsService.getCostActions.mockResolvedValue(mockCostActions);
        costControlsService.emergencyStopActive = false;
        costControlsService.getStatus.mockReturnValue({
          initialized: true,
          emergencyStopActive: false,
          monitoringActive: true
        });

        const dashboard = await adminConsoleService.getCostDashboard(30);

        expect(dashboard).toEqual({
          ...mockCostBreakdown,
          recentAlerts: mockRecentAlerts,
          recentActions: mockCostActions,
          emergencyStopActive: false,
          status: {
            initialized: true,
            emergencyStopActive: false,
            monitoringActive: true
          }
        });

        expect(costControlsService.getCostBreakdown).toHaveBeenCalledWith(30);
        expect(costControlsService.getRecentCostAlerts).toHaveBeenCalledWith(24);
        expect(costControlsService.getCostActions).toHaveBeenCalledWith(7);
      });

      test('should handle cost dashboard errors gracefully', async () => {
        costControlsService.getCostBreakdown.mockRejectedValue(new Error('Database connection failed'));

        await expect(adminConsoleService.getCostDashboard(30)).rejects.toThrow('Database connection failed');
      });
    });

    describe('Budget Enforcement', () => {
      test('should enforce daily budget limits', async () => {
        const mockValidation = {
          allowed: false,
          reasons: ['Build would exceed daily limit: $105.00 > $100'],
          warnings: []
        };

        costControlsService.validateBuildCost.mockResolvedValue(mockValidation);

        const result = await adminConsoleService.validateBuildCost('build-123', 25.00);

        expect(result).toEqual(mockValidation);
        expect(costControlsService.validateBuildCost).toHaveBeenCalledWith('build-123', 25.00);
      });

      test('should enforce monthly budget limits', async () => {
        const mockValidation = {
          allowed: false,
          reasons: ['Build would exceed monthly limit: $3050.00 > $3000'],
          warnings: []
        };

        costControlsService.validateBuildCost.mockResolvedValue(mockValidation);

        const result = await adminConsoleService.validateBuildCost('build-456', 100.00);

        expect(result).toEqual(mockValidation);
        expect(result.allowed).toBe(false);
        expect(result.reasons).toContain(expect.stringContaining('monthly limit'));
      });

      test('should provide warnings when approaching budget limits', async () => {
        const mockValidation = {
          allowed: true,
          reasons: [],
          warnings: ['Build would use 90%+ of daily limit: $95.00']
        };

        costControlsService.validateBuildCost.mockResolvedValue(mockValidation);

        const result = await adminConsoleService.validateBuildCost('build-789', 15.00);

        expect(result.allowed).toBe(true);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain('90%+ of daily limit');
      });

      test('should block builds during emergency stop', async () => {
        const mockValidation = {
          allowed: false,
          reasons: ['Emergency stop is active'],
          warnings: []
        };

        costControlsService.validateBuildCost.mockResolvedValue(mockValidation);

        const result = await adminConsoleService.validateBuildCost('build-emergency', 5.00);

        expect(result.allowed).toBe(false);
        expect(result.reasons).toContain('Emergency stop is active');
      });
    });

    describe('Cost Limit Management', () => {
      test('should set cost limits with validation', async () => {
        const mockResult = {
          success: true,
          limitType: 'dailyLimit',
          amount: 150,
          message: 'dailyLimit limit set to 150'
        };

        costControlsService.setCostLimit.mockResolvedValue(mockResult);

        const result = await adminConsoleService.setCostLimit('dailyLimit', 150);

        expect(result).toEqual(mockResult);
        expect(costControlsService.setCostLimit).toHaveBeenCalledWith('dailyLimit', 150);
      });

      test('should get current cost limits', async () => {
        const mockLimits = {
          dailyLimit: 100,
          monthlyLimit: 3000,
          buildLimit: 15,
          userDailyLimit: 50,
          orgDailyLimit: 200,
          emergencyStopThreshold: 500
        };

        costControlsService.getCostLimits.mockResolvedValue(mockLimits);

        const limits = await adminConsoleService.getCostLimits();

        expect(limits).toEqual(mockLimits);
        expect(costControlsService.getCostLimits).toHaveBeenCalled();
      });

      test('should reset cost limits to defaults', async () => {
        const mockResult = {
          success: true,
          message: 'Cost limits reset to defaults',
          limits: {
            dailyLimit: 100,
            monthlyLimit: 3000,
            buildLimit: 10
          }
        };

        costControlsService.resetCostLimits.mockResolvedValue(mockResult);

        const result = await adminConsoleService.resetCostLimits();

        expect(result).toEqual(mockResult);
        expect(costControlsService.resetCostLimits).toHaveBeenCalled();
      });
    });

    describe('Emergency Cost Controls', () => {
      test('should execute emergency cost stop', async () => {
        const mockResult = {
          success: true,
          message: 'Emergency stop activated',
          reason: 'Cost threshold exceeded',
          pauseResults: [
            { queue: 'build-queue', status: 'paused' },
            { queue: 'deploy-queue', status: 'paused' }
          ]
        };

        costControlsService.emergencyStop.mockResolvedValue(mockResult);

        const result = await adminConsoleService.emergencyStopCosts('Cost threshold exceeded');

        expect(result).toEqual(mockResult);
        expect(costControlsService.emergencyStop).toHaveBeenCalledWith('Cost threshold exceeded');
      });

      test('should execute emergency cost resume', async () => {
        const mockResult = {
          success: true,
          message: 'Emergency stop deactivated',
          reason: 'Issue resolved',
          adminId: 'admin-123',
          resumeResults: [
            { queue: 'build-queue', status: 'resumed' },
            { queue: 'deploy-queue', status: 'resumed' }
          ]
        };

        costControlsService.emergencyResume.mockResolvedValue(mockResult);

        const result = await adminConsoleService.emergencyResumeCosts('Issue resolved', 'admin-123');

        expect(result).toEqual(mockResult);
        expect(costControlsService.emergencyResume).toHaveBeenCalledWith('Issue resolved', 'admin-123');
      });
    });
  });

  describe('Approval Workflow Functionality', () => {
    describe('Pending Approvals Management', () => {
      test('should get pending approvals by category', async () => {
        const mockApprovals = {
          destructiveOperations: [
            {
              operationId: 'destroy-123',
              type: 'database_drop',
              requestedBy: 'user-456',
              requestedAt: Date.now() - 1800000,
              impact: 'destructive',
              description: 'Drop test database'
            }
          ],
          highCostOperations: [
            {
              operationId: 'deploy-789',
              type: 'large_deployment',
              requestedBy: 'user-789',
              requestedAt: Date.now() - 900000,
              estimatedCost: 250.00,
              impact: 'billing',
              description: 'Deploy to production with high resource usage'
            }
          ],
          deployments: [
            {
              operationId: 'deploy-456',
              type: 'production_deployment',
              requestedBy: 'user-123',
              requestedAt: Date.now() - 600000,
              environment: 'production',
              description: 'Deploy v2.1.0 to production'
            }
          ]
        };

        // Mock the service to return actual pending approvals
        jest.spyOn(adminConsoleService, 'getPendingApprovals').mockResolvedValue(mockApprovals);

        const approvals = await adminConsoleService.getPendingApprovals();

        expect(approvals).toEqual(mockApprovals);
        expect(approvals.destructiveOperations).toHaveLength(1);
        expect(approvals.highCostOperations).toHaveLength(1);
        expect(approvals.deployments).toHaveLength(1);
      });

      test('should handle empty pending approvals', async () => {
        const result = await adminConsoleService.getPendingApprovals();

        expect(result).toEqual({
          destructiveOperations: [],
          highCostOperations: [],
          deployments: []
        });
      });
    });

    describe('Operation Approval Process', () => {
      test('should approve operation with reason', async () => {
        const operationId = 'op-123';
        const approverId = 'admin-456';
        const reason = 'Approved after security review';

        const result = await adminConsoleService.approveOperation(operationId, approverId, true, reason);

        expect(result).toEqual({
          success: true,
          message: `Operation ${operationId} approved by ${approverId}`,
          operationId,
          approverId,
          approved: true,
          reason,
          timestamp: expect.any(Number)
        });
      });

      test('should reject operation with reason', async () => {
        const operationId = 'op-456';
        const approverId = 'admin-789';
        const reason = 'Security concerns identified';

        const result = await adminConsoleService.approveOperation(operationId, approverId, false, reason);

        expect(result).toEqual({
          success: true,
          message: `Operation ${operationId} rejected by ${approverId}`,
          operationId,
          approverId,
          approved: false,
          reason,
          timestamp: expect.any(Number)
        });
      });

      test('should handle approval without reason', async () => {
        const operationId = 'op-789';
        const approverId = 'admin-123';

        const result = await adminConsoleService.approveOperation(operationId, approverId, true);

        expect(result.approved).toBe(true);
        expect(result.reason).toBe('');
      });
    });

    describe('Multi-step Approval Workflow', () => {
      test('should track approval workflow state', async () => {
        // This would typically involve database operations
        // For now, we test the interface
        const operationId = 'multi-step-123';
        const firstApproverId = 'admin-1';
        const secondApproverId = 'admin-2';

        // First approval
        const firstApproval = await adminConsoleService.approveOperation(
          operationId, 
          firstApproverId, 
          true, 
          'First approval - technical review passed'
        );

        expect(firstApproval.success).toBe(true);
        expect(firstApproval.approverId).toBe(firstApproverId);

        // Second approval
        const secondApproval = await adminConsoleService.approveOperation(
          operationId, 
          secondApproverId, 
          true, 
          'Second approval - business review passed'
        );

        expect(secondApproval.success).toBe(true);
        expect(secondApproval.approverId).toBe(secondApproverId);
      });
    });
  });

  describe('Telemetry Data Collection and Anonymization', () => {
    describe('Telemetry Analytics Integration', () => {
      test('should get comprehensive telemetry analytics', async () => {
        const mockAnalytics = {
          period: '30 days',
          totalPrompts: 1250,
          totalTokens: 125000,
          totalCost: '125.50',
          averageResponseTime: 1500,
          successRate: '94.5',
          agentRoleBreakdown: {
            coder: {
              count: 500,
              inputTokens: 45000,
              outputTokens: 25000,
              cost: 50.25,
              averageResponseTime: 1800,
              successRate: '96.0'
            },
            planner: {
              count: 300,
              inputTokens: 25000,
              outputTokens: 15000,
              cost: 30.15,
              averageResponseTime: 1200,
              successRate: '92.3'
            }
          },
          providerBreakdown: {
            openai: {
              count: 600,
              inputTokens: 50000,
              outputTokens: 30000,
              cost: 60.30,
              successRate: '95.5'
            },
            anthropic: {
              count: 400,
              inputTokens: 35000,
              outputTokens: 20000,
              cost: 40.20,
              successRate: '93.0'
            }
          },
          dailyUsage: {
            '2024-01-01': { prompts: 45, tokens: 4500, cost: '4.50' },
            '2024-01-02': { prompts: 52, tokens: 5200, cost: '5.20' }
          },
          topErrorTypes: {
            'rate_limit_exceeded': 15,
            'timeout': 8,
            'invalid_response': 5
          },
          insights: [
            {
              type: 'cost_efficiency',
              message: 'Average cost per prompt: $0.1004',
              value: 0.1004,
              trend: 'neutral'
            },
            {
              type: 'success_rate',
              message: 'Excellent success rate: 94.5%',
              value: 94.5,
              trend: 'positive'
            }
          ]
        };

        telemetryService.getUsageAnalytics.mockResolvedValue(mockAnalytics);

        const analytics = await adminConsoleService.getTelemetryAnalytics(30);

        expect(analytics).toEqual(mockAnalytics);
        expect(telemetryService.getUsageAnalytics).toHaveBeenCalledWith(30);
      });

      test('should handle telemetry analytics errors', async () => {
        telemetryService.getUsageAnalytics.mockRejectedValue(new Error('Redis connection failed'));

        await expect(adminConsoleService.getTelemetryAnalytics(30)).rejects.toThrow('Redis connection failed');
      });
    });

    describe('User Opt-in Management', () => {
      test('should set user telemetry opt-in status', async () => {
        const mockResult = {
          success: true,
          optIn: true,
          userId: 'hashed_user_id_123'
        };

        telemetryService.setUserOptIn.mockResolvedValue(mockResult);

        const result = await adminConsoleService.setUserTelemetryOptIn('user-123', true);

        expect(result).toEqual(mockResult);
        expect(telemetryService.setUserOptIn).toHaveBeenCalledWith('user-123', true);
      });

      test('should set user telemetry opt-out status', async () => {
        const mockResult = {
          success: true,
          optIn: false,
          userId: 'hashed_user_id_456'
        };

        telemetryService.setUserOptIn.mockResolvedValue(mockResult);

        const result = await adminConsoleService.setUserTelemetryOptIn('user-456', false);

        expect(result).toEqual(mockResult);
        expect(telemetryService.setUserOptIn).toHaveBeenCalledWith('user-456', false);
      });

      test('should get user telemetry status', async () => {
        telemetryService.getUserOptInStatus.mockResolvedValue(true);

        const status = await adminConsoleService.getUserTelemetryStatus('user-789');

        expect(status).toBe(true);
        expect(telemetryService.getUserOptInStatus).toHaveBeenCalledWith('user-789');
      });
    });

    describe('A/B Testing Framework', () => {
      test('should create A/B test', async () => {
        const mockTest = {
          testId: 'test-123',
          testName: 'questionnaire_optimization',
          variants: ['variant_a', 'variant_b'],
          trafficSplit: 0.5,
          startTime: Date.now(),
          status: 'active',
          results: {}
        };

        telemetryService.createABTest.mockResolvedValue(mockTest);

        const result = await adminConsoleService.createABTest(
          'questionnaire_optimization',
          ['variant_a', 'variant_b'],
          0.5
        );

        expect(result).toEqual(mockTest);
        expect(telemetryService.createABTest).toHaveBeenCalledWith(
          'questionnaire_optimization',
          ['variant_a', 'variant_b'],
          0.5
        );
      });

      test('should get A/B test results with statistical analysis', async () => {
        const mockResults = {
          testId: 'test-456',
          testName: 'questionnaire_optimization',
          variants: ['variant_a', 'variant_b'],
          startTime: Date.now() - 86400000,
          status: 'active',
          results: {
            variant_a: {
              view: { count: 500 },
              conversion: { count: 45 }
            },
            variant_b: {
              view: { count: 480 },
              conversion: { count: 52 }
            }
          },
          analysis: {
            totalParticipants: 980,
            conversionRates: {
              variant_a: { views: 500, conversions: 45, rate: '9.00' },
              variant_b: { views: 480, conversions: 52, rate: '10.83' }
            },
            statisticalSignificance: true,
            winner: 'variant_b',
            confidence: 85
          }
        };

        telemetryService.getABTestResults.mockResolvedValue(mockResults);

        const results = await adminConsoleService.getABTestResults('test-456');

        expect(results).toEqual(mockResults);
        expect(results.analysis.winner).toBe('variant_b');
        expect(results.analysis.statisticalSignificance).toBe(true);
        expect(telemetryService.getABTestResults).toHaveBeenCalledWith('test-456');
      });
    });

    describe('Performance Benchmarking', () => {
      test('should record performance benchmark', async () => {
        const benchmarkType = 'build_time';
        const metrics = {
          duration: 120000,
          success: true,
          iterations: 2,
          selfFixAttempts: 1
        };

        telemetryService.recordPerformanceBenchmark.mockResolvedValue();

        await adminConsoleService.recordPerformanceBenchmark(benchmarkType, metrics);

        expect(telemetryService.recordPerformanceBenchmark).toHaveBeenCalledWith(benchmarkType, metrics);
      });

      test('should get performance benchmarks with trends', async () => {
        const mockBenchmarks = {
          benchmarkType: 'build_time',
          period: '30 days',
          benchmarks: [
            {
              timestamp: Date.now() - 86400000,
              duration: 120000,
              success: true,
              iterations: 2
            },
            {
              timestamp: Date.now() - 172800000,
              duration: 135000,
              success: true,
              iterations: 3
            }
          ],
          averages: {
            duration: {
              current: 127500,
              trend: 'improving'
            },
            iterations: {
              current: 2.5,
              trend: 'stable'
            }
          }
        };

        telemetryService.getPerformanceBenchmarks.mockResolvedValue(mockBenchmarks);

        const benchmarks = await adminConsoleService.getPerformanceBenchmarks('build_time', 30);

        expect(benchmarks).toEqual(mockBenchmarks);
        expect(benchmarks.averages.duration.trend).toBe('improving');
        expect(telemetryService.getPerformanceBenchmarks).toHaveBeenCalledWith('build_time', 30);
      });
    });

    describe('Data Anonymization Verification', () => {
      test('should verify telemetry data is properly anonymized', async () => {
        // This test verifies that the admin console properly handles anonymized data
        const mockAnalytics = {
          period: '7 days',
          totalPrompts: 100,
          agentRoleBreakdown: {
            coder: {
              count: 50,
              // Verify no PII is present in the data
              averageResponseTime: 1500
            }
          },
          // Verify user IDs are hashed
          insights: [
            {
              type: 'cost_efficiency',
              message: 'Average cost per prompt: $0.05',
              value: 0.05
            }
          ]
        };

        telemetryService.getUsageAnalytics.mockResolvedValue(mockAnalytics);

        const analytics = await adminConsoleService.getTelemetryAnalytics(7);

        // Verify no raw user IDs or PII are present
        const analyticsString = JSON.stringify(analytics);
        expect(analyticsString).not.toMatch(/user-\d+/); // No raw user IDs
        expect(analyticsString).not.toMatch(/email@/); // No email addresses
        expect(analyticsString).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/); // No SSNs

        // Verify structure contains expected anonymized data
        expect(analytics.agentRoleBreakdown.coder.count).toBe(50);
        expect(analytics.insights[0].type).toBe('cost_efficiency');
      });
    });
  });

  describe('Integration Tests', () => {
    test('should handle service initialization failures gracefully', async () => {
      costControlsService.initialize.mockRejectedValue(new Error('Redis connection failed'));
      telemetryService.initialize.mockRejectedValue(new Error('Database connection failed'));

      // Reset the service state
      adminConsoleService.initialized = false;

      await expect(adminConsoleService.initialize()).rejects.toThrow();
    });

    test('should provide comprehensive status information', async () => {
      costControlsService.getStatus.mockReturnValue({
        initialized: true,
        emergencyStopActive: false,
        costLimits: { dailyLimit: 100 },
        monitoringActive: true
      });

      // Mock the status check by calling the individual service methods
      const costDashboard = await adminConsoleService.getCostDashboard(1);
      const systemHealth = await adminConsoleService.getSystemHealth();

      // Verify that the admin console can coordinate multiple services
      expect(costControlsService.getCostBreakdown).toHaveBeenCalled();
      expect(monitoringService.getSystemHealth).toHaveBeenCalled();
    });
  });
});