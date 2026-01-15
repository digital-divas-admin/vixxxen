const express = require('express');
const Replicate = require('replicate');
const { logger, logGeneration } = require('./services/logger');

const router = express.Router();

// Initialize Replicate client
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_KEY,
});

// Kling 2.5 Turbo Pro model
const KLING_MODEL = "kwaivgi/kling-v2.5-turbo-pro";

/**
 * POST /api/kling/generate
 * Generate a video using Kling 2.5 Turbo Pro
 *
 * Body:
 * {
 *   prompt: string (required)
 *   aspectRatio: "16:9" | "9:16" | "1:1" (default: "16:9")
 *   duration: number (default: 5 seconds)
 *   startImage: string (optional - base64 data URL)
 *   negativePrompt: string (optional)
 * }
 */
router.post('/generate', async (req, res) => {
  try {
    const {
      prompt,
      aspectRatio = "16:9",
      duration = 5,
      startImage,
      negativePrompt
    } = req.body;

    // Validation
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!process.env.REPLICATE_API_KEY) {
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

    logGeneration('kling', 'started', {
      aspectRatio,
      duration,
      hasStartImage: !!startImage,
      requestId: req.id
    });

    // Build input for Kling model
    const input = {
      prompt,
      aspect_ratio: aspectRatio,
      duration,
      guidance_scale: 0.5
    };

    // Add start image if provided
    if (startImage) {
      input.start_image = startImage;
    }

    // Add negative prompt if provided
    if (negativePrompt) {
      input.negative_prompt = negativePrompt;
    }

    // Run the model
    const output = await replicate.run(KLING_MODEL, { input });

    logGeneration('kling', 'completed', { requestId: req.id });

    // Return the video URL
    res.json({
      success: true,
      model: 'kling-2.5-turbo-pro',
      videoUrl: output,
      parameters: {
        prompt,
        aspectRatio,
        duration,
        hasStartImage: !!startImage,
        negativePrompt
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Kling video generation error', { error: error.message, requestId: req.id });

    // Handle specific error types
    if (error.message?.includes('API key')) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'Please check your Replicate API key'
      });
    }

    if (error.message?.includes('quota')) {
      return res.status(429).json({
        error: 'Quota exceeded',
        message: 'You have exceeded your API quota.'
      });
    }

    res.status(500).json({
      error: error.message || 'Failed to generate video',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/kling/status
 * Check if Kling is configured and available
 */
router.get('/status', (req, res) => {
  res.json({
    model: 'kling-2.5-turbo-pro',
    configured: !!process.env.REPLICATE_API_KEY,
    endpoint: KLING_MODEL,
    status: process.env.REPLICATE_API_KEY ? 'ready' : 'missing_api_key'
  });
});

module.exports = router;
