/**
 * Hot Reload Test Script
 * 
 * Demonstrates hot reloading functionality of the Template Manager
 * This script will watch for template changes and automatically reload them
 */

const TemplateManager = require('./template-manager');
const path = require('path');
const fs = require('fs').promises;

async function testHotReload() {
  console.log('🔥 Testing Template Manager Hot Reload\n');
  console.log('This script will watch for template changes and automatically reload them.');
  console.log('Try modifying a template file in server/templates/prompts/ to see hot reload in action.\n');

  // Create template manager with hot reload enabled
  const templateManager = new TemplateManager({
    templateDir: path.join(__dirname, '../../templates/prompts'),
    hotReload: true, // Enable hot reload
    logger: {
      info: (msg, meta) => console.log(`ℹ️  ${msg}`, meta ? JSON.stringify(meta) : ''),
      debug: (msg, meta) => console.log(`🔍 ${msg}`, meta ? JSON.stringify(meta) : ''),
      warn: (msg, meta) => console.warn(`⚠️  ${msg}`, meta ? JSON.stringify(meta) : ''),
      error: (msg, meta) => console.error(`❌ ${msg}`, meta ? JSON.stringify(meta) : '')
    }
  });

  try {
    // Initialize template manager
    await templateManager.initialize();
    console.log('✅ Template Manager initialized with hot reload enabled\n');

    // Display initial templates
    const templates = templateManager.getAvailableTemplates();
    console.log(`📋 Loaded templates: ${templates.join(', ')}\n`);

    // Create a test template to demonstrate hot reload
    const testTemplatePath = path.join(templateManager.templateDir, 'test-hot-reload.txt');
    const initialContent = `ROLE:
You are a test template.

TASK:
This is a test template for hot reload demonstration.

INPUT:
Test input: {{test_input}}

RULES:
- This is version 1 of the template

EXPECTED_OUTPUT:
Test output`;

    console.log('📝 Creating test template: test-hot-reload.txt');
    await fs.writeFile(testTemplatePath, initialContent);
    
    // Wait for hot reload to detect the new file
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Render the template
    console.log('\n🎨 Rendering initial template:');
    let rendered = await templateManager.renderTemplate('test-hot-reload', {
      test_input: 'Hello World'
    });
    console.log(rendered.substring(0, 150) + '...\n');

    // Modify the template
    console.log('✏️  Modifying test template...');
    const modifiedContent = initialContent.replace('version 1', 'version 2 (UPDATED!)');
    await fs.writeFile(testTemplatePath, modifiedContent);

    // Wait for hot reload to detect the change
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Render the updated template
    console.log('\n🎨 Rendering updated template:');
    rendered = await templateManager.renderTemplate('test-hot-reload', {
      test_input: 'Hello World'
    });
    console.log(rendered.substring(0, 150) + '...\n');

    // Verify the change was detected
    if (rendered.includes('version 2 (UPDATED!)')) {
      console.log('✅ Hot reload successfully detected and applied template changes!\n');
    } else {
      console.log('❌ Hot reload did not detect template changes\n');
    }

    // Clean up test template
    console.log('🧹 Cleaning up test template...');
    await fs.unlink(testTemplatePath);

    // Wait for hot reload to detect the deletion
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify template was removed
    const hasTemplate = templateManager.hasTemplate('test-hot-reload');
    if (!hasTemplate) {
      console.log('✅ Hot reload successfully detected template deletion!\n');
    } else {
      console.log('❌ Hot reload did not detect template deletion\n');
    }

    console.log('✅ Hot reload test completed successfully!\n');
    console.log('Press Ctrl+C to exit or continue watching for changes...\n');

    // Keep the process running to demonstrate continuous hot reload
    // In production, the template manager would run as part of the server
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Shutting down...');
      await templateManager.cleanup();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Hot reload test failed:', error);
    await templateManager.cleanup();
    process.exit(1);
  }
}

// Run test
if (require.main === module) {
  testHotReload().catch((error) => {
    console.error('❌ Hot reload test failed:', error);
    process.exit(1);
  });
}

module.exports = testHotReload;
