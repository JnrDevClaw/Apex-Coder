<!--
  Resource Icon Component
  Displays appropriate icons for different resource types
  Requirements: 5.1, 5.4
-->
<script>
  export let type;
  export let size = 'md'; // 'sm', 'md', 'lg'
  
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };
  
  const containerSizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12'
  };
  
  function getIconColor(type) {
    const colors = {
      repository: 'text-accent-primary',
      deployment: 'text-accent-success',
      s3: 'text-blue-400',
      database: 'text-purple-400',
      lambda: 'text-orange-400',
      api: 'text-green-400'
    };
    return colors[type] || 'text-accent-primary';
  }
  
  function getBackgroundColor(type) {
    const colors = {
      repository: 'bg-accent-primary/10',
      deployment: 'bg-accent-success/10',
      s3: 'bg-blue-400/10',
      database: 'bg-purple-400/10',
      lambda: 'bg-orange-400/10',
      api: 'bg-green-400/10'
    };
    return colors[type] || 'bg-accent-primary/10';
  }
</script>

<div class={`${containerSizes[size]} rounded ${getBackgroundColor(type)} flex items-center justify-center flex-shrink-0`}>
  {#if type === 'repository'}
    <svg class={`${sizeClasses[size]} ${getIconColor(type)}`} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  {:else if type === 'deployment'}
    <svg class={`${sizeClasses[size]} ${getIconColor(type)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"></path>
    </svg>
  {:else if type === 's3'}
    <svg class={`${sizeClasses[size]} ${getIconColor(type)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"></path>
    </svg>
  {:else if type === 'database'}
    <svg class={`${sizeClasses[size]} ${getIconColor(type)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"></path>
    </svg>
  {:else if type === 'lambda'}
    <svg class={`${sizeClasses[size]} ${getIconColor(type)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
    </svg>
  {:else if type === 'api'}
    <svg class={`${sizeClasses[size]} ${getIconColor(type)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
    </svg>
  {:else}
    <!-- Default/unknown resource type -->
    <svg class={`${sizeClasses[size]} ${getIconColor(type)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
    </svg>
  {/if}
</div>
