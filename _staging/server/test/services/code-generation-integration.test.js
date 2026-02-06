const { describe, it, expect, beforeEach } = require('@jest/globals');
const PromptBuilder = require('../../services/prompt-builder');
const CodeParser = require('../../services/code-parser');
const TemplateEngine = require('../../services/template-engine');
const CodeGenerator = require('../../services/code-generator');

describe('Code Generation Integration', () => {
  describe('PromptBuilder', () => {
    let promptBuilder;

    beforeEach(() => {
      promptBuilder = new PromptBuilder();
    });

    it('should build code generation prompt', () => {
      const task = {
        name: 'Create Express app',
        requirements: ['Use Express', 'Add CORS'],
        outputs: ['server/app.js'],
        context: {
          framework: 'express',
          dependencies: ['express', 'cors']
        }
      };

      const specJson = {
        projectName: 'Test App',
        stack: { backend: 'node' },
        features: { auth: true }
      };

      const prompt = promptBuilder.buildCodePrompt(task, specJson);

      expect(prompt).toContain('Test App');
      expect(prompt).toContain('Express');
      expect(prompt).toContain('server/app.js');
    });

    it('should build debug prompt', () => {
      const error = {
        message: 'TypeError: Cannot read property',
        stack: 'at line 10'
      };

      const code = 'const app = express();';
      const testOutput = 'Test failed';

      const prompt = promptBuilder.buildDebugPrompt(error, code, testOutput);

      expect(prompt).toContain('TypeError');
      expect(prompt).toContain('const app = express()');
      expect(prompt).toContain('Test failed');
    });
  });

  describe('CodeParser', () => {
    let codeParser;

    beforeEach(() => {
      codeParser = new CodeParser();
    });

    it('should parse code blocks from LLM response', () => {
      const response = `
Here's the code:

\`\`\`filename:server/app.js
const express = require('express');
const app = express();
module.exports = app;
\`\`\`

\`\`\`filename:package.json
{"name": "test-app"}
\`\`\`
`;

      const files = codeParser.parseCodeResponse(response);

      expect(files).toHaveLength(2);
      expect(files[0].path).toBe('server/app.js');
      expect(files[0].content).toContain('express');
      expect(files[1].path).toBe('package.json');
    });

    it('should parse patch from LLM response', () => {
      const response = `
Here's the fix:

\`\`\`patch
diff --git a/app.js b/app.js
--- a/app.js
+++ b/app.js
@@ -10,7 +10,7 @@
-  const port = 3000;
+  const port = process.env.PORT || 3000;
\`\`\`
`;

      const patch = codeParser.parsePatch(response);

      expect(patch).toBeTruthy();
      expect(patch).toContain('diff --git');
      expect(patch).toContain('process.env.PORT');
    });

    it('should validate files', () => {
      const files = [
        { path: 'app.js', content: 'const app = express();' },
        { path: 'test.js', content: 'test code' }
      ];

      const validation = codeParser.validateFiles(files);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid files', () => {
      const files = [
        { path: '', content: 'code' },
        { path: 'test.js', content: '' }
      ];

      const validation = codeParser.validateFiles(files);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('TemplateEngine', () => {
    let templateEngine;

    beforeEach(() => {
      templateEngine = new TemplateEngine();
    });

    it('should get Express app template', () => {
      const template = templateEngine.getTemplate('express-app');

      expect(template).toBeTruthy();
      expect(template.files).toBeDefined();
      expect(template.files.length).toBeGreaterThan(0);
    });

    it('should render template with variables', () => {
      const template = 'Hello {{name}}, port is {{port}}';
      const variables = { name: 'World', port: 3000 };

      const result = templateEngine.render(template, variables);

      expect(result).toBe('Hello World, port is 3000');
    });

    it('should list available templates', () => {
      const templates = templateEngine.getAvailableTemplates('express');

      expect(templates).toContain('express-app');
      expect(templates).toContain('express-route');
    });
  });

  describe('CodeGenerator', () => {
    let codeGenerator;
    let mockModelRouter;

    beforeEach(() => {
      mockModelRouter = {
        routeTask: async () => ({
          success: true,
          content: `
\`\`\`filename:server/app.js
const express = require('express');
const app = express();
module.exports = app;
\`\`\`
`,
          model: 'test-model',
          provider: 'test',
          cost: 0.001,
          tokens: 100,
          latency: 500
        })
      };

      codeGenerator = new CodeGenerator(mockModelRouter);
    });

    it('should generate code from template', async () => {
      const task = {
        templateId: 'express-app',
        context: {
          projectName: 'test-app',
          port: 3000
        }
      };

      const specJson = {
        projectName: 'Test App',
        stack: { backend: 'node' }
      };

      const result = await codeGenerator.generateFromTemplate(task, specJson);

      expect(result.success).toBe(true);
      expect(result.method).toBe('template');
      expect(result.files.length).toBeGreaterThan(0);
      expect(result.cost).toBe(0);
    });

    it('should generate code with LLM', async () => {
      const task = {
        name: 'Create Express app',
        agentRole: 'coder',
        requirements: ['Use Express'],
        outputs: ['server/app.js']
      };

      const specJson = {
        projectName: 'Test App',
        userId: 'user-123',
        projectId: 'proj-456'
      };

      const result = await codeGenerator.generateWithLLM(task, specJson);

      expect(result.success).toBe(true);
      expect(result.method).toBe('llm');
      expect(result.files.length).toBeGreaterThan(0);
      expect(result.cost).toBeGreaterThan(0);
    });

    it('should handle LLM failure gracefully', async () => {
      mockModelRouter.routeTask = async () => ({
        success: false,
        error: 'Model unavailable'
      });

      const task = {
        name: 'Create app',
        outputs: ['app.js']
      };

      const specJson = {
        projectName: 'Test',
        userId: 'user-123',
        projectId: 'proj-456'
      };

      await expect(
        codeGenerator.generateWithLLM(task, specJson)
      ).rejects.toThrow('Code generation failed');
    });
  });
});
