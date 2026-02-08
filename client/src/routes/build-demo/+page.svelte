<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { 
    startPipeline, 
    resetPipeline 
  } from '../../lib/stores/mockPipeline.js';
  
  import BuildProgress from '../../lib/components/BuildProgress.svelte';
  
  // Sample project spec for demo
  const demoProjectSpec = {
    userMode: 'non-developer',
    project_overview: {
      app_name: 'MusicWave',
      app_summary: 'A neon-style music streaming web app that connects artists with fans',
      app_details: 'User authentication, music streaming, playlist creation, artist profiles, social sharing, discovery features',
      niche: 'music',
      potential_users: 'Musicians, music lovers, content creators, indie artists',
      estimated_user_count: '1000-10000'
    },
    app_structure: {
      app_type: 'web-app',
      authentication_needed: true,
      deployment_preference: 'aws'
    },
    design_preferences: {
      theme_style: 'neon',
      accent_color: '#00FF88',
      general_vibe: 'energetic'
    },
    intelligent_clarifier: {
      project_goals: 'Create a platform where independent musicians can share their work and connect directly with fans',
      unique_features: 'Focus on independent artists, direct fan-to-artist messaging, collaborative playlists, local music scene discovery'
    }
  };
  
  let hasStarted = false;
  
  onMount(() => {
    // Reset pipeline state
    resetPipeline();
    
    // Auto-start the demo build process
    setTimeout(() => {
      startDemo();
    }, 1000);
  });
  
  function startDemo() {
    hasStarted = true;
    startPipeline(demoProjectSpec);
  }
  
  function handleRestartDemo() {
    resetPipeline();
    setTimeout(() => {
      startDemo();
    }, 500);
  }
  
  function goToQuestionnaire() {
    goto('/questionnaire');
  }
</script>

<svelte:head>
  <title>Build Process Demo - AI App Builder</title>
</svelte:head>

<div class="min-h-screen bg-bg-primary py-8">
  <!-- Navigation -->
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
    <div class="flex items-center justify-between">
      <button
        type="button"
        on:click={() => goto('/')}
        class="flex items-center text-sm text-white/60 hover:text-white transition"
      >
        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
        </svg>
        Back to Home
      </button>
      
      <div class="flex space-x-2">
        <button
          type="button"
          on:click={goToQuestionnaire}
          class="px-4 py-2 text-sm font-medium rounded-lg bg-accent-primary/20 text-accent-primary border border-accent-primary/30 hover:bg-accent-primary/30 transition"
        >
          Try Questionnaire
        </button>
        
        <button
          type="button"
          on:click={handleRestartDemo}
          class="px-4 py-2 text-sm font-medium rounded-lg bg-accent-success/20 text-accent-success border border-accent-success/30 hover:bg-accent-success/30 transition"
        >
          Restart Demo
        </button>
      </div>
    </div>
  </div>
  
  <!-- Demo Header -->
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
    <div class="text-center">
      <h1 class="text-3xl font-bold text-white mb-2">Build Process Demo</h1>
      <p class="text-lg text-white/60">
        Watch how AI transforms an idea into a full-stack application
      </p>
    </div>
  </div>
  
  <!-- Sample Project Info -->
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
    <div class="bg-panel border border-white/5 rounded-xl p-6 shadow-neonSoft">
      <h3 class="text-lg font-semibold text-white mb-4">Demo Project: MusicWave</h3>
      <div class="grid md:grid-cols-2 gap-6 text-sm">
        <div>
          <div class="space-y-2">
            <div><span class="text-white/50">Type:</span> <span class="ml-2 text-white/80">Music Streaming Platform</span></div>
            <div><span class="text-white/50">Users:</span> <span class="ml-2 text-white/80">Musicians & Music Lovers</span></div>
            <div><span class="text-white/50">Theme:</span> <span class="ml-2 text-white/80">Neon & Energetic</span></div>
          </div>
        </div>
        <div>
          <div class="space-y-2">
            <div><span class="text-white/50">Features:</span> <span class="ml-2 text-white/80">Streaming, Playlists, Social</span></div>
            <div><span class="text-white/50">Scale:</span> <span class="ml-2 text-white/80">1,000-10,000 users</span></div>
            <div><span class="text-white/50">Hosting:</span> <span class="ml-2 text-white/80">AWS</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Build Progress Component -->
  <BuildProgress projectSpec={demoProjectSpec} />
  
  <!-- Demo Features -->
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
    <div class="bg-panel border border-accent-primary/20 rounded-xl p-6 shadow-neonSoft">
      <h3 class="text-lg font-semibold text-white mb-4">What You're Seeing</h3>
      <div class="grid md:grid-cols-2 gap-6 text-sm text-white/80">
        <div>
          <h4 class="font-medium mb-2 text-accent-primary">AI Pipeline Stages:</h4>
          <ul class="space-y-1">
            <li>• Spec generation from questionnaire</li>
            <li>• Documentation creation</li>
            <li>• Database schema design</li>
            <li>• File structure planning</li>
            <li>• Code generation with AI models</li>
          </ul>
        </div>
        <div>
          <h4 class="font-medium mb-2 text-accent-success">Infrastructure Setup:</h4>
          <ul class="space-y-1">
            <li>• GitHub repository creation</li>
            <li>• AWS resource provisioning</li>
            <li>• Automated testing pipeline</li>
            <li>• Live deployment with URLs</li>
            <li>• Real-time progress monitoring</li>
          </ul>
        </div>
      </div>
      
      <div class="mt-4 p-4 bg-accent-primary/10 border border-accent-primary/20 rounded-lg">
        <p class="text-sm text-white/70">
          <strong class="text-accent-primary">Note:</strong> This demo simulates the complete build process. The real system uses multiple AI models 
          (GPT-4, Claude, Gemini, DeepSeek) to generate production-ready code, create GitHub repositories, 
          and deploy to AWS infrastructure.
        </p>
      </div>
    </div>
  </div>
</div>
