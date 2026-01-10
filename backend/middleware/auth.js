/**
 * Authentication Middleware
 * Verifies Supabase JWT tokens and extracts user information
 */
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client for auth verification
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Extract Bearer token from Authorization header
 */
function extractToken(authHeader) {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
  return parts[1];
}

/**
 * Required Auth Middleware
 * Verifies the JWT token and attaches user to request
 * Returns 401 if no valid token provided
 */
async function requireAuth(req, res, next) {
  console.log('🔐 requireAuth: Starting for', req.path);
  try {
    if (!supabase) {
      console.error('Auth middleware: Supabase not configured');
      return res.status(500).json({ error: 'Authentication service not configured' });
    }

    const token = extractToken(req.headers.authorization);
    console.log('🔐 requireAuth: Token extracted:', token ? 'yes' : 'no');

    if (!token) {
      console.log('🔐 requireAuth: No token, returning 401');
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify token with Supabase
    console.log('🔐 requireAuth: Verifying token with Supabase...');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    console.log('🔐 requireAuth: Supabase responded, user:', user?.email || 'none');

    if (error || !user) {
      console.error('Auth verification failed:', error?.message || 'No user returned');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Attach verified user to request
    req.user = user;
    req.userId = user.id;
    console.log('🔐 requireAuth: Auth successful, userId:', user.id);

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Optional Auth Middleware
 * Verifies the JWT token if present, but allows unauthenticated requests
 * Useful for endpoints that can work with or without auth
 */
async function optionalAuth(req, res, next) {
  try {
    const token = extractToken(req.headers.authorization);

    if (!token || !supabase) {
      // No token provided or Supabase not configured - continue without user
      req.user = null;
      req.userId = null;
      return next();
    }

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      // Invalid token - continue without user (don't fail)
      req.user = null;
      req.userId = null;
      return next();
    }

    // Attach verified user to request
    req.user = user;
    req.userId = user.id;

    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    // Continue without user on error
    req.user = null;
    req.userId = null;
    next();
  }
}

/**
 * Admin Auth Middleware
 * Requires authentication AND admin role
 */
async function requireAdmin(req, res, next) {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Authentication service not configured' });
    }

    const token = extractToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Attach verified user and admin status to request
    req.user = user;
    req.userId = user.id;
    req.isAdmin = true;

    next();
  } catch (error) {
    console.error('Admin auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Verify User Ownership Middleware
 * Ensures the authenticated user matches the userId in the request
 * Must be used after requireAuth
 */
function verifyOwnership(paramName = 'userId') {
  return (req, res, next) => {
    const requestedUserId = req.params[paramName] || req.query.user_id || req.body.user_id;

    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (requestedUserId && requestedUserId !== req.userId && !req.isAdmin) {
      console.warn(`Access denied: User ${req.userId} tried to access data for user ${requestedUserId}`);
      return res.status(403).json({ error: 'Access denied' });
    }

    next();
  };
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireAdmin,
  verifyOwnership,
  extractToken,
  supabase
};
