/**
 * Shared Supabase Client
 *
 * Single instance of the Supabase client for the entire backend.
 * All route files should import from here instead of creating their own clients.
 *
 * Usage:
 *   const { supabase } = require('./services/supabase');
 *   // or from route files:
 *   const { supabase } = require('./services/supabase');
 */

const { createClient } = require('@supabase/supabase-js');
const { logger } = require('./logger');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;

if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
  logger.debug('Supabase client initialized');
} else {
  logger.warn('Supabase not configured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

/**
 * Check if Supabase is configured and available
 * @returns {boolean}
 */
function isConfigured() {
  return supabase !== null;
}

module.exports = {
  supabase,
  isConfigured
};
