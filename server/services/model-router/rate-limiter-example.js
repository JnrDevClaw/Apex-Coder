/**
 * Rate Limiter Usage Examples
 * 
 * This file demonstrates how to use the rate limiter factory
 * for different AI providers.
 */

import { 
  createRateLimiter, 
  createRateLimiterGroup,
  getRateLimiterStatus,
  withRateLimit,
  createRateLimiterWithPreset
} from './rate-limiter-factory.js';

// Example 1: Create a single rate limiter for a provider
export function example1_singleLimiter() {
  const huggingFaceLimiter = createRateLimiter({
    maxConcurrent: 5,
    minTime: 200,
    reservoir: 100,
    reservoirRefreshAmount: 100,
    reservoirRefreshInterval: 60000,
    id: 'huggingface'
  });

  // Use the limiter to schedule a job
  huggingFaceLimiter.schedule(() => {
    console.log('Making API call to HuggingFace');
    // Your API call here
  });
}

// Example 2: Create a group of rate limiters (one per provider)
export function example2_limiterGroup() {
  const providersConfig = {
    huggingface: {
      maxConcurrent: 5,
      minTime: 200,
      reservoir: 100
    },
    anthropic: {
      maxConcurrent: 3,
      minTime: 300,
      reservoir: 50
    },
    openai: {
      maxConcurrent: 10,
      minTime: 100,
      reservoir: 200
    }
  };

  const limiterGroup = createRateLimiterGroup(providersConfig);

  // Get limiter for specific provider
  const hfLimiter = limiterGroup.key('huggingface');
  const anthropicLimiter = limiterGroup.key('anthropic');

  // Use provider-specific limiters
  hfLimiter.schedule(() => console.log('HuggingFace call'));
  anthropicLimiter.schedule(() => console.log('Anthropic call'));
}

// Example 3: Wrap a function with rate limiting
export function example3_wrapFunction() {
  const limiter = createRateLimiter({ id: 'api-calls' });

  async function makeApiCall(endpoint) {
    console.log(`Calling ${endpoint}`);
    // Your API logic here
    return { success: true };
  }

  // Create rate-limited version
  const rateLimitedApiCall = withRateLimit(makeApiCall, limiter);

  // Use it
  rateLimitedApiCall('/api/generate');
}

// Example 4: Monitor rate limiter status
export function example4_monitoring() {
  const limiter = createRateLimiter({ id: 'monitored' });

  // Schedule some jobs
  for (let i = 0; i < 10; i++) {
    limiter.schedule(() => {
      console.log(`Job ${i}`);
    });
  }

  // Check status
  const status = getRateLimiterStatus(limiter);
  console.log('Rate limiter status:', status);
  // Output: { queued: X, running: Y, executing: Z, done: A, failed: B }
}

// Example 5: Use presets for common configurations
export function example5_presets() {
  // Conservative: fewer concurrent requests, longer delays
  const conservativeLimiter = createRateLimiterWithPreset('conservative', 'slow-api');

  // Moderate: balanced settings (default)
  const moderateLimiter = createRateLimiterWithPreset('moderate', 'normal-api');

  // Aggressive: more concurrent requests, shorter delays
  const aggressiveLimiter = createRateLimiterWithPreset('aggressive', 'fast-api');

  // Use them
  conservativeLimiter.schedule(() => console.log('Slow API call'));
  moderateLimiter.schedule(() => console.log('Normal API call'));
  aggressiveLimiter.schedule(() => console.log('Fast API call'));
}

// Example 6: Real-world provider integration
export class RateLimitedProvider {
  constructor(providerName, config) {
    this.name = providerName;
    this.limiter = createRateLimiter({
      ...config,
      id: providerName
    });
  }

  async call(model, messages, options = {}) {
    // Schedule the API call through the rate limiter
    return this.limiter.schedule(
      { id: `${this.name}-${Date.now()}` },
      async () => {
        console.log(`Making call to ${this.name} with model ${model}`);
        // Your actual API call logic here
        return { content: 'Response', tokens: { input: 100, output: 50 } };
      }
    );
  }

  getStatus() {
    return getRateLimiterStatus(this.limiter);
  }
}

// Example usage of RateLimitedProvider
export async function example6_providerIntegration() {
  const provider = new RateLimitedProvider('huggingface', {
    maxConcurrent: 5,
    minTime: 200,
    reservoir: 100
  });

  // Make multiple calls - they'll be automatically rate limited
  const promises = [];
  for (let i = 0; i < 20; i++) {
    promises.push(provider.call('gpt-3.5-turbo', [{ role: 'user', content: 'Hello' }]));
  }

  const results = await Promise.all(promises);
  console.log(`Completed ${results.length} calls`);
  console.log('Final status:', provider.getStatus());
}
