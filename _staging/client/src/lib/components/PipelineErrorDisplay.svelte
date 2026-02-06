<script>
  export let error = null;
  export let stage = null;
  export let onRetry = null;
  export let onReport = null;
  export let expanded = false;
  
  function toggleExpanded() {
    expanded = !expanded;
  }
  
  function getErrorIcon(errorType) {
    switch (errorType) {
      case 'network': return '🌐';
      case 'timeout': return '⏱️';
      case 'validation': return '⚠️';
      case 'api': return '🔌';
      case 'permission': return '🔒';
      default: return '❌';
    }
  }
  
  function getErrorSeverity(error) {
    if (error?.severity) return error.severity;
    if (error?.message?.toLowerCase().includes('fatal')) return 'critical';
    if (error?.message?.toLowerCase().includes('warning')) return 'warning';
    return 'error';
  }
  
  $: severity = getErrorSeverity(error);
  $: errorIcon = getErrorIcon(error?.type);
</script>

{#if error}
  <div class="pipeline-error-display">
    <!-- Error Header -->
    <div 
      class="error-header"
      class:critical={severity === 'critical'}
      class:error={severity === 'error'}
      class:warning={severity === 'warning'}
    >
      <div class="flex items-start gap-3 flex-1">
        <div class="error-icon">
          {errorIcon}
        </div>
        
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <h3 class="error-title">
              {#if stage}
                Error in {stage}
              {:else}
                Pipeline Error
              {/if}
            </h3>
            
            <span class="severity-badge" class:critical={severity === 'critical'}>
              {severity.toUpperCase()}
            </span>
          </div>
          
          <p class="error-message">
            {error.message || 'An unexpected error occurred'}
          </p>
          
          {#if error.code}
            <div class="error-code">
              Error Code: {error.code}
            </div>
          {/if}
        </div>
        
        <button
          on:click={toggleExpanded}
          class="expand-button"
          aria-label={expanded ? 'Collapse details' : 'Expand details'}
        >
          <svg 
            class="w-5 h-5 transition-transform"
            class:rotate-180={expanded}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </button>
      </div>
    </div>
    
    <!-- Expanded Error Details -->
    {#if expanded}
      <div class="error-details">
        {#if error.details}
          <div class="detail-section">
            <h4 class="detail-title">Details</h4>
            <p class="detail-text">{error.details}</p>
          </div>
        {/if}
        
        {#if error.stack}
          <div class="detail-section">
            <h4 class="detail-title">Stack Trace</h4>
            <pre class="stack-trace">{error.stack}</pre>
          </div>
        {/if}
        
        {#if error.context}
          <div class="detail-section">
            <h4 class="detail-title">Context</h4>
            <div class="context-grid">
              {#each Object.entries(error.context) as [key, value]}
                <div class="context-item">
                  <span class="context-key">{key}:</span>
                  <span class="context-value">{JSON.stringify(value)}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
        
        {#if error.suggestions && error.suggestions.length > 0}
          <div class="detail-section">
            <h4 class="detail-title">Suggestions</h4>
            <ul class="suggestions-list">
              {#each error.suggestions as suggestion}
                <li>{suggestion}</li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    {/if}
    
    <!-- Error Actions -->
    <div class="error-actions">
      {#if onRetry}
        <button
          on:click={onRetry}
          class="action-button primary"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
          </svg>
          Retry
        </button>
      {/if}
      
      {#if onReport}
        <button
          on:click={onReport}
          class="action-button secondary"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
          </svg>
          Report Issue
        </button>
      {/if}
      
      <button
        on:click={toggleExpanded}
        class="action-button secondary"
      >
        {expanded ? 'Hide' : 'Show'} Details
      </button>
    </div>
  </div>
{/if}

<style>
  .pipeline-error-display {
    width: 100%;
    border-radius: 0.75rem;
    overflow: hidden;
    background: rgba(255, 76, 136, 0.05);
    border: 1px solid rgba(255, 76, 136, 0.2);
  }
  
  .error-header {
    padding: 1.25rem;
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }
  
  .error-header.critical {
    background: rgba(255, 76, 136, 0.15);
    border-bottom: 2px solid var(--accent-error, #FF4C88);
  }
  
  .error-header.error {
    background: rgba(255, 76, 136, 0.1);
  }
  
  .error-header.warning {
    background: rgba(250, 204, 21, 0.1);
    border-color: rgba(250, 204, 21, 0.3);
  }
  
  .error-icon {
    font-size: 2rem;
    line-height: 1;
    animation: shake 0.5s ease-in-out;
  }
  
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    75% { transform: translateX(5px); }
  }
  
  .error-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: white;
    margin: 0;
  }
  
  .severity-badge {
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.625rem;
    font-weight: 700;
    background: rgba(255, 76, 136, 0.2);
    color: var(--accent-error, #FF4C88);
    letter-spacing: 0.05em;
  }
  
  .severity-badge.critical {
    background: var(--accent-error, #FF4C88);
    color: black;
    animation: pulse 2s ease-in-out infinite;
  }
  
  .error-message {
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.875rem;
    line-height: 1.5;
    margin: 0;
  }
  
  .error-code {
    margin-top: 0.5rem;
    font-size: 0.75rem;
    font-family: monospace;
    color: rgba(255, 255, 255, 0.5);
  }
  
  .expand-button {
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    transition: all 0.2s;
    border-radius: 0.375rem;
  }
  
  .expand-button:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }
  
  .error-details {
    padding: 1.25rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.2);
  }
  
  .detail-section {
    margin-bottom: 1.5rem;
  }
  
  .detail-section:last-child {
    margin-bottom: 0;
  }
  
  .detail-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: white;
    margin: 0 0 0.75rem 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  .detail-text {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.6;
    margin: 0;
  }
  
  .stack-trace {
    font-size: 0.75rem;
    font-family: monospace;
    color: rgba(255, 255, 255, 0.7);
    background: rgba(0, 0, 0, 0.3);
    padding: 0.75rem;
    border-radius: 0.375rem;
    overflow-x: auto;
    margin: 0;
    white-space: pre-wrap;
    word-break: break-all;
  }
  
  .context-grid {
    display: grid;
    gap: 0.5rem;
  }
  
  .context-item {
    display: flex;
    gap: 0.5rem;
    font-size: 0.875rem;
    font-family: monospace;
  }
  
  .context-key {
    color: var(--accent-primary, #3AB8FF);
    font-weight: 600;
  }
  
  .context-value {
    color: rgba(255, 255, 255, 0.8);
  }
  
  .suggestions-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  
  .suggestions-list li {
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.5rem;
    background: rgba(123, 255, 178, 0.1);
    border-left: 3px solid var(--accent-success, #7BFFB2);
    border-radius: 0.25rem;
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.9);
  }
  
  .suggestions-list li:last-child {
    margin-bottom: 0;
  }
  
  .error-actions {
    padding: 1rem 1.25rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  
  .action-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }
  
  .action-button.primary {
    background: var(--accent-primary, #3AB8FF);
    color: black;
  }
  
  .action-button.primary:hover {
    background: var(--accent-primary, #3AB8FF);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(58, 184, 255, 0.4);
  }
  
  .action-button.secondary {
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  
  .action-button.secondary:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.3);
  }
  
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
    }
  }
</style>
