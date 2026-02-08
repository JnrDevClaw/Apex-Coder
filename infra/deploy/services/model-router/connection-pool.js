/**
 * Connection Pool Manager
 * 
 * Manages HTTP/HTTPS connection pooling for AI provider requests.
 * Implements keep-alive connections and socket reuse for improved performance.
 * 
 * Requirements: 20.1, 20.2
 */

const http = require('http');
const https = require('https');

/**
 * Connection pool configuration per provider
 */
const DEFAULT_POOL_CONFIG = {
  keepAlive: true,
  keepAliveMsecs: 30000, // 30 seconds
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000, // 60 seconds
  freeSocketTimeout: 30000 // 30 seconds
};

/**
 * Provider-specific pool configurations
 * Can be customized based on provider rate limits and requirements
 */
const PROVIDER_POOL_CONFIGS = {
  huggingface: {
    maxSockets: 20,
    maxFreeSockets: 5
  },
  zukijourney: {
    maxSockets: 30,
    maxFreeSockets: 8
  },
  'github-models': {
    maxSockets: 15,
    maxFreeSockets: 5
  },
  deepseek: {
    maxSockets: 25,
    maxFreeSockets: 7
  },
  anthropic: {
    maxSockets: 20,
    maxFreeSockets: 5
  },
  gemini: {
    maxSockets: 30,
    maxFreeSockets: 8
  },
  openrouter: {
    maxSockets: 25,
    maxFreeSockets: 7
  },
  scaleway: {
    maxSockets: 20,
    maxFreeSockets: 5
  },
  mistral: {
    maxSockets: 20,
    maxFreeSockets: 5
  }
};

class ConnectionPoolManager {
  constructor() {
    this.httpAgents = new Map();
    this.httpsAgents = new Map();
    this.stats = new Map();
  }

  /**
   * Get or create HTTP agent for a provider
   * @param {string} provider - Provider name
   * @param {boolean} useHttps - Whether to use HTTPS (default: true)
   * @returns {http.Agent|https.Agent} HTTP/HTTPS agent
   */
  getAgent(provider, useHttps = true) {
    const agentMap = useHttps ? this.httpsAgents : this.httpAgents;
    
    if (!agentMap.has(provider)) {
      const agent = this.createAgent(provider, useHttps);
      agentMap.set(provider, agent);
      
      // Initialize stats
      this.stats.set(provider, {
        totalRequests: 0,
        activeConnections: 0,
        reuseCount: 0,
        createdAt: new Date()
      });
    }

    return agentMap.get(provider);
  }

  /**
   * Create a new HTTP/HTTPS agent with connection pooling
   * @param {string} provider - Provider name
   * @param {boolean} useHttps - Whether to use HTTPS
   * @returns {http.Agent|https.Agent} Configured agent
   */
  createAgent(provider, useHttps = true) {
    const providerConfig = PROVIDER_POOL_CONFIGS[provider] || {};
    const config = {
      ...DEFAULT_POOL_CONFIG,
      ...providerConfig
    };

    const AgentClass = useHttps ? https.Agent : http.Agent;
    const agent = new AgentClass(config);

    // Track connection reuse
    this.setupAgentMonitoring(provider, agent);

    return agent;
  }

  /**
   * Setup monitoring for agent connections
   * @param {string} provider - Provider name
   * @param {http.Agent|https.Agent} agent - Agent to monitor
   */
  setupAgentMonitoring(provider, agent) {
    // Track socket creation
    const originalCreateConnection = agent.createConnection;
    agent.createConnection = (...args) => {
      const stats = this.stats.get(provider);
      if (stats) {
        stats.totalRequests++;
        stats.activeConnections++;
      }
      
      const socket = originalCreateConnection.apply(agent, args);
      
      // Track socket close
      socket.on('close', () => {
        const stats = this.stats.get(provider);
        if (stats && stats.activeConnections > 0) {
          stats.activeConnections--;
        }
      });

      // Track socket reuse
      if (socket.reused) {
        const stats = this.stats.get(provider);
        if (stats) {
          stats.reuseCount++;
        }
      }

      return socket;
    };
  }

  /**
   * Get connection pool statistics
   * @param {string} provider - Provider name (optional)
   * @returns {Object} Pool statistics
   */
  getStats(provider = null) {
    if (provider) {
      return this.stats.get(provider) || null;
    }

    const allStats = {};
    for (const [prov, stats] of this.stats.entries()) {
      allStats[prov] = {
        ...stats,
        reuseRate: stats.totalRequests > 0 
          ? (stats.reuseCount / stats.totalRequests * 100).toFixed(2) + '%'
          : '0%'
      };
    }

    return allStats;
  }

  /**
   * Get current socket usage for a provider
   * @param {string} provider - Provider name
   * @returns {Object} Socket usage information
   */
  getSocketUsage(provider) {
    const httpsAgent = this.httpsAgents.get(provider);
    const httpAgent = this.httpAgents.get(provider);

    const usage = {
      https: this.getAgentSocketInfo(httpsAgent),
      http: this.getAgentSocketInfo(httpAgent)
    };

    return usage;
  }

  /**
   * Get socket information from an agent
   * @param {http.Agent|https.Agent} agent - Agent to inspect
   * @returns {Object} Socket information
   */
  getAgentSocketInfo(agent) {
    if (!agent) {
      return { active: 0, free: 0, pending: 0 };
    }

    const sockets = agent.sockets || {};
    const freeSockets = agent.freeSockets || {};
    const requests = agent.requests || {};

    let activeCount = 0;
    let freeCount = 0;
    let pendingCount = 0;

    // Count active sockets
    for (const key in sockets) {
      activeCount += sockets[key].length;
    }

    // Count free sockets
    for (const key in freeSockets) {
      freeCount += freeSockets[key].length;
    }

    // Count pending requests
    for (const key in requests) {
      pendingCount += requests[key].length;
    }

    return {
      active: activeCount,
      free: freeCount,
      pending: pendingCount,
      maxSockets: agent.maxSockets,
      maxFreeSockets: agent.maxFreeSockets
    };
  }

  /**
   * Destroy all agents and close connections
   * Useful for cleanup and testing
   */
  destroyAll() {
    // Destroy HTTPS agents
    for (const [provider, agent] of this.httpsAgents.entries()) {
      agent.destroy();
      this.httpsAgents.delete(provider);
    }

    // Destroy HTTP agents
    for (const [provider, agent] of this.httpAgents.entries()) {
      agent.destroy();
      this.httpAgents.delete(provider);
    }

    // Clear stats
    this.stats.clear();
  }

  /**
   * Destroy agent for a specific provider
   * @param {string} provider - Provider name
   */
  destroyProvider(provider) {
    const httpsAgent = this.httpsAgents.get(provider);
    if (httpsAgent) {
      httpsAgent.destroy();
      this.httpsAgents.delete(provider);
    }

    const httpAgent = this.httpAgents.get(provider);
    if (httpAgent) {
      httpAgent.destroy();
      this.httpAgents.delete(provider);
    }

    this.stats.delete(provider);
  }

  /**
   * Update configuration for a provider
   * @param {string} provider - Provider name
   * @param {Object} config - New configuration
   */
  updateProviderConfig(provider, config) {
    // Destroy existing agents
    this.destroyProvider(provider);

    // Update configuration
    PROVIDER_POOL_CONFIGS[provider] = {
      ...PROVIDER_POOL_CONFIGS[provider],
      ...config
    };

    // New agents will be created on next request
  }
}

// Singleton instance
const connectionPoolManager = new ConnectionPoolManager();

module.exports = {
  ConnectionPoolManager,
  connectionPoolManager,
  DEFAULT_POOL_CONFIG,
  PROVIDER_POOL_CONFIGS
};
