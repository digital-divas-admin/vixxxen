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
    'generation_shared',
    // First-time generation milestones
    'first_generation_attempted',
    'first_generation_success',
    'first_generation_failure'
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
    'credits_purchased',
    // Paywall tracking
    'paywall_viewed',
    'paywall_dismissed',
    'paywall_clicked_upgrade'
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
    'modal_closed',
    // Value moment tracking
    'value_moment_reached',
    'feature_discovered',
    'content_downloaded',
    'content_saved',
    'content_shared',
    'return_visit',
    'scroll_depth',
    'time_on_section'
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
 * Lookup geolocation from IP address using ip-api.com (free tier)
 * Rate limit: 45 requests/minute
 */
async function lookupGeoIp(ip) {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return null; // Skip local/private IPs
  }

  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,city,lat,lon`);
    const data = await response.json();

    if (data.status === 'success') {
      return {
        country: data.country,
        country_code: data.countryCode,
        region: data.region,
        city: data.city,
        latitude: data.lat,
        longitude: data.lon
      };
    }
    return null;
  } catch (error) {
    logger.warn('Geo lookup failed', { ip, error: error.message });
    return null;
  }
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
 * POST /api/analytics/session/start
 * Start a new session
 */
router.post('/session/start', optionalAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(200).json({ tracked: false, reason: 'database_not_configured' });
    }

    const { session_id, anonymous_id, page_url, referrer } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }

    // Check if session already exists
    const { data: existing } = await supabase
      .from('user_sessions')
      .select('id')
      .eq('session_id', session_id)
      .single();

    if (existing) {
      return res.json({ tracked: true, existing: true });
    }

    // Get client IP and lookup geolocation
    const clientIp = getClientIp(req);
    const geoData = await lookupGeoIp(clientIp);

    const sessionRecord = {
      user_id: req.userId || null,
      anonymous_id: anonymous_id || null,
      session_id,
      started_at: new Date().toISOString(),
      first_page: page_url,
      last_page: page_url,
      referrer,
      user_agent: req.headers['user-agent'],
      ip_hash: hashIp(clientIp),
      // Geo data
      country: geoData?.country || null,
      country_code: geoData?.country_code || null,
      city: geoData?.city || null,
      region: geoData?.region || null,
      latitude: geoData?.latitude || null,
      longitude: geoData?.longitude || null
    };

    const { error } = await supabase
      .from('user_sessions')
      .insert(sessionRecord);

    if (error) {
      logger.error('Failed to start session', { error: error.message, requestId: req.id });
      return res.status(200).json({ tracked: false, reason: 'database_error' });
    }

    res.json({ tracked: true });
  } catch (error) {
    logger.error('Session start error', { error: error.message, requestId: req.id });
    res.status(200).json({ tracked: false, reason: 'server_error' });
  }
});

/**
 * POST /api/analytics/session/heartbeat
 * Update session activity (called periodically)
 */
router.post('/session/heartbeat', optionalAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(200).json({ updated: false });
    }

    const { session_id, page_url, events_count } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }

    const now = new Date().toISOString();

    const { error } = await supabase
      .from('user_sessions')
      .update({
        ended_at: now,
        last_page: page_url || undefined,
        events_count: events_count || undefined,
        page_views: supabase.raw('page_views + 1')
      })
      .eq('session_id', session_id);

    if (error) {
      logger.debug('Session heartbeat error', { error: error.message });
    }

    res.json({ updated: !error });
  } catch (error) {
    res.status(200).json({ updated: false });
  }
});

/**
 * POST /api/analytics/session/end
 * End a session
 */
router.post('/session/end', optionalAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(200).json({ ended: false });
    }

    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }

    // Get session start time to calculate duration
    const { data: session } = await supabase
      .from('user_sessions')
      .select('started_at')
      .eq('session_id', session_id)
      .single();

    if (!session) {
      return res.json({ ended: false, reason: 'session_not_found' });
    }

    const endedAt = new Date();
    const startedAt = new Date(session.started_at);
    const durationSeconds = Math.floor((endedAt - startedAt) / 1000);

    const { error } = await supabase
      .from('user_sessions')
      .update({
        ended_at: endedAt.toISOString(),
        duration_seconds: durationSeconds
      })
      .eq('session_id', session_id);

    res.json({ ended: !error, duration_seconds: durationSeconds });
  } catch (error) {
    res.status(200).json({ ended: false });
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

/**
 * GET /api/analytics/admin/sessions
 * Get session statistics (admin only)
 */
router.get('/admin/sessions', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get session data
    const { data: sessions, error } = await supabase
      .from('user_sessions')
      .select('duration_seconds, page_views, started_at, user_id')
      .gte('started_at', startDate.toISOString());

    if (error) {
      logger.error('Error fetching sessions', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to fetch sessions' });
    }

    // Calculate stats
    const totalSessions = sessions.length;
    const completedSessions = sessions.filter(s => s.duration_seconds != null);
    const durations = completedSessions.map(s => s.duration_seconds).filter(d => d > 0);

    const avgDuration = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

    const medianDuration = durations.length > 0
      ? durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)]
      : 0;

    const totalPageViews = sessions.reduce((sum, s) => sum + (s.page_views || 1), 0);
    const avgPageViews = totalSessions > 0
      ? (totalPageViews / totalSessions).toFixed(1)
      : 0;

    // Unique users
    const uniqueUsers = new Set(sessions.filter(s => s.user_id).map(s => s.user_id)).size;

    // Duration distribution
    const durationBuckets = {
      '0-30s': 0,
      '30s-2m': 0,
      '2m-5m': 0,
      '5m-15m': 0,
      '15m-30m': 0,
      '30m+': 0
    };

    durations.forEach(d => {
      if (d <= 30) durationBuckets['0-30s']++;
      else if (d <= 120) durationBuckets['30s-2m']++;
      else if (d <= 300) durationBuckets['2m-5m']++;
      else if (d <= 900) durationBuckets['5m-15m']++;
      else if (d <= 1800) durationBuckets['15m-30m']++;
      else durationBuckets['30m+']++;
    });

    res.json({
      period_days: parseInt(days),
      total_sessions: totalSessions,
      unique_users: uniqueUsers,
      avg_duration_seconds: avgDuration,
      median_duration_seconds: medianDuration,
      avg_page_views: parseFloat(avgPageViews),
      total_page_views: totalPageViews,
      duration_distribution: durationBuckets
    });

  } catch (error) {
    logger.error('Sessions stats error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/admin/retention
 * Get retention cohort analysis (admin only)
 */
router.get('/admin/retention', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { weeks = 8 } = req.query;

    // Get users grouped by signup week
    const { data: users, error: userError } = await supabase
      .from('profiles')
      .select('id, created_at')
      .gte('created_at', new Date(Date.now() - parseInt(weeks) * 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: true });

    if (userError) {
      logger.error('Error fetching users for retention', { error: userError.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to fetch retention data' });
    }

    // Get all events for these users
    const userIds = users.map(u => u.id);
    const { data: events, error: eventError } = await supabase
      .from('analytics_events')
      .select('user_id, created_at')
      .in('user_id', userIds);

    if (eventError) {
      logger.error('Error fetching events for retention', { error: eventError.message, requestId: req.id });
    }

    // Build user activity map
    const userActivity = {};
    (events || []).forEach(e => {
      if (!userActivity[e.user_id]) {
        userActivity[e.user_id] = new Set();
      }
      userActivity[e.user_id].add(e.created_at.split('T')[0]);
    });

    // Group users by signup week and calculate retention
    const cohorts = [];
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    for (let w = 0; w < parseInt(weeks); w++) {
      const weekStart = new Date(Date.now() - (w + 1) * weekMs);
      const weekEnd = new Date(Date.now() - w * weekMs);

      const cohortUsers = users.filter(u => {
        const signupDate = new Date(u.created_at);
        return signupDate >= weekStart && signupDate < weekEnd;
      });

      if (cohortUsers.length === 0) continue;

      const retention = {
        week_start: weekStart.toISOString().split('T')[0],
        total_users: cohortUsers.length,
        day_1: 0,
        day_7: 0,
        day_14: 0,
        day_30: 0
      };

      cohortUsers.forEach(u => {
        const signupDate = new Date(u.created_at);
        const activity = userActivity[u.id] || new Set();

        // Check each retention period
        [1, 7, 14, 30].forEach(day => {
          const checkDate = new Date(signupDate.getTime() + day * 24 * 60 * 60 * 1000);
          const checkDateStr = checkDate.toISOString().split('T')[0];

          // Check if user was active on or after that day
          for (const activityDate of activity) {
            if (activityDate >= checkDateStr) {
              retention[`day_${day}`]++;
              break;
            }
          }
        });
      });

      // Convert to percentages
      retention.day_1_pct = ((retention.day_1 / retention.total_users) * 100).toFixed(1);
      retention.day_7_pct = ((retention.day_7 / retention.total_users) * 100).toFixed(1);
      retention.day_14_pct = ((retention.day_14 / retention.total_users) * 100).toFixed(1);
      retention.day_30_pct = ((retention.day_30 / retention.total_users) * 100).toFixed(1);

      cohorts.push(retention);
    }

    // Calculate overall averages
    const totals = cohorts.reduce((acc, c) => ({
      users: acc.users + c.total_users,
      day_1: acc.day_1 + c.day_1,
      day_7: acc.day_7 + c.day_7,
      day_14: acc.day_14 + c.day_14,
      day_30: acc.day_30 + c.day_30
    }), { users: 0, day_1: 0, day_7: 0, day_14: 0, day_30: 0 });

    res.json({
      period_weeks: parseInt(weeks),
      cohorts: cohorts.reverse(),
      overall: {
        total_users: totals.users,
        day_1_retention: totals.users > 0 ? ((totals.day_1 / totals.users) * 100).toFixed(1) : 0,
        day_7_retention: totals.users > 0 ? ((totals.day_7 / totals.users) * 100).toFixed(1) : 0,
        day_14_retention: totals.users > 0 ? ((totals.day_14 / totals.users) * 100).toFixed(1) : 0,
        day_30_retention: totals.users > 0 ? ((totals.day_30 / totals.users) * 100).toFixed(1) : 0
      }
    });

  } catch (error) {
    logger.error('Retention analysis error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/admin/alerts
 * Get all configured alerts (admin only)
 */
router.get('/admin/alerts', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { data: alerts, error } = await supabase
      .from('analytics_alerts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching alerts', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to fetch alerts' });
    }

    // Get recent triggered alerts
    const { data: recentTriggers } = await supabase
      .from('analytics_alert_history')
      .select('*, analytics_alerts(name)')
      .order('triggered_at', { ascending: false })
      .limit(20);

    res.json({
      alerts: alerts || [],
      recent_triggers: recentTriggers || []
    });

  } catch (error) {
    logger.error('Alerts fetch error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/analytics/admin/alerts
 * Create a new alert (admin only)
 */
router.post('/admin/alerts', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { name, description, metric_type, condition, threshold, check_interval = 'daily' } = req.body;

    if (!name || !metric_type || !condition || threshold === undefined) {
      return res.status(400).json({ error: 'name, metric_type, condition, and threshold are required' });
    }

    const validMetrics = ['conversion_rate', 'daily_signups', 'daily_events', 'avg_session_duration', 'onboarding_completion', 'trial_conversion'];
    if (!validMetrics.includes(metric_type)) {
      return res.status(400).json({ error: `Invalid metric_type. Must be one of: ${validMetrics.join(', ')}` });
    }

    const validConditions = ['below', 'above', 'equals'];
    if (!validConditions.includes(condition)) {
      return res.status(400).json({ error: `Invalid condition. Must be one of: ${validConditions.join(', ')}` });
    }

    const { data, error } = await supabase
      .from('analytics_alerts')
      .insert({
        name,
        description,
        metric_type,
        condition,
        threshold,
        check_interval,
        created_by: req.userId
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating alert', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to create alert' });
    }

    res.json({ alert: data });

  } catch (error) {
    logger.error('Alert creation error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/analytics/admin/alerts/:id
 * Update an alert (admin only)
 */
router.put('/admin/alerts/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { id } = req.params;
    const { name, description, metric_type, condition, threshold, check_interval, is_active } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (metric_type !== undefined) updates.metric_type = metric_type;
    if (condition !== undefined) updates.condition = condition;
    if (threshold !== undefined) updates.threshold = threshold;
    if (check_interval !== undefined) updates.check_interval = check_interval;
    if (is_active !== undefined) updates.is_active = is_active;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('analytics_alerts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating alert', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to update alert' });
    }

    res.json({ alert: data });

  } catch (error) {
    logger.error('Alert update error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/analytics/admin/alerts/:id
 * Delete an alert (admin only)
 */
router.delete('/admin/alerts/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { id } = req.params;

    const { error } = await supabase
      .from('analytics_alerts')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Error deleting alert', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to delete alert' });
    }

    res.json({ deleted: true });

  } catch (error) {
    logger.error('Alert deletion error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/analytics/admin/alerts/:id/acknowledge
 * Acknowledge a triggered alert (admin only)
 */
router.post('/admin/alerts/:id/acknowledge', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { id } = req.params;

    const { error } = await supabase
      .from('analytics_alert_history')
      .update({
        acknowledged: true,
        acknowledged_by: req.userId,
        acknowledged_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      logger.error('Error acknowledging alert', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to acknowledge alert' });
    }

    res.json({ acknowledged: true });

  } catch (error) {
    logger.error('Alert acknowledge error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/admin/report/generate
 * Generate an analytics report (admin only)
 */
router.get('/admin/report/generate', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { type = 'daily_summary', days = 7 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    const endDate = new Date();

    // Gather all report data
    const reportData = {
      generated_at: new Date().toISOString(),
      period: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
        days: parseInt(days)
      }
    };

    // Get events summary
    const { data: events } = await supabase
      .from('analytics_events')
      .select('event_category, event_name, user_id')
      .gte('created_at', startDate.toISOString());

    const eventsByCategory = {};
    const uniqueUsers = new Set();
    (events || []).forEach(e => {
      eventsByCategory[e.event_category] = (eventsByCategory[e.event_category] || 0) + 1;
      if (e.user_id) uniqueUsers.add(e.user_id);
    });

    reportData.events = {
      total: (events || []).length,
      unique_users: uniqueUsers.size,
      by_category: eventsByCategory
    };

    // Get funnel data
    const { data: funnels } = await supabase
      .from('funnel_progress')
      .select('funnel_name, completed_at, abandoned_at')
      .gte('started_at', startDate.toISOString());

    const funnelStats = {};
    (funnels || []).forEach(f => {
      if (!funnelStats[f.funnel_name]) {
        funnelStats[f.funnel_name] = { started: 0, completed: 0, abandoned: 0 };
      }
      funnelStats[f.funnel_name].started++;
      if (f.completed_at) funnelStats[f.funnel_name].completed++;
      if (f.abandoned_at) funnelStats[f.funnel_name].abandoned++;
    });

    Object.keys(funnelStats).forEach(name => {
      const stats = funnelStats[name];
      stats.completion_rate = stats.started > 0
        ? ((stats.completed / stats.started) * 100).toFixed(1)
        : 0;
    });

    reportData.funnels = funnelStats;

    // Get new users
    const { data: newUsers } = await supabase
      .from('profiles')
      .select('id')
      .gte('created_at', startDate.toISOString());

    reportData.new_users = (newUsers || []).length;

    // Get session stats if available
    const { data: sessions } = await supabase
      .from('user_sessions')
      .select('duration_seconds')
      .gte('started_at', startDate.toISOString());

    if (sessions && sessions.length > 0) {
      const durations = sessions.map(s => s.duration_seconds).filter(d => d && d > 0);
      reportData.sessions = {
        total: sessions.length,
        avg_duration_seconds: durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : 0
      };
    }

    res.json(reportData);

  } catch (error) {
    logger.error('Report generation error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/admin/live-users
 * Get currently active users with geo data (for admin dashboard)
 * Active = heartbeat within last 60 seconds
 */
router.get('/admin/live-users', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    // Sessions active within the last 60 seconds
    const activeThreshold = new Date(Date.now() - 60 * 1000).toISOString();

    const { data: sessions, error } = await supabase
      .from('user_sessions')
      .select('session_id, user_id, country, country_code, city, region, latitude, longitude, last_page, last_seen_at')
      .is('ended_at', null)
      .gte('last_seen_at', activeThreshold)
      .order('last_seen_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch live users', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to fetch live users' });
    }

    // Group by country
    const byCountry = {};
    const users = [];

    for (const session of sessions || []) {
      const countryCode = session.country_code || 'XX';
      const country = session.country || 'Unknown';

      if (!byCountry[countryCode]) {
        byCountry[countryCode] = {
          country,
          country_code: countryCode,
          count: 0
        };
      }
      byCountry[countryCode].count++;

      users.push({
        session_id: session.session_id,
        is_registered: !!session.user_id,
        country: country,
        country_code: countryCode,
        city: session.city,
        region: session.region,
        latitude: session.latitude,
        longitude: session.longitude,
        current_page: session.last_page,
        last_activity: session.last_seen_at
      });
    }

    res.json({
      total: users.length,
      by_country: Object.values(byCountry).sort((a, b) => b.count - a.count),
      users
    });

  } catch (error) {
    logger.error('Live users error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
