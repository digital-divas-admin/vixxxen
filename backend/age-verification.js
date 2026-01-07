const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./middleware/auth');

// Lazy initialization of Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
}

// Restricted regions that block NSFW content
const RESTRICTED_REGIONS = {
  US: ['TX', 'UT', 'LA', 'VA', 'MS', 'AR', 'MT', 'NC', 'ID']
};

// Get user's location from IP
async function getLocationFromIP(ip) {
  try {
    // Use ipapi.co for free IP geolocation (1000 requests/day free)
    // In production, consider MaxMind or IPinfo for better accuracy
    const cleanIP = ip === '::1' || ip === '127.0.0.1' ? '' : ip;
    const response = await fetch(`https://ipapi.co/${cleanIP}/json/`);
    const data = await response.json();

    return {
      country_code: data.country_code || 'US',
      region_code: data.region_code || '',
      ip_address: ip
    };
  } catch (error) {
    console.error('Error getting location from IP:', error);
    // Default to non-restricted if geolocation fails
    return {
      country_code: 'US',
      region_code: 'CA',
      ip_address: ip
    };
  }
}

// Check if region is restricted
function isRegionRestricted(countryCode, regionCode) {
  const restrictedRegions = RESTRICTED_REGIONS[countryCode];
  if (!restrictedRegions) return false;
  return restrictedRegions.includes(regionCode);
}

// GET /api/age-verification/status - Check if user is verified
router.get('/status', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured', verified: false });
    }

    // Use verified user ID from auth middleware
    const userId = req.userId;

    const { data, error } = await supabase
      .from('age_verifications')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    res.json({
      verified: data?.verified || false,
      method: data?.method || null,
      verification: data || null
    });
  } catch (error) {
    console.error('Error checking verification status:', error);
    res.status(500).json({ error: 'Failed to check verification status' });
  }
});

// GET /api/age-verification/check-location - Check user's location and restriction status
router.get('/check-location', async (req, res) => {
  try {
    // Get IP from request (handle proxies)
    const ip = req.headers['x-forwarded-for']?.split(',')[0] ||
               req.headers['x-real-ip'] ||
               req.connection.remoteAddress ||
               req.ip;

    const location = await getLocationFromIP(ip);
    const restricted = isRegionRestricted(location.country_code, location.region_code);

    res.json({
      country_code: location.country_code,
      region_code: location.region_code,
      restricted: restricted,
      message: restricted
        ? 'NSFW content is not available in your region due to local regulations.'
        : null
    });
  } catch (error) {
    console.error('Error checking location:', error);
    res.status(500).json({ error: 'Failed to check location' });
  }
});

// POST /api/age-verification/verify - Submit age verification
router.post('/verify', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    // Use verified user ID from auth middleware
    const userId = req.userId;
    const { confirmed } = req.body;

    if (!confirmed) {
      return res.status(400).json({ error: 'Age confirmation required' });
    }

    // Get user's location
    const ip = req.headers['x-forwarded-for']?.split(',')[0] ||
               req.headers['x-real-ip'] ||
               req.connection.remoteAddress ||
               req.ip;

    const location = await getLocationFromIP(ip);
    const restricted = isRegionRestricted(location.country_code, location.region_code);

    if (restricted) {
      // User is in a restricted region - block verification
      const { data, error } = await supabase
        .from('age_verifications')
        .upsert({
          user_id: userId,
          verified: false,
          method: 'blocked',
          country_code: location.country_code,
          region_code: location.region_code,
          ip_address: location.ip_address,
          verified_at: new Date().toISOString()
        }, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) throw error;

      return res.json({
        success: false,
        verified: false,
        blocked: true,
        message: 'NSFW content is not available in your region due to local regulations.',
        verification: data
      });
    }

    // User is in allowed region - verify
    const { data, error } = await supabase
      .from('age_verifications')
      .upsert({
        user_id: userId,
        verified: true,
        method: 'self_declaration',
        country_code: location.country_code,
        region_code: location.region_code,
        ip_address: location.ip_address,
        verified_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      verified: true,
      blocked: false,
      verification: data
    });
  } catch (error) {
    console.error('Error submitting verification:', error);
    res.status(500).json({ error: 'Failed to submit verification' });
  }
});

// PUT /api/age-verification/content-mode - Update user's content mode preference
router.put('/content-mode', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    // Use verified user ID from auth middleware
    const userId = req.userId;
    const { content_mode } = req.body;

    if (!['safe', 'nsfw'].includes(content_mode)) {
      return res.status(400).json({ error: 'Invalid content mode' });
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ content_mode: content_mode })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      content_mode: data.content_mode
    });
  } catch (error) {
    console.error('Error updating content mode:', error);
    res.status(500).json({ error: 'Failed to update content mode' });
  }
});

module.exports = router;
