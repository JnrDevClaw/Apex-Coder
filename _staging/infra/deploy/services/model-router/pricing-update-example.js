/**
 * Pricing Update Examples
 * 
 * This file demonstrates how to update model pricing without code changes.
 * Pricing can be updated at runtime through the configuration manager.
 */

const config = require('../../config/model-router-config');

// Example 1: Update pricing for a single model
function updateSingleModelPricing() {
  try {
    config.updateModelPricing('huggingface', 'OpenHermes-2.5-Mistral-7B', {
      input: 0.00015,  // New input cost per 1M tokens
      output: 0.00025  // New output cost per 1M tokens
    });
    
    console.log('✅ Pricing updated successfully');
  } catch (error) {
    console.error('❌ Failed to update pricing:', error.message);
  }
}

// Example 2: Update pricing for multiple models at once
function updateMultipleModelPricing() {
  try {
    config.updateMultiplePricing({
      'huggingface.OpenHermes-2.5-Mistral-7B': {
        input: 0.00015,
        output: 0.00025
      },
      'zukijourney.gpt-5-mini': {
        input: 0.20,
        output: 0.70
      },
      'deepseek.deepseek-v3': {
        input: 0.30,
        output: 1.20
      }
    });
    
    console.log('✅ Multiple pricings updated successfully');
  } catch (error) {
    console.error('❌ Failed to update pricings:', error.message);
  }
}

// Example 3: Get current pricing for a model
function getCurrentPricing() {
  const pricing = config.getModelPricing('zukijourney', 'gpt-5-mini');
  
  if (pricing) {
    console.log('Current pricing for gpt-5-mini:');
    console.log(`  Input: $${pricing.input} per 1M tokens`);
    console.log(`  Output: $${pricing.output} per 1M tokens`);
  } else {
    console.log('Pricing not found');
  }
}

// Example 4: Get all pricing information
function getAllPricing() {
  const allPricing = config.getAllPricing();
  
  console.log('All model pricing:');
  console.log(JSON.stringify(allPricing, null, 2));
}

// Example 5: Update pricing via environment variables
// Set these in your .env file:
// MODEL_PRICING_UPDATES='{"huggingface.OpenHermes-2.5-Mistral-7B":{"input":0.00015,"output":0.00025}}'
function updatePricingFromEnv() {
  const pricingUpdates = process.env.MODEL_PRICING_UPDATES;
  
  if (pricingUpdates) {
    try {
      const updates = JSON.parse(pricingUpdates);
      config.updateMultiplePricing(updates);
      console.log('✅ Pricing updated from environment variables');
    } catch (error) {
      console.error('❌ Failed to parse pricing updates from env:', error.message);
    }
  }
}

// Example 6: Update pricing via API endpoint (for use in routes)
async function updatePricingViaAPI(req, reply) {
  const { provider, model, pricing } = req.body;
  
  try {
    // Validate request
    if (!provider || !model || !pricing) {
      return reply.code(400).send({
        error: 'Missing required fields: provider, model, pricing'
      });
    }
    
    // Update pricing
    config.updateModelPricing(provider, model, pricing);
    
    return reply.send({
      success: true,
      message: `Pricing updated for ${provider}/${model}`,
      pricing: config.getModelPricing(provider, model)
    });
  } catch (error) {
    return reply.code(400).send({
      error: error.message
    });
  }
}

// Example 7: Batch update pricing via API endpoint
async function batchUpdatePricingViaAPI(req, reply) {
  const { updates } = req.body;
  
  try {
    // Validate request
    if (!updates || typeof updates !== 'object') {
      return reply.code(400).send({
        error: 'Missing or invalid updates object'
      });
    }
    
    // Update pricing
    config.updateMultiplePricing(updates);
    
    return reply.send({
      success: true,
      message: `Pricing updated for ${Object.keys(updates).length} models`,
      updatedModels: Object.keys(updates)
    });
  } catch (error) {
    return reply.code(400).send({
      error: error.message
    });
  }
}

// Example 8: Listen for pricing changes
function setupPricingChangeListener() {
  config.onChange((path, newValue, oldValue) => {
    // Check if the change is related to pricing
    if (path.includes('.pricing.')) {
      console.log('💰 Pricing changed:');
      console.log(`  Path: ${path}`);
      console.log(`  Old value:`, oldValue);
      console.log(`  New value:`, newValue);
      
      // You could trigger notifications, update caches, etc.
    }
  });
}

// Example 9: Load pricing from external JSON file
async function loadPricingFromFile(filePath) {
  const fs = require('fs').promises;
  
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const pricingUpdates = JSON.parse(data);
    
    config.updateMultiplePricing(pricingUpdates);
    console.log('✅ Pricing loaded from file successfully');
  } catch (error) {
    console.error('❌ Failed to load pricing from file:', error.message);
  }
}

// Example 10: Export current pricing to file
async function exportPricingToFile(filePath) {
  const fs = require('fs').promises;
  
  try {
    const allPricing = config.getAllPricing();
    await fs.writeFile(filePath, JSON.stringify(allPricing, null, 2));
    console.log('✅ Pricing exported to file successfully');
  } catch (error) {
    console.error('❌ Failed to export pricing to file:', error.message);
  }
}

module.exports = {
  updateSingleModelPricing,
  updateMultipleModelPricing,
  getCurrentPricing,
  getAllPricing,
  updatePricingFromEnv,
  updatePricingViaAPI,
  batchUpdatePricingViaAPI,
  setupPricingChangeListener,
  loadPricingFromFile,
  exportPricingToFile
};

// If running directly, demonstrate the examples
if (require.main === module) {
  console.log('=== Pricing Update Examples ===\n');
  
  console.log('1. Get current pricing:');
  getCurrentPricing();
  
  console.log('\n2. Get all pricing:');
  getAllPricing();
  
  console.log('\n3. Setup pricing change listener:');
  setupPricingChangeListener();
  
  console.log('\n4. Update single model pricing:');
  updateSingleModelPricing();
  
  console.log('\n5. Verify update:');
  getCurrentPricing();
}
