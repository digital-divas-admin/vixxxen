/**
 * Trial Generation API
 * Allows unauthenticated users to try image generation with rate limiting
 */

const express = require('express');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const { logger, logGeneration, maskIp } = require('./services/logger');

const router = express.Router();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
}

// OpenRouter API endpoint
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const SEEDREAM_MODEL = 'bytedance-seed/seedream-4.5';

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

    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({ error: 'Generation service not configured' });
    }

    const ipAddress = getClientIp(req);

    // Check global daily cap first
    const globalCap = await checkGlobalDailyCap();
    if (!globalCap.allowed) {
      return res.status(429).json({
        error: 'Trial generations are temporarily unavailable. Please try again tomorrow or create a free account.',
        code: 'GLOBAL_CAP_REACHED'
      });
    }

    // Check user's trial limit
    const trialRecord = await getTrialRecord(ipAddress, fingerprint);
    const remaining = MAX_TRIALS_PER_USER - trialRecord.generations_used;

    if (remaining <= 0) {
      return res.status(429).json({
        error: 'You\'ve used all your free trials. Create a free account to continue generating!',
        code: 'TRIAL_LIMIT_REACHED',
        remaining: 0
      });
    }

    logGeneration('trial', 'started', { ip: maskIp(ipAddress), promptLength: prompt.length, remaining: remaining - 1, requestId: req.id });

    // Build the generation prompt with demo character
    const fullPrompt = `${DEMO_CHARACTER.system_prompt}, ${prompt}. High quality, detailed, professional photography style.`;

    // Call OpenRouter API
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.FRONTEND_URL || 'https://www.digitaldivas.ai',
        'X-Title': 'DivaForge Trial'
      },
      body: JSON.stringify({
        model: SEEDREAM_MODEL,
        messages: [{ role: 'user', content: fullPrompt }],
        modalities: ['image', 'text']
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Trial API error', { status: response.status, error: errorText, requestId: req.id });

      if (response.status === 429) {
        return res.status(429).json({ error: 'Service is busy. Please try again in a moment.' });
      }

      throw new Error(`Generation failed: ${response.status}`);
    }

    const result = await response.json();

    // Extract image from response
    let imageUrl = null;
    const message = result.choices[0]?.message;

    // Method 1: Check message.images array
    if (message?.images && message.images.length > 0) {
      imageUrl = message.images[0].image_url?.url || message.images[0].url;
    }

    // Method 2: Check content as array of parts
    if (!imageUrl && Array.isArray(message?.content)) {
      for (const part of message.content) {
        if (part.inline_data?.data) {
          const mimeType = part.inline_data.mime_type || 'image/png';
          imageUrl = `data:${mimeType};base64,${part.inline_data.data}`;
          break;
        }
        if (part.type === 'image_url' && part.image_url?.url) {
          imageUrl = part.image_url.url;
          break;
        }
      }
    }

    // Method 3: Check content as string for base64 data
    if (!imageUrl && message?.content && typeof message.content === 'string') {
      const base64Match = message.content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
      if (base64Match) {
        imageUrl = base64Match[0];
      }
    }

    if (!imageUrl) {
      // Check if content was filtered
      if (result.choices[0]?.finish_reason === 'content_filter') {
        return res.status(400).json({
          error: 'Content was filtered. Please try a different prompt.'
        });
      }
      throw new Error('No image in response');
    }

    // Update trial tracking
    await updateTrialRecord(ipAddress, fingerprint, trialRecord);
    await incrementGlobalDailyCap();

    logGeneration('trial', 'completed', { requestId: req.id });

    res.json({
      success: true,
      image: imageUrl,
      remaining: remaining - 1,
      character: DEMO_CHARACTER.name
    });

  } catch (error) {
    logger.error('Trial generation error', { error: error.message, requestId: req.id });
    res.status(500).json({
      error: 'Generation failed. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
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

module.exports = router;
