<!--
  Resource Manager Component
  Main container for resource management with validation, organization, and actions
  Requirements: 5.1, 5.2, 5.4
-->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { showSuccess, showError, showInfo } from '../stores/notifications.js';
  import { testMultipleResources, getResourceHealthStatus } from '../utils/resourceValidation.js';
  import { copyAllResources, copyResourcesByType, copyResourcesAsMarkdown } from '../utils/clipboard.js';
  import ResourceGrid from './ResourceGrid.svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  
  export let resources = [];
  export let loading = false;
  export let autoValidate = true;
  export let showHealthStatus = true;
  export let showBulkActions = true;
  export let compact = false;
  
  const dispatch = createEventDispatcher();
  
  let validationInProgress = false;
  let healthStatus = null;
  let lastValidationTime = null;
  let validationResults = new Map();
  
  // Resource management state
  let selectedResources = new Set();
  let bulkActionType = 'copy-text';
  
  onMount(() => {
    if (autoValidate && resources.length > 0) {
      validateAllResources();
    }
    updateHealthStatus();
  });
  
  // Reactive updates
  $: if (resources) {
    updateHealthStatus();
    if (autoValidate && resources.length > 0 && !validationInProgress) {
      // Debounce validation when resources change
      clearTimeout(validationTimeout);
      validationTimeout = setTimeout(validateAllResources, 1000);
    }
  }
  
  let validationTimeout;
  
  async function validateAllResources() {
    if (validationInProgress || resources.length === 0) return;
    
    validationInProgress = true;
    
    try {
      showInfo('Validating resource accessibility...');
      
      const results = await testMultipleResources(resources, 8000);
      
      // Store validation results
      validationResults.clear();
      results.forEach(({ resource, result }) => {
        validationResults.set(resource.url, result);
      });
      
      lastValidationTime = new Date().toISOString();
      updateHealthStatus();
      
      const accessibleCount = results.filter(r => r.result.isAccessible === true).length;
      const inaccessibleCount = results.filter(r => r.result.isAccessible === false).length;
      
      if (inaccessibleCount === 0) {
        showSuccess(`All ${accessibleCount} resources are accessible`);
      } else {
        showError(`${inaccessibleCount} of ${results.length} resources are not accessible`);
      }
      
      dispatch('validation-complete', { results, healthStatus });
    } catch (error) {
      console.error('Resource validation failed:', error);
      showError('Failed to validate resources: ' + error.message);
    } finally {
      validationInProgress = false;
    }
  }
  
  function updateHealthStatus() {
    // Combine resource data with validation results
    const resourcesWithValidation = resources.map(resource => ({
      ...resource,
      metadata: {
        ...resource.metadata,
        lastValidation: validationResults.get(resource.url)
      }
    }));
    
    healthStatus = getResourceHealthStatus(resourcesWithValidation);
  }
  
  async function handleBulkAction() {
    const selectedResourceList = resources.filter(r => selectedResources.has(r.url));
    
    if (selectedResourceList.length === 0) {
      showError('No resources selected');
      return;
    }
    
    let success = false;
    
    try {
      switch (bulkActionType) {
        case 'copy-text':
          success = await copyAllResources(selectedResourceList);
          break;
        case 'copy-grouped':
          success = await copyResourcesByType(selectedResourceList);
          break;
        case 'copy-markdown':
          success = await copyResourcesAsMarkdown(selectedResourceList);
          break;
        case 'validate':
          await validateSelectedResources(selectedResourceList);
          return;
        case 'export':
          exportResources(selectedResourceList);
          return;
        default:
          showError('Unknown bulk action');
          return;
      }
      
      if (success) {
        showSuccess(`Copied ${selectedResourceList.length} resources to clipboard`);
      } else {
        showError('Failed to copy resources to clipboard');
      }
    } catch (error) {
      console.error('Bulk action failed:', error);
      showError('Bulk action failed: ' + error.message);
    }
  }
  
  async function validateSelectedResources(selectedResourceList) {
    validationInProgress = true;
    
    try {
      showInfo(`Validating ${selectedResourceList.length} selected resources...`);
      
      const results = await testMultipleResources(selectedResourceList, 8000);
      
      // Update validation results
      results.forEach(({ resource, result }) => {
        validationResults.set(resource.url, result);
      });
      
      updateHealthStatus();
      
      const accessibleCount = results.filter(r => r.result.isAccessible === true).length;
      showSuccess(`Validation complete: ${accessibleCount}/${results.length} resources accessible`);
    } catch (error) {
      showError('Validation failed: ' + error.message);
    } finally {
      validationInProgress = false;
    }
  }
  
  function exportResources(resourceList) {
    try {
      const exportData = {
        timestamp: new Date().toISOString(),
        resources: resourceList.map(resource => ({
          ...resource,
          validation: validationResults.get(resource.url)
        })),
        healthStatus
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
        type: 'application/json' 
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `resources-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showSuccess(`Exported ${resourceList.length} resources`);
    } catch (error) {
      console.error('Export failed:', error);
      showError('Failed to export resources');
    }
  }
  
  function toggleResourceSelection(resource) {
    if (selectedResources.has(resource.url)) {
      selectedResources.delete(resource.url);
    } else {
      selectedResources.add(resource.url);
    }
    selectedResources = selectedResources; // Trigger reactivity
  }
  
  function selectAllResources() {
    resources.forEach(resource => selectedResources.add(resource.url));
    selectedResources = selectedResources;
  }
  
  function clearSelection() {
    selectedResources.clear();
    selectedResources = selectedResources;
  }
  
  function getHealthStatusColor(percentage) {
    if (percentage >= 90) return 'text-accent-success';
    if (percentage >= 70) return 'text-yellow-400';
    return 'text-accent-error';
  }
  
  function getHealthStatusIcon(percentage) {
    if (percentage >= 90) return 'check-circle';
    if (percentage >= 70) return 'exclamation-triangle';
    return 'x-circle';
  }
</script>

<div class="resource-manager">
  <!-- Health Status -->
  {#if showHealthStatus && healthStatus && resources.length > 0}
    <div class="cyber-panel p-4 mb-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            {#if healthStatus.healthPercentage >= 90}
              <svg class="w-5 h-5 text-accent-success" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
              </svg>
            {:else if healthStatus.healthPercentage >= 70}
              <svg class="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
              </svg>
            {:else}
              <svg class="w-5 h-5 text-accent-error" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
              </svg>
            {/if}
            
            <h3 class="font-semibold text-white">Resource Health</h3>
          </div>
          
          <div class="flex items-center gap-4 text-sm">
            <span class={`font-medium ${getHealthStatusColor(healthStatus.healthPercentage)}`}>
              {healthStatus.healthPercentage}% Accessible
            </span>
            <span class="text-text-secondary">
              {healthStatus.accessible}/{healthStatus.total} resources
            </span>
          </div>
        </div>
        
        <div class="flex items-center gap-2">
          {#if lastValidationTime}
            <span class="text-xs text-text-secondary">
              Last validated: {new Date(lastValidationTime).toLocaleTimeString()}
            </span>
          {/if}
          
          <button
            type="button"
            on:click={validateAllResources}
            disabled={validationInProgress || resources.length === 0}
            class="btn-secondary text-sm px-3 py-1 flex items-center gap-2"
          >
            {#if validationInProgress}
              <div class="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin"></div>
            {:else}
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
            {/if}
            Validate All
          </button>
        </div>
      </div>
      
      <!-- Health Status Bar -->
      <div class="mt-3">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-xs text-text-secondary">Health Status</span>
        </div>
        <div class="w-full bg-bg-secondary rounded-full h-2 overflow-hidden">
          <div 
            class="h-full transition-all duration-500"
            class:bg-accent-success={healthStatus.healthPercentage >= 90}
            class:bg-yellow-400={healthStatus.healthPercentage >= 70 && healthStatus.healthPercentage < 90}
            class:bg-accent-error={healthStatus.healthPercentage < 70}
            style="width: {healthStatus.healthPercentage}%"
          ></div>
        </div>
      </div>
    </div>
  {/if}
  
  <!-- Bulk Actions -->
  {#if showBulkActions && resources.length > 0}
    <div class="cyber-panel p-4 mb-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div class="flex items-center gap-3">
          <h3 class="font-semibold text-white">Bulk Actions</h3>
          <span class="text-sm text-text-secondary">
            {selectedResources.size} of {resources.length} selected
          </span>
        </div>
        
        <div class="flex items-center gap-2">
          <!-- Selection Controls -->
          <button
            type="button"
            on:click={selectAllResources}
            class="btn-secondary text-sm px-3 py-1"
          >
            Select All
          </button>
          
          <button
            type="button"
            on:click={clearSelection}
            disabled={selectedResources.size === 0}
            class="btn-secondary text-sm px-3 py-1"
          >
            Clear
          </button>
          
          <!-- Action Type -->
          <select
            bind:value={bulkActionType}
            class="bg-bg-secondary border border-white/10 rounded px-3 py-1 text-sm text-white"
          >
            <option value="copy-text">Copy as Text</option>
            <option value="copy-grouped">Copy Grouped</option>
            <option value="copy-markdown">Copy as Markdown</option>
            <option value="validate">Validate Selected</option>
            <option value="export">Export JSON</option>
          </select>
          
          <!-- Execute Action -->
          <button
            type="button"
            on:click={handleBulkAction}
            disabled={selectedResources.size === 0 || validationInProgress}
            class="btn-primary text-sm px-4 py-1"
          >
            Execute
          </button>
        </div>
      </div>
    </div>
  {/if}
  
  <!-- Resource Grid -->
  <ResourceGrid
    {resources}
    {loading}
    showMetadata={true}
    showActions={true}
    {compact}
    on:validate={(event) => dispatch('validate', event.detail)}
    on:copy={(event) => dispatch('copy', event.detail)}
  >
    <!-- Custom resource selection overlay -->
    <div slot="resource-overlay" let:resource>
      {#if showBulkActions}
        <div class="absolute top-2 right-2">
          <input
            type="checkbox"
            checked={selectedResources.has(resource.url)}
            on:change={() => toggleResourceSelection(resource)}
            class="rounded border-white/20 bg-bg-secondary text-accent-primary focus:ring-accent-primary focus:ring-offset-0"
          />
        </div>
      {/if}
    </div>
  </ResourceGrid>
  
  <!-- Loading State -->
  {#if loading}
    <div class="space-y-4">
      <LoadingSkeleton height="100px" />
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each Array(6) as _}
          <LoadingSkeleton height="200px" />
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .resource-manager {
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
