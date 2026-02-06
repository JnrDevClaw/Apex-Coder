/**
 * CodeGenerator Service
 * 
 * Generates code using LLMs with template fallback.
 * Organizes generated files and manages the code generation workflow.
 * 
 * Requirements: 3.1, 3.2, 3.3
 */

const PromptBuilder = require('./prompt-builder');
const CodeParser = require('./code-parser');
const TemplateEngine = require('./template-engine');

class CodeGenerator {
  constructor(modelRouter) {
    this.modelRouter = modelRouter;
    this.promptBuilder = new PromptBuilder();
    this.codeParser = new CodeParser();
    this.templateEngine = new TemplateEngine();
  }

  /**
   * Generate code for a task
   * Tries template-based generation first, falls back to LLM
   * 
   * @param {Object} task - Task object with requirements and context
   * @param {Object} specJson - Project specification
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generation result with files, cost, method
   */
  async generateCode(task, specJson, options = {}) {
    // Try template-based generation first (faster, cheaper)
    if (this._shouldUseTemplate(task, options)) {
      try {
        return await this.generateFromTemplate(task, specJson);
      } catch (error) {
        console.warn('Template generation failed, falling back to LLM:', error.message);
      }
    }
    
    // Fall back to LLM generation
    return await this.generateWithLLM(task, specJson, options);
  }

  /**
   * Generate code from template
   * Fast, deterministic generation using predefined templates
   * 
   * @param {Object} task - Task object
   * @param {Object} specJson - Project specification
   * @returns {Promise<Object>} Generation result
   */
  async generateFromTemplate(task, specJson) {
    const templateId = task.templateId || this._inferTemplateId(task, specJson);
    
    if (!templateId) {
      throw new Error('No template ID specified or could be inferred');
    }
    
    const template = this.templateEngine.getTemplate(templateId);
    
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }
    
    // Validate template
    const validation = this.templateEngine.validateTemplate(template);
    if (!validation.valid) {
      throw new Error(`Invalid template: ${validation.errors.join(', ')}`);
    }
    
    // Extract variables from task and spec
    const variables = this._extractVariables(task, specJson);
    
    // Render template files
    const files = template.files.map(fileTemplate => ({
      path: this.templateEngine.renderPath(fileTemplate.path, variables),
      content: this.templateEngine.renderContent(fileTemplate.content, variables),
      language: this._inferLanguage(fileTemplate.path)
    }));
    
    // Organize files
    const organizedFiles = this._organizeFiles(files, specJson);
    
    return {
      success: true,
      files: organizedFiles,
      method: 'template',
      templateId,
      cost: 0,
      tokens: 0,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Generate code using LLM
   * Flexible generation for complex or custom requirements
   * 
   * @param {Object} task - Task object
   * @param {Object} specJson - Project specification
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generation result
   */
  async generateWithLLM(task, specJson, options = {}) {
    // Build prompt
    const prompt = this.promptBuilder.buildCodePrompt(task, specJson);
    
    // Determine agent role and complexity
    const role = task.agentRole || 'coder';
    const complexity = task.complexity || this._inferComplexity(task);
    
    // Call LLM via ModelRouter
    const response = await this.modelRouter.routeTask({
      role,
      complexity,
      prompt,
      fallback: options.fallback !== false,
      maxTokens: options.maxTokens || 4096
    }, {
      userId: specJson.userId,
      projectId: specJson.projectId,
      taskId: task.id,
      correlationId: options.correlationId
    });
    
    if (!response.success) {
      throw new Error(`Code generation failed: ${response.error}`);
    }
    
    // Parse code from response
    const files = this.codeParser.parseCodeResponse(response.content);
    
    if (files.length === 0) {
      throw new Error('No code files found in LLM response');
    }
    
    // Validate parsed files
    const validation = this.codeParser.validateFiles(files);
    if (!validation.valid) {
      throw new Error(`Invalid generated files: ${validation.errors.join(', ')}`);
    }
    
    // Organize files
    const organizedFiles = this._organizeFiles(files, specJson);
    
    return {
      success: true,
      files: organizedFiles,
      method: 'llm',
      model: response.model,
      provider: response.provider,
      cost: response.cost || 0,
      tokens: response.tokens || 0,
      latency: response.latency || 0,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Generate multiple files in batch
   * Useful for generating related files together
   * 
   * @param {Array<Object>} tasks - Array of tasks
   * @param {Object} specJson - Project specification
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Batch generation result
   */
  async generateBatch(tasks, specJson, options = {}) {
    const results = [];
    let totalCost = 0;
    let totalTokens = 0;
    
    for (const task of tasks) {
      try {
        const result = await this.generateCode(task, specJson, options);
        results.push({
          taskId: task.id,
          success: true,
          ...result
        });
        
        totalCost += result.cost || 0;
        totalTokens += result.tokens || 0;
      } catch (error) {
        results.push({
          taskId: task.id,
          success: false,
          error: error.message
        });
      }
    }
    
    const allFiles = results
      .filter(r => r.success)
      .flatMap(r => r.files);
    
    return {
      success: results.every(r => r.success),
      results,
      files: allFiles,
      totalCost,
      totalTokens,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Regenerate specific files
   * Useful for fixing or updating specific files
   * 
   * @param {Array<string>} filePaths - Paths of files to regenerate
   * @param {Object} task - Original task
   * @param {Object} specJson - Project specification
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Regeneration result
   */
  async regenerateFiles(filePaths, task, specJson, options = {}) {
    // Create a modified task that focuses on specific files
    const modifiedTask = {
      ...task,
      outputs: filePaths,
      requirements: [
        ...(task.requirements || []),
        `Regenerate only these files: ${filePaths.join(', ')}`
      ]
    };
    
    return await this.generateWithLLM(modifiedTask, specJson, options);
  }

  // Private helper methods

  _shouldUseTemplate(task, options) {
    // Force template if specified
    if (options.forceTemplate) {
      return true;
    }
    
    // Force LLM if specified
    if (options.forceLLM) {
      return false;
    }
    
    // Use template if available and task is simple
    if (task.templateId && this.templateEngine.hasTemplate(task.templateId)) {
      return true;
    }
    
    // Use template for common patterns
    const commonPatterns = ['basic-app', 'simple-route', 'crud-model'];
    if (task.pattern && commonPatterns.includes(task.pattern)) {
      return true;
    }
    
    return false;
  }

  _inferTemplateId(task, specJson) {
    const stack = specJson.stack?.backend || specJson.stack?.framework;
    
    if (!stack) {
      return null;
    }
    
    // Map task types to template IDs
    const taskType = task.type || this._inferTaskType(task);
    
    const templateMap = {
      'express-app': 'express-app',
      'express-route': 'express-route',
      'express-model': 'express-model',
      'fastapi-app': 'fastapi-app',
      'fastapi-model': 'fastapi-model',
      'svelte-component': 'svelte-component',
      'svelte-page': 'svelte-page',
      'react-component': 'react-component',
      'react-page': 'react-page'
    };
    
    const key = `${stack.toLowerCase()}-${taskType}`;
    return templateMap[key] || null;
  }

  _inferTaskType(task) {
    const name = task.name?.toLowerCase() || '';
    
    if (name.includes('app') || name.includes('server') || name.includes('setup')) {
      return 'app';
    }
    
    if (name.includes('route') || name.includes('endpoint') || name.includes('api')) {
      return 'route';
    }
    
    if (name.includes('model') || name.includes('schema') || name.includes('entity')) {
      return 'model';
    }
    
    if (name.includes('component')) {
      return 'component';
    }
    
    if (name.includes('page') || name.includes('view')) {
      return 'page';
    }
    
    return 'unknown';
  }

  _extractVariables(task, specJson) {
    const variables = {
      projectName: specJson.projectName || 'generated-app',
      description: specJson.description || 'Generated application',
      port: specJson.port || 3000,
      timestamp: new Date().toISOString(),
      
      // Task-specific
      routeName: task.context?.routeName || 'api',
      routePath: task.context?.routePath || '/api',
      modelName: task.context?.modelName || 'Model',
      ModelName: this._capitalize(task.context?.modelName || 'Model'),
      componentName: task.context?.componentName || 'component',
      ComponentName: this._capitalize(task.context?.componentName || 'Component'),
      pageName: task.context?.pageName || 'page',
      PageName: this._capitalize(task.context?.pageName || 'Page'),
      pageTitle: task.context?.pageTitle || 'Page',
      
      // Defaults
      routes: '',
      fields: '',
      jsonFields: '',
      props: '',
      logic: '',
      content: '',
      styles: '',
      state: '',
      hooks: '',
      imports: '',
      onMountLogic: '',
      effectLogic: '',
      additionalDeps: '',
      envVars: '',
      apiDocs: '',
      example: ''
    };
    
    // Merge with task context
    if (task.context) {
      Object.assign(variables, task.context);
    }
    
    return variables;
  }

  _organizeFiles(files, specJson) {
    // Add metadata and organize files
    return files.map(file => ({
      ...file,
      size: file.content.length,
      language: file.language || this._inferLanguage(file.path),
      projectId: specJson.projectId,
      generatedAt: new Date().toISOString()
    }));
  }

  _inferLanguage(path) {
    const ext = path.split('.').pop()?.toLowerCase();
    
    const langMap = {
      'js': 'javascript',
      'ts': 'typescript',
      'py': 'python',
      'java': 'java',
      'go': 'go',
      'rs': 'rust',
      'rb': 'ruby',
      'php': 'php',
      'swift': 'swift',
      'kt': 'kotlin',
      'jsx': 'javascript',
      'tsx': 'typescript',
      'svelte': 'svelte',
      'vue': 'vue',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'yaml': 'yaml',
      'yml': 'yaml',
      'md': 'markdown'
    };
    
    return langMap[ext] || ext || 'text';
  }

  _inferComplexity(task) {
    // Infer complexity based on task characteristics
    const outputs = task.outputs?.length || 0;
    const requirements = task.requirements?.length || 0;
    const dependencies = task.context?.dependencies?.length || 0;
    
    const score = outputs + requirements + dependencies;
    
    if (score <= 3) return 'low';
    if (score <= 7) return 'medium';
    return 'high';
  }

  _capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

module.exports = CodeGenerator;
