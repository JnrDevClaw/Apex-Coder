<script>
  import { currentLanguage, SUPPORTED_LANGUAGES } from '../utils/i18n.js';
  
  let isOpen = false;
  
  function toggleDropdown() {
    isOpen = !isOpen;
  }
  
  function selectLanguage(langCode) {
    currentLanguage.setLanguage(langCode);
    isOpen = false;
  }
  
  function handleKeyDown(event, langCode) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectLanguage(langCode);
    }
  }
</script>

<div class="language-selector">
  <button
    type="button"
    on:click={toggleDropdown}
    class="language-button"
    aria-label="Select language"
    aria-expanded={isOpen}
    aria-haspopup="true"
  >
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"></path>
    </svg>
    <span class="language-code">{$currentLanguage.toUpperCase()}</span>
  </button>
  
  {#if isOpen}
    <div class="language-dropdown" role="menu">
      {#each Object.values(SUPPORTED_LANGUAGES) as lang (lang.code)}
        <button
          type="button"
          class="language-option"
          class:active={$currentLanguage === lang.code}
          on:click={() => selectLanguage(lang.code)}
          on:keydown={(e) => handleKeyDown(e, lang.code)}
          role="menuitem"
          tabindex="0"
        >
          <span class="language-name">{lang.nativeName}</span>
          <span class="language-english">{lang.name}</span>
          {#if $currentLanguage === lang.code}
            <svg class="w-4 h-4 check-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<svelte:window on:click={(e) => {
  if (!e.target.closest('.language-selector')) {
    isOpen = false;
  }
}} />

<style>
  .language-selector {
    position: relative;
  }
  
  .language-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-secondary, #101218);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.5rem;
    color: white;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .language-button:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: var(--accent-primary, #3AB8FF);
  }
  
  .language-button:focus {
    outline: 2px solid var(--accent-primary, #3AB8FF);
    outline-offset: 2px;
  }
  
  .language-code {
    font-size: 0.875rem;
    font-weight: 600;
    font-family: monospace;
  }
  
  .language-dropdown {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    min-width: 12rem;
    background: var(--bg-panel, #0F1217);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.75rem;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    z-index: 1000;
    animation: slideDown 0.2s ease;
  }
  
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-0.5rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .language-option {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }
  
  .language-option:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  
  .language-option:focus {
    outline: none;
    background: rgba(58, 184, 255, 0.1);
  }
  
  .language-option.active {
    background: rgba(58, 184, 255, 0.1);
    color: var(--accent-primary, #3AB8FF);
  }
  
  .language-name {
    font-weight: 600;
    margin-right: 0.5rem;
  }
  
  .language-english {
    font-size: 0.75rem;
    color: var(--text-secondary, #9CA3AF);
  }
  
  .check-icon {
    color: var(--accent-primary, #3AB8FF);
    margin-left: auto;
  }
</style>
