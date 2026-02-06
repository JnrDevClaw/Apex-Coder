/**
 * ModelRouter Usage Example
 * Demonstrates how to use the ModelRouter service in the AI App Builder
 */

const { getModelRouterService } = require('../services/model-router-service');

async function demonstrateModelRouter() {
  console.log('🚀 ModelRouter Service Demo\n');

  // Initialize the service with configuration
  const modelRouterService = getModelRouterService({
    enabledProviders: ['openrouter', 'deepseek', 'anthropic', 'mistral'],
    openrouter: {
      costPerToken: 0.0015
    },
    deepseek: {
      costPerToken: 0.00014
    }
  });

  try {
    // Initialize the service (registers providers and performs health checks)
    console.log('Initializing ModelRouter service...');
    await modelRouterService.initialize();
    console.log('✅ Service initialized successfully\n');

    // Get service status
    const status = modelRouterService.getStatus();
    console.log('📊 Service Status:');
    console.log(`- Providers registered: ${status.providers.registered}`);
    console.log(`- Enabled providers: ${status.providers.enabled.join(', ')}`);
    console.log(`- Total calls: ${status.providers.metrics.totalCalls}\n`);

    // Example 1: Route a coding task
    console.log('💻 Example 1: Coding Task');
    const codingTask = {
      type: 'code-generation',
      complexity: 'medium',
      prompt: 'Create a JavaScript function that validates email addresses using regex',
      context: {
        language: 'javascript',
        requiresValidation: true
      }
    };

    const codingResult = await modelRouterService.routeTask(codingTask);
    console.log(`- Assigned to: ${codingResult.assignment.agentRole.name} role`);
    console.log(`- Provider: ${codingResult.response.provider}`);
    console.log(`- Success: ${codingResult.response.success}`);
    console.log(`- Cost: $${codingResult.response.cost.toFixed(4)}\n`);

    // Example 2: Route a planning task
    console.log('📋 Example 2: Planning Task');
    const planningTask = {
      type: 'decomposition',
      complexity: 'high',
      prompt: 'Break down the requirements for building a user authentication system with JWT tokens',
      context: {
        requiresReasoning: true
      }
    };

    const planningResult = await modelRouterService.routeTask(planningTask);
    console.log(`- Assigned to: ${planningResult.assignment.agentRole.name} role`);
    console.log(`- Provider: ${planningResult.response.provider}`);
    console.log(`- Success: ${planningResult.response.success}`);
    console.log(`- Tokens used: ${planningResult.response.tokens}\n`);

    // Example 3: Route a testing task
    console.log('🧪 Example 3: Testing Task');
    const testingTask = {
      type: 'test-generation',
      complexity: 'medium',
      prompt: 'Generate unit tests for a user registration function',
      context: {
        language: 'javascript',
        framework: 'jest'
      }
    };

    const testingResult = await modelRouterService.routeTask(testingTask);
    console.log(`- Assigned to: ${testingResult.assignment.agentRole.name} role`);
    console.log(`- Provider: ${testingResult.response.provider}`);
    console.log(`- Success: ${testingResult.response.success}\n`);

    // Example 4: Get cost estimate
    console.log('💰 Example 4: Cost Estimation');
    const estimateTask = {
      type: 'code-generation',
      complexity: 'high',
      prompt: 'Build a complete REST API with authentication, user management, and data validation',
      maxTokens: 4000
    };

    const costEstimate = await modelRouterService.estimateTaskCost(estimateTask);
    console.log(`- Provider: ${costEstimate.provider}`);
    console.log(`- Agent Role: ${costEstimate.agentRole}`);
    console.log(`- Estimated tokens: ${costEstimate.estimatedTokens}`);
    console.log(`- Estimated cost: $${costEstimate.estimatedCost.toFixed(4)}\n`);

    // Example 5: Test specific provider
    console.log('🔍 Example 5: Provider Testing');
    const testResult = await modelRouterService.testProvider('deepseek', 'Hello, world!');
    console.log(`- Provider: ${testResult.provider}`);
    console.log(`- Success: ${testResult.success}`);
    console.log(`- Response length: ${testResult.response?.content?.length || 0} characters\n`);

    // Show performance metrics
    console.log('📈 Performance Metrics:');
    const finalStatus = modelRouterService.getStatus();
    console.log(`- Total calls: ${finalStatus.providers.metrics.totalCalls}`);
    console.log(`- Success rate: ${(finalStatus.providers.metrics.successRate * 100).toFixed(1)}%`);
    console.log(`- Average latency: ${finalStatus.providers.metrics.averageLatency.toFixed(0)}ms`);
    console.log(`- Total cost: $${finalStatus.providers.metrics.totalCost.toFixed(4)}\n`);

    // Show agent role performance
    console.log('🎯 Agent Role Performance:');
    Object.entries(finalStatus.agentRoles.performance).forEach(([role, metrics]) => {
      if (metrics.totalAssignments > 0) {
        console.log(`- ${role}: ${metrics.totalAssignments} assignments, ${(metrics.successRate * 100).toFixed(1)}% success`);
      }
    });

  } catch (error) {
    console.error('❌ Error during demonstration:', error.message);
  }
}

// Run the demonstration if this file is executed directly
if (require.main === module) {
  demonstrateModelRouter().catch(console.error);
}

module.exports = { demonstrateModelRouter };