/**
 * Settings Service
 *
 * Provides cached access to system settings stored in Supabase.
 * Settings are cached to avoid hitting the database on every request.
 *
 * Usage:
 *   const { getSetting, setSetting } = require('./services/settingsService');
 *   const gpuConfig = await getSetting('gpu_config');
 *   await setSetting('gpu_config', { mode: 'hybrid', ... });
 */

const { supabase } = require('./supabase');
const { logger } = require('./logger');

// In-memory cache
const cache = new Map();
const CACHE_TTL = 30 * 1000; // 30 seconds

// Default settings
const DEFAULTS = {
  gpu_config: {
    mode: 'serverless', // 'serverless' | 'dedicated' | 'hybrid' | 'serverless-primary'
    dedicatedUrl: null,
    dedicatedTimeout: 5000, // ms to wait before falling back to serverless
    enabled: true
  }
};

/**
 * Get a setting by key
 * Returns cached value if available and not expired
 */
async function getSetting(key) {
  // Check cache first
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.value;
  }

  // Fetch from database
  if (!supabase) {
    logger.warn('Settings: Supabase not configured, using defaults');
    return DEFAULTS[key] || null;
  }

  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', key)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Row not found - use default
        logger.debug('Settings: Key not found, using default', { key });
        return DEFAULTS[key] || null;
      }
      logger.error('Settings fetch error', { error: error.message });
      // Return cached value if available (even if expired)
      return cached?.value || DEFAULTS[key] || null;
    }

    // Update cache
    cache.set(key, {
      value: data.value,
      timestamp: Date.now()
    });

    return data.value;
  } catch (error) {
    logger.error('Settings service error', { error: error.message });
    return cached?.value || DEFAULTS[key] || null;
  }
}

/**
 * Set a setting value
 * Updates database and invalidates cache
 */
async function setSetting(key, value) {
  if (!supabase) {
    logger.error('Settings: Supabase not configured, cannot save');
    return false;
  }

  try {
    const { error } = await supabase
      .from('system_settings')
      .upsert({
        key,
        value,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'key'
      });

    if (error) {
      logger.error('Settings save error', { error: error.message });
      return false;
    }

    // Update cache
    cache.set(key, {
      value,
      timestamp: Date.now()
    });

    logger.info('Settings updated', { key });
    return true;
  } catch (error) {
    logger.error('Settings service error', { error: error.message });
    return false;
  }
}

/**
 * Invalidate cache for a key (or all keys)
 */
function invalidateCache(key = null) {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}

/**
 * Get GPU configuration with safe defaults
 */
async function getGpuConfig() {
  const config = await getSetting('gpu_config');
  return {
    ...DEFAULTS.gpu_config,
    ...config
  };
}

module.exports = {
  getSetting,
  setSetting,
  invalidateCache,
  getGpuConfig,
  DEFAULTS
};
