<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import ErrorDisplay from './ErrorDisplay.svelte';
  
  const dispatch = createEventDispatcher();
  
  export let fallback = null;
  export let onError = null;
  export let showRetry = true;
  export const retryText = 'Try Again';
  
  let error = null;
  let hasError = false;
  let retryKey = 0;
  
  // Global error handler for unhandled promise rejections
  onMount(() => {
    const handleUnhandledRejection = (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      handleError(event.reason);
    };
    
    const handleError = (event) => {
      console.error('Global error:', event.error || event);
      handleError(event.error || event);
    };
    
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);
    
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  });
  
  function handleError(err) {
    error = err;
    hasError = true;
    
    // Call custom error handler if provided
    if (onError) {
      onError(err);
    }
    
    // Dispatch error event
    dispatch('error', { error: err });
  }
  
  function handleRetry() {
    error = null;
    hasError = false;
    retryKey++; // Force component re-render
    dispatch('retry');
  }
  
  function handleDismiss() {
    error = null;
    hasError = false;
    dispatch('dismiss');
  }
  
  // Expose error handling function to child components
  export function captureError(err) {
    handleError(err);
  }
</script>

{#if hasError}
  {#if fallback}
    <svelte:component this={fallback} {error} onRetry={handleRetry} onDismiss={handleDismiss} />
  {:else}
    <div class="error-boundary-container p-6">
      <ErrorDisplay
        {error}
        title="Something went wrong"
        showRetry={showRetry}
        showDetails={true}
        on:retry={handleRetry}
        on:dismiss={handleDismiss}
      />
    </div>
  {/if}
{:else}
  {#key retryKey}
    <slot {captureError} />
  {/key}
{/if}

<style>
  .error-boundary-container {
    min-height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
