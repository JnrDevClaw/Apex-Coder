<script>
  import { onMount } from 'svelte';
  import '../app.css';
  import MobileNav from '$lib/components/MobileNav.svelte';
  import MobileBottomNav from '$lib/components/MobileBottomNav.svelte';
  import NotificationContainer from '$lib/components/NotificationContainer.svelte';
  import SkipToContent from '$lib/components/SkipToContent.svelte';
  import AccessibilitySettings from '$lib/components/AccessibilitySettings.svelte';
  import LanguageSelector from '$lib/components/LanguageSelector.svelte';
  import KeyboardShortcutsHelp from '$lib/components/KeyboardShortcutsHelp.svelte';
  import { isMobile } from '$lib/stores/responsive.js';
  import { accessibilitySettings, reducedMotion, highContrast } from '$lib/stores/accessibility.js';
  import { currentLanguage } from '$lib/utils/i18n.js';
  import { registerServiceWorker, startUpdateCheck } from '$lib/utils/serviceWorker.js';
  
  let updateCheckInterval = null;
  
  // Apply accessibility settings to document
  $: if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('reduced-motion', $reducedMotion);
    document.documentElement.classList.toggle('high-contrast', $highContrast);
    document.documentElement.setAttribute('data-font-size', $accessibilitySettings.fontSize);
    document.documentElement.setAttribute('data-focus-style', $accessibilitySettings.focusIndicatorStyle);
    document.documentElement.lang = $currentLanguage;
  }
  
  onMount(async () => {
    // Register service worker for offline support
    const registration = await registerServiceWorker();
    
    if (registration) {
      // Check for updates every minute
      updateCheckInterval = startUpdateCheck(60000);
    }
    
    return () => {
      if (updateCheckInterval) {
        clearInterval(updateCheckInterval);
      }
    };
  });
</script>

<!-- Skip to content link for keyboard navigation -->
<SkipToContent targetId="main-content" />

<div class="min-h-screen bg-bg-primary text-white">
  <!-- Desktop/Tablet Navigation -->
  {#if !$isMobile}
    <MobileNav />
  {/if}
  
  <!-- Main Content -->
  <main id="main-content" class="pb-safe {$isMobile ? 'pb-20' : ''}">
    <slot />
  </main>
  
  <!-- Mobile Bottom Navigation -->
  {#if $isMobile}
    <MobileBottomNav />
  {/if}
  
  <!-- Notifications -->
  <NotificationContainer />
  
  <!-- Accessibility Settings Panel -->
  <AccessibilitySettings />
  
  <!-- Keyboard Shortcuts Help -->
  <KeyboardShortcutsHelp />
  
  <!-- Language Selector (positioned in top right) -->
  <div class="language-selector-container">
    <LanguageSelector />
  </div>
</div>

<style>
  /* Safe area for devices with notches */
  .pb-safe {
    padding-bottom: env(safe-area-inset-bottom);
  }
  
  /* Prevent overscroll bounce on iOS */
  :global(body) {
    overscroll-behavior-y: none;
  }
  
  /* Optimize touch interactions */
  :global(.touch-manipulation) {
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  
  /* Language selector positioning */
  .language-selector-container {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 900;
  }
  
  @media (max-width: 640px) {
    .language-selector-container {
      top: 0.5rem;
      right: 0.5rem;
    }
  }
  
  /* Accessibility: Reduced Motion */
  :global(.reduced-motion *) {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  
  /* Accessibility: High Contrast */
  :global(.high-contrast) {
    --accent-primary: #00D9FF;
    --accent-success: #00FF88;
    --accent-error: #FF3366;
    --text-secondary: #CCCCCC;
  }
  
  :global(.high-contrast *) {
    border-color: currentColor !important;
  }
  
  /* Accessibility: Font Sizes */
  :global([data-font-size="small"]) {
    font-size: 14px;
  }
  
  :global([data-font-size="medium"]) {
    font-size: 16px;
  }
  
  :global([data-font-size="large"]) {
    font-size: 18px;
  }
  
  :global([data-font-size="x-large"]) {
    font-size: 20px;
  }
  
  /* Accessibility: Enhanced Focus Indicators */
  :global([data-focus-style="enhanced"] *:focus) {
    outline: 3px solid var(--accent-primary, #3AB8FF) !important;
    outline-offset: 3px !important;
    box-shadow: 0 0 0 6px rgba(58, 184, 255, 0.2) !important;
  }
  
  /* Screen reader only class */
  :global(.sr-only) {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
</style>
