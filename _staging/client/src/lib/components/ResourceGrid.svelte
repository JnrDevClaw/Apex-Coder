<!--
  Resource Grid Component
  Displays resources in an organized grid with filtering and categorization
  Requirements: 5.1, 5.2, 5.4
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import ResourceDisplay from './ResourceDisplay.svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  
  export let resources = [];
  export let loading = false;
  export let showMetadata = true;
  export let showActions = true;
  export let compact = false;
  export let groupByType = true;
  export let filterType = 'all';
  export let sortBy = 'name'; // 'name', 'type', 'created'
  export let sortOrder = 'asc'; // 'asc', 'desc'
  
  const dispatch = createEventDispatcher();
  
  let searchQuery = '';
  
  const resourceTypeLabels = {
    repository: 'Repositories',
    deployment: 'Deployments',
    s3: 'S3 Buckets',
    database: 'Databases',
    lambda: 'Lambda Functions',
    api: 'APIs'
  };
  
  const resourceTypeOrder = ['repository', 'deployment', 'api', 's3', 'database', 'lambda'];
  
  function filterResources(resources, filterType, searchQuery) {
    let filtered = resources;
    
    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(resource => resource.type === filterType);
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(resource => 
        resource.name.toLowerCase().includes(query) ||
        resource.url.toLowerCase().includes(query) ||
        resource.type.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }
  
  function sortResources(resources, sortBy, sortOrder) {
    return [...resources].sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'type':
          aValue = a.type;
          bValue = b.type;
          break;
        case 'created':
          aValue = a.metadata?.createdAt || a.metadata?.created || '';
          bValue = b.metadata?.createdAt || b.metadata?.created || '';
          break;
        default:
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
      }
      
      if (sortOrder === 'desc') {
        return bValue > aValue ? 1 : -1;
      } else {
        return aValue > bValue ? 1 : -1;
      }
    });
  }
  
  function groupResourcesByType(resources) {
    const grouped = {};
    
    // Initialize groups in preferred order
    resourceTypeOrder.forEach(type => {
      grouped[type] = [];
    });
    
    // Group resources
    resources.forEach(resource => {
      if (!grouped[resource.type]) {
        grouped[resource.type] = [];
      }
      grouped[resource.type].push(resource);
    });
    
    // Remove empty groups
    Object.keys(grouped).forEach(type => {
      if (grouped[type].length === 0) {
        delete grouped[type];
      }
    });
    
    return grouped;
  }
  
  function getResourceTypeIcon(type) {
    const icons = {
      repository: 'M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z',
      deployment: 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z',
      s3: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10',
      database: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4',
      lambda: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
      api: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'
    };
    return icons[type] || 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14';
  }
  
  function getUniqueResourceTypes(resources) {
    const types = new Set(resources.map(r => r.type));
    return Array.from(types).sort();
  }
  
  $: filteredResources = filterResources(resources, filterType, searchQuery);
  $: sortedResources = sortResources(filteredResources, sortBy, sortOrder);
  $: groupedResources = groupByType ? groupResourcesByType(sortedResources) : null;
  $: availableTypes = getUniqueResourceTypes(resources);
  $: hasResources = resources.length > 0;
  $: hasFilteredResults = filteredResources.length > 0;
</script>

<div class="resource-grid">
  <!-- Header Controls -->
  {#if hasResources}
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
      <!-- Search and Filter -->
      <div class="flex flex-col sm:flex-row gap-3 flex-1">
        <!-- Search -->
        <div class="relative flex-1 max-w-md">
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search resources..."
            class="w-full bg-bg-secondary border border-white/10 rounded-lg px-4 py-2 pl-10
                   text-white placeholder-white/30 focus:border-accent-primary
                   focus:ring-2 focus:ring-accent-primary/30 outline-none transition-all"
          />
          <svg class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
        </div>
        
        <!-- Type Filter -->
        <select
          bind:value={filterType}
          class="bg-bg-secondary border border-white/10 rounded-lg px-3 py-2
                 text-white focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/30 outline-none"
        >
          <option value="all">All Types</option>
          {#each availableTypes as type}
            <option value={type}>{resourceTypeLabels[type] || type}</option>
          {/each}
        </select>
      </div>
      
      <!-- Sort Controls -->
      <div class="flex items-center gap-2">
        <select
          bind:value={sortBy}
          class="bg-bg-secondary border border-white/10 rounded-lg px-3 py-2
                 text-white focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/30 outline-none"
        >
          <option value="name">Sort by Name</option>
          <option value="type">Sort by Type</option>
          <option value="created">Sort by Created</option>
        </select>
        
        <button
          type="button"
          on:click={() => sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'}
          class="p-2 bg-bg-secondary border border-white/10 rounded-lg hover:border-accent-primary transition-colors"
          title="Toggle sort order"
        >
          <svg class="w-4 h-4 text-white" class:rotate-180={sortOrder === 'desc'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"></path>
          </svg>
        </button>
        
        <!-- View Toggle -->
        <button
          type="button"
          on:click={() => groupByType = !groupByType}
          class="p-2 bg-bg-secondary border border-white/10 rounded-lg hover:border-accent-primary transition-colors"
          class:border-accent-primary={groupByType}
          title="Toggle grouping"
        >
          <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14-7H5m14 14H5"></path>
          </svg>
        </button>
      </div>
    </div>
  {/if}
  
  <!-- Loading State -->
  {#if loading}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each Array(6) as _}
        <LoadingSkeleton height="200px" />
      {/each}
    </div>
  
  <!-- Empty State -->
  {:else if !hasResources}
    <div class="cyber-panel p-12 text-center">
      <svg class="w-16 h-16 text-text-secondary mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14-7H5m14 14H5"></path>
      </svg>
      <h3 class="text-xl font-display font-semibold text-white mb-2">No Resources Generated</h3>
      <p class="text-text-secondary max-w-md mx-auto">
        Resources will appear here once your pipeline completes successfully. 
        This includes repositories, deployments, databases, and other generated assets.
      </p>
    </div>
  
  <!-- No Search Results -->
  {:else if !hasFilteredResults}
    <div class="cyber-panel p-8 text-center">
      <svg class="w-12 h-12 text-text-secondary mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
      </svg>
      <h3 class="text-lg font-display font-semibold text-white mb-2">No Resources Found</h3>
      <p class="text-text-secondary">
        No resources match your current search criteria. Try adjusting your filters or search terms.
      </p>
      <button
        type="button"
        on:click={() => { searchQuery = ''; filterType = 'all'; }}
        class="btn-secondary mt-4"
      >
        Clear Filters
      </button>
    </div>
  
  <!-- Grouped Resources -->
  {:else if groupByType && groupedResources}
    <div class="space-y-8">
      {#each Object.entries(groupedResources) as [type, typeResources]}
        <div class="resource-group">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-8 h-8 rounded bg-accent-primary/10 flex items-center justify-center">
              <svg class="w-4 h-4 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={getResourceTypeIcon(type)}></path>
              </svg>
            </div>
            <h3 class="text-lg font-display font-semibold text-white">
              {resourceTypeLabels[type] || type}
            </h3>
            <span class="text-sm text-text-secondary">
              ({typeResources.length})
            </span>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each typeResources as resource (resource.url)}
              <ResourceDisplay 
                {resource} 
                {showMetadata} 
                {showActions} 
                {compact}
                on:validate={() => dispatch('validate', resource)}
                on:copy={() => dispatch('copy', resource)}
              />
            {/each}
          </div>
        </div>
      {/each}
    </div>
  
  <!-- Ungrouped Resources -->
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each sortedResources as resource (resource.url)}
        <ResourceDisplay 
          {resource} 
          {showMetadata} 
          {showActions} 
          {compact}
          on:validate={() => dispatch('validate', resource)}
          on:copy={() => dispatch('copy', resource)}
        />
      {/each}
    </div>
  {/if}
  
  <!-- Results Summary -->
  {#if hasFilteredResults}
    <div class="mt-6 text-center text-sm text-text-secondary">
      Showing {filteredResources.length} of {resources.length} resources
      {#if searchQuery || filterType !== 'all'}
        <button
          type="button"
          on:click={() => { searchQuery = ''; filterType = 'all'; }}
          class="ml-2 text-accent-primary hover:text-accent-secondary underline"
        >
          Clear filters
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .resource-group {
    animation: fadeIn 0.4s ease-in;
  }
  
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
