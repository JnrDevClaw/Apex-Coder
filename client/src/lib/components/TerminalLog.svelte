<script>
  import { onMount, afterUpdate } from 'svelte';
  
  export let logs = [];
  export let height = "h-64";
  export let autoScroll = true;
  export let showTimestamps = true;
  export let showSearch = true;
  
  let logContainer;
  let searchQuery = '';
  let filterType = 'all'; // all, error, success, info, warning
  
  $: filteredLogs = logs.filter(log => {
    // Filter by type
    if (filterType !== 'all' && log.type !== filterType) {
      return false;
    }
    
    // Filter by search query
    if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    
    return true;
  });
  
  afterUpdate(() => {
    if (autoScroll && logContainer) {
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  });
  
  function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  }
  
  function clearLogs() {
    logs = [];
  }
</script>

<div class="terminal-log-container">
  {#if showSearch}
    <div class="log-controls flex items-center gap-2 mb-2 flex-wrap">
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search logs..."
        class="flex-1 min-w-[200px] bg-bg-secondary border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder-white/40 focus:border-accent-primary focus:outline-none"
      />
      
      <select
        bind:value={filterType}
        class="bg-bg-secondary border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:border-accent-primary focus:outline-none"
      >
        <option value="all">All</option>
        <option value="info">Info</option>
        <option value="success">Success</option>
        <option value="warning">Warning</option>
        <option value="error">Error</option>
      </select>
      
      <label class="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
        <input type="checkbox" bind:checked={autoScroll} class="rounded" />
        Auto-scroll
      </label>
      
      <button
        on:click={clearLogs}
        class="px-3 py-1.5 text-xs bg-bg-secondary border border-white/10 rounded text-white/60 hover:text-white hover:border-white/20 transition-colors"
      >
        Clear
      </button>
    </div>
  {/if}
  
  <div 
    bind:this={logContainer}
    class={`bg-black/40 p-4 rounded-xl font-mono text-sm overflow-auto border border-white/5 ${height}`}
  >
    {#if filteredLogs.length === 0}
      <div class="text-white/40">
        {logs.length === 0 ? 'Waiting for pipeline output...' : 'No logs match your filters'}
      </div>
    {:else}
      {#each filteredLogs as log, index}
        <div 
          class={`log-line flex gap-2 hover:bg-white/5 px-2 py-0.5 -mx-2 rounded transition-colors
            ${log.type === 'error' ? 'text-accent-error' : ''}
            ${log.type === 'success' ? 'text-accent-success' : ''}
            ${log.type === 'info' ? 'text-accent-primary' : ''}
            ${log.type === 'warning' ? 'text-accent-secondary' : ''}
            ${!log.type ? 'text-white/80' : ''}`
          }
        >
          {#if showTimestamps}
            <span class="text-white/30 text-xs shrink-0 w-20">
              {formatTimestamp(log.timestamp || Date.now())}
            </span>
          {/if}
          
          <div class="flex-1 break-words">
            {#if log.prefix}
              <span class="text-accent-primary font-semibold">[{log.prefix}]</span>
            {/if}
            
            {#if log.icon}
              <span class="mr-1">{log.icon}</span>
            {/if}
            
            <span>{log.message}</span>
            
            {#if log.details}
              <div class="text-xs text-white/50 mt-1 ml-4">
                {log.details}
              </div>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>
  
  {#if filteredLogs.length > 0}
    <div class="log-footer text-xs text-white/40 mt-2">
      Showing {filteredLogs.length} of {logs.length} logs
    </div>
  {/if}
</div>

<style>
  .log-line {
    line-height: 1.6;
  }
  
  .terminal-log-container {
    width: 100%;
  }
</style>
