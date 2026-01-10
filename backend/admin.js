/**
 * Admin API Routes
 *
 * Protected endpoints for admin functionality.
 * All routes require admin authentication.
 */

const express = require('express');
const router = express.Router();
const { requireAdmin, supabase } = require('./middleware/auth');
const { getSetting, setSetting, getGpuConfig, DEFAULTS } = require('./services/settingsService');
const { checkDedicatedHealth } = require('./services/gpuRouter');

// All admin routes require admin authentication
router.use(requireAdmin);

/**
 * GET /api/admin/gpu-config
 * Get current GPU routing configuration
 */
router.get('/gpu-config', async (req, res) => {
  try {
    const config = await getGpuConfig();

    res.json({
      config,
      defaults: DEFAULTS.gpu_config,
      modes: ['serverless', 'dedicated', 'hybrid', 'serverless-primary']
    });
  } catch (error) {
    console.error('Admin GPU config fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch GPU config' });
  }
});

/**
 * POST /api/admin/gpu-config
 * Update GPU routing configuration
 */
router.post('/gpu-config', async (req, res) => {
  try {
    const { mode, dedicatedUrl, dedicatedTimeout, enabled } = req.body;

    // Validate mode
    const validModes = ['serverless', 'dedicated', 'hybrid', 'serverless-primary'];
    if (mode && !validModes.includes(mode)) {
      return res.status(400).json({
        error: 'Invalid mode',
        validModes
      });
    }

    // Get current config and merge with updates
    const currentConfig = await getGpuConfig();
    const newConfig = {
      ...currentConfig,
      ...(mode !== undefined && { mode }),
      ...(dedicatedUrl !== undefined && { dedicatedUrl }),
      ...(dedicatedTimeout !== undefined && { dedicatedTimeout: parseInt(dedicatedTimeout, 10) }),
      ...(enabled !== undefined && { enabled: Boolean(enabled) })
    };

    // Validate dedicatedUrl if provided
    if (newConfig.dedicatedUrl && !newConfig.dedicatedUrl.startsWith('http')) {
      return res.status(400).json({ error: 'dedicatedUrl must be a valid URL' });
    }

    // Validate timeout
    if (newConfig.dedicatedTimeout < 1000 || newConfig.dedicatedTimeout > 30000) {
      return res.status(400).json({ error: 'dedicatedTimeout must be between 1000 and 30000 ms' });
    }

    const success = await setSetting('gpu_config', newConfig);

    if (!success) {
      return res.status(500).json({ error: 'Failed to save GPU config' });
    }

    console.log(`🔧 Admin ${req.user.email} updated GPU config:`, newConfig);

    res.json({
      success: true,
      config: newConfig
    });
  } catch (error) {
    console.error('Admin GPU config update error:', error);
    res.status(500).json({ error: 'Failed to update GPU config' });
  }
});

/**
 * GET /api/admin/gpu-status
 * Get health status of GPU endpoints
 */
router.get('/gpu-status', async (req, res) => {
  try {
    const config = await getGpuConfig();

    const status = {
      mode: config.mode,
      serverless: {
        configured: !!(process.env.RUNPOD_API_KEY && process.env.RUNPOD_ENDPOINT_ID),
        endpoint: process.env.RUNPOD_ENDPOINT_ID
          ? `...${process.env.RUNPOD_ENDPOINT_ID.slice(-6)}`
          : null
      },
      dedicated: {
        configured: !!config.dedicatedUrl,
        url: config.dedicatedUrl ? new URL(config.dedicatedUrl).host : null,
        health: null
      }
    };

    // Check dedicated health if configured
    if (config.dedicatedUrl) {
      const health = await checkDedicatedHealth(config.dedicatedUrl);
      status.dedicated.health = health;
    }

    res.json(status);
  } catch (error) {
    console.error('Admin GPU status error:', error);
    res.status(500).json({ error: 'Failed to get GPU status' });
  }
});

/**
 * GET /api/admin/gpu-stats
 * Get GPU usage statistics (placeholder for future implementation)
 */
router.get('/gpu-stats', async (req, res) => {
  try {
    // TODO: Implement actual stats tracking
    // For now, return placeholder data
    res.json({
      period: '24h',
      stats: {
        totalJobs: 0,
        dedicatedJobs: 0,
        serverlessJobs: 0,
        fallbackEvents: 0,
        estimatedCost: {
          dedicated: 0,
          serverless: 0,
          total: 0
        }
      },
      message: 'Stats tracking not yet implemented'
    });
  } catch (error) {
    console.error('Admin GPU stats error:', error);
    res.status(500).json({ error: 'Failed to get GPU stats' });
  }
});

/**
 * POST /api/admin/gpu-test
 * Test connectivity to dedicated GPU endpoint
 */
router.post('/gpu-test', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (!url.startsWith('http')) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    console.log(`🧪 Admin ${req.user.email} testing GPU endpoint: ${url}`);

    const health = await checkDedicatedHealth(url);

    res.json({
      url,
      ...health,
      tested_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Admin GPU test error:', error);
    res.status(500).json({ error: 'Failed to test GPU endpoint' });
  }
});

/**
 * GET /api/admin/warmup-status
 * Check warmup/model loading status on dedicated GPU
 */
router.get('/warmup-status', async (req, res) => {
  try {
    const config = await getGpuConfig();

    if (!config.dedicatedUrl) {
      return res.json({
        gpuOnline: false,
        status: 'not_configured',
        message: 'No dedicated GPU configured'
      });
    }

    // Check if GPU is online
    const health = await checkDedicatedHealth(config.dedicatedUrl);

    if (!health.healthy) {
      return res.json({
        gpuOnline: false,
        status: 'offline',
        message: health.reason || 'Dedicated GPU is offline'
      });
    }

    // GPU is online - models are loaded if it's healthy (warmup runs on startup)
    res.json({
      gpuOnline: true,
      status: 'ready',
      queueDepth: health.queueDepth || 0,
      message: 'GPU online, models loaded'
    });
  } catch (error) {
    console.error('Warmup status error:', error);
    res.status(500).json({ error: 'Failed to check warmup status' });
  }
});

/**
 * POST /api/admin/warmup
 * Trigger model warmup on dedicated GPU
 */
router.post('/warmup', async (req, res) => {
  try {
    const config = await getGpuConfig();
    const { model = 'qwen' } = req.body;

    if (!config.dedicatedUrl) {
      return res.status(400).json({
        success: false,
        error: 'No dedicated GPU configured'
      });
    }

    console.log(`🔥 Admin ${req.user.email} triggering warmup for model: ${model}`);

    // Call the dedicated GPU's warmup endpoint
    const warmupUrl = `${config.dedicatedUrl}/warmup`;
    const response = await fetch(warmupUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Warmup request failed:', errorText);
      return res.status(500).json({
        success: false,
        error: 'Warmup request failed',
        details: errorText
      });
    }

    const result = await response.json();

    console.log(`✅ Warmup complete for ${model}:`, result);

    res.json({
      success: true,
      model,
      loadTimeSeconds: result.loadTimeSeconds,
      message: result.message || `${model} model loaded successfully`
    });
  } catch (error) {
    console.error('Warmup trigger error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to trigger warmup'
    });
  }
});

// ===========================================
// LoRA / Character Grant Management
// ===========================================

/**
 * GET /api/admin/users/search
 * Search for a user by email
 */
router.get('/users/search', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    // Search for user by email in profiles
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, email, display_name, plan, role, credits')
      .ilike('email', `%${email}%`)
      .limit(10);

    if (error) {
      console.error('User search error:', error);
      return res.status(500).json({ error: 'Failed to search users' });
    }

    res.json({ users: users || [] });
  } catch (error) {
    console.error('User search error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

/**
 * GET /api/admin/users/:userId/characters
 * Get characters owned by a user
 */
router.get('/users/:userId/characters', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    // Get user's owned character IDs
    const { data: userChars, error: userCharsError } = await supabase
      .from('user_characters')
      .select('id, character_id, purchased_at, amount_paid')
      .eq('user_id', userId);

    if (userCharsError) {
      console.error('Fetch user characters error:', userCharsError);
      return res.status(500).json({ error: 'Failed to fetch owned characters' });
    }

    if (!userChars || userChars.length === 0) {
      return res.json({ ownedCharacters: [], userId });
    }

    // Get character details for owned characters
    const characterIds = userChars.map(uc => uc.character_id);
    const { data: characters, error: charsError } = await supabase
      .from('marketplace_characters')
      .select('id, name, category, image_url, lora_url')
      .in('id', characterIds);

    if (charsError) {
      console.error('Fetch character details error:', charsError);
      return res.status(500).json({ error: 'Failed to fetch character details' });
    }

    // Combine the data
    const charMap = {};
    (characters || []).forEach(c => { charMap[c.id] = c; });

    const ownedCharacters = userChars.map(uc => ({
      id: uc.id,
      purchased_at: uc.purchased_at,
      amount_paid: uc.amount_paid,
      character: charMap[uc.character_id] || { id: uc.character_id, name: 'Unknown', category: 'Unknown' }
    }));

    res.json({
      ownedCharacters,
      userId
    });
  } catch (error) {
    console.error('Fetch owned characters error:', error);
    res.status(500).json({ error: 'Failed to fetch owned characters' });
  }
});

/**
 * GET /api/admin/characters
 * Get all available characters/LoRAs
 */
router.get('/characters', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { data: characters, error } = await supabase
      .from('marketplace_characters')
      .select('id, name, category, image_url, lora_url, price')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Fetch characters error:', error);
      return res.status(500).json({ error: 'Failed to fetch characters' });
    }

    res.json({ characters: characters || [] });
  } catch (error) {
    console.error('Fetch characters error:', error);
    res.status(500).json({ error: 'Failed to fetch characters' });
  }
});

/**
 * POST /api/admin/grant-character
 * Grant a user access to a character/LoRA
 */
router.post('/grant-character', async (req, res) => {
  try {
    const { userId, characterId } = req.body;

    if (!userId || !characterId) {
      return res.status(400).json({ error: 'userId and characterId are required' });
    }

    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    // Check if already granted
    const { data: existing } = await supabase
      .from('user_characters')
      .select('id')
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'User already has access to this character' });
    }

    // Grant access (amount_paid = 0 indicates admin grant)
    const { data, error } = await supabase
      .from('user_characters')
      .insert({
        user_id: userId,
        character_id: characterId,
        amount_paid: 0
      })
      .select()
      .single();

    if (error) {
      console.error('Grant character error:', error);
      return res.status(500).json({ error: 'Failed to grant character access' });
    }

    console.log(`🎁 Admin ${req.user.email} granted character ${characterId} to user ${userId}`);

    res.json({
      success: true,
      message: 'Character access granted',
      grant: data
    });
  } catch (error) {
    console.error('Grant character error:', error);
    res.status(500).json({ error: 'Failed to grant character access' });
  }
});

/**
 * POST /api/admin/revoke-character
 * Revoke a user's access to a character/LoRA
 */
router.post('/revoke-character', async (req, res) => {
  try {
    const { userId, characterId } = req.body;

    if (!userId || !characterId) {
      return res.status(400).json({ error: 'userId and characterId are required' });
    }

    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { error } = await supabase
      .from('user_characters')
      .delete()
      .eq('user_id', userId)
      .eq('character_id', characterId);

    if (error) {
      console.error('Revoke character error:', error);
      return res.status(500).json({ error: 'Failed to revoke character access' });
    }

    console.log(`🚫 Admin ${req.user.email} revoked character ${characterId} from user ${userId}`);

    res.json({
      success: true,
      message: 'Character access revoked'
    });
  } catch (error) {
    console.error('Revoke character error:', error);
    res.status(500).json({ error: 'Failed to revoke character access' });
  }
});

/**
 * POST /api/admin/gift-credits
 * Gift credits to a user (shows as 'gift' type in their transaction history)
 */
router.post('/gift-credits', async (req, res) => {
  try {
    const { userId, amount, reason } = req.body;

    if (!userId || !amount || !reason) {
      return res.status(400).json({ error: 'userId, amount, and reason are required' });
    }

    const creditAmount = parseInt(amount);
    if (isNaN(creditAmount) || creditAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    // Get admin info for the transaction record
    const adminEmail = req.user?.email || 'Unknown Admin';

    // Update user's credits
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    const newBalance = (profile.credits || 0) + creditAmount;

    // Update credits
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ credits: newBalance, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (updateError) {
      console.error('Update credits error:', updateError);
      return res.status(500).json({ error: 'Failed to update credits' });
    }

    // Create transaction record
    const { error: transactionError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        type: 'gift',
        amount: creditAmount,
        description: `Gift: ${reason}`,
        metadata: {
          gift: true,
          admin_email: adminEmail,
          reason: reason
        }
      });

    if (transactionError) {
      console.error('Transaction record error:', transactionError);
      // Credits were updated but transaction failed - log it but don't fail the request
    }

    console.log(`🎁 Admin ${adminEmail} gifted ${creditAmount} credits to user ${userId}: ${reason}`);

    res.json({
      success: true,
      message: `Gifted ${creditAmount} credits`,
      newBalance: newBalance
    });
  } catch (error) {
    console.error('Gift credits error:', error);
    res.status(500).json({ error: 'Failed to gift credits' });
  }
});

module.exports = router;
