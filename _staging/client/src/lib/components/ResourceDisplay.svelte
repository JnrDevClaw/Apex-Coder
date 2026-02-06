<!--
  Resource Display Component
  Displays generated resources with validation, access testing, and copy functionality
  Requirements: 5.1, 5.2, 5.4
-->
<script>
  import { onMount } from 'svelte';
  import { showSuccess, showError, showInfo } from '../stores/notifications.js';
  import { validateResourceUrl, testResourceAccess } from '../utils/resourceValidation.js';
  import { copyToClipboard } from '../utils/clipboard.js';
  import ResourceIcon from './ResourceIcon.svelte';
  import ResourceMetadata from './ResourceMetadata.svelte';
  import LoadingSkeleton from './LoadingSkeleton.svelte';
  
  export let resource;
  export let showMetadata = true;
  export let showActions = true;
  export let compact = false;
  
  let isValidating = false;
  let isAccessible = null;
  let validationError = null;
  let lastValidated = null;
  
  onMount(() => {
    if (resource?.url) {
      validateResource();
    }
  });
  
  async function validateResource() {
    if (!resource?.url) return;
    
    isValidating = true;
    validationError = null;
    
    try {
      // Validate URL format
      const urlValidation = validateResourceUrl(resource.url, resource.type);
      if (!urlValidation.isValid) {
        validationError = urlValidation.error;
        isAccessible = false;
        return;
      }
      
      // Test resource accessibility
      const accessTest = await testResourceAccess(resource.url, resource.type);
      isAccessible = accessTest.isAccessible;
      
      if (!accessTest.isAccessible) {
        validationError = accessTest.error || 'Resource is not accessible';
      } else {
        lastValidated = new Date().toISOString();
      }
    } catch (error) {
      console.error('Resource validation error:', error);
      validationError = 'Failed to validate resource';
      isAccessible = false;
    } finally {
      isValidating = false;
    }
  }
  
  async function handleCopyUrl() {
    if (!resource?.url) return;
    
    const success = await copyToClipboard(resource.url);
    if (success) {
      showSuccess(`Copied ${resource.name} URL to clipboard`);
    } else {
      showError('Failed to copy URL to clipboard');
    }
  }
  
  async function handleCopyMetadata() {
    if (!resource?.metadata) return;
    
    const metadataText = JSON.stringify(resource.metadata, null, 2);
    const success = await copyToClipboard(metadataText);
    if (success) {
      showSuccess('Copied resource metadata to clipboard');
    } else {
      showError('Failed to copy metadata to clipboard');
    }
  }
  
  function handleResourceClick() {
    if (resource?.url && isAccessible) {
      window.open(resource.url, '_blank', 'noopener,noreferrer');
    } else if (resource?.url && isAccessible === null) {
      // If we haven't validated yet, try to open anyway
      window.open(resource.url, '_blank', 'noopener,noreferrer');
    }
  }
  
  function getResourceStatusColor() {
    if (isValidating) return 'text-accent-primary';
    if (isAccessible === true) return 'text-accent-success';
    if (isAccessible === false) return 'text-accent-error';
    return 'text-text-secondary';
  }
  
  function getResourceStatusIcon() {
    if (isValidating) return 'loading';
    if (isAccessible === true) return 'check';
    if (isAccessible === false) return 'error';
    return 'unknown';
  }
  
  function formatResourceType(type) {
    return type.charAt(0).toUpperCase() + type.slice(1).replace(/[-_]/g, ' ');
  }
</script>

<div class="resource-display" class:compact>
  <div 
    class="cyber-panel p-4 hover:border-accent-primary transition-all group cursor-pointer"
    class:border-accent-success={isAccessible === true}
    class:border-accent-error={isAccessible === false}
    on:click={handleResourceClick}
    on:keydown={(e) => e.key === 'Enter' && handleResourceClick()}
    role="button"
    tabindex="0"
  >
    <div class="flex items-start gap-3">
      <!-- Resource Icon -->
      <div class="flex-shrink-0">
        <ResourceIcon type={resource.type} size={compact ? 'sm' : 'md'} />
      </div>
      
      <!-- Resource Content -->
      <div class="flex-1 min-w-0">
        <!-- Header -->
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-white group-hover:text-accent-primary transition-colors truncate">
              {resource.name}
            </h3>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-sm text-text-secondary capitalize">
                {formatResourceType(resource.type)}
              </span>
              
              <!-- Validation Status -->
              <div class="flex items-center gap-1">
                {#if isValidating}
                  <div class="w-3 h-3 border border-accent-primary border-t-transparent rounded-full animate-spin"></div>
                  <span class="text-xs text-accent-primary">Validating...</span>
                {:else if isAccessible === true}
                  <svg class="w-3 h-3 text-accent-success" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                  </svg>
                  <span class="text-xs text-accent-success">Accessible</span>
                {:else if isAccessible === false}
                  <svg class="w-3 h-3 text-accent-error" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                  </svg>
                  <span class="text-xs text-accent-error">Error</span>
                {/if}
              </div>
            </div>
          </div>
          
          <!-- External Link Icon -->
          <svg class="w-4 h-4 text-text-secondary group-hover:text-accent-primary transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
          </svg>
        </div>
        
        <!-- URL Display -->
        <div class="mb-3">
          <div class="flex items-center gap-2 p-2 bg-bg-secondary rounded border border-white/5">
            <code class="text-sm text-accent-primary font-mono flex-1 truncate">
              {resource.url}
            </code>
            {#if showActions}
              <button
                type="button"
                on:click|stopPropagation={handleCopyUrl}
                class="p-1 hover:bg-white/10 rounded transition-colors"
                title="Copy URL"
              >
                <svg class="w-4 h-4 text-text-secondary hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                </svg>
              </button>
            {/if}
          </div>
        </div>
        
        <!-- Validation Error -->
        {#if validationError}
          <div class="mb-3 p-2 bg-accent-error/10 border border-accent-error/20 rounded">
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 text-accent-error flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
              </svg>
              <span class="text-sm text-accent-error">{validationError}</span>
            </div>
          </div>
        {/if}
        
        <!-- Resource Metadata -->
        {#if showMetadata && resource.metadata && Object.keys(resource.metadata).length > 0}
          <ResourceMetadata 
            metadata={resource.metadata} 
            {compact}
            onCopy={handleCopyMetadata}
          />
        {/if}
        
        <!-- Actions -->
        {#if showActions && !compact}
          <div class="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
            <button
              type="button"
              on:click|stopPropagation={validateResource}
              disabled={isValidating}
              class="btn-secondary text-sm px-3 py-1 flex items-center gap-2"
            >
              {#if isValidating}
                <div class="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin"></div>
              {:else}
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
              {/if}
              Revalidate
            </button>
            
            {#if lastValidated}
              <span class="text-xs text-text-secondary">
                Last validated: {new Date(lastValidated).toLocaleTimeString()}
              </span>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .resource-display.compact .cyber-panel {
    padding: 0.75rem;
  }
  
  .resource-display {
    animation: fadeIn 0.3s ease-in;
  }
  
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(5px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
