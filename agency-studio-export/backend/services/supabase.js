/**
 * Supabase client initialization
 * Provides both admin (service role) and user-context clients
 */

const { createClient } = require('@supabase/supabase-js');
const { config } = require('../config');

// Admin client - bypasses RLS, use carefully
const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Create a client with user's JWT for RLS-enforced queries
function createUserClient(accessToken) {
  return createClient(
    config.supabase.url,
    config.supabase.anonKey,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

module.exports = { supabaseAdmin, createUserClient };
