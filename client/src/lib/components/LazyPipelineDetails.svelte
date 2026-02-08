<script>
  import { onMount, onDestroy } from 'svelte';
  import { LazyLoadManager } from '../utils/performance.js';
  import PipelineDetailView from './PipelineDetailView.svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  
  export let pipelineId;
  export let onCancel = null;
  export let onRetry = null;
  export let onRetryStage = null;
  export let loadPipeline = async (id) => null;
  
  let pipeline = null;
  let loading = true;
  let error = null;
  let containerElement;
  let observer;
  let lazyManager;
  
  onMount(() => {
    lazyManager = new LazyLoadManager();
    
    // Create intersection observer for lazy loading
    observer = lazyManager.createObserver(
      async (target) => {
        if (!lazyManager.isLoaded(pipelineId) && !lazyManager.isLoading(pipelineId)) {
          await loadPipelineData();
        }
      },
      {
        rootMargin: '100px',
        threshold: 0.01
      }
    );
    
    // Observe the container element
    if (containerElement) {
      lazyManager.observe(containerElement, pipelineId, observer);
    }
  });
  
  onDestroy(() => {
    if (lazyManager && containerElement) {
      lazyManager.unobserve(containerElement, pipelineId);
    }
    if (observer) {
      observer.disconnect();
    }
  });
  
  async function loadPipelineData() {
    if (lazyManager.isLoaded(pipelineId) || lazyManager.isLoading(pipelineId)) {
      return;
    }
    
    lazyManager.markLoading(pipelineId);
    loading = true;
    error = null;
    
    try {
      pipeline = await loadPipeline(pipelineId);
      lazyManager.markLoaded(pipelineId);
    } catch (err) {
      error = err.message || 'Failed to load pipeline details';
      console.error('Error loading pipeline:', err);
    } finally {
      loading = false;
    }
  }
  
  async function handleRetry() {
    error = null;
    await loadPipelineData();
  }
</script>

<div bind:this={containerElement} class="lazy-pipeline-details">
  {#if loading}
    <div class="cyber-panel p-6">
      <LoadingSkeleton height="400px" />
    </div>
  {:else if error}
    <div class="cyber-panel p-6">
      <div class="text-center">
        <svg class="w-12 h-12 text-accent-error mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <h3 class="text-lg font-display font-semibold text-white mb-2">Failed to Load Pipeline</h3>
        <p class="text-text-secondary mb-4">{error}</p>
        <button
          type="button"
          on:click={handleRetry}
          class="btn-primary"
        >
          Retry
        </button>
      </div>
    </div>
  {:else if pipeline}
    <PipelineDetailView
      {pipeline}
      {onCancel}
      {onRetry}
      {onRetryStage}
    />
  {:else}
    <div class="cyber-panel p-6">
      <div class="text-center">
        <svg class="w-12 h-12 text-text-secondary mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>
        <h3 class="text-lg font-display font-semibold text-white mb-2">Pipeline Not Found</h3>
        <p class="text-text-secondary">The requested pipeline could not be found.</p>
      </div>
    </div>
  {/if}
</div>

<style>
  .lazy-pipeline-details {
    min-height: 200px;
  }
</style>
