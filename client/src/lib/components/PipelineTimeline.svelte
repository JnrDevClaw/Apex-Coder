<script>
  import { pipelineStages } from '../stores/mockPipeline.js';
  import StatusBadge from './StatusBadge.svelte';
  import AgentPortrait from './AgentPortrait.svelte';
  
  export let currentStageIndex = -1;
  export let stageStatuses = {};
  export let stageDetails = {};
  export let onStageClick = null;
  
  // Map stages to AI models
  const stageAgentMap = {
    'initializing': 'system',
    'analyzing_requirements': 'huggingface',
    'generating_architecture': 'gpt',
    'creating_database_schema': 'deepseek',
    'planning_file_structure': 'gpt',
    'generating_code': 'gemini'
  };
  
  function getStageStatus(stage, index) {
    if (stageStatuses[stage.id]) {
      return stageStatuses[stage.id];
    }
    if (index < currentStageIndex) return 'done';
    if (index === currentStageIndex) return 'running';
    return 'pending';
  }
  
  function isStageActive(index) {
    return index === currentStageIndex;
  }
  
  function isStageComplete(stage, index) {
    const status = getStageStatus(stage, index);
    return ['done', 'created', 'passed', 'pushed', 'deployed'].includes(status);
  }
  
  function isStageError(stage, index) {
    const status = getStageStatus(stage, index);
    return ['error', 'failed'].includes(status);
  }
  
  function handleStageClick(stage, index) {
    if (onStageClick && (isStageComplete(stage, index) || isStageActive(index))) {
      onStageClick(stage, index);
    }
  }
</script>

<div class="pipeline-timeline">
  <div class="timeline-container">
    {#each pipelineStages as stage, index}
      {@const status = getStageStatus(stage, index)}
      {@const isActive = isStageActive(index)}
      {@const isComplete = isStageComplete(stage, index)}
      {@const isError = isStageError(stage, index)}
      {@const details = stageDetails[stage.id]}
      
      <div 
        class="timeline-item"
        class:active={isActive}
        class:complete={isComplete}
        class:error={isError}
        class:clickable={onStageClick && (isComplete || isActive)}
        on:click={() => handleStageClick(stage, index)}
        on:keydown={(e) => e.key === 'Enter' && handleStageClick(stage, index)}
        role={onStageClick ? 'button' : 'listitem'}
        tabindex={onStageClick && (isComplete || isActive) ? 0 : -1}
      >
        <!-- Timeline connector line (before) -->
        {#if index > 0}
          <div 
            class="timeline-line timeline-line-before"
            class:complete={index <= currentStageIndex}
          ></div>
        {/if}
        
        <!-- Stage indicator -->
        <div class="timeline-indicator">
          <div class="indicator-outer">
            <div class="indicator-inner">
              {#if isComplete}
                <!-- Checkmark for completed stages -->
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                </svg>
              {:else if isError}
                <!-- X for error stages -->
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                </svg>
              {:else if isActive}
                <!-- Pulsing dot for active stage -->
                <div class="active-pulse"></div>
              {:else}
                <!-- Stage number for pending stages -->
                <span class="stage-number">{index + 1}</span>
              {/if}
            </div>
          </div>
        </div>
        
        <!-- Timeline connector line (after) -->
        {#if index < pipelineStages.length - 1}
          <div 
            class="timeline-line timeline-line-after"
            class:complete={index < currentStageIndex}
          ></div>
        {/if}
        
        <!-- Stage content -->
        <div class="timeline-content">
          <div class="stage-header">
            <div class="flex items-center gap-3 flex-1">
              <AgentPortrait 
                agent={stageAgentMap[stage.id] || 'system'} 
                size="sm" 
                showLabel={false}
                isActive={isActive}
              />
              <h3 class="stage-title">{stage.label}</h3>
            </div>
            <StatusBadge {status} />
          </div>
          
          <p class="stage-description">{stage.description}</p>
          
          <!-- Stage details for multi-item stages -->
          {#if details && (details.currentItem || details.progress)}
            <div class="stage-details">
              {#if details.currentItem}
                <div class="detail-item">
                  <span class="detail-icon">📄</span>
                  <span class="detail-text">{details.currentItem}</span>
                </div>
              {/if}
              
              {#if details.progress !== undefined}
                <div class="progress-bar-container">
                  <div class="progress-bar">
                    <div 
                      class="progress-fill"
                      style="width: {details.progress}%"
                    ></div>
                  </div>
                  <span class="progress-text">{details.progress}%</span>
                </div>
              {/if}
              
              {#if details.itemsProcessed}
                <div class="detail-item">
                  <span class="detail-icon">✓</span>
                  <span class="detail-text">{details.itemsProcessed} items processed</span>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .pipeline-timeline {
    width: 100%;
    max-width: 800px;
    margin: 0 auto;
  }
  
  .timeline-container {
    position: relative;
    padding: 1rem 0;
  }
  
  .timeline-item {
    position: relative;
    display: grid;
    grid-template-columns: 48px 1fr;
    gap: 1.5rem;
    padding: 1rem 0;
    transition: all 0.3s ease;
  }
  
  .timeline-item.clickable {
    cursor: pointer;
  }
  
  .timeline-item.clickable:hover .timeline-content {
    transform: translateX(4px);
  }
  
  .timeline-item.clickable:hover .indicator-outer {
    transform: scale(1.1);
  }
  
  /* Timeline lines */
  .timeline-line {
    position: absolute;
    left: 24px;
    width: 2px;
    background: rgba(255, 255, 255, 0.1);
    transition: background 0.3s ease;
  }
  
  .timeline-line.complete {
    background: var(--accent-success, #7BFFB2);
    box-shadow: 0 0 8px rgba(123, 255, 178, 0.3);
  }
  
  .timeline-line-before {
    top: 0;
    height: 1rem;
  }
  
  .timeline-line-after {
    bottom: 0;
    height: calc(100% - 1rem);
  }
  
  /* Stage indicator */
  .timeline-indicator {
    position: relative;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 0.25rem;
  }
  
  .indicator-outer {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    background: var(--bg-panel, #101218);
    border: 2px solid rgba(255, 255, 255, 0.1);
  }
  
  .timeline-item.complete .indicator-outer {
    background: var(--accent-success, #7BFFB2);
    border-color: var(--accent-success, #7BFFB2);
    box-shadow: 0 0 16px rgba(123, 255, 178, 0.4);
  }
  
  .timeline-item.active .indicator-outer {
    background: rgba(58, 184, 255, 0.2);
    border-color: var(--accent-primary, #3AB8FF);
    box-shadow: 0 0 20px rgba(58, 184, 255, 0.5);
    animation: pulseBorder 2s ease-in-out infinite;
  }
  
  .timeline-item.error .indicator-outer {
    background: rgba(255, 76, 136, 0.2);
    border-color: var(--accent-error, #FF4C88);
    box-shadow: 0 0 16px rgba(255, 76, 136, 0.4);
  }
  
  .indicator-inner {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }
  
  .timeline-item.complete .indicator-inner {
    color: black;
  }
  
  .timeline-item.active .indicator-inner {
    color: var(--accent-primary, #3AB8FF);
  }
  
  .timeline-item.error .indicator-inner {
    color: var(--accent-error, #FF4C88);
  }
  
  .stage-number {
    font-size: 1rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.4);
  }
  
  .active-pulse {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--accent-primary, #3AB8FF);
    animation: pulse 2s ease-in-out infinite;
  }
  
  /* Stage content */
  .timeline-content {
    padding: 0.5rem 0;
    transition: transform 0.3s ease;
  }
  
  .stage-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }
  
  .stage-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: white;
    margin: 0;
  }
  
  .timeline-item.active .stage-title {
    color: var(--accent-primary, #3AB8FF);
  }
  
  .stage-description {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.6);
    margin: 0 0 0.75rem 0;
    line-height: 1.5;
  }
  
  /* Stage details */
  .stage-details {
    margin-top: 0.75rem;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 0.5rem;
  }
  
  .detail-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 0.5rem;
  }
  
  .detail-item:last-child {
    margin-bottom: 0;
  }
  
  .detail-icon {
    font-size: 1rem;
  }
  
  .detail-text {
    flex: 1;
  }
  
  /* Progress bar */
  .progress-bar-container {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }
  
  .progress-bar {
    flex: 1;
    height: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    overflow: hidden;
  }
  
  .progress-fill {
    height: 100%;
    background: var(--accent-primary, #3AB8FF);
    border-radius: 3px;
    transition: width 0.5s ease;
    box-shadow: 0 0 8px rgba(58, 184, 255, 0.5);
  }
  
  .progress-text {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent-primary, #3AB8FF);
    min-width: 3rem;
    text-align: right;
  }
  
  /* Animations */
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.5;
      transform: scale(0.8);
    }
  }
  
  @keyframes pulseBorder {
    0%, 100% {
      box-shadow: 0 0 20px rgba(58, 184, 255, 0.5);
    }
    50% {
      box-shadow: 0 0 30px rgba(58, 184, 255, 0.8);
    }
  }
  
  /* Responsive */
  @media (max-width: 640px) {
    .timeline-item {
      grid-template-columns: 40px 1fr;
      gap: 1rem;
    }
    
    .indicator-outer {
      width: 40px;
      height: 40px;
    }
    
    .timeline-line {
      left: 20px;
    }
    
    .stage-title {
      font-size: 1rem;
    }
    
    .stage-description {
      font-size: 0.8125rem;
    }
  }
</style>
