/**
 * Authentication Middleware
 * Verifies JWT tokens and loads agency user context
 */

const { supabaseAdmin, createUserClient } = require('../services/supabase');
const { logger } = require('../services/logger');

/**
 * Extract JWT from Authorization header
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Require authentication - fails if no valid token
 * Attaches user and agencyUser to request
 */
async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify token with Supabase
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      logger.warn('Invalid token:', authError?.message);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Load agency user record
    if (!req.agency) {
      return res.status(400).json({ error: 'Agency context required' });
    }

    const { data: agencyUser, error: userError } = await supabaseAdmin
      .from('agency_users')
      .select('*')
      .eq('auth_user_id', user.id)
      .eq('agency_id', req.agency.id)
      .eq('status', 'active')
      .single();

    if (userError || !agencyUser) {
      logger.warn(`User ${user.id} not found in agency ${req.agency.id}`);
      return res.status(403).json({ error: 'You do not have access to this agency' });
    }

    // Attach to request
    req.user = user;
    req.agencyUser = agencyUser;
    req.token = token;

    // Create user-scoped Supabase client for RLS queries
    req.supabase = createUserClient(token);

    next();
  } catch (error) {
    logger.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Optional authentication - doesn't fail if no token
 * Useful for routes that work differently for authenticated vs anonymous
 */
async function optionalAuth(req, res, next) {
  try {
    const token = extractToken(req);

    if (!token) {
      req.user = null;
      req.agencyUser = null;
      return next();
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      req.user = null;
      req.agencyUser = null;
      return next();
    }

    // Load agency user if agency context exists
    if (req.agency) {
      const { data: agencyUser } = await supabaseAdmin
        .from('agency_users')
        .select('*')
        .eq('auth_user_id', user.id)
        .eq('agency_id', req.agency.id)
        .eq('status', 'active')
        .single();

      req.agencyUser = agencyUser || null;
    }

    req.user = user;
    req.token = token;
    req.supabase = createUserClient(token);

    next();
  } catch (error) {
    logger.error('Optional auth error:', error);
    req.user = null;
    req.agencyUser = null;
    next();
  }
}

/**
 * Require agency admin role (owner or admin)
 * Must be used after requireAuth
 */
function requireAdmin(req, res, next) {
  if (!req.agencyUser) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!['owner', 'admin'].includes(req.agencyUser.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

/**
 * Require agency owner role
 * Must be used after requireAuth
 */
function requireOwner(req, res, next) {
  if (!req.agencyUser) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.agencyUser.role !== 'owner') {
    return res.status(403).json({ error: 'Owner access required' });
  }

  next();
}

module.exports = { requireAuth, optionalAuth, requireAdmin, requireOwner, extractToken };
