/**
 * Template Manager Integration Example
 * 
 * Demonstrates how to integrate the Template Manager with the Model Router
 */

const ModelRouter = require('./model-router');
const TemplateManager = require('./template-manager');
const path = require('path');

/**
 * Example: Enhanced Model Router with Template Support
 */
class EnhancedModelRouter extends ModelRouter {
  constructor(options = {}) {
    super(options);
    
    // Initialize template manager
    this.templateManager = new TemplateManager({
      templateDir: options.templateDir || path.join(__dirname, '../../templates/prompts'),
      hotReload: options.hotReloadTemplates !== false,
      logger: this.logger
    });

    // Role to template mapping
    this.roleTemplateMap = {
      'clarifier': 'clarifier',
      'normalizer': 'normalizer',
      'docs-creator': 'docs-creator',
      'schema-generator': 'schema-generator',
      'validator': 'validator',
      'code-generator': 'code-generator',
      'prompt-builder': 'prompt-builder',
      'file-structure-generator': 'file-structure-generator'
    };
  }

  /**
   * Initialize router and template manager
   */
  async initialize() {
    await this.templateManager.initialize();
    this.logger.info('Enhanced Model Router initialized with template support');
  }

  /**
   * Call AI model by role with template support
   * @param {string} role - Agent role
   * @param {Array} messages - Chat messages
   * @param {Object} options - Call options
   * @param {Object} options.templateVariables - Variables for template rendering
   * @param {boolean} options.useTemplate - Whether to use template (default: true)
   * @returns {Promise<ModelResponse>}
   */
  async callByRole(role, messages, options = {}) {
    // Check if we should use a template
    const useTemplate = options.useTemplate !== false;
    
    if (useTemplate && options.templateVariables) {
      // Get template name for role
      const templateName = this.roleTemplateMap[role];
      
      if (templateName && this.templateManager.hasTemplate(templateName)) {
        try {
          // Render template with variables
          const systemPrompt = await this.templateManager.renderTemplate(
            templateName,
            options.templateVariables
          );

          // Add system prompt to messages
          messages = [
            { role: 'system', content: systemPrompt },
            ...messages
          ];

          this.logger.debug('Using template for role', {
            role,
            templateName,
            promptLength: systemPrompt.length
          });
        } catch (error) {
          this.logger.warn('Failed to render template, proceeding without it', {
            role,
            templateName,
            error: error.message
          });
        }
      }
    }

    // Call parent implementation
    return await super.callByRole(role, messages, options);
  }

  /**
   * Get template for a role
   * @param {string} role - Agent role
   * @returns {string|null} Template name
   */
  getRoleTemplate(role) {
    return this.roleTemplateMap[role] || null;
  }

  /**
   * Set template for a role
   * @param {string} role - Agent role
   * @param {string} templateName - Template name
   */
  setRoleTemplate(role, templateName) {
    this.roleTemplateMap[role] = templateName;
  }

  /**
   * Get all available templates
   * @returns {string[]} Array of template names
   */
  getAvailableTemplates() {
    return this.templateManager.getAvailableTemplates();
  }

  /**
   * Reload templates
   * @returns {Promise<void>}
   */
  async reloadTemplates() {
    await this.templateManager.reloadAllTemplates();
    this.logger.info('Templates reloaded');
  }

  /**
   * Clean up resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    await this.templateManager.cleanup();
  }
}

/**
 * Example usage scenarios
 */
async function demonstrateUsage() {
  console.log('🎯 Template Integration Examples\n');

  // Create enhanced router
  const router = new EnhancedModelRouter({
    hotReloadTemplates: true,
    logger: {
      info: (msg, meta) => console.log(`ℹ️  ${msg}`, meta || ''),
      debug: (msg, meta) => console.log(`🔍 ${msg}`, meta || ''),
      warn: (msg, meta) => console.warn(`⚠️  ${msg}`, meta || ''),
      error: (msg, meta) => console.error(`❌ ${msg}`, meta || '')
    }
  });

  await router.initialize();

  // Example 1: Call clarifier with template
  console.log('\n📝 Example 1: Clarifier with Template\n');
  
  const clarifierMessages = [
    { role: 'user', content: 'I want to build a web application' }
  ];

  const clarifierOptions = {
    templateVariables: {
      specs_json: JSON.stringify({
        projectName: 'My Web App',
        features: ['authentication', 'api', 'database']
      }),
      conversation_history: 'User: I want to build a web application'
    },
    projectId: 'proj_123'
  };

  console.log('Calling clarifier with template variables...');
  console.log('Template variables:', JSON.stringify(clarifierOptions.templateVariables, null, 2));
  
  // In a real scenario, this would call the actual model
  // const response = await router.callByRole('clarifier', clarifierMessages, clarifierOptions);

  // Example 2: Call normalizer with template
  console.log('\n📝 Example 2: Normalizer with Template\n');

  const normalizerMessages = [
    { role: 'user', content: 'Normalize this spec' }
  ];

  const normalizerOptions = {
    templateVariables: {
      specs_refined_json: JSON.stringify({
        project_name: 'my-web-app',
        features: ['auth', 'api', 'db'],
        framework: 'svelte'
      })
    },
    projectId: 'proj_123'
  };

  console.log('Calling normalizer with template variables...');
  console.log('Template variables:', JSON.stringify(normalizerOptions.templateVariables, null, 2));

  // Example 3: Call code-generator with template
  console.log('\n📝 Example 3: Code Generator with Template\n');

  const codeGenMessages = [
    { role: 'user', content: 'Generate the authentication route' }
  ];

  const codeGenOptions = {
    templateVariables: {
      file_path: 'src/routes/auth.js',
      file_purpose: 'Handle user authentication routes',
      docs_excerpt: 'Authentication should use JWT tokens with 24-hour expiry',
      schema_excerpt: JSON.stringify({
        User: {
          id: 'string',
          email: 'string',
          password: 'string (hashed)',
          createdAt: 'timestamp'
        }
      }),
      coding_rules: 'Use async/await, follow ESLint rules, add error handling',
      framework: 'Fastify'
    },
    projectId: 'proj_123'
  };

  console.log('Calling code-generator with template variables...');
  console.log('Template variables:', {
    file_path: codeGenOptions.templateVariables.file_path,
    file_purpose: codeGenOptions.templateVariables.file_purpose,
    framework: codeGenOptions.templateVariables.framework
  });

  // Example 4: List available templates
  console.log('\n📋 Example 4: Available Templates\n');

  const templates = router.getAvailableTemplates();
  console.log(`Available templates (${templates.length}):`);
  templates.forEach(template => {
    const metadata = router.templateManager.getTemplateMetadata(template);
    console.log(`  - ${template} (${metadata.size} bytes)`);
  });

  // Example 5: Dynamic template selection
  console.log('\n🔄 Example 5: Dynamic Template Selection\n');

  const roles = ['clarifier', 'normalizer', 'validator'];
  
  for (const role of roles) {
    const templateName = router.getRoleTemplate(role);
    const hasTemplate = router.templateManager.hasTemplate(templateName);
    console.log(`Role: ${role} → Template: ${templateName} (${hasTemplate ? '✅' : '❌'})`);
  }

  // Example 6: Custom role-template mapping
  console.log('\n⚙️  Example 6: Custom Role-Template Mapping\n');

  console.log('Setting custom template for "custom-role"...');
  router.setRoleTemplate('custom-role', 'code-generator');
  const customTemplate = router.getRoleTemplate('custom-role');
  console.log(`Custom role template: ${customTemplate}`);

  // Cleanup
  await router.cleanup();
  console.log('\n✅ Examples completed\n');
}

/**
 * Example: Pipeline orchestration with templates
 */
async function demonstratePipelineOrchestration() {
  console.log('🔄 Pipeline Orchestration with Templates\n');

  const router = new EnhancedModelRouter({
    hotReloadTemplates: false // Disable for production
  });

  await router.initialize();

  // Simulate a multi-stage pipeline
  const pipeline = [
    {
      stage: 'clarification',
      role: 'clarifier',
      variables: {
        specs_json: '{"project": "test"}',
        conversation_history: 'Initial conversation'
      }
    },
    {
      stage: 'normalization',
      role: 'normalizer',
      variables: {
        specs_refined_json: '{"project": "test", "features": []}'
      }
    },
    {
      stage: 'documentation',
      role: 'docs-creator',
      variables: {
        specs_clean_json: '{"project": "test"}',
        clarification_history: 'Q&A history'
      }
    },
    {
      stage: 'schema-generation',
      role: 'schema-generator',
      variables: {
        docs_md: '# Documentation'
      }
    },
    {
      stage: 'validation',
      role: 'validator',
      variables: {
        docs_md: '# Documentation',
        schema_json: '{}',
        file_structure_json: '{}'
      }
    }
  ];

  console.log(`Processing ${pipeline.length} stages...\n`);

  for (const stage of pipeline) {
    console.log(`Stage: ${stage.stage}`);
    console.log(`  Role: ${stage.role}`);
    console.log(`  Template: ${router.getRoleTemplate(stage.role)}`);
    console.log(`  Variables: ${Object.keys(stage.variables).join(', ')}`);
    
    // In a real scenario, you would call the model here
    // const result = await router.callByRole(stage.role, messages, {
    //   templateVariables: stage.variables
    // });
    
    console.log('  Status: ✅ Ready\n');
  }

  await router.cleanup();
  console.log('✅ Pipeline orchestration example completed\n');
}

// Run examples if this file is executed directly
if (require.main === module) {
  (async () => {
    try {
      await demonstrateUsage();
      await demonstratePipelineOrchestration();
      console.log('✅ All integration examples completed successfully!');
    } catch (error) {
      console.error('❌ Integration example failed:', error);
      process.exit(1);
    }
  })();
}

module.exports = {
  EnhancedModelRouter,
  demonstrateUsage,
  demonstratePipelineOrchestration
};
