/**
 * Component Optimization Utilities
 * Utilities for optimizing Svelte component re-renders
 * Requirements: 6.1, 1.2
 */

/**
 * Create a shallow equality checker for objects
 */
export function shallowEqual(obj1, obj2) {
  if (obj1 === obj2) return true;
  
  if (!obj1 || !obj2) return false;
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    if (obj1[key] !== obj2[key]) return false;
  }
  
  return true;
}

/**
 * Create a deep equality checker for objects
 */
export function deepEqual(obj1, obj2) {
  if (obj1 === obj2) return true;
  
  if (!obj1 || !obj2) return false;
  
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
    return obj1 === obj2;
  }
  
  if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    if (!deepEqual(obj1[key], obj2[key])) return false;
  }
  
  return true;
}

/**
 * Create a memoized component prop
 * Only updates when the value actually changes
 */
export function createMemoizedProp(initialValue, compareFn = shallowEqual) {
  let currentValue = initialValue;
  
  return {
    get: () => currentValue,
    set: (newValue) => {
      if (!compareFn(currentValue, newValue)) {
        currentValue = newValue;
        return true; // Value changed
      }
      return false; // Value unchanged
    }
  };
}

/**
 * Optimize array updates by checking if content actually changed
 */
export function shouldUpdateArray(oldArray, newArray, compareFn = (a, b) => a === b) {
  if (oldArray === newArray) return false;
  if (!oldArray || !newArray) return true;
  if (oldArray.length !== newArray.length) return true;
  
  for (let i = 0; i < oldArray.length; i++) {
    if (!compareFn(oldArray[i], newArray[i])) {
      return true;
    }
  }
  
  return false;
}

/**
 * Create a stable reference for objects
 * Returns the same reference if content hasn't changed
 */
export function createStableReference(value, compareFn = shallowEqual) {
  let stableRef = value;
  
  return (newValue) => {
    if (!compareFn(stableRef, newValue)) {
      stableRef = newValue;
    }
    return stableRef;
  };
}

/**
 * Optimize object updates by only updating changed properties
 */
export function mergeWithChanges(oldObj, newObj) {
  const changes = {};
  let hasChanges = false;
  
  for (const key in newObj) {
    if (oldObj[key] !== newObj[key]) {
      changes[key] = newObj[key];
      hasChanges = true;
    }
  }
  
  return hasChanges ? { ...oldObj, ...changes } : oldObj;
}

/**
 * Create a selector function that only updates when selected value changes
 */
export function createSelector(selectFn, compareFn = (a, b) => a === b) {
  let lastInput;
  let lastOutput;
  
  return (input) => {
    if (lastInput === undefined || !compareFn(lastInput, input)) {
      lastInput = input;
      lastOutput = selectFn(input);
    }
    return lastOutput;
  };
}

/**
 * Batch multiple state updates into a single update
 */
export class StateBatcher {
  constructor() {
    this.updates = new Map();
    this.scheduled = false;
    this.subscribers = new Set();
  }
  
  /**
   * Queue a state update
   */
  update(key, value) {
    this.updates.set(key, value);
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
   * Execute all queued updates
   */
  flush() {
    const updates = new Map(this.updates);
    this.updates.clear();
    this.scheduled = false;
    
    this.subscribers.forEach(callback => callback(updates));
  }
  
  /**
   * Subscribe to batch updates
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
}

/**
 * Create a computed value that only recalculates when dependencies change
 */
export function createComputed(computeFn, dependencies, compareFn = shallowEqual) {
  let lastDeps = dependencies;
  let lastValue = computeFn(...dependencies);
  
  return (...newDeps) => {
    if (!compareFn(lastDeps, newDeps)) {
      lastDeps = newDeps;
      lastValue = computeFn(...newDeps);
    }
    return lastValue;
  };
}

/**
 * Optimize list rendering by tracking item identity
 */
export class ListOptimizer {
  constructor(keyFn = (item) => item.id) {
    this.keyFn = keyFn;
    this.itemMap = new Map();
  }
  
  /**
   * Process new list and return optimized update info
   */
  process(newList) {
    const newMap = new Map();
    const added = [];
    const removed = [];
    const updated = [];
    const unchanged = [];
    
    // Build new map and detect additions/updates
    for (const item of newList) {
      const key = this.keyFn(item);
      newMap.set(key, item);
      
      if (this.itemMap.has(key)) {
        const oldItem = this.itemMap.get(key);
        if (!shallowEqual(oldItem, item)) {
          updated.push({ key, oldItem, newItem: item });
        } else {
          unchanged.push({ key, item });
        }
      } else {
        added.push({ key, item });
      }
    }
    
    // Detect removals
    for (const [key, item] of this.itemMap) {
      if (!newMap.has(key)) {
        removed.push({ key, item });
      }
    }
    
    // Update internal map
    this.itemMap = newMap;
    
    return {
      added,
      removed,
      updated,
      unchanged,
      hasChanges: added.length > 0 || removed.length > 0 || updated.length > 0
    };
  }
  
  /**
   * Clear optimizer state
   */
  clear() {
    this.itemMap.clear();
  }
}

/**
 * Create a render guard that prevents unnecessary renders
 */
export function createRenderGuard(shouldRenderFn) {
  let lastProps = null;
  
  return (newProps) => {
    const shouldRender = shouldRenderFn(lastProps, newProps);
    if (shouldRender) {
      lastProps = newProps;
    }
    return shouldRender;
  };
}

/**
 * Optimize event handler creation
 * Returns the same function reference if dependencies haven't changed
 */
export function createStableHandler(handlerFn, dependencies = []) {
  let lastDeps = dependencies;
  let stableHandler = handlerFn;
  
  return (...newDeps) => {
    if (!shallowEqual(lastDeps, newDeps)) {
      lastDeps = newDeps;
      stableHandler = handlerFn;
    }
    return stableHandler;
  };
}

/**
 * Prevent rapid successive calls to a function
 */
export function createCallLimiter(maxCallsPerSecond = 10) {
  const calls = [];
  const windowMs = 1000;
  
  return (fn) => {
    const now = Date.now();
    
    // Remove old calls outside the time window
    while (calls.length > 0 && calls[0] < now - windowMs) {
      calls.shift();
    }
    
    // Check if we're within the limit
    if (calls.length < maxCallsPerSecond) {
      calls.push(now);
      return fn();
    }
    
    // Rate limit exceeded
    console.warn('Call rate limit exceeded');
    return null;
  };
}
