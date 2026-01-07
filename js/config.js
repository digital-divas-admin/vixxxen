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

// Auto-detect local vs production environment
const isLocal = window.location.hostname === 'localhost'
  || window.location.hostname === '127.0.0.1'
  || window.location.protocol === 'file:';

// In production, use empty string for same-origin API calls
const API_BASE_URL = isLocal ? 'http://localhost:3002' : '';
console.log(`🔗 API URL: ${API_BASE_URL || window.location.origin} (${isLocal ? 'local' : 'production'})`);

// NSFW-only models - always tag output as NSFW regardless of content mode
const NSFW_ONLY_MODELS = ['seedream', 'qwen', 'wan'];
