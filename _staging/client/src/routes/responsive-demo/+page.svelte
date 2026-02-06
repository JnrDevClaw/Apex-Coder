<script>
  import { viewport, isMobile, isTablet, isDesktop, breakpoint, deviceCapabilities } from '$lib/stores/responsive.js';
  import ResponsiveLayout from '$lib/components/ResponsiveLayout.svelte';
  import MobilePipelineCard from '$lib/components/MobilePipelineCard.svelte';
  import MobileStageCard from '$lib/components/MobileStageCard.svelte';
  import PullToRefresh from '$lib/components/PullToRefresh.svelte';
  import SwipeableCard from '$lib/components/SwipeableCard.svelte';
  import { showSuccess, showInfo, showError } from '$lib/stores/notifications.js';
  
  let pullToRefreshComponent;
  let refreshing = false;
  
  // Mock pipeline data
  const mockPipeline = {
    id: 'demo-pipeline-1',
    projectName: 'E-commerce Platform',
    userId: 'user_1',
    status: 'running',
    progress: 65,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    startedAt: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
    stages: [
      {
        id: 'creating_specs',
        status: 'created',
        label: 'Creating specs.json',
        description: 'Generate app specifications',
        supportsMultipleEvents: false
      },
      {
        id: 'creating_schema',
        status: 'running',
        label: 'Creating schema',
        description: 'Create schema definitions',
        supportsMultipleEvents: true,
        events: [
          {
            id: 'schema_1',
            message: 'Analyzing data requirements',
            status: 'done',
            timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
            details: 'Identified 5 main entities'
          },
          {
            id: 'schema_2',
            message: 'Generating database schema',
            status: 'running',
            timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            details: 'Creating tables and relationships'
          }
        ]
      }
    ],
    resources: [
      { type: 'repository', name: 'GitHub Repo', url: 'https://github.com/user/project' },
      { type: 'deployment', name: 'Live App', url: 'https://app.example.com' }
    ]
  };
  
  let expandedStages = new Set();
  
  async function handleRefresh() {
    refreshing = true;
    showInfo('Refreshing data...');
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    showSuccess('Data refreshed!');
    refreshing = false;
    
    if (pullToRefreshComponent) {
      pullToRefreshComponent.completeRefresh();
    }
  }
  
  function handleSwipeLeft() {
    showError('Swiped left - Delete action');
  }
  
  function handleSwipeRight() {
    showSuccess('Swiped right - Archive action');
  }
  
  function toggleStage(stageId) {
    if (expandedStages.has(stageId)) {
      expandedStages.delete(stageId);
    } else {
      expandedStages.add(stageId);
    }
    expandedStages = expandedStages;
  }
</script>

<svelte:head>
  <title>Responsive Design Demo - Pipeline Builder</title>
</svelte:head>

<ResponsiveLayout showMobileNav={true}>
  <PullToRefresh bind:this={pullToRefreshComponent} on:refresh={handleRefresh} enabled={$isMobile}>
    <div class="space-y-6">
      <!-- Header -->
      <div class="text-center">
        <h1 class="text-2xl sm:text-3xl lg:text-4xl font-display font-bold text-white mb-2">
          Responsive Design <span class="text-accent-primary">Demo</span>
        </h1>
        <p class="text-sm sm:text-base text-text-secondary">
          Testing mobile and tablet optimizations
        </p>
      </div>
      
      <!-- Device Info -->
      <div class="cyber-panel p-4 sm:p-6">
        <h2 class="text-lg font-display font-semibold text-white mb-4">Device Information</h2>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span class="text-text-secondary">Viewport:</span>
            <span class="text-white font-code ml-2">{$viewport.width}x{$viewport.height}</span>
          </div>
          <div>
            <span class="text-text-secondary">Breakpoint:</span>
            <span class="text-accent-primary font-code ml-2">{$breakpoint}</span>
          </div>
          <div>
            <span class="text-text-secondary">Device Type:</span>
            <span class="text-white ml-2">
              {#if $isMobile}Mobile{:else if $isTablet}Tablet{:else}Desktop{/if}
            </span>
          </div>
          <div>
            <span class="text-text-secondary">Touch:</span>
            <span class="text-white ml-2">
              {$deviceCapabilities.isTouchDevice ? 'Yes' : 'No'}
            </span>
          </div>
        </div>
      </div>
      
      <!-- Mobile Pipeline Card Demo -->
      <div class="space-y-4">
        <h2 class="text-lg font-display font-semibold text-white">Mobile Pipeline Card</h2>
        <MobilePipelineCard
          pipeline={mockPipeline}
          on:view={() => showInfo('View pipeline')}
          on:cancel={() => showInfo('Cancel pipeline')}
          on:retry={() => showInfo('Retry pipeline')}
        />
      </div>
      
      <!-- Mobile Stage Cards Demo -->
      <div class="space-y-4">
        <h2 class="text-lg font-display font-semibold text-white">Mobile Stage Cards</h2>
        {#each mockPipeline.stages as stage, index}
          <MobileStageCard
            {stage}
            {index}
            progress={stage.status === 'created' ? 100 : stage.status === 'running' ? 50 : 0}
            isExpanded={expandedStages.has(stage.id)}
            on:toggle={() => toggleStage(stage.id)}
            on:retry={() => showInfo(`Retry stage: ${stage.label}`)}
          />
        {/each}
      </div>
      
      <!-- Swipeable Card Demo -->
      {#if $isMobile}
        <div class="space-y-4">
          <h2 class="text-lg font-display font-semibold text-white">Swipeable Card</h2>
          <p class="text-sm text-text-secondary">Swipe left or right to see actions</p>
          
          <SwipeableCard
            on:swipeLeft={handleSwipeLeft}
            on:swipeRight={handleSwipeRight}
            leftActionLabel="Delete"
            rightActionLabel="Archive"
          >
            <div class="cyber-panel p-4">
              <h3 class="text-base font-semibold text-white mb-2">Swipe Me!</h3>
              <p class="text-sm text-text-secondary">
                Try swiping this card left or right to trigger actions
              </p>
            </div>
          </SwipeableCard>
        </div>
      {/if}
      
      <!-- Touch Interactions Demo -->
      <div class="space-y-4">
        <h2 class="text-lg font-display font-semibold text-white">Touch Interactions</h2>
        <div class="grid grid-cols-2 gap-3">
          <button
            type="button"
            class="btn-primary touch-manipulation active:scale-95"
            on:click={() => showSuccess('Primary button tapped')}
          >
            Primary
          </button>
          
          <button
            type="button"
            class="btn-secondary touch-manipulation active:scale-95"
            on:click={() => showInfo('Secondary button tapped')}
          >
            Secondary
          </button>
          
          <button
            type="button"
            class="btn-destructive touch-manipulation active:scale-95 col-span-2"
            on:click={() => showError('Destructive button tapped')}
          >
            Destructive Action
          </button>
        </div>
      </div>
      
      <!-- Responsive Grid Demo -->
      <div class="space-y-4">
        <h2 class="text-lg font-display font-semibold text-white">Responsive Grid</h2>
        <div class="responsive-grid">
          {#each Array(6) as _, i}
            <div class="cyber-panel p-4 touch-manipulation active:scale-95">
              <div class="text-accent-primary font-code text-sm mb-2">Card {i + 1}</div>
              <div class="text-xs text-text-secondary">
                Auto-adjusts columns based on screen size
              </div>
            </div>
          {/each}
        </div>
      </div>
      
      <!-- Pull to Refresh Instructions -->
      {#if $isMobile}
        <div class="cyber-panel p-4 bg-accent-primary/10 border-accent-primary/30">
          <div class="flex items-start gap-3">
            <svg class="w-5 h-5 text-accent-primary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <div>
              <h3 class="text-sm font-semibold text-white mb-1">Pull to Refresh</h3>
              <p class="text-xs text-text-secondary">
                Pull down from the top of the page to refresh the content
              </p>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </PullToRefresh>
</ResponsiveLayout>
