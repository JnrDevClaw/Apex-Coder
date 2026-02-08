<script>
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  export let spec;
  export let canStartBuild = false;
  export let isStartingBuild = false;
  
  function handleStartBuild() {
    dispatch('startBuild');
  }
  
  function handleEditSpec() {
    dispatch('editSpec');
  }
</script>

<div class="spec-summary">
  <div class="bg-panel border border-white/5 rounded-xl p-6 shadow-neonSoft">
    <h3 class="text-lg font-semibold text-white mb-4">Project Summary</h3>
    
    <div class="grid md:grid-cols-2 gap-6">
      <!-- Project Overview -->
      <div>
        <h4 class="font-medium text-white mb-2">Project Overview</h4>
        <div class="space-y-2 text-sm">
          <div>
            <span class="text-white/50">Name:</span>
            <span class="ml-2 font-medium text-white">{spec.project_overview?.app_name || 'Not specified'}</span>
          </div>
          <div>
            <span class="text-white/50">Category:</span>
            <span class="ml-2 text-white/80">{spec.project_overview?.niche || 'Not specified'}</span>
          </div>
          <div>
            <span class="text-white/50">Target Users:</span>
            <span class="ml-2 text-white/80">{spec.project_overview?.potential_users || 'Not specified'}</span>
          </div>
          <div>
            <span class="text-white/50">Expected Scale:</span>
            <span class="ml-2 text-white/80">{spec.project_overview?.estimated_user_count || 'Not specified'}</span>
          </div>
        </div>
      </div>
      
      <!-- App Structure -->
      <div>
        <h4 class="font-medium text-white mb-2">App Structure</h4>
        <div class="space-y-2 text-sm">
          <div>
            <span class="text-white/50">Type:</span>
            <span class="ml-2 text-white/80">{spec.app_structure?.app_type || 'Not specified'}</span>
          </div>
          <div>
            <span class="text-white/50">Authentication:</span>
            <span class="ml-2 text-white/80">{spec.app_structure?.authentication_needed ? 'Required' : 'Not required'}</span>
          </div>
          <div>
            <span class="text-white/50">Hosting:</span>
            <span class="ml-2 text-white/80">{spec.app_structure?.deployment_preference || 'Not specified'}</span>
          </div>
          <div>
            <span class="text-white/50">User Mode:</span>
            <span class="ml-2 capitalize text-white/80">{spec.userMode || 'Not specified'}</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Description -->
    {#if spec.project_overview?.app_summary}
      <div class="mt-6">
        <h4 class="font-medium text-white mb-2">Description</h4>
        <p class="text-sm text-white/60">{spec.project_overview.app_summary}</p>
      </div>
    {/if}
    
    <!-- Features -->
    {#if spec.project_overview?.app_details}
      <div class="mt-6">
        <h4 class="font-medium text-white mb-2">Core Features</h4>
        <p class="text-sm text-white/60">{spec.project_overview.app_details}</p>
      </div>
    {/if}
    
    <!-- Design Preferences -->
    <div class="mt-6">
      <h4 class="font-medium text-white mb-2">Design Preferences</h4>
      <div class="flex items-center space-x-4 text-sm">
        <div>
          <span class="text-white/50">Theme:</span>
          <span class="ml-2 text-white/80">{spec.design_preferences?.theme_style || 'Not specified'}</span>
        </div>
        <div>
          <span class="text-white/50">Vibe:</span>
          <span class="ml-2 text-white/80">{spec.design_preferences?.general_vibe || 'Not specified'}</span>
        </div>
        {#if spec.design_preferences?.accent_color}
          <div class="flex items-center">
            <span class="text-white/50">Color:</span>
            <div 
              class="ml-2 w-4 h-4 rounded border border-white/20"
              style="background-color: {spec.design_preferences.accent_color}"
            ></div>
          </div>
        {/if}
      </div>
    </div>
    
    <!-- Technical Details (for developers) -->
    {#if spec.userMode === 'developer' && spec.technical_blueprint}
      <div class="mt-6">
        <h4 class="font-medium text-white mb-2">Technical Stack</h4>
        <div class="grid md:grid-cols-3 gap-4 text-sm">
          <div>
            <span class="text-white/50">Frontend:</span>
            <span class="ml-2 text-white/80">{spec.technical_blueprint.frontend_framework || 'Not specified'}</span>
          </div>
          <div>
            <span class="text-white/50">Backend:</span>
            <span class="ml-2 text-white/80">{spec.technical_blueprint.backend_framework || 'Not specified'}</span>
          </div>
          <div>
            <span class="text-white/50">Database:</span>
            <span class="ml-2 text-white/80">{spec.technical_blueprint.database_engine || 'Not specified'}</span>
          </div>
        </div>
      </div>
    {/if}
    
    <!-- Project Goals (for non-developers) -->
    {#if spec.userMode === 'non-developer' && spec.intelligent_clarifier}
      <div class="mt-6">
        <h4 class="font-medium text-white mb-2">Project Goals</h4>
        <p class="text-sm text-white/60">{spec.intelligent_clarifier.project_goals || 'Not specified'}</p>
        
        {#if spec.intelligent_clarifier.unique_features}
          <div class="mt-3">
            <h5 class="font-medium text-white mb-1">Unique Features</h5>
            <p class="text-sm text-white/60">{spec.intelligent_clarifier.unique_features}</p>
          </div>
        {/if}
      </div>
    {/if}
  </div>
  
  <!-- Action Buttons -->
  <div class="mt-6 flex justify-between items-center">
    <button
      type="button"
      on:click={handleEditSpec}
      class="px-5 py-3 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 transition font-medium"
    >
      Edit Specification
    </button>
    
    <button
      type="button"
      on:click={handleStartBuild}
      disabled={!canStartBuild || isStartingBuild}
      class="px-8 py-3 text-lg font-semibold rounded-lg bg-accent-success text-black shadow-neon hover:shadow-neonSoft hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
    >
      {#if isStartingBuild}
        <span class="flex items-center gap-3">
          <div class="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
          <span>Starting Build...</span>
        </span>
      {:else}
        <span class="flex items-center gap-2">
          <span>🚀</span>
          <span>Start Building My App</span>
        </span>
      {/if}
    </button>
  </div>
</div>
