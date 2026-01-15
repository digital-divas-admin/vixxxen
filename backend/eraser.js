const express = require('express');
const Replicate = require('replicate');
const { logger, logGeneration } = require('./services/logger');
const analytics = require('./services/analyticsService');

const router = express.Router();

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_KEY,
});

const ERASER_MODEL = "bria/eraser";

router.post('/erase', async (req, res) => {
  try {
    const {
      image,
      mask,
      preserveAlpha = true,
      contentModeration = false,
      sync = true
    } = req.body;

    // Validation
    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }

    if (!mask) {
      return res.status(400).json({ error: 'Mask is required' });
    }

    // Build input for Eraser model
    const input = {
      image,
      mask,
      preserve_alpha: preserveAlpha,
      content_moderation: contentModeration,
      sync
    };

    logGeneration('eraser', 'started', {
      preserveAlpha,
      contentModeration,
      requestId: req.id
    });

    // Track analytics
    analytics.generation.started('eraser', {
      preserve_alpha: preserveAlpha
    }, req);

    // Run the model
    const output = await replicate.run(ERASER_MODEL, { input });

    logGeneration('eraser', 'completed', { requestId: req.id });

    // Track analytics
    analytics.generation.completed('eraser', {}, req);

    // Return the edited image URL
    res.json({
      success: true,
      model: 'bria-eraser',
      imageUrl: output,
      parameters: {
        preserveAlpha,
        contentModeration
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Object removal failed', { error: error.message, requestId: req.id });

    // Track analytics
    analytics.generation.failed('eraser', error.message, {}, req);

    // Handle specific error cases
    if (error.message?.includes('Invalid input')) {
      return res.status(400).json({
        error: 'Invalid input parameters',
        details: error.message
      });
    }

    if (error.message?.includes('Rate limit')) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Please try again in a moment.'
      });
    }

    // Generic error response
    res.status(500).json({
      error: 'Object removal failed',
      message: error.message || 'Unknown error occurred'
    });
  }
});

module.exports = router;
