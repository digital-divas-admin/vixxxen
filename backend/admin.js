/**
 * Admin API Routes
 *
 * Protected endpoints for admin functionality.
 * All routes require admin authentication.
 */

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('./middleware/auth');
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

module.exports = router;
