<script>
  import HelpTooltip from './HelpTooltip.svelte';
  
  // Stage-specific help content
  const stageHelp = {
    'creating_specs': {
      title: 'Creating Specifications',
      content: 'Converting your questionnaire answers into a technical specification that guides the entire build process. This step is usually very quick (30-60 seconds).',
      expectedDuration: '30-60 seconds',
      aiModel: 'No AI (Direct conversion)'
    },
    'clarifier': {
      title: 'Conversational Clarifier',
      content: 'AI asks intelligent follow-up questions to fill any gaps in your requirements and ensure we have all the details needed for your application.',
      expectedDuration: '2-5 minutes',
      aiModel: 'HuggingFace (OpenHermes-2.5-Mistral-7B)'
    },
    'creating_docs': {
      title: 'Creating Documentation',
      content: 'Generating comprehensive project documentation including user stories, features, API specifications, and technical requirements.',
      expectedDuration: '3-8 minutes',
      aiModel: 'Llama 4 Scout 17B (GitHub Models)'
    },
    'creating_schema': {
      title: 'Creating Schema',
      content: 'Designing your database schema, data models, relationships, and validation rules based on your application requirements.',
      expectedDuration: '2-5 minutes',
      aiModel: 'DeepSeek-V3'
    },
    'creating_workspace': {
      title: 'Creating Workspace',
      content: 'Setting up the complete project folder structure, configuration files, and development environment setup.',
      expectedDuration: '1-2 minutes',
      aiModel: 'GPT-4o (Zukijourney)'
    },
    'creating_files': {
      title: 'Creating Files',
      content: 'Generating all the empty code files based on your project structure. This creates the skeleton of your application.',
      expectedDuration: '1-3 minutes',
      aiModel: 'No AI (Direct file creation)'
    },
    'coding_file': {
      title: 'Coding Files',
      content: 'The main coding phase where AI fills each file with actual implementation code. This is typically the longest stage.',
      expectedDuration: '10-30 minutes',
      aiModel: 'Gemini-3'
    },
    'creating_repo': {
      title: 'Creating Repository',
      content: 'Creating your GitHub repository, pushing all generated code, and setting up version control for your project.',
      expectedDuration: '2-5 minutes',
      aiModel: 'No AI (Automated process)'
    },
    'deploying': {
      title: 'Deploying Application',
      content: 'Deploying your application to AWS cloud services, setting up hosting, databases, and making your app live on the internet.',
      expectedDuration: '5-15 minutes',
      aiModel: 'No AI (Automated deployment)'
    }
  };
  
  // Status help content
  const statusHelp = {
    'pending': {
      title: 'Pending',
      content: 'This stage is waiting to start. It will begin automatically when the previous stage completes.',
      color: 'text-white/60'
    },
    'running': {
      title: 'Running',
      content: 'This stage is currently active and processing. You can expand it to see real-time logs and progress.',
      color: 'text-accent-primary'
    },
    'created': {
      title: 'Created',
      content: 'This stage has completed successfully. The output has been generated and saved.',
      color: 'text-accent-success'
    },
    'done': {
      title: 'Done',
      content: 'This stage has completed successfully. All tasks in this stage are finished.',
      color: 'text-accent-success'
    },
    'passed': {
      title: 'Passed',
      content: 'This stage completed successfully and passed all validation checks.',
      color: 'text-accent-success'
    },
    'deployed': {
      title: 'Deployed',
      content: 'Your application has been successfully deployed and is now live on the internet.',
      color: 'text-accent-success'
    },
    'failed': {
      title: 'Failed',
      content: 'This stage encountered an error and could not complete. You can retry the stage or try with an alternative AI model.',
      color: 'text-accent-error'
    },
    'error': {
      title: 'Error',
      content: 'An error occurred during this stage. Check the error details and consider retrying or reporting the issue.',
      color: 'text-accent-error'
    },
    'cancelled': {
      title: 'Cancelled',
      content: 'This build was cancelled by the user before completion.',
      color: 'text-white/60'
    }
  };
  
  // General help content
  const generalHelp = {
    buildProgress: {
      title: 'Build Progress',
      content: 'Shows the overall completion percentage of your build. This updates in real-time as stages complete.'
    },
    realTimeUpdates: {
      title: 'Real-Time Updates',
      content: 'Your build page automatically receives live updates via WebSocket connection. No need to refresh the page.'
    },
    stageExpansion: {
      title: 'Stage Details',
      content: 'Click on any stage to expand it and view detailed logs, progress information, and any error messages.'
    },
    retryOptions: {
      title: 'Retry Options',
      content: 'If a stage fails, you can retry just that stage, try with a different AI model, or restart the entire build.'
    },
    buildActions: {
      title: 'Build Actions',
      content: 'Available actions change based on build status: Cancel (during build), Retry (after failure), View Repository (after success).'
    }
  };
  
  export let helpType = 'stage'; // stage, status, general
  export let helpKey = '';
  export let position = 'top';
  export let size = 'medium';
  
  $: helpContent = getHelpContent(helpType, helpKey);
  
  function getHelpContent(type, key) {
    switch (type) {
      case 'stage':
        return stageHelp[key] || null;
      case 'status':
        return statusHelp[key] || null;
      case 'general':
        return generalHelp[key] || null;
      default:
        return null;
    }
  }
</script>

{#if helpContent}
  <HelpTooltip {position} {size} maxWidth="350px">
    <svelte:fragment slot="trigger">
      <slot name="trigger">
        <svg 
          class="w-4 h-4 text-white/40 hover:text-white/70 transition-colors cursor-help" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
          aria-label="Help information"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
      </slot>
    </svelte:fragment>
    
    <svelte:fragment slot="content">
      <div class="space-y-2">
        <div class="font-semibold text-white">{helpContent.title}</div>
        <div class="text-white/80 text-sm leading-relaxed">{helpContent.content}</div>
        
        {#if helpContent.expectedDuration}
          <div class="text-xs text-white/60 border-t border-white/10 pt-2 mt-2">
            <div><strong>Expected Duration:</strong> {helpContent.expectedDuration}</div>
            {#if helpContent.aiModel}
              <div><strong>AI Model:</strong> {helpContent.aiModel}</div>
            {/if}
          </div>
        {/if}
      </div>
    </svelte:fragment>
  </HelpTooltip>
{:else}
  <!-- Fallback if no help content found -->
  <HelpTooltip {position} {size}>
    <svelte:fragment slot="trigger">
      <slot name="trigger">
        <svg 
          class="w-4 h-4 text-white/40 hover:text-white/70 transition-colors cursor-help" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
          aria-label="Help information"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
      </slot>
    </svelte:fragment>
    
    <svelte:fragment slot="content">
      <div class="text-white/80 text-sm">
        Help information not available for this item.
      </div>
    </svelte:fragment>
  </HelpTooltip>
{/if}
