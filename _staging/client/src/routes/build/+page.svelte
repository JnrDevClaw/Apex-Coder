<script>
  import { goto } from '$app/navigation';
  
  function goBack() {
    goto('/');
  }
</script>

<svelte:head>
  <title>Build Monitor - AI App Builder</title>
</svelte:head>

<div class="min-h-screen bg-bg-primary">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
    <div class="cyber-panel p-8">
      <h1 class="text-4xl font-display font-bold text-white mb-6">
        Active <span class="text-accent-primary">Build Pipelines</span>
      </h1>
      
      <p class="text-text-secondary mb-8">
        Monitor your AI-generated application builds in real-time.
      </p>
      
      <div class="space-y-6">
        <div class="p-6 bg-bg-secondary rounded-lg border border-accent-primary/20">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-3 h-3 rounded-full bg-accent-success animate-pulse-glow"></div>
            <h3 class="text-xl font-display font-semibold text-white">System Ready</h3>
          </div>
          <p class="text-text-secondary">
            No active builds at the moment. Start a new build from the questionnaire to see 
            real-time progress tracking with granular stage monitoring.
          </p>
        </div>
        
        <div class="grid md:grid-cols-3 gap-4">
          <div class="p-4 bg-bg-secondary rounded-lg border border-white/5">
            <div class="text-2xl font-bold text-accent-primary mb-1">0</div>
            <div class="text-sm text-text-secondary">Active Builds</div>
          </div>
          <div class="p-4 bg-bg-secondary rounded-lg border border-white/5">
            <div class="text-2xl font-bold text-accent-success mb-1">0</div>
            <div class="text-sm text-text-secondary">Completed</div>
          </div>
          <div class="p-4 bg-bg-secondary rounded-lg border border-white/5">
            <div class="text-2xl font-bold text-text-secondary mb-1">0</div>
            <div class="text-sm text-text-secondary">Failed</div>
          </div>
        </div>
      </div>
      
      <div class="mt-8 flex gap-4">
        <button
          type="button"
          on:click={goBack}
          class="btn-secondary"
        >
          <span class="flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
            </svg>
            Back to Home
          </span>
        </button>
        
        <button
          type="button"
          on:click={() => goto('/questionnaire')}
          class="btn-primary"
        >
          <span class="flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
            </svg>
            Start New Build
          </span>
        </button>
      </div>
    </div>
  </div>
</div>
