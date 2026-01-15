const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { supabase } = require('./services/supabase');
const { logger } = require('./services/logger');

// Generate SHA-256 hash of content
function generateContentHash(content) {
  // Content can be a URL, base64 string, or any identifier
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Get location from IP (reuse from age-verification)
async function getLocationFromIP(ip) {
  try {
    const cleanIP = ip === '::1' || ip === '127.0.0.1' ? '' : ip;
    const response = await fetch(`https://ipapi.co/${cleanIP}/json/`);
    const data = await response.json();
    return {
      country_code: data.country_code || null,
      region_code: data.region_code || null
    };
  } catch (error) {
    return { country_code: null, region_code: null };
  }
}

// POST /api/compliance/log-generation - Log a content generation for 2257 compliance
router.post('/log-generation', async (req, res) => {
  try {
    if (!supabase) {
      // If database not configured, just acknowledge (don't block generation)
      return res.json({ success: true, logged: false, reason: 'Database not configured' });
    }

    const {
      user_id,
      content_identifier, // URL or unique identifier of generated content
      content_type,       // 'image', 'video', 'audio'
      model_used,
      prompt,
      nsfw_mode,
      output_count
    } = req.body;

    // Get IP and user agent
    const ip = req.headers['x-forwarded-for']?.split(',')[0] ||
               req.headers['x-real-ip'] ||
               req.connection.remoteAddress ||
               req.ip;
    const userAgent = req.headers['user-agent'] || null;

    // Get location from IP
    const location = await getLocationFromIP(ip);

    // Generate content hash
    const contentHash = generateContentHash(content_identifier + Date.now().toString());

    // Insert record
    const { data, error } = await supabase
      .from('generation_records')
      .insert({
        user_id: user_id || null,
        content_hash: contentHash,
        content_type: content_type || 'image',
        model_used: model_used || 'unknown',
        prompt: prompt || null,
        nsfw_mode: nsfw_mode || false,
        output_url: content_identifier || null,
        output_count: output_count || 1,
        ip_address: ip,
        user_agent: userAgent,
        country_code: location.country_code,
        region_code: location.region_code
      })
      .select()
      .single();

    if (error) {
      logger.error('Error logging generation', { error: error.message });
      // Don't fail the request, just log the error
      return res.json({ success: true, logged: false, reason: error.message });
    }

    res.json({
      success: true,
      logged: true,
      record_id: data.id,
      content_hash: data.content_hash
    });

  } catch (error) {
    logger.error('Error in log-generation', { error: error.message });
    // Don't fail the request, just acknowledge
    res.json({ success: true, logged: false, reason: error.message });
  }
});

// GET /api/compliance/my-records - Get user's own generation records
router.get('/my-records', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    const userId = req.query.user_id;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    const { data, error, count } = await supabase
      .from('generation_records')
      .select('id, content_type, model_used, nsfw_mode, created_at, output_count', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      records: data,
      total: count,
      limit,
      offset
    });

  } catch (error) {
    logger.error('Error fetching records', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

// GET /api/compliance/stats - Get generation stats (admin only)
router.get('/stats', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    const userId = req.query.user_id;

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get stats
    const { data: stats, error } = await supabase
      .from('generation_records')
      .select('content_type, nsfw_mode, created_at')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // Last 30 days

    if (error) throw error;

    // Aggregate stats
    const summary = {
      total_generations: stats.length,
      by_type: {},
      nsfw_count: 0,
      safe_count: 0
    };

    stats.forEach(record => {
      // By type
      summary.by_type[record.content_type] = (summary.by_type[record.content_type] || 0) + 1;
      // By mode
      if (record.nsfw_mode) {
        summary.nsfw_count++;
      } else {
        summary.safe_count++;
      }
    });

    res.json({
      period: 'last_30_days',
      stats: summary
    });

  } catch (error) {
    logger.error('Error fetching stats', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
