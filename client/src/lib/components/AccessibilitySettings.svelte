<script>
  import { accessibilitySettings } from '../stores/accessibility.js';
  import { t } from '../utils/i18n.js';
  
  let isOpen = false;
  
  function togglePanel() {
    isOpen = !isOpen;
  }
  
  function handleToggle(setting) {
    accessibilitySettings.toggleSetting(setting);
  }
  
  function handleFontSizeChange(event) {
    accessibilitySettings.setSetting('fontSize', event.target.value);
  }
  
  function handleFocusStyleChange(event) {
    accessibilitySettings.setSetting('focusIndicatorStyle', event.target.value);
  }
  
  function resetSettings() {
    if (confirm('Reset all accessibility settings to defaults?')) {
      accessibilitySettings.reset();
    }
  }
  
  function syncWithSystem() {
    accessibilitySettings.syncWithSystem();
  }
</script>

<div class="accessibility-settings">
  <button
    type="button"
    on:click={togglePanel}
    class="settings-toggle"
    aria-label="Accessibility settings"
    aria-expanded={isOpen}
  >
    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path>
    </svg>
  </button>
  
  {#if isOpen}
    <div class="settings-panel cyber-panel" role="dialog" aria-label="Accessibility settings">
      <div class="panel-header">
        <h2 class="text-xl font-display font-semibold text-white">Accessibility Settings</h2>
        <button
          type="button"
          on:click={togglePanel}
          class="close-button"
          aria-label="Close settings"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
      
      <div class="panel-content">
        <!-- Reduced Motion -->
        <div class="setting-item">
          <label class="setting-label">
            <input
              type="checkbox"
              checked={$accessibilitySettings.reducedMotion}
              on:change={() => handleToggle('reducedMotion')}
              class="setting-checkbox"
            />
            <div>
              <div class="setting-title">Reduce Motion</div>
              <div class="setting-description">Minimize animations and transitions</div>
            </div>
          </label>
        </div>
        
        <!-- High Contrast -->
        <div class="setting-item">
          <label class="setting-label">
            <input
              type="checkbox"
              checked={$accessibilitySettings.highContrast}
              on:change={() => handleToggle('highContrast')}
              class="setting-checkbox"
            />
            <div>
              <div class="setting-title">High Contrast</div>
              <div class="setting-description">Increase contrast for better visibility</div>
            </div>
          </label>
        </div>
        
        <!-- Screen Reader Mode -->
        <div class="setting-item">
          <label class="setting-label">
            <input
              type="checkbox"
              checked={$accessibilitySettings.screenReaderMode}
              on:change={() => handleToggle('screenReaderMode')}
              class="setting-checkbox"
            />
            <div>
              <div class="setting-title">Screen Reader Mode</div>
              <div class="setting-description">Optimize for screen readers</div>
            </div>
          </label>
        </div>
        
        <!-- Keyboard Navigation -->
        <div class="setting-item">
          <label class="setting-label">
            <input
              type="checkbox"
              checked={$accessibilitySettings.keyboardNavigationEnabled}
              on:change={() => handleToggle('keyboardNavigationEnabled')}
              class="setting-checkbox"
            />
            <div>
              <div class="setting-title">Keyboard Navigation</div>
              <div class="setting-description">Enable keyboard shortcuts and navigation</div>
            </div>
          </label>
        </div>
        
        <!-- Announce Progress -->
        <div class="setting-item">
          <label class="setting-label">
            <input
              type="checkbox"
              checked={$accessibilitySettings.announceProgress}
              on:change={() => handleToggle('announceProgress')}
              class="setting-checkbox"
            />
            <div>
              <div class="setting-title">Announce Progress</div>
              <div class="setting-description">Announce pipeline progress to screen readers</div>
            </div>
          </label>
        </div>
        
        <!-- Font Size -->
        <div class="setting-item">
          <label for="font-size" class="setting-title">Font Size</label>
          <select
            id="font-size"
            value={$accessibilitySettings.fontSize}
            on:change={handleFontSizeChange}
            class="setting-select"
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
            <option value="x-large">Extra Large</option>
          </select>
        </div>
        
        <!-- Focus Indicator Style -->
        <div class="setting-item">
          <label for="focus-style" class="setting-title">Focus Indicator</label>
          <select
            id="focus-style"
            value={$accessibilitySettings.focusIndicatorStyle}
            on:change={handleFocusStyleChange}
            class="setting-select"
          >
            <option value="default">Default</option>
            <option value="enhanced">Enhanced</option>
          </select>
        </div>
        
        <!-- Actions -->
        <div class="panel-actions">
          <button
            type="button"
            on:click={syncWithSystem}
            class="btn-secondary text-sm"
          >
            Sync with System
          </button>
          <button
            type="button"
            on:click={resetSettings}
            class="btn-secondary text-sm"
          >
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .accessibility-settings {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    z-index: 1000;
  }
  
  .settings-toggle {
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 50%;
    background: var(--accent-primary, #3AB8FF);
    color: var(--bg-primary, #0A0A0C);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(58, 184, 255, 0.4);
    transition: all 0.3s ease;
  }
  
  .settings-toggle:hover {
    transform: scale(1.1);
    box-shadow: 0 6px 16px rgba(58, 184, 255, 0.6);
  }
  
  .settings-toggle:focus {
    outline: 2px solid var(--accent-primary, #3AB8FF);
    outline-offset: 2px;
  }
  
  .settings-panel {
    position: absolute;
    bottom: 4.5rem;
    right: 0;
    width: 20rem;
    max-height: 32rem;
    overflow-y: auto;
    padding: 0;
    animation: slideUp 0.3s ease;
  }
  
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(1rem);
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
    padding: 1rem 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .close-button {
    background: none;
    border: none;
    color: var(--text-secondary, #9CA3AF);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.25rem;
    transition: all 0.2s ease;
  }
  
  .close-button:hover {
    color: white;
    background: rgba(255, 255, 255, 0.1);
  }
  
  .panel-content {
    padding: 1rem 1.5rem;
  }
  
  .setting-item {
    margin-bottom: 1.5rem;
  }
  
  .setting-label {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    cursor: pointer;
  }
  
  .setting-checkbox {
    margin-top: 0.25rem;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 0.25rem;
    border: 2px solid rgba(255, 255, 255, 0.2);
    background: var(--bg-secondary, #101218);
    cursor: pointer;
  }
  
  .setting-checkbox:checked {
    background: var(--accent-primary, #3AB8FF);
    border-color: var(--accent-primary, #3AB8FF);
  }
  
  .setting-title {
    font-weight: 600;
    color: white;
    margin-bottom: 0.25rem;
  }
  
  .setting-description {
    font-size: 0.875rem;
    color: var(--text-secondary, #9CA3AF);
  }
  
  .setting-select {
    width: 100%;
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: var(--bg-secondary, #101218);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.5rem;
    color: white;
    font-size: 0.875rem;
  }
  
  .setting-select:focus {
    outline: 2px solid var(--accent-primary, #3AB8FF);
    outline-offset: 2px;
  }
  
  .panel-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  @media (max-width: 640px) {
    .settings-panel {
      width: calc(100vw - 2rem);
      right: -1rem;
    }
  }
</style>
