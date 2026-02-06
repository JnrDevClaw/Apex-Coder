<script>
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { 
    pipelines, 
    filteredPipelines, 
    pipelineStats, 
    pipelineFilters,
    setPipelineFilters,
    cancelPipeline,
    retryPipeline
  } from '../stores/mockPipeline.js';
  import { formatRelativeTime, formatDuration, canCancelPipeline, canRetryPipeline } from '../utils/pipeline.js';
  import { handleKeyboardNavigation, announceToScreenReader } from '../utils/accessibility.js';
  import { keyboardNavigationEnabled, announceProgress } from '../stores/accessibility.js';
  import { t } from '../utils/i18n.js';
  import { eventStreamManager } from '../services/eventStreamManager.js';
  import StatusBadge from './StatusBadge.svelte';
  import PipelineStageCard from './PipelineStageCard.svelte';
  
  // Component state
  let searchQuery = '';
  let showFilters = false;
  let selectedPipelines = new Set();
  let viewMode = 'grid'; // 'grid' or 'list'
  let searchInput;
  
  // Keyboard shortcuts
  function handleGlobalKeyDown(event) {
    if (!$keyboardNavigationEnabled) return;
    
    const handlers = {
      '/': () => {
        if (searchInput) {
          searchInput.focus();
        }
      },
      'n': () => {
        handleCreatePipeline();
      },
      'r': () => {
        // Refresh pipelines
        pipelines.update(p => p);
        if ($announceProgress) {
          announceToScreenReader('Pipeline list refreshed', 'polite');
        }
      },
      'g': () => {
        viewMode = 'grid';
        if ($announceProgress) {
          announceToScreenReader('Switched to grid view', 'polite');
        }
      },
      'l': () => {
        viewMode = 'list';
        if ($announceProgress) {
          announceToScreenReader('Switched to list view', 'polite');
        }
      }
    };
    
    handleKeyboardNavigation(event, handlers);
  }
  
  onMount(() => {
    // Only add event listeners in browser environment
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', handleGlobalKeyDown);
    }
    
    // Add some mock pipelines if none exist
    if ($pipelines.size === 0) {
      addMockPipelines();
    }
    
    // Subscribe to WebSocket updates for all running pipelines
    const runningPipelines = Array.from($pipelines.values()).filter(
      p => p.status === 'running' || p.status === 'pending'
    );
    
    runningPipelines.forEach(pipeline => {
      eventStreamManager.connect(pipeline.id);
    });
    
    // Return cleanup function
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('keydown', handleGlobalKeyDown);
      }
      eventStreamManager.disconnectAll();
    };
  });
  
  function addMockPipelines() {
    const mockPipelines = [
      {
        id: 'pipeline_1',
        projectName: 'E-commerce Platform',
        userId: 'user_1',
        status: 'running',
        progress: 65,
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        startedAt: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
        stages: [
          { 
            id: 'creating_specs', 
            status: 'created', 
            label: 'Creating specs.json',
            description: 'Generate app specifications from questionnaire and inferred logic',
            supportsMultipleEvents: false
          },
          { 
            id: 'creating_docs', 
            status: 'created', 
            label: 'Creating docs',
            description: 'Generate documentation files, readmes, guides',
            supportsMultipleEvents: false
          },
          { 
            id: 'creating_schema', 
            status: 'running', 
            label: 'Creating schema',
            description: 'Create schema definitions (DB, API shape, domain objects)',
            supportsMultipleEvents: true,
            events: [
              {
                id: 'schema_1',
                message: 'Analyzing data requirements',
                status: 'done',
                timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
                details: 'Identified 5 main entities'
              },
              {
                id: 'schema_2',
                message: 'Generating database schema',
                status: 'running',
                timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
                details: 'Creating tables and relationships'
              },
              {
                id: 'schema_3',
                message: 'Validating schema integrity',
                status: 'pending',
                timestamp: null,
                details: null
              }
            ]
          },
          { 
            id: 'creating_workspace', 
            status: 'pending', 
            label: 'Creating workspace',
            description: 'Prepare folders, configs, project directory',
            supportsMultipleEvents: false
          }
        ],
        resources: []
      },
      {
        id: 'pipeline_2',
        projectName: 'Task Management App',
        userId: 'user_1',
        status: 'completed',
        progress: 100,
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
        startedAt: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
        completedAt: new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString(),
        stages: [
          { 
            id: 'creating_specs', 
            status: 'created', 
            label: 'Creating specs.json',
            description: 'Generate app specifications from questionnaire and inferred logic',
            supportsMultipleEvents: false
          },
          { 
            id: 'creating_docs', 
            status: 'created', 
            label: 'Creating docs',
            description: 'Generate documentation files, readmes, guides',
            supportsMultipleEvents: false
          },
          { 
            id: 'coding_file', 
            status: 'done', 
            label: 'Coding files',
            description: 'Generate production-ready code for each file',
            supportsMultipleEvents: true,
            events: [
              {
                id: 'file_1',
                message: 'Generated src/components/TaskList.svelte',
                status: 'done',
                timestamp: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
                details: 'Component with full CRUD functionality'
              },
              {
                id: 'file_2',
                message: 'Generated src/routes/api/tasks/+server.js',
                status: 'done',
                timestamp: new Date(Date.now() - 22.5 * 60 * 60 * 1000).toISOString(),
                details: 'REST API endpoints for task management'
              }
            ]
          },
          { 
            id: 'deployment_complete', 
            status: 'deployed', 
            label: 'App deployed',
            description: 'Final deployment result with all resource links',
            supportsMultipleEvents: false
          }
        ],
        resources: [
          { type: 'repository', name: 'task-app-repo', url: 'https://github.com/user/task-app' },
          { type: 'deployment', name: 'Live App', url: 'https://task-app.vercel.app' }
        ]
      },
      {
        id: 'pipeline_3',
        projectName: 'Blog CMS',
        userId: 'user_1',
        status: 'failed',
        progress: 45,
        createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
        startedAt: new Date(Date.now() - 5.5 * 60 * 60 * 1000).toISOString(),
        completedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        stages: [
          { 
            id: 'creating_specs', 
            status: 'created', 
            label: 'Creating specs.json',
            description: 'Generate app specifications from questionnaire and inferred logic',
            supportsMultipleEvents: false
          },
          { 
            id: 'creating_docs', 
            status: 'failed', 
            label: 'Creating docs',
            description: 'Generate documentation files, readmes, guides',
            error: 'Schema validation failed: Invalid database configuration',
            supportsMultipleEvents: false
          }
        ],
        error: 'Schema validation failed: Invalid database configuration',
        resources: []
      }
    ];
    
    mockPipelines.forEach(pipeline => {
      pipelines.update(map => {
        const newMap = new Map(map);
        newMap.set(pipeline.id, pipeline);
        return newMap;
      });
    });
  }
  
  // Computed values
  $: filteredBySearch = $filteredPipelines.filter(pipeline => 
    pipeline.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    pipeline.id.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Event handlers
  function handleCreatePipeline() {
    goto('/questionnaire');
  }
  
  function handleViewPipeline(pipelineId) {
    goto(`/build/${pipelineId}`);
  }
  
  function handleCancelPipeline(pipelineId) {
    if (confirm('Are you sure you want to cancel this pipeline?')) {
      cancelPipeline(pipelineId);
      if ($announceProgress) {
        announceToScreenReader('Pipeline cancelled', 'assertive');
      }
    }
  }
  
  function handleRetryPipeline(pipelineId) {
    if (confirm('Are you sure you want to retry this pipeline?')) {
      retryPipeline(pipelineId);
      if ($announceProgress) {
        announceToScreenReader('Pipeline retry initiated', 'assertive');
      }
    }
  }
  
  function handleBulkAction(action) {
    if (selectedPipelines.size === 0) return;
    
    const pipelineIds = Array.from(selectedPipelines);
    
    switch (action) {
      case 'cancel':
        if (confirm(`Cancel ${pipelineIds.length} selected pipelines?`)) {
          pipelineIds.forEach(id => cancelPipeline(id));
          selectedPipelines.clear();
        }
        break;
      case 'retry':
        if (confirm(`Retry ${pipelineIds.length} selected pipelines?`)) {
          pipelineIds.forEach(id => retryPipeline(id));
          selectedPipelines.clear();
        }
        break;
    }
  }
  
  function togglePipelineSelection(pipelineId) {
    if (selectedPipelines.has(pipelineId)) {
      selectedPipelines.delete(pipelineId);
    } else {
      selectedPipelines.add(pipelineId);
    }
    selectedPipelines = selectedPipelines; // Trigger reactivity
  }
  
  function selectAllPipelines() {
    if (selectedPipelines.size === filteredBySearch.length) {
      selectedPipelines.clear();
    } else {
      selectedPipelines = new Set(filteredBySearch.map(p => p.id));
    }
  }
  
  function updateFilters(newFilters) {
    setPipelineFilters(newFilters);
  }
  
  function getStatusColor(status) {
    const colors = {
      pending: 'text-gray-400',
      running: 'text-accent-primary',
      completed: 'text-accent-success',
      failed: 'text-accent-error',
      cancelled: 'text-gray-500'
    };
    return colors[status] || 'text-gray-400';
  }
  
  function getProgressColor(progress, status) {
    if (status === 'failed') return 'bg-accent-error';
    if (status === 'completed') return 'bg-accent-success';
    if (status === 'running') return 'bg-accent-primary';
    return 'bg-gray-600';
  }
</script>

<div class="pipeline-dashboard max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
  <!-- Header -->
  <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6 sm:mb-8">
    <div>
      <h1 class="text-2xl sm:text-3xl lg:text-4xl font-display font-bold text-white mb-1 sm:mb-2">
        Pipeline <span class="text-accent-primary">Dashboard</span>
      </h1>
      <p class="text-sm sm:text-base text-text-secondary font-body">
        Monitor and manage your AI application build pipelines
      </p>
    </div>
    
    <div class="flex flex-col sm:flex-row gap-2 sm:gap-3">
      <button
        type="button"
        on:click={handleCreatePipeline}
        class="btn-primary flex items-center justify-center gap-2 touch-manipulation active:scale-95 transition-transform"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
        </svg>
        <span class="hidden sm:inline">New Pipeline</span>
        <span class="sm:hidden">New</span>
      </button>
      
      <button
        type="button"
        on:click={() => showFilters = !showFilters}
        class="btn-secondary flex items-center justify-center gap-2 touch-manipulation active:scale-95 transition-transform"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.414A1 1 0 013 6.707V4z"></path>
        </svg>
        Filters
      </button>
    </div>
  </div>
  
  <!-- Stats Cards -->
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6 sm:mb-8">
    <div class="cyber-panel p-3 sm:p-4 touch-manipulation active:scale-95 transition-transform">
      <div class="text-xl sm:text-2xl font-display font-bold text-white">{$pipelineStats.total}</div>
      <div class="text-xs sm:text-sm text-text-secondary">Total</div>
    </div>
    
    <div class="cyber-panel p-3 sm:p-4 touch-manipulation active:scale-95 transition-transform">
      <div class="text-xl sm:text-2xl font-display font-bold text-accent-primary">{$pipelineStats.running || 0}</div>
      <div class="text-xs sm:text-sm text-text-secondary">Running</div>
    </div>
    
    <div class="cyber-panel p-3 sm:p-4 touch-manipulation active:scale-95 transition-transform">
      <div class="text-xl sm:text-2xl font-display font-bold text-accent-success">{$pipelineStats.completed || 0}</div>
      <div class="text-xs sm:text-sm text-text-secondary">Completed</div>
    </div>
    
    <div class="cyber-panel p-3 sm:p-4 touch-manipulation active:scale-95 transition-transform">
      <div class="text-xl sm:text-2xl font-display font-bold text-accent-error">{$pipelineStats.failed || 0}</div>
      <div class="text-xs sm:text-sm text-text-secondary">Failed</div>
    </div>
    
    <div class="cyber-panel p-3 sm:p-4 touch-manipulation active:scale-95 transition-transform col-span-2 sm:col-span-1">
      <div class="text-xl sm:text-2xl font-display font-bold text-gray-400">{$pipelineStats.pending || 0}</div>
      <div class="text-xs sm:text-sm text-text-secondary">Pending</div>
    </div>
  </div>
  
  <!-- Search and Controls -->
  <div class="flex flex-col sm:flex-row gap-4 mb-6">
    <!-- Search -->
    <div class="flex-1">
      <div class="relative">
        <svg class="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
        </svg>
        <input
          type="text"
          bind:value={searchQuery}
          bind:this={searchInput}
          placeholder="Search pipelines..."
          aria-label="Search pipelines"
          class="w-full bg-bg-secondary border border-white/10 rounded-lg pl-10 pr-4 py-3 text-white placeholder-text-secondary focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/30 outline-none transition-all"
        />
      </div>
    </div>
    
    <!-- View Mode Toggle -->
    <div class="flex items-center gap-2 order-first sm:order-none">
      <button
        type="button"
        on:click={() => viewMode = 'grid'}
        class={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-accent-primary text-black' : 'bg-bg-secondary text-text-secondary hover:text-white'}`}
        aria-label="Grid view"
        title="Grid view"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
        </svg>
      </button>
      
      <button
        type="button"
        on:click={() => viewMode = 'list'}
        class={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-accent-primary text-black' : 'bg-bg-secondary text-text-secondary hover:text-white'}`}
        aria-label="List view"
        title="List view"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path>
        </svg>
      </button>
    </div>
    
    <!-- Bulk Actions -->
    {#if selectedPipelines.size > 0}
      <div class="flex items-center gap-2">
        <span class="text-sm text-text-secondary">{selectedPipelines.size} selected</span>
        <button
          type="button"
          on:click={() => handleBulkAction('cancel')}
          class="btn-destructive text-sm px-3 py-1"
        >
          Cancel
        </button>
        <button
          type="button"
          on:click={() => handleBulkAction('retry')}
          class="btn-secondary text-sm px-3 py-1"
        >
          Retry
        </button>
      </div>
    {/if}
  </div>
  
  <!-- Filters Panel -->
  {#if showFilters}
    <div class="cyber-panel p-6 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- Status Filter -->
        <div>
          <label for="status-filter" class="block text-sm font-medium text-white mb-2">Status</label>
          <select
            id="status-filter"
            value={$pipelineFilters.status}
            on:change={(e) => updateFilters({ status: e.target.value })}
            class="w-full bg-bg-secondary border border-white/10 rounded-lg px-3 py-2 text-white focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/30 outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        
        <!-- Sort By -->
        <div>
          <label for="sort-by-filter" class="block text-sm font-medium text-white mb-2">Sort By</label>
          <select
            id="sort-by-filter"
            value={$pipelineFilters.sortBy}
            on:change={(e) => updateFilters({ sortBy: e.target.value })}
            class="w-full bg-bg-secondary border border-white/10 rounded-lg px-3 py-2 text-white focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/30 outline-none"
          >
            <option value="createdAt">Created Date</option>
            <option value="projectName">Project Name</option>
            <option value="status">Status</option>
            <option value="progress">Progress</option>
          </select>
        </div>
        
        <!-- Sort Order -->
        <div>
          <label for="sort-order-filter" class="block text-sm font-medium text-white mb-2">Order</label>
          <select
            id="sort-order-filter"
            value={$pipelineFilters.sortOrder}
            on:change={(e) => updateFilters({ sortOrder: e.target.value })}
            class="w-full bg-bg-secondary border border-white/10 rounded-lg px-3 py-2 text-white focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/30 outline-none"
          >
            <option value="desc">Newest First</option>
            <option value="asc">Oldest First</option>
          </select>
        </div>
      </div>
    </div>
  {/if}
  
  <!-- Pipeline List/Grid -->
  {#if filteredBySearch.length === 0}
    <div class="text-center py-12">
      <svg class="w-16 h-16 text-text-secondary mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
      </svg>
      <h3 class="text-xl font-display font-semibold text-white mb-2">No Pipelines Found</h3>
      <p class="text-text-secondary mb-6">
        {searchQuery ? 'No pipelines match your search criteria.' : 'Get started by creating your first pipeline.'}
      </p>
      <button
        type="button"
        on:click={handleCreatePipeline}
        class="btn-primary"
      >
        Create New Pipeline
      </button>
    </div>
  {:else}
    <!-- Select All Checkbox -->
    <div class="flex items-center gap-3 mb-4">
      <label class="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={selectedPipelines.size === filteredBySearch.length && filteredBySearch.length > 0}
          on:change={selectAllPipelines}
          class="rounded border-white/20 bg-bg-secondary text-accent-primary focus:ring-accent-primary focus:ring-offset-0"
        />
        Select All ({filteredBySearch.length})
      </label>
    </div>
    
    <!-- Grid View -->
    {#if viewMode === 'grid'}
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        {#each filteredBySearch as pipeline (pipeline.id)}
          <div class="cyber-panel p-4 sm:p-6 hover:border-accent-primary transition-all cursor-pointer group touch-manipulation active:scale-[0.98]">
            <!-- Selection Checkbox -->
            <div class="flex items-start justify-between mb-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedPipelines.has(pipeline.id)}
                  on:change={() => togglePipelineSelection(pipeline.id)}
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
                <p class="text-xs text-accent-error">{pipeline.error}</p>
              </div>
            {/if}
            
            <!-- Resources -->
            {#if pipeline.resources && pipeline.resources.length > 0}
              <div class="mb-4">
                <p class="text-xs text-text-secondary mb-2">Resources:</p>
                <div class="flex flex-wrap gap-1">
                  {#each pipeline.resources as resource}
                    <a
                      href={resource.url}
                      target="_blank"
                      class="text-xs bg-accent-primary/10 text-accent-primary px-2 py-1 rounded hover:bg-accent-primary/20 transition-colors"
                    >
                      {resource.name}
                    </a>
                  {/each}
                </div>
              </div>
            {/if}
            
            <!-- Actions -->
            <div class="flex gap-2">
              <button
                type="button"
                on:click={() => handleViewPipeline(pipeline.id)}
                class="flex-1 btn-secondary text-sm py-2"
              >
                View Details
              </button>
              
              {#if canCancelPipeline(pipeline)}
                <button
                  type="button"
                  on:click|stopPropagation={() => handleCancelPipeline(pipeline.id)}
                  class="btn-destructive text-sm px-3 py-2"
                >
                  Cancel
                </button>
              {/if}
              
              {#if canRetryPipeline(pipeline)}
                <button
                  type="button"
                  on:click|stopPropagation={() => handleRetryPipeline(pipeline.id)}
                  class="btn-secondary text-sm px-3 py-2"
                >
                  Retry
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <!-- List View -->
      <div class="cyber-panel overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-white/10">
                <th class="text-left py-3 px-4 text-sm font-medium text-text-secondary">
                  <input
                    type="checkbox"
                    checked={selectedPipelines.size === filteredBySearch.length && filteredBySearch.length > 0}
                    on:change={selectAllPipelines}
                    class="rounded border-white/20 bg-bg-secondary text-accent-primary focus:ring-accent-primary focus:ring-offset-0"
                  />
                </th>
                <th class="text-left py-3 px-4 text-sm font-medium text-text-secondary">Project</th>
                <th class="text-left py-3 px-4 text-sm font-medium text-text-secondary">Status</th>
                <th class="text-left py-3 px-4 text-sm font-medium text-text-secondary">Progress</th>
                <th class="text-left py-3 px-4 text-sm font-medium text-text-secondary">Created</th>
                <th class="text-left py-3 px-4 text-sm font-medium text-text-secondary">Duration</th>
                <th class="text-left py-3 px-4 text-sm font-medium text-text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredBySearch as pipeline (pipeline.id)}
                <tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td class="py-3 px-4">
                    <input
                      type="checkbox"
                      checked={selectedPipelines.has(pipeline.id)}
                      on:change={() => togglePipelineSelection(pipeline.id)}
                      class="rounded border-white/20 bg-bg-secondary text-accent-primary focus:ring-accent-primary focus:ring-offset-0"
                    />
                  </td>
                  <td class="py-3 px-4">
                    <div>
                      <div class="font-medium text-white">{pipeline.projectName}</div>
                      <div class="text-xs text-text-secondary font-code">{pipeline.id}</div>
                    </div>
                  </td>
                  <td class="py-3 px-4">
                    <StatusBadge status={pipeline.status} />
                  </td>
                  <td class="py-3 px-4">
                    <div class="flex items-center gap-2">
                      <div class="w-16 bg-bg-secondary rounded-full h-2">
                        <div 
                          class={`h-2 rounded-full transition-all ${getProgressColor(pipeline.progress, pipeline.status)}`}
                          style="width: {pipeline.progress}%"
                        ></div>
                      </div>
                      <span class="text-xs text-accent-primary font-code">{pipeline.progress}%</span>
                    </div>
                  </td>
                  <td class="py-3 px-4 text-sm text-text-secondary">
                    {formatRelativeTime(pipeline.createdAt)}
                  </td>
                  <td class="py-3 px-4 text-sm text-text-secondary font-code">
                    {pipeline.startedAt ? formatDuration(pipeline.startedAt, pipeline.completedAt) : '-'}
                  </td>
                  <td class="py-3 px-4">
                    <div class="flex gap-1">
                      <button
                        type="button"
                        on:click={() => handleViewPipeline(pipeline.id)}
                        class="btn-secondary text-xs px-2 py-1"
                      >
                        View
                      </button>
                      
                      {#if canCancelPipeline(pipeline)}
                        <button
                          type="button"
                          on:click={() => handleCancelPipeline(pipeline.id)}
                          class="btn-destructive text-xs px-2 py-1"
                        >
                          Cancel
                        </button>
                      {/if}
                      
                      {#if canRetryPipeline(pipeline)}
                        <button
                          type="button"
                          on:click={() => handleRetryPipeline(pipeline.id)}
                          class="btn-secondary text-xs px-2 py-1"
                        >
                          Retry
                        </button>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .pipeline-dashboard {
    animation: fadeIn 0.5s ease-in;
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
