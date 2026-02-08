<script>
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  export let disabled = false;
  export let loading = false;
  export let variant = 'primary'; // 'primary', 'secondary', 'destructive'
  export let size = 'medium'; // 'small', 'medium', 'large'
  export let showIcon = true;
  export let text = 'Retry';
  export let loadingText = 'Retrying...';
  export let retryCount = 0;
  export let maxRetries = 3;
  
  let isRetrying = false;
  
  async function handleRetry() {
    if (disabled || loading || isRetrying) return;
    
    isRetrying = true;
    
    try {
      await dispatch('retry', { retryCount });
    } finally {
      isRetrying = false;
    }
  }
  
  function getVariantClasses(variant) {
    switch (variant) {
      case 'secondary':
        return 'bg-white/10 text-white/80 hover:bg-white/20 border border-white/20';
      case 'destructive':
        return 'bg-accent-error/20 text-accent-error border border-accent-error/30 hover:bg-accent-error/30';
      default: // primary
        return 'bg-accent-primary text-black hover:bg-accent-primary/80 shadow-neon hover:shadow-neonSoft';
    }
  }
  
  function getSizeClasses(size) {
    switch (size) {
      case 'small':
        return 'px-3 py-1 text-sm';
      case 'large':
        return 'px-6 py-3 text-lg';
      default: // medium
        return 'px-4 py-2 text-base';
    }
  }
  
  $: isDisabled = disabled || loading || isRetrying || retryCount >= maxRetries;
  $: displayText = (loading || isRetrying) ? loadingText : text;
  $: variantClasses = getVariantClasses(variant);
  $: sizeClasses = getSizeClasses(size);
</script>

<button
  type="button"
  on:click={handleRetry}
  disabled={isDisabled}
  class={`
    inline-flex items-center gap-2 font-semibold rounded-lg transition-all duration-300
    ${variantClasses}
    ${sizeClasses}
    ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02] cursor-pointer'}
    ${(loading || isRetrying) ? 'animate-pulse' : ''}
  `}
>
  {#if showIcon}
    {#if loading || isRetrying}
      <!-- Loading spinner -->
      <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    {:else}
      <!-- Retry icon -->
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
      </svg>
    {/if}
  {/if}
  
  <span>{displayText}</span>
  
  {#if retryCount > 0 && maxRetries > 1}
    <span class="text-xs opacity-70">({retryCount}/{maxRetries})</span>
  {/if}
</button>
