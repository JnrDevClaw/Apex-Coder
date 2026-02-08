<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { isMobile } from '../stores/responsive.js';
  
  export let threshold = 80; // Distance to pull before triggering refresh
  export let enabled = true;
  
  const dispatch = createEventDispatcher();
  
  let container;
  let pullDistance = 0;
  let isRefreshing = false;
  let touchStartY = 0;
  let canPull = false;
  
  $: pullProgress = Math.min(pullDistance / threshold, 1);
  $: showIndicator = pullDistance > 0 && !isRefreshing;
  $: triggerRefresh = pullDistance >= threshold && !isRefreshing;
  
  function handleTouchStart(e) {
    if (!enabled || !$isMobile || isRefreshing) return;
    
    // Only allow pull-to-refresh when scrolled to top
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    canPull = scrollTop === 0;
    
    if (canPull) {
      touchStartY = e.touches[0].clientY;
    }
  }
  
  function handleTouchMove(e) {
    if (!enabled || !$isMobile || !canPull || isRefreshing) return;
    
    const touchY = e.touches[0].clientY;
    const distance = touchY - touchStartY;
    
    if (distance > 0) {
      // Apply resistance to pull distance
      pullDistance = Math.pow(distance, 0.85);
      
      // Prevent default scroll behavior when pulling
      if (pullDistance > 10) {
        e.preventDefault();
      }
    }
  }
  
  async function handleTouchEnd() {
    if (!enabled || !$isMobile || !canPull) return;
    
    if (triggerRefresh) {
      isRefreshing = true;
      dispatch('refresh');
      
      // Wait for refresh to complete (handled by parent)
      // Parent should call completeRefresh() when done
    } else {
      // Reset pull distance with animation
      pullDistance = 0;
    }
    
    canPull = false;
  }
  
  export function completeRefresh() {
    isRefreshing = false;
    pullDistance = 0;
  }
  
  onMount(() => {
    if (container) {
      container.addEventListener('touchstart', handleTouchStart, { passive: true });
      container.addEventListener('touchmove', handleTouchMove, { passive: false });
      container.addEventListener('touchend', handleTouchEnd, { passive: true });
    }
  });
  
  onDestroy(() => {
    if (container) {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    }
  });
</script>

<div bind:this={container} class="pull-to-refresh-container relative">
  <!-- Pull Indicator -->
  {#if showIndicator || isRefreshing}
    <div 
      class="pull-indicator fixed top-0 left-0 right-0 z-50 flex items-center justify-center transition-all"
      style="height: {Math.min(pullDistance, threshold + 20)}px; opacity: {pullProgress}"
    >
      <div class="bg-panel rounded-full p-3 shadow-neon">
        {#if isRefreshing}
          <!-- Spinning loader -->
          <svg class="w-6 h-6 text-accent-primary animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
          </svg>
        {:else if triggerRefresh}
          <!-- Release to refresh -->
          <svg class="w-6 h-6 text-accent-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
        {:else}
          <!-- Pull down arrow -->
          <svg 
            class="w-6 h-6 text-accent-primary transition-transform"
            style="transform: rotate({pullProgress * 180}deg)"
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
          </svg>
        {/if}
      </div>
    </div>
  {/if}
  
  <!-- Content -->
  <div 
    class="pull-content transition-transform"
    style="transform: translateY({isRefreshing ? '60px' : Math.min(pullDistance * 0.5, 60) + 'px'})"
  >
    <slot />
  </div>
</div>

<style>
  .pull-to-refresh-container {
    min-height: 100vh;
  }
  
  .pull-indicator {
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  
  .pull-content {
    will-change: transform;
  }
  
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  
  .animate-spin {
    animation: spin 1s linear infinite;
  }
</style>
