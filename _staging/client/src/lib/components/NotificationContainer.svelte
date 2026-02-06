<script>
  import { notifications, dismissNotification } from '../stores/notifications.js';
  import NotificationToast from './NotificationToast.svelte';
  
  function handleDismiss(event) {
    dismissNotification(event.detail);
  }
</script>

<!-- Notification Container -->
<div class="notification-container fixed top-4 right-4 z-50 space-y-3 pointer-events-none">
  {#each $notifications as notification (notification.id)}
    <div class="pointer-events-auto">
      <NotificationToast {notification} on:dismiss={handleDismiss} />
    </div>
  {/each}
</div>

<style>
  .notification-container {
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
  }
  
  /* Hide scrollbar but keep functionality */
  .notification-container::-webkit-scrollbar {
    display: none;
  }
  
  .notification-container {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
</style>
