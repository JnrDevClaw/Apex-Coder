<script>
  export let currentStage = 0;
  export let stageDefinitions = [];
  export let stageCompletion = {};
  export let onStageClick = () => {};
  
  function getStageStatus(index) {
    if (stageCompletion[index] || index < currentStage) return 'completed';
    if (index === currentStage) return 'current';
    return 'upcoming';
  }
  
  function isStageClickable(index) {
    // Can click on completed stages, current stage, or next stage if current is complete
    if (index < currentStage) return true; // Completed stages
    if (index === currentStage) return true; // Current stage
    if (index === currentStage + 1 && stageCompletion[currentStage]) return true; // Next stage if current complete
    return false;
  }
  
  function getStageClasses(index) {
    const status = getStageStatus(index);
    const clickable = isStageClickable(index);
    const baseClasses = "stage-indicator flex items-center justify-center w-10 h-10 rounded-full border-2 text-sm font-medium transition-all duration-200";
    const cursorClass = clickable ? "cursor-pointer hover:scale-110" : "cursor-not-allowed opacity-50";
    
    if (status === 'completed') {
      return `${baseClasses} ${cursorClass} bg-accent-primary border-accent-primary text-black shadow-neon`;
    } else if (status === 'current') {
      return `${baseClasses} ${cursorClass} bg-accent-primary/20 border-accent-primary text-accent-primary animate-pulseSoft`;
    } else {
      return `${baseClasses} ${cursorClass} bg-white/5 border-white/20 text-white/40`;
    }
  }
  
  function handleStageClick(index) {
    if (isStageClickable(index)) {
      onStageClick(index);
    }
  }
</script>

<div class="stage-progress mb-8">
  <div class="flex items-center justify-between max-w-4xl mx-auto">
    {#each stageDefinitions as stage, index}
      <div class="flex items-center">
        <button
          type="button"
          class={getStageClasses(index)}
          on:click={() => handleStageClick(index)}
          disabled={!isStageClickable(index)}
          title={stage.title}
        >
          {#if getStageStatus(index) === 'completed'}
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
            </svg>
          {:else}
            {String.fromCharCode(65 + index)}
          {/if}
        </button>
        
        {#if index < stageDefinitions.length - 1}
          <div 
            class="stage-connector w-8 sm:w-12 h-0.5 mx-1 sm:mx-2 transition-all {getStageStatus(index) === 'completed' ? 'bg-accent-primary shadow-neon' : 'bg-white/10'}"
          ></div>
        {/if}
      </div>
    {/each}
  </div>
  
  <div class="mt-4 text-center">
    <div class="text-sm text-white/60">
      Stage {String.fromCharCode(65 + currentStage)} of {stageDefinitions.length}
    </div>
    <div class="text-lg font-medium text-white mt-1">
      {stageDefinitions[currentStage]?.title || 'Loading...'}
    </div>
  </div>
</div>
