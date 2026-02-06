/**
 * Integration Example: Provider Registry + Configuration
 * 
 * This example demonstrates how to use the provider registry
 * with the configuration system.
 */

const providerRegistry = require('./provider-registry.js');
const config = require('../../config/model-router-config.js');

/**
 * Initialize the model router with providers from configuration
 */
function initializeModelRouter() {
  // Initialize configuration
  config.initialize();
  
  console.log('🚀 Initializing Model Router...');
  
  // Get enabled providers from config
  const enabledProviders = config.getEnabledProviders();
  console.log(`📋 Found ${enabledProviders.length} enabled providers:`, enabledProviders);
  
  // Example: Register providers (in real implementation, you'd import actual provider classes)
  // For now, we'll just demonstrate the flow
  
  console.log('\n📊 Configuration Summary:');
  console.log('- Enabled Providers:', enabledProviders.join(', '));
  console.log('- Role Mappings:', Object.keys(config.getAllRoleMappings()).join(', '));
  
  // Example: Get role mapping
  const clarifierMapping = config.getRoleMapping('clarifier');
  console.log('\n🎯 Clarifier Role Mapping:');
  console.log(`  Primary: ${clarifierMapping.primary.provider} / ${clarifierMapping.primary.model}`);
  if (clarifierMapping.fallback) {
    console.log(`  Fallback: ${clarifierMapping.fallback.provider} / ${clarifierMapping.fallback.model}`);
  }
  
  // Example: Get pricing
  const pricing = config.getModelPricing('huggingface', 'OpenHermes-2.5-Mistral-7B');
  console.log('\n💰 HuggingFace Pricing (per 1M tokens):');
  console.log(`  Input: $${pricing.input}`);
  console.log(`  Output: $${pricing.output}`);
  
  // Example: Get rate limits
  const rateLimit = config.getProviderRateLimit('anthropic');
  console.log('\n⏱️  Anthropic Rate Limits:');
  console.log(`  Max Concurrent: ${rateLimit.maxConcurrent}`);
  console.log(`  Min Time: ${rateLimit.minTime}ms`);
  console.log(`  Reservoir: ${rateLimit.reservoir} requests`);
  
  console.log('\n✅ Model Router initialized successfully!');
}

// Run if executed directly
if (require.main === module) {
  initializeModelRouter();
}

module.exports = { initializeModelRouter };
