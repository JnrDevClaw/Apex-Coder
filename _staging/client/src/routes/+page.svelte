<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  
  let hasAccess = $state(false);
  let showAccessModal = $state(false);
  let showReferralInput = $state(false);
  let referralCode = $state('');
  let referralError = $state('');
  let email = $state('');
  let waitlistSubmitted = $state(false);
  let waitlistError = $state('');
  let isSubmitting = $state(false);
  
  const VALID_CODES = ['KIRO2026', 'EARLYACCESS', 'BUILDER'];
  
  onMount(() => {
    if (browser) {
      hasAccess = localStorage.getItem('app_access') === 'granted';
    }
  });
  
  function handleCTA() {
    if (hasAccess) {
      goto('/questionnaire');
    } else {
      showAccessModal = true;
    }
  }
  
  function handlePipelines() {
    if (hasAccess) {
      goto('/pipelines');
    } else {
      showAccessModal = true;
    }
  }
  
  function validateReferralCode() {
    referralError = '';
    const code = referralCode.trim().toUpperCase();
    if (!code) { referralError = 'Please enter a referral code'; return; }
    if (VALID_CODES.includes(code)) {
      localStorage.setItem('app_access', 'granted');
      hasAccess = true;
      showAccessModal = false;
      goto('/questionnaire');
    } else { referralError = 'Invalid referral code'; }
  }
  
  async function submitWaitlist() {
    waitlistError = '';
    if (!email || !email.includes('@')) { waitlistError = 'Please enter a valid email'; return; }
    isSubmitting = true;
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (data.success) {
        waitlistSubmitted = true;
        localStorage.setItem('waitlist_email', email);
      } else { waitlistError = data.error || 'Something went wrong'; }
    } catch { waitlistError = 'Something went wrong'; }
    finally { isSubmitting = false; }
  }
  
  function closeModal() {
    showAccessModal = false;
    showReferralInput = false;
    referralError = '';
  }
  
  function logout() { localStorage.removeItem('app_access'); hasAccess = false; }
</script>

<svelte:head>
  <title>AI App Builder - Automated Application Generation</title>
</svelte:head>

<div class="min-h-screen bg-bg-primary">
  <!-- Hero Section -->
  <div class="relative overflow-hidden">
    <div class="absolute inset-0 opacity-10">
      <div class="absolute inset-0" style="background-image: linear-gradient(var(--accent-primary) 1px, transparent 1px), linear-gradient(90deg, var(--accent-primary) 1px, transparent 1px); background-size: 50px 50px;"></div>
    </div>
    
    <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
      <div class="text-center">
        <div class="w-20 h-1 bg-accent-primary mx-auto mb-8 rounded-full shadow-neon"></div>
        
        <!-- Coming Soon Badge -->
        {#if !hasAccess}
        <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-primary/10 border border-accent-primary/30 mb-6">
          <div class="w-2 h-2 rounded-full bg-accent-primary animate-pulse"></div>
          <span class="text-accent-primary font-semibold text-sm">Coming Soon</span>
        </div>
        {/if}
        
        <h1 class="text-5xl md:text-7xl font-display font-bold mb-6">
          <span class="text-white">AI App Builder</span><br />
          <span class="text-accent-primary filter-neon">Automated Intelligence</span>
        </h1>
        
        <p class="text-xl md:text-2xl text-text-secondary mb-12 max-w-3xl mx-auto font-body">
          Transform your ideas into production-ready applications through 
          <span class="text-accent-primary">multi-agent orchestration</span>. 
          Secure, automated, and intelligent.
        </p>
        
        <div class="flex flex-col sm:flex-row gap-6 justify-center items-center">
          <button type="button" onclick={handleCTA} class="btn-primary group relative overflow-hidden">
            <span class="relative z-10 flex items-center gap-2">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
              </svg>
              {hasAccess ? 'Initialize Build Pipeline' : 'Get Early Access'}
            </span>
          </button>
          
          <button type="button" onclick={handlePipelines} class="btn-secondary group">
            <span class="flex items-center gap-2">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
              </svg>
              Pipeline Dashboard
            </span>
          </button>
          
          {#if hasAccess}
          <button type="button" onclick={logout} class="text-text-secondary hover:text-accent-error text-sm">
            Exit Early Access
          </button>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- Pipeline Stages Section -->
  <div class="py-20 bg-bg-secondary relative">
    <div class="absolute inset-0 opacity-5" style="background-image: linear-gradient(var(--accent-primary) 1px, transparent 1px), linear-gradient(90deg, var(--accent-primary) 1px, transparent 1px); background-size: 30px 30px;"></div>
    
    <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-16">
        <h2 class="text-4xl font-display font-bold text-white mb-4">
          Multi-Agent <span class="text-accent-primary">Orchestration</span>
        </h2>
        <p class="text-lg text-text-secondary">Automated pipeline with intelligent stage routing</p>
      </div>
      
      <div class="grid md:grid-cols-3 gap-8">
        <div class="cyber-panel p-8 neon-border group hover:border-accent-primary">
          <div class="flex items-center justify-center w-16 h-16 rounded-lg bg-bg-primary border border-accent-primary mb-6 mx-auto group-hover:shadow-neon transition-all">
            <svg class="w-8 h-8 text-accent-primary filter-neon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
          </div>
          <h3 class="text-xl font-display font-semibold text-white mb-3 text-center">Specification Analysis</h3>
          <p class="text-text-secondary text-center font-body">Intelligent questionnaire adapts to technical expertise. AI clarifier fills gaps and validates requirements.</p>
          <div class="mt-4 flex justify-center">
            <span class="text-xs font-code text-accent-primary opacity-70">Stage 1-2</span>
          </div>
        </div>
        
        <div class="cyber-panel p-8 neon-border group hover:border-success">
          <div class="flex items-center justify-center w-16 h-16 rounded-lg bg-bg-primary border border-success mb-6 mx-auto group-hover:shadow-neon transition-all">
            <svg class="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
            </svg>
          </div>
          <h3 class="text-xl font-display font-semibold text-white mb-3 text-center">Code Generation</h3>
          <p class="text-text-secondary text-center font-body">Multi-model pipeline generates schema, structure, and implementation. Automated testing and validation.</p>
          <div class="mt-4 flex justify-center">
            <span class="text-xs font-code text-success opacity-70">Stage 3-10</span>
          </div>
        </div>
        
        <div class="cyber-panel p-8 neon-border group hover:border-accent-secondary">
          <div class="flex items-center justify-center w-16 h-16 rounded-lg bg-bg-primary border border-accent-secondary mb-6 mx-auto group-hover:shadow-neon transition-all">
            <svg class="w-8 h-8 text-accent-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"></path>
            </svg>
          </div>
          <h3 class="text-xl font-display font-semibold text-white mb-3 text-center">Deployment Pipeline</h3>
          <p class="text-text-secondary text-center font-body">Automated GitHub repository creation and AWS infrastructure provisioning. Production-ready.</p>
          <div class="mt-4 flex justify-center">
            <span class="text-xs font-code text-accent-secondary opacity-70">Stage 11-12</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- System Capabilities -->
  <div class="py-20 bg-bg-primary">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-16">
        <h2 class="text-4xl font-display font-bold text-white mb-4">
          System <span class="text-accent-primary">Capabilities</span>
        </h2>
        <p class="text-lg text-text-secondary">Enterprise-grade automation and security</p>
      </div>
      
      <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="cyber-panel p-6 group hover:border-accent-primary transition-all">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded bg-accent-primary bg-opacity-10 flex items-center justify-center">
              <svg class="w-5 h-5 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
            </div>
            <h3 class="font-display font-semibold text-white">Adaptive Intake</h3>
          </div>
          <p class="text-sm text-text-secondary font-body">Context-aware questionnaire with AI-powered clarification and validation</p>
        </div>
        
        <div class="cyber-panel p-6 group hover:border-success transition-all">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded bg-success bg-opacity-10 flex items-center justify-center">
              <svg class="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
              </svg>
            </div>
            <h3 class="font-display font-semibold text-white">Multi-Model Pipeline</h3>
          </div>
          <p class="text-sm text-text-secondary font-body">Specialized AI agents for each stage: clarification, schema, validation, coding</p>
        </div>
        
        <div class="cyber-panel p-6 group hover:border-accent-secondary transition-all">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded bg-accent-secondary bg-opacity-10 flex items-center justify-center">
              <svg class="w-5 h-5 text-accent-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
              </svg>
            </div>
            <h3 class="font-display font-semibold text-white">Secure Deployment</h3>
          </div>
          <p class="text-sm text-text-secondary font-body">IAM-role-backed AWS operations with audit trails and approval gates</p>
        </div>
        
        <div class="cyber-panel p-6 group hover:border-accent-primary transition-all">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded bg-accent-primary bg-opacity-10 flex items-center justify-center">
              <svg class="w-5 h-5 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
              </svg>
            </div>
            <h3 class="font-display font-semibold text-white">Real-Time Monitoring</h3>
          </div>
          <p class="text-sm text-text-secondary font-body">Live pipeline status with granular stage tracking and error propagation</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Why Join Section - Compelling Benefits -->
  <div class="py-20 bg-bg-secondary relative">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-16">
        <h2 class="text-4xl font-display font-bold text-white mb-4">
          Stop Writing <span class="text-accent-error">Boilerplate</span>
        </h2>
        <p class="text-lg text-text-secondary max-w-2xl mx-auto">Focus on what matters. Let AI handle the repetitive setup, configuration, and deployment.</p>
      </div>
      
      <div class="grid md:grid-cols-2 gap-12 items-center">
        <div class="space-y-8">
          <div class="flex gap-4">
            <div class="flex-shrink-0 w-12 h-12 rounded-lg bg-accent-primary/10 flex items-center justify-center">
              <span class="text-2xl">⏱️</span>
            </div>
            <div>
              <h3 class="text-xl font-display font-semibold text-white mb-2">Hours → Minutes</h3>
              <p class="text-text-secondary">What takes days of setup, configuration, and boilerplate now takes minutes. Describe your app, watch it build.</p>
            </div>
          </div>
          
          <div class="flex gap-4">
            <div class="flex-shrink-0 w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center">
              <span class="text-2xl">🎯</span>
            </div>
            <div>
              <h3 class="text-xl font-display font-semibold text-white mb-2">Production-Ready Output</h3>
              <p class="text-text-secondary">Not just code snippets. Full applications with authentication, database schemas, API routes, and deployment configs.</p>
            </div>
          </div>
          
          <div class="flex gap-4">
            <div class="flex-shrink-0 w-12 h-12 rounded-lg bg-accent-secondary/10 flex items-center justify-center">
              <span class="text-2xl">🔄</span>
            </div>
            <div>
              <h3 class="text-xl font-display font-semibold text-white mb-2">Self-Healing Pipeline</h3>
              <p class="text-text-secondary">AI debugger automatically fixes errors. Up to 5 iterations of self-correction before human escalation.</p>
            </div>
          </div>
        </div>
        
        <div class="cyber-panel p-8 relative overflow-hidden">
          <div class="absolute top-0 right-0 w-32 h-32 bg-accent-primary/5 rounded-full blur-2xl"></div>
          <h3 class="text-2xl font-display font-bold text-white mb-6">What You Get</h3>
          <ul class="space-y-4">
            <li class="flex items-center gap-3">
              <svg class="w-5 h-5 text-success flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
              <span class="text-text-secondary">Complete GitHub repository with CI/CD</span>
            </li>
            <li class="flex items-center gap-3">
              <svg class="w-5 h-5 text-success flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
              <span class="text-text-secondary">AWS infrastructure (S3, Lambda, API Gateway)</span>
            </li>
            <li class="flex items-center gap-3">
              <svg class="w-5 h-5 text-success flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
              <span class="text-text-secondary">Database schemas and migrations</span>
            </li>
            <li class="flex items-center gap-3">
              <svg class="w-5 h-5 text-success flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
              <span class="text-text-secondary">Authentication and authorization</span>
            </li>
            <li class="flex items-center gap-3">
              <svg class="w-5 h-5 text-success flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
              <span class="text-text-secondary">API documentation and tests</span>
            </li>
            <li class="flex items-center gap-3">
              <svg class="w-5 h-5 text-success flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
              <span class="text-text-secondary">Live deployment URL</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>

  <!-- Final CTA Section -->
  <div class="py-20 bg-bg-primary relative overflow-hidden">
    <div class="absolute top-0 left-0 right-0 h-px ai-pulse-bar"></div>
    <div class="absolute bottom-0 left-0 right-0 h-px ai-pulse-bar" style="animation-delay: 1s;"></div>
    
    <div class="relative max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
      <div class="cyber-panel p-12">
        <h2 class="text-4xl font-display font-bold text-white mb-6">
          {hasAccess ? 'Ready to Build?' : 'Be First in Line'}
        </h2>
        <p class="text-xl text-text-secondary mb-10 font-body">
          {#if hasAccess}
            Your early access is active. Start building your first AI-generated application.
          {:else}
            Join the waitlist and get notified when we launch. Early access members get priority support and exclusive features.
          {/if}
        </p>
        
        <button type="button" onclick={handleCTA} class="btn-primary text-lg px-10 py-4">
          <span class="flex items-center justify-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
            </svg>
            {hasAccess ? 'Start Building' : 'Join the Waitlist'}
          </span>
        </button>
        
        {#if !hasAccess}
        <p class="mt-6 text-text-secondary text-sm">
          Already have a code? 
          <button type="button" onclick={() => showAccessModal = true} class="text-accent-primary hover:underline">
            Enter referral code
          </button>
        </p>
        {/if}
        
        <div class="mt-10 flex items-center justify-center gap-2 text-sm">
          <div class="w-2 h-2 rounded-full bg-success animate-pulse-glow"></div>
          <span class="text-text-secondary font-code">System Operational</span>
          <span class="text-text-secondary opacity-50">|</span>
          <span class="text-accent-primary font-code">All Agents Online</span>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Access Modal -->
{#if showAccessModal}
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <!-- Backdrop -->
  <button type="button" class="absolute inset-0 bg-black/70 backdrop-blur-sm" onclick={closeModal} aria-label="Close modal"></button>
  
  <!-- Modal -->
  <div class="relative cyber-panel p-8 max-w-md w-full">
    <button type="button" onclick={closeModal} class="absolute top-4 right-4 text-text-secondary hover:text-white" aria-label="Close">
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
      </svg>
    </button>
    
    <div class="text-center mb-8">
      <div class="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-accent-primary to-accent-secondary p-[2px]">
        <div class="w-full h-full rounded-xl bg-bg-primary flex items-center justify-center">
          <svg class="w-8 h-8 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
          </svg>
        </div>
      </div>
      <h3 class="text-2xl font-display font-bold text-white">Get Early Access</h3>
      <p class="text-text-secondary mt-2">Join the waitlist or enter your referral code</p>
    </div>
    
    {#if !waitlistSubmitted}
    <!-- Waitlist Form -->
    <div class="mb-6">
      <label for="waitlist-email" class="block text-sm font-medium text-text-secondary mb-2">Email Address</label>
      <div class="flex gap-2">
        <input
          id="waitlist-email"
          type="email"
          bind:value={email}
          placeholder="you@example.com"
          class="flex-1 px-4 py-3 rounded-lg bg-bg-secondary border border-white/10 text-white placeholder-text-secondary focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/30 outline-none transition-all"
        />
        <button type="button" onclick={submitWaitlist} disabled={isSubmitting} class="btn-primary px-5 py-3 disabled:opacity-50">
          {isSubmitting ? '...' : 'Join'}
        </button>
      </div>
      {#if waitlistError}
        <p class="text-accent-error text-sm mt-2">{waitlistError}</p>
      {/if}
    </div>
    {:else}
    <div class="mb-6 p-4 rounded-lg bg-success/10 border border-success/30 text-center">
      <svg class="w-8 h-8 text-success mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
      </svg>
      <p class="text-success font-semibold">You're on the list!</p>
      <p class="text-text-secondary text-sm mt-1">Check your email for confirmation.</p>
    </div>
    {/if}
    
    <!-- Divider -->
    <div class="flex items-center gap-4 mb-6">
      <div class="flex-1 h-px bg-white/10"></div>
      <span class="text-text-secondary text-sm">or</span>
      <div class="flex-1 h-px bg-white/10"></div>
    </div>
    
    <!-- Referral Code -->
    {#if !showReferralInput}
    <button type="button" onclick={() => showReferralInput = true} class="w-full py-3 rounded-lg border border-accent-secondary/30 text-accent-secondary hover:bg-accent-secondary/10 transition-all">
      I have a referral code
    </button>
    {:else}
    <div>
      <label for="referral-code" class="block text-sm font-medium text-text-secondary mb-2">Referral Code</label>
      <div class="flex gap-2">
        <input
          id="referral-code"
          type="text"
          bind:value={referralCode}
          placeholder="ENTER CODE"
          class="flex-1 px-4 py-3 rounded-lg bg-bg-secondary border border-white/10 text-white placeholder-text-secondary focus:border-accent-secondary focus:ring-2 focus:ring-accent-secondary/30 outline-none transition-all uppercase tracking-wider text-center font-mono"
        />
        <button type="button" onclick={validateReferralCode} class="px-5 py-3 rounded-lg bg-accent-secondary/20 text-accent-secondary border border-accent-secondary/30 hover:bg-accent-secondary/30 transition-all font-semibold">
          Access
        </button>
      </div>
      {#if referralError}
        <p class="text-accent-error text-sm mt-2">{referralError}</p>
      {/if}
      <button type="button" onclick={() => { showReferralInput = false; referralError = ''; }} class="text-text-secondary hover:text-white text-sm mt-3">
        ← Back to waitlist
      </button>
    </div>
    {/if}
  </div>
</div>
{/if}
