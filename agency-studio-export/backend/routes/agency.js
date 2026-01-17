/**
 * Agency Routes
 * Handles agency configuration and management
 */

const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../services/supabase');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getCreditBalance } = require('../middleware/credits');
const { logger } = require('../services/logger');

/**
 * GET /api/agency/config
 * Returns agency configuration for frontend theming
 * Public route - no auth required
 */
router.get('/config', async (req, res) => {
  try {
    const { agency } = req;

    if (!agency) {
      return res.status(404).json({ error: 'Agency not found' });
    }

    // Parse settings if stored as string
    const settings = typeof agency.settings === 'string'
      ? JSON.parse(agency.settings)
      : agency.settings || {};

    res.json({
      id: agency.id,
      name: agency.name,
      slug: agency.slug,
      branding: settings.branding || {
        logo_url: null,
        favicon_url: null,
        app_name: agency.name,
        primary_color: '#6366f1',
        secondary_color: '#4f46e5',
      },
      features: settings.features || {
        image_gen: true,
        video_gen: true,
        editing: true,
        chat: true,
        nsfw_enabled: true,
        models_allowed: ['seedream', 'nanoBanana', 'qwen', 'kling', 'wan', 'veo'],
      },
    });
  } catch (error) {
    logger.error('Error fetching agency config:', error);
    res.status(500).json({ error: 'Failed to fetch agency configuration' });
  }
});

/**
 * GET /api/agency/me
 * Returns current user's agency membership info
 * Requires authentication
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { agency, agencyUser, user } = req;

    const creditBalance = await getCreditBalance(agency, agencyUser);

    res.json({
      user: {
        id: agencyUser.id,
        email: user.email,
        name: agencyUser.name,
        role: agencyUser.role,
        avatar_url: agencyUser.avatar_url,
      },
      agency: {
        id: agency.id,
        name: agency.name,
        slug: agency.slug,
      },
      credits: creditBalance,
    });
  } catch (error) {
    logger.error('Error fetching user info:', error);
    res.status(500).json({ error: 'Failed to fetch user information' });
  }
});

/**
 * PUT /api/agency/settings
 * Update agency settings (admin only)
 */
router.put('/settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { agency } = req;
    const { branding, features } = req.body;

    // Get current settings
    const currentSettings = typeof agency.settings === 'string'
      ? JSON.parse(agency.settings)
      : agency.settings || {};

    // Merge updates
    const newSettings = {
      ...currentSettings,
      branding: branding ? { ...currentSettings.branding, ...branding } : currentSettings.branding,
      features: features ? { ...currentSettings.features, ...features } : currentSettings.features,
    };

    const { data, error } = await supabaseAdmin
      .from('agencies')
      .update({ settings: newSettings })
      .eq('id', agency.id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating agency settings:', error);
      return res.status(500).json({ error: 'Failed to update settings' });
    }

    res.json({
      message: 'Settings updated successfully',
      settings: newSettings,
    });
  } catch (error) {
    logger.error('Error updating agency settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * GET /api/agency/usage
 * Get agency usage statistics (admin only)
 */
router.get('/usage', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { agency } = req;

    // Get aggregated usage stats
    const { data: generations, error: genError } = await supabaseAdmin
      .from('generations')
      .select('type, model, credits_cost, created_at')
      .eq('agency_id', agency.id)
      .gte('created_at', agency.billing_cycle_start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (genError) {
      logger.error('Error fetching generations:', genError);
    }

    // Get per-user usage
    const { data: userUsage, error: userError } = await supabaseAdmin
      .from('agency_users')
      .select('id, name, email, credits_used_this_cycle, credit_limit')
      .eq('agency_id', agency.id)
      .eq('status', 'active')
      .order('credits_used_this_cycle', { ascending: false });

    if (userError) {
      logger.error('Error fetching user usage:', userError);
    }

    // Aggregate by type
    const byType = {};
    const byModel = {};
    (generations || []).forEach((gen) => {
      byType[gen.type] = (byType[gen.type] || 0) + gen.credits_cost;
      byModel[gen.model] = (byModel[gen.model] || 0) + gen.credits_cost;
    });

    res.json({
      agency: {
        credit_pool: agency.credit_pool,
        credits_used_this_cycle: agency.credits_used_this_cycle,
        monthly_credit_allocation: agency.monthly_credit_allocation,
      },
      usage: {
        byType,
        byModel,
        totalGenerations: (generations || []).length,
      },
      users: userUsage || [],
    });
  } catch (error) {
    logger.error('Error fetching usage:', error);
    res.status(500).json({ error: 'Failed to fetch usage statistics' });
  }
});

module.exports = router;
