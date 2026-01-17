/**
 * Kling Video Generation Route
 * Uses Replicate API for Kling 2.5 Turbo Pro
 */

const express = require('express');
const Replicate = require('replicate');
const { logger } = require('../../services/logger');
const { supabaseAdmin } = require('../../services/supabase');
const { requireAuth } = require('../../middleware/auth');
const { requireCredits, deductCredits } = require('../../middleware/credits');
const { config } = require('../../config');

const router = express.Router();

const KLING_MODEL = "kwaivgi/kling-v2.5-turbo-pro";

/**
 * POST /api/generate/kling
 * Generate video using Kling 2.5 Turbo Pro
 */
router.post('/', requireAuth, requireCredits('kling'), async (req, res) => {
  const { agency, agencyUser } = req;

  try {
    const {
      prompt,
      aspectRatio = "16:9",
      duration = 5,
      startImage,
      negativePrompt
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!config.replicate.apiKey) {
      return res.status(500).json({ error: 'Replicate API key not configured' });
    }

    const validAspectRatios = ["16:9", "9:16", "1:1"];
    if (!validAspectRatios.includes(aspectRatio)) {
      return res.status(400).json({
        error: `Invalid aspect ratio. Must be one of: ${validAspectRatios.join(', ')}`
      });
    }

    if (duration < 1 || duration > 10) {
      return res.status(400).json({
        error: 'Duration must be between 1 and 10 seconds'
      });
    }

    logger.info(`Generating video with Kling 2.5`, {
      agencyId: agency.id,
      userId: agencyUser.id,
      duration
    });

    const replicate = new Replicate({
      auth: config.replicate.apiKey,
    });

    const input = {
      prompt,
      aspect_ratio: aspectRatio,
      duration,
      guidance_scale: 0.5
    };

    if (startImage) {
      input.start_image = startImage;
    }

    if (negativePrompt) {
      input.negative_prompt = negativePrompt;
    }

    const output = await replicate.run(KLING_MODEL, { input });

    // Deduct credits
    await deductCredits(req);

    // Log generation
    await supabaseAdmin.from('generations').insert({
      agency_id: agency.id,
      user_id: agencyUser.id,
      type: 'video',
      model: 'kling',
      prompt,
      parameters: { aspectRatio, duration, hasStartImage: !!startImage },
      status: 'completed',
      result_url: output,
      result_metadata: { duration },
      credits_cost: req.creditCost,
      completed_at: new Date().toISOString()
    });

    res.json({
      success: true,
      model: 'kling-2.5-turbo-pro',
      videoUrl: output,
      parameters: {
        prompt,
        aspectRatio,
        duration,
        hasStartImage: !!startImage
      },
      creditsUsed: req.creditCost,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Kling generation error:', error);

    res.status(500).json({
      error: error.message || 'Failed to generate video'
    });
  }
});

/**
 * GET /api/generate/kling/status
 */
router.get('/status', (req, res) => {
  res.json({
    model: 'kling-2.5-turbo-pro',
    configured: !!config.replicate.apiKey,
    status: config.replicate.apiKey ? 'ready' : 'missing_api_key'
  });
});

module.exports = router;
