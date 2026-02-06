/**
 * Vicuna Provider
 * Specialized for conversational requirement gathering and interviewing
 */

const { LLMProvider, LLMResponse } = require('../model-router');

class VicunaProvider extends LLMProvider {
  constructor(config = {}) {
    super({
      name: 'vicuna-13b',
      capabilities: ['interviewer', 'deployer'],
      costPerToken: config.costPerToken || 0.0001,
      maxTokens: config.maxTokens || 4096,
      latency: config.latency || 600,
      reliability: config.reliability || 0.92,
      ...config
    });
    
    this.apiKey = config.apiKey || process.env.HUGGINGFACE_API_KEY;
    this.baseUrl = config.baseUrl || 'https://api-inference.huggingface.co/models/lmsys/vicuna-13b-v1.5';
    this.modelName = 'lmsys/vicuna-13b-v1.5';
    
    if (!this.apiKey) {
      console.warn('Vicuna API key not provided. Provider will not function.');
    }
  }

  /**
   * Make API call to Vicuna
   * @param {string} prompt - The prompt to send
   * @param {Object} context - Additional context
   * @returns {Promise<LLMResponse>}
   */
  async call(prompt, context = {}) {
    if (!this.apiKey) {
      throw new Error('Vicuna API key not configured');
    }

    const { role, temperature = 0.8, maxTokens = 2048 } = context;
    const formattedPrompt = this.formatConversationalPrompt(prompt, role, context);
    
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
            do_sample: true,
            top_p: 0.9,
            repetition_penalty: 1.1,
            return_full_text: false
          },
          options: {
            wait_for_model: true,
            use_cache: false
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Vicuna API error: ${response.status} - ${errorData.error || response.statusText}`);
      }

      const data = await response.json();
      const latency = Date.now() - startTime;
      
      let content = '';
      if (Array.isArray(data) && data.length > 0) {
        content = data[0].generated_text || '';
      } else if (data.generated_text) {
        content = data.generated_text;
      }
      
      // Clean and format conversational response
      content = this.cleanConversationalResponse(content, role);
      
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
          conversationQuality: this.assessConversationQuality(content),
          role: role
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
   * Format prompt for conversational interaction
   * @param {string} prompt - Original prompt
   * @param {string} role - Agent role
   * @param {Object} context - Additional context
   * @returns {string}
   */
  formatConversationalPrompt(prompt, role, context) {
    const conversationHistory = context.conversationHistory || [];
    
    let formattedPrompt = '';
    
    if (role === 'interviewer') {
      formattedPrompt = `You are a helpful business analyst conducting a requirements interview. Your goal is to gather detailed information about the user's project through natural conversation.

User's initial request: ${prompt}

Please ask 2-3 thoughtful follow-up questions to better understand:
1. The specific goals and objectives
2. The target users and their needs
3. Any constraints or requirements

Keep your questions conversational and easy to understand.

Questions:`;
    } else if (role === 'deployer') {
      formattedPrompt = `You are a deployment specialist helping to summarize and verify a successful deployment.

Deployment context: ${prompt}

Please provide a clear summary of:
1. What was deployed successfully
2. Key components and their status
3. Any important URLs or access information
4. Next steps for the user

Summary:`;
    } else {
      formattedPrompt = `${prompt}

Response:`;
    }
    
    return formattedPrompt;
  }

  /**
   * Clean conversational response
   * @param {string} content - Generated content
   * @param {string} role - Agent role
   * @returns {string}
   */
  cleanConversationalResponse(content, role) {
    return content
      .replace(/^Questions:\s*/i, '')
      .replace(/^Summary:\s*/i, '')
      .replace(/^Response:\s*/i, '')
      .replace(/^\d+\.\s*/gm, '') // Remove numbered list formatting if not needed
      .trim();
  }

  /**
   * Assess conversation quality
   * @param {string} content - Generated content
   * @returns {Object}
   */
  assessConversationQuality(content) {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const questions = content.split('?').length - 1;
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;
    
    return {
      sentenceCount: sentences.length,
      questionCount: questions,
      avgSentenceLength: Math.round(avgSentenceLength),
      conversationalTone: questions > 0 ? 'interactive' : 'informative',
      clarity: avgSentenceLength < 100 ? 'high' : avgSentenceLength < 150 ? 'medium' : 'low'
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
   * Health check for Vicuna
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    if (!this.apiKey) {
      return false;
    }

    try {
      const response = await this.call('Hello, how can I help you today?', { 
        role: 'interviewer',
        maxTokens: 50 
      });
      return response.success;
    } catch (error) {
      console.error('Vicuna health check failed:', error);
      return false;
    }
  }

  /**
   * Get specialized capabilities for requirement gathering
   * @returns {Object}
   */
  getInterviewCapabilities() {
    return {
      conversationalStyle: 'natural',
      questionTypes: ['clarifying', 'exploratory', 'validation'],
      domainExpertise: ['business-requirements', 'user-stories', 'technical-constraints'],
      responseFormat: 'conversational',
      followUpGeneration: true
    };
  }
}

module.exports = VicunaProvider;