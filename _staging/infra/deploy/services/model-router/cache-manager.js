/**
 * Cache Manager Service
 * 
 * Manages response caching for identical prompts with TTL-based expiration.
 * Uses SHA-256 hashing for cache keys.
 * 
 * Requirements: 15.1, 15.2, 15.3
 */

const crypto = require('crypto');

class CacheManager {
  constructor(options = {}) {
    this.cache = new Map();
    this.ttl = options.ttl || 3600000; // Default: 1 hour in milliseconds
    this.maxSize = options.maxSize || 1000; // Maximum cache entries
    this.logger = options.logger || console;
    
    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0,
      expirations: 0
    };

    // Start cleanup interval
    this.cleanupInterval = options.cleanupInterval || 300000; // 5 minutes
    this.startCleanup();
  }

  /**
   * Generate cache key from messages and model
   * Uses SHA-256 hash for consistent key generation
   * @param {Array} messages - Chat messages
   * @param {string} model - Model identifier
   * @returns {string} Cache key
   */
  getCacheKey(messages, model) {
    const data = JSON.stringify({ messages, model });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Get cached response
   * @param {string} key - Cache key
   * @returns {Object|null} Cached response or null if not found/expired
   */
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if entry has expired
    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.stats.expirations++;
      this.stats.misses++;
      
      this.logger.debug('Cache entry expired', {
        key: key.substring(0, 16) + '...',
        age: now - entry.timestamp,
        ttl: this.ttl
      });
      
      return null;
    }

    this.stats.hits++;
    
    this.logger.debug('Cache hit', {
      key: key.substring(0, 16) + '...',
      age: now - entry.timestamp
    });

    return entry.value;
  }

  /**
   * Store response in cache
   * @param {string} key - Cache key
   * @param {Object} value - Response to cache
   */
  set(key, value) {
    // Check if we need to evict entries
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });

    this.stats.sets++;

    this.logger.debug('Cache set', {
      key: key.substring(0, 16) + '...',
      cacheSize: this.cache.size
    });
  }

  /**
   * Invalidate cache entry by key
   * @param {string} key - Cache key to invalidate
   * @returns {boolean} True if entry was deleted
   */
  invalidate(key) {
    const deleted = this.cache.delete(key);
    
    if (deleted) {
      this.logger.info('Cache entry invalidated', {
        key: key.substring(0, 16) + '...'
      });
    }
    
    return deleted;
  }

  /**
   * Invalidate cache entries matching a pattern
   * @param {RegExp|string} pattern - Pattern to match keys
   * @returns {number} Number of entries invalidated
   */
  invalidatePattern(pattern) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    let count = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      this.logger.info('Cache entries invalidated by pattern', {
        pattern: pattern.toString(),
        count
      });
    }

    return count;
  }

  /**
   * Clear all cache entries
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    
    this.logger.info('Cache cleared', {
      entriesCleared: size
    });
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;

    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
      hitRate: hitRate.toFixed(2) + '%',
      totalRequests
    };
  }

  /**
   * Reset cache statistics
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0,
      expirations: 0
    };

    this.logger.info('Cache statistics reset');
  }

  /**
   * Evict oldest cache entry
   * @private
   */
  evictOldest() {
    let oldestKey = null;
    let oldestTimestamp = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      
      this.logger.debug('Cache entry evicted', {
        key: oldestKey.substring(0, 16) + '...',
        age: Date.now() - oldestTimestamp
      });
    }
  }

  /**
   * Start periodic cleanup of expired entries
   * @private
   */
  startCleanup() {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);

    // Don't prevent process from exiting
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop periodic cleanup
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Clean up expired entries
   * @private
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        cleaned++;
        this.stats.expirations++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug('Cache cleanup completed', {
        entriesCleaned: cleaned,
        remainingEntries: this.cache.size
      });
    }
  }

  /**
   * Get cache size
   * @returns {number} Number of entries in cache
   */
  size() {
    return this.cache.size;
  }

  /**
   * Check if cache has a key
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and is not expired
   */
  has(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.stats.expirations++;
      return false;
    }

    return true;
  }
}

module.exports = CacheManager;
