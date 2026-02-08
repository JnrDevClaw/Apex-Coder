/**
 * Agent Role Assignment System
 * Defines 8 specialized AI agents with specific model assignments and routing logic
 */

/**
 * Agent role definitions with detailed characteristics
 */
const AGENT_ROLES = {
  INTERVIEWER: {
    name: 'interviewer',
    description: 'Pre-questionnaire agent for spec collection',
    preferredModels: ['mistral', 'vicuna', 'anthropic'],
    complexity: 'low',
    requirements: ['chat', 'low-latency', 'conversational'],
    weight: 1.0,
    fallbackChain: ['anthropic', 'openrouter', 'huggingface'],
    taskTypes: ['questionnaire', 'clarification', 'user-interaction'],
    maxTokens: 2048,
    temperature: 0.8
  },
  
  PLANNER: {
    name: 'planner',
    description: 'Architect that decomposes specs into tasks',
    preferredModels: ['deepseek-r1', 'claude-3-sonnet', 'llama-3-8b'],
    complexity: 'high',
    requirements: ['reasoning', 'planning', 'structured-thinking'],
    weight: 1.2,
    fallbackChain: ['deepseek', 'anthropic', 'openrouter'],
    taskTypes: ['decomposition', 'architecture', 'planning'],
    maxTokens: 8192,
    temperature: 0.3
  },
  
  SCHEMA_DESIGNER: {
    name: 'schema-designer',
    description: 'Designs APIs and database schemas',
    preferredModels: ['deepseek-v3', 'claude-3-sonnet', 'mistral'],
    complexity: 'medium',
    requirements: ['structured-output', 'technical', 'data-modeling'],
    weight: 1.1,
    fallbackChain: ['deepseek', 'anthropic', 'openrouter'],
    taskTypes: ['schema-design', 'api-design', 'data-modeling'],
    maxTokens: 6144,
    temperature: 0.2
  },
  
  CODER: {
    name: 'coder',
    description: 'Generates frontend/backend/infrastructure code',
    preferredModels: ['starcoder2', 'codegen-16b', 'deepseek-coder'],
    complexity: 'high',
    requirements: ['code-generation', 'multi-language', 'best-practices'],
    weight: 1.3,
    fallbackChain: ['deepseek', 'huggingface', 'openrouter'],
    taskTypes: ['code-generation', 'implementation', 'refactoring'],
    maxTokens: 8192,
    temperature: 0.1
  },
  
  TESTER: {
    name: 'tester',
    description: 'Generates and runs tests',
    preferredModels: ['gpt-j', 'codegen-16b', 'deepseek-coder'],
    complexity: 'medium',
    requirements: ['code-generation', 'testing', 'quality-assurance'],
    weight: 1.0,
    fallbackChain: ['huggingface', 'deepseek', 'openrouter'],
    taskTypes: ['test-generation', 'test-execution', 'quality-checks'],
    maxTokens: 4096,
    temperature: 0.2
  },
  
  DEBUGGER: {
    name: 'debugger',
    description: 'Analyzes failures and generates patches',
    preferredModels: ['deepseek-r1', 'claude-3-opus', 'carper-ai-diff'],
    complexity: 'high',
    requirements: ['reasoning', 'debugging', 'patch-generation', 'analysis'],
    weight: 1.4,
    fallbackChain: ['deepseek', 'anthropic', 'openrouter'],
    taskTypes: ['debugging', 'error-analysis', 'patch-generation'],
    maxTokens: 8192,
    temperature: 0.1
  },
  
  REVIEWER: {
    name: 'reviewer',
    description: 'Code quality and security review',
    preferredModels: ['claude-3-haiku', 'mistral', 'glm-4.1v'],
    complexity: 'medium',
    requirements: ['analysis', 'security', 'best-practices', 'quality'],
    weight: 1.0,
    fallbackChain: ['anthropic', 'openrouter', 'huggingface'],
    taskTypes: ['code-review', 'security-analysis', 'quality-assessment'],
    maxTokens: 6144,
    temperature: 0.3
  },
  
  DEPLOYER: {
    name: 'deployer',
    description: 'Creates deployment configurations',
    preferredModels: ['deepseek-v3', 'claude-3-sonnet', 'mistral'],
    complexity: 'medium',
    requirements: ['infrastructure', 'deployment', 'devops', 'configuration'],
    weight: 1.1,
    fallbackChain: ['deepseek', 'anthropic', 'openrouter'],
    taskTypes: ['deployment', 'infrastructure', 'configuration'],
    maxTokens: 6144,
    temperature: 0.2
  }
};

/**
 * Task complexity levels and their characteristics
 */
const COMPLEXITY_LEVELS = {
  LOW: {
    name: 'low',
    description: 'Simple tasks requiring basic responses',
    tokenMultiplier: 0.5,
    timeoutMs: 30000,
    retryAttempts: 2
  },
  MEDIUM: {
    name: 'medium',
    description: 'Moderate complexity requiring structured thinking',
    tokenMultiplier: 1.0,
    timeoutMs: 60000,
    retryAttempts: 3
  },
  HIGH: {
    name: 'high',
    description: 'Complex tasks requiring deep reasoning',
    tokenMultiplier: 1.5,
    timeoutMs: 120000,
    retryAttempts: 4
  }
};

/**
 * Agent Role Assignment System
 */
class AgentRoleAssigner {
  constructor(modelRouter) {
    this.modelRouter = modelRouter;
    this.assignmentHistory = new Map();
    this.performanceMetrics = new Map();
    this.loadBalancing = new Map();
    
    // Initialize performance tracking for each role
    Object.keys(AGENT_ROLES).forEach(role => {
      this.performanceMetrics.set(role, {
        totalAssignments: 0,
        successfulAssignments: 0,
        averageLatency: 0,
        averageCost: 0,
        lastAssignment: null
      });
      
      this.loadBalancing.set(role, {
        currentLoad: 0,
        maxConcurrent: this.getMaxConcurrentForRole(role)
      });
    });
  }

  /**
   * Assign a task to the optimal agent and model
   * @param {Object} task - Task to assign
   * @returns {Promise<Object>}
   */
  async assignTask(task) {
    const { type, complexity = 'medium', priority = 'normal', context = {} } = task;
    
    // Determine the best agent role for this task
    const agentRole = this.selectAgentRole(type, complexity, context);
    if (!agentRole) {
      throw new Error(`No suitable agent role found for task type: ${type}`);
    }
    
    // Get optimal model for this agent role
    const modelAssignment = await this.getOptimalModelAssignment(agentRole, complexity, context);
    
    // Track assignment
    const assignmentId = this.trackAssignment(agentRole.name, modelAssignment);
    
    return {
      agentRole: agentRole,
      modelAssignment: modelAssignment,
      taskConfig: this.getTaskConfig(agentRole, complexity),
      assignmentId: assignmentId || this.generateAssignmentId()
    };
  }

  /**
   * Select the best agent role for a task
   * @param {string} taskType - Type of task
   * @param {string} complexity - Task complexity
   * @param {Object} context - Additional context
   * @returns {Object|null}
   */
  selectAgentRole(taskType, complexity, context) {
    const candidates = [];
    
    // Find roles that can handle this task type
    Object.values(AGENT_ROLES).forEach(role => {
      if (role.taskTypes.includes(taskType)) {
        const score = this.calculateRoleScore(role, complexity, context);
        candidates.push({ role, score });
      }
    });
    
    if (candidates.length === 0) {
      // Fallback: find roles with similar task types
      Object.values(AGENT_ROLES).forEach(role => {
        const similarity = this.calculateTaskTypeSimilarity(taskType, role.taskTypes);
        if (similarity > 0.3) {
          const score = this.calculateRoleScore(role, complexity, context) * similarity;
          candidates.push({ role, score });
        }
      });
    }
    
    if (candidates.length === 0) return null;
    
    // Sort by score and return the best candidate
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].role;
  }

  /**
   * Calculate role suitability score
   * @param {Object} role - Agent role
   * @param {string} complexity - Task complexity
   * @param {Object} context - Task context
   * @returns {number}
   */
  calculateRoleScore(role, complexity, context) {
    let score = role.weight;
    
    // Complexity matching
    const complexityLevel = COMPLEXITY_LEVELS[complexity.toUpperCase()];
    if (complexityLevel) {
      if (role.complexity === complexity) {
        score += 0.3;
      } else if (role.complexity === 'high' && complexity === 'medium') {
        score += 0.1; // High-capability roles can handle medium tasks
      }
    }
    
    // Performance history
    const metrics = this.performanceMetrics.get(role.name);
    if (metrics && metrics.totalAssignments > 0) {
      const successRate = metrics.successfulAssignments / metrics.totalAssignments;
      score += successRate * 0.2;
      
      // Prefer roles with lower average latency
      if (metrics.averageLatency < 1000) score += 0.1;
    }
    
    // Load balancing
    const load = this.loadBalancing.get(role.name);
    if (load && load.currentLoad < load.maxConcurrent) {
      score += 0.1;
    } else if (load && load.currentLoad >= load.maxConcurrent) {
      score -= 0.5; // Heavily penalize overloaded roles
    }
    
    // Context-specific adjustments
    if (context.requiresReasoning && role.requirements.includes('reasoning')) {
      score += 0.2;
    }
    if (context.requiresSpeed && role.requirements.includes('low-latency')) {
      score += 0.2;
    }
    if (context.requiresSecurity && role.requirements.includes('security')) {
      score += 0.2;
    }
    
    return Math.max(0, Math.min(2.0, score)); // Clamp between 0 and 2
  }

  /**
   * Get optimal model assignment for an agent role
   * @param {Object} agentRole - Selected agent role
   * @param {string} complexity - Task complexity
   * @param {Object} context - Task context
   * @returns {Promise<Object>}
   */
  async getOptimalModelAssignment(agentRole, complexity, context) {
    const weightedProviders = this.modelRouter.getWeightedRouting(agentRole.name);
    
    if (weightedProviders.length === 0) {
      throw new Error(`No providers available for agent role: ${agentRole.name}`);
    }
    
    // Filter by preferred models if available
    let candidates = weightedProviders.filter(({ provider }) => {
      return agentRole.preferredModels.some(preferred => 
        provider.name.toLowerCase().includes(preferred.toLowerCase())
      );
    });
    
    // Fallback to all available providers if no preferred ones are available
    if (candidates.length === 0) {
      candidates = weightedProviders;
    }
    
    // Select based on current load and performance
    const selectedProvider = await this.selectProviderWithLoadBalancing(candidates, agentRole);
    
    return {
      provider: selectedProvider.provider,
      weight: selectedProvider.weight,
      fallbackChain: this.buildFallbackChain(agentRole, selectedProvider.provider.name),
      config: this.getProviderConfig(selectedProvider.provider, agentRole, complexity)
    };
  }

  /**
   * Select provider considering load balancing
   * @param {Array} candidates - Candidate providers
   * @param {Object} agentRole - Agent role
   * @returns {Promise<Object>}
   */
  async selectProviderWithLoadBalancing(candidates, agentRole) {
    // Check health of top candidates
    const healthyProviders = [];
    
    for (const candidate of candidates.slice(0, 3)) { // Check top 3
      const isHealthy = await candidate.provider.healthCheck();
      if (isHealthy) {
        healthyProviders.push(candidate);
      }
    }
    
    if (healthyProviders.length === 0) {
      // If no healthy providers in top 3, return the highest weighted one
      return candidates[0];
    }
    
    // Return the highest weighted healthy provider
    return healthyProviders[0];
  }

  /**
   * Build fallback chain for a role and primary provider
   * @param {Object} agentRole - Agent role
   * @param {string} primaryProviderName - Primary provider name
   * @returns {Array}
   */
  buildFallbackChain(agentRole, primaryProviderName) {
    const fallbackChain = [];
    
    agentRole.fallbackChain.forEach(providerType => {
      const provider = this.modelRouter.getProvider(providerType);
      if (provider && provider.name !== primaryProviderName) {
        fallbackChain.push(provider);
      }
    });
    
    return fallbackChain;
  }

  /**
   * Get provider configuration for a role and complexity
   * @param {Object} provider - LLM provider
   * @param {Object} agentRole - Agent role
   * @param {string} complexity - Task complexity
   * @returns {Object}
   */
  getProviderConfig(provider, agentRole, complexity) {
    const complexityLevel = COMPLEXITY_LEVELS[complexity.toUpperCase()] || COMPLEXITY_LEVELS.MEDIUM;
    
    return {
      maxTokens: Math.min(
        agentRole.maxTokens * complexityLevel.tokenMultiplier,
        provider.maxTokens
      ),
      temperature: agentRole.temperature,
      timeout: complexityLevel.timeoutMs,
      retryAttempts: complexityLevel.retryAttempts
    };
  }

  /**
   * Get task configuration for a role and complexity
   * @param {Object} agentRole - Agent role
   * @param {string} complexity - Task complexity
   * @returns {Object}
   */
  getTaskConfig(agentRole, complexity) {
    const complexityLevel = COMPLEXITY_LEVELS[complexity.toUpperCase()] || COMPLEXITY_LEVELS.MEDIUM;
    
    return {
      role: agentRole.name,
      complexity: complexity,
      maxTokens: agentRole.maxTokens,
      temperature: agentRole.temperature,
      timeout: complexityLevel.timeoutMs,
      retryAttempts: complexityLevel.retryAttempts,
      requirements: agentRole.requirements
    };
  }

  /**
   * Track assignment for metrics
   * @param {string} roleName - Role name
   * @param {Object} modelAssignment - Model assignment
   */
  trackAssignment(roleName, modelAssignment) {
    // Find the role key from the role name
    const roleKey = Object.keys(AGENT_ROLES).find(key => 
      AGENT_ROLES[key].name === roleName
    );
    
    if (!roleKey) return;
    
    const metrics = this.performanceMetrics.get(roleKey);
    if (metrics) {
      metrics.totalAssignments++;
      metrics.lastAssignment = new Date();
    }
    
    const load = this.loadBalancing.get(roleKey);
    if (load) {
      load.currentLoad++;
    }
    
    // Store assignment history
    const assignmentId = this.generateAssignmentId();
    this.assignmentHistory.set(assignmentId, {
      roleName: roleKey,
      provider: modelAssignment.provider.name,
      timestamp: new Date(),
      status: 'assigned'
    });
    
    return assignmentId;
  }

  /**
   * Update assignment completion metrics
   * @param {string} assignmentId - Assignment ID
   * @param {boolean} success - Whether assignment was successful
   * @param {number} latency - Task latency in ms
   * @param {number} cost - Task cost
   */
  updateAssignmentMetrics(assignmentId, success, latency, cost) {
    const assignment = this.assignmentHistory.get(assignmentId);
    if (!assignment) return;
    
    assignment.status = success ? 'completed' : 'failed';
    assignment.latency = latency;
    assignment.cost = cost;
    
    const metrics = this.performanceMetrics.get(assignment.roleName);
    if (metrics) {
      if (success) {
        metrics.successfulAssignments++;
      }
      
      // Update rolling averages
      const alpha = 0.1;
      metrics.averageLatency = (1 - alpha) * metrics.averageLatency + alpha * latency;
      metrics.averageCost = (1 - alpha) * metrics.averageCost + alpha * cost;
    }
    
    // Update load balancing
    const load = this.loadBalancing.get(assignment.roleName);
    if (load && load.currentLoad > 0) {
      load.currentLoad--;
    }
  }

  /**
   * Calculate task type similarity
   * @param {string} taskType - Target task type
   * @param {Array} roleTaskTypes - Role's supported task types
   * @returns {number}
   */
  calculateTaskTypeSimilarity(taskType, roleTaskTypes) {
    // Simple similarity based on common words
    const taskWords = taskType.toLowerCase().split('-');
    let maxSimilarity = 0;
    
    roleTaskTypes.forEach(roleTaskType => {
      const roleWords = roleTaskType.toLowerCase().split('-');
      const commonWords = taskWords.filter(word => roleWords.includes(word));
      const similarity = commonWords.length / Math.max(taskWords.length, roleWords.length);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    });
    
    return maxSimilarity;
  }

  /**
   * Get maximum concurrent assignments for a role
   * @param {string} roleName - Role name or role key
   * @returns {number}
   */
  getMaxConcurrentForRole(roleName) {
    const concurrencyLimits = {
      // Role keys
      'INTERVIEWER': 5,
      'PLANNER': 2,
      'SCHEMA_DESIGNER': 3,
      'CODER': 4,
      'TESTER': 6,
      'DEBUGGER': 2,
      'REVIEWER': 4,
      'DEPLOYER': 3,
      // Role names (for backward compatibility)
      'interviewer': 5,
      'planner': 2,
      'schema-designer': 3,
      'coder': 4,
      'tester': 6,
      'debugger': 2,
      'reviewer': 4,
      'deployer': 3
    };
    
    return concurrencyLimits[roleName] || 3;
  }

  /**
   * Generate unique assignment ID
   * @returns {string}
   */
  generateAssignmentId() {
    return `assign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get performance metrics for all roles
   * @returns {Object}
   */
  getPerformanceMetrics() {
    const metrics = {};
    
    this.performanceMetrics.forEach((roleMetrics, roleName) => {
      metrics[roleName] = {
        ...roleMetrics,
        successRate: roleMetrics.totalAssignments > 0 
          ? roleMetrics.successfulAssignments / roleMetrics.totalAssignments 
          : 0
      };
    });
    
    return metrics;
  }

  /**
   * Get current load balancing status
   * @returns {Object}
   */
  getLoadBalancingStatus() {
    const status = {};
    
    this.loadBalancing.forEach((load, roleName) => {
      status[roleName] = {
        currentLoad: load.currentLoad,
        maxConcurrent: load.maxConcurrent,
        utilizationPercent: (load.currentLoad / load.maxConcurrent) * 100
      };
    });
    
    return status;
  }
}

module.exports = {
  AGENT_ROLES,
  COMPLEXITY_LEVELS,
  AgentRoleAssigner
};