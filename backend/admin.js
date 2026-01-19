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
const { logger, logAdminAction, maskEmail, maskUserId } = require('./services/logger');

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
    logger.error('Admin GPU config fetch error', { error: error.message, requestId: req.id });
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

    logAdminAction(req.user.email, 'Updated GPU config', { mode: newConfig.mode });

    res.json({
      success: true,
      config: newConfig
    });
  } catch (error) {
    logger.error('Admin GPU config update error', { error: error.message, requestId: req.id });
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
    logger.error('Admin GPU status error', { error: error.message, requestId: req.id });
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
    logger.error('Admin GPU stats error', { error: error.message, requestId: req.id });
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

    logAdminAction(req.user.email, 'Testing GPU endpoint');

    const health = await checkDedicatedHealth(url);

    res.json({
      url,
      ...health,
      tested_at: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Admin GPU test error', { error: error.message, requestId: req.id });
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
    logger.error('Warmup status error', { error: error.message, requestId: req.id });
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

    logAdminAction(req.user.email, 'Triggering warmup', { model });

    // Call the dedicated GPU's warmup endpoint
    const warmupUrl = `${config.dedicatedUrl}/warmup`;
    const response = await fetch(warmupUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Warmup request failed', { error: errorText, requestId: req.id });
      return res.status(500).json({
        success: false,
        error: 'Warmup request failed',
        details: errorText
      });
    }

    const result = await response.json();

    logger.info('Warmup complete', { model, loadTimeSeconds: result.loadTimeSeconds });

    res.json({
      success: true,
      model,
      loadTimeSeconds: result.loadTimeSeconds,
      message: result.message || `${model} model loaded successfully`
    });
  } catch (error) {
    logger.error('Warmup trigger error', { error: error.message, requestId: req.id });
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
      logger.error('User search error', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to search users' });
    }

    res.json({ users: users || [] });
  } catch (error) {
    logger.error('User search error', { error: error.message, requestId: req.id });
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
      .select('id, character_id, purchased_at, amount_paid, purchase_type, granted_by, notes')
      .eq('user_id', userId);

    if (userCharsError) {
      logger.error('Fetch user characters error', { error: userCharsError.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to fetch owned characters', details: userCharsError.message });
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
      logger.error('Fetch character details error', { error: charsError.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to fetch character details', details: charsError.message });
    }

    // Combine the data
    const charMap = {};
    (characters || []).forEach(c => { charMap[c.id] = c; });

    const ownedCharacters = userChars.map(uc => ({
      id: uc.id,
      purchased_at: uc.purchased_at,
      amount_paid: uc.amount_paid,
      purchase_type: uc.purchase_type || (uc.amount_paid === 0 ? 'admin_grant' : 'purchase'),
      granted_by: uc.granted_by,
      notes: uc.notes,
      character: charMap[uc.character_id] || { id: uc.character_id, name: 'Unknown', category: 'Unknown' }
    }));

    res.json({
      ownedCharacters,
      userId
    });
  } catch (error) {
    logger.error('Fetch owned characters error', { error: error.message, requestId: req.id });
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

    // Get all active characters (including unlisted ones for admin granting)
    const { data: characters, error } = await supabase
      .from('marketplace_characters')
      .select('id, name, category, image_url, lora_url, price, is_listed')
      .eq('is_active', true)
      .order('name');

    if (error) {
      logger.error('Fetch characters error', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to fetch characters' });
    }

    res.json({ characters: characters || [] });
  } catch (error) {
    logger.error('Fetch characters error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to fetch characters' });
  }
});

/**
 * POST /api/admin/grant-character
 * Grant a user access to a character/LoRA
 */
router.post('/grant-character', async (req, res) => {
  try {
    const { userId, characterId, notes } = req.body;

    if (!userId || !characterId) {
      return res.status(400).json({ error: 'userId and characterId are required' });
    }

    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    // Validate character exists
    const { data: character, error: charError } = await supabase
      .from('marketplace_characters')
      .select('id, name')
      .eq('id', characterId)
      .maybeSingle();

    if (charError) {
      logger.error('Check character error', { error: charError.message, characterId, requestId: req.id });
      return res.status(500).json({ error: 'Failed to verify character', details: charError.message });
    }

    if (!character) {
      return res.status(404).json({ error: 'Character not found', characterId });
    }

    // Validate user exists
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (userError) {
      logger.error('Check user error', { error: userError.message, userId, requestId: req.id });
      return res.status(500).json({ error: 'Failed to verify user', details: userError.message });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found', userId });
    }

    // Check if already granted (use maybeSingle to avoid error when no row exists)
    const { data: existing, error: checkError } = await supabase
      .from('user_characters')
      .select('id')
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .maybeSingle();

    if (checkError) {
      logger.error('Check existing grant error', { error: checkError.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to check existing access', details: checkError.message });
    }

    if (existing) {
      return res.status(400).json({ error: 'User already has access to this character' });
    }

    // Grant access with purchase_type tracking
    const { data, error } = await supabase
      .from('user_characters')
      .insert({
        user_id: userId,
        character_id: characterId,
        amount_paid: 0,
        purchase_type: 'admin_grant',
        granted_by: req.userId,
        notes: notes || null
      })
      .select()
      .single();

    if (error) {
      logger.error('Grant character error', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        userId,
        characterId,
        requestId: req.id
      });
      return res.status(500).json({
        error: 'Failed to grant character access',
        details: error.message,
        code: error.code
      });
    }

    logAdminAction(req.user.email, 'Granted character access', {
      characterId,
      characterName: character.name,
      userId: maskUserId(userId)
    });

    res.json({
      success: true,
      message: `Character "${character.name}" access granted`,
      grant: data
    });
  } catch (error) {
    logger.error('Grant character error', { error: error.message, stack: error.stack, requestId: req.id });
    res.status(500).json({ error: 'Failed to grant character access', details: error.message });
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
      logger.error('Revoke character error', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to revoke character access' });
    }

    logAdminAction(req.user.email, 'Revoked character access', {
      characterId,
      userId: maskUserId(userId)
    });

    res.json({
      success: true,
      message: 'Character access revoked'
    });
  } catch (error) {
    logger.error('Revoke character error', { error: error.message, requestId: req.id });
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
      logger.error('Update credits error', { error: updateError.message, requestId: req.id });
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
      logger.error('Transaction record error', { error: transactionError.message, requestId: req.id });
      // Credits were updated but transaction failed - log it but don't fail the request
    }

    logAdminAction(adminEmail, 'Gifted credits', {
      credits: creditAmount,
      userId: maskUserId(userId),
      reason
    });

    res.json({
      success: true,
      message: `Gifted ${creditAmount} credits`,
      newBalance: newBalance
    });
  } catch (error) {
    logger.error('Gift credits error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to gift credits' });
  }
});

module.exports = router;
