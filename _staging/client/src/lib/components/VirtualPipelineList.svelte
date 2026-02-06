<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { VirtualScrollManager } from '../utils/performance.js';
  import StatusBadge from './StatusBadge.svelte';
  import { formatRelativeTime, formatDuration, canCancelPipeline, canRetryPipeline } from '../utils/pipeline.js';
  
  export let pipelines = [];
  export let itemHeight = 200;
  export let containerHeight = 600;
  export let onViewPipeline = () => {};
  export let onCancelPipeline = () => {};
  export let onRetryPipeline = () => {};
  export let onToggleSelection = () => {};
  export let selectedPipelines = new Set();
  
  let containerElement;
  let scrollTop = 0;
  let virtualScroller;
  let visiblePipelines = [];
  let offsetY = 0;
  let totalHeight = 0;
  
  $: {
    if (virtualScroller && pipelines) {
      const result = virtualScroller.getVisibleItems(pipelines, scrollTop);
      visiblePipelines = result.visibleItems;
      offsetY = result.offsetY;
      totalHeight = result.totalHeight;
    }
  }
  
  onMount(() => {
    virtualScroller = new VirtualScrollManager({
      itemHeight,
      containerHeight,
      overscan: 3
    });
    
    // Update container height if element is available
    if (containerElement) {
      const rect = containerElement.getBoundingClientRect();
      virtualScroller.setContainerHeight(rect.height);
    }
  });
  
  function handleScroll(event) {
    scrollTop = event.target.scrollTop;
  }
  
  function getProgressColor(progress, status) {
    if (status === 'failed') return 'bg-accent-error';
    if (status === 'completed') return 'bg-accent-success';
    if (status === 'running') return 'bg-accent-primary';
    return 'bg-gray-600';
  }
</script>

<div 
  bind:this={containerElement}
  class="virtual-pipeline-list overflow-y-auto"
  style="height: {containerHeight}px;"
  on:scroll={handleScroll}
>
  <div class="relative" style="height: {totalHeight}px;">
    <div class="absolute w-full" style="transform: translateY({offsetY}px);">
      {#each visiblePipelines as pipeline (pipeline.id)}
        <div 
          class="cyber-panel p-4 sm:p-6 mb-4 hover:border-accent-primary transition-all cursor-pointer group touch-manipulation active:scale-[0.98]"
          style="height: {itemHeight}px;"
        >
          <!-- Selection Checkbox -->
          <div class="flex items-start justify-between mb-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedPipelines.has(pipeline.id)}
                on:change={() => onToggleSelection(pipeline.id)}
                class="rounded border-white/20 bg-bg-secondary text-accent-primary focus:ring-accent-primary focus:ring-offset-0"
              />
              <span class="text-xs text-text-secondary font-code">{pipeline.id}</span>
            </label>
            
            <StatusBadge status={pipeline.status} />
          </div>
          
          <!-- Project Info -->
          <div class="mb-4">
            <h3 class="text-lg font-display font-semibold text-white mb-1 group-hover:text-accent-primary transition-colors">
              {pipeline.projectName}
            </h3>
            <p class="text-sm text-text-secondary">
              Created {formatRelativeTime(pipeline.createdAt)}
            </p>
          </div>
          
          <!-- Progress Bar -->
          <div class="mb-4">
            <div class="flex justify-between text-sm mb-1">
              <span class="text-text-secondary">Progress</span>
              <span class="text-accent-primary font-code">{pipeline.progress}%</span>
            </div>
            <div class="w-full bg-bg-secondary rounded-full h-2">
              <div 
                class={`h-2 rounded-full transition-all duration-500 ${getProgressColor(pipeline.progress, pipeline.status)}`}
                style="width: {pipeline.progress}%"
              ></div>
            </div>
          </div>
          
          <!-- Duration -->
          {#if pipeline.startedAt}
            <div class="text-xs text-text-secondary mb-4 font-code">
              Duration: {formatDuration(pipeline.startedAt, pipeline.completedAt)}
            </div>
          {/if}
          
          <!-- Error Message -->
          {#if pipeline.error}
            <div class="bg-accent-error/10 border border-accent-error/20 rounded-lg p-3 mb-4">
              <p class="text-xs text-accent-error line-clamp-2">{pipeline.error}</p>
            </div>
          {/if}
          
          <!-- Resources -->
          {#if pipeline.resources && pipeline.resources.length > 0}
            <div class="mb-4">
              <p class="text-xs text-text-secondary mb-2">Resources:</p>
              <div class="flex flex-wrap gap-1">
                {#each pipeline.resources.slice(0, 3) as resource}
                  <a
                    href={resource.url}
                    target="_blank"
                    class="text-xs bg-accent-primary/10 text-accent-primary px-2 py-1 rounded hover:bg-accent-primary/20 transition-colors"
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
            </div>
          {/if}
          
          <!-- Actions -->
          <div class="flex gap-2">
            <button
              type="button"
              on:click={() => onViewPipeline(pipeline.id)}
              class="flex-1 btn-secondary text-sm py-2"
            >
              View Details
            </button>
            
            {#if canCancelPipeline(pipeline)}
              <button
                type="button"
                on:click|stopPropagation={() => onCancelPipeline(pipeline.id)}
                class="btn-destructive text-sm px-3 py-2"
              >
                Cancel
              </button>
            {/if}
            
            {#if canRetryPipeline(pipeline)}
              <button
                type="button"
                on:click|stopPropagation={() => onRetryPipeline(pipeline.id)}
                class="btn-secondary text-sm px-3 py-2"
              >
                Retry
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .virtual-pipeline-list {
    scrollbar-width: thin;
    scrollbar-color: rgba(58, 184, 255, 0.3) rgba(255, 255, 255, 0.05);
  }
  
  .virtual-pipeline-list::-webkit-scrollbar {
    width: 8px;
  }
  
  .virtual-pipeline-list::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
  }
  
  .virtual-pipeline-list::-webkit-scrollbar-thumb {
    background: rgba(58, 184, 255, 0.3);
    border-radius: 4px;
  }
  
  .virtual-pipeline-list::-webkit-scrollbar-thumb:hover {
    background: rgba(58, 184, 255, 0.5);
  }
  
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
