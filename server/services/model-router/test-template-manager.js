/**
 * Template Manager Test Script
 * 
 * Tests template loading, validation, and rendering
 */

const TemplateManager = require('./template-manager');
const path = require('path');

async function testTemplateManager() {
  console.log('🧪 Testing Template Manager\n');

  // Create template manager instance
  const templateManager = new TemplateManager({
    templateDir: path.join(__dirname, '../../templates/prompts'),
    hotReload: false, // Disable for testing
    logger: {
      info: (msg, meta) => console.log(`ℹ️  ${msg}`, meta || ''),
      debug: (msg, meta) => console.log(`🔍 ${msg}`, meta || ''),
      warn: (msg, meta) => console.warn(`⚠️  ${msg}`, meta || ''),
      error: (msg, meta) => console.error(`❌ ${msg}`, meta || '')
    }
  });

  try {
    // Test 1: Initialize and load templates
    console.log('Test 1: Initialize and load templates');
    await templateManager.initialize();
    const templates = templateManager.getAvailableTemplates();
    console.log(`✅ Loaded ${templates.length} templates:`, templates);
    console.log('');

    // Test 2: Get template metadata
    console.log('Test 2: Get template metadata');
    const metadata = templateManager.getAllTemplateMetadata();
    console.log('✅ Template metadata:', JSON.stringify(metadata, null, 2));
    console.log('');

    // Test 3: Render clarifier template
    console.log('Test 3: Render clarifier template');
    const clarifierPrompt = await templateManager.renderTemplate('clarifier', {
      specs_json: JSON.stringify({ projectName: 'Test Project', features: ['auth', 'api'] }),
      conversation_history: 'User: I want to build an app\nAI: What kind of app?'
    });
    console.log('✅ Rendered clarifier template:');
    console.log(clarifierPrompt.substring(0, 200) + '...\n');

    // Test 4: Render normalizer template
    console.log('Test 4: Render normalizer template');
    const normalizerPrompt = await templateManager.renderTemplate('normalizer', {
      specs_refined_json: JSON.stringify({ 
        project_name: 'test-project',
        features: ['authentication', 'api']
      })
    });
    console.log('✅ Rendered normalizer template:');
    console.log(normalizerPrompt.substring(0, 200) + '...\n');

    // Test 5: Render code-generator template with nested variables
    console.log('Test 5: Render code-generator template');
    const codeGenPrompt = await templateManager.renderTemplate('code-generator', {
      file_path: 'src/routes/auth.js',
      file_purpose: 'Handle authentication routes',
      docs_excerpt: 'Authentication should use JWT tokens',
      schema_excerpt: JSON.stringify({ User: { id: 'string', email: 'string' } }),
      coding_rules: 'Use async/await, follow ESLint rules',
      framework: 'Fastify'
    });
    console.log('✅ Rendered code-generator template:');
    console.log(codeGenPrompt.substring(0, 200) + '...\n');

    // Test 6: Test validation - missing required variable
    console.log('Test 6: Test validation - missing required variable');
    try {
      await templateManager.renderTemplate('clarifier', {
        specs_json: '{}' // Missing conversation_history
      });
      console.log('❌ Should have thrown error for missing variable');
    } catch (error) {
      console.log('✅ Correctly caught missing variable error:', error.message);
    }
    console.log('');

    // Test 7: Test template validation - invalid template
    console.log('Test 7: Test template validation - invalid template');
    try {
      templateManager.validateTemplate('{{unclosed', 'test-template');
      console.log('❌ Should have thrown error for unclosed braces');
    } catch (error) {
      console.log('✅ Correctly caught validation error:', error.message);
    }
    console.log('');

    // Test 8: Test template validation - empty placeholder
    console.log('Test 8: Test template validation - empty placeholder');
    try {
      templateManager.validateTemplate('This has {{}} empty placeholder', 'test-template');
      console.log('❌ Should have thrown error for empty placeholder');
    } catch (error) {
      console.log('✅ Correctly caught empty placeholder error:', error.message);
    }
    console.log('');

    // Test 9: Test nested value substitution
    console.log('Test 9: Test nested value substitution');
    const nestedTemplate = 'User: {{user.name}}, Email: {{user.email}}';
    const rendered = templateManager.substituteVariables(nestedTemplate, {
      user: {
        name: 'John Doe',
        email: 'john@example.com'
      }
    });
    console.log('✅ Rendered nested template:', rendered);
    console.log('');

    // Test 10: Check if specific templates exist
    console.log('Test 10: Check template existence');
    const hasValidator = templateManager.hasTemplate('validator');
    const hasNonExistent = templateManager.hasTemplate('non-existent');
    console.log(`✅ Has 'validator' template: ${hasValidator}`);
    console.log(`✅ Has 'non-existent' template: ${hasNonExistent}`);
    console.log('');

    console.log('✅ All tests passed!\n');

    // Cleanup
    await templateManager.cleanup();

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  testTemplateManager()
    .then(() => {
      console.log('✅ Template Manager tests completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Template Manager tests failed:', error);
      process.exit(1);
    });
}

module.exports = testTemplateManager;
