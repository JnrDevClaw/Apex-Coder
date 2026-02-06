<script>
  import {
    PageLayout,
    CyberPanel,
    StatusBadge,
    PipelineStageCard,
    TerminalLog,
    AgentPortrait,
    ButtonPrimary,
    ButtonSecondary,
    ButtonDestructive,
    FormInput,
    LoadingSkeleton
  } from '$lib/components';
  
  let projectName = '';
  
  const sampleLogs = [
    { prefix: 'spec-worker', message: 'Using Llama 4 Scout 17B...', type: 'info' },
    { prefix: 'schema-worker', message: 'DeepSeek reasoning initialized...', type: 'info' },
    { prefix: 'docs-worker', message: 'Compiling context...', type: 'info' },
    { prefix: 'validator', message: 'Validation complete', type: 'success' },
    { prefix: 'coder', message: 'Generating files...', type: 'info' }
  ];
</script>

<svelte:head>
  <title>Cyber Theme Demo - AI App Builder</title>
</svelte:head>

<PageLayout maxWidth="max-w-7xl">
  <!-- Header -->
  <div class="text-center mb-12">
    <div class="w-20 h-1 bg-accent-primary mx-auto mb-8 rounded-full shadow-neon"></div>
    <h1 class="text-5xl font-display font-bold text-white mb-4">
      Cyber Theme <span class="text-accent-primary filter-neon">Component Demo</span>
    </h1>
    <p class="text-xl text-text-secondary font-body">
      All components from the neon/cyber-AI design system
    </p>
  </div>

  <!-- Status Badges -->
  <CyberPanel>
    <h2 class="text-2xl font-display font-semibold text-white mb-6">Status Badges</h2>
    <div class="flex flex-wrap gap-3">
      <StatusBadge status="creating" />
      <StatusBadge status="created" />
      <StatusBadge status="running" />
      <StatusBadge status="done" />
      <StatusBadge status="passed" />
      <StatusBadge status="error" />
      <StatusBadge status="failed" />
      <StatusBadge status="cancelled" />
      <StatusBadge status="pending" />
      <StatusBadge status="pushed" />
      <StatusBadge status="deployed" />
    </div>
  </CyberPanel>

  <!-- Pipeline Stage Cards -->
  <CyberPanel>
    <h2 class="text-2xl font-display font-semibold text-white mb-6">Pipeline Stage Cards</h2>
    <div class="space-y-4">
      <PipelineStageCard
        title="Specification Analysis"
        description="Analyzing requirements with AI clarifier..."
        status="creating"
      />
      <PipelineStageCard
        title="Schema Generation"
        description="DeepSeek-V3 generating database schema"
        status="running"
      />
      <PipelineStageCard
        title="Code Generation"
        description="Gemini-3 coding files..."
        status="done"
      />
      <PipelineStageCard
        title="Deployment"
        description="Waiting for previous stages..."
        status="pending"
      />
    </div>
  </CyberPanel>

  <!-- Agent Portraits -->
  <CyberPanel>
    <h2 class="text-2xl font-display font-semibold text-white mb-6">AI Agent Portraits</h2>
    <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      <AgentPortrait agent="llama" size="md" />
      <AgentPortrait agent="deepseek" size="md" />
      <AgentPortrait agent="gpt" size="md" />
      <AgentPortrait agent="claude" size="md" />
      <AgentPortrait agent="gemini" size="md" />
      <AgentPortrait agent="huggingface" size="md" />
    </div>
  </CyberPanel>

  <!-- Terminal Log -->
  <CyberPanel>
    <h2 class="text-2xl font-display font-semibold text-white mb-6">Terminal Log</h2>
    <TerminalLog logs={sampleLogs} height="h-64" />
  </CyberPanel>

  <!-- Buttons -->
  <CyberPanel>
    <h2 class="text-2xl font-display font-semibold text-white mb-6">Buttons</h2>
    <div class="flex flex-wrap gap-4">
      <ButtonPrimary on:click={() => alert('Primary clicked')}>
        Primary Action
      </ButtonPrimary>
      <ButtonSecondary on:click={() => alert('Secondary clicked')}>
        Secondary Action
      </ButtonSecondary>
      <ButtonDestructive on:click={() => alert('Destructive clicked')}>
        Cancel Build
      </ButtonDestructive>
      <ButtonPrimary disabled={true}>
        Disabled Button
      </ButtonPrimary>
    </div>
  </CyberPanel>

  <!-- Form Inputs -->
  <CyberPanel>
    <h2 class="text-2xl font-display font-semibold text-white mb-6">Form Inputs</h2>
    <div class="space-y-4 max-w-md">
      <FormInput
        bind:value={projectName}
        label="Project Name"
        placeholder="Enter your project name"
        required={true}
        id="project-name"
      />
      <FormInput
        value=""
        label="Optional Field"
        placeholder="This is optional"
        id="optional-field"
      />
      <FormInput
        value=""
        label="Disabled Field"
        placeholder="Cannot edit"
        disabled={true}
        id="disabled-field"
      />
    </div>
  </CyberPanel>

  <!-- Loading Skeletons -->
  <CyberPanel>
    <h2 class="text-2xl font-display font-semibold text-white mb-6">Loading Skeletons</h2>
    <div class="space-y-4">
      <LoadingSkeleton height="h-4" width="w-full" />
      <LoadingSkeleton height="h-8" width="w-3/4" />
      <LoadingSkeleton height="h-12" width="w-1/2" />
      <div class="grid grid-cols-3 gap-4">
        <LoadingSkeleton height="h-24" width="w-full" />
        <LoadingSkeleton height="h-24" width="w-full" />
        <LoadingSkeleton height="h-24" width="w-full" />
      </div>
    </div>
  </CyberPanel>

  <!-- Color Palette -->
  <CyberPanel>
    <h2 class="text-2xl font-display font-semibold text-white mb-6">Color Palette</h2>
    <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="space-y-2">
        <div class="h-20 bg-bg-primary rounded-lg border border-white/10"></div>
        <p class="text-sm text-text-secondary font-code">bg-primary</p>
      </div>
      <div class="space-y-2">
        <div class="h-20 bg-bg-secondary rounded-lg border border-white/10"></div>
        <p class="text-sm text-text-secondary font-code">bg-secondary</p>
      </div>
      <div class="space-y-2">
        <div class="h-20 bg-panel rounded-lg border border-white/10"></div>
        <p class="text-sm text-text-secondary font-code">bg-panel</p>
      </div>
      <div class="space-y-2">
        <div class="h-20 bg-accent-primary rounded-lg shadow-neon"></div>
        <p class="text-sm text-text-secondary font-code">accent-primary</p>
      </div>
      <div class="space-y-2">
        <div class="h-20 bg-accent-secondary rounded-lg"></div>
        <p class="text-sm text-text-secondary font-code">accent-secondary</p>
      </div>
      <div class="space-y-2">
        <div class="h-20 bg-accent-success rounded-lg"></div>
        <p class="text-sm text-text-secondary font-code">accent-success</p>
      </div>
      <div class="space-y-2">
        <div class="h-20 bg-accent-error rounded-lg"></div>
        <p class="text-sm text-text-secondary font-code">accent-error</p>
      </div>
    </div>
  </CyberPanel>

  <!-- Typography -->
  <CyberPanel>
    <h2 class="text-2xl font-display font-semibold text-white mb-6">Typography</h2>
    <div class="space-y-4">
      <div>
        <p class="text-sm text-text-secondary mb-2">Display Font (Inter Tight / Sora)</p>
        <h1 class="text-4xl font-display font-bold text-white">The quick brown fox</h1>
      </div>
      <div>
        <p class="text-sm text-text-secondary mb-2">Body Font (Inter / Geist)</p>
        <p class="text-lg font-body text-white">The quick brown fox jumps over the lazy dog</p>
      </div>
      <div>
        <p class="text-sm text-text-secondary mb-2">Code Font (JetBrains Mono / Fira Code)</p>
        <code class="text-lg font-code text-accent-primary">const hello = "world";</code>
      </div>
    </div>
  </CyberPanel>

  <!-- Back to Home -->
  <div class="text-center">
    <a href="/" class="inline-block">
      <ButtonSecondary>
        ← Back to Home
      </ButtonSecondary>
    </a>
  </div>
</PageLayout>
