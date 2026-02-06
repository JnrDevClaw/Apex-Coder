<script>
  export let stage = ""; // Stage name like "creating_specs", "coding_file", etc.
  export let status = "pending"; // pending, running, done, error
  export let modelName = ""; // AI model being used
  export let progress = 0; // 0-100
  export let message = ""; // Custom message
  export let showPulse = true;
  export let compact = false;
  
  // Map stages to AI models and descriptions
  const stageInfo = {
    creating_specs: {
      model: "HuggingFace Clarifier",
      description: "Analyzing requirements",
      icon: "📋"
    },
    creating_docs: {
      model: "Llama 4 Scout 17B",
      description: "Generating documentation",
      icon: "📚"
    },
    creating_schema: {
      model: "DeepSeek-V3",
      description: "Designing database schema",
      icon: "🗄️"
    },
    creating_files: {
      model: "GPT-4o",
      description: "Structuring project files",
      icon: "📁"
    },
    coding_file: {
      model: "Gemini-3",
      description: "Writing code",
      icon: "💻"
    },
    creating_repo: {
      model: "GitHub API",
      description: "Creating repository",
      icon: "🔗"
    },
    deploying: {
      model: "AWS Services",
      description: "Deploying application",
      icon: "🚀"
    }
  };
  
  $: currentStage = stageInfo[stage] || { model: modelName, description: message, icon: "⚙️" };
  $: displayModel = modelName || currentStage.model;
  $: displayMessage = message || currentStage.description;
</script>

<div class={`ai-processing-indicator ${compact ? 'compact' : ''}`}>
  {#if status === 'running'}
    <div class="flex items-center gap-3 p-3 bg-accent-primary/10 border border-accent-primary/30 rounded-lg">
      <!-- AI Model Icon/Avatar -->
      <div class="flex-shrink-0">
        {#if showPulse}
          <div class="relative">
            <div class="w-8 h-8 bg-accent-primary/20 rounded-full flex items-center justify-center">
              <span class="text-sm">{currentStage.icon}</span>
            </div>
            <div class="absolute inset-0 bg-accent-primary/30 rounded-full animate-pulseSoft"></div>
          </div>
        {:else}
          <div class="w-8 h-8 bg-accent-primary/20 rounded-full flex items-center justify-center">
            <span class="text-sm">{currentStage.icon}</span>
          </div>
        {/if}
      </div>
      
      <!-- Content -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-2 h-2 bg-accent-primary rounded-full animate-pulseSoft"></div>
          <span class="text-sm font-medium text-accent-primary">{displayModel}</span>
        </div>
        <p class="text-xs text-white/80">{displayMessage}</p>
        
        {#if progress > 0 && progress < 100}
          <div class="mt-2 w-full bg-white/10 rounded-full h-1">
            <div 
              class="bg-accent-primary h-1 rounded-full transition-all duration-300"
              style="width: {progress}%"
            ></div>
          </div>
        {/if}
      </div>
      
      <!-- Thinking Animation -->
      <div class="flex-shrink-0">
        <div class="flex space-x-1">
          <div class="w-1 h-1 bg-accent-primary rounded-full animate-bounce" style="animation-delay: 0ms"></div>
          <div class="w-1 h-1 bg-accent-primary rounded-full animate-bounce" style="animation-delay: 150ms"></div>
          <div class="w-1 h-1 bg-accent-primary rounded-full animate-bounce" style="animation-delay: 300ms"></div>
        </div>
      </div>
    </div>
  {:else if status === 'done'}
    <div class="flex items-center gap-3 p-3 bg-accent-success/10 border border-accent-success/30 rounded-lg">
      <div class="w-8 h-8 bg-accent-success/20 rounded-full flex items-center justify-center">
        <svg class="w-4 h-4 text-accent-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
      </div>
      <div class="flex-1">
        <span class="text-sm font-medium text-accent-success">{displayModel}</span>
        <p class="text-xs text-white/60">Completed: {displayMessage}</p>
      </div>
    </div>
  {:else if status === 'error'}
    <div class="flex items-center gap-3 p-3 bg-accent-error/10 border border-accent-error/30 rounded-lg">
      <div class="w-8 h-8 bg-accent-error/20 rounded-full flex items-center justify-center">
        <svg class="w-4 h-4 text-accent-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </div>
      <div class="flex-1">
        <span class="text-sm font-medium text-accent-error">{displayModel}</span>
        <p class="text-xs text-white/60">Error: {displayMessage}</p>
      </div>
    </div>
  {:else}
    <!-- Pending state -->
    <div class="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-lg opacity-60">
      <div class="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center">
        <span class="text-sm text-white/40">{currentStage.icon}</span>
      </div>
      <div class="flex-1">
        <span class="text-sm font-medium text-white/60">{displayModel}</span>
        <p class="text-xs text-white/40">Waiting: {displayMessage}</p>
      </div>
    </div>
  {/if}
</div>

<style>
  .ai-processing-indicator.compact {
    font-size: 0.875rem;
  }
  
  .ai-processing-indicator.compact .w-8 {
    width: 1.5rem;
    height: 1.5rem;
  }
</style>
