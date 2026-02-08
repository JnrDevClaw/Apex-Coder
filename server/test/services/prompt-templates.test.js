const promptTemplateManager = require('../../services/prompt-templates');

describe('Prompt Template Manager', () => {
  describe('Template Loading', () => {
    test('should load all 9 templates', () => {
      const templates = promptTemplateManager.getAvailableTemplates();
      
      expect(templates).toHaveLength(9);
      expect(templates).toContain('clarifier');
      expect(templates).toContain('normalizer');
      expect(templates).toContain('docs-creator');
      expect(templates).toContain('schema-generator');
      expect(templates).toContain('structural-validator');
      expect(templates).toContain('file-structure-generator');
      expect(templates).toContain('validator');
      expect(templates).toContain('prompt-builder');
      expect(templates).toContain('gemini-coder');
    });

    test('should check if template exists', () => {
      expect(promptTemplateManager.hasTemplate('clarifier')).toBe(true);
      expect(promptTemplateManager.hasTemplate('gemini-coder')).toBe(true);
      expect(promptTemplateManager.hasTemplate('invalid')).toBe(false);
    });
  });

  describe('Template Retrieval', () => {
    test('should get template by name with variable substitution', () => {
      const template = promptTemplateManager.getTemplate('clarifier', {
        specs_json: '{"test": "data"}',
        conversation_history: 'Previous conversation'
      });
      
      expect(template).toContain('ROLE:');
      expect(template).toContain('You are the Clarifier AI');
      expect(template).toContain('{"test": "data"}');
      expect(template).toContain('Previous conversation');
    });

    test('should substitute object variables as JSON', () => {
      const template = promptTemplateManager.getTemplate('normalizer', {
        specs_refined_json: { projectName: 'Test Project', features: ['auth', 'api'] }
      });
      
      expect(template).toContain('"projectName": "Test Project"');
      expect(template).toContain('"features"');
    });

    test('should throw error for non-existent template', () => {
      expect(() => {
        promptTemplateManager.getTemplate('non-existent');
      }).toThrow(/Template 'non-existent' not found/);
    });

    test('should handle empty variables gracefully', () => {
      const template = promptTemplateManager.getTemplate('clarifier', {});
      
      expect(template).toContain('{{specs_json}}');
      expect(template).toContain('{{conversation_history}}');
    });
  });

  describe('Template Metadata', () => {
    test('should get template metadata', () => {
      const metadata = promptTemplateManager.getTemplateMetadata('clarifier');
      
      expect(metadata.stage).toBe(1);
      expect(metadata.model).toBe('huggingface');
      expect(metadata.modelName).toBe('OpenHermes-2.5-Mistral-7B');
      expect(metadata.description).toBeTruthy();
    });

    test('should return null for non-existent template metadata', () => {
      const metadata = promptTemplateManager.getTemplateMetadata('invalid');
      expect(metadata).toBeNull();
    });
  });

  describe('All Stage Templates', () => {
    const stages = [
      { name: 'clarifier', stage: 1 },
      { name: 'normalizer', stage: 1.5 },
      { name: 'docs-creator', stage: 2 },
      { name: 'schema-generator', stage: 3 },
      { name: 'structural-validator', stage: 3.5 },
      { name: 'file-structure-generator', stage: 4 },
      { name: 'validator', stage: 5 },
      { name: 'prompt-builder', stage: 7 },
      { name: 'gemini-coder', stage: 7 }
    ];

    test.each(stages)('should have correct metadata for $name', ({ name, stage }) => {
      const metadata = promptTemplateManager.getTemplateMetadata(name);
      expect(metadata.stage).toBe(stage);
    });

    test.each(stages)('should have ROLE section in $name template', ({ name }) => {
      const template = promptTemplateManager.getTemplate(name, {});
      expect(template).toContain('ROLE:');
    });

    test.each(stages)('should have TASK or CONSTRAINTS in $name template', ({ name }) => {
      const template = promptTemplateManager.getTemplate(name, {});
      expect(
        template.includes('TASK:') || template.includes('CONSTRAINTS:')
      ).toBe(true);
    });
  });

  describe('Prompt Builder Template', () => {
    test('should handle all variables', () => {
      const template = promptTemplateManager.getTemplate('prompt-builder', {
        file_path: 'src/routes/api/users.js',
        file_purpose: 'User API endpoints',
        docs_excerpt: 'User management documentation',
        schema_excerpt: '{ "User": { "id": "string" } }'
      });
      
      expect(template).toContain('src/routes/api/users.js');
      expect(template).toContain('User API endpoints');
      expect(template).toContain('User management documentation');
      expect(template).toContain('{ "User": { "id": "string" } }');
    });
  });

  describe('Gemini Coder Template', () => {
    test('should handle all variables', () => {
      const template = promptTemplateManager.getTemplate('gemini-coder', {
        file_path: 'src/components/Button.svelte',
        file_purpose: 'Reusable button component',
        docs_excerpt: 'Button component documentation',
        schema_excerpt: '{}',
        coding_rules: 'Use Svelte 5 syntax'
      });
      
      expect(template).toContain('src/components/Button.svelte');
      expect(template).toContain('Reusable button component');
      expect(template).toContain('Use Svelte 5 syntax');
    });
  });
});
