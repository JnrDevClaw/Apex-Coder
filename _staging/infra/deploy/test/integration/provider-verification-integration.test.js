/**
 * Provider Verification Integration Test
 * Tests the provider verification service with actual environment
 */

const { test } = require('tap');
const ProviderVerificationService = require('../../services/provider-verification.js');

// Simple mock logger
const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {}
};

test('Provider Verification Integration', async (t) => {
  t.test('should complete verification without errors', async (t) => {
    const service = new ProviderVerificationService(mockLogger);
    
    // Should not throw
    await t.resolves(
      service.verifyAllProviders(),
      'verification completes successfully'
    );
    
    const results = service.getResults();
    
    // Verify structure
    t.ok(results, 'has results');
    t.ok(results.huggingface, 'has huggingface result');
    t.ok(results.zukijourney, 'has zukijourney result');
    t.ok(results.githubModels, 'has githubModels result');
    t.ok(results.deepseek, 'has deepseek result');
    t.ok(results.gemini, 'has gemini result');
    
    // Each result should have required fields
    for (const [providerName, result] of Object.entries(results)) {
      t.type(result.available, 'boolean', `${providerName} has available field`);
      t.type(result.configured, 'boolean', `${providerName} has configured field`);
      t.ok('error' in result, `${providerName} has error field`);
    }
  });

  t.test('should provide helper methods', async (t) => {
    const service = new ProviderVerificationService(mockLogger);
    await service.verifyAllProviders();
    
    // Test helper methods
    const allConfigured = service.areAllProvidersConfigured();
    const allAvailable = service.areAllProvidersAvailable();
    const missing = service.getMissingProviders();
    const unavailable = service.getUnavailableProviders();
    
    t.type(allConfigured, 'boolean', 'areAllProvidersConfigured returns boolean');
    t.type(allAvailable, 'boolean', 'areAllProvidersAvailable returns boolean');
    t.type(missing, Array, 'getMissingProviders returns array');
    t.type(unavailable, Array, 'getUnavailableProviders returns array');
  });

  t.test('should check individual provider availability', async (t) => {
    const service = new ProviderVerificationService(mockLogger);
    await service.verifyAllProviders();
    
    const providers = ['huggingface', 'zukijourney', 'githubModels', 'deepseek', 'gemini'];
    
    for (const provider of providers) {
      const isAvailable = service.isProviderAvailable(provider);
      t.type(isAvailable, 'boolean', `${provider} availability check returns boolean`);
    }
  });

  t.test('should log verification summary', async (t) => {
    let loggedMessages = [];
    const captureLogger = {
      info: (msg) => loggedMessages.push(msg),
      warn: (msg) => loggedMessages.push(msg),
      error: (msg) => loggedMessages.push(msg)
    };
    
    const service = new ProviderVerificationService(captureLogger);
    await service.verifyAllProviders();
    
    // Should have logged something
    t.ok(loggedMessages.length > 0, 'logged messages during verification');
    
    // Should include summary
    const hasSummary = loggedMessages.some(msg => 
      typeof msg === 'string' && msg.includes('Provider Verification Summary')
    );
    t.ok(hasSummary, 'logged verification summary');
  });
});
