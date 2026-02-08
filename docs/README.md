# AI Integration Documentation

Welcome to the AI Integration documentation hub. This directory contains comprehensive documentation for all aspects of the AI App Builder system.

## Documentation Structure

### 📚 For Users
**[User Guide](user/README.md)** - Complete guide for using the AI App Builder platform
- Getting started
- Questionnaire walkthrough
- Understanding the build process
- Deployment guide
- FAQ and troubleshooting

### 👨‍💻 For Developers
**[Developer Guide](developer/README.md)** - Technical documentation for developers
- Architecture overview
- ModelRouter implementation
- Provider integration guide
- Code generation system
- Self-fix loop details
- Testing strategies
- Performance optimization
- Security best practices

### 🔌 API Reference
**[API Documentation](api/README.md)** - Complete API reference
- ModelRouter API
- Task Planner API
- Code Generator API
- Self-Fix Loop API
- Configuration API
- Error handling
- Integration examples
- Troubleshooting guide

## Quick Links

### Getting Started
- [User Quick Start](user/README.md#getting-started)
- [Developer Setup](developer/README.md#architecture-overview)
- [API Overview](api/README.md#overview)

### Common Tasks
- [Creating a New Provider](developer/README.md#provider-integration-guide)
- [Configuring ModelRouter](api/README.md#configuration-api)
- [Monitoring Builds](user/README.md#monitoring-your-build)
- [Troubleshooting Errors](api/README.md#troubleshooting)

### Advanced Topics
- [Self-Fix Loop Implementation](developer/README.md#self-fix-loop-implementation)
- [Performance Optimization](developer/README.md#performance-optimization)
- [Security Considerations](developer/README.md#security-considerations)

## System Overview

The AI App Builder is an intelligent platform that transforms user ideas into fully functional applications using multiple AI models. The system consists of several key components:

### Core Components

1. **ModelRouter**: Routes AI tasks to optimal LLM providers with intelligent fallback
2. **Task Planner**: Decomposes project specifications into executable tasks
3. **Code Generator**: Generates actual code using LLMs and templates
4. **Self-Fix Loop**: Automatically debugs and fixes failing tests
5. **Job Queue**: Manages asynchronous task execution
6. **Worker Pool**: Executes code generation and testing jobs

### Architecture Diagram

```
┌─────────────────┐
│  Frontend UI    │
│  (Questionnaire)│
└────────┬────────┘
         │ Spec JSON
         ↓
┌─────────────────┐      ┌──────────────┐
│  Task Planner   │─────→│ ModelRouter  │
│  Service        │←─────│ (LLM Calls)  │
└────────┬────────┘      └──────┬───────┘
         │ Task List            │
         ↓                      │
┌─────────────────┐            │
│   Job Queue     │            │
│   (BullMQ)      │            │
└────────┬────────┘            │
         │ Jobs                │
         ↓                     │
┌─────────────────┐            │
│  Job Executor   │────────────┘
│  (Workers)      │     LLM Calls
└────────┬────────┘
         │ Code Files
         ↓
┌─────────────────┐
│  Test Runner    │
└────────┬────────┘
         │ Test Results
         ↓
┌─────────────────┐      ┌──────────────┐
│  Self-Fix Loop  │─────→│ Debugger LLM │
│  (If Failed)    │←─────│ (Patches)    │
└────────┬────────┘      └──────────────┘
         │ Fixed Code
         ↓
┌─────────────────┐
│  Artifact Store │
│  (S3)           │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Deployment     │
│  Orchestrator   │
└─────────────────┘
```

## Key Features

### 🤖 Multi-Model AI System
- Supports multiple LLM providers (OpenRouter, DeepSeek, HuggingFace, Anthropic)
- Intelligent provider selection based on task requirements
- Automatic fallback on provider failure
- Cost optimization

### 🔧 Automated Self-Fixing
- Analyzes test failures automatically
- Generates and applies fixes
- Retries up to 5 times
- Escalates to human review if needed

### 📊 Real-Time Monitoring
- Live build progress updates
- Detailed logging
- Performance metrics
- Cost tracking

### 🚀 One-Click Deployment
- GitHub integration
- AWS deployment
- Automatic infrastructure setup
- Environment management

### 🎯 Demo Mode
- Works without API keys
- Realistic mock responses
- Perfect for testing
- Seamless transition to production

## Configuration

The system is highly configurable through environment variables and runtime configuration:

### Environment Variables

```bash
# LLM Provider API Keys
OPENROUTER_API_KEY=sk-or-...
DEEPSEEK_API_KEY=sk-...
HUGGINGFACE_API_KEY=hf_...
ANTHROPIC_API_KEY=sk-ant-...

# Model Router Configuration
MODEL_ROUTER_DEMO_MODE=auto
MODEL_ROUTER_FALLBACK_CHAIN=openrouter,deepseek,huggingface,demo

# Cost Controls
MAX_COST_PER_CALL=1.00
MAX_COST_PER_JOB=10.00
MAX_COST_PER_USER=100.00

# Self-Fix Configuration
SELF_FIX_MAX_ITERATIONS=5
SELF_FIX_ENABLED=true
```

See [Configuration API](api/README.md#configuration-api) for complete details.

## Support

### Documentation
- [User Guide](user/README.md)
- [Developer Guide](developer/README.md)
- [API Reference](api/README.md)

### Community
- Community Forum
- Discord Server
- GitHub Discussions
- Stack Overflow

### Direct Support
- Email: support@aiappbuilder.com
- Live Chat (9am-5pm EST)
- Support Tickets
- Phone (Enterprise)

## Contributing

We welcome contributions! Please see:
- [Contributing Guidelines](developer/README.md#contributing-guidelines)
- [Code Style Guide](developer/README.md#code-style)
- [Testing Requirements](developer/README.md#testing-requirements)

## License

Copyright © 2024 AI App Builder. All rights reserved.

## Changelog

### Version 1.0.0 (2024-01-15)
- Initial release
- ModelRouter with multi-provider support
- Task Planner with LLM integration
- Code Generator with templates
- Self-Fix Loop implementation
- Complete documentation suite
- Demo mode support
- Configuration management

---

**Need help?** Start with the [User Guide](user/README.md) if you're new, or check the [API Documentation](api/README.md) for technical details.
