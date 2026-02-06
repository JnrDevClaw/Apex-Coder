<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  
  const dispatch = createEventDispatcher();
  
  export let notification;
  
  let progressBar = null;
  let progressWidth = 100;
  
  onMount(() => {
    // Animate progress bar for auto-dismissing notifications
    if (!notification.persistent && notification.duration > 0) {
      const startTime = Date.now();
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, notification.duration - elapsed);
        progressWidth = (remaining / notification.duration) * 100;
        
        if (remaining > 0) {
          requestAnimationFrame(animate);
        }
      };
      requestAnimationFrame(animate);
    }
  });
  
  function handleDismiss() {
    dispatch('dismiss', notification.id);
  }
  
  function handleAction(action) {
    if (action.action) {
      action.action();
    }
    // Auto-dismiss after action unless it's a persistent notification
    if (!notification.persistent) {
      handleDismiss();
    }
  }
  
  function getTypeStyles(type) {
    switch (type) {
      case 'success':
        return {
          container: 'bg-accent-success/10 border-accent-success/20',
          icon: 'text-accent-success',
          title: 'text-accent-success',
          text: 'text-white'
        };
      case 'error':
        return {
          container: 'bg-accent-error/10 border-accent-error/20',
          icon: 'text-accent-error',
          title: 'text-accent-error',
          text: 'text-white'
        };
      case 'warning':
        return {
          container: 'bg-yellow-500/10 border-yellow-500/20',
          icon: 'text-yellow-500',
          title: 'text-yellow-500',
          text: 'text-white'
        };
      default: // info
        return {
          container: 'bg-accent-primary/10 border-accent-primary/20',
          icon: 'text-accent-primary',
          title: 'text-accent-primary',
          text: 'text-white'
        };
    }
  }
  
  function getTypeIcon(type) {
    switch (type) {
      case 'success':
        return 'M5 13l4 4L19 7';
      case 'error':
        return 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
      case 'warning':
        return 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z';
      default: // info
        return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
    }
  }
  
  $: styles = getTypeStyles(notification.type);
  $: iconPath = getTypeIcon(notification.type);
</script>

<div
  class={`notification-toast rounded-lg border p-4 shadow-lg backdrop-blur-sm ${styles.container}`}
  transition:fly={{ x: 300, duration: 300 }}
>
  <div class="flex items-start gap-3">
    <!-- Icon -->
    <div class="flex-shrink-0">
      <svg class={`w-5 h-5 ${styles.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={iconPath}></path>
      </svg>
    </div>
    
    <!-- Content -->
    <div class="flex-1 min-w-0">
      {#if notification.title}
        <h4 class={`text-sm font-semibold mb-1 ${styles.title}`}>{notification.title}</h4>
      {/if}
      
      <p class={`text-sm ${styles.text}`}>{notification.message}</p>
      
      <!-- Actions -->
      {#if notification.actions && notification.actions.length > 0}
        <div class="flex gap-2 mt-3">
          {#each notification.actions as action}
            <button
              type="button"
              on:click={() => handleAction(action)}
              class={`
                px-3 py-1 text-xs font-semibold rounded transition-all
                ${action.variant === 'primary' ? 'bg-accent-primary text-black hover:bg-accent-primary/80' : ''}
                ${action.variant === 'destructive' ? 'bg-accent-error/20 text-accent-error border border-accent-error/30 hover:bg-accent-error/30' : ''}
                ${action.variant === 'secondary' || !action.variant ? 'bg-white/10 text-white/80 hover:bg-white/20' : ''}
              `}
            >
              {action.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
    
    <!-- Dismiss Button -->
    <button
      type="button"
      on:click={handleDismiss}
      class="flex-shrink-0 text-white/40 hover:text-white/60 transition-colors p-1"
      aria-label="Dismiss notification"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
      </svg>
    </button>
  </div>
  
  <!-- Progress Bar -->
  {#if !notification.persistent && notification.duration > 0}
    <div class="mt-3 h-1 bg-white/10 rounded-full overflow-hidden">
      <div
        class={`h-full transition-all duration-100 ease-linear ${
          notification.type === 'success' ? 'bg-accent-success' :
          notification.type === 'error' ? 'bg-accent-error' :
          notification.type === 'warning' ? 'bg-yellow-500' :
          'bg-accent-primary'
        }`}
        style="width: {progressWidth}%"
      ></div>
    </div>
  {/if}
</div>

<style>
  .notification-toast {
    max-width: 400px;
    min-width: 300px;
  }
</style>
