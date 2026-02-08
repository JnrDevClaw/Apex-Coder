/**
 * Code Generation Models Provider
 * Provides access to specialized code generation models like StarCoder2 and CodeGen-16B
 */

const { LLMProvider, LLMResponse } = require('../model-router');

class StarCoder2Provider extends LLMProvider {
  constructor(config = {}) {
    super({
      name: 'starcoder2',
      capabilities: ['coder', 'tester'],
      costPerToken: config.costPerToken || 0.00015,
      maxTokens: config.maxTokens || 8192,
      latency: config.latency || 800, // Code models can be slower
      reliability: config.reliability || 0.91,
      ...config
    });
    
    this.apiKey = config.apiKey || process.env.HUGGINGFACE_API_KEY; // Often hosted on HF
    this.baseUrl = config.baseUrl || 'https://api-inference.huggingface.co/models/bigcode/starcoder2-15b';
    this.modelName = 'bigcode/starcoder2-15b';
    
    if (!this.apiKey) {
      console.warn('StarCoder2 API key not provided. Provider will not function.');
    }
  }

  /**
   * Make API call to StarCoder2
   * @param {string} prompt - The prompt to send
   * @param {Object} context - Additional context
   * @returns {Promise<LLMResponse>}
   */
  async call(prompt, context = {}) {
    if (!this.apiKey) {
      throw new Error('StarCoder2 API key not configured');
    }

    const { role, temperature = 0.1, maxTokens = 4096 } = context;
    const formattedPrompt = this.formatCodePrompt(prompt, role, context);
    
    const startTime = Date.now();
    
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: formattedPrompt,
          parameters: {
            max_new_tokens: maxTokens,
            temperature: temperature,
            do_sample: temperature > 0,
            return_full_text: false,
            stop: ['</code>', '```', '\n\n\n'] // Stop sequences for code
          },
          options: {
            wait_for_model: true,
            use_cache: false
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`StarCoder2 API error: ${response.status} - ${errorData.error || response.statusText}`);
      }

      const data = await response.json();
      const latency = Date.now() - startTime;
      
      // Handle response format
      let content = '';
      if (Array.isArray(data) && data.length > 0) {
        content = data[0].generated_text || '';
      } else if (data.generated_text) {
        content = data.generated_text;
      }
      
      // Clean up the generated code
      content = this.cleanGeneratedCode(content);
      
      // Estimate tokens
      const tokens = Math.ceil((formattedPrompt.length + content.length) / 4);
      const cost = this.calculateCost(tokens);
      
      return new LLMResponse({
        success: true,
        content: content,
        tokens: tokens,
        cost: cost,
        latency: latency,
        provider: this.name,
        model: this.modelName,
        metadata: {
          originalResponse: data,
          language: this.detectLanguage(content)
        }
      });

    } catch (error) {
      const latency = Date.now() - startTime;
      
      return new LLMResponse({
        success: false,
        content: '',
        tokens: 0,
        cost: 0,
        latency: latency,
        provider: this.name,
        model: this.modelName,
        error: error.message,
        metadata: { originalError: error }
      });
    }
  }

  /**
   * Format prompt for code generation
   * @param {string} prompt - Original prompt
   * @param {string} role - Agent role
   * @param {Object} context - Additional context
   * @returns {string}
   */
  formatCodePrompt(prompt, role, context) {
    const language = context.language || 'javascript';
    const framework = context.framework || '';
    
    let formattedPrompt = '';
    
    if (role === 'coder') {
      formattedPrompt = `// ${language.toUpperCase()} ${framework ? `(${framework})` : ''}\n// Task: ${prompt}\n\n`;
    } else if (role === 'tester') {
      formattedPrompt = `// ${language.toUpperCase()} TEST\n// Generate tests for: ${prompt}\n\n`;
    } else {
      formattedPrompt = `// ${prompt}\n\n`;
    }
    
    return formattedPrompt;
  }

  /**
   * Clean up generated code
   * @param {string} code - Generated code
   * @returns {string}
   */
  cleanGeneratedCode(code) {
    // Remove common artifacts from code generation
    return code
      .replace(/^```[\w]*\n/, '') // Remove opening code blocks
      .replace(/\n```$/, '') // Remove closing code blocks
      .replace(/^\/\/ .*\n/, '') // Remove comment lines at start
      .trim();
  }

  /**
   * Detect programming language from code
   * @param {string} code - Generated code
   * @returns {string}
   */
  detectLanguage(code) {
    if (code.includes('function') && code.includes('{')) return 'javascript';
    if (code.includes('def ') && code.includes(':')) return 'python';
    if (code.includes('func ') && code.includes('{')) return 'go';
    if (code.includes('class ') && code.includes('{')) return 'java';
    return 'unknown';
  }

  /**
   * Calculate cost based on tokens
   * @param {number} tokens - Number of tokens used
   * @returns {number}
   */
  calculateCost(tokens) {
    return tokens * this.costPerToken;
  }

  /**
   * Health check for StarCoder2
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    if (!this.apiKey) {
      return false;
    }

    try {
      const response = await this.call('// Hello world function', { maxTokens: 50 });
      return response.success;
    } catch (error) {
      console.error('StarCoder2 health check failed:', error);
      return false;
    }
  }
}

class CodeGenProvider extends LLMProvider {
  constructor(config = {}) {
    super({
      name: 'codegen-16b',
      capabilities: ['coder', 'tester'],
      costPerToken: config.costPerToken || 0.0002,
      maxTokens: config.maxTokens || 6144,
      latency: config.latency || 900,
      reliability: config.reliability || 0.89,
      ...config
    });
    
    this.apiKey = config.apiKey || process.env.HUGGINGFACE_API_KEY;
    this.baseUrl = config.baseUrl || 'https://api-inference.huggingface.co/models/Salesforce/codegen-16B-mono';
    this.modelName = 'Salesforce/codegen-16B-mono';
    
    if (!this.apiKey) {
      console.warn('CodeGen API key not provided. Provider will not function.');
    }
  }

  /**
   * Make API call to CodeGen
   * @param {string} prompt - The prompt to send
   * @param {Object} context - Additional context
   * @returns {Promise<LLMResponse>}
   */
  async call(prompt, context = {}) {
    if (!this.apiKey) {
      throw new Error('CodeGen API key not configured');
    }

    const { role, temperature = 0.2, maxTokens = 3072 } = context;
    const formattedPrompt = this.formatCodePrompt(prompt, role, context);
    
    const startTime = Date.now();
    
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: formattedPrompt,
          parameters: {
            max_new_tokens: maxTokens,
            temperature: temperature,
            do_sample: temperature > 0,
            return_full_text: false,
            stop: ['\n\n', '###', '//END'] // CodeGen stop sequences
          },
          options: {
            wait_for_model: true,
            use_cache: false
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`CodeGen API error: ${response.status} - ${errorData.error || response.statusText}`);
      }

      const data = await response.json();
      const latency = Date.now() - startTime;
      
      // Handle response format
      let content = '';
      if (Array.isArray(data) && data.length > 0) {
        content = data[0].generated_text || '';
      } else if (data.generated_text) {
        content = data.generated_text;
      }
      
      // Clean up the generated code
      content = this.cleanGeneratedCode(content);
      
      // Estimate tokens
      const tokens = Math.ceil((formattedPrompt.length + content.length) / 4);
      const cost = this.calculateCost(tokens);
      
      return new LLMResponse({
        success: true,
        content: content,
        tokens: tokens,
        cost: cost,
        latency: latency,
        provider: this.name,
        model: this.modelName,
        metadata: {
          originalResponse: data,
          codeQuality: this.assessCodeQuality(content)
        }
      });

    } catch (error) {
      const latency = Date.now() - startTime;
      
      return new LLMResponse({
        success: false,
        content: '',
        tokens: 0,
        cost: 0,
        latency: latency,
        provider: this.name,
        model: this.modelName,
        error: error.message,
        metadata: { originalError: error }
      });
    }
  }

  /**
   * Format prompt for CodeGen
   * @param {string} prompt - Original prompt
   * @param {string} role - Agent role
   * @param {Object} context - Additional context
   * @returns {string}
   */
  formatCodePrompt(prompt, role, context) {
    const language = context.language || 'python';
    
    // CodeGen works well with natural language descriptions
    let formattedPrompt = `# ${prompt}\n`;
    
    if (role === 'tester') {
      formattedPrompt += `# Write comprehensive tests\n`;
    }
    
    if (language === 'python') {
      formattedPrompt += `def `;
    } else if (language === 'javascript') {
      formattedPrompt += `function `;
    }
    
    return formattedPrompt;
  }

  /**
   * Clean up generated code
   * @param {string} code - Generated code
   * @returns {string}
   */
  cleanGeneratedCode(code) {
    return code
      .replace(/^```[\w]*\n/, '')
      .replace(/\n```$/, '')
      .replace(/###.*$/gm, '') // Remove CodeGen artifacts
      .trim();
  }

  /**
   * Assess code quality
   * @param {string} code - Generated code
   * @returns {Object}
   */
  assessCodeQuality(code) {
    const lines = code.split('\n');
    const hasComments = lines.some(line => line.trim().startsWith('#') || line.trim().startsWith('//'));
    const hasDocstrings = code.includes('"""') || code.includes("'''");
    const avgLineLength = lines.reduce((sum, line) => sum + line.length, 0) / lines.length;
    
    return {
      linesOfCode: lines.length,
      hasComments,
      hasDocstrings,
      avgLineLength: Math.round(avgLineLength),
      complexity: lines.length > 50 ? 'high' : lines.length > 20 ? 'medium' : 'low'
    };
  }

  /**
   * Calculate cost based on tokens
   * @param {number} tokens - Number of tokens used
   * @returns {number}
   */
  calculateCost(tokens) {
    return tokens * this.costPerToken;
  }

  /**
   * Health check for CodeGen
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    if (!this.apiKey) {
      return false;
    }

    try {
      const response = await this.call('Create a hello world function', { maxTokens: 50 });
      return response.success;
    } catch (error) {
      console.error('CodeGen health check failed:', error);
      return false;
    }
  }
}

module.exports = {
  StarCoder2Provider,
  CodeGenProvider
};