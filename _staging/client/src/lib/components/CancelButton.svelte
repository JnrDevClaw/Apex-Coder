<script>
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  export let disabled = false;
  export let loading = false;
  export let confirmRequired = true;
  export let confirmMessage = 'Are you sure you want to cancel this operation?';
  export let text = 'Cancel';
  export let loadingText = 'Cancelling...';
  export let variant = 'destructive'; // 'destructive', 'secondary'
  export let size = 'medium'; // 'small', 'medium', 'large'
  export let showIcon = true;
  
  let showConfirmDialog = false;
  let isCancelling = false;
  
  function handleClick() {
    if (disabled || loading || isCancelling) return;
    
    if (confirmRequired) {
      showConfirmDialog = true;
    } else {
      handleCancel();
    }
  }
  
  async function handleCancel() {
    if (disabled || loading || isCancelling) return;
    
    isCancelling = true;
    showConfirmDialog = false;
    
    try {
      await dispatch('cancel');
    } finally {
      isCancelling = false;
    }
  }
  
  function handleConfirmCancel() {
    showConfirmDialog = false;
  }
  
  function getVariantClasses(variant) {
    switch (variant) {
      case 'secondary':
        return 'bg-white/10 text-white/80 hover:bg-white/20 border border-white/20';
      default: // destructive
        return 'bg-accent-error/20 text-accent-error border border-accent-error/30 hover:bg-accent-error/30';
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
  
  $: isDisabled = disabled || loading || isCancelling;
  $: displayText = (loading || isCancelling) ? loadingText : text;
  $: variantClasses = getVariantClasses(variant);
  $: sizeClasses = getSizeClasses(size);
</script>

<button
  type="button"
  on:click={handleClick}
  disabled={isDisabled}
  class={`
    inline-flex items-center gap-2 font-semibold rounded-lg transition-all duration-300
    ${variantClasses}
    ${sizeClasses}
    ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02] cursor-pointer'}
    ${(loading || isCancelling) ? 'animate-pulse' : ''}
  `}
>
  {#if showIcon}
    {#if loading || isCancelling}
      <!-- Loading spinner -->
      <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    {:else}
      <!-- Cancel icon -->
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
      </svg>
    {/if}
  {/if}
  
  <span>{displayText}</span>
</button>

<!-- Confirmation Dialog -->
{#if showConfirmDialog}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-panel border border-white/10 rounded-xl p-6 max-w-md w-full shadow-neon">
      <div class="flex items-start gap-4">
        <div class="w-10 h-10 rounded-full bg-accent-error/20 flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-accent-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        
        <div class="flex-1">
          <h3 class="text-lg font-display font-semibold text-white mb-2">Confirm Cancellation</h3>
          <p class="text-text-secondary mb-6">{confirmMessage}</p>
          
          <div class="flex gap-3 justify-end">
            <button
              type="button"
              on:click={handleConfirmCancel}
              class="btn-secondary px-4 py-2"
            >
              Keep Running
            </button>
            <button
              type="button"
              on:click={handleCancel}
              class="bg-accent-error/20 text-accent-error border border-accent-error/30 hover:bg-accent-error/30 px-4 py-2 rounded-lg font-semibold transition-all"
            >
              Yes, Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .btn-secondary {
    background-color: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.8);
    border-radius: 0.5rem;
    font-weight: 600;
    transition: all 0.3s;
  }
  
  .btn-secondary:hover {
    background-color: rgba(255, 255, 255, 0.2);
  }
</style>
