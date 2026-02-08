<script>
  import { onMount, onDestroy } from 'svelte';
  import { 
    pipelineState, 
    pipelineStages, 
    currentStage, 
    isComplete, 
    hasError, 
    progress,
    githubConnection,
    awsConnection,
    connectToGitHub,
    connectToAWS,
    disconnectGitHub,
    disconnectAWS
  } from '../stores/mockPipeline.js';
  import PipelineTimeline from './PipelineTimeline.svelte';
  import PipelineErrorDisplay from './PipelineErrorDisplay.svelte';
  
  export const projectSpec = {};
  
  let errorExpanded = false;
  
  let showConnections = true;
  let showTimeline = true;
  let autoScroll = true;
  let logContainer;
  
  $: if (logContainer && autoScroll) {
    logContainer.scrollTop = logContainer.scrollHeight;
  }
  
  function getStageStatus(stageId) {
    return $pipelineState.stageStatuses[stageId] || 'pending';
  }
  
  function getStageDetails(stageId) {
    return $pipelineState.stageDetails[stageId] || {};
  }
  
  function getStatusColor(status) {
    switch (status) {
      case 'running': return 'text-accent-primary';
      case 'created':
      case 'done':
      case 'passed':
      case 'pushed':
      case 'deployed': return 'text-success';
      case 'error':
      case 'failed': return 'text-error';
      default: return 'text-text-secondary';
    }
  }
  
  function getStatusIcon(status) {
    switch (status) {
      case 'running': return '⏳';
      case 'created':
      case 'done':
      case 'passed':
      case 'pushed':
      case 'deployed': return '✅';
      case 'error':
      case 'failed': return '❌';
      default: return '⏸️';
    }
  }
  
  function formatDuration(startTime, endTime) {
    if (!startTime) return '';
    const end = endTime || new Date();
    const duration = Math.round((end - startTime) / 1000);
    return `${duration}s`;
  }
  
  async function handleGitHubConnect() {
    await connectToGitHub();
  }
  
  async function handleAWSConnect() {
    await connectToAWS();
  }
</script>

<div class="build-progress max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
  <!-- Header -->
  <div class="text-center mb-8">
    <div class="w-16 h-1 bg-accent-primary mx-auto mb-6 rounded-full shadow-neon"></div>
    <h1 class="text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-white mb-3">
      {#if $pipelineState.projectName}
        Building <span class="text-accent-primary">"{$pipelineState.projectName}"</span>
      {:else}
        <span class="text-accent-primary">Pipeline</span> Execution
      {/if}
    </h1>
    <p class="text-base sm:text-lg text-text-secondary font-body">
      Multi-agent orchestration in progress
    </p>
  </div>
  
  <!-- Progress Bar -->
  <div class="mb-8">
    <div class="flex justify-between text-sm text-text-secondary font-code mb-2">
      <span>Pipeline Progress</span>
      <span class="text-accent-primary">{$progress}%</span>
    </div>
    <div class="w-full bg-bg-secondary rounded-full h-2 border border-border-glow">
      <div 
        class="bg-accent-primary h-2 rounded-full transition-all duration-500 shadow-neon"
        style="width: {$progress}%"
      ></div>
    </div>
  </div>
  
  <!-- Connection Status -->
  {#if showConnections}
    <div class="grid sm:grid-cols-2 gap-4 mb-8">
      <!-- GitHub Connection -->
      <div class="cyber-panel p-4 neon-border">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div class="flex items-center">
            <svg class="w-6 h-6 text-text-primary mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            <div>
              <div class="font-display font-semibold text-white text-sm sm:text-base">GitHub</div>
              <div class="text-xs sm:text-sm text-text-secondary font-code truncate max-w-[150px]">
                {#if $githubConnection.isConnected}
                  {$githubConnection.username}
                {:else}
                  Not connected
                {/if}
              </div>
            </div>
          </div>
          
          {#if $githubConnection.isConnected}
            <div class="flex items-center gap-2">
              <span class="text-success text-xs sm:text-sm font-code whitespace-nowrap">✅ Active</span>
              <button
                type="button"
                on:click={disconnectGitHub}
                class="text-xs text-text-secondary hover:text-error font-code transition-colors"
              >
                Disconnect
              </button>
            </div>
          {:else}
            <button
              type="button"
              on:click={handleGitHubConnect}
              disabled={$githubConnection.isConnecting}
              class="btn-secondary text-xs sm:text-sm py-1 px-3 w-full sm:w-auto"
            >
              {$githubConnection.isConnecting ? 'Connecting...' : 'Connect'}
            </button>
          {/if}
        </div>
      </div>
      
      <!-- AWS Connection -->
      <div class="cyber-panel p-4 neon-border">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div class="flex items-center">
            <svg class="w-6 h-6 text-accent-secondary mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6.763 10.036c0-.296.032-.535.088-.71.064-.176.144-.368.256-.576.112-.208.24-.392.4-.576.151-.184.32-.344.504-.48.417-.304.918-.456 1.504-.456.586 0 1.096.152 1.504.456.184.136.353.296.504.48.16.184.288.368.4.576.112.208.192.4.256.576.056.175.088.414.088.71 0 .296-.032.535-.088.71-.064.176-.144.368-.256.576-.112.208-.24.392-.4.576-.151.184-.32.344-.504.48-.408.304-.918.456-1.504.456-.586 0-1.087-.152-1.504-.456-.184-.136-.353-.296-.504-.48-.16-.184-.288-.368-.4-.576-.112-.208-.192-.4-.256-.576-.056-.175-.088-.414-.088-.71zm8.48 0c0-.296.032-.535.088-.71.064-.176.144-.368.256-.576.112-.208.24-.392.4-.576.151-.184.32-.344.504-.48.408-.304.918-.456 1.504-.456.586 0 1.096.152 1.504.456.184.136.353.296.504.48.16.184.288.368.4.576.112.208.192.4.256.576.056.175.088.414.088.71 0 .296-.032.535-.088.71-.064.176-.144.368-.256.576-.112.208-.24.392-.4.576-.151.184-.32.344-.504.48-.408.304-.918.456-1.504.456-.586 0-1.096-.152-1.504-.456-.184-.136-.353-.296-.504-.48-.16-.184-.288-.368-.4-.576-.112-.208-.192-.4-.256-.576-.056-.175-.088-.414-.088-.71z"/>
            </svg>
            <div>
              <div class="font-display font-semibold text-white text-sm sm:text-base">AWS</div>
              <div class="text-xs sm:text-sm text-text-secondary font-code truncate max-w-[150px]">
                {#if $awsConnection.isConnected}
                  {$awsConnection.accountId}
                {:else}
                  Not connected
                {/if}
              </div>
            </div>
          </div>
          
          {#if $awsConnection.isConnected}
            <div class="flex items-center gap-2">
              <span class="text-success text-xs sm:text-sm font-code whitespace-nowrap">✅ Active</span>
              <button
                type="button"
                on:click={disconnectAWS}
                class="text-xs text-text-secondary hover:text-error font-code transition-colors"
              >
                Disconnect
              </button>
            </div>
          {:else}
            <button
              type="button"
              on:click={handleAWSConnect}
              disabled={$awsConnection.isConnecting}
              class="btn-secondary text-xs sm:text-sm py-1 px-3 w-full sm:w-auto"
            >
              {$awsConnection.isConnecting ? 'Connecting...' : 'Connect'}
            </button>
          {/if}
        </div>
      </div>
    </div>
  {/if}
  
  <!-- Pipeline Timeline View -->
  {#if showTimeline}
    <div class="mb-8">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-white font-display font-semibold flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-accent-primary animate-pulse-glow"></span>
          Pipeline Stages
        </h3>
        <button
          type="button"
          on:click={() => showTimeline = !showTimeline}
          class="text-xs text-text-secondary hover:text-accent-primary font-code transition-colors"
        >
          Hide Timeline
        </button>
      </div>
      
      <PipelineTimeline
        currentStageIndex={$pipelineState.currentStageIndex}
        stageStatuses={$pipelineState.stageStatuses}
        stageDetails={$pipelineState.stageDetails}
      />
    </div>
  {/if}
  
  <!-- Build Log -->
  <div class="build-log rounded-lg p-4">
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-white font-display font-semibold flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-success animate-pulse-glow"></span>
        Pipeline Log
      </h3>
      <div class="flex items-center space-x-3">
        <label class="flex items-center text-xs text-text-secondary font-code">
          <input
            type="checkbox"
            bind:checked={autoScroll}
            class="mr-1"
          />
          Auto-scroll
        </label>
        {#if !showTimeline}
          <button
            type="button"
            on:click={() => showTimeline = !showTimeline}
            class="text-xs text-text-secondary hover:text-accent-primary font-code transition-colors"
          >
            Show Timeline
          </button>
        {/if}
        <button
          type="button"
          on:click={() => showConnections = !showConnections}
          class="text-xs text-text-secondary hover:text-accent-primary font-code transition-colors"
        >
          {showConnections ? 'Hide' : 'Show'} Connections
        </button>
      </div>
    </div>
    
    <div 
      bind:this={logContainer}
      class="max-h-96 overflow-y-auto space-y-1 font-code text-sm"
    >
      {#each pipelineStages as stage, index}
        {@const status = getStageStatus(stage.id)}
        {@const details = getStageDetails(stage.id)}
        
        {#if index <= $pipelineState.currentStageIndex || status !== 'pending'}
          <div class="flex items-start space-x-2">
            <span class="text-text-secondary text-xs mt-0.5 opacity-50">
              {new Date().toLocaleTimeString()}
            </span>
            <span class={getStatusColor(status)}>
              {getStatusIcon(status)}
            </span>
            <span class={getStatusColor(status)}>
              {stage.label}
              {#if status === 'running'}
                <span class="dot-pulse">
                  <span>.</span><span>.</span><span>.</span>
                </span>
              {:else if status !== 'pending'}
                <span class="opacity-70">→ {status}</span>
              {/if}
            </span>
          </div>
          
          <!-- Show sub-items for multi-item stages -->
          {#if details.currentItem}
            <div class="flex items-start space-x-2 ml-8">
              <span class="text-text-secondary text-xs mt-0.5 opacity-50">
                {new Date().toLocaleTimeString()}
              </span>
              <span class="text-accent-primary">⏳</span>
              <span class="text-accent-primary">
                {details.currentItem} ({details.progress}%)
              </span>
            </div>
          {/if}
        {/if}
      {/each}
      
      <!-- Ongoing development status -->
      {#if $pipelineState.isRunning && $currentStage?.id === 'generating_code'}
        <div class="mt-4 pt-4 border-t border-border-glow">
          <div class="flex items-start space-x-2">
            <span class="text-text-secondary text-xs mt-0.5 opacity-50">
              {new Date().toLocaleTimeString()}
            </span>
            <span class="text-accent-primary">🔄</span>
            <span class="text-accent-primary">
              AI agents actively generating code...
            </span>
          </div>
          
          <div class="mt-4 cyber-panel p-3 border-accent-primary border-opacity-30">
            <div class="text-sm text-text-primary mb-2 font-display">Current Progress:</div>
            <div class="text-xs text-text-secondary space-y-1">
              <div>• Architecture designed and validated ✓</div>
              <div>• Database schema created ✓</div>
              <div>• File structure planned ✓</div>
              <div class="text-accent-primary">• AI models writing code...</div>
              <div class="opacity-50">• Next: Testing and deployment</div>
            </div>
          </div>
        </div>
      {/if}
      
      {#if $hasError}
        <div class="mt-4 pt-4 border-t border-error">
          <div class="flex items-start space-x-2">
            <span class="text-text-secondary text-xs mt-0.5 opacity-50">
              {new Date().toLocaleTimeString()}
            </span>
            <span class="text-error">❌</span>
            <span class="text-error">
              Build failed: {$pipelineState.error}
            </span>
          </div>
        </div>
      {/if}
    </div>
  </div>
  
  <!-- Error Display -->
  {#if $hasError}
    <div class="mt-8">
      <PipelineErrorDisplay
        error={{
          message: $pipelineState.error,
          type: 'pipeline',
          severity: 'error',
          stage: $currentStage?.label,
          suggestions: [
            'Check your API keys in server/.env',
            'Verify all required services are running',
            'Review the logs above for more details',
            'Try restarting the pipeline'
          ]
        }}
        expanded={errorExpanded}
        onRetry={() => {
          // Reset and restart pipeline
          window.location.reload();
        }}
        onReport={() => {
          // Open error reporting
          alert('Error reporting feature coming soon!');
        }}
      />
    </div>
  {/if}
  
  <!-- Action Buttons -->
  {#if $isComplete}
    <div class="mt-8 flex flex-col sm:flex-row justify-center gap-4">
      <a
        href={$pipelineState.appUrl}
        target="_blank"
        class="btn-primary flex-1 sm:flex-initial"
      >
        <span class="flex items-center justify-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
          </svg>
          View Live App
        </span>
      </a>
      <a
        href={$pipelineState.repoUrl}
        target="_blank"
        class="btn-secondary flex-1 sm:flex-initial"
      >
        <span class="flex items-center justify-center gap-2">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          View Repository
        </span>
      </a>
    </div>
  {/if}
</div>

<style>
  .build-progress {
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
