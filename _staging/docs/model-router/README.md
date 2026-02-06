# Enhanced Model Router Documentation

This directory contains comprehensive documentation for the Enhanced Model Router system.

## Documentation Structure

### API Documentation
- **[Model Router API](../api/model-router-api.md)** - Complete API reference with endpoints, methods, and examples
- **[REST Endpoints](../api/model-router-api.md#rest-endpoints)** - HTTP API documentation

### Developer Guides
- **[Developer Guide](../developer/model-router-guide.md)** - Architecture, provider integration, and development setup
- **[Configuration Guide](../developer/model-router-guide.md#configuration-management)** - Configuration management and environment setup

### Examples and Tutorials
- **[Usage Examples](../examples/model-router-examples.md)** - Comprehensive examples for all router features
- **[Integration Patterns](../examples/model-router-examples.md#integration-patterns)** - Express.js, WebSocket, and other integrations

## Quick Start

### Basic Usage

```javascript
const { ModelRouter } = require('./services/model-router');

// Initialize router
const router = new ModelRouter();
await router.initialize();

// Make a call by role
const response = await router.callByRole('clarifier', [
  { role: 'user', content: 'Explain quantum computing' }
]);

console.log(response.content);
```

### Streaming Responses

```javascript
for await (const chunk of router.stream('code-generator', messages)) {
  if (chunk.content) {
    process.stdout.write(chunk.content);
  }
  if (chunk.done) break;
}
```

## Key Features

- **Multi-Provider Support**: HuggingFace, Zukijourney, GitHub Models, DeepSeek, Anthropic, Gemini
- **Role-Based Routing**: Intelligent model selection based on task requirements
- **Cost & Token Tracking**: Comprehensive usage monitoring and cost control
- **Response Caching**: Automatic caching with configurable TTL
- **Health Monitoring**: Real-time provider health checks and failover
- **Streaming Support**: Real-time response streaming for long-running tasks
- **Rate Limiting**: Per-provider rate limiting with queue management
- **Error Handling**: Robust error handling with retry logic and fallbacks

## Architecture Overview

```
Application Layer
        ↓
  Model Router
        ↓
┌───────┴───────┬───────┬───────┬───────┬───────┬───────┐
│               │       │       │       │       │       │
HuggingFace  Zukijourney GitHub DeepSeek Anthropic Gemini
Provider     Provider   Models  Provider Provider Provider
```

## Provider Mappings

| Role | Primary Provider | Model | Fallback |
|------|------------------|-------|----------|
| clarifier | HuggingFace | OpenHermes-2.5-Mistral-7B | Qwen2-7B-Instruct |
| normalizer | Zukijourney | GPT-5 Mini | - |
| docs-creator | GitHub Models | Llama 4 Scout 17B | - |
| schema-generator | DeepSeek | DeepSeek-V3 | - |
| validator | Anthropic | Claude 3.5 Haiku | - |
| code-generator | Gemini | Gemini-3 Pro | - |
| prompt-builder | Zukijourney | GPT-5 Mini | - |
| file-structure-generator | Zukijourney | GPT-4o | - |

## Configuration

### Environment Variables

```bash
# Provider API Keys
HUGGINGFACE_API_KEY=your_key_here
ZUKI_API_KEY=your_key_here
GITHUB_TOKEN=your_token_here
DEEPSEEK_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here

# Optional Providers
OPENROUTER_API_KEY=your_key_here
SCALEWAY_API_KEY=your_key_here
MISTRAL_API_KEY=your_key_here
```

### Basic Configuration

```javascript
const config = {
  cost: {
    maxCostPerCall: 1.0,
    maxCostPerJob: 10.0
  },
  cache: {
    enabled: true,
    ttl: 3600000 // 1 hour
  },
  timeouts: {
    low: 15000,
    medium: 30000,
    high: 60000
  }
};
```

## Monitoring and Observability

### Metrics

```javascript
const metrics = router.getMetrics();
console.log(`Success rate: ${metrics.summary.successRate}`);
console.log(`Total cost: $${metrics.summary.totalCost}`);
console.log(`Average latency: ${metrics.summary.averageLatency}ms`);
```

### Health Checks

```javascript
const health = router.getProviderHealth();
for (const [provider, status] of Object.entries(health)) {
  console.log(`${provider}: ${status.healthy ? 'Healthy' : 'Unhealthy'}`);
}
```

### Cost Tracking

```javascript
const costs = router.getCosts({ groupBy: 'provider' });
console.log('Cost breakdown:', costs.breakdown);
```

## Error Handling

The router provides structured error handling with specific error types:

- `ProviderError` - General provider failures
- `RateLimitError` - Rate limit exceeded
- `AuthenticationError` - Invalid API keys
- `ProviderUnavailableError` - All providers failed
- `TimeoutError` - Request timeout

```javascript
try {
  const response = await router.callByRole('clarifier', messages);
} catch (error) {
  switch (error.name) {
    case 'RateLimitError':
      await new Promise(resolve => setTimeout(resolve, error.retryAfter * 1000));
      // Retry logic
      break;
    case 'AuthenticationError':
      console.error('Check API keys');
      break;
    default:
      console.error('Unexpected error:', error.message);
  }
}
```

## Performance Optimization

### Connection Pooling
- HTTP keep-alive connections
- Per-provider connection limits
- Connection reuse

### Caching
- SHA-256 based cache keys
- Configurable TTL
- Pattern-based invalidation

### Rate Limiting
- Token bucket algorithm
- Per-provider limits
- Queue management

## Security

### API Key Security
- Environment variable storage only
- Never logged or exposed
- HTTPS-only communication

### Input Validation
- Request parameter validation
- Input sanitization
- Size limits

### Authentication
- JWT token validation
- Request signing for internal calls
- OAuth 2.0 support

## Support

For additional help:

1. **API Reference**: See [Model Router API](../api/model-router-api.md)
2. **Developer Guide**: See [Developer Guide](../developer/model-router-guide.md)
3. **Examples**: See [Usage Examples](../examples/model-router-examples.md)
4. **Troubleshooting**: Check the troubleshooting sections in the developer guide

## Contributing

See the [Developer Guide](../developer/model-router-guide.md#contributing) for information on:
- Development setup
- Testing requirements
- Code style guidelines
- Pull request process

---

**Version**: 1.0.0  
**Last Updated**: January 2025  
**Status**: Production Ready