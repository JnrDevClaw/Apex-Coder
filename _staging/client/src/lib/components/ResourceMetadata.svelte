<!--
  Resource Metadata Component
  Displays resource metadata in an organized, expandable format
  Requirements: 5.1, 5.4
-->
<script>
  import { createEventDispatcher } from 'svelte';
  
  export let metadata;
  export let compact = false;
  export let onCopy = null;
  
  const dispatch = createEventDispatcher();
  
  let isExpanded = false;
  
  function toggleExpanded() {
    isExpanded = !isExpanded;
  }
  
  function handleCopy() {
    if (onCopy) {
      onCopy();
    } else {
      dispatch('copy', { metadata });
    }
  }
  
  function formatMetadataValue(value) {
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }
  
  function getMetadataEntries() {
    if (!metadata || typeof metadata !== 'object') return [];
    
    return Object.entries(metadata).filter(([key, value]) => 
      value !== null && value !== undefined && value !== ''
    );
  }
  
  function getDisplayValue(value) {
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        return value.length > 0 ? value.join(', ') : 'Empty array';
      }
      return 'Object';
    }
    if (typeof value === 'string' && value.length > 50 && !isExpanded) {
      return value.substring(0, 50) + '...';
    }
    return String(value);
  }
  
  function formatKey(key) {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .replace(/_/g, ' ');
  }
  
  $: metadataEntries = getMetadataEntries();
  $: hasMetadata = metadataEntries.length > 0;
</script>

{#if hasMetadata}
  <div class="resource-metadata" class:compact>
    <div class="flex items-center justify-between mb-2">
      <button
        type="button"
        on:click={toggleExpanded}
        class="flex items-center gap-2 text-sm text-text-secondary hover:text-white transition-colors"
      >
        <svg 
          class="w-3 h-3 transition-transform" 
          class:rotate-90={isExpanded}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
        </svg>
        <span>Metadata ({metadataEntries.length} {metadataEntries.length === 1 ? 'item' : 'items'})</span>
      </button>
      
      {#if isExpanded}
        <button
          type="button"
          on:click|stopPropagation={handleCopy}
          class="p-1 hover:bg-white/10 rounded transition-colors"
          title="Copy metadata"
        >
          <svg class="w-3 h-3 text-text-secondary hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
          </svg>
        </button>
      {/if}
    </div>
    
    {#if isExpanded}
      <div class="metadata-content bg-bg-secondary rounded border border-white/5 p-3 space-y-2">
        {#each metadataEntries as [key, value]}
          <div class="metadata-item">
            <div class="flex items-start justify-between gap-2">
              <dt class="text-xs font-medium text-text-secondary uppercase tracking-wide flex-shrink-0">
                {formatKey(key)}
              </dt>
              <dd class="text-sm text-white text-right flex-1 min-w-0">
                {#if typeof value === 'object' && value !== null}
                  <details class="group">
                    <summary class="cursor-pointer text-accent-primary hover:text-accent-secondary">
                      {Array.isArray(value) ? `Array (${value.length})` : 'Object'}
                    </summary>
                    <pre class="mt-2 text-xs bg-black/20 p-2 rounded overflow-x-auto font-mono">{formatMetadataValue(value)}</pre>
                  </details>
                {:else if typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))}
                  <a 
                    href={value} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    class="text-accent-primary hover:text-accent-secondary underline break-all"
                  >
                    {getDisplayValue(value)}
                  </a>
                {:else}
                  <span class="break-all">{getDisplayValue(value)}</span>
                {/if}
              </dd>
            </div>
          </div>
        {/each}
      </div>
    {:else if !compact}
      <!-- Preview mode - show first few items -->
      <div class="metadata-preview text-xs text-text-secondary">
        {#each metadataEntries.slice(0, 2) as [key, value]}
          <span class="inline-block mr-3">
            <span class="font-medium">{formatKey(key)}:</span>
            <span>{getDisplayValue(value)}</span>
          </span>
        {/each}
        {#if metadataEntries.length > 2}
          <span class="text-accent-primary">+{metadataEntries.length - 2} more</span>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .metadata-item {
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    padding-bottom: 0.5rem;
  }
  
  .metadata-item:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
  
  .resource-metadata.compact .metadata-content {
    padding: 0.5rem;
  }
  
  .resource-metadata.compact .metadata-item {
    padding-bottom: 0.25rem;
  }
  
  details[open] summary {
    margin-bottom: 0.5rem;
  }
</style>
