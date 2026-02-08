/**
 * Template Manager Usage Examples
 * 
 * Demonstrates how to use the Template Manager in the Model Router
 */

const TemplateManager = require('./template-manager');
const path = require('path');

/**
 * Example 1: Basic template rendering
 */
async function basicUsage() {
  console.log('Example 1: Basic Template Rendering\n');

  const templateManager = new TemplateManager({
    templateDir: path.join(__dirname, '../../templates/prompts')
  });

  await templateManager.initialize();

  // Render a simple template
  const prompt = await templateManager.renderTemplate('clarifier', {
    specs_json: JSON.stringify({
      projectName: 'My App',
      features: ['authentication', 'api', 'database']
    }),
    conversation_history: 'User: I want to build a web app'
  });

  console.log('Rendered prompt:');
  console.log(prompt);
  console.log('\n---\n');

  await templateManager.cleanup();
}

/**
 * Example 2: Integration with Model Router
 */
async function modelRouterIntegration() {
  console.log('Example 2: Model Router Integration\n');

  const templateManager = new TemplateManager({
    templateDir: path.join(__dirname, '../../templates/prompts'),
    hotReload: true
  });

  await templateManager.initialize();

  // Simulate a model router call with template
  async function callModelWithTemplate(role, variables) {
    // Get the appropriate template for the role
    const templateName = role; // In practice, you might have a mapping
    
    // Render the template
    const prompt = await templateManager.renderTemplate(templateName, variables);
    
    // In a real scenario, you would pass this prompt to the model
    console.log(`Calling model for role: ${role}`);
    console.log(`Prompt length: ${prompt.length} characters`);
    console.log(`First 200 chars: ${prompt.substring(0, 200)}...\n`);
    
    return { role, promptLength: prompt.length };
  }

  // Example calls
  await callModelWithTemplate('normalizer', {
    specs_refined_json: JSON.stringify({ project: 'test' })
  });

  await callModelWithTemplate('validator', {
    docs_md: '# Documentation',
    schema_json: JSON.stringify({ models: [] }),
    file_structure_json: JSON.stringify({ files: [] })
  });

  await templateManager.cleanup();
}

/**
 * Example 3: Dynamic template selection based on agent role
 */
async function dynamicTemplateSelection() {
  console.log('Example 3: Dynamic Template Selection\n');

  const templateManager = new TemplateManager({
    templateDir: path.join(__dirname, '../../templates/prompts')
  });

  await templateManager.initialize();

  // Role to template mapping
  const roleTemplateMap = {
    'clarifier': 'clarifier',
    'normalizer': 'normalizer',
    'docs-creator': 'docs-creator',
    'schema-generator': 'schema-generator',
    'validator': 'validator',
    'code-generator': 'code-generator',
    'prompt-builder': 'prompt-builder',
    'file-structure-generator': 'file-structure-generator'
  };

  // Function to get prompt for a role
  async function getPromptForRole(role, context) {
    const templateName = roleTemplateMap[role];
    
    if (!templateName) {
      throw new Error(`No template found for role: ${role}`);
    }

    if (!templateManager.hasTemplate(templateName)) {
      throw new Error(`Template '${templateName}' not found`);
    }

    return await templateManager.renderTemplate(templateName, context);
  }

  // Example usage
  const roles = ['clarifier', 'normalizer', 'validator'];
  
  for (const role of roles) {
    try {
      const context = getContextForRole(role);
      const prompt = await getPromptForRole(role, context);
      console.log(`✅ Generated prompt for ${role} (${prompt.length} chars)`);
    } catch (error) {
      console.error(`❌ Failed to generate prompt for ${role}:`, error.message);
    }
  }

  console.log('\n');
  await templateManager.cleanup();
}

/**
 * Helper function to get context for a role
 */
function getContextForRole(role) {
  const contexts = {
    'clarifier': {
      specs_json: JSON.stringify({ project: 'test' }),
      conversation_history: 'Initial conversation'
    },
    'normalizer': {
      specs_refined_json: JSON.stringify({ project: 'test' })
    },
    'validator': {
      docs_md: '# Docs',
      schema_json: '{}',
      file_structure_json: '{}'
    }
  };

  return contexts[role] || {};
}

/**
 * Example 4: Template metadata and introspection
 */
async function templateIntrospection() {
  console.log('Example 4: Template Metadata and Introspection\n');

  const templateManager = new TemplateManager({
    templateDir: path.join(__dirname, '../../templates/prompts')
  });

  await templateManager.initialize();

  // Get all available templates
  const templates = templateManager.getAvailableTemplates();
  console.log(`Available templates: ${templates.join(', ')}\n`);

  // Get metadata for each template
  for (const templateName of templates) {
    const metadata = templateManager.getTemplateMetadata(templateName);
    console.log(`Template: ${templateName}`);
    console.log(`  Path: ${metadata.path}`);
    console.log(`  Size: ${metadata.size} bytes`);
    console.log(`  Loaded: ${metadata.loadedAt.toISOString()}`);
    console.log('');
  }

  await templateManager.cleanup();
}

/**
 * Example 5: Error handling and validation
 */
async function errorHandling() {
  console.log('Example 5: Error Handling and Validation\n');

  const templateManager = new TemplateManager({
    templateDir: path.join(__dirname, '../../templates/prompts')
  });

  await templateManager.initialize();

  // Test 1: Missing template
  try {
    await templateManager.renderTemplate('non-existent', {});
    console.log('❌ Should have thrown error');
  } catch (error) {
    console.log('✅ Correctly caught missing template:', error.message);
  }

  // Test 2: Missing required variables
  try {
    await templateManager.renderTemplate('clarifier', {
      specs_json: '{}' // Missing conversation_history
    });
    console.log('❌ Should have thrown error');
  } catch (error) {
    console.log('✅ Correctly caught missing variables:', error.message);
  }

  // Test 3: Invalid template validation
  try {
    templateManager.validateTemplate('{{unclosed', 'test');
    console.log('❌ Should have thrown error');
  } catch (error) {
    console.log('✅ Correctly caught validation error:', error.message);
  }

  console.log('\n');
  await templateManager.cleanup();
}

/**
 * Run all examples
 */
async function runAllExamples() {
  try {
    await basicUsage();
    await modelRouterIntegration();
    await dynamicTemplateSelection();
    await templateIntrospection();
    await errorHandling();
    
    console.log('✅ All examples completed successfully!');
  } catch (error) {
    console.error('❌ Example failed:', error);
    process.exit(1);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples();
}

module.exports = {
  basicUsage,
  modelRouterIntegration,
  dynamicTemplateSelection,
  templateIntrospection,
  errorHandling
};
