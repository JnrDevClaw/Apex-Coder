/**
 * Performance Optimization Utilities
 * Utilities for virtual scrolling, event batching, and lazy loading
 * Requirements: 6.1, 1.2
 */

/**
 * Virtual Scrolling Manager
 * Efficiently renders large lists by only rendering visible items
 */
export class VirtualScrollManager {
  constructor(options = {}) {
    this.itemHeight = options.itemHeight || 100;
    this.overscan = options.overscan || 3;
    this.containerHeight = options.containerHeight || 600;
  }

  /**
   * Calculate visible range of items
   */
  calculateVisibleRange(scrollTop, totalItems) {
    const startIndex = Math.max(0, Math.floor(scrollTop / this.itemHeight) - this.overscan);
    const visibleCount = Math.ceil(this.containerHeight / this.itemHeight);
    const endIndex = Math.min(totalItems, startIndex + visibleCount + this.overscan * 2);

    return {
      startIndex,
      endIndex,
      visibleCount,
      offsetY: startIndex * this.itemHeight
    };
  }

  /**
   * Get visible items from full list
   */
  getVisibleItems(items, scrollTop) {
    const { startIndex, endIndex, offsetY } = this.calculateVisibleRange(scrollTop, items.length);
    
    return {
      visibleItems: items.slice(startIndex, endIndex),
      startIndex,
      endIndex,
      offsetY,
      totalHeight: items.length * this.itemHeight
    };
  }

  /**
   * Update container height
   */
  setContainerHeight(height) {
    this.containerHeight = height;
  }

  /**
   * Update item height
   */
  setItemHeight(height) {
    this.itemHeight = height;
  }
}

/**
 * Event Batching Manager
 * Batches rapid events to prevent UI flooding
 */
export class EventBatcher {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 10;
    this.batchDelay = options.batchDelay || 100; // ms
    this.queue = [];
    this.timer = null;
    this.onFlush = options.onFlush || (() => {});
  }

  /**
   * Add event to batch queue
   */
  add(event) {
    this.queue.push(event);

    // Auto-flush if batch size reached
    if (this.queue.length >= this.batchSize) {
      this.flush();
    } else {
      // Schedule flush if not already scheduled
      if (!this.timer) {
        this.timer = setTimeout(() => this.flush(), this.batchDelay);
      }
    }
  }

  /**
   * Flush all queued events
   */
  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.queue.length > 0) {
      const events = [...this.queue];
      this.queue = [];
      this.onFlush(events);
    }
  }

  /**
   * Clear queue without flushing
   */
  clear() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.queue = [];
  }

  /**
   * Get current queue size
   */
  size() {
    return this.queue.length;
  }

  /**
   * Destroy batcher
   */
  destroy() {
    this.clear();
    this.onFlush = null;
  }
}

/**
 * Lazy Loading Manager
 * Manages lazy loading of pipeline details and logs
 */
export class LazyLoadManager {
  constructor() {
    this.loadedItems = new Set();
    this.loadingItems = new Set();
    this.observers = new Map();
  }

  /**
   * Check if item is loaded
   */
  isLoaded(itemId) {
    return this.loadedItems.has(itemId);
  }

  /**
   * Check if item is loading
   */
  isLoading(itemId) {
    return this.loadingItems.has(itemId);
  }

  /**
   * Mark item as loaded
   */
  markLoaded(itemId) {
    this.loadedItems.add(itemId);
    this.loadingItems.delete(itemId);
  }

  /**
   * Mark item as loading
   */
  markLoading(itemId) {
    this.loadingItems.add(itemId);
  }

  /**
   * Unload item (free memory)
   */
  unload(itemId) {
    this.loadedItems.delete(itemId);
    this.loadingItems.delete(itemId);
  }

  /**
   * Create intersection observer for lazy loading
   */
  createObserver(callback, options = {}) {
    const observerOptions = {
      root: options.root || null,
      rootMargin: options.rootMargin || '50px',
      threshold: options.threshold || 0.01
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          callback(entry.target);
        }
      });
    }, observerOptions);

    return observer;
  }

  /**
   * Observe element for lazy loading
   */
  observe(element, itemId, observer) {
    if (!this.observers.has(itemId)) {
      this.observers.set(itemId, observer);
      observer.observe(element);
    }
  }

  /**
   * Unobserve element
   */
  unobserve(element, itemId) {
    const observer = this.observers.get(itemId);
    if (observer) {
      observer.unobserve(element);
      this.observers.delete(itemId);
    }
  }

  /**
   * Clear all observers
   */
  clearObservers() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers.clear();
  }

  /**
   * Get loaded items count
   */
  getLoadedCount() {
    return this.loadedItems.size;
  }

  /**
   * Clear all loaded items
   */
  clear() {
    this.loadedItems.clear();
    this.loadingItems.clear();
    this.clearObservers();
  }
}

/**
 * Debounce function
 * Delays function execution until after wait time has elapsed
 */
export function debounce(func, wait = 300) {
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
 * Throttle function
 * Limits function execution to once per wait time
 */
export function throttle(func, wait = 300) {
  let inThrottle;
  let lastFunc;
  let lastRan;
  
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      lastRan = Date.now();
      inThrottle = true;
    } else {
      clearTimeout(lastFunc);
      lastFunc = setTimeout(() => {
        if (Date.now() - lastRan >= wait) {
          func(...args);
          lastRan = Date.now();
        }
      }, Math.max(wait - (Date.now() - lastRan), 0));
    }
  };
}

/**
 * Request Animation Frame throttle
 * Throttles function to run at most once per animation frame
 */
export function rafThrottle(func) {
  let rafId = null;
  
  return function executedFunction(...args) {
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        func(...args);
        rafId = null;
      });
    }
  };
}

/**
 * Memoize function results
 * Caches function results based on arguments
 */
export function memoize(func, keyGenerator = (...args) => JSON.stringify(args)) {
  const cache = new Map();
  
  return function memoized(...args) {
    const key = keyGenerator(...args);
    
    if (cache.has(key)) {
      return cache.get(key);
    }
    
    const result = func(...args);
    cache.set(key, result);
    
    return result;
  };
}

/**
 * Batch DOM updates using requestAnimationFrame
 */
export class DOMBatcher {
  constructor() {
    this.readQueue = [];
    this.writeQueue = [];
    this.scheduled = false;
  }

  /**
   * Schedule a DOM read operation
   */
  read(callback) {
    this.readQueue.push(callback);
    this.schedule();
  }

  /**
   * Schedule a DOM write operation
   */
  write(callback) {
    this.writeQueue.push(callback);
    this.schedule();
  }

  /**
   * Schedule batch execution
   */
  schedule() {
    if (!this.scheduled) {
      this.scheduled = true;
      requestAnimationFrame(() => this.flush());
    }
  }

  /**
   * Execute all queued operations
   */
  flush() {
    // Execute all reads first
    const reads = [...this.readQueue];
    this.readQueue = [];
    reads.forEach(callback => callback());

    // Then execute all writes
    const writes = [...this.writeQueue];
    this.writeQueue = [];
    writes.forEach(callback => callback());

    this.scheduled = false;
  }

  /**
   * Clear all queued operations
   */
  clear() {
    this.readQueue = [];
    this.writeQueue = [];
    this.scheduled = false;
  }
}

/**
 * Memory-efficient state updater
 * Prevents unnecessary re-renders by comparing values
 */
export function createStateUpdater(initialValue, compareFn = (a, b) => a === b) {
  let currentValue = initialValue;
  const subscribers = new Set();

  return {
    get: () => currentValue,
    
    set: (newValue) => {
      if (!compareFn(currentValue, newValue)) {
        currentValue = newValue;
        subscribers.forEach(callback => callback(currentValue));
      }
    },
    
    subscribe: (callback) => {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    
    update: (updater) => {
      const newValue = updater(currentValue);
      if (!compareFn(currentValue, newValue)) {
        currentValue = newValue;
        subscribers.forEach(callback => callback(currentValue));
      }
    }
  };
}

/**
 * Chunk array for batch processing
 */
export function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Process array in chunks with delay
 */
export async function processInChunks(array, processor, chunkSize = 10, delay = 0) {
  const chunks = chunkArray(array, chunkSize);
  const results = [];

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(chunk.map(processor));
    results.push(...chunkResults);

    if (delay > 0 && chunks.indexOf(chunk) < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return results;
}

/**
 * Create a resource pool for reusing objects
 */
export class ResourcePool {
  constructor(factory, maxSize = 100) {
    this.factory = factory;
    this.maxSize = maxSize;
    this.available = [];
    this.inUse = new Set();
  }

  /**
   * Acquire a resource from the pool
   */
  acquire() {
    let resource;
    
    if (this.available.length > 0) {
      resource = this.available.pop();
    } else {
      resource = this.factory();
    }
    
    this.inUse.add(resource);
    return resource;
  }

  /**
   * Release a resource back to the pool
   */
  release(resource) {
    if (this.inUse.has(resource)) {
      this.inUse.delete(resource);
      
      if (this.available.length < this.maxSize) {
        this.available.push(resource);
      }
    }
  }

  /**
   * Clear the pool
   */
  clear() {
    this.available = [];
    this.inUse.clear();
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      available: this.available.length,
      inUse: this.inUse.size,
      total: this.available.length + this.inUse.size
    };
  }
}
