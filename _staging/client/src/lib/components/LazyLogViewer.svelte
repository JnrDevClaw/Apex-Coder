<script>
  import { onMount, onDestroy } from 'svelte';
  import { LazyLoadManager, chunkArray } from '../utils/performance.js';
  import TerminalLog from './TerminalLog.svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  
  export let pipelineId;
  export let loadLogs = async (id, offset = 0, limit = 100) => [];
  export let autoScroll = true;
  
  let logs = [];
  let loading = false;
  let hasMore = true;
  let offset = 0;
  let limit = 100;
  let containerElement;
  let observer;
  let lazyManager;
  let loadMoreTrigger;
  
  onMount(() => {
    lazyManager = new LazyLoadManager();
    
    // Load initial logs
    loadInitialLogs();
    
    // Create intersection observer for infinite scroll
    observer = lazyManager.createObserver(
      async (target) => {
        if (hasMore && !loading) {
          await loadMoreLogs();
        }
      },
      {
        rootMargin: '200px',
        threshold: 0.01
      }
    );
    
    // Observe the load more trigger
    if (loadMoreTrigger) {
      observer.observe(loadMoreTrigger);
    }
  });
  
  onDestroy(() => {
    if (observer) {
      observer.disconnect();
    }
    if (lazyManager) {
      lazyManager.clear();
    }
  });
  
  async function loadInitialLogs() {
    loading = true;
    
    try {
      const newLogs = await loadLogs(pipelineId, 0, limit);
      logs = newLogs;
      offset = newLogs.length;
      hasMore = newLogs.length === limit;
    } catch (err) {
      console.error('Error loading logs:', err);
    } finally {
      loading = false;
    }
  }
  
  async function loadMoreLogs() {
    if (loading || !hasMore) return;
    
    loading = true;
    
    try {
      const newLogs = await loadLogs(pipelineId, offset, limit);
      
      if (newLogs.length > 0) {
        logs = [...logs, ...newLogs];
        offset += newLogs.length;
        hasMore = newLogs.length === limit;
      } else {
        hasMore = false;
      }
    } catch (err) {
      console.error('Error loading more logs:', err);
    } finally {
      loading = false;
    }
  }
  
  function handleRefresh() {
    logs = [];
    offset = 0;
    hasMore = true;
    loadInitialLogs();
  }
</script>

<div bind:this={containerElement} class="lazy-log-viewer">
  {#if logs.length === 0 && loading}
    <LoadingSkeleton height="300px" />
  {:else}
    <div class="mb-4 flex items-center justify-between">
      <div class="text-sm text-text-secondary">
        {logs.length} log entries
      </div>
      <button
        type="button"
        on:click={handleRefresh}
        class="btn-secondary text-sm px-3 py-1"
        disabled={loading}
      >
        <svg class="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
        </svg>
        Refresh
      </button>
    </div>
    
    <TerminalLog {logs} {autoScroll} />
    
    {#if hasMore}
      <div bind:this={loadMoreTrigger} class="load-more-trigger py-4 text-center">
        {#if loading}
          <div class="inline-flex items-center gap-2 text-accent-primary">
            <svg class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Loading more logs...</span>
          </div>
        {:else}
          <button
            type="button"
            on:click={loadMoreLogs}
            class="btn-secondary text-sm"
          >
            Load More
          </button>
        {/if}
      </div>
    {:else if logs.length > 0}
      <div class="py-4 text-center text-sm text-text-secondary">
        No more logs to load
      </div>
    {/if}
  {/if}
</div>

<style>
  .lazy-log-viewer {
    min-height: 200px;
  }
  
  .load-more-trigger {
    min-height: 50px;
  }
</style>
