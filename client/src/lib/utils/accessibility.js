/**
 * Accessibility Utilities
 * Provides keyboard navigation, ARIA support, and screen reader utilities
 */

/**
 * Keyboard navigation handler
 * @param {KeyboardEvent} event - The keyboard event
 * @param {Object} handlers - Map of key codes to handler functions
 */
export function handleKeyboardNavigation(event, handlers) {
  const handler = handlers[event.key] || handlers[event.code];
  if (handler) {
    event.preventDefault();
    handler(event);
  }
}

/**
 * Focus trap for modal dialogs
 * @param {HTMLElement} element - The container element
 * @returns {Function} Cleanup function
 */
export function createFocusTrap(element) {
  const focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  
  function handleTabKey(event) {
    if (event.key !== 'Tab') return;
    
    if (event.shiftKey) {
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }
  
  element.addEventListener('keydown', handleTabKey);
  
  // Focus first element
  if (firstElement) {
    firstElement.focus();
  }
  
  return () => {
    element.removeEventListener('keydown', handleTabKey);
  };
}

/**
 * Announce message to screen readers
 * @param {string} message - The message to announce
 * @param {string} priority - 'polite' or 'assertive'
 */
export function announceToScreenReader(message, priority = 'polite') {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;
  
  document.body.appendChild(announcement);
  
  // Remove after announcement
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

/**
 * Generate unique ID for ARIA relationships
 * @param {string} prefix - Prefix for the ID
 * @returns {string} Unique ID
 */
export function generateAriaId(prefix = 'aria') {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Skip to content link handler
 * @param {string} targetId - ID of the main content element
 */
export function skipToContent(targetId) {
  const target = document.getElementById(targetId);
  if (target) {
    target.setAttribute('tabindex', '-1');
    target.focus();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * Check if user prefers reduced motion
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Check if user prefers high contrast
 * @returns {boolean}
 */
export function prefersHighContrast() {
  return window.matchMedia('(prefers-contrast: high)').matches;
}

/**
 * Get accessible label for pipeline status
 * @param {string} status - Pipeline status
 * @returns {string} Accessible label
 */
export function getAccessibleStatusLabel(status) {
  const labels = {
    pending: 'Pending, waiting to start',
    running: 'Running, in progress',
    completed: 'Completed successfully',
    failed: 'Failed with errors',
    cancelled: 'Cancelled by user',
    created: 'Created successfully',
    done: 'Done',
    passed: 'Passed all checks',
    error: 'Error occurred',
    deployed: 'Deployed successfully',
    pushed: 'Pushed to repository'
  };
  return labels[status] || status;
}

/**
 * Get accessible progress announcement
 * @param {number} progress - Progress percentage
 * @param {string} context - Context for the progress
 * @returns {string} Accessible announcement
 */
export function getProgressAnnouncement(progress, context = 'Pipeline') {
  if (progress === 0) return `${context} starting`;
  if (progress === 100) return `${context} completed`;
  if (progress % 25 === 0) return `${context} ${progress}% complete`;
  return null; // Don't announce every percentage
}

/**
 * Create roving tabindex for list navigation
 * @param {HTMLElement} container - Container element
 * @param {string} itemSelector - Selector for list items
 * @returns {Function} Cleanup function
 */
export function createRovingTabindex(container, itemSelector) {
  const items = Array.from(container.querySelectorAll(itemSelector));
  let currentIndex = 0;
  
  function updateTabindex() {
    items.forEach((item, index) => {
      item.setAttribute('tabindex', index === currentIndex ? '0' : '-1');
    });
  }
  
  function handleKeyDown(event) {
    let newIndex = currentIndex;
    
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        newIndex = (currentIndex + 1) % items.length;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        newIndex = (currentIndex - 1 + items.length) % items.length;
        break;
      case 'Home':
        event.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        event.preventDefault();
        newIndex = items.length - 1;
        break;
      default:
        return;
    }
    
    currentIndex = newIndex;
    updateTabindex();
    items[currentIndex].focus();
  }
  
  updateTabindex();
  container.addEventListener('keydown', handleKeyDown);
  
  return () => {
    container.removeEventListener('keydown', handleKeyDown);
  };
}

/**
 * Keyboard shortcuts manager
 */
export class KeyboardShortcuts {
  constructor() {
    this.shortcuts = new Map();
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }
  
  register(key, handler, description = '') {
    this.shortcuts.set(key.toLowerCase(), { handler, description });
  }
  
  unregister(key) {
    this.shortcuts.delete(key.toLowerCase());
  }
  
  handleKeyDown(event) {
    const key = event.key.toLowerCase();
    const shortcut = this.shortcuts.get(key);
    
    if (shortcut && !event.target.matches('input, textarea, select')) {
      event.preventDefault();
      shortcut.handler(event);
    }
  }
  
  enable() {
    document.addEventListener('keydown', this.handleKeyDown);
  }
  
  disable() {
    document.removeEventListener('keydown', this.handleKeyDown);
  }
  
  getShortcuts() {
    return Array.from(this.shortcuts.entries()).map(([key, { description }]) => ({
      key,
      description
    }));
  }
}
