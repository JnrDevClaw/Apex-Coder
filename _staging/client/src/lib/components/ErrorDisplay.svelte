<script>
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  export let error = null;
  export let title = 'Error';
  export let showRetry = false;
  export let showDetails = false;
  export let canDismiss = true;
  export let severity = 'error'; // 'error', 'warning', 'info'
  
  let expanded = false;
  
  function handleRetry() {
    dispatch('retry');
  }
  
  function handleDismiss() {
    dispatch('dismiss');
  }
  
  function toggleDetails() {
    expanded = !expanded;
  }
  
  function getSeverityStyles(severity) {
    switch (severity) {
      case 'warning':
        return {
          container: 'bg-yellow-500/10 border-yellow-500/20',
          icon: 'text-yellow-500',
          title: 'text-yellow-500',
          text: 'text-yellow-400'
        };
      case 'info':
        return {
          container: 'bg-blue-500/10 border-blue-500/20',
          icon: 'text-blue-500',
          title: 'text-blue-500',
          text: 'text-blue-400'
        };
      default: // error
        return {
          container: 'bg-accent-error/10 border-accent-error/20',
          icon: 'text-accent-error',
          title: 'text-accent-error',
          text: 'text-accent-error'
        };
    }
  }
  
  function getSeverityIcon(severity) {
    switch (severity) {
      case 'warning':
        return 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z';
      case 'info':
        return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
      default: // error
        return 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
    }
  }
  
  $: styles = getSeverityStyles(severity);
  $: iconPath = getSeverityIcon(severity);
  $: errorMessage = typeof error === 'string' ? error : error?.message || 'An unknown error occurred';
  $: errorDetails = typeof error === 'object' ? error : null;
</script>

{#if error}
  <div class={`rounded-lg p-4 border ${styles.container} transition-all duration-300`}>
    <div class="flex items-start gap-3">
      <!-- Error Icon -->
      <svg class={`w-5 h-5 mt-0.5 flex-shrink-0 ${styles.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={iconPath}></path>
      </svg>
      
      <!-- Error Content -->
      <div class="flex-1 min-w-0">
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1">
            <h3 class={`text-sm font-semibold mb-1 ${styles.title}`}>{title}</h3>
            <p class={`text-sm ${styles.text}`}>{errorMessage}</p>
          </div>
          
          <!-- Action Buttons -->
          <div class="flex items-center gap-2 flex-shrink-0">
            {#if showDetails && errorDetails}
              <button
                type="button"
                on:click={toggleDetails}
                class="btn-secondary text-xs px-2 py-1 transition-transform {expanded ? 'rotate-180' : ''}"
                title={expanded ? 'Hide details' : 'Show details'}
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </button>
            {/if}
            
            {#if showRetry}
              <button
                type="button"
                on:click={handleRetry}
                class="btn-secondary text-xs px-3 py-1 flex items-center gap-1"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
                Retry
              </button>
            {/if}
            
            {#if canDismiss}
              <button
                type="button"
                on:click={handleDismiss}
                class="text-white/40 hover:text-white/60 transition-colors p-1"
                title="Dismiss"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            {/if}
          </div>
        </div>
        
        <!-- Expanded Details -->
        {#if expanded && errorDetails}
          <div class="mt-3 pt-3 border-t border-white/10">
            <div class="space-y-2">
              {#if errorDetails.code}
                <div>
                  <span class="text-xs font-semibold text-white/60">Error Code:</span>
                  <span class="text-xs font-code text-white/80 ml-2">{errorDetails.code}</span>
                </div>
              {/if}
              
              {#if errorDetails.timestamp}
                <div>
                  <span class="text-xs font-semibold text-white/60">Timestamp:</span>
                  <span class="text-xs font-code text-white/80 ml-2">{new Date(errorDetails.timestamp).toLocaleString()}</span>
                </div>
              {/if}
              
              {#if errorDetails.stack}
                <div>
                  <span class="text-xs font-semibold text-white/60">Stack Trace:</span>
                  <pre class="text-xs font-code text-white/70 mt-1 p-2 bg-black/20 rounded overflow-x-auto whitespace-pre-wrap">{errorDetails.stack}</pre>
                </div>
              {/if}
              
              {#if errorDetails.context}
                <div>
                  <span class="text-xs font-semibold text-white/60">Context:</span>
                  <pre class="text-xs font-code text-white/70 mt-1 p-2 bg-black/20 rounded overflow-x-auto">{JSON.stringify(errorDetails.context, null, 2)}</pre>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .btn-secondary {
    background-color: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.8);
    border-radius: 0.25rem;
    transition: all 0.3s;
  }
  
  .btn-secondary:hover {
    background-color: rgba(255, 255, 255, 0.2);
  }
</style>
