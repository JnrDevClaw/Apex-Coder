<script>
  import { onMount, onDestroy } from 'svelte';
  import { formatRelativeTime, formatDuration, canRetryStage } from '../utils/pipeline.js';
  import { handlePipelineCancellation, handleStageRetry as handleStageRetryUtil, createPipelineError } from '../utils/errorHandling.js';
  import { showSuccess, showInfo } from '../stores/notifications.js';
  import { announceToScreenReader, getProgressAnnouncement } from '../utils/accessibility.js';
  import { announceProgress } from '../stores/accessibility.js';
  import { t } from '../utils/i18n.js';
  import StatusBadge from './StatusBadge.svelte';
  import StageRenderer from './StageRenderer.svelte';
  import TerminalLog from './TerminalLog.svelte';
  import ErrorDisplay from './ErrorDisplay.svelte';
  import CancelButton from './CancelButton.svelte';
  import RetryButton from './RetryButton.svelte';
  import ResourceManager from './ResourceManager.svelte';
  
  export let pipeline;
  export let onCancel = null;
  export let onRetry = null;
  export let onRetryStage = null;
  
  let expandedStages = new Set();
  let showLogs = false;
  let autoScroll = true;
  let refreshInterval;
  
  // Mock event logs for demonstration
  let eventLogs = [
    { timestamp: new Date().toISOString(), level: 'info', message: 'Pipeline started', stage: 'initializing' },
    { timestamp: new Date().toISOString(), level: 'info', message: 'Loading AI models...', stage: 'initializing' },
    { timestamp: new Date().toISOString(), level: 'success', message: 'AI models loaded successfully', stage: 'initializing' }
  ];
  
  onMount(() => {
    // Auto-refresh pipeline data every 2 seconds if running
    if (pipeline?.status === 'running') {
      refreshInterval = setInterval(() => {
        // In a real app, this would fetch updated pipeline data
        // For now, we'll just trigger reactivity
        pipeline = pipeline;
      }, 2000);
    }
  });
  
  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
  });
  
  function toggleStageExpansion(stageId) {
    if (expandedStages.has(stageId)) {
      expandedStages.delete(stageId);
    } else {
      expandedStages.add(stageId);
    }
    expandedStages = expandedStages; // Trigger reactivity
  }
  
  async function handleStageRetry(stage) {
    if (onRetryStage && canRetryStage(stage)) {
      const success = await handleStageRetryUtil(stage.id, onRetryStage);
      if (success) {
        showInfo(`Retrying stage: ${stage.label}`);
      }
    }
  }
  
  async function handlePipelineCancel() {
    if (onCancel && (pipeline.status === 'pending' || pipeline.status === 'running')) {
      const success = await handlePipelineCancellation(pipeline.id, onCancel);
      if (success) {
        showInfo('Pipeline cancellation requested');
      }
    }
  }
  
  async function handlePipelineRetry() {
    if (onRetry && pipeline.status === 'failed') {
      try {
        await onRetry(pipeline.id);
        showInfo('Pipeline retry initiated');
      } catch (error) {
        // Error handling is done in the utility function
      }
    }
  }
  
  function getStageProgress(stage) {
    // Calculate progress based on stage status and events
    if (stage.status === 'done' || stage.status === 'created' || stage.status === 'passed' || stage.status === 'deployed') {
      return 100;
    } else if (stage.status === 'running') {
      // If stage has events, calculate based on completed events
      if (stage.events && stage.events.length > 0) {
        const completedEvents = stage.events.filter(event => 
          event.status === 'done' || event.status === 'created' || event.status === 'passed'
        ).length;
        return Math.round((completedEvents / stage.events.length) * 100);
      }
      return 50; // Default for running stages without events
    } else if (stage.status === 'failed' || stage.status === 'error') {
      return 0;
    }
    return 0; // Pending stages
  }
  
  function getOverallProgress() {
    if (!pipeline.stages || pipeline.stages.length === 0) return 0;
    
    let totalWeight = 0;
    let completedWeight = 0;
    
    pipeline.stages.forEach(stage => {
      const weight = getStageWeight(stage.id);
      totalWeight += weight;
      
      const stageProgress = getStageProgress(stage);
      completedWeight += (weight * stageProgress) / 100;
    });
    
    return totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
  }
  
  function getStageWeight(stageId) {
    const weights = {
      'creating_specs': 5,
      'creating_docs': 5,
      'creating_schema': 8,
      'creating_workspace': 3,
      'creating_files': 15,
      'coding_file': 25,
      'running_tests': 15,
      'creating_repo': 5,
      'repo_created': 2,
      'pushing_files': 8,
      'deploying': 12,
      'deployment_complete': 2
    };
    return weights[stageId] || 5;
  }
  
  function getProgressBarColor(progress, status) {
    if (status === 'failed' || status === 'error') return 'bg-accent-error';
    if (status === 'done' || status === 'created' || status === 'passed' || status === 'deployed') return 'bg-accent-success';
    if (status === 'running') return 'bg-accent-primary';
    return 'bg-gray-600';
  }
  
  function getEstimatedTimeRemaining() {
    if (!pipeline.stages || pipeline.status !== 'running') return null;
    
    const runningStages = pipeline.stages.filter(stage => 
      stage.status === 'pending' || stage.status === 'running'
    ).length;
    
    if (runningStages === 0) return null;
    
    // Rough estimate: 2-5 minutes per remaining stage
    const avgMinutesPerStage = 3;
    const estimatedMinutes = runningStages * avgMinutesPerStage;
    
    return `~${estimatedMinutes} min remaining`;
  }
  
  $: overallProgress = getOverallProgress();
  $: estimatedTime = getEstimatedTimeRemaining();
  
  // Announce progress changes to screen readers
  let lastAnnouncedProgress = 0;
  $: if ($announceProgress && overallProgress !== lastAnnouncedProgress) {
    const announcement = getProgressAnnouncement(overallProgress, 'Pipeline');
    if (announcement) {
      announceToScreenReader(announcement, 'polite');
      lastAnnouncedProgress = overallProgress;
    }
  }
  
  // Announce pipeline completion
  $: if ($announceProgress && pipeline.status === 'completed') {
    announceToScreenReader('Pipeline completed successfully', 'assertive');
  } else if ($announceProgress && pipeline.status === 'failed') {
    announceToScreenReader('Pipeline failed with errors', 'assertive');
  }
</script>

<div class="pipeline-detail-view">
  <!-- Pipeline Header -->
  <div class="cyber-panel p-4 sm:p-6 mb-4 sm:mb-6">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div class="flex-1">
        <div class="flex items-center gap-4 mb-2">
          <h1 class="text-2xl lg:text-3xl font-display font-bold text-white">
            {pipeline.projectName}
          </h1>
          <StatusBadge status={pipeline.status} />
        </div>
        
        <div class="flex flex-wrap items-center gap-4 text-sm text-text-secondary">
          <span class="font-code">{pipeline.id}</span>
          <span>Created {formatRelativeTime(pipeline.createdAt)}</span>
          {#if pipeline.startedAt}
            <span>Duration: {formatDuration(pipeline.startedAt, pipeline.completedAt)}</span>
          {/if}
          {#if estimatedTime}
            <span class="text-accent-primary">{estimatedTime}</span>
          {/if}
        </div>
      </div>
      
      <!-- Pipeline Actions -->
      <div class="flex gap-2">
        <button
          type="button"
          on:click={() => showLogs = !showLogs}
          class="btn-secondary flex items-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
          {showLogs ? 'Hide' : 'Show'} Logs
        </button>
        
        {#if pipeline.status === 'pending' || pipeline.status === 'running'}
          <CancelButton
            text="Cancel Pipeline"
            confirmMessage="Are you sure you want to cancel this pipeline? All progress will be lost and this action cannot be undone."
            on:cancel={handlePipelineCancel}
          />
        {/if}
        
        {#if pipeline.status === 'failed'}
          <RetryButton
            text="Retry Pipeline"
            on:retry={handlePipelineRetry}
          />
        {/if}
      </div>
    </div>
    
    <!-- Overall Progress Bar -->
    <div class="mt-6">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-medium text-white">Overall Progress</span>
        <span class="text-sm font-code text-accent-primary">{overallProgress}%</span>
      </div>
      
      <div 
        class="w-full bg-bg-secondary rounded-full h-3 overflow-hidden"
        role="progressbar"
        aria-valuenow={overallProgress}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label="Pipeline overall progress"
      >
        <div 
          class={`h-full rounded-full transition-all duration-500 ${getProgressBarColor(overallProgress, pipeline.status)}`}
          style="width: {overallProgress}%"
        >
          {#if pipeline.status === 'running'}
            <div class="h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></div>
          {/if}
        </div>
      </div>
    </div>
    
    <!-- Error Display -->
    {#if pipeline.error}
      <div class="mt-4">
        <ErrorDisplay
          error={pipeline.error}
          title="Pipeline Error"
          showRetry={pipeline.status === 'failed'}
          showDetails={true}
          on:retry={handlePipelineRetry}
        />
      </div>
    {/if}
  </div>
  
  <!-- Pipeline Stages -->
  <div class="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
    <div class="flex items-center justify-between">
      <h2 class="text-lg sm:text-xl font-display font-semibold text-white">Pipeline Stages</h2>
      <div class="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-text-secondary">
        <span>{pipeline.stages?.filter(s => s.status === 'done' || s.status === 'created' || s.status === 'passed' || s.status === 'deployed').length || 0}</span>
        <span>/</span>
        <span>{pipeline.stages?.length || 0}</span>
        <span class="hidden sm:inline">completed</span>
      </div>
    </div>
    
    {#if pipeline.stages && pipeline.stages.length > 0}
      {#each pipeline.stages as stage, index (stage.id)}
        <StageRenderer
          {stage}
          {index}
          isExpanded={expandedStages.has(stage.id)}
          onToggleExpansion={() => toggleStageExpansion(stage.id)}
          onRetry={() => handleStageRetry(stage)}
          progress={getStageProgress(stage)}
        />
      {/each}
    {:else}
      <div class="cyber-panel p-8 text-center">
        <svg class="w-12 h-12 text-text-secondary mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
        </svg>
        <h3 class="text-lg font-display font-semibold text-white mb-2">No Stages Defined</h3>
        <p class="text-text-secondary">This pipeline doesn't have any stages configured yet.</p>
      </div>
    {/if}
  </div>
  
  <!-- Event Logs -->
  {#if showLogs}
    <div class="cyber-panel p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-display font-semibold text-white">Event Logs</h2>
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              bind:checked={autoScroll}
              class="rounded border-white/20 bg-bg-secondary text-accent-primary focus:ring-accent-primary focus:ring-offset-0"
            />
            Auto-scroll
          </label>
          <button
            type="button"
            on:click={() => eventLogs = []}
            class="btn-secondary text-sm px-3 py-1"
          >
            Clear
          </button>
        </div>
      </div>
      
      <TerminalLog logs={eventLogs} {autoScroll} />
    </div>
  {/if}
  
  <!-- Generated Resources -->
  {#if pipeline.resources && pipeline.resources.length > 0}
    <div class="mb-6">
      <h2 class="text-xl font-display font-semibold text-white mb-4">Generated Resources</h2>
      <ResourceManager
        resources={pipeline.resources}
        loading={false}
        autoValidate={true}
        showHealthStatus={true}
        showBulkActions={true}
        compact={false}
        on:validation-complete={(event) => {
          console.log('Resource validation completed:', event.detail);
        }}
        on:validate={(resource) => {
          console.log('Validating resource:', resource);
        }}
        on:copy={(resource) => {
          console.log('Copying resource:', resource);
        }}
      />
    </div>
  {/if}
</div>

<style>
  .pipeline-detail-view {
    animation: fadeIn 0.5s ease-in;
  }
  
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
