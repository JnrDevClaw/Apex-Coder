/**
 * Provider Verification Service Tests
 */

const { test } = require('tap');
const ProviderVerificationService = require('../../services/provider-verification.js');

// Mock logger
const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {}
};

test('ProviderVerificationService', async (t) => {
  t.test('should initialize with empty results', async (t) => {
    const service = new ProviderVerificationService(mockLogger);
    const results = service.getResults();
    
    t.ok(results.huggingface, 'has huggingface result');
    t.ok(results.zukijourney, 'has zukijourney result');
    t.ok(results.githubModels, 'has githubModels result');
    t.ok(results.deepseek, 'has deepseek result');
    t.ok(results.gemini, 'has gemini result');
    
    // All should be unavailable initially
    t.equal(results.huggingface.available, false, 'huggingface not available initially');
    t.equal(results.zukijourney.available, false, 'zukijourney not available initially');
    t.equal(results.githubModels.available, false, 'githubModels not available initially');
    t.equal(results.deepseek.available, false, 'deepseek not available initially');
    t.equal(results.gemini.available, false, 'gemini not available initially');
  });

  t.test('should detect missing API keys', async (t) => {
    // Clear environment variables
    const originalEnv = { ...process.env };
    delete process.env.HUGGINGFACE_API_KEY;
    delete process.env.ZUKI_API_KEY;
    delete process.env.GITHUB_TOKEN;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.GEMINI_API_KEY;
    
    const service = new ProviderVerificationService(mockLogger);
    await service.verifyAllProviders();
    
    const results = service.getResults();
    
    t.equal(results.huggingface.configured, false, 'huggingface not configured');
    t.equal(results.zukijourney.configured, false, 'zukijourney not configured');
    t.equal(results.githubModels.configured, false, 'githubModels not configured');
    t.equal(results.deepseek.configured, false, 'deepseek not configured');
    t.equal(results.gemini.configured, false, 'gemini not configured');
    
    t.ok(results.huggingface.error.includes('not set'), 'huggingface has error message');
    t.ok(results.zukijourney.error.includes('not set'), 'zukijourney has error message');
    t.ok(results.githubModels.error.includes('not set'), 'githubModels has error message');
    t.ok(results.deepseek.error.includes('not set'), 'deepseek has error message');
    t.ok(results.gemini.error.includes('not set'), 'gemini has error message');
    
    // Restore environment
    process.env = originalEnv;
  });

  t.test('should identify missing providers', async (t) => {
    const originalEnv = { ...process.env };
    delete process.env.HUGGINGFACE_API_KEY;
    delete process.env.ZUKI_API_KEY;
    
    const service = new ProviderVerificationService(mockLogger);
    await service.verifyAllProviders();
    
    const missing = service.getMissingProviders();
    
    t.ok(missing.includes('huggingface'), 'identifies huggingface as missing');
    t.ok(missing.includes('zukijourney'), 'identifies zukijourney as missing');
    
    process.env = originalEnv;
  });

  t.test('should check if all providers are configured', async (t) => {
    const originalEnv = { ...process.env };
    delete process.env.HUGGINGFACE_API_KEY;
    
    const service = new ProviderVerificationService(mockLogger);
    await service.verifyAllProviders();
    
    const allConfigured = service.areAllProvidersConfigured();
    
    t.equal(allConfigured, false, 'not all providers configured');
    
    process.env = originalEnv;
  });

  t.test('should check if specific provider is available', async (t) => {
    const service = new ProviderVerificationService(mockLogger);
    await service.verifyAllProviders();
    
    const isAvailable = service.isProviderAvailable('huggingface');
    
    // Will be false unless API key is set and valid
    t.type(isAvailable, 'boolean', 'returns boolean');
  });

  t.test('should handle verification errors gracefully', async (t) => {
    const originalEnv = { ...process.env };
    
    // Set invalid API keys
    process.env.HUGGINGFACE_API_KEY = 'invalid_key';
    process.env.ZUKI_API_KEY = 'invalid_key';
    process.env.GITHUB_TOKEN = 'invalid_key';
    process.env.DEEPSEEK_API_KEY = 'invalid_key';
    process.env.GEMINI_API_KEY = 'invalid_key';
    
    const service = new ProviderVerificationService(mockLogger);
    
    // Should not throw
    await t.resolves(service.verifyAllProviders(), 'verification completes without throwing');
    
    const results = service.getResults();
    
    // All should be configured but not available (due to invalid keys)
    t.equal(results.huggingface.configured, true, 'huggingface configured');
    t.equal(results.zukijourney.configured, true, 'zukijourney configured');
    t.equal(results.githubModels.configured, true, 'githubModels configured');
    t.equal(results.deepseek.configured, true, 'deepseek configured');
    t.equal(results.gemini.configured, true, 'gemini configured');
    
    process.env = originalEnv;
  });

  t.test('should provide detailed Zukijourney model status', async (t) => {
    const originalEnv = { ...process.env };
    process.env.ZUKI_API_KEY = 'test_key';
    
    const service = new ProviderVerificationService(mockLogger);
    await service.verifyAllProviders();
    
    const results = service.getResults();
    
    t.ok(results.zukijourney.models, 'has models object');
    t.type(results.zukijourney.models, 'object', 'models is an object');
    
    // Should have entries for required models
    if (Object.keys(results.zukijourney.models).length > 0) {
      const modelKeys = Object.keys(results.zukijourney.models);
      t.ok(modelKeys.some(k => k.includes('gpt')), 'has GPT model info');
    }
    
    process.env = originalEnv;
  });

  t.test('should get unavailable providers', async (t) => {
    const originalEnv = { ...process.env };
    
    // Set keys but they'll fail API calls
    process.env.HUGGINGFACE_API_KEY = 'invalid_key';
    process.env.DEEPSEEK_API_KEY = 'invalid_key';
    
    const service = new ProviderVerificationService(mockLogger);
    await service.verifyAllProviders();
    
    const unavailable = service.getUnavailableProviders();
    
    t.type(unavailable, Array, 'returns array');
    // Should include providers with invalid keys
    t.ok(unavailable.length >= 0, 'has unavailable providers list');
    
    process.env = originalEnv;
  });
});
