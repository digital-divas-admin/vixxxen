/**
 * Trial Generation API
 * Allows unauthenticated users to try image generation with rate limiting
 */

const express = require('express');
const fetch = require('node-fetch');
const { supabase } = require('./services/supabase');
const { logger, logGeneration } = require('./services/logger');

const router = express.Router();

// Helper to mask IP addresses for logging (e.g., "192.168.1.100" -> "192.168.x.x")
function maskIp(ip) {
  if (!ip) return 'unknown';
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.x.x`;
  }
  // IPv6 or other format - just show first part
  return ip.substring(0, Math.min(ip.length, 10)) + '...';
}

// WaveSpeed API endpoint for Seedream 4.5
const WAVESPEED_TEXT2IMG_URL = 'https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5';

// Retry settings for rate limits
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000;

// Development bypass mode (only works in non-production)
const DEV_BYPASS_ENABLED = process.env.TRIAL_DEV_BYPASS === 'true' && process.env.NODE_ENV !== 'production';

if (DEV_BYPASS_ENABLED) {
  logger.warn('⚠️  TRIAL_DEV_BYPASS is enabled - rate limiting disabled for trials');
}

// Trial limits
const MAX_TRIALS_PER_USER = 2;        // Max generations per IP/fingerprint
const TRIAL_WINDOW_DAYS = 7;          // Reset window in days
const GLOBAL_DAILY_CAP = 500;         // Max total trial generations per day

// Demo character for trial (hardcoded for safe mode)
const DEMO_CHARACTER = {
  name: 'Luna',
  description: 'A friendly AI companion with flowing silver hair and bright blue eyes',
  trigger_word: 'luna_character',
  system_prompt: 'beautiful young woman with flowing silver hair and bright blue eyes, elegant, photorealistic, high quality'
};

/**
 * Get client IP address (handles proxies)
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
}

/**
 * Check if global daily cap is reached
 */
async function checkGlobalDailyCap() {
  if (!supabase) return { allowed: true, remaining: GLOBAL_DAILY_CAP };

  const today = new Date().toISOString().split('T')[0];

  try {
    // Get or create today's cap record
    let { data: capRecord, error } = await supabase
      .from('trial_daily_caps')
      .select('*')
      .eq('date', today)
      .single();

    if (error && error.code === 'PGRST116') {
      // Record doesn't exist, create it
      const { data: newRecord } = await supabase
        .from('trial_daily_caps')
        .insert({ date: today, total_generations: 0 })
        .select()
        .single();
      capRecord = newRecord;
    }

    if (!capRecord) {
      return { allowed: true, remaining: GLOBAL_DAILY_CAP };
    }

    const remaining = capRecord.max_allowed - capRecord.total_generations;
    return {
      allowed: remaining > 0,
      remaining: Math.max(0, remaining),
      total: capRecord.total_generations
    };
  } catch (error) {
    logger.error('Error checking global daily cap', { error: error.message });
    return { allowed: true, remaining: GLOBAL_DAILY_CAP };
  }
}

/**
 * Increment global daily cap counter
 */
async function incrementGlobalDailyCap() {
  if (!supabase) return;

  const today = new Date().toISOString().split('T')[0];

  try {
    await supabase.rpc('increment_trial_daily_cap', { target_date: today });
  } catch (error) {
    // Fallback to manual increment if RPC doesn't exist
    try {
      const { data } = await supabase
        .from('trial_daily_caps')
        .select('total_generations')
        .eq('date', today)
        .single();

      if (data) {
        await supabase
          .from('trial_daily_caps')
          .update({ total_generations: data.total_generations + 1 })
          .eq('date', today);
      }
    } catch (fallbackError) {
      logger.error('Error incrementing daily cap', { error: fallbackError.message });
    }
  }
}

/**
 * Get or create trial record for IP/fingerprint combination
 */
async function getTrialRecord(ipAddress, fingerprint) {
  if (!supabase) {
    return { generations_used: 0, isNew: true };
  }

  try {
    // Calculate the window start date
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - TRIAL_WINDOW_DAYS);

    // Look for existing record by IP and optionally fingerprint
    let query = supabase
      .from('trial_generations')
      .select('*')
      .eq('ip_address', ipAddress)
      .gte('created_at', windowStart.toISOString());

    // If fingerprint provided, also check by fingerprint
    if (fingerprint) {
      query = supabase
        .from('trial_generations')
        .select('*')
        .or(`ip_address.eq.${ipAddress},fingerprint.eq.${fingerprint}`)
        .gte('created_at', windowStart.toISOString());
    }

    const { data: records, error } = await query;

    if (error) {
      logger.error('Error fetching trial record', { error: error.message });
      return { generations_used: 0, isNew: true };
    }

    if (!records || records.length === 0) {
      return { generations_used: 0, isNew: true };
    }

    // Sum up generations from all matching records
    const totalGenerations = records.reduce((sum, r) => sum + (r.generations_used || 0), 0);

    // Return the most recent record for updating
    const mostRecent = records.sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    )[0];

    return {
      ...mostRecent,
      generations_used: totalGenerations,
      isNew: false
    };
  } catch (error) {
    logger.error('Error in getTrialRecord', { error: error.message });
    return { generations_used: 0, isNew: true };
  }
}

/**
 * Create or update trial record after generation
 */
async function updateTrialRecord(ipAddress, fingerprint, existingRecord) {
  if (!supabase) return;

  try {
    const now = new Date().toISOString();

    if (existingRecord.isNew) {
      // Create new record
      await supabase.from('trial_generations').insert({
        ip_address: ipAddress,
        fingerprint: fingerprint || null,
        generations_used: 1,
        first_generation_at: now,
        last_generation_at: now
      });
    } else {
      // Update existing record
      await supabase
        .from('trial_generations')
        .update({
          generations_used: (existingRecord.generations_used || 0) + 1,
          last_generation_at: now,
          fingerprint: fingerprint || existingRecord.fingerprint
        })
        .eq('id', existingRecord.id);
    }
  } catch (error) {
    logger.error('Error updating trial record', { error: error.message });
  }
}

/**
 * GET /api/trial/status
 * Check remaining trial generations for this client
 */
router.get('/status', async (req, res) => {
  try {
    // Check for admin bypass
    const adminKey = process.env.TRIAL_ADMIN_KEY;
    const authHeader = req.headers.authorization;
    const isAdminBypass = adminKey && authHeader === `Bearer ${adminKey}`;

    // If admin bypass is active, return unlimited trials
    if (isAdminBypass || DEV_BYPASS_ENABLED) {
      return res.json({
        remaining: 999,
        max: MAX_TRIALS_PER_USER,
        used: 0,
        canGenerate: true,
        bypass: true
      });
    }

    const ipAddress = getClientIp(req);
    const fingerprint = req.query.fingerprint;

    const trialRecord = await getTrialRecord(ipAddress, fingerprint);
    const remaining = Math.max(0, MAX_TRIALS_PER_USER - trialRecord.generations_used);

    res.json({
      remaining,
      max: MAX_TRIALS_PER_USER,
      used: trialRecord.generations_used,
      canGenerate: remaining > 0
    });
  } catch (error) {
    logger.error('Trial status error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to check trial status' });
  }
});

/**
 * GET /api/trial/demo-character
 * Get the demo character info for the trial modal
 */
router.get('/demo-character', (req, res) => {
  res.json({
    name: DEMO_CHARACTER.name,
    description: DEMO_CHARACTER.description,
    // Don't expose trigger_word or system_prompt to frontend
  });
});

/**
 * POST /api/trial/generate
 * Generate a trial image (no auth required, rate limited)
 */
router.post('/generate', async (req, res) => {
  try {
    const { prompt, fingerprint } = req.body;

    // Validation
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (prompt.length > 500) {
      return res.status(400).json({ error: 'Prompt too long (max 500 characters)' });
    }

    // Basic content filtering for trial (safe mode only)
    const unsafePatterns = [
      /\b(nude|naked|nsfw|explicit|porn|sex|xxx)\b/i,
      /\b(gore|blood|violence|death|kill)\b/i,
      /\b(child|minor|underage|kid|teen)\b/i
    ];

    for (const pattern of unsafePatterns) {
      if (pattern.test(prompt)) {
        return res.status(400).json({
          error: 'Trial mode is limited to safe content. Create a free account for full access.'
        });
      }
    }

    if (!process.env.WAVESPEED_API_KEY) {
      return res.status(500).json({ error: 'Generation service not configured' });
    }

    const ipAddress = getClientIp(req);

    // Check for admin bypass via Authorization header
    const adminKey = process.env.TRIAL_ADMIN_KEY;
    const authHeader = req.headers.authorization;
    const isAdminBypass = adminKey && authHeader === `Bearer ${adminKey}`;

    // Skip rate limiting in dev bypass mode OR admin bypass
    let trialRecord = { generations_used: 0, isNew: true };
    let remaining = MAX_TRIALS_PER_USER;
    const shouldBypassRateLimit = DEV_BYPASS_ENABLED || isAdminBypass;

    if (!shouldBypassRateLimit) {
      // Check global daily cap first
      const globalCap = await checkGlobalDailyCap();
      if (!globalCap.allowed) {
        return res.status(429).json({
          error: 'Trial generations are temporarily unavailable. Please try again tomorrow or create a free account.',
          code: 'GLOBAL_CAP_REACHED'
        });
      }

      // Check user's trial limit
      trialRecord = await getTrialRecord(ipAddress, fingerprint);
      remaining = MAX_TRIALS_PER_USER - trialRecord.generations_used;

      if (remaining <= 0) {
        return res.status(429).json({
          error: 'You\'ve used all your free trials. Create a free account to continue generating!',
          code: 'TRIAL_LIMIT_REACHED',
          remaining: 0
        });
      }
    } else {
      logger.info('Trial bypass: skipping rate limit check', { ip: maskIp(ipAddress), isAdmin: isAdminBypass });
    }

    logGeneration('trial', 'started', { ip: maskIp(ipAddress), promptLength: prompt.length, remaining: remaining - 1, requestId: req.id });

    // Build the generation prompt with demo character
    const fullPrompt = `${DEMO_CHARACTER.system_prompt}, ${prompt}. High quality, detailed, professional photography style.`;

    // Call WaveSpeed API with retry logic
    let response;
    let lastError;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        response = await fetch(WAVESPEED_TEXT2IMG_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prompt: fullPrompt,
            size: '1024*1024',
            enable_base64_output: true,
            enable_sync_mode: true
          })
        });

        if (response.status === 429 && attempt < MAX_RETRIES) {
          const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          logger.info(`Trial rate limited, retrying in ${backoffMs}ms`, { attempt: attempt + 1, requestId: req.id });
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }

        break;
      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES) {
          const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    if (!response) {
      throw lastError || new Error('Failed to connect to generation service');
    }

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Trial API error', { status: response.status, error: errorText, requestId: req.id });

      if (response.status === 429) {
        return res.status(429).json({ error: 'Service is busy. Please try again in a moment.' });
      }

      throw new Error(`Generation failed: ${response.status}`);
    }

    const result = await response.json();

    // Extract image from WaveSpeed response
    let imageUrl = null;

    // WaveSpeed sync mode returns images in data.outputs array
    if (result.data?.outputs && result.data.outputs.length > 0) {
      const output = result.data.outputs[0];
      if (typeof output === 'string') {
        // Data URL or URL string
        imageUrl = output;
      } else if (output.url) {
        imageUrl = output.url;
      } else if (output.base64) {
        imageUrl = `data:image/png;base64,${output.base64}`;
      }
    }

    // Fallback: check alternative response formats
    if (!imageUrl && result.data?.url) {
      imageUrl = result.data.url;
    }
    if (!imageUrl && result.data?.base64) {
      imageUrl = `data:image/png;base64,${result.data.base64}`;
    }
    if (!imageUrl && result.outputs && result.outputs.length > 0) {
      const output = result.outputs[0];
      if (typeof output === 'string') {
        imageUrl = output.startsWith('http') ? output : `data:image/png;base64,${output}`;
      }
    }

    if (!imageUrl) {
      logger.error('No image in WaveSpeed response', { response: JSON.stringify(result).substring(0, 500), requestId: req.id });
      throw new Error('No image in response');
    }

    // Update trial tracking (skip in bypass mode)
    if (!shouldBypassRateLimit) {
      await updateTrialRecord(ipAddress, fingerprint, trialRecord);
      await incrementGlobalDailyCap();
    }

    logGeneration('trial', 'completed', { requestId: req.id, bypass: shouldBypassRateLimit });

    res.json({
      success: true,
      image: imageUrl,
      remaining: remaining - 1,
      character: DEMO_CHARACTER.name
    });

  } catch (error) {
    logger.error('Trial generation error', { error: error.message, stack: error.stack, requestId: req.id });

    // Provide specific error messages based on error type
    let userMessage = 'Generation failed. Please try again.';
    let statusCode = 500;

    if (error.message?.includes('API key') || error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      userMessage = 'Image generation service not properly configured';
      statusCode = 503;
    } else if (error.message?.includes('429') || error.message?.includes('rate')) {
      userMessage = 'Service is busy. Please try again in a moment.';
      statusCode = 429;
    } else if (error.message?.includes('No image')) {
      userMessage = 'Image generation failed. Please try a different prompt.';
    }

    res.status(statusCode).json({
      error: userMessage,
      // Always include error details for debugging (remove in future if needed)
      debug: error.message
    });
  }
});

/**
 * POST /api/trial/track-conversion
 * Track when a trial user creates an account (called after signup)
 */
router.post('/track-conversion', async (req, res) => {
  try {
    const { userId, fingerprint } = req.body;
    const ipAddress = getClientIp(req);

    if (!supabase || !userId) {
      return res.json({ success: true });
    }

    // Update trial records to mark conversion
    await supabase
      .from('trial_generations')
      .update({ converted_to_user_id: userId })
      .or(`ip_address.eq.${ipAddress}${fingerprint ? `,fingerprint.eq.${fingerprint}` : ''}`);

    res.json({ success: true });
  } catch (error) {
    logger.error('Track conversion error', { error: error.message, requestId: req.id });
    res.json({ success: false });
  }
});

/**
 * POST /api/trial/analytics
 * Track trial funnel analytics events
 * Accepts beacon requests from frontend
 */
router.post('/analytics', express.text({ type: '*/*' }), async (req, res) => {
  try {
    // Parse JSON from text body (sendBeacon sends as text)
    let data;
    try {
      data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
      return res.status(200).send('ok'); // Don't fail on parse errors
    }

    const { event, fingerprint, timestamp } = data;
    const ipAddress = getClientIp(req);

    logger.info('Trial analytics event', { event, ip: maskIp(ipAddress) });

    // Could store analytics in Supabase here for reporting
    // For now, just log to console

    res.status(200).send('ok');
  } catch (error) {
    // Always return 200 for analytics - don't break user experience
    res.status(200).send('ok');
  }
});

/**
 * POST /api/trial/admin/reset
 * Reset trial records for testing/support purposes
 * Requires TRIAL_ADMIN_KEY in Authorization header
 */
router.post('/admin/reset', async (req, res) => {
  try {
    // Check admin key
    const adminKey = process.env.TRIAL_ADMIN_KEY;
    const authHeader = req.headers.authorization;

    if (!adminKey) {
      return res.status(503).json({ error: 'Admin endpoint not configured' });
    }

    if (!authHeader || authHeader !== `Bearer ${adminKey}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { ip, fingerprint, clearAll } = req.body;

    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    let deletedCount = 0;

    if (clearAll === true) {
      // Clear all trial records from the past 7 days
      const windowStart = new Date();
      windowStart.setDate(windowStart.getDate() - TRIAL_WINDOW_DAYS);

      const { data, error } = await supabase
        .from('trial_generations')
        .delete()
        .gte('created_at', windowStart.toISOString())
        .select();

      if (error) {
        throw error;
      }
      deletedCount = data?.length || 0;
      logger.info('Admin: cleared all recent trial records', { deletedCount });
    } else if (ip || fingerprint) {
      // Clear specific IP or fingerprint
      let query = supabase.from('trial_generations').delete();

      if (ip && fingerprint) {
        query = query.or(`ip_address.eq.${ip},fingerprint.eq.${fingerprint}`);
      } else if (ip) {
        query = query.eq('ip_address', ip);
      } else if (fingerprint) {
        query = query.eq('fingerprint', fingerprint);
      }

      const { data, error } = await query.select();

      if (error) {
        throw error;
      }
      deletedCount = data?.length || 0;
      logger.info('Admin: cleared trial records', { ip: ip ? maskIp(ip) : null, fingerprint: fingerprint ? '***' : null, deletedCount });
    } else {
      return res.status(400).json({ error: 'Provide ip, fingerprint, or clearAll: true' });
    }

    res.json({
      success: true,
      deletedCount,
      message: `Cleared ${deletedCount} trial record(s)`
    });
  } catch (error) {
    logger.error('Admin reset error', { error: error.message });
    res.status(500).json({ error: 'Failed to reset trial records' });
  }
});

/**
 * GET /api/trial/admin/status
 * Get trial system status (for debugging)
 * Requires TRIAL_ADMIN_KEY in Authorization header
 */
router.get('/admin/status', async (req, res) => {
  try {
    const adminKey = process.env.TRIAL_ADMIN_KEY;
    const authHeader = req.headers.authorization;

    if (!adminKey || !authHeader || authHeader !== `Bearer ${adminKey}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const globalCap = await checkGlobalDailyCap();

    res.json({
      devBypassEnabled: DEV_BYPASS_ENABLED,
      maxTrialsPerUser: MAX_TRIALS_PER_USER,
      trialWindowDays: TRIAL_WINDOW_DAYS,
      globalDailyCap: GLOBAL_DAILY_CAP,
      todayUsage: globalCap,
      wavespeedConfigured: !!process.env.WAVESPEED_API_KEY
    });
  } catch (error) {
    logger.error('Admin status error', { error: error.message });
    res.status(500).json({ error: 'Failed to get status' });
  }
});

module.exports = router;
