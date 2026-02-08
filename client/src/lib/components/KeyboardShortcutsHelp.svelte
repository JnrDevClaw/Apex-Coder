<script>
  import { onMount, onDestroy } from 'svelte';
  import { keyboardNavigationEnabled } from '../stores/accessibility.js';
  
  let isOpen = false;
  
  const shortcuts = [
    { key: '?', description: 'Show keyboard shortcuts' },
    { key: '/', description: 'Focus search' },
    { key: 'n', description: 'Create new pipeline' },
    { key: 'r', description: 'Refresh pipeline list' },
    { key: 'Esc', description: 'Close dialogs/panels' },
    { key: '↑/↓', description: 'Navigate list items' },
    { key: 'Enter', description: 'Select/activate item' },
    { key: 'Space', description: 'Toggle selection' },
    { key: 'Tab', description: 'Navigate forward' },
    { key: 'Shift+Tab', description: 'Navigate backward' }
  ];
  
  function handleKeyDown(event) {
    if (!$keyboardNavigationEnabled) return;
    
    // Toggle help with '?'
    if (event.key === '?' && !event.target.matches('input, textarea, select')) {
      event.preventDefault();
      isOpen = !isOpen;
    }
    
    // Close with Escape
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      isOpen = false;
    }
  }
  
  onMount(() => {
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', handleKeyDown);
    }
  });
  
  onDestroy(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', handleKeyDown);
    }
  });
  
  function closeHelp() {
    isOpen = false;
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div 
    class="shortcuts-overlay" 
    on:click={closeHelp} 
    role="dialog" 
    aria-modal="true" 
    aria-labelledby="shortcuts-title"
    tabindex="-1"
  >
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="shortcuts-panel cyber-panel" on:click|stopPropagation>
      <div class="panel-header">
        <h2 id="shortcuts-title" class="text-2xl font-display font-bold text-white">
          Keyboard Shortcuts
        </h2>
        <button
          type="button"
          on:click={closeHelp}
          class="close-button"
          aria-label="Close keyboard shortcuts"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
      
      <div class="panel-content">
        <div class="shortcuts-grid">
          {#each shortcuts as shortcut}
            <div class="shortcut-item">
              <kbd class="shortcut-key">{shortcut.key}</kbd>
              <span class="shortcut-description">{shortcut.description}</span>
            </div>
          {/each}
        </div>
        
        <div class="panel-footer">
          <p class="text-sm text-text-secondary">
            Press <kbd class="inline-kbd">?</kbd> to toggle this help panel
          </p>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .shortcuts-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 1rem;
    animation: fadeIn 0.2s ease;
  }
  
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  
  .shortcuts-panel {
    max-width: 40rem;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    animation: slideUp 0.3s ease;
  }
  
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(2rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem 2rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .close-button {
    background: none;
    border: none;
    color: var(--text-secondary, #9CA3AF);
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 0.5rem;
    transition: all 0.2s ease;
  }
  
  .close-button:hover {
    color: white;
    background: rgba(255, 255, 255, 0.1);
  }
  
  .close-button:focus {
    outline: 2px solid var(--accent-primary, #3AB8FF);
    outline-offset: 2px;
  }
  
  .panel-content {
    padding: 2rem;
  }
  
  .shortcuts-grid {
    display: grid;
    gap: 1rem;
  }
  
  .shortcut-item {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  
  .shortcut-key {
    min-width: 5rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-secondary, #101218);
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.5rem;
    color: var(--accent-primary, #3AB8FF);
    font-family: monospace;
    font-weight: 600;
    font-size: 0.875rem;
    text-align: center;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
  
  .shortcut-description {
    color: white;
    font-size: 0.9375rem;
  }
  
  .panel-footer {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    text-align: center;
  }
  
  .inline-kbd {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    background: var(--bg-secondary, #101218);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.25rem;
    color: var(--accent-primary, #3AB8FF);
    font-family: monospace;
    font-size: 0.875rem;
  }
  
  @media (max-width: 640px) {
    .shortcuts-panel {
      max-height: 80vh;
    }
    
    .panel-header,
    .panel-content {
      padding: 1rem 1.5rem;
    }
    
    .shortcut-item {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }
    
    .shortcut-key {
      min-width: auto;
    }
  }
</style>
