<script>
  import { createEventDispatcher } from 'svelte';
  
  export let content = '';
  export let title = '';
  export let position = 'top'; // top, bottom, left, right
  export let size = 'medium'; // small, medium, large
  export let trigger = 'hover'; // hover, click, focus
  export let disabled = false;
  export let maxWidth = '300px';
  
  const dispatch = createEventDispatcher();
  
  let showTooltip = false;
  let tooltipElement;
  let triggerElement;
  let timeoutId;
  
  const sizeClasses = {
    small: 'text-xs p-2',
    medium: 'text-sm p-3',
    large: 'text-base p-4'
  };
  
  const positionClasses = {
    top: 'bottom-full left-1/2 transform -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 transform -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 transform -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 transform -translate-y-1/2 ml-2'
  };
  
  const arrowClasses = {
    top: 'top-full left-1/2 transform -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-bg-secondary',
    bottom: 'bottom-full left-1/2 transform -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-bg-secondary',
    left: 'left-full top-1/2 transform -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-bg-secondary',
    right: 'right-full top-1/2 transform -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-bg-secondary'
  };
  
  function handleMouseEnter() {
    if (disabled || trigger !== 'hover') return;
    
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      showTooltip = true;
      dispatch('show');
    }, 200);
  }
  
  function handleMouseLeave() {
    if (disabled || trigger !== 'hover') return;
    
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      showTooltip = false;
      dispatch('hide');
    }, 100);
  }
  
  function handleClick() {
    if (disabled || trigger !== 'click') return;
    
    showTooltip = !showTooltip;
    dispatch(showTooltip ? 'show' : 'hide');
  }
  
  function handleFocus() {
    if (disabled || trigger !== 'focus') return;
    
    showTooltip = true;
    dispatch('show');
  }
  
  function handleBlur() {
    if (disabled || trigger !== 'focus') return;
    
    showTooltip = false;
    dispatch('hide');
  }
  
  function handleKeydown(event) {
    if (event.key === 'Escape') {
      showTooltip = false;
      dispatch('hide');
    }
  }
  
  // Close tooltip when clicking outside
  function handleClickOutside(event) {
    if (trigger === 'click' && showTooltip && tooltipElement && !tooltipElement.contains(event.target) && !triggerElement.contains(event.target)) {
      showTooltip = false;
      dispatch('hide');
    }
  }
  
  $: if (typeof window !== 'undefined') {
    if (showTooltip) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeydown);
    } else {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeydown);
    }
  }
</script>

<div class="relative inline-block">
  <!-- Trigger Element -->
  <div
    bind:this={triggerElement}
    on:mouseenter={handleMouseEnter}
    on:mouseleave={handleMouseLeave}
    on:click={handleClick}
    on:focus={handleFocus}
    on:blur={handleBlur}
    class="cursor-help"
    role="button"
    tabindex="0"
    aria-describedby={showTooltip ? 'tooltip-content' : null}
    aria-expanded={showTooltip}
  >
    <slot name="trigger">
      <!-- Default help icon -->
      <svg 
        class="w-4 h-4 text-white/60 hover:text-white/80 transition-colors" 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
    </slot>
  </div>
  
  <!-- Tooltip Content -->
  {#if showTooltip}
    <div
      bind:this={tooltipElement}
      id="tooltip-content"
      class="absolute z-50 {positionClasses[position]} {sizeClasses[size]} bg-bg-secondary border border-white/10 rounded-lg shadow-lg text-white"
      style="max-width: {maxWidth}"
      role="tooltip"
      aria-live="polite"
    >
      <!-- Arrow -->
      <div class="absolute w-0 h-0 border-4 {arrowClasses[position]}"></div>
      
      <!-- Content -->
      <div class="relative">
        {#if title}
          <div class="font-semibold mb-1 text-white">{title}</div>
        {/if}
        
        {#if content}
          <div class="text-white/80 leading-relaxed">{content}</div>
        {:else}
          <slot name="content"></slot>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  /* Ensure tooltip appears above other elements */
  :global(.tooltip-container) {
    position: relative;
    z-index: 1000;
  }
</style>
