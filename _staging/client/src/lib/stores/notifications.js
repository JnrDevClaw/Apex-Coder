/**
 * Notification Store
 * Manages toast notifications and user feedback messages
 * Requirements: 3.1, 3.2, 3.4
 */

import { writable } from 'svelte/store';

// Notification store
export const notifications = writable([]);

let notificationId = 0;

/**
 * Add a notification
 */
export function addNotification(notification) {
  const id = ++notificationId;
  const newNotification = {
    id,
    type: 'info', // 'success', 'error', 'warning', 'info'
    title: '',
    message: '',
    duration: 5000, // Auto-dismiss after 5 seconds
    persistent: false, // Don't auto-dismiss
    actions: [], // Array of action buttons
    ...notification,
    timestamp: new Date().toISOString()
  };
  
  notifications.update(items => [...items, newNotification]);
  
  // Auto-dismiss if not persistent
  if (!newNotification.persistent && newNotification.duration > 0) {
    setTimeout(() => {
      dismissNotification(id);
    }, newNotification.duration);
  }
  
  return id;
}

/**
 * Dismiss a notification
 */
export function dismissNotification(id) {
  notifications.update(items => items.filter(item => item.id !== id));
}

/**
 * Clear all notifications
 */
export function clearNotifications() {
  notifications.set([]);
}

/**
 * Show success notification
 */
export function showSuccess(message, options = {}) {
  return addNotification({
    type: 'success',
    message,
    duration: 4000,
    ...options
  });
}

/**
 * Show error notification
 */
export function showError(message, options = {}) {
  return addNotification({
    type: 'error',
    message,
    duration: 8000, // Errors stay longer
    ...options
  });
}

/**
 * Show warning notification
 */
export function showWarning(message, options = {}) {
  return addNotification({
    type: 'warning',
    message,
    duration: 6000,
    ...options
  });
}

/**
 * Show info notification
 */
export function showInfo(message, options = {}) {
  return addNotification({
    type: 'info',
    message,
    duration: 5000,
    ...options
  });
}

/**
 * Show pipeline error with retry option
 */
export function showPipelineError(error, onRetry = null) {
  const actions = [];
  
  if (onRetry) {
    actions.push({
      label: 'Retry',
      action: onRetry,
      variant: 'primary'
    });
  }
  
  return addNotification({
    type: 'error',
    title: 'Pipeline Error',
    message: typeof error === 'string' ? error : error?.message || 'An error occurred in the pipeline',
    persistent: true, // Don't auto-dismiss errors
    actions
  });
}

/**
 * Show pipeline cancellation confirmation
 */
export function showCancellationConfirm(onConfirm, onCancel = null) {
  return addNotification({
    type: 'warning',
    title: 'Cancel Pipeline',
    message: 'Are you sure you want to cancel this pipeline? This action cannot be undone.',
    persistent: true,
    actions: [
      {
        label: 'Keep Running',
        action: onCancel || (() => {}),
        variant: 'secondary'
      },
      {
        label: 'Yes, Cancel',
        action: onConfirm,
        variant: 'destructive'
      }
    ]
  });
}

/**
 * Show stage retry notification
 */
export function showStageRetry(stageName, onRetry) {
  return addNotification({
    type: 'info',
    title: 'Retry Stage',
    message: `Do you want to retry the "${stageName}" stage?`,
    persistent: true,
    actions: [
      {
        label: 'Cancel',
        action: () => {},
        variant: 'secondary'
      },
      {
        label: 'Retry Stage',
        action: onRetry,
        variant: 'primary'
      }
    ]
  });
}

/**
 * Show connection status notifications
 */
export function showConnectionStatus(service, connected, error = null) {
  if (connected) {
    return showSuccess(`Successfully connected to ${service}`);
  } else {
    return showError(
      error || `Failed to connect to ${service}`,
      {
        title: 'Connection Failed',
        persistent: true
      }
    );
  }
}

/**
 * Show deployment status notifications
 */
export function showDeploymentStatus(status, details = {}) {
  switch (status) {
    case 'started':
      return showInfo('Deployment started', {
        title: 'Deploying Application'
      });
    case 'completed':
      return showSuccess('Application deployed successfully', {
        title: 'Deployment Complete',
        actions: details.url ? [{
          label: 'View App',
          action: () => window.open(details.url, '_blank'),
          variant: 'primary'
        }] : []
      });
    case 'failed':
      return showError(details.error || 'Deployment failed', {
        title: 'Deployment Failed',
        persistent: true
      });
    default:
      return showInfo(`Deployment ${status}`, {
        title: 'Deployment Update'
      });
  }
}

/**
 * Show resource creation notifications
 */
export function showResourceCreated(resourceType, resourceName, url = null) {
  const actions = [];
  
  if (url) {
    actions.push({
      label: 'Open',
      action: () => window.open(url, '_blank'),
      variant: 'primary'
    });
  }
  
  return showSuccess(`${resourceType} "${resourceName}" created successfully`, {
    title: 'Resource Created',
    actions
  });
}

/**
 * Show batch operation notifications
 */
export function showBatchOperation(operation, total, completed, failed = 0) {
  const message = `${operation}: ${completed}/${total} completed${failed > 0 ? `, ${failed} failed` : ''}`;
  
  if (completed === total && failed === 0) {
    return showSuccess(message, {
      title: 'Operation Complete'
    });
  } else if (failed > 0) {
    return showWarning(message, {
      title: 'Operation Partially Complete'
    });
  } else {
    return showInfo(message, {
      title: 'Operation In Progress'
    });
  }
}