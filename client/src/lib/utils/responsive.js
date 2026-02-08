/**
 * Responsive Design Utilities
 * Provides utilities for responsive behavior, touch interactions, and device detection
 */

/**
 * Detect if device supports touch
 * @returns {boolean}
 */
export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0
  );
}

/**
 * Get current viewport breakpoint
 * @returns {'mobile' | 'tablet' | 'desktop'}
 */
export function getBreakpoint() {
  if (typeof window === 'undefined') return 'desktop';
  
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

/**
 * Check if viewport is mobile
 * @returns {boolean}
 */
export function isMobile() {
  return getBreakpoint() === 'mobile';
}

/**
 * Check if viewport is tablet
 * @returns {boolean}
 */
export function isTablet() {
  return getBreakpoint() === 'tablet';
}

/**
 * Check if viewport is desktop
 * @returns {boolean}
 */
export function isDesktop() {
  return getBreakpoint() === 'desktop';
}

/**
 * Create a responsive store that tracks viewport changes
 * @returns {import('svelte/store').Readable<{breakpoint: string, isMobile: boolean, isTablet: boolean, isDesktop: boolean, isTouchDevice: boolean}>}
 */
export function createResponsiveStore() {
  if (typeof window === 'undefined') {
    return {
      subscribe: (fn) => {
        fn({
          breakpoint: 'desktop',
          isMobile: false,
          isTablet: false,
          isDesktop: true,
          isTouchDevice: false,
        });
        return () => {};
      },
    };
  }

  const { subscribe } = {
    subscribe: (fn) => {
      const update = () => {
        const breakpoint = getBreakpoint();
        fn({
          breakpoint,
          isMobile: breakpoint === 'mobile',
          isTablet: breakpoint === 'tablet',
          isDesktop: breakpoint === 'desktop',
          isTouchDevice: isTouchDevice(),
        });
      };

      update();
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    },
  };

  return { subscribe };
}

/**
 * Debounce function for resize handlers
 * @param {Function} func
 * @param {number} wait
 * @returns {Function}
 */
export function debounce(func, wait = 150) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function for scroll/touch handlers
 * @param {Function} func
 * @param {number} limit
 * @returns {Function}
 */
export function throttle(func, limit = 100) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Handle swipe gestures
 * @param {HTMLElement} element
 * @param {Object} callbacks
 * @param {Function} callbacks.onSwipeLeft
 * @param {Function} callbacks.onSwipeRight
 * @param {Function} callbacks.onSwipeUp
 * @param {Function} callbacks.onSwipeDown
 * @param {number} threshold - Minimum distance for swipe (default: 50px)
 * @returns {Function} cleanup function
 */
export function handleSwipe(element, callbacks, threshold = 50) {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;

  const handleTouchStart = (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  };

  const handleTouchEnd = (e) => {
    touchEndX = e.changedTouches[0].screenX;
    touchEndY = e.changedTouches[0].screenY;
    handleGesture();
  };

  const handleGesture = () => {
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    // Horizontal swipe
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (Math.abs(deltaX) > threshold) {
        if (deltaX > 0 && callbacks.onSwipeRight) {
          callbacks.onSwipeRight();
        } else if (deltaX < 0 && callbacks.onSwipeLeft) {
          callbacks.onSwipeLeft();
        }
      }
    }
    // Vertical swipe
    else {
      if (Math.abs(deltaY) > threshold) {
        if (deltaY > 0 && callbacks.onSwipeDown) {
          callbacks.onSwipeDown();
        } else if (deltaY < 0 && callbacks.onSwipeUp) {
          callbacks.onSwipeUp();
        }
      }
    }
  };

  element.addEventListener('touchstart', handleTouchStart, { passive: true });
  element.addEventListener('touchend', handleTouchEnd, { passive: true });

  return () => {
    element.removeEventListener('touchstart', handleTouchStart);
    element.removeEventListener('touchend', handleTouchEnd);
  };
}

/**
 * Optimize performance for mobile browsers
 * @returns {Object} performance optimization utilities
 */
export function mobileOptimizations() {
  if (typeof window === 'undefined') return {};

  return {
    /**
     * Use requestAnimationFrame for smooth animations
     */
    smoothScroll: (element, target, duration = 300) => {
      const start = element.scrollTop;
      const change = target - start;
      const startTime = performance.now();

      const animateScroll = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeInOutQuad = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        element.scrollTop = start + change * easeInOutQuad;

        if (progress < 1) {
          requestAnimationFrame(animateScroll);
        }
      };

      requestAnimationFrame(animateScroll);
    },

    /**
     * Lazy load images
     */
    lazyLoadImages: (selector = 'img[data-src]') => {
      if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const img = entry.target;
              img.src = img.dataset.src;
              img.removeAttribute('data-src');
              imageObserver.unobserve(img);
            }
          });
        });

        document.querySelectorAll(selector).forEach((img) => {
          imageObserver.observe(img);
        });

        return () => imageObserver.disconnect();
      }
    },

    /**
     * Reduce motion for users who prefer it
     */
    prefersReducedMotion: () => {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    },

    /**
     * Check if device is in landscape mode
     */
    isLandscape: () => {
      return window.innerWidth > window.innerHeight;
    },
  };
}

/**
 * Get optimal column count based on viewport
 * @param {Object} config
 * @param {number} config.mobile - Columns for mobile (default: 1)
 * @param {number} config.tablet - Columns for tablet (default: 2)
 * @param {number} config.desktop - Columns for desktop (default: 3)
 * @returns {number}
 */
export function getResponsiveColumns(config = {}) {
  const { mobile = 1, tablet = 2, desktop = 3 } = config;
  const breakpoint = getBreakpoint();

  switch (breakpoint) {
    case 'mobile':
      return mobile;
    case 'tablet':
      return tablet;
    case 'desktop':
      return desktop;
    default:
      return desktop;
  }
}

/**
 * Create touch-friendly tap handler with visual feedback
 * @param {Function} callback
 * @param {number} delay - Delay before callback (default: 100ms)
 * @returns {Object} event handlers
 */
export function createTapHandler(callback, delay = 100) {
  let touchTimeout;

  return {
    onTouchStart: (e) => {
      e.currentTarget.classList.add('touch-active');
    },
    onTouchEnd: (e) => {
      e.currentTarget.classList.remove('touch-active');
      touchTimeout = setTimeout(() => {
        callback(e);
      }, delay);
    },
    onTouchCancel: (e) => {
      e.currentTarget.classList.remove('touch-active');
      clearTimeout(touchTimeout);
    },
  };
}
