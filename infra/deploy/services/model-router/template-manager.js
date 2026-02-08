/**
 * Template Manager Service
 * 
 * Manages prompt templates for the Model Router with support for:
 * - Loading templates from file system
 * - Variable substitution
 * - Template validation
 * - Hot reloading
 * 
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
 */

const fs = require('fs').promises;
const path = require('path');
const chokidar = require('chokidar');

class TemplateManager {
  constructor(options = {}) {
    this.templateDir = options.templateDir || path.join(__dirname, '../../templates/prompts');
    this.templates = new Map();
    this.watchers = [];
    this.logger = options.logger || console;
    this.hotReloadEnabled = options.hotReload !== false;
    this.initialized = false;
  }

  /**
   * Initialize template manager
   * Load all templates from directory
   * Requirements: 13.1
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Ensure template directory exists
      await fs.mkdir(this.templateDir, { recursive: true });

      // Load all templates
      await this.loadAllTemplates();

      // Set up hot reloading if enabled
      if (this.hotReloadEnabled) {
        this.setupHotReload();
      }

      this.initialized = true;
      this.logger.info('Template manager initialized', {
        templateDir: this.templateDir,
        templateCount: this.templates.size,
        hotReload: this.hotReloadEnabled
      });
    } catch (error) {
      this.logger.error('Failed to initialize template manager', { error: error.message });
      throw error;
    }
  }

  /**
   * Load all templates from directory
   * Requirements: 13.1
   * @private
   */
  async loadAllTemplates() {
    try {
      const files = await fs.readdir(this.templateDir);
      const templateFiles = files.filter(f => f.endsWith('.txt') || f.endsWith('.md'));

      for (const file of templateFiles) {
        const templateName = path.basename(file, path.extname(file));
        await this.loadTemplate(templateName);
      }

      this.logger.info(`Loaded ${templateFiles.length} templates`);
    } catch (error) {
      // Directory might not exist yet, that's okay
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Load a specific template from file
   * Requirements: 13.1
   * @param {string} templateName - Template name (without extension)
   * @returns {Promise<string>} Template content
   */
  async loadTemplate(templateName) {
    if (!templateName) {
      throw new Error('Template name is required');
    }

    // Try different extensions
    const extensions = ['.txt', '.md'];
    let templateContent = null;
    let foundPath = null;

    for (const ext of extensions) {
      const templatePath = path.join(this.templateDir, `${templateName}${ext}`);
      try {
        templateContent = await fs.readFile(templatePath, 'utf8');
        foundPath = templatePath;
        break;
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }

    if (!templateContent) {
      throw new Error(`Template '${templateName}' not found in ${this.templateDir}`);
    }

    // Validate template
    this.validateTemplate(templateContent, templateName);

    // Store template
    this.templates.set(templateName, {
      content: templateContent,
      path: foundPath,
      loadedAt: new Date()
    });

    this.logger.debug(`Loaded template: ${templateName}`, { path: foundPath });

    return templateContent;
  }

  /**
   * Render template with variable substitution
   * Requirements: 13.2, 13.3
   * @param {string} templateName - Template name
   * @param {Object} variables - Variables to substitute
   * @returns {Promise<string>} Rendered template
   */
  async renderTemplate(templateName, variables = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    // Get template
    let template = this.templates.get(templateName);

    if (!template) {
      // Try to load it
      await this.loadTemplate(templateName);
      template = this.templates.get(templateName);
    }

    if (!template) {
      throw new Error(`Template '${templateName}' not found`);
    }

    // Validate required variables
    this.validateVariables(template.content, variables, templateName);

    // Substitute variables
    return this.substituteVariables(template.content, variables);
  }

  /**
   * Substitute variables in template
   * Supports {{variable}} and {{variable.nested}} syntax
   * Requirements: 13.2
   * @param {string} template - Template string
   * @param {Object} variables - Variables to substitute
   * @returns {string} Template with variables substituted
   */
  substituteVariables(template, variables) {
    let result = template;

    // Find all {{variable}} placeholders
    const placeholderRegex = /\{\{([^}]+)\}\}/g;
    const matches = template.matchAll(placeholderRegex);

    for (const match of matches) {
      const fullMatch = match[0]; // {{variable}}
      const variablePath = match[1].trim(); // variable or variable.nested

      // Get value from variables object (supports nested paths)
      const value = this.getNestedValue(variables, variablePath);

      // Convert value to string
      let substitution;
      if (value === undefined || value === null) {
        substitution = '';
      } else if (typeof value === 'object') {
        substitution = JSON.stringify(value, null, 2);
      } else {
        substitution = String(value);
      }

      // Replace placeholder
      result = result.replace(fullMatch, substitution);
    }

    return result;
  }

  /**
   * Get nested value from object using dot notation
   * @param {Object} obj - Object to traverse
   * @param {string} path - Dot-notation path (e.g., 'user.name')
   * @returns {*} Value at path
   * @private
   */
  getNestedValue(obj, path) {
    const parts = path.split('.');
    let value = obj;

    for (const part of parts) {
      if (value === undefined || value === null) {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }

  /**
   * Validate template syntax and structure
   * Requirements: 13.4
   * @param {string} template - Template content
   * @param {string} templateName - Template name for error messages
   * @throws {Error} If template is invalid
   */
  validateTemplate(template, templateName) {
    if (!template || typeof template !== 'string') {
      throw new Error(`Template '${templateName}' must be a non-empty string`);
    }

    // Check for unclosed placeholders
    const openBraces = (template.match(/\{\{/g) || []).length;
    const closeBraces = (template.match(/\}\}/g) || []).length;

    if (openBraces !== closeBraces) {
      throw new Error(
        `Template '${templateName}' has mismatched braces: ${openBraces} opening, ${closeBraces} closing`
      );
    }

    // Check for empty placeholders
    if (template.includes('{{}}')) {
      throw new Error(`Template '${templateName}' contains empty placeholder {{}}`);
    }

    // Check for nested placeholders (not supported)
    const nestedPlaceholder = /\{\{[^}]*\{\{/;
    if (nestedPlaceholder.test(template)) {
      throw new Error(`Template '${templateName}' contains nested placeholders (not supported)`);
    }

    return true;
  }

  /**
   * Validate that all required variables are provided
   * Requirements: 13.4
   * @param {string} template - Template content
   * @param {Object} variables - Provided variables
   * @param {string} templateName - Template name for error messages
   * @throws {Error} If required variables are missing
   */
  validateVariables(template, variables, templateName) {
    // Extract all variable names from template
    const placeholderRegex = /\{\{([^}]+)\}\}/g;
    const matches = template.matchAll(placeholderRegex);
    const requiredVars = new Set();

    for (const match of matches) {
      const variablePath = match[1].trim();
      requiredVars.add(variablePath);
    }

    // Check if all required variables are provided
    const missingVars = [];

    for (const varPath of requiredVars) {
      const value = this.getNestedValue(variables, varPath);
      if (value === undefined) {
        missingVars.push(varPath);
      }
    }

    if (missingVars.length > 0) {
      throw new Error(
        `Template '${templateName}' missing required variables: ${missingVars.join(', ')}`
      );
    }

    return true;
  }

  /**
   * Get list of all available templates
   * @returns {string[]} Array of template names
   */
  getAvailableTemplates() {
    return Array.from(this.templates.keys());
  }

  /**
   * Check if a template exists
   * @param {string} templateName - Template name
   * @returns {boolean} True if template exists
   */
  hasTemplate(templateName) {
    return this.templates.has(templateName);
  }

  /**
   * Get template metadata
   * @param {string} templateName - Template name
   * @returns {Object|null} Template metadata
   */
  getTemplateMetadata(templateName) {
    const template = this.templates.get(templateName);
    if (!template) {
      return null;
    }

    return {
      name: templateName,
      path: template.path,
      loadedAt: template.loadedAt,
      size: template.content.length
    };
  }

  /**
   * Get all template metadata
   * @returns {Object[]} Array of template metadata
   */
  getAllTemplateMetadata() {
    return this.getAvailableTemplates().map(name => this.getTemplateMetadata(name));
  }

  /**
   * Reload a specific template from disk
   * Requirements: 13.5
   * @param {string} templateName - Template name
   * @returns {Promise<void>}
   */
  async reloadTemplate(templateName) {
    this.logger.info(`Reloading template: ${templateName}`);
    await this.loadTemplate(templateName);
  }

  /**
   * Reload all templates from disk
   * Requirements: 13.5
   * @returns {Promise<void>}
   */
  async reloadAllTemplates() {
    this.logger.info('Reloading all templates');
    this.templates.clear();
    await this.loadAllTemplates();
  }

  /**
   * Set up hot reloading for templates
   * Watch template directory for changes
   * Requirements: 13.5
   * @private
   */
  setupHotReload() {
    const watcher = chokidar.watch(this.templateDir, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    });

    watcher.on('add', async (filePath) => {
      const templateName = path.basename(filePath, path.extname(filePath));
      this.logger.info(`Template added: ${templateName}`);
      try {
        await this.loadTemplate(templateName);
      } catch (error) {
        this.logger.error(`Failed to load new template: ${templateName}`, { error: error.message });
      }
    });

    watcher.on('change', async (filePath) => {
      const templateName = path.basename(filePath, path.extname(filePath));
      this.logger.info(`Template changed: ${templateName}`);
      try {
        await this.reloadTemplate(templateName);
      } catch (error) {
        this.logger.error(`Failed to reload template: ${templateName}`, { error: error.message });
      }
    });

    watcher.on('unlink', (filePath) => {
      const templateName = path.basename(filePath, path.extname(filePath));
      this.logger.info(`Template removed: ${templateName}`);
      this.templates.delete(templateName);
    });

    watcher.on('error', (error) => {
      this.logger.error('Template watcher error', { error: error.message });
    });

    this.watchers.push(watcher);

    this.logger.info('Hot reload enabled for templates', { directory: this.templateDir });
  }

  /**
   * Stop watching for template changes
   * @returns {Promise<void>}
   */
  async stopHotReload() {
    for (const watcher of this.watchers) {
      await watcher.close();
    }
    this.watchers = [];
    this.logger.info('Hot reload stopped');
  }

  /**
   * Clean up resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    await this.stopHotReload();
    this.templates.clear();
    this.initialized = false;
  }
}

module.exports = TemplateManager;
module.exports.TemplateManager = TemplateManager;
