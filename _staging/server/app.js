'use strict'

const path = require('node:path')
const fs = require('node:fs')

// Pass --options via CLI arguments in command to enable these options.
const options = {}

module.exports = async function (fastify, opts) {
  // Initialize Service Registry
  const ServiceRegistry = require('./services/service-registry')
  const serviceRegistry = new ServiceRegistry(fastify.log || console)
  fastify.decorate('serviceRegistry', serviceRegistry)

  // Start provider verification in background (non-blocking)
  const ProviderVerificationService = require('./services/provider-verification.js')
  const verificationService = new ProviderVerificationService(fastify.log || console)
  fastify.decorate('providerVerification', verificationService)
  
  // Run verification asynchronously without blocking startup
  console.log('🔍 Starting provider verification in background...')
  verificationService.verifyAllProviders()
    .then(() => {
      const missingProviders = verificationService.getMissingProviders()
      if (missingProviders.length > 0) {
        console.warn(`⚠️  Missing providers: ${missingProviders.join(', ')}`)
        console.warn('⚠️  Set API keys in .env to enable full functionality')
      }
      
      const unavailableProviders = verificationService.getUnavailableProviders()
      if (unavailableProviders.length > 0) {
        console.warn(`⚠️  Unavailable providers: ${unavailableProviders.join(', ')}`)
        console.warn('⚠️  Check API keys and network connectivity')
      }
      
      console.log('✅ Provider verification complete')
    })
    .catch(error => {
      console.error('❌ Provider verification failed:', error.message)
    })

  // Initialize ModelRouter on server startup
  try {
    console.log('🚀 Initializing ModelRouter...')
    const { getModelRouterService } = require('./services/model-router-service')
    const modelRouterConfig = require('./config/model-router-config')
    
    // Initialize configuration
    const config = modelRouterConfig.initialize()
    
    // Get ModelRouter service instance
    const modelRouterService = getModelRouterService(config)
    
    // Register with service registry
    serviceRegistry.register('modelRouter', modelRouterService, {
      dependencies: [],
      initialize: async () => {
        await modelRouterService.initialize()
      },
      healthCheck: async () => {
        const status = modelRouterService.getStatus()
        return {
          status: status.initialized ? 'healthy' : 'unhealthy',
          ...status
        }
      }
    })
    
    // Initialize the service
    await serviceRegistry.initialize('modelRouter')
    
    // Make ModelRouter available to all routes via fastify.decorate
    fastify.decorate('modelRouter', modelRouterService)
    
    console.log('✅ ModelRouter initialized successfully')
  } catch (error) {
    console.error('❌ Failed to initialize ModelRouter:', error.message)
    console.error(error.stack)
    // Don't fail server startup - continue with demo mode
    console.log('⚠️  Continuing with demo mode only')
    fastify.decorate('modelRouter', null)
  }

  // Initialize AI providers and pipeline orchestrator
  try {
    console.log('🚀 Initializing AI providers and pipeline orchestrator...')
    
    // Step 1: Initialize all AI providers (only if ModelRouter is available)
    if (fastify.modelRouter) {
      const { initializeProviders } = require('./services/model-router/initialize-providers')
      const initResults = await initializeProviders(fastify.log || console)
      
      console.log(`📊 Provider initialization complete:`)
      console.log(`   ✅ Initialized: ${initResults.initialized.length}`)
      console.log(`   ⏭️  Skipped: ${initResults.skipped.length}`)
      console.log(`   ❌ Failed: ${initResults.failed.length}`)
      
      // Step 2: Create Stage Router with Model Router
      const StageRouter = require('./services/stage-router')
      const stageRouter = new StageRouter(fastify.modelRouter)
      
      // Register Stage Router with service registry
      serviceRegistry.register('stageRouter', stageRouter, {
        dependencies: ['modelRouter'],
        healthCheck: async () => {
          const validation = stageRouter.validateProviders()
          return {
            status: validation.valid ? 'healthy' : 'degraded',
            valid: validation.valid,
            availableProviders: validation.availableProviders,
            missingProviders: validation.missingProviders
          }
        }
      })
      
      // Validate that required providers are available for each stage
      const validation = stageRouter.validateProviders()
      
      if (!validation.valid) {
        console.warn('⚠️  Some required providers are missing:')
        validation.missingProviders.forEach(provider => {
          console.warn(`   - ${provider}`)
        })
        console.warn('⚠️  Some pipeline stages may not function correctly')
      } else {
        console.log('✅ All required providers are available')
      }
      
      // Make Stage Router available
      fastify.decorate('stageRouter', stageRouter)
      console.log('✅ Stage Router initialized successfully')
      
      // Step 3: Create Pipeline Orchestrator with Stage Router
      const PipelineOrchestrator = require('./services/pipeline-orchestrator')
      
      // Get required dependencies for pipeline orchestrator
      const buildModel = require('./models/build')
      const projectModel = require('./models/project')
      
      const pipelineOrchestrator = new PipelineOrchestrator({
        stageRouter,
        buildModel,
        projectModel,
        websocket: null, // Will be set when websocket plugin loads
        emailService: null, // Will be set when email service loads
        workDir: process.env.WORK_DIR || path.join(process.cwd(), 'work')
      })
      
      // Register Pipeline Orchestrator with service registry
      serviceRegistry.register('pipelineOrchestrator', pipelineOrchestrator, {
        dependencies: ['stageRouter'],
        healthCheck: async () => {
          return {
            status: 'healthy',
            workDir: pipelineOrchestrator.workDir
          }
        }
      })
      
      // Make Pipeline Orchestrator available
      fastify.decorate('pipelineOrchestrator', pipelineOrchestrator)
      console.log('✅ Pipeline Orchestrator initialized successfully')
      
      // Log stage configurations
      console.log('\n📋 Pipeline Stages Configuration:')
      const stageConfigs = stageRouter.getAllStageConfigs()
      Object.entries(stageConfigs).forEach(([stageNum, config]) => {
        if (config.requiresAI) {
          console.log(`   Stage ${stageNum}: ${config.name} → ${config.provider}/${config.model || 'multiple models'}`)
        } else {
          console.log(`   Stage ${stageNum}: ${config.name} (no AI required)`)
        }
      })
      
      console.log('\n✅ AI Integration Wiring Complete!')
      console.log('   - Model Router: Ready')
      console.log('   - Stage Router: Ready')
      console.log('   - Pipeline Orchestrator: Ready')
      console.log(`   - Available Providers: ${validation.availableProviders.join(', ')}`)
      
    } else {
      console.warn('⚠️  ModelRouter not available, skipping Stage Router and Pipeline Orchestrator initialization')
      fastify.decorate('stageRouter', null)
      fastify.decorate('pipelineOrchestrator', null)
    }
    
  } catch (error) {
    console.error('❌ Failed to initialize AI pipeline:', error.message)
    console.error(error.stack)
    // Don't fail server startup - log error and continue
    console.log('⚠️  Server will start but AI pipeline may not function correctly')
    fastify.decorate('stageRouter', null)
    fastify.decorate('pipelineOrchestrator', null)
  }

  // Add health check endpoint for ModelRouter
  fastify.get('/api/model-router/health', async (request, reply) => {
    try {
      if (!fastify.modelRouter) {
        return reply.code(503).send({ 
          status: 'unavailable', 
          message: 'ModelRouter not initialized' 
        })
      }
      
      const status = fastify.modelRouter.getStatus()
      return reply.send({
        status: 'healthy',
        ...status
      })
    } catch (error) {
      return reply.code(500).send({
        status: 'error',
        message: error.message
      })
    }
  })

  // Add provider verification status endpoint
  fastify.get('/api/providers/status', async (request, reply) => {
    try {
      if (!fastify.providerVerification) {
        return reply.code(503).send({ 
          status: 'unavailable', 
          message: 'Provider verification not initialized' 
        })
      }
      
      const results = fastify.providerVerification.getResults()
      const allConfigured = fastify.providerVerification.areAllProvidersConfigured()
      const allAvailable = fastify.providerVerification.areAllProvidersAvailable()
      const missingProviders = fastify.providerVerification.getMissingProviders()
      const unavailableProviders = fastify.providerVerification.getUnavailableProviders()
      
      return reply.send({
        status: allAvailable ? 'healthy' : (allConfigured ? 'degraded' : 'incomplete'),
        allConfigured,
        allAvailable,
        missingProviders,
        unavailableProviders,
        providers: results
      })
    } catch (error) {
      return reply.code(500).send({
        status: 'error',
        message: error.message
      })
    }
  })

  // Add service registry health check endpoint
  fastify.get('/api/services/health', async (request, reply) => {
    try {
      if (!fastify.serviceRegistry) {
        return reply.code(503).send({ 
          status: 'unavailable', 
          message: 'Service registry not initialized' 
        })
      }
      
      const health = await fastify.serviceRegistry.checkHealth()
      const statuses = fastify.serviceRegistry.getAllStatuses()
      
      // Determine overall status
      const allHealthy = Object.values(health).every(h => h.status === 'healthy')
      const anyUnhealthy = Object.values(health).some(h => h.status === 'unhealthy')
      
      return reply.send({
        status: allHealthy ? 'healthy' : (anyUnhealthy ? 'degraded' : 'unknown'),
        services: health,
        statuses
      })
    } catch (error) {
      return reply.code(500).send({
        status: 'error',
        message: error.message
      })
    }
  })

  // Add graceful shutdown for service registry
  fastify.addHook('onClose', async (instance) => {
    if (instance.serviceRegistry) {
      console.log('🛑 Shutting down services...')
      try {
        await instance.serviceRegistry.shutdownAll()
        console.log('✅ All services shut down successfully')
      } catch (error) {
        console.error('❌ Error during service shutdown:', error.message)
      }
    }
  })

  // Manually load all plugins (replacing fastify-autoload)
  const pluginsDir = path.join(__dirname, 'plugins')
  const pluginFiles = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js'))
  
  for (const file of pluginFiles) {
    try {
      const plugin = require(path.join(pluginsDir, file))
      await fastify.register(plugin, opts)
      console.log(`✅ Loaded plugin: ${file}`)
    } catch (error) {
      console.error(`❌ Failed to load plugin ${file}:`, error.message)
    }
  }

  // Wire up websocket and email services after plugins are loaded
  fastify.after(() => {
    // Connect websocket service to pipeline orchestrator
    if (fastify.pipelineOrchestrator && fastify.websocket) {
      fastify.pipelineOrchestrator.websocket = fastify.websocket
      console.log('✅ WebSocket service connected to Pipeline Orchestrator')
    }
    
    // Connect email service to pipeline orchestrator
    if (fastify.pipelineOrchestrator) {
      try {
        const emailService = require('./services/email-notifications')
        fastify.pipelineOrchestrator.emailService = emailService
        console.log('✅ Email service connected to Pipeline Orchestrator')
      } catch (error) {
        console.warn('⚠️  Email service not available:', error.message)
      }
    }
  })

  // Manually load all routes (replacing fastify-autoload)
  const routesDir = path.join(__dirname, 'routes')
  const routeFiles = fs.readdirSync(routesDir).filter(file => file.endsWith('.js'))
  
  for (const file of routeFiles) {
    try {
      const route = require(path.join(routesDir, file))
      await fastify.register(route, opts)
      console.log(`✅ Loaded route: ${file}`)
    } catch (error) {
      console.error(`❌ Failed to load route ${file}:`, error.message)
    }
  }
}

module.exports.options = options
