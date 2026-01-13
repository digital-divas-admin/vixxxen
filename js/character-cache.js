/**
 * Character Cache Module
 * Client-side caching for marketplace and admin characters
 */

(function() {
  'use strict';

  console.log('📦 Character Cache module loaded');

  const CACHE_TTL = 30 * 1000; // 30 seconds - matches server cache
  const CACHE_KEY_PREFIX = 'vixxxen_chars_';

  // In-memory cache (faster than localStorage)
  let memoryCache = {
    marketplace: { data: null, timestamp: 0 },
    admin: { data: null, timestamp: 0 }
  };

  /**
   * Get cached characters for a given type
   * @param {string} type - 'marketplace' or 'admin'
   * @returns {Array|null} - Cached characters or null if expired/missing
   */
  window.getCachedCharactersClient = function(type = 'marketplace') {
    const cache = memoryCache[type];
    if (cache && cache.data && (Date.now() - cache.timestamp) < CACHE_TTL) {
      console.log(`📦 Client cache HIT (${type}): ${cache.data.length} items`);
      return cache.data;
    }
    console.log(`📦 Client cache MISS (${type})`);
    return null;
  };

  /**
   * Set cached characters for a given type
   * @param {string} type - 'marketplace' or 'admin'
   * @param {Array} data - Characters to cache
   */
  window.setCachedCharactersClient = function(type, data) {
    memoryCache[type] = { data, timestamp: Date.now() };
    console.log(`📦 Client cache SET (${type}): ${data?.length || 0} items`);
  };

  /**
   * Clear all character caches
   */
  window.clearCharactersCacheClient = function() {
    memoryCache = {
      marketplace: { data: null, timestamp: 0 },
      admin: { data: null, timestamp: 0 }
    };
    console.log('📦 Client character cache CLEARED');
  };

  /**
   * Preload characters in the background
   * Call this after auth to warm the cache
   */
  window.preloadCharacters = async function() {
    console.log('📦 Preloading characters...');

    try {
      // Preload marketplace characters
      const response = await authFetch(`${API_BASE_URL}/api/characters`);
      if (response.ok) {
        const data = await response.json();
        if (data.characters) {
          // Store raw API response for cache
          setCachedCharactersClient('marketplace', data.characters);
          console.log('📦 Characters preloaded successfully');
        }
      }
    } catch (error) {
      console.warn('📦 Failed to preload characters:', error);
    }
  };

  /**
   * Get the cache age in seconds
   * @param {string} type - 'marketplace' or 'admin'
   * @returns {number} - Age in seconds, or Infinity if not cached
   */
  window.getCharactersCacheAge = function(type = 'marketplace') {
    const cache = memoryCache[type];
    if (!cache || !cache.timestamp) return Infinity;
    return (Date.now() - cache.timestamp) / 1000;
  };

  // ===========================================
  // DEBOUNCE UTILITY
  // ===========================================

  /**
   * Creates a debounced version of a function
   * @param {Function} func - Function to debounce
   * @param {number} wait - Milliseconds to wait before calling
   * @returns {Function} - Debounced function
   */
  window.debounce = function(func, wait = 250) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  // Store for debounced filter functions
  const debouncedFilters = {};

  /**
   * Get or create a debounced version of a filter function
   * @param {string} name - Name of the filter function
   * @param {number} wait - Debounce wait time in ms
   * @returns {Function} - Debounced filter function
   */
  window.debouncedFilter = function(name, wait = 250) {
    if (!debouncedFilters[name]) {
      const originalFunc = window[name];
      if (typeof originalFunc === 'function') {
        debouncedFilters[name] = debounce(originalFunc, wait);
      } else {
        console.warn(`Filter function ${name} not found`);
        return () => {};
      }
    }
    return debouncedFilters[name];
  };

})();
