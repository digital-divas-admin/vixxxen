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
const { checkDedicatedHealth, getDedicatedLoRAStatus, resetDedicatedLoRA } = require('./services/gpuRouter');

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
 * GET /api/admin/gpu-lora-status
 * Get current LoRA loaded on dedicated GPU (for smart routing)
 * This helps avoid the ~35 second LoRA switch penalty
 */
router.get('/gpu-lora-status', async (req, res) => {
  try {
    const loraStatus = getDedicatedLoRAStatus();
    const config = await getGpuConfig();

    res.json({
      smartRouting: {
        enabled: config.mode === 'hybrid',
        description: 'When enabled, requests for different characters are routed to serverless to avoid 35s LoRA switch'
      },
      dedicatedGpu: loraStatus,
      tip: loraStatus.currentLoRA
        ? `Generating with ${loraStatus.currentLoRA.split('/').pop()} will be fast (~2s)`
        : 'First generation will be routed to dedicated and cache the LoRA'
    });
  } catch (error) {
    console.error('Admin GPU LoRA status error:', error);
    res.status(500).json({ error: 'Failed to get LoRA status' });
  }
});

/**
 * POST /api/admin/gpu-lora-reset
 * Reset LoRA tracking (use when pod restarts or to force fresh tracking)
 */
router.post('/gpu-lora-reset', async (req, res) => {
  try {
    console.log(`🔄 Admin ${req.user.email} resetting GPU LoRA tracking`);

    resetDedicatedLoRA();

    res.json({
      success: true,
      message: 'LoRA tracking reset. Next generation will set the baseline.'
    });
  } catch (error) {
    console.error('Admin GPU LoRA reset error:', error);
    res.status(500).json({ error: 'Failed to reset LoRA tracking' });
  }
});

module.exports = router;
