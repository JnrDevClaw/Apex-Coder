/**
 * Responsive Store
 * Tracks viewport size and device capabilities
 */

import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

// Create a writable store for viewport dimensions
function createViewportStore() {
  const { subscribe, set } = writable({
    width: browser ? window.innerWidth : 1024,
    height: browser ? window.innerHeight : 768,
  });

  if (browser) {
    const updateViewport = () => {
      set({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    // Update on resize with debouncing
    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateViewport, 150);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', updateViewport);
  }

  return { subscribe, set };
}

export const viewport = createViewportStore();

// Derived stores for breakpoints
export const breakpoint = derived(viewport, ($viewport) => {
  const width = $viewport.width;
  if (width < 640) return 'xs';
  if (width < 768) return 'sm';
  if (width < 1024) return 'md';
  if (width < 1280) return 'lg';
  if (width < 1536) return 'xl';
  return '2xl';
});

export const isMobile = derived(viewport, ($viewport) => $viewport.width < 768);
export const isTablet = derived(viewport, ($viewport) => $viewport.width >= 768 && $viewport.width < 1024);
export const isDesktop = derived(viewport, ($viewport) => $viewport.width >= 1024);
export const isLandscape = derived(viewport, ($viewport) => $viewport.width > $viewport.height);

// Device capabilities
export const deviceCapabilities = writable({
  isTouchDevice: browser ? ('ontouchstart' in window || navigator.maxTouchPoints > 0) : false,
  prefersReducedMotion: browser ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false,
  supportsHover: browser ? window.matchMedia('(hover: hover)').matches : true,
  isOnline: browser ? navigator.onLine : true,
});

// Update online status
if (browser) {
  window.addEventListener('online', () => {
    deviceCapabilities.update((caps) => ({ ...caps, isOnline: true }));
  });
  window.addEventListener('offline', () => {
    deviceCapabilities.update((caps) => ({ ...caps, isOnline: false }));
  });
}

// Responsive grid columns
export const gridColumns = derived(viewport, ($viewport) => {
  const width = $viewport.width;
  if (width < 640) return 1;
  if (width < 768) return 1;
  if (width < 1024) return 2;
  if (width < 1280) return 3;
  return 3;
});

// Sidebar visibility (for mobile)
export const sidebarOpen = writable(false);

// Touch gesture state
export const touchState = writable({
  isSwipping: false,
  swipeDirection: null,
  touchStartX: 0,
  touchStartY: 0,
});
