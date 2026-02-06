/**
 * DeepSeek Provider via ElectronHub Tests
 * 
 * Tests for DeepSeek provider using ElectronHub API
 * Rate limit: 5 requests per minute
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const DeepSeekProvider = require('../../services/providers/deepseek-provider.js');

describe('DeepSeek Provider via ElectronHub', () => {
  let provider;

  before(() => {
    provider = new DeepSeekProvider({
      name: 'deepseek-electronhub',
      apiKey: process.env.ELECTRON_HUB_KEY,
      timeout: 30000,
      retries: 2
    });
  });

  describe('Configuration', () => {
    it('should use ElectronHub base URL', () => {
      assert.strictEqual(provider.baseURL, 'https://api.electronhub.top/v1');
    });

    it('should have rate limit configuration', () => {
      assert.ok(provider.rateLimit);
      assert.strictEqual(provider.rateLimit.maxRequests, 5);
      assert.strictEqual(provider.rateLimit.windowMs, 60000);
    });

    it('should support deepseek-v3 model', () => {
      const config = provider.getModelConfig('deepseek-v3');
      assert.ok(config);
      assert.strictEqual(config.defaultTemperature, 0.7);
    });
  });

  describe('Rate Limiting', () => {
    it('should track requests', async () => {
      const initialCount = provider.rateLimit.requests.length;
      await provider.checkRateLimit();
      assert.strictEqual(provider.rateLimit.requests.length, initialCount + 1);
    });

    it('should throw error when rate limit exceeded', async () => {
      // Fill up the rate limit
      provider.rateLimit.requests = Array(5).fill(Date.now());
      
      await assert.rejects(
        async () => await provider.checkRateLimit(),
        {
          message: /Rate limit exceeded/
        }
      );

      // Reset for other tests
      provider.rateLimit.requests = [];
    });

    it('should clean up old requests', async () => {
      // Add old requests (outside window)
      const oldTime = Date.now() - 70000; // 70 seconds ago
      provider.rateLimit.requests = [oldTime, oldTime, oldTime];
      
      await provider.checkRateLimit();
      
      // Old requests should be removed, only new one remains
      assert.strictEqual(provider.rateLimit.requests.length, 1);
    });
  });

  describe('Message Formatting', () => {
    it('should format messages correctly', () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' }
      ];

      const formatted = provider.formatMessages(messages);
      assert.strictEqual(formatted.length, 2);
      assert.strictEqual(formatted[0].role, 'system');
      assert.strictEqual(formatted[1].role, 'user');
    });

    it('should reject invalid messages', () => {
      assert.throws(
        () => provider.formatMessages([]),
        { message: /non-empty array/ }
      );

      assert.throws(
        () => provider.formatMessages([{ role: 'user' }]),
        { message: /role and content/ }
      );

      assert.throws(
        () => provider.formatMessages([{ role: 'invalid', content: 'test' }]),
        { message: /Invalid message role/ }
      );
    });
  });

  describe('API Integration', { skip: !process.env.ELECTRON_HUB_KEY }, () => {
    it('should make successful API call', async () => {
      const messages = [
        { role: 'user', content: 'Say "Hello World" and nothing else.' }
      ];

      const response = await provider.call('deepseek-chat', messages, {
        temperature: 0.1,
        maxTokens: 50
      });

      assert.ok(response);
      assert.ok(response.content);
      assert.ok(response.tokens);
      assert.strictEqual(response.provider, 'deepseek-electronhub');
      assert.strictEqual(response.model, 'deepseek-chat');
      assert.ok(response.metadata.rateLimitRemaining !== undefined);
    });

    it('should handle schema generation task', async () => {
      const messages = [
        { 
          role: 'system', 
          content: 'You are a database schema designer. Output valid JSON only.' 
        },
        { 
          role: 'user', 
          content: 'Create a simple user schema with id, name, and email fields. Return only JSON.' 
        }
      ];

      const response = await provider.call('deepseek-chat', messages, {
        temperature: 0.3,
        maxTokens: 500
      });

      assert.ok(response);
      assert.ok(response.content);
      assert.ok(response.content.includes('id') || response.content.includes('name'));
    });

    it('should respect rate limiting in sequential calls', async () => {
      const messages = [{ role: 'user', content: 'Hi' }];
      
      // Make 5 calls (should succeed)
      for (let i = 0; i < 5; i++) {
        const response = await provider.call('deepseek-chat', messages, {
          maxTokens: 10
        });
        assert.ok(response);
      }

      // 6th call should fail with rate limit error
      await assert.rejects(
        async () => await provider.call('deepseek-chat', messages, { maxTokens: 10 }),
        {
          message: /Rate limit exceeded/
        }
      );

      // Wait for rate limit to reset
      console.log('Waiting 60 seconds for rate limit reset...');
      await new Promise(resolve => setTimeout(resolve, 61000));
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid API key', async () => {
      const badProvider = new DeepSeekProvider({
        name: 'deepseek-bad',
        apiKey: 'invalid-key',
        timeout: 5000,
        retries: 0
      });

      const messages = [{ role: 'user', content: 'test' }];

      await assert.rejects(
        async () => await badProvider.call('deepseek-chat', messages),
        {
          message: /API error/
        }
      );
    });

    it('should handle network errors', async () => {
      const badProvider = new DeepSeekProvider({
        name: 'deepseek-bad',
        apiKey: 'test-key',
        timeout: 1, // Very short timeout
        retries: 0
      });
      badProvider.baseURL = 'https://invalid-url-that-does-not-exist.com';

      const messages = [{ role: 'user', content: 'test' }];

      await assert.rejects(
        async () => await badProvider.call('deepseek-chat', messages)
      );
    });
  });

  describe('Response Parsing', () => {
    it('should parse valid response', () => {
      const apiResponse = {
        choices: [
          {
            message: {
              content: 'Test response'
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15
        }
      };

      const parsed = provider.parseResponse(apiResponse, 'deepseek-chat');
      
      assert.strictEqual(parsed.content, 'Test response');
      assert.strictEqual(parsed.tokens.input, 10);
      assert.strictEqual(parsed.tokens.output, 5);
      assert.strictEqual(parsed.tokens.total, 15);
      assert.strictEqual(parsed.finishReason, 'stop');
    });

    it('should handle missing usage data', () => {
      const apiResponse = {
        choices: [
          {
            message: {
              content: 'Test response without usage'
            },
            finish_reason: 'stop'
          }
        ]
      };

      const parsed = provider.parseResponse(apiResponse, 'deepseek-chat');
      
      assert.ok(parsed.content);
      assert.ok(parsed.tokens.output > 0); // Should estimate tokens
    });
  });
});
