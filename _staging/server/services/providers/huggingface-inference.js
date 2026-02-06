/**
 * Hugging Face Inference API Integration
 * Provides access to various AI models through Hugging Face's Inference API
 */

const structuredLogger = require('../structured-logger');

class HuggingFaceInference {
  constructor() {
    this.apiKey = process.env.HUGGINGFACE_API_KEY;
    this.baseUrl = 'https://api-inference.huggingface.co/models';
    this.headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
    
    // Model configurations with their specific roles and capabilities
    this.models = {
      // Code Generation & Analysis
      'codellama/CodeLlama-7b-Instruct-hf': {
        role: 'code-generation',
        capabilities: ['code-generation', 'code-analysis', 'debugging'],
        maxTokens: 4096,
        temperature: 0.1,
        description: 'Code generation and analysis'
      },
      'microsoft/DialoGPT-medium': {
        role: 'conversational',
        capabilities: ['conversation', 'chat', 'dialogue'],
        maxTokens: 1024,
        temperature: 0.7,
        description: 'Conversational AI for user interaction'
      },
      'microsoft/CodeBERT-base': {
        role: 'code-understanding',
        capabilities: ['code-analysis', 'code-search', 'code-similarity'],
        maxTokens: 512,
        temperature: 0.1,
        description: 'Code understanding and analysis'
      },
      
      // Text Generation & Analysis
      'microsoft/DialoGPT-large': {
        role: 'advanced-conversation',
        capabilities: ['advanced-dialogue', 'context-understanding', 'reasoning'],
        maxTokens: 1024,
        temperature: 0.6,
        description: 'Advanced conversational AI'
      },
      'facebook/blenderbot-400M-distill': {
        role: 'chatbot',
        capabilities: ['casual-conversation', 'knowledge-qa', 'personality'],
        maxTokens: 512,
        temperature: 0.8,
        description: 'Friendly chatbot for user guidance'
      },
      'google/flan-t5-large': {
        role: 'instruction-following',
        capabilities: ['instruction-following', 'task-completion', 'reasoning'],
        maxTokens: 512,
        temperature: 0.3,
        description: 'Instruction following and task completion'
      },
      
      // Specialized Models
      'sentence-transformers/all-MiniLM-L6-v2': {
        role: 'embedding',
        capabilities: ['text-embedding', 'similarity', 'semantic-search'],
        maxTokens: 256,
        temperature: 0.0,
        description: 'Text embeddings for semantic analysis'
      },
      'facebook/bart-large-mnli': {
        role: 'classification',
        capabilities: ['text-classification', 'intent-detection', 'sentiment'],
        maxTokens: 512,
        temperature: 0.1,
        description: 'Text classification and intent detection'
      },
      'distilbert-base-uncased-finetuned-sst-2-english': {
        role: 'sentiment-analysis',
        capabilities: ['sentiment-analysis', 'emotion-detection'],
        maxTokens: 512,
        temperature: 0.1,
        description: 'Sentiment analysis for user feedback'
      },
      
      // Technical & Domain-Specific
      'microsoft/codebert-base-mlm': {
        role: 'code-completion',
        capabilities: ['code-completion', 'code-prediction', 'syntax-analysis'],
        maxTokens: 512,
        temperature: 0.2,
        description: 'Code completion and syntax analysis'
      },
      'huggingface/CodeBERTa-small-v1': {
        role: 'code-review',
        capabilities: ['code-review', 'bug-detection', 'code-quality'],
        maxTokens: 512,
        temperature: 0.1,
        description: 'Code review and quality analysis'
      }
    };
    
    // Role-based model mapping for the questionnaire system
    this.roleMapping = {
      'guidance-generation': 'google/flan-t5-large',
      'technical-inference': 'codellama/CodeLlama-7b-Instruct-hf',
      'code-analysis': 'microsoft/CodeBERT-base',
      'conversation': 'facebook/blenderbot-400M-distill',
      'classification': 'facebook/bart-large-mnli',
      'sentiment-analysis': 'distilbert-base-uncased-finetuned-sst-2-english',
      'embedding': 'sentence-transformers/all-MiniLM-L6-v2',
      'instruction-following': 'google/flan-t5-large'
    };
  }

  /**
   * Check if Hugging Face API is available
   */
  isAvailable() {
    return !!this.apiKey;
  }

  /**
   * Get model by role
   */
  getModelByRole(role) {
    const modelName = this.roleMapping[role];
    return modelName ? this.models[modelName] : null;
  }

  /**
   * Generate text using specified model
   */
  async generateText(modelName, prompt, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('Hugging Face API key not configured');
    }

    const model = this.models[modelName];
    if (!model) {
      throw new Error(`Model ${modelName} not configured`);
    }

    const requestOptions = {
      inputs: prompt,
      parameters: {
        max_new_tokens: options.maxTokens || model.maxTokens || 512,
        temperature: options.temperature ?? model.temperature ?? 0.7,
        do_sample: true,
        top_p: options.topP || 0.9,
        repetition_penalty: options.repetitionPenalty || 1.1
      },
      options: {
        wait_for_model: true,
        use_cache: options.useCache !== false
      }
    };

    try {
      structuredLogger.info('Calling Hugging Face Inference API', {
        model: modelName,
        role: model.role,
        promptLength: prompt.length
      });

      const response = await fetch(`${this.baseUrl}/${modelName}`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(requestOptions)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Hugging Face API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      
      // Handle different response formats
      let generatedText;
      if (Array.isArray(result)) {
        generatedText = result[0]?.generated_text || result[0]?.text || '';
      } else {
        generatedText = result.generated_text || result.text || '';
      }

      // Clean up the response (remove the original prompt if included)
      if (generatedText.startsWith(prompt)) {
        generatedText = generatedText.substring(prompt.length).trim();
      }

      structuredLogger.info('Hugging Face inference completed', {
        model: modelName,
        responseLength: generatedText.length
      });

      return {
        text: generatedText,
        model: modelName,
        role: model.role,
        metadata: {
          model_info: model,
          request_options: requestOptions,
          response_length: generatedText.length
        }
      };
    } catch (error) {
      structuredLogger.error('Hugging Face inference failed', {
        model: modelName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate embeddings for text
   */
  async generateEmbeddings(text, options = {}) {
    const modelName = 'sentence-transformers/all-MiniLM-L6-v2';
    
    if (!this.isAvailable()) {
      throw new Error('Hugging Face API key not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/${modelName}`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          inputs: text,
          options: {
            wait_for_model: true
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Hugging Face embedding error: ${response.status} - ${errorText}`);
      }

      const embeddings = await response.json();
      
      return {
        embeddings: embeddings,
        model: modelName,
        text_length: text.length
      };
    } catch (error) {
      structuredLogger.error('Hugging Face embedding failed', {
        error: error.message,
        textLength: text.length
      });
      throw error;
    }
  }

  /**
   * Classify text using classification models
   */
  async classifyText(text, labels, options = {}) {
    const modelName = 'facebook/bart-large-mnli';
    
    if (!this.isAvailable()) {
      throw new Error('Hugging Face API key not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/${modelName}`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          inputs: text,
          parameters: {
            candidate_labels: labels
          },
          options: {
            wait_for_model: true
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Hugging Face classification error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      
      return {
        labels: result.labels,
        scores: result.scores,
        sequence: result.sequence,
        model: modelName
      };
    } catch (error) {
      structuredLogger.error('Hugging Face classification failed', {
        error: error.message,
        textLength: text.length,
        labelsCount: labels.length
      });
      throw error;
    }
  }

  /**
   * Analyze sentiment of text
   */
  async analyzeSentiment(text, options = {}) {
    const modelName = 'distilbert-base-uncased-finetuned-sst-2-english';
    
    if (!this.isAvailable()) {
      throw new Error('Hugging Face API key not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/${modelName}`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          inputs: text,
          options: {
            wait_for_model: true
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Hugging Face sentiment error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      
      return {
        sentiment: result[0]?.label || 'UNKNOWN',
        confidence: result[0]?.score || 0,
        all_results: result,
        model: modelName
      };
    } catch (error) {
      structuredLogger.error('Hugging Face sentiment analysis failed', {
        error: error.message,
        textLength: text.length
      });
      throw error;
    }
  }

  /**
   * Generate code using code-specific models
   */
  async generateCode(prompt, language = 'javascript', options = {}) {
    const modelName = 'codellama/CodeLlama-7b-Instruct-hf';
    
    // Format prompt for code generation
    const codePrompt = `Generate ${language} code for the following requirement:\n\n${prompt}\n\nCode:`;
    
    const result = await this.generateText(modelName, codePrompt, {
      maxTokens: options.maxTokens || 1024,
      temperature: options.temperature || 0.1,
      ...options
    });

    return {
      ...result,
      language,
      code: result.text
    };
  }

  /**
   * Analyze code quality and provide suggestions
   */
  async analyzeCode(code, language = 'javascript', options = {}) {
    const modelName = 'microsoft/CodeBERT-base';
    
    const analysisPrompt = `Analyze the following ${language} code and provide suggestions for improvement:\n\n${code}\n\nAnalysis:`;
    
    const result = await this.generateText(modelName, analysisPrompt, {
      maxTokens: options.maxTokens || 512,
      temperature: options.temperature || 0.2,
      ...options
    });

    return {
      ...result,
      language,
      analysis: result.text,
      original_code: code
    };
  }

  /**
   * Generate conversational responses
   */
  async generateConversation(message, context = '', options = {}) {
    const modelName = 'facebook/blenderbot-400M-distill';
    
    const conversationPrompt = context ? 
      `Context: ${context}\n\nUser: ${message}\n\nAssistant:` :
      message;
    
    const result = await this.generateText(modelName, conversationPrompt, {
      maxTokens: options.maxTokens || 256,
      temperature: options.temperature || 0.7,
      ...options
    });

    return {
      ...result,
      response: result.text,
      original_message: message,
      context
    };
  }

  /**
   * Get available models and their capabilities
   */
  getAvailableModels() {
    return Object.entries(this.models).map(([name, config]) => ({
      name,
      ...config
    }));
  }

  /**
   * Get models by capability
   */
  getModelsByCapability(capability) {
    return Object.entries(this.models)
      .filter(([name, config]) => config.capabilities.includes(capability))
      .map(([name, config]) => ({ name, ...config }));
  }

  /**
   * Health check for Hugging Face service
   */
  async healthCheck() {
    if (!this.isAvailable()) {
      return {
        status: 'unavailable',
        reason: 'API key not configured',
        models_available: 0
      };
    }

    try {
      // Test with a simple model
      const testModel = 'distilbert-base-uncased-finetuned-sst-2-english';
      const response = await fetch(`${this.baseUrl}/${testModel}`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          inputs: 'test',
          options: { wait_for_model: false }
        })
      });

      return {
        status: response.ok ? 'healthy' : 'degraded',
        models_available: Object.keys(this.models).length,
        api_accessible: response.ok,
        response_status: response.status
      };
    } catch (error) {
      return {
        status: 'error',
        reason: error.message,
        models_available: Object.keys(this.models).length
      };
    }
  }
}

module.exports = HuggingFaceInference;
