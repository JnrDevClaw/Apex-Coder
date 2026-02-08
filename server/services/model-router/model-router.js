/**
 * Model Router Service
 * 
 * Central orchestrator for routing AI requests to appropriate providers.
 * Implements role-based routing, direct model calling, and streaming support.
 * 
 * Requirements: 1.1, 1.2, 1.3, 3.1-3.9
 */

const providerRegistry = require('./provider-registry');
const config = require('../../config/model-router-config');
const { callWithRetry } = require('../../utils/retry-handler');
const { FallbackExhaustedError } = require('./errors');
const { InputValidator, apiKeyManager } = require('./security-utils');
const { performanceMonitor } = require('./performance-monitor');
// Queue functionality removed - not needed for automated pipeline
const EventEmitter = require('events');

class ModelRouter extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.registry = options.registry || providerRegistry;
    this.config = options.config || config;
    this.logger = options.logger || console;
    this.metricsCollector = options.metricsCollector || null;
    this.costTracker = options.costTracker || null;
    this.tokenTracker = options.tokenTracker || null;
    this.healthMonitor = options.healthMonitor || null;
    this.cacheManager = options.cacheManager || null;
    this.performanceMonitor = options.performanceMonitor || performanceMonitor;
    
    // Queue functionality removed - not needed for automated pipeline
    
    // Initialize API key manager
    apiKeyManager.initialize();
  }

  /**
   * Call an AI model by role
   * @param {string} role - Agent role (clarifier, normalizer, etc.)
   * @param {Array} messages - Chat messages
   * @param {Object} options - Call options
   * @param {string} options.projectId - Project ID for tracking
   * @param {string} options.userId - User ID for tracking
   * @param {number} options.temperature - Temperature parameter
   * @param {number} options.maxTokens - Maximum tokens to generate
   * @param {number} options.topP - Top-p sampling parameter
   * @param {boolean} options.useCache - Whether to use cache
   * @param {boolean} options.useFallback - Whether to use fallback on failure
   * @returns {Promise<ModelResponse>} Standardized response
   */
  async callByRole(role, messages, options = {}) {
    const startTime = Date.now();
    const correlationId = this.generateCorrelationId();

    try {
      // Validate inputs (Requirements: 19.1)
      const roleValidation = InputValidator.validateRole(role);
      if (!roleValidation.valid) {
        throw new Error(`Invalid role: ${roleValidation.errors.join(', ')}`);
      }

      const messagesValidation = InputValidator.validateMessages(messages);
      if (!messagesValidation.valid) {
        throw new Error(`Invalid messages: ${messagesValidation.errors.join(', ')}`);
      }

      const optionsValidation = InputValidator.validateOptions(options);
      if (!optionsValidation.valid) {
        throw new Error(`Invalid options: ${optionsValidation.errors.join(', ')}`);
      }

      // Validate request size (Requirements: 19.1)
      const sizeValidation = InputValidator.validateRequestSize({ role, messages, options });
      if (!sizeValidation.valid) {
        throw new Error(`Request too large: ${sizeValidation.errors.join(', ')}`);
      }

      // Log call start (with redacted sensitive data)
      const safeOptions = apiKeyManager.redactApiKeysFromObject(options);
      this.logger.info('AI call by role started', {
        correlationId,
        role,
        projectId: options.projectId,
        userId: options.userId,
        messageCount: messages.length,
        options: safeOptions
      });

      // Resolve model from role (gets primary and fallbacks)
      const { provider, model, fallbacks } = this.resolveRole(role);

      // Check cache if enabled
      if (options.useCache !== false && this.cacheManager) {
        const cacheKey = this.cacheManager.getCacheKey(messages, model);
        const cachedResponse = this.cacheManager.get(cacheKey);
        
        if (cachedResponse) {
          this.logger.info('Cache hit', { correlationId, role, model });
          
          // Track metrics for cached response
          if (this.metricsCollector) {
            this.metricsCollector.recordMetric({
              provider,
              model,
              role,
              projectId: options.projectId,
              latency: Date.now() - startTime,
              status: 'success',
              cached: true,
              correlationId
            });
          }

          return {
            ...cachedResponse,
            cached: true,
            correlationId
          };
        }
      }

      // Try primary provider first
      const attemptedProviders = [];
      let lastError = null;

      try {
        const response = await this.callProvider(
          provider,
          model,
          messages,
          {
            ...options,
            role,
            correlationId,
            startTime
          }
        );

        // Cache response if enabled
        if (options.useCache !== false && this.cacheManager) {
          const cacheKey = this.cacheManager.getCacheKey(messages, model);
          this.cacheManager.set(cacheKey, response);
        }

        return response;
      } catch (primaryError) {
        lastError = primaryError;
        attemptedProviders.push({ provider, model, error: primaryError.message });

        this.logger.warn('Primary provider failed', {
          correlationId,
          role,
          provider,
          model,
          error: primaryError.message,
          errorType: primaryError.name
        });

        // Check if error is retryable (connection/provider error, not model error)
        const isConnectionError = this.isConnectionError(primaryError);

        // Try fallbacks if available, enabled, and error is retryable
        if (options.useFallback !== false && fallbacks && fallbacks.length > 0 && isConnectionError) {
          this.logger.info('Attempting fallback providers', {
            correlationId,
            role,
            fallbackCount: fallbacks.length,
            reason: 'Connection or provider error detected'
          });

          // Try each fallback in order
          for (let i = 0; i < fallbacks.length; i++) {
            const fallback = fallbacks[i];
            
            this.logger.info('Trying fallback provider', {
              correlationId,
              role,
              fallbackIndex: i + 1,
              totalFallbacks: fallbacks.length,
              fallbackProvider: fallback.provider,
              fallbackModel: fallback.model
            });

            try {
              const fallbackResponse = await this.callProvider(
                fallback.provider,
                fallback.model,
                messages,
                {
                  ...options,
                  role,
                  correlationId,
                  startTime,
                  isFallback: true,
                  fallbackIndex: i + 1
                }
              );

              // Log successful fallback
              this.logger.info('Fallback provider succeeded', {
                correlationId,
                role,
                fallbackProvider: fallback.provider,
                fallbackModel: fallback.model,
                fallbackIndex: i + 1,
                attemptedProviders: attemptedProviders.map(a => a.provider)
              });

              return fallbackResponse;
            } catch (fallbackError) {
              lastError = fallbackError;
              attemptedProviders.push({ 
                provider: fallback.provider, 
                model: fallback.model, 
                error: fallbackError.message 
              });

              this.logger.warn('Fallback provider failed', {
                correlationId,
                role,
                fallbackProvider: fallback.provider,
                fallbackModel: fallback.model,
                fallbackIndex: i + 1,
                error: fallbackError.message
              });

              // If this is not a connection error, stop trying fallbacks
              if (!this.isConnectionError(fallbackError)) {
                this.logger.info('Stopping fallback attempts - non-connection error', {
                  correlationId,
                  role,
                  errorType: fallbackError.name
                });
                break;
              }
            }
          }

          // All fallbacks exhausted
          this.logger.error('All fallback providers exhausted', {
            correlationId,
            role,
            attemptedProviders: attemptedProviders.map(a => `${a.provider}/${a.model}`),
            detailedAttempts: attemptedProviders
          });

          // Throw structured error with all attempted providers
          const error = new FallbackExhaustedError(role, attemptedProviders);
          error.correlationId = correlationId;
          throw error;
        } else if (!isConnectionError) {
          // Model-specific error, don't try fallbacks
          this.logger.info('Not attempting fallbacks - model-specific error', {
            correlationId,
            role,
            errorType: primaryError.name
          });
        }

        // No fallback available or not a connection error, throw primary error
        throw primaryError;
      }
    } catch (error) {
      const latency = Date.now() - startTime;

      // Track failed metrics
      if (this.metricsCollector) {
        this.metricsCollector.recordMetric({
          role,
          projectId: options.projectId,
          latency,
          status: 'error',
          error: error.message,
          correlationId
        });
      }

      // Track cost for failed calls (if we have token info from partial response)
      if (this.costTracker && error.tokens) {
        this.costTracker.recordCall({
          provider: error.provider || 'unknown',
          model: error.model || 'unknown',
          role,
          projectId: options.projectId,
          userId: options.userId,
          tokens: error.tokens,
          cost: error.cost || 0,
          latency,
          status: 'error',
          timestamp: new Date()
        });
      }

      // Track tokens for failed calls
      if (this.tokenTracker && error.tokens) {
        this.tokenTracker.recordTokens({
          inputTokens: error.tokens.input || 0,
          outputTokens: error.tokens.output || 0,
          provider: error.provider || 'unknown',
          model: error.model || 'unknown',
          role,
          projectId: options.projectId,
          userId: options.userId,
          status: 'error',
          timestamp: new Date()
        });
      }

      // Track health for failed calls
      if (this.healthMonitor && error.provider) {
        this.healthMonitor.trackHealth(error.provider, {
          success: false,
          latency,
          timestamp: new Date(),
          error: error.message
        });
      }

      this.logger.error('AI call by role failed', {
        correlationId,
        role,
        error: error.message,
        attemptedProviders: error.attemptedProviders,
        stack: error.stack
      });

      throw error;
    }
  }

  /**
   * Call a specific model directly
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   * @param {Array} messages - Chat messages
   * @param {Object} options - Call options
   * @returns {Promise<ModelResponse>} Standardized response
   */
  async call(provider, model, messages, options = {}) {
    const startTime = Date.now();
    const correlationId = options.correlationId || this.generateCorrelationId();

    try {
      // Validate inputs (Requirements: 19.1)
      const providerValidation = InputValidator.validateProvider(provider);
      if (!providerValidation.valid) {
        throw new Error(`Invalid provider: ${providerValidation.errors.join(', ')}`);
      }

      const modelValidation = InputValidator.validateModel(model);
      if (!modelValidation.valid) {
        throw new Error(`Invalid model: ${modelValidation.errors.join(', ')}`);
      }

      const messagesValidation = InputValidator.validateMessages(messages);
      if (!messagesValidation.valid) {
        throw new Error(`Invalid messages: ${messagesValidation.errors.join(', ')}`);
      }

      const optionsValidation = InputValidator.validateOptions(options);
      if (!optionsValidation.valid) {
        throw new Error(`Invalid options: ${optionsValidation.errors.join(', ')}`);
      }

      // Validate request size (Requirements: 19.1)
      const sizeValidation = InputValidator.validateRequestSize({ provider, model, messages, options });
      if (!sizeValidation.valid) {
        throw new Error(`Request too large: ${sizeValidation.errors.join(', ')}`);
      }

      // Log call start (with redacted sensitive data)
      const safeOptions = apiKeyManager.redactApiKeysFromObject(options);
      this.logger.info('Direct AI call started', {
        correlationId,
        provider,
        model,
        projectId: options.projectId,
        messageCount: messages.length,
        options: safeOptions
      });

      const response = await this.callProvider(
        provider,
        model,
        messages,
        {
          ...options,
          correlationId,
          startTime
        }
      );

      return response;
    } catch (error) {
      const latency = Date.now() - startTime;

      // Track failed metrics
      if (this.metricsCollector) {
        this.metricsCollector.recordMetric({
          provider,
          model,
          projectId: options.projectId,
          latency,
          status: 'error',
          error: error.message,
          correlationId
        });
      }

      // Track cost for failed calls (if we have token info from partial response)
      if (this.costTracker && error.tokens) {
        this.costTracker.recordCall({
          provider,
          model,
          role: options.role,
          projectId: options.projectId,
          userId: options.userId,
          tokens: error.tokens,
          cost: error.cost || 0,
          latency,
          status: 'error',
          timestamp: new Date()
        });
      }

      // Track tokens for failed calls
      if (this.tokenTracker && error.tokens) {
        this.tokenTracker.recordTokens({
          inputTokens: error.tokens.input || 0,
          outputTokens: error.tokens.output || 0,
          provider,
          model,
          role: options.role,
          projectId: options.projectId,
          userId: options.userId,
          status: 'error',
          timestamp: new Date()
        });
      }

      // Track health for failed calls
      if (this.healthMonitor) {
        this.healthMonitor.trackHealth(provider, {
          success: false,
          latency,
          timestamp: new Date(),
          error: error.message
        });
      }

      this.logger.error('Direct AI call failed', {
        correlationId,
        provider,
        model,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Stream responses from a model
   * @param {string} role - Agent role
   * @param {Array} messages - Chat messages
   * @param {Object} options - Call options
   * @returns {AsyncIterator<ModelChunk>} Stream of response chunks
   */
  async *stream(role, messages, options = {}) {
    const startTime = Date.now();
    const correlationId = this.generateCorrelationId();

    try {
      this.logger.info('AI streaming call started', {
        correlationId,
        role,
        projectId: options.projectId,
        messageCount: messages.length
      });

      // Resolve model from role
      const { provider, model } = this.resolveRole(role);

      // Get provider instance
      const providerInstance = this.registry.getProvider(provider);

      // Check if provider supports streaming
      if (typeof providerInstance.stream !== 'function') {
        throw new Error(`Provider ${provider} does not support streaming`);
      }

      // Apply rate limiting
      await providerInstance.rateLimiter.schedule(() => Promise.resolve());

      // Track streaming metrics
      let totalTokens = { input: 0, output: 0, total: 0 };
      let chunkCount = 0;

      try {
        // Stream from provider
        for await (const chunk of providerInstance.stream(model, messages, options)) {
          chunkCount++;
          
          // Update token counts
          if (chunk.tokens) {
            totalTokens.input = chunk.tokens.input || totalTokens.input;
            totalTokens.output = (chunk.tokens.output || 0);
            totalTokens.total = totalTokens.input + totalTokens.output;
          }

          // Yield chunk with metadata
          yield {
            ...chunk,
            provider,
            model,
            role,
            correlationId,
            chunkIndex: chunkCount
          };
        }

        // Calculate final cost
        const cost = providerInstance.calculateCost(
          totalTokens.input,
          totalTokens.output,
          model
        );

        const latency = Date.now() - startTime;

        // Track final metrics
        if (this.metricsCollector) {
          this.metricsCollector.recordMetric({
            provider,
            model,
            role,
            projectId: options.projectId,
            tokens: totalTokens,
            cost,
            latency,
            status: 'success',
            streaming: true,
            chunkCount,
            correlationId
          });
        }

        // Track cost
        if (this.costTracker) {
          this.costTracker.recordCall({
            provider,
            model,
            role,
            projectId: options.projectId,
            userId: options.userId,
            tokens: totalTokens,
            cost,
            latency,
            status: 'success',
            timestamp: new Date()
          });
        }

        // Track tokens
        if (this.tokenTracker) {
          this.tokenTracker.recordTokens({
            inputTokens: totalTokens.input,
            outputTokens: totalTokens.output,
            provider,
            model,
            role,
            projectId: options.projectId,
            userId: options.userId,
            status: 'success',
            timestamp: new Date()
          });
        }

        // Yield final metadata
        yield {
          done: true,
          metadata: {
            provider,
            model,
            role,
            tokens: totalTokens,
            cost,
            latency,
            chunkCount,
            correlationId
          }
        };

        this.logger.info('AI streaming call completed', {
          correlationId,
          role,
          provider,
          model,
          tokens: totalTokens,
          cost,
          latency,
          chunkCount
        });
      } catch (streamError) {
        this.logger.error('Streaming error', {
          correlationId,
          role,
          provider,
          model,
          error: streamError.message,
          chunkCount
        });

        // Track failed metrics
        if (this.metricsCollector) {
          this.metricsCollector.recordMetric({
            provider,
            model,
            role,
            projectId: options.projectId,
            latency: Date.now() - startTime,
            status: 'error',
            streaming: true,
            error: streamError.message,
            correlationId
          });
        }

        throw streamError;
      }
    } catch (error) {
      this.logger.error('AI streaming call failed', {
        correlationId,
        role,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Get provider health status
   * @returns {Object} Health status per provider
   */
  getProviderHealth() {
    if (!this.healthMonitor) {
      return { error: 'Health monitoring not enabled' };
    }

    const providers = this.registry.listProviders();
    const health = {};

    for (const provider of providers) {
      health[provider] = this.healthMonitor.getProviderHealth(provider);
    }

    return health;
  }

  /**
   * Get cost and token metrics
   * @param {Object} filters - Filter by provider, project, role
   * @returns {Object} Cost and token metrics
   */
  getMetrics(filters = {}) {
    const metrics = {};

    if (this.metricsCollector) {
      metrics.performance = this.metricsCollector.getMetrics(filters);
    }

    if (this.costTracker) {
      metrics.costs = this.costTracker.getCosts(filters);
    }

    if (this.tokenTracker) {
      metrics.tokens = this.tokenTracker.getTokens(filters);
    }

    if (this.healthMonitor) {
      metrics.health = this.getProviderHealth();
    }

    // Add performance monitoring metrics (Requirements: 20.5)
    if (this.performanceMonitor) {
      metrics.latency = this.performanceMonitor.getMetrics(filters.provider);
    }

    return metrics;
  }

  /**
   * Get performance summary with p50, p95, p99 latencies
   * Requirements: 20.5
   * @returns {Object} Performance summary
   */
  getPerformanceSummary() {
    if (!this.performanceMonitor) {
      return { error: 'Performance monitoring not enabled' };
    }

    return this.performanceMonitor.getSummary();
  }

  /**
   * Check latency health
   * Requirements: 20.5
   * @param {string} provider - Provider name (optional)
   * @param {number} threshold - Latency threshold in ms
   * @returns {Object} Health check result
   */
  checkLatencyHealth(provider = null, threshold = 5000) {
    if (!this.performanceMonitor) {
      return { error: 'Performance monitoring not enabled' };
    }

    return this.performanceMonitor.checkLatencyHealth(provider, threshold);
  }

  /**
   * Internal method to call a provider with middleware pipeline
   * @private
   */
  async callProvider(provider, model, messages, options = {}) {
    const { correlationId, startTime, role, isFallback = false, fallbackIndex = 0 } = options;

    // Get provider instance
    const providerInstance = this.registry.getProvider(provider);

    // Check provider health if monitor is available
    if (this.healthMonitor && !isFallback) {
      const health = this.healthMonitor.getProviderHealth(provider);
      if (health && health.status === 'unhealthy') {
        this.logger.warn('Provider is unhealthy, attempting to use fallback', {
          correlationId,
          provider,
          health
        });
        
        // If we have a role, try to use fallback
        if (role) {
          const roleMapping = this.config.getRoleMapping(role);
          if (roleMapping && roleMapping.fallback) {
            const fallbackProvider = roleMapping.fallback.provider;
            const fallbackModel = roleMapping.fallback.model;
            
            // Check if fallback is different from primary
            if (fallbackProvider !== provider) {
              this.logger.info('Using fallback provider due to unhealthy primary', {
                correlationId,
                role,
                primaryProvider: provider,
                fallbackProvider,
                fallbackModel
              });
              
              // Recursively call with fallback provider
              return await this.callProvider(
                fallbackProvider,
                fallbackModel,
                messages,
                {
                  ...options,
                  isFallback: true
                }
              );
            }
          }
        }
        
        // No fallback available or fallback is same as primary, continue with warning
        this.logger.warn('No fallback available, continuing with unhealthy provider', {
          correlationId,
          provider
        });
      }
    }

    // Apply rate limiting
    const callFn = async () => {
      return await providerInstance.rateLimiter.schedule(async () => {
        // Make the actual provider call
        const response = await providerInstance.call(model, messages, options);

        // Ensure response has required fields
        if (!response.content) {
          throw new Error('Provider response missing content field');
        }

        return response;
      });
    };

    let response;
    let latency;

    try {
      // Apply retry logic
      response = await callWithRetry(callFn, {
        maxRetries: providerInstance.retries || 2,
        isRetryable: (error) => providerInstance.isRetryableError(error),
        logger: this.logger,
        onRetry: (attempt, error) => {
          this.logger.warn('Retrying provider call', {
            correlationId,
            provider,
            model,
            attempt,
            error: error.message
          });
        }
      });

      latency = Date.now() - startTime;
    } catch (error) {
      latency = Date.now() - startTime;

      // Track health for failed calls
      if (this.healthMonitor) {
        this.healthMonitor.trackHealth(provider, {
          success: false,
          latency,
          timestamp: new Date(),
          error: error.message
        });
      }

      // Track performance for failed calls (Requirements: 20.5)
      if (this.performanceMonitor) {
        this.performanceMonitor.recordRequest({
          provider,
          latency,
          status: 'error'
        });
      }

      // Add provider info to error for upstream tracking
      error.provider = provider;
      error.model = model;
      error.latency = latency;

      throw error;
    }

    // Calculate cost
    const cost = providerInstance.calculateCost(
      response.tokens?.input || 0,
      response.tokens?.output || 0,
      model
    );

    // Build standardized response
    const standardizedResponse = {
      content: response.content,
      tokens: response.tokens || { input: 0, output: 0, total: 0 },
      cost,
      provider,
      model,
      latency,
      cached: false,
      correlationId,
      metadata: response.metadata || {}
    };

    // Add role if provided
    if (role) {
      standardizedResponse.role = role;
    }

    // Track metrics
    if (this.metricsCollector) {
      this.metricsCollector.recordMetric({
        provider,
        model,
        role,
        projectId: options.projectId,
        tokens: standardizedResponse.tokens,
        cost,
        latency,
        status: 'success',
        cached: false,
        isFallback,
        correlationId
      });
    }

    // Track performance metrics (Requirements: 20.5)
    if (this.performanceMonitor) {
      this.performanceMonitor.recordRequest({
        provider,
        latency,
        status: 'success',
        tokens: standardizedResponse.tokens,
        cost
      });
    }

    // Track cost
    if (this.costTracker) {
      this.costTracker.recordCall({
        provider,
        model,
        role,
        projectId: options.projectId,
        userId: options.userId,
        tokens: standardizedResponse.tokens,
        cost,
        latency,
        status: 'success',
        timestamp: new Date()
      });
    }

    // Track tokens
    if (this.tokenTracker) {
      this.tokenTracker.recordTokens({
        inputTokens: standardizedResponse.tokens.input,
        outputTokens: standardizedResponse.tokens.output,
        provider,
        model,
        role,
        projectId: options.projectId,
        userId: options.userId,
        status: 'success',
        timestamp: new Date()
      });
    }

    // Update health monitor
    if (this.healthMonitor) {
      this.healthMonitor.trackHealth(provider, {
        success: true,
        latency,
        timestamp: new Date()
      });
    }

    // Log fallback event if this was a fallback call
    if (isFallback) {
      this.logger.info('Fallback provider call succeeded', {
        correlationId,
        provider,
        model,
        role,
        fallbackIndex,
        tokens: standardizedResponse.tokens,
        cost,
        latency
      });
    } else {
      this.logger.info('AI call completed', {
        correlationId,
        provider,
        model,
        role,
        tokens: standardizedResponse.tokens,
        cost,
        latency
      });
    }

    return standardizedResponse;
  }

  /**
   * Resolve model from role using config
   * @private
   */
  resolveRole(role) {
    const roleMapping = this.config.getRoleMapping(role);

    if (!roleMapping) {
      throw new Error(`No model mapping found for role: ${role}`);
    }

    if (!roleMapping.primary) {
      throw new Error(`Role ${role} has no primary provider mapping`);
    }

    const result = {
      provider: roleMapping.primary.provider,
      model: roleMapping.primary.model
    };

    // Add fallbacks array if available
    if (roleMapping.fallbacks && Array.isArray(roleMapping.fallbacks)) {
      result.fallbacks = roleMapping.fallbacks;
    } else if (roleMapping.fallback) {
      // Support legacy single fallback format
      result.fallbacks = [roleMapping.fallback];
    } else {
      result.fallbacks = [];
    }

    return result;
  }

  /**
   * Check if error is a connection/provider error (retryable with fallback)
   * vs a model-specific error (not retryable with fallback)
   * @private
   */
  isConnectionError(error) {
    // Connection errors that should trigger fallback
    const connectionErrorCodes = [
      'ETIMEDOUT',
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNREFUSED',
      'ENETUNREACH',
      'EAI_AGAIN'
    ];

    // HTTP status codes that indicate provider/connection issues
    const retryableStatusCodes = [
      429, // Rate limit (provider issue)
      500, // Internal server error (provider issue)
      502, // Bad gateway (connection issue)
      503, // Service unavailable (provider issue)
      504  // Gateway timeout (connection issue)
    ];

    // Check error code
    if (error.code && connectionErrorCodes.includes(error.code)) {
      return true;
    }

    // Check HTTP status code
    if (error.statusCode && retryableStatusCodes.includes(error.statusCode)) {
      return true;
    }

    // Check error name/type
    if (error.name === 'ProviderUnavailableError' || 
        error.name === 'RateLimitError' ||
        error.name === 'TimeoutError') {
      return true;
    }

    // Non-retryable errors (model-specific issues)
    const nonRetryableStatusCodes = [
      400, // Bad request (input issue)
      401, // Unauthorized (auth issue, not connection)
      403, // Forbidden (auth issue, not connection)
      404, // Not found (model/endpoint issue)
      422  // Unprocessable entity (input issue)
    ];

    if (error.statusCode && nonRetryableStatusCodes.includes(error.statusCode)) {
      return false;
    }

    // Default to not retrying for unknown errors
    return false;
  }

  /**
   * Generate a unique correlation ID
   * @private
   */
  generateCorrelationId() {
    return `mr_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  // Queue functionality removed - not needed for automated pipeline
}

module.exports = ModelRouter;
