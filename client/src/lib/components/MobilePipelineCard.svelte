<script>
  import { createEventDispatcher } from 'svelte';
  import { formatRelativeTime, formatDuration, canCancelPipeline, canRetryPipeline } from '../utils/pipeline.js';
  import StatusBadge from './StatusBadge.svelte';
  
  export let pipeline;
  export let compact = false;
  
  const dispatch = createEventDispatcher();
  
  let showActions = false;
  
  function getProgressColor(progress, status) {
    if (status === 'failed') return 'bg-accent-error';
    if (status === 'completed') return 'bg-accent-success';
    if (status === 'running') return 'bg-accent-primary';
    return 'bg-gray-600';
  }
  
  function handleView() {
    dispatch('view', pipeline.id);
  }
  
  function handleCancel() {
    dispatch('cancel', pipeline.id);
  }
  
  function handleRetry() {
    dispatch('retry', pipeline.id);
  }
  
  function toggleActions() {
    showActions = !showActions;
  }
</script>

<div class="mobile-pipeline-card cyber-panel p-4 touch-manipulation active:scale-[0.98] transition-all">
  <!-- Header -->
  <div class="flex items-start justify-between mb-3">
    <div class="flex-1 min-w-0 pr-3">
      <h3 class="text-base font-display font-semibold text-white truncate mb-1">
        {pipeline.projectName}
      </h3>
      <p class="text-xs text-text-secondary font-code truncate">
        {pipeline.id}
      </p>
    </div>
    
    <div class="flex items-center gap-2 flex-shrink-0">
      <StatusBadge status={pipeline.status} />
      
      <button
        type="button"
        on:click={toggleActions}
        class="p-1.5 rounded-lg bg-bg-secondary hover:bg-white/10 transition-colors touch-manipulation"
        aria-label="More actions"
      >
        <svg class="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path>
        </svg>
      </button>
    </div>
  </div>
  
  <!-- Progress -->
  <div class="mb-3">
    <div class="flex justify-between text-xs mb-1.5">
      <span class="text-text-secondary">Progress</span>
      <span class="text-accent-primary font-code font-semibold">{pipeline.progress}%</span>
    </div>
    <div class="w-full bg-bg-secondary rounded-full h-2 overflow-hidden">
      <div 
        class={`h-2 rounded-full transition-all duration-500 ${getProgressColor(pipeline.progress, pipeline.status)}`}
        style="width: {pipeline.progress}%"
      >
        {#if pipeline.status === 'running'}
          <div class="h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></div>
        {/if}
      </div>
    </div>
  </div>
  
  <!-- Meta Info -->
  <div class="flex items-center justify-between text-xs text-text-secondary mb-3">
    <span>{formatRelativeTime(pipeline.createdAt)}</span>
    {#if pipeline.startedAt}
      <span class="font-code">{formatDuration(pipeline.startedAt, pipeline.completedAt)}</span>
    {/if}
  </div>
  
  <!-- Error Message (if any) -->
  {#if pipeline.error}
    <div class="bg-accent-error/10 border border-accent-error/20 rounded-lg p-2 mb-3">
      <p class="text-xs text-accent-error line-clamp-2">{pipeline.error}</p>
    </div>
  {/if}
  
  <!-- Resources (compact view) -->
  {#if pipeline.resources && pipeline.resources.length > 0 && !compact}
    <div class="flex flex-wrap gap-1 mb-3">
      {#each pipeline.resources.slice(0, 3) as resource}
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs bg-accent-primary/10 text-accent-primary px-2 py-1 rounded hover:bg-accent-primary/20 transition-colors touch-manipulation"
        >
          {resource.name}
        </a>
      {/each}
      {#if pipeline.resources.length > 3}
        <span class="text-xs text-text-secondary px-2 py-1">
          +{pipeline.resources.length - 3} more
        </span>
      {/if}
    </div>
  {/if}
  
  <!-- Actions -->
  {#if showActions}
    <div class="flex gap-2 pt-3 border-t border-white/10">
      <button
        type="button"
        on:click={handleView}
        class="flex-1 btn-secondary text-sm py-2 touch-manipulation"
      >
        View
      </button>
      
      {#if canCancelPipeline(pipeline)}
        <button
          type="button"
          on:click={handleCancel}
          class="btn-destructive text-sm px-4 py-2 touch-manipulation"
        >
          Cancel
        </button>
      {/if}
      
      {#if canRetryPipeline(pipeline)}
        <button
          type="button"
          on:click={handleRetry}
          class="btn-secondary text-sm px-4 py-2 touch-manipulation"
        >
          Retry
        </button>
      {/if}
    </div>
  {:else}
    <!-- Quick View Button -->
    <button
      type="button"
      on:click={handleView}
      class="w-full btn-secondary text-sm py-2 touch-manipulation"
    >
      View Details
    </button>
  {/if}
</div>

<style>
  .mobile-pipeline-card {
    position: relative;
  }
  
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  
  .animate-shimmer {
    animation: shimmer 2.5s linear infinite;
  }
</style>
