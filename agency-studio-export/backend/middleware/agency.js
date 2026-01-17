/**
 * Agency Resolution Middleware
 * Resolves the current agency from hostname and attaches to request
 */

const { supabaseAdmin } = require('../services/supabase');
const { logger } = require('../services/logger');

/**
 * Extract agency slug from hostname
 * Patterns:
 *   - {slug}.agencystudio.com -> slug
 *   - {slug}.localhost:3001 -> slug (dev)
 *   - custom.domain.com -> lookup by custom_domain
 */
function extractAgencyIdentifier(hostname) {
  // Remove port if present
  const host = hostname.split(':')[0];

  // Check for subdomain pattern
  const parts = host.split('.');

  // localhost or IP - check for dev override header
  if (host === 'localhost' || host === '127.0.0.1' || parts.length === 1) {
    return { type: 'dev', value: null };
  }

  // Subdomain pattern: {slug}.agencystudio.com or {slug}.domain.com
  if (parts.length >= 2) {
    const subdomain = parts[0];
    // Skip www
    if (subdomain === 'www') {
      return { type: 'custom_domain', value: host };
    }
    return { type: 'slug', value: subdomain };
  }

  // Treat as custom domain
  return { type: 'custom_domain', value: host };
}

/**
 * Middleware to resolve agency from request
 * Attaches agency object to req.agency
 */
async function resolveAgency(req, res, next) {
  try {
    // Development override - use header or query param
    let agencySlug = req.headers['x-agency-slug'] || req.query._agency;

    if (!agencySlug) {
      const identifier = extractAgencyIdentifier(req.hostname);

      if (identifier.type === 'dev') {
        // In development without override, use default test agency
        agencySlug = process.env.DEFAULT_AGENCY_SLUG || 'demo';
      } else if (identifier.type === 'slug') {
        agencySlug = identifier.value;
      } else if (identifier.type === 'custom_domain') {
        // Lookup by custom domain
        const { data: agency, error } = await supabaseAdmin
          .from('agencies')
          .select('*')
          .eq('custom_domain', identifier.value)
          .eq('status', 'active')
          .single();

        if (error || !agency) {
          logger.warn(`Agency not found for custom domain: ${identifier.value}`);
          return res.status(404).json({ error: 'Agency not found' });
        }

        req.agency = agency;
        return next();
      }
    }

    // Lookup by slug
    const { data: agency, error } = await supabaseAdmin
      .from('agencies')
      .select('*')
      .eq('slug', agencySlug)
      .eq('status', 'active')
      .single();

    if (error || !agency) {
      logger.warn(`Agency not found for slug: ${agencySlug}`);
      return res.status(404).json({ error: 'Agency not found' });
    }

    req.agency = agency;
    next();
  } catch (error) {
    logger.error('Error resolving agency:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Optional agency resolution - doesn't fail if no agency found
 * Useful for public routes that may or may not be agency-scoped
 */
async function resolveAgencyOptional(req, res, next) {
  try {
    const agencySlug = req.headers['x-agency-slug'] || req.query._agency;

    if (agencySlug) {
      const { data: agency } = await supabaseAdmin
        .from('agencies')
        .select('*')
        .eq('slug', agencySlug)
        .eq('status', 'active')
        .single();

      req.agency = agency || null;
    } else {
      req.agency = null;
    }

    next();
  } catch (error) {
    logger.error('Error in optional agency resolution:', error);
    req.agency = null;
    next();
  }
}

module.exports = { resolveAgency, resolveAgencyOptional, extractAgencyIdentifier };
