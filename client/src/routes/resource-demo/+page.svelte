<!--
  Resource Management Demo Page
  Demonstrates the resource management and display system
-->
<script>
  import { onMount } from 'svelte';
  import ResourceManager from '$lib/components/ResourceManager.svelte';
  import { showSuccess, showInfo } from '$lib/stores/notifications.js';
  
  // Mock resource data for demonstration
  let mockResources = [
    {
      type: 'repository',
      name: 'AI Chat Application',
      url: 'https://github.com/example/ai-chat-app',
      metadata: {
        owner: 'example',
        private: false,
        language: 'JavaScript',
        stars: 42,
        createdAt: '2024-01-15T10:30:00Z',
        lastCommit: '2024-01-20T14:22:00Z'
      }
    },
    {
      type: 'deployment',
      name: 'Production Deployment',
      url: 'https://ai-chat-app.vercel.app',
      metadata: {
        platform: 'Vercel',
        region: 'us-east-1',
        status: 'active',
        deployedAt: '2024-01-20T15:00:00Z',
        buildTime: '2m 34s'
      }
    },
    {
      type: 's3',
      name: 'Static Assets Bucket',
      url: 'https://ai-chat-assets.s3.amazonaws.com',
      metadata: {
        region: 'us-east-1',
        storageClass: 'STANDARD',
        encryption: 'AES256',
        size: '245 MB',
        objects: 1247
      }
    },
    {
      type: 'database',
      name: 'User Database',
      url: 'https://console.aws.amazon.com/rds/home?region=us-east-1#database:id=ai-chat-db',
      metadata: {
        engine: 'PostgreSQL',
        version: '14.9',
        instanceClass: 'db.t3.micro',
        storage: '20 GB',
        multiAZ: false
      }
    },
    {
      type: 'lambda',
      name: 'Message Processing Function',
      url: 'https://console.aws.amazon.com/lambda/home?region=us-east-1#/functions/ai-chat-processor',
      metadata: {
        runtime: 'nodejs18.x',
        memorySize: '512 MB',
        timeout: '30s',
        lastModified: '2024-01-20T12:15:00Z'
      }
    },
    {
      type: 'api',
      name: 'Chat API Gateway',
      url: 'https://api.ai-chat-app.com/v1',
      metadata: {
        version: 'v1',
        protocol: 'REST',
        authentication: 'JWT',
        rateLimit: '1000/hour',
        endpoints: 12
      }
    }
  ];
  
  let loading = false;
  
  function simulateLoading() {
    loading = true;
    showInfo('Loading resources...');
    
    setTimeout(() => {
      loading = false;
      showSuccess('Resources loaded successfully');
    }, 2000);
  }
  
  function addMockResource() {
    const newResource = {
      type: 'api',
      name: `Test API ${Date.now()}`,
      url: `https://test-api-${Date.now()}.example.com`,
      metadata: {
        version: 'v1',
        status: 'testing',
        createdAt: new Date().toISOString()
      }
    };
    
    mockResources = [...mockResources, newResource];
    showSuccess('Added new test resource');
  }
  
  function clearResources() {
    mockResources = [];
    showInfo('Cleared all resources');
  }
  
  function resetResources() {
    mockResources = [
      {
        type: 'repository',
        name: 'AI Chat Application',
        url: 'https://github.com/example/ai-chat-app',
        metadata: {
          owner: 'example',
          private: false,
          language: 'JavaScript',
          stars: 42,
          createdAt: '2024-01-15T10:30:00Z',
          lastCommit: '2024-01-20T14:22:00Z'
        }
      },
      {
        type: 'deployment',
        name: 'Production Deployment',
        url: 'https://ai-chat-app.vercel.app',
        metadata: {
          platform: 'Vercel',
          region: 'us-east-1',
          status: 'active',
          deployedAt: '2024-01-20T15:00:00Z',
          buildTime: '2m 34s'
        }
      },
      {
        type: 's3',
        name: 'Static Assets Bucket',
        url: 'https://ai-chat-assets.s3.amazonaws.com',
        metadata: {
          region: 'us-east-1',
          storageClass: 'STANDARD',
          encryption: 'AES256',
          size: '245 MB',
          objects: 1247
        }
      }
    ];
    showSuccess('Reset to default resources');
  }
</script>

<svelte:head>
  <title>Resource Management Demo - AI App Builder</title>
</svelte:head>

<div class="min-h-screen bg-bg-primary">
  <div class="mx-auto max-w-7xl py-12 px-5">
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-3xl lg:text-4xl font-display font-bold text-white mb-4">
        Resource Management System
      </h1>
      <p class="text-lg text-text-secondary max-w-3xl">
        Comprehensive resource management with validation, organization, and bulk operations. 
        This system handles generated resources from AI app builds including repositories, 
        deployments, databases, and APIs.
      </p>
    </div>
    
    <!-- Demo Controls -->
    <div class="cyber-panel p-6 mb-8">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 class="text-xl font-display font-semibold text-white mb-2">Demo Controls</h2>
          <p class="text-sm text-text-secondary">
            Test the resource management system with mock data and various scenarios.
          </p>
        </div>
        
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            on:click={simulateLoading}
            disabled={loading}
            class="btn-secondary"
          >
            {loading ? 'Loading...' : 'Simulate Loading'}
          </button>
          
          <button
            type="button"
            on:click={addMockResource}
            class="btn-secondary"
          >
            Add Resource
          </button>
          
          <button
            type="button"
            on:click={resetResources}
            class="btn-secondary"
          >
            Reset Demo
          </button>
          
          <button
            type="button"
            on:click={clearResources}
            class="btn-destructive"
          >
            Clear All
          </button>
        </div>
      </div>
    </div>
    
    <!-- Resource Manager -->
    <ResourceManager
      resources={mockResources}
      {loading}
      autoValidate={true}
      showHealthStatus={true}
      showBulkActions={true}
      compact={false}
      on:validation-complete={(event) => {
        console.log('Validation completed:', event.detail);
        const { results, healthStatus } = event.detail;
        showInfo(`Validation complete: ${healthStatus.accessible}/${healthStatus.total} resources accessible`);
      }}
      on:validate={(resource) => {
        console.log('Validating resource:', resource);
        showInfo(`Validating ${resource.name}...`);
      }}
      on:copy={(resource) => {
        console.log('Copying resource:', resource);
        showSuccess(`Copied ${resource.name} information`);
      }}
    />
    
    <!-- Feature Highlights -->
    <div class="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div class="cyber-panel p-6">
        <div class="w-12 h-12 rounded bg-accent-primary/10 flex items-center justify-center mb-4">
          <svg class="w-6 h-6 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <h3 class="text-lg font-display font-semibold text-white mb-2">URL Validation</h3>
        <p class="text-text-secondary text-sm">
          Automatic validation of resource URLs with type-specific checks for repositories, 
          deployments, S3 buckets, databases, and APIs.
        </p>
      </div>
      
      <div class="cyber-panel p-6">
        <div class="w-12 h-12 rounded bg-accent-success/10 flex items-center justify-center mb-4">
          <svg class="w-6 h-6 text-accent-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
          </svg>
        </div>
        <h3 class="text-lg font-display font-semibold text-white mb-2">Copy to Clipboard</h3>
        <p class="text-text-secondary text-sm">
          One-click copying of resource URLs, metadata, and formatted exports. 
          Supports multiple formats including text, JSON, and Markdown.
        </p>
      </div>
      
      <div class="cyber-panel p-6">
        <div class="w-12 h-12 rounded bg-purple-400/10 flex items-center justify-center mb-4">
          <svg class="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14-7H5m14 14H5"></path>
          </svg>
        </div>
        <h3 class="text-lg font-display font-semibold text-white mb-2">Smart Organization</h3>
        <p class="text-text-secondary text-sm">
          Automatic categorization by resource type with filtering, sorting, 
          and grouping options. Bulk operations for managing multiple resources.
        </p>
      </div>
    </div>
  </div>
</div>
