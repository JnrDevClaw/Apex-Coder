<script>
  import { createEventDispatcher } from 'svelte';
  import { canRetryStage } from '../utils/pipeline.js';
  import StatusBadge from './StatusBadge.svelte';
  
  export let stage;
  export let index;
  export let progress = 0;
  export let isExpanded = false;
  
  const dispatch = createEventDispatcher();
  
  function getProgressColor(status) {
    if (status === 'failed' || status === 'error') return 'bg-accent-error';
    if (status === 'done' || status === 'created' || status === 'passed' || status === 'deployed') return 'bg-accent-success';
    if (status === 'running') return 'bg-accent-primary';
    return 'bg-gray-600';
  }
  
  function getStageIcon(stageId) {
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
  
  function toggleExpansion() {
    dispatch('toggle');
  }
  
  function handleRetry() {
    dispatch('retry');
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
  
  $: supportsMultipleEvents = stage.supportsMultipleEvents || (stage.events && stage.events.length > 0);
</script>

<div class="mobile-stage-card cyber-panel p-4 touch-manipulation transition-all {isExpanded ? 'border-accent-primary' : ''}">
  <!-- Stage Header -->
  <button
    type="button"
    on:click={toggleExpansion}
    class="w-full flex items-center gap-3 text-left"
  >
    <!-- Stage Icon -->
    <div class={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-all
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
    
    <!-- Stage Info -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 mb-1">
        <h3 class="text-sm font-display font-semibold text-white truncate">
          {stage.label}
        </h3>
        <StatusBadge status={stage.status} />
      </div>
      
      <!-- Progress Bar -->
      <div class="flex items-center gap-2">
        <div class="flex-1 bg-bg-secondary rounded-full h-1.5 overflow-hidden">
          <div 
            class={`h-full rounded-full transition-all duration-500 ${getProgressColor(stage.status)}`}
            style="width: {progress}%"
          >
            {#if stage.status === 'running'}
              <div class="h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></div>
            {/if}
          </div>
        </div>
        <span class="text-xs font-code text-accent-primary w-10 text-right">{progress}%</span>
      </div>
    </div>
    
    <!-- Expand Icon -->
    {#if supportsMultipleEvents}
      <svg 
        class={`w-5 h-5 text-text-secondary transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
      </svg>
    {/if}
  </button>
  
  <!-- Stage Error -->
  {#if stage.error}
    <div class="mt-3 bg-accent-error/10 border border-accent-error/20 rounded-lg p-2">
      <p class="text-xs text-accent-error line-clamp-2">{stage.error}</p>
    </div>
  {/if}
  
  <!-- Retry Button -->
  {#if canRetryStage(stage)}
    <button
      type="button"
      on:click={handleRetry}
      class="mt-3 w-full btn-secondary text-sm py-2 touch-manipulation"
    >
      Retry Stage
    </button>
  {/if}
  
  <!-- Expanded Details -->
  {#if isExpanded && supportsMultipleEvents}
    <div class="mt-4 pt-4 border-t border-white/10 space-y-2">
      {#if stage.events && stage.events.length > 0}
        {#each stage.events as event}
          <div class="flex items-start gap-2 p-2 bg-bg-secondary/50 rounded-lg">
            <!-- Event Status Indicator -->
            <div class={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5
              ${event.status === 'running' ? 'bg-accent-primary animate-pulseSoft' : ''}
              ${event.status === 'done' || event.status === 'created' || event.status === 'passed' ? 'bg-accent-success' : ''}
              ${event.status === 'failed' || event.status === 'error' ? 'bg-accent-error' : ''}
              ${event.status === 'pending' ? 'bg-gray-400' : ''}
            `}></div>
            
            <!-- Event Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="text-xs font-medium text-white truncate">{event.message}</span>
                <StatusBadge status={event.status} />
              </div>
              
              {#if event.details}
                <p class="text-xs text-text-secondary line-clamp-1">{event.details}</p>
              {/if}
              
              {#if event.timestamp}
                <span class="text-xs font-code text-text-secondary">
                  {formatEventTime(event.timestamp)}
                </span>
              {/if}
            </div>
          </div>
        {/each}
      {:else}
        <div class="text-center py-4">
          <p class="text-xs text-text-secondary">
            {#if stage.status === 'pending'}
              Waiting for stage to begin...
            {:else if stage.status === 'running'}
              Processing...
            {:else}
              No events available
            {/if}
          </p>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .line-clamp-1 {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
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
