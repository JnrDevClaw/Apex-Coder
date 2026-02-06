# Model Router Infrastructure

This directory contains the core infrastructure for the Enhanced Model Router.

## Completed Components

### 1. Base Provider Class (`providers/base-provider.js`)

The `BaseProvider` class serves as the abstract base for all AI provider implementations. It provides:

- **Configuration Management**: Handles API keys, base URLs, pricing, timeouts, and retry settings
- **Rate Limiting**: Integrates Bottleneck for per-provider rate limiting
- **Cost Calculation**: Calculates costs based on token usage and provider pricing
- **Error Handling**: Identifies retryable errors (429, 500, 502, 503, 504, timeouts)
- **Abstract Methods**: `call()` and `stream()` must be implemented by subclasses
- **Utility Methods**: Token estimation, message formatting, response parsing

**Usage:**
```javascript
import BaseProvider from './base-provider.js';

class MyProvider extends BaseProvider {
  async call(model, messages, options = {}) {
    // Implement provider-specific API call
  }
  
  async *stream(model, messages, options = {}) {
    // Implement provider-specific streaming
  }
}
```

### 2. Retry Handler Utility (`utils/retry-handler.js`)

Provides robust retry logic with exponential backoff for handling transient failures.

**Features:**
- Configurable retry attempts (default: 2 retries)
- Exponential backoff delays (0ms, 500ms, 1500ms)
- Smart error detection (retryable vs non-retryable)
- Detailed logging of retry attempts
- Callback support for custom retry logic

**Retryable Errors:**
- HTTP Status Codes: 429, 500, 502, 503, 504
- Error Codes: ETIMEDOUT, ECONNRESET, ENOTFOUND, ECONNREFUSED

**Non-Retryable Errors:**
- HTTP Status Codes: 400, 401, 403, 404

**Usage:**
```javascript
import { callWithRetry } from './retry-handler.js';

const result = await callWithRetry(
  async () => {
    // Your API call here
    return await fetch('https://api.example.com');
  },
  {
    maxRetries: 2,
    delays: [0, 500, 1500],
    logger: console
  }
);
```

### 3. Rate Limiter Factory (`model-router/rate-limiter-factory.js`)

Creates and manages Bottleneck rate limiters for AI providers with comprehensive monitoring.

**Features:**
- Per-provider rate limiting with token bucket algorithm
- Configurable concurrent requests, minimum time between requests
- Reservoir-based rate limiting with automatic refresh
- Built-in monitoring and event logging
- Preset configurations (conservative, moderate, aggressive)
- Group management for multiple providers

**Configuration Options:**
- `maxConcurrent`: Maximum concurrent requests (default: 5)
- `minTime`: Minimum time between requests in ms (default: 200)
- `reservoir`: Initial token bucket size (default: 100)
- `reservoirRefreshAmount`: Tokens to add on refresh (default: 100)
- `reservoirRefreshInterval`: Refresh interval in ms (default: 60000)

**Usage:**
```javascript
import { createRateLimiter, createRateLimiterGroup } from './rate-limiter-factory.js';

// Single limiter
const limiter = createRateLimiter({
  maxConcurrent: 5,
  minTime: 200,
  id: 'huggingface'
});

// Group of limiters
const group = createRateLimiterGroup({
  huggingface: { maxConcurrent: 5, minTime: 200 },
  anthropic: { maxConcurrent: 3, minTime: 300 }
});

// Use limiter
await limiter.schedule(() => makeApiCall());
```

## Requirements Satisfied

- **1.1**: Unified provider interface with consistent method signatures ✓
- **1.2**: Standardized response format with content, tokens, and cost ✓
- **1.4**: Base provider interface for easy provider addition ✓
- **4.1**: Bottleneck-based per-provider rate limiting ✓
- **4.2**: Request queuing within allowed limits ✓
- **5.1**: Automatic retries with exponential backoff (0ms, 500ms, 1500ms) ✓
- **5.2**: Retry on 429 Rate Limit Exceeded ✓
- **5.3**: Retry on 500 Internal Server Error ✓
- **5.4**: Retry on 503 Service Unavailable ✓
- **5.5**: No retry on 400 Bad Request ✓
- **5.6**: No retry on 401 Unauthorized ✓
- **5.7**: Return last error when retries exhausted ✓

## Next Steps

The following tasks are ready to be implemented:

1. **Provider Registry** (Task 2): Create provider registry service to manage provider instances
2. **Provider Implementations** (Tasks 3-11): Implement specific provider clients (HuggingFace, Zukijourney, GitHub Models, etc.)
3. **Model Router Service** (Task 12): Create main router service with role-based routing
4. **Cost & Token Tracking** (Tasks 13-14): Implement cost and token tracking services
5. **Metrics & Monitoring** (Tasks 15-16): Add comprehensive observability

## Testing

To test the base infrastructure:

```javascript
// Test base provider
import BaseProvider from './providers/base-provider.js';

const provider = new BaseProvider({
  name: 'test',
  apiKey: 'test-key',
  baseURL: 'https://api.test.com',
  rateLimit: { maxConcurrent: 5 }
});

// Test retry handler
import { callWithRetry } from './utils/retry-handler.js';

await callWithRetry(async () => {
  // Simulated API call
}, { maxRetries: 2 });

// Test rate limiter
import { createRateLimiter } from './model-router/rate-limiter-factory.js';

const limiter = createRateLimiter({ id: 'test' });
await limiter.schedule(() => console.log('Rate limited call'));
```

## Architecture

```
server/
├── services/
│   ├── providers/
│   │   ├── base-provider.js          ← Base class for all providers
│   │   └── [provider-specific].js    ← To be implemented
│   └── model-router/
│       ├── rate-limiter-factory.js   ← Rate limiting utilities
│       ├── rate-limiter-example.js   ← Usage examples
│       └── README.md                 ← This file
└── utils/
    └── retry-handler.js              ← Retry logic with backoff
```


### 4. Provider Registry (`provider-registry.js`)

Manages provider instances for the Model Router. Provides methods to register, retrieve, and list AI providers.

**Features:**
- Singleton pattern for global provider management
- Provider validation on registration
- Safe provider retrieval with error handling
- Provider listing and counting
- Support for provider hot-reloading (unregister/clear)

**Key Methods:**
- `registerProvider(name, providerInstance)` - Register a new provider
- `getProvider(name)` - Get a provider by name (throws if not found)
- `listProviders()` - List all registered provider names
- `hasProvider(name)` - Check if a provider is registered
- `getProviderCount()` - Get count of registered providers
- `unregisterProvider(name)` - Remove a provider (useful for testing)
- `clear()` - Clear all registered providers

**Usage:**
```javascript
const providerRegistry = require('./provider-registry.js');
const HuggingFaceProvider = require('../providers/huggingface-provider.js');

// Register a provider
const hfProvider = new HuggingFaceProvider(config);
providerRegistry.registerProvider('huggingface', hfProvider);

// Get a provider
const provider = providerRegistry.getProvider('huggingface');

// List all providers
const providers = providerRegistry.listProviders();
console.log('Available providers:', providers);
```

### 5. Configuration Management (`../../config/model-router-config.js`)

Centralized configuration management for all providers, role mappings, and pricing information.

**Features:**
- Environment-based configuration (development, test, production)
- Provider configurations (API keys, base URLs, rate limits, pricing)
- Role-to-model mappings with primary and fallback options
- Runtime configuration updates with validation
- Configuration change listeners
- API key security (loaded from environment, never logged)
- Configuration export (with optional secret redaction)

**Provider Configuration Structure:**
```javascript
{
  name: 'provider-name',
  enabled: true,
  baseURL: 'https://api.provider.com',
  models: {
    'role-name': 'model-identifier'
  },
  rateLimit: {
    maxConcurrent: 10,
    minTime: 100,
    reservoir: 200,
    reservoirRefreshAmount: 200,
    reservoirRefreshInterval: 60000
  },
  pricing: {
    'model-name': {
      input: 0.001,   // per 1M tokens
      output: 0.002   // per 1M tokens
    }
  },
  timeout: 30000,
  retries: 2
}
```

**Role Mapping Structure:**
```javascript
{
  'role-name': {
    primary: { provider: 'provider-name', model: 'model-name' },
    fallback: { provider: 'fallback-provider', model: 'fallback-model' }
  }
}
```

**Key Methods:**
- `initialize()` - Initialize configuration from environment
- `get()` - Get full configuration object
- `getValue(path)` - Get specific value using dot notation
- `update(path, value)` - Update configuration at runtime
- `getRoleMapping(role)` - Get provider/model mapping for a role
- `getModelPricing(provider, model)` - Get pricing information
- `getProviderConfig(provider)` - Get full provider configuration
- `getProviderBaseURL(provider)` - Get provider base URL
- `getProviderApiKey(provider)` - Get provider API key
- `getProviderRateLimit(provider)` - Get rate limit configuration
- `isProviderEnabled(provider)` - Check if provider is enabled
- `setProviderEnabled(provider, enabled)` - Enable/disable provider
- `getEnabledProviders()` - Get list of enabled providers
- `onChange(callback)` - Register configuration change listener
- `export(includeSecrets)` - Export configuration as JSON

**Usage:**
```javascript
const config = require('../../config/model-router-config.js');

// Initialize
config.initialize();

// Get role mapping
const mapping = config.getRoleMapping('clarifier');
// { primary: { provider: 'huggingface', model: 'OpenHermes-2.5-Mistral-7B' }, ... }

// Get pricing
const pricing = config.getModelPricing('huggingface', 'OpenHermes-2.5-Mistral-7B');
// { input: 0.0001, output: 0.0002 }

// Get rate limits
const rateLimit = config.getProviderRateLimit('anthropic');

// Update configuration
config.update('cost.maxCostPerCall', 2.0);

// Listen for changes
config.onChange((path, newValue, oldValue) => {
  console.log(`Config changed: ${path} = ${newValue}`);
});
```

**Supported Providers:**
1. **HuggingFace** - Clarifier role (OpenHermes-2.5-Mistral-7B, Qwen2-7B-Instruct)
2. **Zukijourney** - Normalizer, prompt-builder (gpt-5-mini), file-structure-generator (gpt-4o)
3. **GitHub Models** - Docs-creator (Llama-4-Scout-17B-16E-Instruct)
4. **DeepSeek** - Schema-generator (deepseek-v3)
5. **Anthropic** - Validator (claude-3-5-haiku-20241022)
6. **Gemini** - Code-generator (gemini-3-pro)
7. **OpenRouter** - Optional, multi-model support
8. **Scaleway** - Optional
9. **Mistral** - Optional

**Environment Variables:**
Required environment variables for API keys:
- `HUGGINGFACE_API_KEY`
- `ZUKIJOURNEY_API_KEY` or `ZUKI_API_KEY`
- `GITHUB_TOKEN`
- `DEEPSEEK_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `OPENROUTER_API_KEY` (optional)
- `SCALEWAY_API_KEY` (optional)
- `MISTRAL_API_KEY` (optional)

### 6. Integration Example (`integration-example.js`)

Complete example demonstrating how to use the provider registry with configuration.

**Run the example:**
```bash
node server/services/model-router/integration-example.js
```

**Output:**
```
✅ Configuration validation passed
✅ ModelRouter configuration initialized for development environment
🚀 Initializing Model Router...
📋 Found 7 enabled providers: huggingface, zukijourney, github-models, deepseek, anthropic, gemini, demo
📊 Configuration Summary:
- Enabled Providers: huggingface, zukijourney, github-models, deepseek, anthropic, gemini, demo
- Role Mappings: clarifier, normalizer, docs-creator, schema-generator, validator, code-generator, prompt-builder, file-structure-generator
🎯 Clarifier Role Mapping:
  Primary: huggingface / OpenHermes-2.5-Mistral-7B
  Fallback: huggingface / Qwen/Qwen2-7B-Instruct
💰 HuggingFace Pricing (per 1M tokens):
  Input: $0.0001
  Output: $0.0002
⏱️  Anthropic Rate Limits:
  Max Concurrent: 10
  Min Time: 100ms
  Reservoir: 200 requests
✅ Model Router initialized successfully!
```

## Updated Requirements Satisfied

- **1.4**: Base provider interface for easy provider addition ✓
- **10.1**: Centralized configuration management ✓
- **10.2**: Environment-specific overrides ✓
- **10.3**: API key validation on startup ✓
- **10.4**: Enable/disable providers without code changes ✓
- **10.5**: Model-to-provider mappings for each agent role ✓

## Updated Architecture

```
server/
├── config/
│   └── model-router-config.js        ← Centralized configuration
├── services/
│   ├── providers/
│   │   ├── base-provider.js          ← Base class for all providers
│   │   └── [provider-specific].js    ← To be implemented
│   └── model-router/
│       ├── provider-registry.js      ← Provider instance management
│       ├── rate-limiter-factory.js   ← Rate limiting utilities
│       ├── rate-limiter-example.js   ← Usage examples
│       ├── integration-example.js    ← Integration example
│       └── README.md                 ← This file
└── utils/
    └── retry-handler.js              ← Retry logic with backoff
```
