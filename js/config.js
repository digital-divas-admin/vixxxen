// ===========================================
// CONFIG - Core Configuration
// ===========================================
// This module must load FIRST - other modules depend on these globals
// NOTE: Only truly standalone config goes here. State management
// that depends on other functions stays in inline script.

// Supabase Configuration
const SUPABASE_URL = 'https://kdgjbyfqytjtywxlekpz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkZ2pieWZxeXRqdHl3eGxla3B6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1MTQ5MTIsImV4cCI6MjA4MjA5MDkxMn0.2v2n2pBbKeFAzq6M6XkgTpSI4e5_ifeao7gRFQ5q6HA';

// Check if Supabase loaded
if (typeof window.supabase === 'undefined') {
  console.error('❌ SUPABASE NOT LOADED! Check your internet connection.');
} else {
  console.log('✅ Supabase client library loaded');
}

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log('✅ Supabase initialized for project:', SUPABASE_URL);

// Current user session (will be set by auth state handler)
let currentUser = null;
// Cached session for API calls - avoids race condition with getSession() during auth state changes
let cachedSession = null;

// Function to update cached session (called by auth state change handler)
function setCachedSession(session) {
  cachedSession = session;
  console.log('🔑 Session cached:', session ? 'yes' : 'cleared');
}

// Auto-detect local vs production environment
const isLocal = window.location.hostname === 'localhost'
  || window.location.hostname === '127.0.0.1'
  || window.location.protocol === 'file:';

// In production, use empty string for same-origin API calls
const API_BASE_URL = isLocal ? 'http://localhost:3002' : '';
console.log(`🔗 API URL: ${API_BASE_URL || window.location.origin} (${isLocal ? 'local' : 'production'})`);

// NSFW-only models - always tag output as NSFW regardless of content mode
const NSFW_ONLY_MODELS = ['seedream', 'qwen', 'wan'];

// ===========================================
// AUTHENTICATED API HELPER
// ===========================================
// Wraps fetch with automatic auth header injection

/**
 * Make an authenticated API request
 * Automatically adds the Supabase JWT token to Authorization header
 * @param {string} url - The API endpoint URL
 * @param {object} options - Fetch options (method, body, etc.)
 * @returns {Promise<Response>} - The fetch response
 */
async function authFetch(url, options = {}) {
  // Use cached session first (avoids race condition during auth state changes)
  // Only fall back to getSession() if cache is empty
  let session = cachedSession;
  if (!session) {
    console.log('🔑 authFetch: No cached session, calling getSession()...');
    const result = await supabaseClient.auth.getSession();
    session = result.data?.session;
  }
  console.log('🔑 authFetch: Has token:', !!session?.access_token);

  // Build headers with auth token if available
  // Don't set Content-Type for FormData (browser handles it)
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...options.headers
  };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  // Make the request with auth headers
  console.log('🔑 authFetch: Making request to', url);
  const response = await fetch(url, {
    ...options,
    headers
  });
  console.log('🔑 authFetch: Response received, status:', response.status);
  return response;
}

/**
 * Make an authenticated GET request
 * @param {string} url - The API endpoint URL
 * @returns {Promise<any>} - Parsed JSON response
 */
async function authGet(url) {
  const response = await authFetch(url, { method: 'GET' });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Make an authenticated POST request
 * @param {string} url - The API endpoint URL
 * @param {object} data - Request body data
 * @returns {Promise<any>} - Parsed JSON response
 */
async function authPost(url, data) {
  const response = await authFetch(url, {
    method: 'POST',
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Make an authenticated PUT request
 * @param {string} url - The API endpoint URL
 * @param {object} data - Request body data
 * @returns {Promise<any>} - Parsed JSON response
 */
async function authPut(url, data) {
  const response = await authFetch(url, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Make an authenticated DELETE request
 * @param {string} url - The API endpoint URL
 * @returns {Promise<any>} - Parsed JSON response
 */
async function authDelete(url) {
  const response = await authFetch(url, { method: 'DELETE' });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return response.json();
}
