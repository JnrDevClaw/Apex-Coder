# AI Integration Developer Documentation

## Overview

This guide provides comprehensive documentation for developers working with the AI Integration system. It covers architecture, implementation details, and best practices for extending and maintaining the system.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [ModelRouter Architecture](#modelrouter-architecture)
3. [Provider Integration Guide](#provider-integration-guide)
4. [Code Generation Guide](#code-generation-guide)
5. [Self-Fix Loop Implementation](#self-fix-loop-implementation)
6. [Testing Strategy](#testing-strategy)
7. [Performance Optimization](#performance-optimization)
8. [Security Considerations](#security-considerations)
9. [Deployment Guide](#deployment-guide)
10. [Contributing Guidelines](#contributing-guidelines)

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (SvelteKit)                     │
│                      Questionnaire UI                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ Spec JSON
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                  Backend (Fastify + Node.js)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ ModelRouter  │  │ Task Planner │  │ Job Queue    │      │
│  │              │  │              │  │ (BullMQ)     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │               │
│         └─────────────────┴─────────────────┘               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    Worker Pool (Docker)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Job Executor │  │ Self-Fix Loop│  │ Test Runner  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    External Services                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ LLM Providers│  │ S3 Storage   │  │ GitHub       │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow (8-Stage Pipeline)

1. **Stage 0**: User completes questionnaire → specs.json
2. **Stage 1**: HuggingFace Clarifier → specs_refined.json + clarification_history.json
3. **Stage 1.5**: GPT-5 Mini Normalizer → specs_clean.json
4. **Stage 2**: Llama 4 Scout → docs.md
5. **Stage 3**: DeepSeek-V3 → schema.json (updates docs.md)
6. **Stage 3.5**: GPT-5 Mini Validator → structural_issues.json
7. **Stage 4**: GPT-4o → file_structure.json
8. **Stage 5**: Claude 3.5 Haiku → validated_structure.json
9. **Stage 6**: Worker creates empty files from validated_structure.json
10. **Stage 7**: GPT-5 Mini builds prompts + Gemini-3 generates code
11. **Stage 8**: GitHub repo created and all files pushed

---

## Stage-Based Pipeline Architecture

### Core Concepts

The system uses a **deterministic 8-stage pipeline** where each stage has a specific model assignment. The Stage Router provides direct stage-to-model mapping without agent role abstraction.

### Pipeline Orchestrator

The Pipeline Orchestrator manages the sequential execution of all 8 stages:

```javascript
class PipelineOrchestrator {
  async startPipeline(params) {
    const { buildId, projectId, specJson } = params;
    
    // Execute stages sequentially
    for (let stage = 0; stage <= 8; stage++) {
      const stageConfig = PIPELINE_STAGES[stage];
      
      // Execute stage
      const result = await this.executeStage(stage, context);
      
      // Store artifacts
      await this.storeStageArtifacts(buildId, stage, result.artifacts);
      
      // Update build status
      await this.buildModel.updateStageStatus(buildId, stage, 'completed');
      
      // Emit progress event
      this.websocket.emit(`build:${buildId}`, {
        type: 'stage_completed',
        stage,
        artifacts: result.artifacts
      });
    }
    
    return { success: true, repoUrl: context.repoUrl };
  }
}
```

### Stage Router

The Stage Router replaces the ModelRouter for stage-based routing:

#### Key Classes

**1. StageRouter**

Routes pipeline stages to specific models:

```javascript
class StageRouter {
  constructor(modelRouter) {
    this.modelRouter = modelRouter;
    this.stageModelMap = this.buildStageModelMap();
  }

  getModelForStage(stageNumber) {
    const stageConfig = PIPELINE_STAGES[stageNumber];
    if (!stageConfig || !stageConfig.requiresAI) {
      return null;
    }
    
    return {
      provider: stageConfig.model,
      modelName: stageConfig.modelName,
      fallbackModel: stageConfig.fallbackModel
    };
  }

  async callStageModel(stageNumber, prompt, options = {}) {
    const modelConfig = this.getModelForStage(stageNumber);
    const provider = this.modelRouter.providers.get(modelConfig.provider);
    
    return await provider.call(prompt, {
      ...options,
      model: modelConfig.modelName,
      stage: stageNumber
    });
  }
}
```

**2. PromptTemplateManager**

Manages canonical prompts for each stage:

```javascript
class PromptTemplateManager {
  constructor() {
    this.templates = this.loadTemplates();
  }

  getTemplate(templateName, variables) {
    const template = this.templates.get(templateName);
    return this.renderTemplate(template, variables);
  }

  loadTemplates() {
    return new Map([
      ['clarifier', CLARIFIER_PROMPT],
      ['normalizer', NORMALIZER_PROMPT],
      ['docs-creator', DOCS_CREATOR_PROMPT],
      ['schema-generator', SCHEMA_GENERATOR_PROMPT],
      ['structural-validator', STRUCTURAL_VALIDATOR_PROMPT],
      ['file-structure-generator', FILE_STRUCTURE_GENERATOR_PROMPT],
      ['validator', VALIDATOR_PROMPT],
      ['prompt-builder', PROMPT_BUILDER_PROMPT],
      ['gemini-coder', GEMINI_CODER_PROMPT]
    ]);
  }
}
```

**3. Build Model (Enhanced)**

Tracks stage-specific progress:

```javascript
class Build {
  constructor(data) {
    this.buildId = data.buildId;
    this.projectId = data.projectId;
    this.currentStage = data.currentStage; // 0-8
    this.stageStatuses = data.stageStatuses || {}; // { '0': 'completed', '1': 'running' }
    this.artifacts = data.artifacts || {}; // { '0': {...}, '1': {...} }
    this.failedAt = data.failedAt; // Stage number where it failed
  }

  async updateStageStatus(stageNumber, status, metadata = {}) {
    this.stageStatuses[stageNumber] = status;
    this.currentStage = stageNumber;
    await this.save();
  }

  async storeStageArtifacts(stageNumber, artifacts) {
    this.artifacts[stageNumber] = artifacts;
    await this.save();
  }

  getStageArtifacts(stageNumber) {
    return this.artifacts[stageNumber] || {};
  }
}
```

### Stage-to-Model Mapping

Each stage has a deterministic model assignment:

```javascript
const PIPELINE_STAGES = {
  0: { name: 'questionnaire', requiresAI: false },
  1: { 
    name: 'clarifier',
    requiresAI: true,
    model: 'huggingface',
    modelName: 'OpenHermes-2.5-Mistral-7B',
    fallbackModel: 'Qwen2-7B-Instruct',
    promptTemplate: 'clarifier'
  },
  1.5: {
    name: 'normalizer',
    requiresAI: true,
    model: 'zukijourney',
    modelName: 'gpt-5-mini',
    promptTemplate: 'normalizer'
  },
  2: {
    name: 'docs-creator',
    requiresAI: true,
    model: 'github-models',
    modelName: 'meta-llama-4-scout-17b-16e-instruct',
    promptTemplate: 'docs-creator'
  },
  3: {
    name: 'schema-generator',
    requiresAI: true,
    model: 'deepseek',
    modelName: 'deepseek-v3',
    promptTemplate: 'schema-generator'
  },
  3.5: {
    name: 'structural-validator',
    requiresAI: true,
    model: 'zukijourney',
    modelName: 'gpt-5-mini',
    promptTemplate: 'structural-validator'
  },
  4: {
    name: 'file-structure-generator',
    requiresAI: true,
    model: 'zukijourney',
    modelName: 'gpt-4o',
    promptTemplate: 'file-structure-generator'
  },
  5: {
    name: 'validator',
    requiresAI: true,
    model: 'zukijourney',
    modelName: 'claude-3.5-haiku',
    promptTemplate: 'validator'
  },
  6: { name: 'empty-file-creation', requiresAI: false },
  7: {
    name: 'code-generation',
    requiresAI: true,
    model: ['zukijourney', 'gemini'],
    modelName: ['gpt-5-mini', 'gemini-3-pro'],
    promptTemplate: ['prompt-builder', 'gemini-coder']
  },
  8: { name: 'repo-creation', requiresAI: false }
};
```

### Retry and Error Handling

Each stage implements retry logic with exponential backoff:

1. **Initial Attempt**: Call assigned model for stage
2. **Retry 1**: 500ms delay, retry same model
3. **Retry 2**: 1500ms delay, retry same model
4. **Failure**: Mark stage as failed, halt pipeline

```javascript
async executeStageWithRetry(stageNumber, context) {
  let attempt = 0;
  let lastError;
  
  while (attempt <= 2) {
    try {
      return await this.executeStage(stageNumber, context);
    } catch (error) {
      lastError = error;
      attempt++;
      
      if (attempt <= 2) {
        const backoff = 500 * Math.pow(3, attempt - 1); // 500ms, 1500ms
        await this.sleep(backoff);
      }
    }
  }
  
  // All retries failed - halt pipeline
  await this.buildModel.updateStageStatus(stageNumber, 'failed', {
    error: lastError.message,
    failedAt: stageNumber
  });
  
  throw new Error(`Stage ${stageNumber} failed after 3 attempts: ${lastError.message}`);
}
```

### Artifact Persistence

Before each stage transition, artifacts are persisted:

```javascript
async persistArtifacts(buildId, stageNumber, artifacts) {
  const artifactPath = `/project/${buildId}/`;
  
  // Store in appropriate subdirectory
  for (const [filename, content] of Object.entries(artifacts)) {
    let subdir = 'specs';
    if (filename.endsWith('.md')) subdir = 'docs';
    if (filename.includes('/')) subdir = 'code';
    
    await artifactStorage.store(`${artifactPath}${subdir}/${filename}`, content);
  }
  
  await buildModel.storeStageArtifacts(stageNumber, artifacts);
}
```

---

## Stage Implementation Guide

### Implementing a New Stage

To add or modify a pipeline stage:

#### Step 1: Define Stage Configuration

Add to `PIPELINE_STAGES` in `server/services/pipeline-orchestrator.js`:

```javascript
const PIPELINE_STAGES = {
  // ... existing stages
  9: {
    name: 'my-new-stage',
    description: 'Description of what this stage does',
    requiresAI: true,
    model: 'provider-name',
    modelName: 'model-name',
    inputArtifacts: ['previous-stage-output.json'],
    outputArtifacts: ['my-stage-output.json'],
    handler: 'handleMyNewStage',
    promptTemplate: 'my-new-stage'
  }
};
```

#### Step 2: Create Prompt Template

Add to `server/services/prompt-templates.js`:

```javascript
const PROMPT_TEMPLATES = {
  // ... existing templates
  'my-new-stage': `
ROLE:
You are a [role description].

TASK:
[Task description]

INPUT:
{{input_variables}}

RULES:
- Rule 1
- Rule 2

EXPECTED OUTPUT:
[Output format description]
`
};
```

#### Step 3: Implement Stage Handler

Add handler method to `PipelineOrchestrator`:

```javascript
async handleMyNewStage(context) {
  // Read input artifacts
  const inputData = await this.artifactStorage.getArtifact(
    context.projectId,
    'specs/previous-stage-output.json'
  );
  
  // Build prompt
  const prompt = this.promptTemplates.getTemplate('my-new-stage', {
    input_variables: inputData
  });
  
  // Call model via Stage Router
  const response = await this.stageRouter.callStageModel(9, prompt, {
    context: context
  });
  
  // Parse and store output
  const output = JSON.parse(response.content);
  await this.artifactStorage.storeArtifact(
    context.projectId,
    'specs/my-stage-output.json',
    output
  );
  
  return {
    success: true,
    artifacts: { 'my-stage-output.json': output }
  };
}
```

#### Step 4: Update Build Model

Ensure the Build model can track the new stage:

```javascript
// No code changes needed - Build model dynamically handles any stage number
```

#### Step 5: Add Tests

Create tests in `server/test/services/pipeline-orchestrator.test.js`:

```javascript
describe('Stage 9: My New Stage', () => {
  it('should execute my new stage successfully', async () => {
    const result = await orchestrator.executeStage(9, context);
    
    expect(result.success).toBe(true);
    expect(result.artifacts['my-stage-output.json']).toBeDefined();
  });
});
```

---

## Provider Integration Guide

### Creating a New Provider

To add a new LLM provider, follow these steps:

#### Step 1: Create Provider Class

Create a new file in `server/services/providers/`:

```javascript
// server/services/providers/my-provider.js

const { LLMProvider, LLMResponse } = require('../model-router');
const axios = require('axios');

class MyProvider extends LLMProvider {
  constructor(config = {}) {
    super({
      name: 'my-provider',
      capabilities: ['coder', 'planner', 'debugger'],
      costPerToken: 0.0005,
      maxTokens: 8192,
      latency: 300,
      reliability: 0.95,
      ...config
    });
    
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL || 'https://api.myprovider.com';
    this.model = config.model || 'my-model-v1';
  }

  async call(prompt, context = {}) {
    if (!this.apiKey) {
      throw new Error('API key not configured for MyProvider');
    }

    const startTime = Date.now();

    try {
      const response = await axios.post(
        `${this.baseURL}/v1/completions`,
        {
          model: this.model,
          prompt: prompt,
          max_tokens: context.maxTokens || this.maxTokens,
          temperature: context.temperature || 0.7
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: context.timeout || 30000
        }
      );

      const latency = Date.now() - startTime;
      const tokens = response.data.usage?.total_tokens || 0;
      const cost = tokens * this.costPerToken;

      return new LLMResponse({
        success: true,
        content: response.data.choices[0].text,
        tokens: tokens,
        cost: cost,
        latency: latency,
        provider: this.name,
        model: this.model,
        metadata: {
          role: context.role,
          finishReason: response.data.choices[0].finish_reason
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
        model: this.model,
        error: error.message
      });
    }
  }

  async healthCheck() {
    try {
      const response = await this.call('test', { timeout: 5000 });
      return response.success;
    } catch (error) {
      return false;
    }
  }
}

module.exports = MyProvider;
```

#### Step 2: Register Provider

Add to `server/services/providers/index.js`:

```javascript
module.exports = {
  OpenRouterProvider: require('./openrouter'),
  DeepSeekProvider: require('./deepseek'),
  HuggingFaceProvider: require('./huggingface'),
  AnthropicProvider: require('./anthropic'),
  DemoProvider: require('./demo'),
  MyProvider: require('./my-provider') // Add new provider
};
```

#### Step 3: Configure Provider

Add configuration to `server/config/model-router-config.js`:

```javascript
providers: {
  // ... existing providers
  'my-provider': {
    enabled: true,
    priority: 2,
    capabilities: ['coder', 'planner', 'debugger'],
    models: {
      default: 'my-model-v1',
      coder: 'my-model-code',
      debugger: 'my-model-debug'
    },
    rateLimit: {
      requestsPerMinute: 40,
      tokensPerMinute: 60000
    }
  }
}
```

#### Step 4: Add Environment Variable

Update `.env.example`:

```bash
# My Provider
MY_PROVIDER_API_KEY=your-api-key-here
```

#### Step 5: Update Provider Loading

Update `ModelRouter.loadProvidersFromEnv()`:

```javascript
// My Provider
if (process.env.MY_PROVIDER_API_KEY) {
  providers.push({
    name: 'my-provider',
    type: 'MyProvider',
    config: {
      apiKey: process.env.MY_PROVIDER_API_KEY,
      priority: 2
    }
  });
}
```

#### Step 6: Test Provider

Create tests in `server/test/services/my-provider.test.js`:

```javascript
const { describe, it, expect, beforeAll } = require('@jest/globals');
const MyProvider = require('../../services/providers/my-provider');

describe('MyProvider', () => {
  let provider;

  beforeAll(() => {
    provider = new MyProvider({
      apiKey: process.env.MY_PROVIDER_API_KEY || 'test-key'
    });
  });

  it('should initialize with correct configuration', () => {
    expect(provider.name).toBe('my-provider');
    expect(provider.capabilities).toContain('coder');
  });

  it('should make successful API call', async () => {
    const response = await provider.call('Generate a hello world function');
    
    expect(response.success).toBe(true);
    expect(response.content).toBeTruthy();
    expect(response.tokens).toBeGreaterThan(0);
  });

  it('should handle errors gracefully', async () => {
    const badProvider = new MyProvider({ apiKey: 'invalid-key' });
    const response = await badProvider.call('test');
    
    expect(response.success).toBe(false);
    expect(response.error).toBeTruthy();
  });
});
```

---

## Code Generation Guide (Stage 7)

### Stage 7 Pipeline

```
validated_structure.json → For Each File → GPT-5 Mini (Prompt Builder) → Gemini-3 (Coder) → File Written → Committed
```

### Two-Model Approach

Stage 7 uses two models in sequence:

**1. GPT-5 Mini (Prompt Builder)**:
- Reads file path, purpose, docs excerpt, schema excerpt
- Builds a detailed, file-specific prompt for Gemini
- Includes coding rules and context

**2. Gemini-3 (Main Coder)**:
- Receives the built prompt
- Generates complete code for the specific file
- Returns only the file content (no extra text)

### Implementation

```javascript
async handleCodeGenerationStage(context) {
  const validatedStructure = await this.artifactStorage.getArtifact(
    context.projectId,
    'specs/validated_structure.json'
  );
  
  const docs = await this.artifactStorage.getArtifact(
    context.projectId,
    'docs/docs.md'
  );
  
  const schema = await this.artifactStorage.getArtifact(
    context.projectId,
    'specs/schema.json'
  );
  
  // Flatten structure to file list
  const files = this.flattenStructureToList(validatedStructure);
  
  // Process files with controlled concurrency (2 at a time)
  const queue = new PQueue({ concurrency: 2 });
  
  for (const file of files) {
    queue.add(async () => {
      // Step 1: Build prompt with GPT-5 Mini
      const promptBuilderPrompt = this.promptTemplates.getTemplate('prompt-builder', {
        file_path: file.path,
        file_purpose: file.description,
        docs_excerpt: this.extractDocsExcerpt(docs, file.path),
        schema_excerpt: this.extractSchemaExcerpt(schema, file.path)
      });
      
      const promptResponse = await this.stageRouter.callStageModel(
        7, 
        promptBuilderPrompt,
        { model: 'gpt-5-mini' }
      );
      
      // Step 2: Generate code with Gemini-3
      const codeResponse = await this.stageRouter.callStageModel(
        7,
        promptResponse.content,
        { model: 'gemini-3-pro' }
      );
      
      // Step 3: Write file
      const fullPath = path.join(context.workDir, file.path);
      await fs.writeFile(fullPath, codeResponse.content);
      
      // Step 4: Commit file
      await this.commitFile(context.projectId, file.path, codeResponse.content);
    });
  }
  
  await queue.onIdle();
  
  return {
    success: true,
    artifacts: { generated_code_files: files.length }
  };
}
```

### Code Parser

The CodeParser extracts code from LLM responses:

```javascript
class CodeParser {
  parseCodeResponse(response) {
    const files = [];
    const codeBlockRegex = /```(?:filename:)?([^\n]+)\n([\s\S]*?)```/g;
    
    let match;
    while ((match = codeBlockRegex.exec(response)) !== null) {
      const [, filename, content] = match;
      files.push({
        path: filename.trim(),
        content: content.trim()
      });
    }
    
    return files;
  }
}
```

### Template Engine

For common patterns, use templates instead of LLM calls:

```javascript
class TemplateEngine {
  constructor() {
    this.templates = new Map();
    this.loadTemplates();
  }

  loadTemplates() {
    this.templates.set('express-app', {
      files: [
        {
          path: 'server/app.js',
          content: `
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());

{{#if features.auth}}
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);
{{/if}}

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

const PORT = process.env.PORT || {{port}};
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});

module.exports = app;
`
        }
      ]
    });
  }

  render(templateId, variables) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    return template.files.map(file => ({
      path: this.renderString(file.path, variables),
      content: this.renderString(file.content, variables)
    }));
  }

  renderString(str, variables) {
    // Simple template rendering
    return str.replace(/{{(\w+)}}/g, (match, key) => {
      return variables[key] || match;
    });
  }
}
```

### Best Practices

1. **Use templates for common patterns**: Faster and cheaper
2. **Validate generated code**: Run linters and syntax checkers
3. **Include error handling**: Always generate error handling code
4. **Add comments**: Generate well-documented code
5. **Follow conventions**: Use language-specific best practices
6. **Test generated code**: Run tests immediately after generation

---

## Self-Fix Loop Implementation

### Architecture

```
Test Failure → Error Analysis → Fix Generation → Patch Application → Re-test
     ↓              ↓                ↓                 ↓              ↓
  Iteration 1   Iteration 2      Iteration 3      Iteration 4   Iteration 5
                                                                      ↓
                                                                  Escalate
```

### Implementation Details

```javascript
class SelfFixLoop {
  constructor(options = {}) {
    this.maxIterations = options.maxIterations || 5;
    this.modelRouter = options.modelRouter;
    this.promptBuilder = new PromptBuilder();
    this.codeParser = new CodeParser();
    this.fixHistory = new Map();
  }

  async startFixLoop(jobId, testFailure, codeContext) {
    for (let i = 1; i <= this.maxIterations; i++) {
      // Generate fix
      const fix = await this.generateFix(testFailure, codeContext, i);
      
      // Apply patch
      const applyResult = await this.applyPatch(fix.patch, codeContext);
      if (!applyResult.success) continue;
      
      // Re-run tests
      const testResult = await this.runTests(codeContext);
      if (testResult.success) {
        return { success: true, iteration: i };
      }
      
      // Update failure context
      testFailure = this.analyzeTestFailure(testResult);
    }
    
    // Escalate after max iterations
    await this.escalateToHuman(jobId, fixSession);
    return { success: false, escalated: true };
  }
}
```

### Error Analysis

The system analyzes test failures to extract relevant information:

```javascript
analyzeTestFailure(testResult) {
  const output = testResult.output;
  
  // Extract error message
  const errorMatch = output.match(/Error: (.+)/);
  const errorMessage = errorMatch ? errorMatch[1] : 'Unknown error';
  
  // Extract stack trace
  const stackMatch = output.match(/at (.+:\d+:\d+)/g);
  const stack = stackMatch ? stackMatch.join('\n') : '';
  
  // Extract failed test name
  const testMatch = output.match(/✗ (.+)/);
  const testName = testMatch ? testMatch[1] : 'Unknown test';
  
  return {
    error: {
      message: errorMessage,
      stack: stack
    },
    testName: testName,
    output: output
  };
}
```

### Patch Generation

Patches are generated using the Debugger agent:

```javascript
async generateFix(testFailure, codeContext, iteration) {
  const prompt = this.promptBuilder.buildDebugPrompt(
    testFailure.error,
    codeContext.files,
    testFailure.output
  );
  
  const response = await this.modelRouter.routeTask({
    role: 'debugger',
    complexity: 'high',
    prompt: prompt,
    fallback: true
  }, {
    iteration: iteration,
    jobId: codeContext.jobId
  });
  
  const patch = this.codeParser.parsePatch(response.content);
  
  return {
    patch: patch,
    reasoning: response.metadata?.reasoning || '',
    model: response.model,
    cost: response.cost
  };
}
```

### Patch Application

Patches are applied using git:

```javascript
async applyPatch(patch, codeContext) {
  try {
    const patchFile = `/tmp/fix-${Date.now()}.patch`;
    await fs.writeFile(patchFile, patch);
    
    const result = await exec(`git apply ${patchFile}`, {
      cwd: codeContext.workDir
    });
    
    return { success: true, output: result.stdout };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

---

## Testing Strategy

### Unit Tests

Test individual components in isolation:

```javascript
// server/test/services/model-router.test.js
describe('ModelRouter', () => {
  it('should select optimal provider for role', () => {
    const provider = router.getOptimalModel('coder', 'high');
    expect(provider).toBeTruthy();
    expect(provider.supportsRole('coder')).toBe(true);
  });

  it('should handle fallback on provider failure', async () => {
    // Mock primary provider failure
    const response = await router.routeTask({
      role: 'coder',
      prompt: 'test',
      fallback: true
    });
    
    expect(response.success).toBe(true);
  });
});
```

### Integration Tests

Test component interactions:

```javascript
// server/test/integration/code-generation.test.js
describe('Code Generation Integration', () => {
  it('should generate code end-to-end', async () => {
    const specJson = { projectName: 'Test', stack: { backend: 'express' } };
    const { tasks } = await planner.decomposeSpec(specJson);
    const result = await generator.generateCode(tasks[0], specJson);
    
    expect(result.success).toBe(true);
    expect(result.files.length).toBeGreaterThan(0);
  });
});
```

### Property-Based Tests

Test universal properties:

```javascript
const fc = require('fast-check');

describe('ModelRouter Properties', () => {
  it('should always return a response for valid roles', () => {
    fc.assert(
      fc.asyncProperty(
        fc.constantFrom('coder', 'planner', 'debugger'),
        fc.string(),
        async (role, prompt) => {
          const response = await router.routeTask({ role, prompt });
          return response !== null && response !== undefined;
        }
      )
    );
  });
});
```

---

## Performance Optimization

### Caching

Implement response caching for identical prompts:

```javascript
class CachedModelRouter extends ModelRouter {
  constructor() {
    super();
    this.cache = new Map();
    this.cacheTTL = 3600000; // 1 hour
  }

  async routeTask(task, context) {
    const cacheKey = this.getCacheKey(task);
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.response;
    }
    
    const response = await super.routeTask(task, context);
    
    this.cache.set(cacheKey, {
      response: response,
      timestamp: Date.now()
    });
    
    return response;
  }

  getCacheKey(task) {
    return `${task.role}:${task.complexity}:${hash(task.prompt)}`;
  }
}
```

### Connection Pooling

Reuse HTTP connections:

```javascript
const axios = require('axios');
const http = require('http');
const https = require('https');

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50
});

const client = axios.create({
  httpAgent: httpAgent,
  httpsAgent: httpsAgent
});
```

### Batch Processing

Process multiple tasks in parallel:

```javascript
async function generateCodeBatch(tasks, specJson) {
  const results = await Promise.all(
    tasks.map(task => generator.generateCode(task, specJson))
  );
  return results;
}
```

---

## Security Considerations

### API Key Management

1. **Never commit API keys**: Use environment variables
2. **Rotate keys regularly**: Implement key rotation
3. **Use secrets manager**: Store keys in AWS Secrets Manager
4. **Limit key permissions**: Use least privilege principle

### Input Validation

Validate all inputs before processing:

```javascript
function validateTask(task) {
  if (!task.role || !AGENT_ROLES[task.role.toUpperCase()]) {
    throw new Error('Invalid role');
  }
  
  if (!task.prompt || task.prompt.length > 100000) {
    throw new Error('Invalid prompt');
  }
  
  if (task.complexity && !['low', 'medium', 'high'].includes(task.complexity)) {
    throw new Error('Invalid complexity');
  }
}
```

### Rate Limiting

Implement rate limiting per user:

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 60, // 60 requests per minute
  keyGenerator: (req) => req.user.id
});

app.use('/api/llm', limiter);
```

### Cost Controls

Prevent runaway costs:

```javascript
async function checkCostLimit(userId, estimatedCost) {
  const userCost = await getUserTotalCost(userId);
  const limit = config.getValue('cost.maxCostPerUser');
  
  if (userCost + estimatedCost > limit) {
    throw new Error('Cost limit exceeded');
  }
}
```

---

## Deployment Guide

### Environment Setup

1. **Development**:
   ```bash
   NODE_ENV=development
   MODEL_ROUTER_DEMO_MODE=auto
   ```

2. **Production**:
   ```bash
   NODE_ENV=production
   MODEL_ROUTER_DEMO_MODE=disabled
   OPENROUTER_API_KEY=sk-or-...
   DEEPSEEK_API_KEY=sk-...
   ```

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "app.js"]
```

### Monitoring

Set up monitoring for:
- LLM call success rate
- Average latency
- Cost per job
- Provider health
- Error rates

---

## Contributing Guidelines

### Code Style

Follow these conventions:
- Use ESLint configuration
- Write JSDoc comments
- Use async/await (not callbacks)
- Handle errors explicitly
- Write tests for new features

### Pull Request Process

1. Create feature branch
2. Write tests
3. Update documentation
4. Submit PR with description
5. Address review comments
6. Merge after approval

### Testing Requirements

All PRs must include:
- Unit tests (>80% coverage)
- Integration tests
- Documentation updates
- Changelog entry

---

## Additional Resources

- [API Documentation](../api/README.md)
- [User Guide](../user/README.md)
- [Troubleshooting Guide](../api/README.md#troubleshooting)
- [GitHub Repository](https://github.com/your-org/ai-app-builder)

---

## Support

For developer support:
- Slack: #ai-integration-dev
- Email: dev-support@example.com
- GitHub Issues: https://github.com/your-org/ai-app-builder/issues
