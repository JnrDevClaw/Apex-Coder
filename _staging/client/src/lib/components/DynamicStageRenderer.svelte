<script>
  import { onMount } from 'svelte';
  import { stageRegistry } from '../services/stageRegistry.js';
  import { canRetryStage } from '../utils/pipeline.js';
  import { handleStageRetry as handleStageRetryUtil } from '../utils/errorHandling.js';
  import StatusBadge from './StatusBadge.svelte';
  import ErrorDisplay from './ErrorDisplay.svelte';
  import RetryButton from './RetryButton.svelte';
  
  export let stage;
  export let index;
  export let isExpanded = false;
  export let onToggleExpansion = null;
  export let onRetry = null;
  export let progress = 0;
  
  let stageDefinition = null;
  let customRenderer = null;
  let payloadSchema = null;
  let validationErrors = [];
  
  // Reactive statements
  $: if (stage?.id) {
    loadStageDefinition();
  }
  
  $: supportsMultipleEvents = stageDefinition?.supportsMultipleEvents || 
    (stage.events && stage.events.length > 0);
  
  onMount(async () => {
    await stageRegistry.initialize();
    if (stage?.id) {
      loadStageDefinition();
    }
  });
  
  function loadStageDefinition() {
    stageDefinition = stageRegistry.getStage(stage.id);
    customRenderer = stageRegistry.getRenderer(stage.id);
    payloadSchema = stageRegistry.getPayloadSchema(stage.id);
    
    // Validate stage events against payload schema
    if (stage.events && payloadSchema) {
      validationErrors = [];
      stage.events.forEach((event, index) => {
        if (event.details) {
          const validation = stageRegistry.validateStagePayload(stage.id, event.details);
          if (!validation.isValid) {
            validationErrors.push({
              eventIndex: index,
              errors: validation.errors
            });
          }
        }
      });
    }
  }
  
  // Get stage icon based on definition or fallback to stage type
  function getStageIcon(stageId) {
    if (stageDefinition?.icon && stageDefinition.icon !== 'default') {
      return getIconPath(stageDefinition.icon);
    }
    
    // Fallback to built-in icons
    const icons = {
      'creating_specs': 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      'creating_docs': 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      'creating_schema': 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4',
      'creating_workspace': 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
      'creating_files': 'M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      'coding_file': 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
      'running_tests': 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
      'creating_repo': 'M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z',
      'repo_created': 'M5 13l4 4L19 7',
      'pushing_files': 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12',
      'deploying': 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z',
      'deployment_complete': 'M5 13l4 4L19 7'
    };
    
    return icons[stageId] || 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
  }
  
  function getIconPath(iconName) {
    const iconPaths = {
      'document': 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      'book': 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
      'database': 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4',
      'folder': 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
      'code': 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
      'check-circle': 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
      'git-branch': 'M7 20l4-16m2 5.5l5 2m-5-2l-5 2m5-2v6',
      'check': 'M5 13l4 4L19 7',
      'upload': 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12',
      'cloud': 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z'
    };
    
    return iconPaths[iconName] || 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
  }
  
  function getProgressBarColor(status) {
    if (status === 'failed' || status === 'error') return 'bg-accent-error';
    if (status === 'done' || status === 'created' || status === 'passed' || status === 'deployed') return 'bg-accent-success';
    if (status === 'running') return 'bg-accent-primary';
    return 'bg-gray-600';
  }
  
  function getStageNumber(index) {
    return (index + 1).toString().padStart(2, '0');
  }
  
  function handleToggleExpansion() {
    if (onToggleExpansion) {
      onToggleExpansion();
    }
  }
  
  async function handleRetry() {
    if (onRetry && canRetryStage(stage)) {
      await handleStageRetryUtil(stage.id, onRetry);
    }
  }
  
  function formatEventTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  }
  
  function canRetryCurrentStage() {
    if (!stageDefinition) return canRetryStage(stage);
    return stageDefinition.retryable && canRetryStage(stage);
  }
  
  function getStageCategory() {
    return stageDefinition?.category || 'general';
  }
  
  function getStageTimeout() {
    return stageDefinition?.timeout || 300000;
  }
  
  function isStageCritical() {
    return stageDefinition?.critical || false;
  }
</script>

<div class="dynamic-stage-renderer cyber-panel p-6 transition-all duration-300 {isExpanded ? 'border-accent-primary' : ''}" 
     data-stage-id={stage.id} 
     data-stage-category={getStageCategory()}
     data-stage-critical={isStageCritical()}>
  
  <!-- Stage Header -->
  <div class="flex items-center gap-4">
    <!-- Stage Number & Icon -->
    <div class="flex items-center gap-3 flex-shrink-0">
      <div class="w-8 h-8 rounded-full bg-bg-secondary flex items-center justify-center text-sm font-code text-text-secondary">
        {getStageNumber(index)}
      </div>
      
      <div class={`w-10 h-10 rounded-lg flex items-center justify-center transition-all
        ${stage.status === 'running' ? 'bg-accent-primary/20 animate-pulseSoft' : ''}
        ${stage.status === 'done' || stage.status === 'created' || stage.status === 'passed' || stage.status === 'deployed' ? 'bg-accent-success/20' : ''}
        ${stage.status === 'failed' || stage.status === 'error' ? 'bg-accent-error/20' : ''}
        ${stage.status === 'pending' || stage.status === 'cancelled' ? 'bg-gray-600/20' : ''}
      `}>
        <svg class={`w-5 h-5 transition-colors
          ${stage.status === 'running' ? 'text-accent-primary' : ''}
          ${stage.status === 'done' || stage.status === 'created' || stage.status === 'passed' || stage.status === 'deployed' ? 'text-accent-success' : ''}
          ${stage.status === 'failed' || stage.status === 'error' ? 'text-accent-error' : ''}
          ${stage.status === 'pending' || stage.status === 'cancelled' ? 'text-gray-400' : ''}
        `} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getStageIcon(stage.id)}></path>
        </svg>
      </div>
    </div>
    
    <!-- Stage Info -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-3 mb-1">
        <h3 class="text-lg font-display font-semibold text-white truncate">
          {stageDefinition?.label || stage.label}
        </h3>
        <StatusBadge status={stage.status} />
        
        <!-- Stage Category Badge -->
        {#if stageDefinition?.category && stageDefinition.category !== 'general'}
          <span class="px-2 py-1 text-xs font-medium bg-accent-secondary/20 text-accent-secondary rounded-full">
            {stageDefinition.category}
          </span>
        {/if}
        
        <!-- Critical Stage Indicator -->
        {#if isStageCritical()}
          <span class="px-2 py-1 text-xs font-medium bg-accent-error/20 text-accent-error rounded-full" title="Critical stage">
            Critical
          </span>
        {/if}
      </div>
      
      <p class="text-sm text-text-secondary mb-2">
        {stageDefinition?.description || stage.description || `Stage: ${stage.id}`}
      </p>
      
      <!-- Progress Bar -->
      <div class="flex items-center gap-3">
        <div class="flex-1 bg-bg-secondary rounded-full h-2 overflow-hidden">
          <div 
            class={`h-full rounded-full transition-all duration-500 ${getProgressBarColor(stage.status)}`}
            style="width: {progress}%"
          >
            {#if stage.status === 'running'}
              <div class="h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></div>
            {/if}
          </div>
        </div>
        <span class="text-xs font-code text-accent-primary w-10 text-right">{progress}%</span>
      </div>
      
      <!-- Stage Metadata -->
      {#if stageDefinition}
        <div class="flex items-center gap-4 mt-2 text-xs text-text-secondary">
          <span>Timeout: {Math.round(getStageTimeout() / 1000)}s</span>
          {#if stageDefinition.dependencies?.length > 0}
            <span>Dependencies: {stageDefinition.dependencies.length}</span>
          {/if}
          {#if stageDefinition.version}
            <span>v{stageDefinition.version}</span>
          {/if}
        </div>
      {/if}
    </div>
    
    <!-- Stage Actions -->
    <div class="flex items-center gap-2 flex-shrink-0">
      {#if canRetryCurrentStage()}
        <RetryButton
          text="Retry"
          size="small"
          variant="secondary"
          on:retry={handleRetry}
        />
      {/if}
      
      {#if supportsMultipleEvents}
        <button
          type="button"
          on:click={handleToggleExpansion}
          class="btn-secondary p-2 transition-transform {isExpanded ? 'rotate-180' : ''}"
          title={isExpanded ? 'Collapse details' : 'Expand details'}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </button>
      {/if}
    </div>
  </div>
  
  <!-- Stage Error -->
  {#if stage.error}
    <div class="mt-4">
      <ErrorDisplay
        error={stage.error}
        title="Stage Error"
        showRetry={canRetryCurrentStage()}
        showDetails={true}
        on:retry={handleRetry}
      />
    </div>
  {/if}
  
  <!-- Payload Validation Errors -->
  {#if validationErrors.length > 0}
    <div class="mt-4 p-3 bg-accent-error/10 border border-accent-error/20 rounded-lg">
      <h4 class="text-sm font-semibold text-accent-error mb-2">Payload Validation Errors</h4>
      {#each validationErrors as validation}
        <div class="mb-2">
          <span class="text-xs text-accent-error">Event {validation.eventIndex + 1}:</span>
          <ul class="text-xs text-text-secondary ml-4">
            {#each validation.errors as error}
              <li>• {error}</li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  {/if}
  
  <!-- Expanded Details -->
  {#if isExpanded && supportsMultipleEvents}
    <div class="mt-6 border-t border-white/10 pt-6">
      {#if stage.events && stage.events.length > 0}
        <div class="space-y-3">
          <h4 class="text-sm font-semibold text-white mb-3">Stage Events</h4>
          
          {#each stage.events as event, eventIndex}
            <div class="flex items-center gap-3 p-3 bg-bg-secondary/50 rounded-lg">
              <!-- Event Status Indicator -->
              <div class={`w-2 h-2 rounded-full flex-shrink-0
                ${event.status === 'running' ? 'bg-accent-primary animate-pulseSoft' : ''}
                ${event.status === 'done' || event.status === 'created' || event.status === 'passed' ? 'bg-accent-success' : ''}
                ${event.status === 'failed' || event.status === 'error' ? 'bg-accent-error' : ''}
                ${event.status === 'pending' ? 'bg-gray-400' : ''}
              `}></div>
              
              <!-- Event Content -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-sm font-medium text-white truncate">{event.message}</span>
                  <StatusBadge status={event.status} />
                </div>
                
                {#if event.details}
                  <!-- Custom payload display based on schema -->
                  {#if payloadSchema}
                    <div class="text-xs text-text-secondary space-y-1">
                      {#each Object.entries(event.details) as [key, value]}
                        {#if payloadSchema[key]}
                          <div class="flex gap-2">
                            <span class="font-medium">{key}:</span>
                            <span class="truncate">{typeof value === 'object' ? JSON.stringify(value) : value}</span>
                          </div>
                        {/if}
                      {/each}
                    </div>
                  {:else}
                    <p class="text-xs text-text-secondary">{JSON.stringify(event.details)}</p>
                  {/if}
                {/if}
              </div>
              
              <!-- Event Timestamp -->
              {#if event.timestamp}
                <span class="text-xs font-code text-text-secondary flex-shrink-0">
                  {formatEventTime(event.timestamp)}
                </span>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <!-- Multi-event stage without specific events -->
        <div class="text-center py-6">
          <svg class="w-8 h-8 text-text-secondary mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"></path>
          </svg>
          <p class="text-sm text-text-secondary">
            {#if stage.status === 'pending'}
              Waiting for stage to begin...
            {:else if stage.status === 'running'}
              Processing multiple operations...
            {:else}
              No detailed events available for this stage.
            {/if}
          </p>
        </div>
      {/if}
    </div>
  {/if}
  
  <!-- Custom Renderer Slot -->
  {#if customRenderer && customRenderer !== null}
    <div class="mt-4 border-t border-white/10 pt-4">
      <svelte:component this={customRenderer} {stage} {stageDefinition} {progress} />
    </div>
  {/if}
</div>

<style>
  .dynamic-stage-renderer {
    position: relative;
  }
  
  .dynamic-stage-renderer::before {
    content: '';
    position: absolute;
    left: 2.75rem;
    top: 0;
    bottom: 0;
    width: 2px;
    background: linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.1) 20%, rgba(255,255,255,0.1) 80%, transparent 100%);
  }
  
  .dynamic-stage-renderer:last-child::before {
    display: none;
  }
  
  .dynamic-stage-renderer[data-stage-critical="true"] {
    border-left: 3px solid var(--accent-error);
  }
  
  @keyframes pulseSoft {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
  
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  
  .animate-pulseSoft {
    animation: pulseSoft 2s ease-in-out infinite;
  }
  
  .animate-shimmer {
    animation: shimmer 2.5s linear infinite;
  }
</style>
