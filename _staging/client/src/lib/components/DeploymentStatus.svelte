<script>
  import StatusBadge from './StatusBadge.svelte';
  import ButtonPrimary from './ButtonPrimary.svelte';
  import ButtonSecondary from './ButtonSecondary.svelte';
  
  export let deployment = null;
  export let onRetry = null;
  
  $: deploymentType = deployment?.type || 'unknown';
  $: deploymentStatus = deployment?.status || 'pending';
  $: resources = deployment?.resources || {};
  
  function getDeploymentTypeLabel(type) {
    const labels = {
      's3-cloudfront': 'S3 + CloudFront',
      'ecs-fargate': 'ECS Fargate',
      'lambda-apigateway': 'Lambda + API Gateway',
      'unknown': 'Unknown'
    };
    return labels[type] || type;
  }
  
  function getDeploymentIcon(type) {
    const icons = {
      's3-cloudfront': '☁️',
      'ecs-fargate': '🐳',
      'lambda-apigateway': '⚡',
      'unknown': '📦'
    };
    return icons[type] || '📦';
  }
  
  function getStatusMessage(status) {
    const messages = {
      'pending': 'Deployment queued',
      'creating_infrastructure': 'Creating AWS infrastructure...',
      'deploying': 'Deploying application...',
      'deployed': 'Successfully deployed',
      'failed': 'Deployment failed',
      'cancelled': 'Deployment cancelled'
    };
    return messages[status] || status;
  }
</script>

<div class="deployment-status bg-panel border border-white/5 rounded-xl p-4 md:p-6">
  <!-- Header -->
  <div class="flex items-start justify-between mb-4">
    <div class="flex items-center gap-3">
      <span class="text-3xl">{getDeploymentIcon(deploymentType)}</span>
      <div>
        <h3 class="text-lg font-bold text-white">AWS Deployment</h3>
        <p class="text-sm text-white/60">{getDeploymentTypeLabel(deploymentType)}</p>
      </div>
    </div>
    <StatusBadge status={deploymentStatus} />
  </div>
  
  <!-- Status Message -->
  <div class="mb-4">
    <p class="text-white/80">{getStatusMessage(deploymentStatus)}</p>
  </div>
  
  <!-- Progress Indicator -->
  {#if deploymentStatus === 'creating_infrastructure' || deploymentStatus === 'deploying'}
    <div class="mb-4">
      <div class="w-full bg-white/5 rounded-full h-2">
        <div class="bg-accent-primary h-2 rounded-full animate-pulse" style="width: {deployment?.progress || 50}%"></div>
      </div>
    </div>
  {/if}
  
  <!-- Resources -->
  {#if Object.keys(resources).length > 0}
    <div class="space-y-3 mb-4">
      <h4 class="text-sm font-semibold text-white/80">Deployed Resources</h4>
      
      {#if resources.s3Bucket}
        <div class="flex items-center justify-between p-3 bg-white/5 rounded-lg">
          <div class="flex-1 min-w-0 mr-3">
            <p class="text-white font-medium text-sm">S3 Bucket</p>
            <p class="text-white/60 text-xs truncate">{resources.s3Bucket}</p>
          </div>
          {#if resources.s3BucketUrl}
            <a 
              href={resources.s3BucketUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              class="text-accent-primary hover:text-accent-primary/80 transition-colors flex-shrink-0"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
              </svg>
            </a>
          {/if}
        </div>
      {/if}
      
      {#if resources.cloudFrontDistribution}
        <div class="flex items-center justify-between p-3 bg-white/5 rounded-lg">
          <div class="flex-1 min-w-0 mr-3">
            <p class="text-white font-medium text-sm">CloudFront Distribution</p>
            <p class="text-white/60 text-xs truncate">{resources.cloudFrontDistribution}</p>
          </div>
          {#if resources.cloudFrontUrl}
            <a 
              href={resources.cloudFrontUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              class="text-accent-primary hover:text-accent-primary/80 transition-colors flex-shrink-0"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
              </svg>
            </a>
          {/if}
        </div>
      {/if}
      
      {#if resources.lambdaArn}
        <div class="flex items-center justify-between p-3 bg-white/5 rounded-lg">
          <div class="flex-1 min-w-0 mr-3">
            <p class="text-white font-medium text-sm">Lambda Function</p>
            <p class="text-white/60 text-xs truncate">{resources.lambdaArn}</p>
          </div>
        </div>
      {/if}
      
      {#if resources.apiGatewayUrl}
        <div class="flex items-center justify-between p-3 bg-white/5 rounded-lg">
          <div class="flex-1 min-w-0 mr-3">
            <p class="text-white font-medium text-sm">API Gateway</p>
            <p class="text-white/60 text-xs truncate">{resources.apiGatewayUrl}</p>
          </div>
          <a 
            href={resources.apiGatewayUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            class="text-accent-primary hover:text-accent-primary/80 transition-colors flex-shrink-0"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
            </svg>
          </a>
        </div>
      {/if}
      
      {#if resources.ecsCluster}
        <div class="flex items-center justify-between p-3 bg-white/5 rounded-lg">
          <div class="flex-1 min-w-0 mr-3">
            <p class="text-white font-medium text-sm">ECS Cluster</p>
            <p class="text-white/60 text-xs truncate">{resources.ecsCluster}</p>
          </div>
        </div>
      {/if}
      
      {#if resources.ecsService}
        <div class="flex items-center justify-between p-3 bg-white/5 rounded-lg">
          <div class="flex-1 min-w-0 mr-3">
            <p class="text-white font-medium text-sm">ECS Service</p>
            <p class="text-white/60 text-xs truncate">{resources.ecsService}</p>
          </div>
        </div>
      {/if}
      
      {#if resources.database}
        <div class="flex items-center justify-between p-3 bg-white/5 rounded-lg">
          <div class="flex-1 min-w-0 mr-3">
            <p class="text-white font-medium text-sm">Database</p>
            <p class="text-white/60 text-xs truncate">{resources.database}</p>
          </div>
        </div>
      {/if}
    </div>
  {/if}
  
  <!-- Live App URL -->
  {#if deployment?.appUrl && deploymentStatus === 'deployed'}
    <div class="mb-4 p-4 bg-success/10 border border-success/30 rounded-lg">
      <div class="flex items-center gap-2 mb-2">
        <svg class="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        <p class="text-success font-semibold">Application is live!</p>
      </div>
      <a 
        href={deployment.appUrl} 
        target="_blank" 
        rel="noopener noreferrer"
        class="text-accent-primary hover:text-accent-primary/80 text-sm break-all"
      >
        {deployment.appUrl}
      </a>
    </div>
  {/if}
  
  <!-- Error Details -->
  {#if deployment?.error && deploymentStatus === 'failed'}
    <div class="mb-4 p-4 bg-error/10 border border-error/30 rounded-lg">
      <div class="flex items-center gap-2 mb-2">
        <svg class="w-5 h-5 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <p class="text-error font-semibold">Deployment Error</p>
      </div>
      <p class="text-white/80 text-sm">{deployment.error}</p>
      
      {#if deployment.errorDetails}
        <details class="mt-2">
          <summary class="text-xs text-white/60 cursor-pointer hover:text-white/80">View Details</summary>
          <pre class="mt-2 text-xs text-white/60 bg-black/30 p-2 rounded overflow-x-auto">{JSON.stringify(deployment.errorDetails, null, 2)}</pre>
        </details>
      {/if}
    </div>
  {/if}
  
  <!-- Actions -->
  <div class="flex flex-col sm:flex-row gap-2">
    {#if deploymentStatus === 'deployed' && deployment?.appUrl}
      <ButtonPrimary on:click={() => window.open(deployment.appUrl, '_blank')}>
        <span class="flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
          </svg>
          View Live App
        </span>
      </ButtonPrimary>
    {/if}
    
    {#if deploymentStatus === 'failed' && onRetry}
      <ButtonSecondary on:click={onRetry}>
        <span class="flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
          </svg>
          Retry Deployment
        </span>
      </ButtonSecondary>
    {/if}
  </div>
  
  <!-- Troubleshooting Links -->
  {#if deploymentStatus === 'failed'}
    <div class="mt-4 pt-4 border-t border-white/10">
      <p class="text-sm text-white/60 mb-2">Troubleshooting:</p>
      <ul class="text-xs text-white/60 space-y-1">
        <li>• Check AWS credentials and permissions</li>
        <li>• Verify AWS service quotas and limits</li>
        <li>• Review CloudWatch logs for detailed errors</li>
        <li>• Ensure all required environment variables are set</li>
      </ul>
    </div>
  {/if}
</div>

<style>
  .deployment-status {
    animation: fadeIn 0.3s ease-in;
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
