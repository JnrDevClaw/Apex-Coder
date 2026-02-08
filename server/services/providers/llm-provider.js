/**
 * Base LLM Provider interface
 * All LLM providers must implement this interface
 */
class LLMProvider {
    constructor(config) {
        this.name = config.name;
        this.capabilities = config.capabilities || [];
        this.costPerToken = config.costPerToken || 0.001;
        this.maxTokens = config.maxTokens || 4096;
        this.latency = config.latency || 200; // ms
        this.reliability = config.reliability || 0.99;
        this.config = config;
    }

    /**
     * Make a call to the LLM provider
     * @param {string} prompt - The prompt to send
     * @param {Object} context - Additional context for the call
     * @returns {Promise<LLMResponse>}
     */
    async call(prompt, context = {}) {
        throw new Error('LLMProvider.call() must be implemented by subclass');
    }

    /**
     * Check if provider supports a specific agent role
     * @param {string} role - Agent role to check
     * @returns {boolean}
     */
    supportsRole(role) {
        return this.capabilities.includes(role);
    }

    /**
     * Get provider health status
     * @returns {Promise<boolean>}
     */
    async healthCheck() {
        try {
            const response = await this.call('test', { timeout: 5000 });
            return response && response.success;
        } catch (error) {
            return false;
        }
    }
}

/**
 * LLM Response structure
 */
class LLMResponse {
    constructor(data) {
        this.success = data.success || false;
        this.content = data.content || '';
        this.tokens = data.tokens || 0;
        this.cost = data.cost || 0;
        this.latency = data.latency || 0;
        this.provider = data.provider || '';
        this.model = data.model || '';
        this.error = data.error || null;
        this.metadata = data.metadata || {};
    }
}

module.exports = { LLMProvider, LLMResponse };
