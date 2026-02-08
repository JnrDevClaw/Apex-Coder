<script>
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  
  const navItems = [
    {
      path: '/pipelines',
      label: 'Pipelines',
      icon: 'M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2'
    },
    {
      path: '/questionnaire',
      label: 'New',
      icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6',
      primary: true
    },
    {
      path: '/build',
      label: 'Builds',
      icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4'
    },
    {
      path: '/',
      label: 'Home',
      icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'
    }
  ];
  
  function isActive(path) {
    return $page.url.pathname === path || $page.url.pathname.startsWith(path + '/');
  }
  
  function handleNavigation(path) {
    goto(path);
  }
</script>

<!-- Mobile Bottom Navigation (visible only on mobile) -->
<nav class="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-panel border-t border-white/10 backdrop-blur-lg safe-area-bottom">
  <div class="grid grid-cols-4 h-16">
    {#each navItems as item}
      <button
        type="button"
        on:click={() => handleNavigation(item.path)}
        class="flex flex-col items-center justify-center gap-1 touch-manipulation active:scale-95 transition-all relative
          {isActive(item.path) ? 'text-accent-primary' : 'text-text-secondary'}
          {item.primary ? 'col-span-1' : ''}"
      >
        <!-- Active Indicator -->
        {#if isActive(item.path)}
          <div class="absolute top-0 left-1/2 transform -translate-x-1/2 w-12 h-1 bg-accent-primary rounded-b-full"></div>
        {/if}
        
        <!-- Icon -->
        <div class={`w-6 h-6 flex items-center justify-center
          {item.primary ? 'w-10 h-10 rounded-full bg-accent-primary text-black -mt-2' : ''}`}
        >
          <svg class={`${item.primary ? 'w-5 h-5' : 'w-6 h-6'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={item.icon}></path>
          </svg>
        </div>
        
        <!-- Label -->
        <span class="text-xs font-medium {item.primary ? 'hidden' : ''}">{item.label}</span>
      </button>
    {/each}
  </div>
</nav>

<style>
  /* Safe area for devices with notches */
  .safe-area-bottom {
    padding-bottom: env(safe-area-inset-bottom);
  }
</style>
