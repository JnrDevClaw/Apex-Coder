<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { handleSwipe } from '../utils/responsive.js';
  
  export let swipeThreshold = 100;
  export let enableSwipeLeft = true;
  export let enableSwipeRight = true;
  export let leftActionLabel = 'Delete';
  export let rightActionLabel = 'Archive';
  export let leftActionColor = 'bg-accent-error';
  export let rightActionColor = 'bg-accent-success';
  
  const dispatch = createEventDispatcher();
  
  let cardElement;
  let translateX = 0;
  let isDragging = false;
  let startX = 0;
  let currentX = 0;
  let cleanup;
  
  $: swipeProgress = Math.abs(translateX) / swipeThreshold;
  $: showLeftAction = translateX < -20 && enableSwipeLeft;
  $: showRightAction = translateX > 20 && enableSwipeRight;
  $: triggerLeftAction = translateX < -swipeThreshold && enableSwipeLeft;
  $: triggerRightAction = translateX > swipeThreshold && enableSwipeRight;
  
  function handleTouchStart(e) {
    isDragging = true;
    startX = e.touches[0].clientX;
    currentX = startX;
  }
  
  function handleTouchMove(e) {
    if (!isDragging) return;
    
    currentX = e.touches[0].clientX;
    const deltaX = currentX - startX;
    
    // Apply resistance when swiping beyond threshold
    if (Math.abs(deltaX) > swipeThreshold) {
      const excess = Math.abs(deltaX) - swipeThreshold;
      const resistance = Math.pow(excess, 0.7);
      translateX = deltaX > 0 
        ? swipeThreshold + resistance 
        : -(swipeThreshold + resistance);
    } else {
      translateX = deltaX;
    }
    
    // Prevent scroll when swiping horizontally
    if (Math.abs(deltaX) > 10) {
      e.preventDefault();
    }
  }
  
  function handleTouchEnd() {
    if (!isDragging) return;
    
    isDragging = false;
    
    if (triggerLeftAction) {
      dispatch('swipeLeft');
      animateOut('left');
    } else if (triggerRightAction) {
      dispatch('swipeRight');
      animateOut('right');
    } else {
      // Reset position
      translateX = 0;
    }
  }
  
  function animateOut(direction) {
    const targetX = direction === 'left' ? -window.innerWidth : window.innerWidth;
    translateX = targetX;
    
    setTimeout(() => {
      translateX = 0;
    }, 300);
  }
  
  export function reset() {
    translateX = 0;
    isDragging = false;
  }
  
  onMount(() => {
    if (cardElement) {
      cardElement.addEventListener('touchstart', handleTouchStart, { passive: true });
      cardElement.addEventListener('touchmove', handleTouchMove, { passive: false });
      cardElement.addEventListener('touchend', handleTouchEnd, { passive: true });
    }
  });
  
  onDestroy(() => {
    if (cardElement) {
      cardElement.removeEventListener('touchstart', handleTouchStart);
      cardElement.removeEventListener('touchmove', handleTouchMove);
      cardElement.removeEventListener('touchend', handleTouchEnd);
    }
  });
</script>

<div class="swipeable-card-wrapper relative overflow-hidden">
  <!-- Background Actions -->
  <div class="absolute inset-0 flex items-center justify-between px-6">
    <!-- Left Action (shown when swiping left) -->
    {#if showLeftAction}
      <div class="flex-1"></div>
      <div 
        class={`${leftActionColor} rounded-lg px-4 py-2 transition-all`}
        style="opacity: {Math.min(swipeProgress, 1)}; transform: scale({0.8 + swipeProgress * 0.2})"
      >
        <span class="text-white font-semibold text-sm">{leftActionLabel}</span>
      </div>
    {/if}
    
    <!-- Right Action (shown when swiping right) -->
    {#if showRightAction}
      <div 
        class={`${rightActionColor} rounded-lg px-4 py-2 transition-all`}
        style="opacity: {Math.min(swipeProgress, 1)}; transform: scale({0.8 + swipeProgress * 0.2})"
      >
        <span class="text-white font-semibold text-sm">{rightActionLabel}</span>
      </div>
      <div class="flex-1"></div>
    {/if}
  </div>
  
  <!-- Card Content -->
  <div
    bind:this={cardElement}
    class="swipeable-card relative z-10 bg-panel transition-transform"
    class:dragging={isDragging}
    style="transform: translateX({translateX}px)"
  >
    <slot />
  </div>
</div>

<style>
  .swipeable-card-wrapper {
    touch-action: pan-y;
  }
  
  .swipeable-card {
    will-change: transform;
    cursor: grab;
  }
  
  .swipeable-card.dragging {
    cursor: grabbing;
    transition: none;
  }
  
  .swipeable-card:not(.dragging) {
    transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  }
</style>
