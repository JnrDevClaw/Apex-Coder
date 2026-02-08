<script>
  import { goto } from '$app/navigation';
  
  function createPipeline() {
    goto('/questionnaire');
  }
</script>

<div class="cyber-panel p-8 text-center border-dashed border-2 border-accent-primary/30 hover:border-accent-primary/60 transition-all cursor-pointer group" on:click={createPipeline}>
  <div class="w-16 h-16 rounded-full bg-accent-primary/10 flex items-center justify-center mx-auto mb-4 group-hover:bg-accent-primary/20 transition-all">
    <svg class="w-8 h-8 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
    </svg>
  </div>
  
  <h3 class="text-lg font-display font-semibold text-white mb-2 group-hover:text-accent-primary transition-colors">
    Create New Pipeline
  </h3>
  
  <p class="text-text-secondary text-sm mb-4">
    Start building your next AI-powered application
  </p>
  
  <div class="inline-flex items-center gap-2 text-accent-primary text-sm font-medium">
    <span>Get Started</span>
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path>
    </svg>
  </div>
</div>
