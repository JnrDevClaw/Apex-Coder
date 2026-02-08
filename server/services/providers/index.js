/**
 * LLM Providers Index
 * Exports all available LLM providers for the ModelRouter
 */

// All Providers (CommonJS)
const HuggingFaceProvider = require('./huggingface-provider');
const BaseProvider = require('./base-provider');
const OpenRouterProvider = require('./openrouter');
const HuggingFaceProviderLegacy = require('./huggingface');
const DeepSeekProvider = require('./deepseek-provider');
const ElectronHubProvider = require('./electronhub-provider');
const GeminiProvider = require('./gemini');
const GitHubModelsProvider = require('./github-models-provider');
const DemoProvider = require('./demo');
const AnthropicProvider = require('./anthropic');
const ScalewayProvider = require('./scaleway');
const MistralProvider = require('./mistral');
const { StarCoder2Provider, CodeGenProvider } = require('./code-models');
const { GPTJProvider, GLMProvider } = require('./lightweight-models');

// Export all providers
module.exports = {
  BaseProvider,
  HuggingFaceProvider,
  OpenRouterProvider,
  HuggingFaceProviderLegacy,
  DeepSeekProvider,
  ElectronHubProvider,
  GeminiProvider,
  GitHubModelsProvider,
  DemoProvider,
  AnthropicProvider,
  ScalewayProvider,
  MistralProvider,
  StarCoder2Provider,
  CodeGenProvider,
  GPTJProvider,
  GLMProvider
};