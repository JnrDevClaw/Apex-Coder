/**
 * Tests for ModelRouter initialization and provider registration
 */

const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const { ModelRouter, LLMProvider } = require('../../services/model-router');

describe('ModelRouter Initialization', () => {
  let router;

  beforeEach(() => {
    router = new ModelRouter();
  });

  afterEach(() => {
    if (router && router.initialized) {
      router.shutdown();
    }
  });

  describe('initialize()', () => {
    it('should initialize with default configuration', async () => {
      await router.initialize();
      
      expect(router.initialized).toBe(true);
      expect(router.providers.size).toBeGreaterThan(0);
    });

    it('should detect demo mode when no API keys are configured', async () => {
      // Clear environment variables
      const originalEnv = { ...process.env };
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.DEEPSEEK_API_KEY;
      delete process.env.HUGGINGFACE_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      await router.initialize({ demoMode: 'auto' });
      
      expect(router.demoMode).toBe(true);
      expect(router.providers.has('demo')).toBe(true);

      // Restore environment
      process.env = originalEnv;
    });

    it('should register demo provider as fallback', async () => {
      await router.initialize();
      
      expect(router.providers.has('demo')).toBe(true);
      expect(router.fallbackChain).toContain('demo');
    });

    it('should not initialize twice', async () => {
      await router.initialize();
      const firstSize = router.providers.size;
      
      await router.initialize();
      const secondSize = router.providers.size;
      
      expect(firstSize).toBe(secondSize);
    });

    it('should set fallback chain from configuration', async () => {
      const fallbackChain = ['openrouter', 'deepseek', 'demo'];
      
      await router.initialize({ fallbackChain });
      
      expect(router.fallbackChain).toEqual(fallbackChain);
    });
  });

  describe('loadProvidersFromEnv()', () => {
    it('should load providers from environment variables', () => {
      const originalEnv = { ...process.env };
      process.env.OPENROUTER_API_KEY = 'test-key-1';
      process.env.DEEPSEEK_API_KEY = 'test-key-2';

      const providers = router.loadProvidersFromEnv();
      
      expect(providers.length).toBeGreaterThan(0);
      expect(providers.some(p => p.name === 'openrouter')).toBe(true);
      expect(providers.some(p => p.name === 'deepseek')).toBe(true);
      expect(providers.some(p => p.name === 'demo')).toBe(true);

      process.env = originalEnv;
    });

    it('should always include demo provider', () => {
      const originalEnv = { ...process.env };
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.DEEPSEEK_API_KEY;
      delete process.env.HUGGINGFACE_API_KEY;

      const providers = router.loadProvidersFromEnv();
      
      expect(providers.some(p => p.name === 'demo')).toBe(true);

      process.env = originalEnv;
    });
  });

  describe('shouldUseDemoMode()', () => {
    it('should return true when demoMode is "enabled"', () => {
      const config = { demoMode: 'enabled', providers: [] };
      
      const result = router.shouldUseDemoMode(config);
      
      expect(result).toBe(true);
    });

    it('should return false when demoMode is "disabled"', () => {
      const config = { demoMode: 'disabled', providers: [] };
      
      const result = router.shouldUseDemoMode(config);
      
      expect(result).toBe(false);
    });

    it('should auto-detect demo mode when no real providers have API keys', () => {
      const config = {
        demoMode: 'auto',
        providers: [
          { name: 'demo', config: {} }
        ]
      };
      
      const result = router.shouldUseDemoMode(config);
      
      expect(result).toBe(true);
    });

    it('should not use demo mode when real providers have API keys', () => {
      const config = {
        demoMode: 'auto',
        providers: [
          { name: 'openrouter', config: { apiKey: 'test-key' } },
          { name: 'demo', config: {} }
        ]
      };
      
      const result = router.shouldUseDemoMode(config);
      
      expect(result).toBe(false);
    });
  });

  describe('registerProvider()', () => {
    it('should register a valid provider', () => {
      class TestProvider extends LLMProvider {
        constructor() {
          super({
            name: 'test',
            capabilities: ['coder']
          });
        }
      }

      const provider = new TestProvider();
      router.registerProvider(provider);
      
      expect(router.providers.has('test')).toBe(true);
      expect(router.providers.get('test')).toBe(provider);
    });

    it('should throw error for invalid provider', () => {
      const invalidProvider = { name: 'invalid' };
      
      expect(() => {
        router.registerProvider(invalidProvider);
      }).toThrow('Provider must extend LLMProvider class');
    });

    it('should initialize weights for provider capabilities', () => {
      class TestProvider extends LLMProvider {
        constructor() {
          super({
            name: 'test',
            capabilities: ['coder', 'tester']
          });
        }
      }

      const provider = new TestProvider();
      router.registerProvider(provider);
      
      expect(router.weights.has('coder')).toBe(true);
      expect(router.weights.has('tester')).toBe(true);
      expect(router.weights.get('coder').has('test')).toBe(true);
    });
  });

  describe('performHealthChecks()', () => {
    it('should check health of all registered providers', async () => {
      await router.initialize({ healthCheckOnStartup: false });
      
      const healthResults = await router.performHealthChecks();
      
      expect(Object.keys(healthResults).length).toBe(router.providers.size);
    });

    it('should mark demo provider as healthy', async () => {
      await router.initialize({ healthCheckOnStartup: false });
      
      await router.performHealthChecks();
      
      const health = router.getProviderHealth();
      expect(health.demo.healthy).toBe(true);
    });

    it('should track consecutive failures', async () => {
      await router.initialize({ healthCheckOnStartup: false });
      
      // First health check
      await router.performHealthChecks();
      
      // Simulate a provider failure by checking health again
      const health = router.getProviderHealth();
      
      for (const [name, status] of Object.entries(health)) {
        expect(status).toHaveProperty('consecutiveFailures');
        expect(typeof status.consecutiveFailures).toBe('number');
      }
    });
  });

  describe('getProviderHealth()', () => {
    it('should return health status for all providers', async () => {
      await router.initialize();
      
      const health = router.getProviderHealth();
      
      expect(Object.keys(health).length).toBeGreaterThan(0);
      
      for (const [name, status] of Object.entries(health)) {
        expect(status).toHaveProperty('healthy');
        expect(status).toHaveProperty('lastCheck');
        expect(status).toHaveProperty('consecutiveFailures');
      }
    });
  });

  describe('shutdown()', () => {
    it('should cleanup resources on shutdown', async () => {
      await router.initialize();
      
      router.shutdown();
      
      expect(router.initialized).toBe(false);
      expect(router.healthCheckInterval).toBeFalsy();
    });
  });

  describe('Integration with providers', () => {
    it('should successfully route task in demo mode', async () => {
      await router.initialize({ demoMode: 'enabled' });
      
      const response = await router.routeTask({
        role: 'coder',
        prompt: 'Generate a hello world function',
        fallback: true
      });
      
      expect(response.success).toBe(true);
      expect(response.content).toBeTruthy();
      expect(response.provider).toBe('demo');
    });

    it('should use demo provider when other providers fail', async () => {
      await router.initialize();
      
      // This should fall back to demo provider if no real API keys
      const response = await router.routeTask({
        role: 'coder',
        prompt: 'Test prompt',
        fallback: true
      });
      
      expect(response.success).toBe(true);
      expect(response.content).toBeTruthy();
    });
  });
});
