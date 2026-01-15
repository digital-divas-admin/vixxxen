/**
 * Analytics Events API
 * Internal analytics tracking for user behavior and funnel analysis
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { supabase } = require('./services/supabase');
const { requireAdmin, optionalAuth } = require('./middleware/auth');
const { logger } = require('./services/logger');

// Valid event categories
const VALID_CATEGORIES = [
  'onboarding',
  'trial',
  'generation',
  'character',
  'chat',
  'monetization',
  'session',
  'engagement'
];

// Valid event names by category
const VALID_EVENTS = {
  onboarding: [
    'onboarding_started',
    'onboarding_step_viewed',
    'onboarding_step_completed',
    'onboarding_step_skipped',
    'onboarding_completed',
    'onboarding_abandoned'
  ],
  trial: [
    'trial_started',
    'trial_generation_used',
    'trial_completed',
    'trial_converted',
    'trial_expired'
  ],
  generation: [
    'generation_started',
    'generation_completed',
    'generation_failed',
    'generation_saved',
    'generation_shared'
  ],
  character: [
    'character_creation_started',
    'character_images_uploaded',
    'character_details_entered',
    'character_style_selected',
    'character_submitted',
    'character_training_completed',
    'character_viewed',
    'character_purchased',
    'character_used'
  ],
  chat: [
    'chat_joined',
    'chat_message_sent',
    'chat_reaction_added',
    'mentor_channel_opened',
    'mentor_message_sent'
  ],
  monetization: [
    'pricing_viewed',
    'plan_selected',
    'checkout_started',
    'checkout_completed',
    'checkout_abandoned',
    'subscription_upgraded',
    'subscription_cancelled',
    'credits_purchased'
  ],
  session: [
    'session_started',
    'session_ended',
    'page_viewed'
  ],
  engagement: [
    'feature_used',
    'button_clicked',
    'modal_opened',
    'modal_closed'
  ]
};

/**
 * Hash IP address for privacy
 */
function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip + process.env.IP_HASH_SALT || 'vixxxen-salt').digest('hex').substring(0, 16);
}

/**
 * Extract IP from request
 */
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.ip;
}

/**
 * Parse UTM parameters from URL
 */
function parseUtmParams(url) {
  if (!url) return {};
  try {
    const urlObj = new URL(url);
    return {
      utm_source: urlObj.searchParams.get('utm_source'),
      utm_medium: urlObj.searchParams.get('utm_medium'),
      utm_campaign: urlObj.searchParams.get('utm_campaign')
    };
  } catch {
    return {};
  }
}

// ===========================================
// PUBLIC ENDPOINTS
// ===========================================

/**
 * POST /api/analytics/event
 * Track a single analytics event
 */
router.post('/event', optionalAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(200).json({ tracked: false, reason: 'database_not_configured' });
    }

    const {
      event_name,
      event_category,
      event_data = {},
      anonymous_id,
      session_id,
      page_url,
      referrer
    } = req.body;

    // Validate required fields
    if (!event_name || !event_category) {
      return res.status(400).json({ error: 'event_name and event_category are required' });
    }

    // Validate category
    if (!VALID_CATEGORIES.includes(event_category)) {
      return res.status(400).json({ error: `Invalid event_category. Must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }

    // Validate event name (warn but don't reject for flexibility)
    const validEventsForCategory = VALID_EVENTS[event_category] || [];
    if (!validEventsForCategory.includes(event_name)) {
      logger.warn('Unknown event name', { event_name, event_category, requestId: req.id });
    }

    // Extract UTM params
    const utmParams = parseUtmParams(page_url || referrer);

    // Build event record
    const eventRecord = {
      user_id: req.userId || null,
      anonymous_id: anonymous_id || null,
      session_id: session_id || null,
      event_name,
      event_category,
      event_data,
      page_url,
      referrer,
      utm_source: utmParams.utm_source,
      utm_medium: utmParams.utm_medium,
      utm_campaign: utmParams.utm_campaign,
      user_agent: req.headers['user-agent'],
      ip_hash: hashIp(getClientIp(req))
    };

    const { error } = await supabase
      .from('analytics_events')
      .insert(eventRecord);

    if (error) {
      logger.error('Failed to track event', { error: error.message, event_name, requestId: req.id });
      return res.status(200).json({ tracked: false, reason: 'database_error' });
    }

    logger.debug('Event tracked', { event_name, event_category, userId: req.userId, requestId: req.id });
    res.json({ tracked: true });

  } catch (error) {
    logger.error('Analytics event error', { error: error.message, requestId: req.id });
    res.status(200).json({ tracked: false, reason: 'server_error' });
  }
});

/**
 * POST /api/analytics/events
 * Track multiple events in batch
 */
router.post('/events', optionalAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(200).json({ tracked: 0, reason: 'database_not_configured' });
    }

    const { events } = req.body;

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events array is required' });
    }

    if (events.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 events per batch' });
    }

    const clientIp = getClientIp(req);
    const ipHash = hashIp(clientIp);
    const userAgent = req.headers['user-agent'];

    const eventRecords = events.map(event => {
      const utmParams = parseUtmParams(event.page_url || event.referrer);
      return {
        user_id: req.userId || null,
        anonymous_id: event.anonymous_id || null,
        session_id: event.session_id || null,
        event_name: event.event_name,
        event_category: event.event_category,
        event_data: event.event_data || {},
        page_url: event.page_url,
        referrer: event.referrer,
        utm_source: utmParams.utm_source,
        utm_medium: utmParams.utm_medium,
        utm_campaign: utmParams.utm_campaign,
        user_agent: userAgent,
        ip_hash: ipHash,
        created_at: event.timestamp || new Date().toISOString()
      };
    });

    const { error } = await supabase
      .from('analytics_events')
      .insert(eventRecords);

    if (error) {
      logger.error('Failed to track batch events', { error: error.message, count: events.length, requestId: req.id });
      return res.status(200).json({ tracked: 0, reason: 'database_error' });
    }

    logger.debug('Batch events tracked', { count: events.length, userId: req.userId, requestId: req.id });
    res.json({ tracked: events.length });

  } catch (error) {
    logger.error('Analytics batch error', { error: error.message, requestId: req.id });
    res.status(200).json({ tracked: 0, reason: 'server_error' });
  }
});

/**
 * POST /api/analytics/funnel/update
 * Update funnel progress for a user
 */
router.post('/funnel/update', optionalAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(200).json({ updated: false, reason: 'database_not_configured' });
    }

    const {
      funnel_name,
      current_step,
      step_completed,
      anonymous_id,
      funnel_data = {},
      completed = false,
      abandoned = false
    } = req.body;

    if (!funnel_name || !current_step) {
      return res.status(400).json({ error: 'funnel_name and current_step are required' });
    }

    const userId = req.userId || null;

    // Try to find existing funnel progress
    let query = supabase
      .from('funnel_progress')
      .select('*')
      .eq('funnel_name', funnel_name);

    if (userId) {
      query = query.eq('user_id', userId);
    } else if (anonymous_id) {
      query = query.eq('anonymous_id', anonymous_id);
    } else {
      return res.status(400).json({ error: 'user_id or anonymous_id required' });
    }

    const { data: existing } = await query.single();

    const now = new Date().toISOString();
    let stepsCompleted = existing?.steps_completed || [];

    if (step_completed && !stepsCompleted.includes(step_completed)) {
      stepsCompleted.push(step_completed);
    }

    const progressData = {
      user_id: userId,
      anonymous_id: userId ? null : anonymous_id,
      funnel_name,
      current_step,
      steps_completed: stepsCompleted,
      funnel_data: { ...(existing?.funnel_data || {}), ...funnel_data },
      updated_at: now,
      completed_at: completed ? now : (existing?.completed_at || null),
      abandoned_at: abandoned ? now : (existing?.abandoned_at || null)
    };

    if (existing) {
      const { error } = await supabase
        .from('funnel_progress')
        .update(progressData)
        .eq('id', existing.id);

      if (error) {
        logger.error('Failed to update funnel progress', { error: error.message, requestId: req.id });
        return res.status(200).json({ updated: false, reason: 'database_error' });
      }
    } else {
      progressData.started_at = now;
      const { error } = await supabase
        .from('funnel_progress')
        .insert(progressData);

      if (error) {
        logger.error('Failed to create funnel progress', { error: error.message, requestId: req.id });
        return res.status(200).json({ updated: false, reason: 'database_error' });
      }
    }

    logger.debug('Funnel progress updated', { funnel_name, current_step, userId, requestId: req.id });
    res.json({ updated: true });

  } catch (error) {
    logger.error('Funnel update error', { error: error.message, requestId: req.id });
    res.status(200).json({ updated: false, reason: 'server_error' });
  }
});

// ===========================================
// ADMIN ENDPOINTS
// ===========================================

/**
 * GET /api/analytics/admin/funnel/:name
 * Get funnel statistics (admin only)
 */
router.get('/admin/funnel/:name', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { name } = req.params;
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get all funnel progress for this funnel
    const { data: funnelData, error } = await supabase
      .from('funnel_progress')
      .select('*')
      .eq('funnel_name', name)
      .gte('started_at', startDate.toISOString());

    if (error) {
      logger.error('Error fetching funnel data', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to fetch funnel data' });
    }

    // Calculate stats
    const total = funnelData.length;
    const completed = funnelData.filter(f => f.completed_at).length;
    const abandoned = funnelData.filter(f => f.abandoned_at).length;
    const inProgress = total - completed - abandoned;

    // Step breakdown
    const stepCounts = {};
    funnelData.forEach(f => {
      (f.steps_completed || []).forEach(step => {
        stepCounts[step] = (stepCounts[step] || 0) + 1;
      });
    });

    // Current step distribution
    const currentStepCounts = {};
    funnelData.filter(f => !f.completed_at && !f.abandoned_at).forEach(f => {
      currentStepCounts[f.current_step] = (currentStepCounts[f.current_step] || 0) + 1;
    });

    res.json({
      funnel_name: name,
      period_days: parseInt(days),
      summary: {
        total_started: total,
        completed: completed,
        abandoned: abandoned,
        in_progress: inProgress,
        completion_rate: total > 0 ? ((completed / total) * 100).toFixed(1) : 0
      },
      steps_completed: stepCounts,
      current_step_distribution: currentStepCounts
    });

  } catch (error) {
    logger.error('Funnel stats error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/admin/events/summary
 * Get event summary statistics (admin only)
 */
router.get('/admin/events/summary', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { days = 7 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get event counts by category
    const { data: events, error } = await supabase
      .from('analytics_events')
      .select('event_category, event_name')
      .gte('created_at', startDate.toISOString());

    if (error) {
      logger.error('Error fetching events summary', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to fetch events' });
    }

    // Aggregate by category
    const byCategory = {};
    const byEvent = {};
    events.forEach(e => {
      byCategory[e.event_category] = (byCategory[e.event_category] || 0) + 1;
      byEvent[e.event_name] = (byEvent[e.event_name] || 0) + 1;
    });

    // Get unique users
    const { data: uniqueUsers, error: userError } = await supabase
      .from('analytics_events')
      .select('user_id')
      .gte('created_at', startDate.toISOString())
      .not('user_id', 'is', null);

    const uniqueUserIds = new Set(uniqueUsers?.map(u => u.user_id) || []);

    res.json({
      period_days: parseInt(days),
      total_events: events.length,
      unique_users: uniqueUserIds.size,
      events_by_category: byCategory,
      top_events: Object.entries(byEvent)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([name, count]) => ({ event: name, count }))
    });

  } catch (error) {
    logger.error('Events summary error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/admin/daily
 * Get daily activity stats (admin only)
 */
router.get('/admin/daily', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get daily event counts
    const { data: events, error } = await supabase
      .from('analytics_events')
      .select('created_at, event_category, user_id')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Error fetching daily stats', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to fetch daily stats' });
    }

    // Group by day
    const dailyStats = {};
    events.forEach(e => {
      const day = e.created_at.split('T')[0];
      if (!dailyStats[day]) {
        dailyStats[day] = { events: 0, users: new Set() };
      }
      dailyStats[day].events++;
      if (e.user_id) dailyStats[day].users.add(e.user_id);
    });

    // Convert to array
    const daily = Object.entries(dailyStats).map(([date, stats]) => ({
      date,
      events: stats.events,
      unique_users: stats.users.size
    }));

    res.json({ daily });

  } catch (error) {
    logger.error('Daily stats error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
