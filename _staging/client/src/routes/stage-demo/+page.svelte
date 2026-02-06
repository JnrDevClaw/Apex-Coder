<script>
  import { onMount } from 'svelte';
  import { stageRegistry } from '../../lib/services/stageRegistry.js';
  import { stageValidator } from '../../lib/services/stageValidator.js';
  import { stageCompatibility } from '../../lib/services/stageCompatibility.js';
  import { payloadSchemaHandler } from '../../lib/services/payloadSchemaHandler.js';
  import DynamicStageRenderer from '../../lib/components/DynamicStageRenderer.svelte';
  import StageConfigurationManager from '../../lib/components/StageConfigurationManager.svelte';
  import ButtonPrimary from '../../lib/components/ButtonPrimary.svelte';
  import ButtonSecondary from '../../lib/components/ButtonSecondary.svelte';
  import StatusBadge from '../../lib/components/StatusBadge.svelte';

  let showConfigManager = false;
  let demoStages = [];
  let expandedStages = new Set();
  let validationResults = null;
  let compatibilityReport = null;

  onMount(async () => {
    await initializeDemo();
  });

  async function initializeDemo() {
    try {
      // Initialize all services
      await stageRegistry.initialize();
      
      // Create demo pipeline stages
      createDemoStages();
      
      // Run validation
      const validation = stageValidator.validatePipelineStages(demoStages);
      validationResults = stageValidator.getValidationSummary(demoStages);
      
      // Generate compatibility report
      compatibilityReport = stageCompatibility.createCompatibilityReport(demoStages);
      
    } catch (error) {
      console.error('Failed to initialize demo:', error);
    }
  }

  function createDemoStages() {
    // Create demo stages with various states and events
    demoStages = [
      {
        id: 'creating_specs',
        label: 'Creating specs.json',
        description: 'Generate app specifications from questionnaire and inferred logic.',
        status: 'done',
        supportsMultipleEvents: false,
        allowedStatuses: ['pending', 'running', 'created', 'error', 'cancelled'],
        startedAt: '2024-01-01T10:00:00Z',
        completedAt: '2024-01-01T10:02:00Z',
        events: [],
        error: null
      },
      {
        id: 'creating_files',
        label: 'Creating files',
        description: 'Generate all source code files before filling in logic.',
        status: 'running',
        supportsMultipleEvents: true,
        allowedStatuses: ['pending', 'running', 'done', 'error', 'cancelled'],
        startedAt: '2024-01-01T10:02:00Z',
        completedAt: null,
        events: [
          {
            id: 'event_1',
            stageId: 'creating_files',
            message: 'Creating src/components/App.svelte',
            status: 'done',
            timestamp: '2024-01-01T10:02:30Z',
            details: {
              file: 'src/components/App.svelte',
              operation: 'create',
              size: 2048
            }
          },
          {
            id: 'event_2',
            stageId: 'creating_files',
            message: 'Creating src/lib/api.js',
            status: 'running',
            timestamp: '2024-01-01T10:03:00Z',
            details: {
              file: 'src/lib/api.js',
              operation: 'create'
            }
          }
        ],
        error: null
      },
      {
        id: 'running_tests',
        label: 'Running tests',
        description: 'Execute runtime tests, type checks, linting, integration tests.',
        status: 'failed',
        supportsMultipleEvents: true,
        allowedStatuses: ['pending', 'running', 'passed', 'failed', 'cancelled'],
        startedAt: null,
        completedAt: null,
        events: [],
        error: 'Test suite failed: 3 tests failed, 7 passed'
      },
      {
        id: 'custom_validation',
        label: 'Custom Validation Stage',
        description: 'A custom stage demonstrating extensibility features.',
        status: 'pending',
        supportsMultipleEvents: true,
        allowedStatuses: ['pending', 'running', 'validated', 'error', 'cancelled'],
        startedAt: null,
        completedAt: null,
        events: [],
        error: null
      }
    ];
  }

  function toggleStageExpansion(stageIndex) {
    if (expandedStages.has(stageIndex)) {
      expandedStages.delete(stageIndex);
    } else {
      expandedStages.add(stageIndex);
    }
    expandedStages = new Set(expandedStages);
  }

  function retryStage(stageId) {
    console.log('Retrying stage:', stageId);
    // In a real implementation, this would trigger the retry logic
    const stage = demoStages.find(s => s.id === stageId);
    if (stage) {
      stage.status = 'pending';
      stage.error = null;
      demoStages = [...demoStages];
    }
  }

  function calculateProgress(stage) {
    if (stage.status === 'done' || stage.status === 'created' || stage.status === 'passed') {
      return 100;
    } else if (stage.status === 'running') {
      if (stage.supportsMultipleEvents && stage.events?.length > 0) {
        const completedEvents = stage.events.filter(e => e.status === 'done' || e.status === 'created').length;
        return Math.round((completedEvents / stage.events.length) * 100);
      }
      return 50;
    } else if (stage.status === 'failed' || stage.status === 'error') {
      return 0;
    }
    return 0;
  }

  async function addCustomStage() {
    try {
      // Register a new custom stage
      const customStage = {
        id: 'custom_deployment_' + Date.now(),
        label: 'Custom Deployment Stage',
        description: 'A dynamically added custom deployment stage.',
        supportsMultipleEvents: true,
        allowedStatuses: ['pending', 'running', 'deployed', 'error', 'cancelled'],
        expectedPayloadSchema: {
          resource: { type: 'string', required: true },
          region: { type: 'string', required: false },
          status: { type: 'string', enum: ['creating', 'available', 'failed'] }
        },
        timeout: 600000,
        retryable: true,
        critical: false,
        category: 'deployment',
        icon: 'cloud'
      };

      stageRegistry.registerStage(customStage);
      
      // Add to demo stages
      const stageInstance = stageRegistry.createStageInstance(customStage.id);
      demoStages = [...demoStages, stageInstance];
      
      alert('Custom stage added successfully!');
    } catch (error) {
      alert(`Failed to add custom stage: ${error.message}`);
    }
  }

  function openConfigManager() {
    showConfigManager = true;
  }

  function closeConfigManager() {
    showConfigManager = false;
    // Refresh demo after configuration changes
    initializeDemo();
  }
</script>

<svelte:head>
  <title>Extensible Stage System Demo</title>
</svelte:head>

<div class="min-h-screen bg-bg-primary text-white">
  <!-- Header -->
  <div class="border-b border-white/10 bg-bg-secondary/50">
    <div class="max-w-7xl mx-auto px-6 py-8">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-display font-bold text-white mb-2">
            Extensible Stage System Demo
          </h1>
          <p class="text-text-secondary">
            Demonstrating dynamic stage rendering, custom payload schemas, and backward compatibility
          </p>
        </div>
        <div class="flex gap-3">
          <ButtonSecondary on:click={addCustomStage}>
            Add Custom Stage
          </ButtonSecondary>
          <ButtonPrimary on:click={openConfigManager}>
            Stage Configuration
          </ButtonPrimary>
        </div>
      </div>
    </div>
  </div>

  <div class="max-w-7xl mx-auto px-6 py-8">
    <!-- System Status -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div class="cyber-panel p-6">
        <h3 class="text-lg font-semibold text-white mb-4">System Status</h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-text-secondary">Stage Registry</span>
            <StatusBadge status="running" />
          </div>
          <div class="flex justify-between items-center">
            <span class="text-text-secondary">Payload Schemas</span>
            <StatusBadge status="done" />
          </div>
          <div class="flex justify-between items-center">
            <span class="text-text-secondary">Compatibility Layer</span>
            <StatusBadge status="done" />
          </div>
        </div>
      </div>

      <div class="cyber-panel p-6">
        <h3 class="text-lg font-semibold text-white mb-4">Validation Results</h3>
        {#if validationResults}
          <div class="space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-text-secondary">Total Stages</span>
              <span class="text-white font-semibold">{validationResults.stageCount}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-text-secondary">Errors</span>
              <span class="text-accent-error font-semibold">{validationResults.totalErrors}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-text-secondary">Warnings</span>
              <span class="text-accent-secondary font-semibold">{validationResults.totalWarnings}</span>
            </div>
          </div>
        {:else}
          <div class="text-text-secondary">Loading...</div>
        {/if}
      </div>

      <div class="cyber-panel p-6">
        <h3 class="text-lg font-semibold text-white mb-4">Compatibility</h3>
        {#if compatibilityReport}
          <div class="space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-text-secondary">Total Stages</span>
              <span class="text-white font-semibold">{compatibilityReport.totalStages}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-text-secondary">Need Migration</span>
              <span class="text-accent-secondary font-semibold">{compatibilityReport.needsMigration}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-text-secondary">Deprecation Warnings</span>
              <span class="text-accent-secondary font-semibold">{compatibilityReport.deprecationWarnings?.length || 0}</span>
            </div>
          </div>
        {:else}
          <div class="text-text-secondary">Loading...</div>
        {/if}
      </div>
    </div>

    <!-- Demo Pipeline -->
    <div class="cyber-panel p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-display font-semibold text-white">
          Demo Pipeline - AI App Builder
        </h2>
        <div class="flex items-center gap-4">
          <span class="text-sm text-text-secondary">
            {demoStages.length} stages
          </span>
          <StatusBadge status="running" />
        </div>
      </div>

      <!-- Pipeline Stages -->
      <div class="space-y-4">
        {#each demoStages as stage, index}
          <DynamicStageRenderer
            {stage}
            {index}
            isExpanded={expandedStages.has(index)}
            onToggleExpansion={() => toggleStageExpansion(index)}
            onRetry={() => retryStage(stage.id)}
            progress={calculateProgress(stage)}
          />
        {/each}
      </div>

      <!-- Pipeline Summary -->
      <div class="mt-8 pt-6 border-t border-white/10">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="text-center">
            <div class="text-2xl font-bold text-accent-success">
              {demoStages.filter(s => s.status === 'done' || s.status === 'created' || s.status === 'passed').length}
            </div>
            <div class="text-sm text-text-secondary">Completed</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-accent-primary">
              {demoStages.filter(s => s.status === 'running').length}
            </div>
            <div class="text-sm text-text-secondary">Running</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-accent-error">
              {demoStages.filter(s => s.status === 'failed' || s.status === 'error').length}
            </div>
            <div class="text-sm text-text-secondary">Failed</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-gray-400">
              {demoStages.filter(s => s.status === 'pending').length}
            </div>
            <div class="text-sm text-text-secondary">Pending</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Features Showcase -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
      <div class="cyber-panel p-6">
        <h3 class="text-lg font-semibold text-white mb-4">Key Features</h3>
        <ul class="space-y-3 text-sm">
          <li class="flex items-start gap-3">
            <svg class="w-5 h-5 text-accent-success mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <div>
              <span class="text-white font-medium">Dynamic Stage Registration</span>
              <p class="text-text-secondary">Add new stage types without code changes</p>
            </div>
          </li>
          <li class="flex items-start gap-3">
            <svg class="w-5 h-5 text-accent-success mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <div>
              <span class="text-white font-medium">Custom Payload Schemas</span>
              <p class="text-text-secondary">Validate and format stage-specific data</p>
            </div>
          </li>
          <li class="flex items-start gap-3">
            <svg class="w-5 h-5 text-accent-success mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <div>
              <span class="text-white font-medium">Backward Compatibility</span>
              <p class="text-text-secondary">Automatic migration of legacy stage formats</p>
            </div>
          </li>
          <li class="flex items-start gap-3">
            <svg class="w-5 h-5 text-accent-success mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <div>
              <span class="text-white font-medium">Comprehensive Validation</span>
              <p class="text-text-secondary">Real-time validation with detailed error reporting</p>
            </div>
          </li>
        </ul>
      </div>

      <div class="cyber-panel p-6">
        <h3 class="text-lg font-semibold text-white mb-4">Available Schemas</h3>
        <div class="space-y-2 text-sm">
          {#each Array.from(payloadSchemaHandler.getAllSchemas().keys()) as schemaId}
            <div class="flex items-center justify-between p-2 bg-bg-secondary/50 rounded">
              <span class="text-white font-mono">{schemaId}</span>
              <StatusBadge status="available" />
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Stage Configuration Manager Modal -->
<StageConfigurationManager
  isOpen={showConfigManager}
  onClose={closeConfigManager}
/>

<style>
  .cyber-panel {
    background-color: #0F1217;
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 0.75rem;
    box-shadow: 0 0 6px rgba(58, 184, 255, 0.25);
  }
</style>
