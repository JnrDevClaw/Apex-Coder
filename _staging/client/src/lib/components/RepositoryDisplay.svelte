<script>
  import { onMount } from 'svelte';
  
  export let repository;
  export let compact = false;
  
  let copyFeedback = '';
  
  function copyToClipboard(text, label) {
    navigator.clipboard.writeText(text).then(() => {
      copyFeedback = `${label} copied!`;
      setTimeout(() => {
        copyFeedback = '';
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy:', err);
      copyFeedback = 'Failed to copy';
      setTimeout(() => {
        copyFeedback = '';
      }, 2000);
    });
  }
  
  function getCloneUrl() {
    return repository.cloneUrl || `https://github.com/${repository.name}.git`;
  }
  
  function getCloneCommand() {
    return `git clone ${getCloneUrl()}`;
  }
</script>

<div class="repository-display bg-panel border border-white/5 rounded-xl p-4 md:p-6">
  <div class="flex items-center gap-2 mb-3 md:mb-4">
    <svg class="w-5 h-5 md:w-6 md:h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
    <h2 class="text-lg md:text-xl font-bold text-white">GitHub Repository</h2>
  </div>
  
  <!-- Repository Name and URL -->
  <div class="mb-4">
    <div class="flex items-center justify-between mb-2">
      <p class="text-white/60 text-xs md:text-sm">Repository</p>
      {#if repository.visibility}
        <span class="px-2 py-1 rounded text-xs font-medium {repository.visibility === 'public' ? 'bg-accent-success/20 text-accent-success' : 'bg-white/10 text-white/60'}">
          {repository.visibility}
        </span>
      {/if}
    </div>
    <p class="text-white font-medium text-sm md:text-base break-all">{repository.name}</p>
  </div>
  
  {#if !compact}
    <!-- Repository Metadata -->
    {#if repository.metadata}
      <div class="grid grid-cols-2 gap-3 mb-4 text-xs md:text-sm">
        {#if repository.metadata.filesCount}
          <div class="bg-white/5 rounded-lg p-3">
            <p class="text-white/60 mb-1">Files Generated</p>
            <p class="text-white font-medium">{repository.metadata.filesCount}</p>
          </div>
        {/if}
        {#if repository.metadata.initialCommit}
          <div class="bg-white/5 rounded-lg p-3">
            <p class="text-white/60 mb-1">Initial Commit</p>
            <p class="text-white font-medium truncate" title={repository.metadata.initialCommit}>
              {repository.metadata.initialCommit.substring(0, 7)}
            </p>
          </div>
        {/if}
        {#if repository.metadata.branch}
          <div class="bg-white/5 rounded-lg p-3">
            <p class="text-white/60 mb-1">Default Branch</p>
            <p class="text-white font-medium">{repository.metadata.branch}</p>
          </div>
        {/if}
        {#if repository.metadata.createdAt}
          <div class="bg-white/5 rounded-lg p-3">
            <p class="text-white/60 mb-1">Created</p>
            <p class="text-white font-medium">{new Date(repository.metadata.createdAt).toLocaleDateString()}</p>
          </div>
        {/if}
      </div>
    {/if}
  {/if}
  
  <!-- Repository Actions -->
  <div class="flex flex-col sm:flex-row gap-2 md:gap-3">
    <a 
      href={repository.url} 
      target="_blank" 
      rel="noopener noreferrer"
      class="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-accent-primary text-black font-semibold shadow-neon hover:shadow-neonSoft hover:scale-[1.02] transition-all text-sm md:text-base touch-manipulation"
    >
      <svg class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
      </svg>
      View on GitHub
    </a>
    
    <button
      type="button"
      on:click={() => copyToClipboard(getCloneUrl(), 'Clone URL')}
      class="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 transition-all text-sm md:text-base touch-manipulation"
    >
      <svg class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
      </svg>
      Clone Repository
    </button>
  </div>
  
  <!-- Copy Feedback -->
  {#if copyFeedback}
    <div class="mt-2 text-center text-sm text-accent-success animate-fadeIn">
      {copyFeedback}
    </div>
  {/if}
  
  {#if !compact}
    <!-- Git Clone Command -->
    <div class="mt-4 bg-black/40 p-3 rounded-lg font-mono text-xs md:text-sm overflow-auto border border-white/5">
      <div class="flex items-center justify-between mb-2">
        <span class="text-white/60">Git Clone Command</span>
        <button
          type="button"
          on:click={() => copyToClipboard(getCloneCommand(), 'Command')}
          class="text-accent-primary hover:text-accent-primary/80 transition-colors p-1 -m-1"
          aria-label="Copy git clone command"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
          </svg>
        </button>
      </div>
      <code class="text-accent-primary break-all">
        {getCloneCommand()}
      </code>
    </div>
  {/if}
</div>

<style>
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-5px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .animate-fadeIn {
    animation: fadeIn 0.3s ease-in;
  }
  
  /* Touch-friendly interactions */
  :global(.touch-manipulation) {
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
</style>
