<script>
  import { onMount } from 'svelte';
  import ErrorDisplay from '$lib/components/ErrorDisplay.svelte';
  import ErrorBoundary from '$lib/components/ErrorBoundary.svelte';
  import ErrorReporter from '$lib/components/ErrorReporter.svelte';
  import RetryButton from '$lib/components/RetryButton.svelte';
  import CancelButton from '$lib/components/CancelButton.svelte';
  import { 
    showSuccess, 
    showError, 
    showWarning, 
    showInfo,
    showPipelineError,
    showCancellationConfirm 
  } from '$lib/stores/notifications.js';
  import { 
    AppError, 
    ErrorTypes, 
    ErrorSeverity,
    createPipelineError,
    createStageError,
    createNetworkError,
    handleError
  } from '$lib/utils/errorHandling.js';
  
  let showErrorReporter = false;
  let testError = null;
  let retryCount = 0;
  
  // Sample errors for testing
  const sampleErrors = {
    simple: 'This is a simple error message',
    network: createNetworkError('Failed to connect to server', '/api/test', 500),
    pipeline: createPipelineError('Pipeline execution failed', 'coding_file', {
      code: 'PIPELINE_001',
      details: 'Failed to generate code for main.js'
    }),
    stage: createStageError('Stage validation failed', 'running_tests', {
      testResults: { passed: 5, failed: 3 },
      failedTests: ['auth.test.js', 'api.test.js', 'ui.test.js']
    }),
    complex: new AppError(
      'Complex error with full context',
      ErrorTypes.DEPLOYMENT,
      ErrorSeverity.CRITICAL,
      {
        code: 'DEPLOY_001',
        stack: 'Error: Complex error\n    at deployApp (deploy.js:42:15)\n    at Pipeline.run (pipeline.js:128:22)',
        context: {
          deploymentId: 'deploy-123',
          region: 'us-east-1',
          resources: ['lambda-func', 's3-bucket']
        }
      }
    )
  };
  
  function triggerNotification(type) {
    switch (type) {
      case 'success':
        showSuccess('Operation completed successfully!');
        break;
      case 'error':
        showError('Something went wrong. Please try again.');
        break;
      case 'warning':
        showWarning('This action may have unexpected consequences.');
        break;
      case 'info':
        showInfo('Here\'s some helpful information.');
        break;
      case 'pipeline-error':
        showPipelineError(sampleErrors.pipeline, () => {
          showInfo('Retrying pipeline...');
        });
        break;
      case 'cancellation':
        showCancellationConfirm(
          () => showInfo('Pipeline cancelled'),
          () => showInfo('Cancellation aborted')
        );
        break;
    }
  }
  
  function setTestError(errorKey) {
    testError = sampleErrors[errorKey];
  }
  
  function clearTestError() {
    testError = null;
  }
  
  async function simulateRetry() {
    retryCount++;
    
    // Simulate random success/failure
    const success = Math.random() > 0.3;
    
    if (success) {
      showSuccess(`Retry successful after ${retryCount} attempt(s)`);
      retryCount = 0;
    } else {
      throw new Error(`Retry failed (attempt ${retryCount})`);
    }
  }
  
  async function simulateCancel() {
    // Simulate cancellation delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    showInfo('Operation cancelled successfully');
  }
  
  function triggerErrorBoundary() {
    // This will be caught by the error boundary
    throw new Error('This error was thrown to test the error boundary');
  }
  
  function handleGlobalError() {
    // Test global error handling
    handleError(createNetworkError('Global error handling test', '/api/global-test'));
  }
</script>

<svelte:head>
  <title>Error Handling Demo - AI App Builder</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 max-w-6xl">
  <div class="mb-8">
    <h1 class="text-3xl font-display font-bold text-white mb-2">Error Handling Demo</h1>
    <p class="text-text-secondary">Test and demonstrate error handling components and notifications</p>
  </div>
  
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
    <!-- Notification Tests -->
    <div class="cyber-panel p-6">
      <h2 class="text-xl font-display font-semibold text-white mb-4">Notification Tests</h2>
      
      <div class="grid grid-cols-2 gap-3">
        <button
          type="button"
          on:click={() => triggerNotification('success')}
          class="btn-primary text-sm"
        >
          Success
        </button>
        
        <button
          type="button"
          on:click={() => triggerNotification('error')}
          class="btn-destructive text-sm"
        >
          Error
        </button>
        
        <button
          type="button"
          on:click={() => triggerNotification('warning')}
          class="btn-secondary text-sm"
        >
          Warning
        </button>
        
        <button
          type="button"
          on:click={() => triggerNotification('info')}
          class="btn-secondary text-sm"
        >
          Info
        </button>
        
        <button
          type="button"
          on:click={() => triggerNotification('pipeline-error')}
          class="btn-destructive text-sm col-span-2"
        >
          Pipeline Error with Retry
        </button>
        
        <button
          type="button"
          on:click={() => triggerNotification('cancellation')}
          class="btn-secondary text-sm col-span-2"
        >
          Cancellation Confirm
        </button>
      </div>
    </div>
    
    <!-- Error Display Tests -->
    <div class="cyber-panel p-6">
      <h2 class="text-xl font-display font-semibold text-white mb-4">Error Display Tests</h2>
      
      <div class="space-y-3 mb-4">
        <button
          type="button"
          on:click={() => setTestError('simple')}
          class="btn-secondary text-sm w-full"
        >
          Simple Error
        </button>
        
        <button
          type="button"
          on:click={() => setTestError('network')}
          class="btn-secondary text-sm w-full"
        >
          Network Error
        </button>
        
        <button
          type="button"
          on:click={() => setTestError('pipeline')}
          class="btn-secondary text-sm w-full"
        >
          Pipeline Error
        </button>
        
        <button
          type="button"
          on:click={() => setTestError('complex')}
          class="btn-secondary text-sm w-full"
        >
          Complex Error
        </button>
        
        <button
          type="button"
          on:click={clearTestError}
          class="btn-primary text-sm w-full"
        >
          Clear Error
        </button>
      </div>
      
      {#if testError}
        <ErrorDisplay
          error={testError}
          title="Test Error"
          showRetry={true}
          showDetails={true}
          on:retry={() => showInfo('Retry clicked')}
          on:dismiss={clearTestError}
        />
      {/if}
    </div>
    
    <!-- Button Tests -->
    <div class="cyber-panel p-6">
      <h2 class="text-xl font-display font-semibold text-white mb-4">Action Button Tests</h2>
      
      <div class="space-y-4">
        <div>
          <h3 class="text-sm font-semibold text-white mb-2">Retry Button</h3>
          <RetryButton
            text="Test Retry"
            {retryCount}
            maxRetries={3}
            on:retry={simulateRetry}
          />
        </div>
        
        <div>
          <h3 class="text-sm font-semibold text-white mb-2">Cancel Button</h3>
          <CancelButton
            text="Test Cancel"
            confirmMessage="Are you sure you want to cancel this test operation?"
            on:cancel={simulateCancel}
          />
        </div>
        
        <div>
          <h3 class="text-sm font-semibold text-white mb-2">Button Variants</h3>
          <div class="flex gap-2 flex-wrap">
            <RetryButton variant="primary" size="small" text="Primary" />
            <RetryButton variant="secondary" size="small" text="Secondary" />
            <CancelButton variant="destructive" size="small" text="Destructive" />
          </div>
        </div>
      </div>
    </div>
    
    <!-- Error Boundary Test -->
    <div class="cyber-panel p-6">
      <h2 class="text-xl font-display font-semibold text-white mb-4">Error Boundary Test</h2>
      
      <ErrorBoundary>
        <div class="space-y-4">
          <p class="text-text-secondary">This content is wrapped in an error boundary.</p>
          
          <button
            type="button"
            on:click={triggerErrorBoundary}
            class="btn-destructive"
          >
            Trigger Error Boundary
          </button>
          
          <button
            type="button"
            on:click={handleGlobalError}
            class="btn-secondary"
          >
            Test Global Error Handler
          </button>
        </div>
      </ErrorBoundary>
    </div>
    
    <!-- Error Reporter Test -->
    <div class="cyber-panel p-6 lg:col-span-2">
      <h2 class="text-xl font-display font-semibold text-white mb-4">Error Reporter Test</h2>
      
      <button
        type="button"
        on:click={() => showErrorReporter = true}
        class="btn-primary"
      >
        Open Error Reporter
      </button>
      
      <ErrorReporter
        bind:showForm={showErrorReporter}
        error={sampleErrors.complex}
        context={{ component: 'error-demo', action: 'test-report' }}
        on:submitted={() => showSuccess('Error report submitted successfully')}
        on:cancelled={() => showInfo('Error report cancelled')}
      />
    </div>
  </div>
</div>

<style>
  .btn-primary {
    background-color: #3AB8FF;
    color: black;
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-weight: 600;
    transition: all 0.3s;
  }
  
  .btn-primary:hover {
    background-color: rgba(58, 184, 255, 0.8);
  }
  
  .btn-secondary {
    background-color: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.8);
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-weight: 600;
    transition: all 0.3s;
  }
  
  .btn-secondary:hover {
    background-color: rgba(255, 255, 255, 0.2);
  }
  
  .btn-destructive {
    background-color: rgba(255, 76, 136, 0.2);
    color: #FF4C88;
    border: 1px solid rgba(255, 76, 136, 0.3);
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-weight: 600;
    transition: all 0.3s;
  }
  
  .btn-destructive:hover {
    background-color: rgba(255, 76, 136, 0.3);
  }
  
  .cyber-panel {
    background-color: #151820;
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 0.75rem;
    box-shadow: 0 0 6px rgba(58, 184, 255, 0.25);
    transition: all 0.3s;
  }
  
  .cyber-panel:hover {
    box-shadow: 0 0 12px rgba(58, 184, 255, 0.45);
  }
</style>
