# AI Integration API Documentation

## Overview

This document provides comprehensive API documentation for the AI Integration system, including ModelRouter, Task Planner, Code Generator, and Self-Fix Loop components.

## Table of Contents

1. [ModelRouter API](#modelrouter-api)
2. [Task Planner API](#task-planner-api)
3. [Code Generator API](#code-generator-api)
4. [Self-Fix Loop API](#self-fix-loop-api)
5. [Configuration API](#configuration-api)
6. [Error Handling](#error-handling)
7. [Integration Examples](#integration-examples)
8. [Troubleshooting](#troubleshooting)

---

## ModelRouter API

The ModelRouter service routes AI tasks to optimal LLM providers with intelligent fallback.

### Initialization

```javascript
const { ModelRouter } = require('./services/model-router');

const router = new ModelRouter();
await router.initialize({
  demoMode: 'auto',
  fallbackChain: ['openrouter', 'deepseek', 'huggingface', 'demo'],
  healthCheckOnStartup: true
});
```

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `demoMode` | string | `'auto'` | Demo mode: `'auto'`, `'enabled'`, `'disabled'` |
| `fallbackChain` | array | `['openrouter', 'deepseek', 'huggingface', 'demo']` | Provider fallback order |
| `healthCheckOnStartup` | boolean | `true` | Perform health checks on initialization |
| `healthCheckInterval` | number | `300000` | Health check interval in ms |

### Route Task

Routes a task to the optimal LLM provider.

```javascript
const response = await router.routeTask({
  role: 'coder',
  complexity: 'medium',
  prompt: 'Generate an Express.js server...',
  fallback: true,
  timeout: 30000
}, {
  userId: 'user-123',
  projectId: 'proj-456',
  correlationId: 'corr-abc'
});
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `role` | string | Yes | Agent role: `'interviewer'`, `'planner'`, `'coder'`, `'tester'`, `'debugger'`, `'reviewer'`, `'deployer'` |
| `complexity` | string | No | Task complexity: `'low'`, `'medium'`, `'high'` (default: `'medium'`) |
| `prompt` | string | Yes | The prompt to send to the LLM |
| `fallback` | boolean | No | Enable fallback on failure (default: `true`) |
| `timeout` | number | No | Timeout in ms (auto-calculated based on complexity) |

**Context Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | No | User ID for tracking |
| `projectId` | string | No | Project ID for tracking |
| `jobId` | string | No | Job ID for tracking |
| `correlationId` | string | No | Correlation ID for distributed tracing |

**Response:**

```javascript
{
  success: true,
  content: "Generated code here...",
  tokens: 1500,
  cost: 0.006,
  latency: 2500,
  provider: "openrouter",
  model: "anthropic/claude-3-sonnet",
  metadata: {
    demoMode: false,
    role: "coder"
  }
}
```

### Get Metrics

Retrieve routing metrics and statistics.

```javascript
const metrics = router.getMetrics();
```

**Response:**

```javascript
{
  totalCalls: 150,
  successfulCalls: 145,
  totalCost: 2.45,
  averageLatency: 2300,
  successRate: 0.967,
  fallbackRate: 0.033,
  fallbackSuccessRate: 0.8,
  registeredProviders: ['openrouter', 'deepseek', 'huggingface', 'demo'],
  totalProviders: 4,
  providerHealth: {
    openrouter: { healthy: true, lastCheck: '2024-01-15T10:30:00Z', consecutiveFailures: 0 },
    deepseek: { healthy: true, lastCheck: '2024-01-15T10:30:00Z', consecutiveFailures: 0 }
  }
}
```

### Get Provider Health

Check health status of all providers.

```javascript
const health = router.getProviderHealth();
```

**Response:**

```javascript
{
  openrouter: {
    healthy: true,
    lastCheck: '2024-01-15T10:30:00Z',
    consecutiveFailures: 0
  },
  deepseek: {
    healthy: false,
    lastCheck: '2024-01-15T10:29:00Z',
    consecutiveFailures: 3
  }
}
```

---

## Task Planner API

The Task Planner decomposes project specifications into executable tasks.

### Decompose Spec

Generate a task breakdown from a project specification.

```javascript
const { TaskPlanner } = require('./services/task-planner');

const planner = new TaskPlanner(modelRouter);
const result = await planner.decomposeSpec(specJson);
```

**Request:**

```javascript
{
  projectName: "My App",
  stack: {
    frontend: "svelte",
    backend: "express",
    database: "postgresql"
  },
  features: ["auth", "uploads", "real-time"],
  constraints: {
    budget: "low",
    timeline: "2 weeks"
  }
}
```

**Response:**

```javascript
{
  tasks: [
    {
      id: 1,
      name: "Setup project structure",
      agentRole: "coder",
      estimatedTime: 300,
      dependencies: [],
      outputs: ["package.json", "server/app.js"],
      requirements: ["Express framework", "CORS"],
      context: {
        framework: "express",
        features: ["auth"]
      }
    }
  ],
  dependencies: {
    1: [],
    2: [1],
    3: [1, 2]
  },
  executionOrder: [1, 2, 3, 4, 5],
  milestones: [
    {
      name: "Backend Setup",
      tasks: [1, 2, 3]
    }
  ]
}
```

### Generate File Structure

Generate project file structure.

```javascript
const fileStructure = await planner.generateFileStructure(specJson, tasks);
```

**Response:**

```javascript
{
  files: [
    {
      path: "server/app.js",
      type: "file",
      template: "express-app"
    },
    {
      path: "server/routes",
      type: "directory"
    }
  ],
  dependencies: {
    "package.json": {
      express: "^4.18.0",
      cors: "^2.8.5"
    }
  }
}
```

### Generate OpenAPI Skeleton

Generate OpenAPI specification.

```javascript
const openapi = await planner.generateOpenAPIskeleton(specJson, tasks);
```

**Response:**

```javascript
{
  openapi: "3.0.0",
  info: {
    title: "My App API",
    version: "1.0.0"
  },
  paths: {
    "/api/auth/login": {
      post: {
        summary: "User login",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string" },
                  password: { type: "string" }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

---

## Code Generator API

The Code Generator creates actual code using LLMs and templates.

### Generate Code

Generate code for a specific task.

```javascript
const { CodeGenerator } = require('./services/code-generator');

const generator = new CodeGenerator(modelRouter, promptBuilder, codeParser);
const result = await generator.generateCode(task, specJson);
```

**Request:**

```javascript
{
  task: {
    id: 1,
    name: "Create Express backend",
    agentRole: "coder",
    outputs: ["server/app.js", "server/package.json"],
    context: {
      framework: "express",
      features: ["auth"]
    }
  },
  specJson: {
    projectName: "My App",
    stack: { backend: "express" }
  }
}
```

**Response:**

```javascript
{
  success: true,
  files: [
    {
      path: "server/app.js",
      content: "const express = require('express');\n...",
      size: 1024,
      language: "javascript"
    },
    {
      path: "server/package.json",
      content: "{\n  \"name\": \"my-app\",\n...",
      size: 256,
      language: "json"
    }
  ],
  method: "llm",
  cost: 0.006,
  tokens: 2000,
  model: "anthropic/claude-3-sonnet"
}
```

### Generate from Template

Generate code using templates (faster, cheaper).

```javascript
const result = await generator.generateFromTemplate(task, specJson);
```

**Response:**

```javascript
{
  success: true,
  files: [
    {
      path: "server/app.js",
      content: "...",
      size: 1024,
      language: "javascript"
    }
  ],
  method: "template",
  cost: 0
}
```

---

## Self-Fix Loop API

The Self-Fix Loop automatically debugs and fixes failing tests.

### Start Fix Loop

Start automated debugging for a failing test.

```javascript
const { SelfFixLoop } = require('../workers/services/self-fix-loop');

const fixLoop = new SelfFixLoop({
  maxIterations: 5,
  modelRouter: router
});

const result = await fixLoop.startFixLoop(jobId, testFailure, codeContext);
```

**Request:**

```javascript
{
  jobId: "job-789",
  testFailure: {
    error: {
      message: "TypeError: Cannot read property 'name' of undefined",
      stack: "..."
    },
    output: "Test output here..."
  },
  codeContext: {
    workDir: "/tmp/build-123",
    files: {
      "server/app.js": "const express = require('express');\n..."
    },
    testCommands: ["npm test"]
  }
}
```

**Response (Success):**

```javascript
{
  success: true,
  iteration: 2,
  fixedAt: "2024-01-15T10:37:30Z",
  patch: "diff --git a/server/app.js b/server/app.js\n..."
}
```

**Response (Escalated):**

```javascript
{
  success: false,
  totalIterations: 5,
  escalated: true,
  escalatedAt: "2024-01-15T10:40:00Z"
}
```

### Get Fix History

Retrieve fix history for a job.

```javascript
const history = fixLoop.fixHistory.get(jobId);
```

**Response:**

```javascript
{
  jobId: "job-789",
  startedAt: "2024-01-15T10:35:00Z",
  completedAt: "2024-01-15T10:37:30Z",
  status: "success",
  iterations: [
    {
      number: 1,
      startedAt: "2024-01-15T10:35:00Z",
      fix: {
        patch: "...",
        reasoning: "...",
        model: "deepseek-reasoner",
        cost: 0.0055
      },
      applyResult: { success: true },
      testResult: { success: false, output: "..." },
      completedAt: "2024-01-15T10:36:00Z"
    }
  ],
  successIteration: 2,
  totalCost: 0.011
}
```

---

## Configuration API

Manage ModelRouter configuration at runtime.

### Get Configuration

```javascript
const config = require('./config/model-router-config');
const currentConfig = config.get();
```

### Get Specific Value

```javascript
const maxCost = config.getValue('cost.maxCostPerCall');
```

### Update Configuration

```javascript
config.update('cost.maxCostPerCall', 2.0);
```

### Update Multiple Values

```javascript
config.updateMultiple({
  'cost.maxCostPerCall': 2.0,
  'timeouts.high': 90000,
  'logging.logLevel': 'debug'
});
```

### Listen for Changes

```javascript
config.onChange((path, newValue, oldValue) => {
  console.log(`Config changed: ${path} from ${oldValue} to ${newValue}`);
});
```

### Export Configuration

```javascript
const jsonConfig = config.export(false); // false = exclude API keys
```

---

## Error Handling

### Error Response Format

All API errors follow this format:

```javascript
{
  error: {
    code: "LLM_CALL_FAILED",
    message: "Provider openrouter failed for role coder",
    details: {
      provider: "openrouter",
      role: "coder",
      latency: 2500,
      isTimeout: false
    },
    correlationId: "corr-abc",
    timestamp: "2024-01-15T10:30:00Z"
  }
}
```

### Common Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| `INVALID_ROLE` | Invalid agent role specified | Use valid role: `'interviewer'`, `'planner'`, `'coder'`, `'tester'`, `'debugger'`, `'reviewer'`, `'deployer'` |
| `NO_PROVIDER_AVAILABLE` | No provider available for role | Check provider configuration and API keys |
| `LLM_CALL_TIMEOUT` | LLM call exceeded timeout | Increase timeout or reduce complexity |
| `LLM_CALL_FAILED` | LLM call failed | Check provider health and logs |
| `FALLBACK_EXHAUSTED` | All fallback providers failed | Check all provider configurations |
| `COST_LIMIT_EXCEEDED` | Cost limit exceeded | Increase cost limits or optimize usage |
| `RATE_LIMIT_EXCEEDED` | Provider rate limit hit | Wait and retry with backoff |
| `INVALID_CONFIGURATION` | Configuration validation failed | Fix configuration errors |

### Retry Logic

The system implements exponential backoff for retries:

- **Attempt 1**: Immediate
- **Attempt 2**: 1 second delay
- **Attempt 3**: 2 seconds delay
- **Attempt 4**: 4 seconds delay
- **Attempt 5**: 8 seconds delay
- **Attempt 6+**: 16 seconds delay (max)

Jitter (30%) is added to prevent thundering herd.

---

## Integration Examples

### Example 1: Complete Code Generation Flow

```javascript
const { ModelRouter } = require('./services/model-router');
const { TaskPlanner } = require('./services/task-planner');
const { CodeGenerator } = require('./services/code-generator');

// Initialize
const router = new ModelRouter();
await router.initialize();

const planner = new TaskPlanner(router);
const generator = new CodeGenerator(router);

// Decompose spec
const specJson = {
  projectName: "My App",
  stack: { backend: "express" },
  features: ["auth"]
};

const { tasks } = await planner.decomposeSpec(specJson);

// Generate code for each task
for (const task of tasks) {
  const result = await generator.generateCode(task, specJson);
  
  // Save files
  for (const file of result.files) {
    await fs.writeFile(file.path, file.content);
  }
  
  console.log(`Generated ${result.files.length} files for task ${task.id}`);
}
```

### Example 2: Self-Fix Loop Integration

```javascript
const { SelfFixLoop } = require('../workers/services/self-fix-loop');
const { exec } = require('child_process');

const fixLoop = new SelfFixLoop({ modelRouter: router });

// Run tests
try {
  await exec('npm test', { cwd: workDir });
  console.log('Tests passed!');
} catch (error) {
  // Tests failed, start fix loop
  const result = await fixLoop.startFixLoop(jobId, {
    error: error,
    output: error.stdout + error.stderr
  }, {
    workDir,
    testCommands: ['npm test']
  });
  
  if (result.success) {
    console.log(`Fixed in ${result.iteration} iterations`);
  } else {
    console.log('Escalated to human review');
  }
}
```

### Example 3: Configuration Management

```javascript
const config = require('./config/model-router-config');

// Initialize with custom settings
config.initialize();

// Update cost limits
config.update('cost.maxCostPerJob', 20.0);

// Listen for changes
config.onChange((path, newValue) => {
  if (path.startsWith('cost.')) {
    console.log(`Cost limit updated: ${path} = ${newValue}`);
    // Notify admin
  }
});

// Export for backup
const backup = config.export(true);
await fs.writeFile('config-backup.json', backup);
```

---

## Troubleshooting

### Issue: "No provider available for role"

**Cause**: No LLM provider is configured or enabled for the requested role.

**Solution**:
1. Check environment variables for API keys
2. Verify provider configuration in `model-router-config.js`
3. Ensure at least one provider supports the role
4. Check provider health status

```javascript
const health = router.getProviderHealth();
console.log(health);
```

### Issue: "LLM call timeout"

**Cause**: LLM call exceeded the configured timeout.

**Solution**:
1. Increase timeout for high complexity tasks
2. Simplify the prompt
3. Check provider latency
4. Try a different provider

```javascript
// Increase timeout
const response = await router.routeTask({
  role: 'coder',
  complexity: 'high',
  prompt: '...',
  timeout: 90000 // 90 seconds
}, context);
```

### Issue: "All fallback providers failed"

**Cause**: All providers in the fallback chain failed.

**Solution**:
1. Check provider health
2. Verify API keys are valid
3. Check rate limits
4. Review error logs for specific failures

```javascript
const metrics = router.getMetrics();
console.log('Fallback rate:', metrics.fallbackRate);
console.log('Fallback success rate:', metrics.fallbackSuccessRate);
```

### Issue: "Cost limit exceeded"

**Cause**: Job or user exceeded configured cost limits.

**Solution**:
1. Increase cost limits in configuration
2. Optimize prompts to use fewer tokens
3. Use template-based generation when possible
4. Review cost tracking metrics

```javascript
config.update('cost.maxCostPerJob', 50.0);
```

### Issue: "Configuration validation failed"

**Cause**: Invalid configuration values.

**Solution**:
1. Check error message for specific validation failures
2. Ensure all required fields are present
3. Verify value types and ranges
4. Reset to defaults if needed

```javascript
config.reset();
```

### Debug Mode

Enable debug logging for detailed troubleshooting:

```javascript
config.update('logging.logLevel', 'debug');
```

This will log:
- All LLM calls with full prompts
- Provider selection decisions
- Fallback attempts
- Cost calculations
- Health check results

---

## Rate Limits

### Provider Rate Limits

| Provider | Requests/Min | Tokens/Min |
|----------|--------------|------------|
| OpenRouter | 60 | 100,000 |
| DeepSeek | 30 | 50,000 |
| HuggingFace | 20 | 30,000 |
| Anthropic | 50 | 80,000 |

### System Rate Limits

- **Max Concurrent Calls**: 10 (configurable)
- **Request Queue Size**: 100 (configurable)
- **Max Cost Per Call**: $1.00 (configurable)
- **Max Cost Per Job**: $10.00 (configurable)
- **Max Cost Per User**: $100.00 (configurable)

---

## Best Practices

1. **Always use fallback**: Enable fallback for production systems
2. **Set appropriate timeouts**: Match timeout to task complexity
3. **Monitor costs**: Track costs per job and user
4. **Use templates when possible**: Templates are faster and free
5. **Implement retry logic**: Handle transient failures gracefully
6. **Log correlation IDs**: Enable distributed tracing
7. **Monitor provider health**: Check health regularly
8. **Configure cost limits**: Prevent runaway costs
9. **Use demo mode for testing**: Test without API costs
10. **Keep configuration backed up**: Export config regularly

---

## Support

For additional support:
- Check logs in `logs/model-router.log`
- Review metrics dashboard
- Contact system administrator
- File issue on GitHub

---

## Changelog

### Version 1.0.0 (2024-01-15)
- Initial API documentation
- ModelRouter API
- Task Planner API
- Code Generator API
- Self-Fix Loop API
- Configuration API
- Error handling guide
- Integration examples
- Troubleshooting guide
