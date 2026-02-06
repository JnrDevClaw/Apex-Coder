<script>
  import { onMount, onDestroy } from 'svelte';
  import { viewport, isMobile, isTablet, isDesktop, deviceCapabilities } from '../stores/responsive.js';
  import MobileBottomNav from './MobileBottomNav.svelte';
  
  export let showMobileNav = true;
  export let maxWidth = '7xl'; // Tailwind max-width class
  export let padding = true;
  
  let mounted = false;
  
  onMount(() => {
    mounted = true;
    
    // Add viewport meta tag if not present
    if (typeof document !== 'undefined') {
      let viewportMeta = document.querySelector('meta[name="viewport"]');
      if (!viewportMeta) {
        viewportMeta = document.createElement('meta');
        viewportMeta.name = 'viewport';
        viewportMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes';
        document.head.appendChild(viewportMeta);
      }
    }
    
    // Prevent zoom on double-tap for better UX
    if ($deviceCapabilities.isTouchDevice) {
      document.addEventListener('dblclick', (e) => {
        e.preventDefault();
      }, { passive: false });
    }
  });
  
  onDestroy(() => {
    mounted = false;
  });
  
  $: paddingClass = padding ? 'px-4 sm:px-6 lg:px-8' : '';
  $: maxWidthClass = `max-w-${maxWidth}`;
  $: mobileNavPadding = showMobileNav && $isMobile ? 'pb-20' : '';
</script>

<div class="responsive-layout min-h-screen bg-bg-primary">
  <!-- Main Content -->
  <main class={`mx-auto ${maxWidthClass} ${paddingClass} ${mobileNavPadding} py-4 sm:py-6 lg:py-8`}>
    <slot />
  </main>
  
  <!-- Mobile Bottom Navigation -->
  {#if showMobileNav && mounted}
    <MobileBottomNav />
  {/if}
</div>

<style>
  .responsive-layout {
    /* Prevent horizontal scroll on mobile */
    overflow-x: hidden;
    
    /* Smooth scrolling */
    scroll-behavior: smooth;
    
    /* Safe area insets for devices with notches */
    padding-top: env(safe-area-inset-top);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }
  
  /* Disable text selection on touch devices for better UX */
  @media (hover: none) and (pointer: coarse) {
    .responsive-layout :global(button),
    .responsive-layout :global(.touch-manipulation) {
      -webkit-tap-highlight-color: transparent;
      -webkit-touch-callout: none;
      user-select: none;
    }
  }
  
  /* Optimize for mobile performance */
  @media (max-width: 768px) {
    .responsive-layout {
      /* Use GPU acceleration */
      transform: translateZ(0);
      -webkit-transform: translateZ(0);
      
      /* Optimize font rendering */
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
  }
</style>
