/**
 * Performance Utilities Tests
 * Tests for EventBatcher, LazyLoadManager, and other performance utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EventBatcher,
  LazyLoadManager,
  VirtualScrollManager,
  debounce,
  throttle,
  memoize,
  chunkArray,
  processInChunks
} from './performance.js';

describe('EventBatcher', () => {
  let batcher;
  let onFlushMock;

  beforeEach(() => {
    onFlushMock = vi.fn();
    batcher = new EventBatcher({
      batchSize: 3,
      batchDelay: 50,
      onFlush: onFlushMock
    });
  });

  afterEach(() => {
    if (batcher) {
      batcher.destroy();
    }
  });

  it('should batch events up to batch size', () => {
    batcher.add({ type: 'event1' });
    batcher.add({ type: 'event2' });
    expect(onFlushMock).not.toHaveBeenCalled();

    batcher.add({ type: 'event3' });
    expect(onFlushMock).toHaveBeenCalledWith([
      { type: 'event1' },
      { type: 'event2' },
      { type: 'event3' }
    ]);
  });

  it('should flush after delay', async () => {
    batcher.add({ type: 'event1' });
    expect(onFlushMock).not.toHaveBeenCalled();

    await new Promise(resolve => setTimeout(resolve, 60));
    expect(onFlushMock).toHaveBeenCalledWith([{ type: 'event1' }]);
  });

  it('should clear queue without flushing', () => {
    batcher.add({ type: 'event1' });
    batcher.add({ type: 'event2' });
    batcher.clear();

    expect(batcher.size()).toBe(0);
    expect(onFlushMock).not.toHaveBeenCalled();
  });

  it('should manually flush queue', () => {
    batcher.add({ type: 'event1' });
    batcher.add({ type: 'event2' });
    batcher.flush();

    expect(onFlushMock).toHaveBeenCalledWith([
      { type: 'event1' },
      { type: 'event2' }
    ]);
    expect(batcher.size()).toBe(0);
  });
});

describe('LazyLoadManager', () => {
  let manager;

  beforeEach(() => {
    manager = new LazyLoadManager();
  });

  afterEach(() => {
    if (manager) {
      manager.clear();
    }
  });

  it('should track loaded items', () => {
    expect(manager.isLoaded('item1')).toBe(false);

    manager.markLoading('item1');
    expect(manager.isLoading('item1')).toBe(true);

    manager.markLoaded('item1');
    expect(manager.isLoaded('item1')).toBe(true);
    expect(manager.isLoading('item1')).toBe(false);
  });

  it('should unload items', () => {
    manager.markLoaded('item1');
    expect(manager.isLoaded('item1')).toBe(true);

    manager.unload('item1');
    expect(manager.isLoaded('item1')).toBe(false);
  });

  it('should get loaded count', () => {
    manager.markLoaded('item1');
    manager.markLoaded('item2');
    manager.markLoaded('item3');

    expect(manager.getLoadedCount()).toBe(3);
  });

  it('should clear all items', () => {
    manager.markLoaded('item1');
    manager.markLoaded('item2');

    manager.clear();
    expect(manager.getLoadedCount()).toBe(0);
  });
});

describe('VirtualScrollManager', () => {
  let manager;

  beforeEach(() => {
    manager = new VirtualScrollManager({
      itemHeight: 100,
      overscan: 2,
      containerHeight: 600
    });
  });

  it('should calculate visible range', () => {
    const range = manager.calculateVisibleRange(0, 100);

    expect(range.startIndex).toBe(0);
    expect(range.endIndex).toBeLessThanOrEqual(100);
    expect(range.visibleCount).toBeGreaterThan(0);
  });

  it('should get visible items', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    const result = manager.getVisibleItems(items, 0);

    expect(result.visibleItems.length).toBeGreaterThan(0);
    expect(result.visibleItems.length).toBeLessThan(items.length);
    expect(result.totalHeight).toBe(10000); // 100 items * 100px
  });

  it('should update container height', () => {
    manager.setContainerHeight(800);
    const range = manager.calculateVisibleRange(0, 100);

    expect(range.visibleCount).toBeGreaterThan(6); // More visible with larger container
  });
});

describe('debounce', () => {
  it('should debounce function calls', async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced();
    debounced();
    debounced();

    expect(fn).not.toHaveBeenCalled();

    await new Promise(resolve => setTimeout(resolve, 60));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('throttle', () => {
  it('should throttle function calls', async () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 50);

    throttled();
    throttled();
    throttled();

    expect(fn).toHaveBeenCalledTimes(1);

    await new Promise(resolve => setTimeout(resolve, 60));
    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('memoize', () => {
  it('should cache function results', () => {
    const fn = vi.fn((x) => x * 2);
    const memoized = memoize(fn);

    expect(memoized(5)).toBe(10);
    expect(memoized(5)).toBe(10);
    expect(fn).toHaveBeenCalledTimes(1);

    expect(memoized(10)).toBe(20);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should use custom key generator', () => {
    const fn = vi.fn((obj) => obj.value * 2);
    const memoized = memoize(fn, (obj) => obj.id);

    const obj1 = { id: 1, value: 5 };
    const obj2 = { id: 1, value: 10 }; // Same id, different value

    expect(memoized(obj1)).toBe(10);
    expect(memoized(obj2)).toBe(10); // Returns cached result
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('chunkArray', () => {
  it('should chunk array into smaller arrays', () => {
    const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const chunks = chunkArray(array, 3);

    expect(chunks).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10]
    ]);
  });

  it('should handle empty array', () => {
    const chunks = chunkArray([], 3);
    expect(chunks).toEqual([]);
  });
});

describe('processInChunks', () => {
  it('should process array in chunks', async () => {
    const array = [1, 2, 3, 4, 5];
    const processor = vi.fn((x) => Promise.resolve(x * 2));

    const results = await processInChunks(array, processor, 2, 0);

    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(processor).toHaveBeenCalledTimes(5);
  });

  it('should add delay between chunks', async () => {
    const array = [1, 2, 3, 4];
    const processor = vi.fn((x) => Promise.resolve(x * 2));

    const startTime = Date.now();
    await processInChunks(array, processor, 2, 50);
    const endTime = Date.now();

    expect(endTime - startTime).toBeGreaterThanOrEqual(50);
  });
});
