<script>
  export let height = "h-4";
  export let width = "w-full";
  export let variant = "default"; // default, ai-processing, stage-card, terminal
  export let showPulse = false;
  export let text = "";
</script>

{#if variant === "ai-processing"}
  <!-- AI Processing Skeleton with enhanced shimmer -->
  <div class={`relative overflow-hidden rounded-lg bg-white/5 ${height} ${width} border border-accent-primary/20`}>
    <div class="absolute inset-0 bg-gradient-to-r from-transparent via-accent-primary/60 to-transparent animate-shimmer"></div>
    {#if showPulse}
      <div class="absolute top-1 left-1 w-2 h-2 bg-accent-primary rounded-full animate-pulseSoft"></div>
    {/if}
    {#if text}
      <div class="absolute inset-0 flex items-center justify-center">
        <span class="text-xs text-accent-primary/80 font-mono">{text}</span>
      </div>
    {/if}
  </div>
{:else if variant === "stage-card"}
  <!-- Stage Card Skeleton -->
  <div class="bg-panel border border-white/5 rounded-xl p-4 flex gap-4">
    <div class="w-2 h-16 bg-white/10 rounded-full animate-pulseSoft"></div>
    <div class="flex-1 space-y-3">
      <div class="relative overflow-hidden rounded bg-white/10 h-5 w-3/4">
        <div class="absolute inset-0 bg-gradient-to-r from-transparent via-accent-primary/40 to-transparent animate-shimmer"></div>
      </div>
      <div class="relative overflow-hidden rounded bg-white/5 h-3 w-full">
        <div class="absolute inset-0 bg-gradient-to-r from-transparent via-accent-primary/30 to-transparent animate-shimmer"></div>
      </div>
      <div class="relative overflow-hidden rounded-full bg-accent-primary/20 h-6 w-20">
        <div class="absolute inset-0 bg-gradient-to-r from-transparent via-accent-primary/40 to-transparent animate-shimmer"></div>
      </div>
    </div>
  </div>
{:else if variant === "terminal"}
  <!-- Terminal Log Skeleton -->
  <div class="bg-black/40 p-4 rounded-xl border border-white/5 space-y-2">
    {#each Array(5) as _, i}
      <div class="flex gap-2">
        <div class="w-16 h-3 bg-white/10 rounded"></div>
        <div class={`relative overflow-hidden rounded bg-white/5 h-3 ${i % 2 === 0 ? 'w-3/4' : 'w-1/2'}`}>
          <div class="absolute inset-0 bg-gradient-to-r from-transparent via-accent-primary/30 to-transparent animate-shimmer" style="animation-delay: {i * 0.2}s"></div>
        </div>
      </div>
    {/each}
  </div>
{:else}
  <!-- Default Skeleton -->
  <div class={`relative overflow-hidden rounded-lg bg-white/5 ${height} ${width}`}>
    <div class="absolute inset-0 bg-gradient-to-r from-transparent via-accent-primary/40 to-transparent animate-shimmer"></div>
    {#if showPulse}
      <div class="absolute top-1 right-1 w-2 h-2 bg-accent-primary rounded-full animate-pulseSoft"></div>
    {/if}
  </div>
{/if}
