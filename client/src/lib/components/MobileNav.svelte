<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { handleSwipe } from '../utils/responsive.js';
  
  let isOpen = false;
  let menuElement;
  
  function toggleMenu() {
    isOpen = !isOpen;
  }
  
  function navigate(path) {
    goto(path);
    isOpen = false;
  }
  
  // Close menu on outside click
  function handleClickOutside(event) {
    if (isOpen && menuElement && !menuElement.contains(event.target)) {
      isOpen = false;
    }
  }
  
  // Handle swipe to close menu
  onMount(() => {
    if (menuElement) {
      const cleanup = handleSwipe(menuElement, {
        onSwipeUp: () => {
          if (isOpen) isOpen = false;
        },
      });
      
      return cleanup;
    }
  });
  
  $: currentPath = $page.url.pathname;
</script>

<svelte:window on:click={handleClickOutside} />

<!-- Mobile Navigation -->
<nav class="lg:hidden bg-bg-secondary border-b border-white/10 sticky top-0 z-50 backdrop-blur-sm bg-bg-secondary/95" bind:this={menuElement}>
  <div class="px-4 sm:px-6">
    <div class="flex items-center justify-between h-14 sm:h-16">
      <!-- Logo -->
      <div class="flex items-center">
        <button
          type="button"
          on:click={() => navigate('/')}
          class="text-lg sm:text-xl font-display font-bold text-white active:scale-95 transition-transform"
        >
          AI App Builder
        </button>
      </div>
      
      <!-- Mobile menu button -->
      <button
        type="button"
        on:click={toggleMenu}
        class="p-2 rounded-lg text-text-secondary hover:text-white hover:bg-white/10 active:bg-white/20 transition-all touch-manipulation"
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isOpen}
      >
        <svg class="w-6 h-6 transition-transform duration-200 {isOpen ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {#if isOpen}
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          {:else}
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
          {/if}
        </svg>
      </button>
    </div>
  </div>
  
  <!-- Mobile menu with slide animation -->
  {#if isOpen}
    <div class="border-t border-white/10 bg-panel animate-slideDown">
      <div class="px-4 py-3 space-y-1 max-h-[calc(100vh-4rem)] overflow-y-auto">
        <button
          type="button"
          on:click={() => navigate('/')}
          class={`block w-full text-left px-4 py-3 rounded-lg text-base font-medium transition-all touch-manipulation active:scale-98 ${
            currentPath === '/' 
              ? 'bg-accent-primary/10 text-accent-primary shadow-neonSoft' 
              : 'text-text-secondary hover:text-white hover:bg-white/10 active:bg-white/20'
          }`}
        >
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
            </svg>
            Home
          </div>
        </button>
        
        <button
          type="button"
          on:click={() => navigate('/questionnaire')}
          class={`block w-full text-left px-4 py-3 rounded-lg text-base font-medium transition-all touch-manipulation active:scale-98 ${
            currentPath === '/questionnaire' 
              ? 'bg-accent-primary/10 text-accent-primary shadow-neonSoft' 
              : 'text-text-secondary hover:text-white hover:bg-white/10 active:bg-white/20'
          }`}
        >
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
            </svg>
            New Pipeline
          </div>
        </button>
        
        <button
          type="button"
          on:click={() => navigate('/pipelines')}
          class={`block w-full text-left px-4 py-3 rounded-lg text-base font-medium transition-all touch-manipulation active:scale-98 ${
            currentPath === '/pipelines' 
              ? 'bg-accent-primary/10 text-accent-primary shadow-neonSoft' 
              : 'text-text-secondary hover:text-white hover:bg-white/10 active:bg-white/20'
          }`}
        >
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
            </svg>
            Pipeline Dashboard
          </div>
        </button>
      </div>
    </div>
  {/if}
</nav>

<style>
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .animate-slideDown {
    animation: slideDown 0.2s ease-out;
  }
  
  .active\:scale-98:active {
    transform: scale(0.98);
  }
  
  .touch-manipulation {
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
</style>
