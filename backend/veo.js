const express = require('express');
const Replicate = require('replicate');
const { logger, logGeneration } = require('./services/logger');
const analytics = require('./services/analyticsService');

const router = express.Router();

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_KEY,
});

const VEO_MODEL = "google/veo-3.1-fast";

router.post('/generate', async (req, res) => {
  try {
    const {
      prompt,
      aspectRatio = "16:9",
      duration = 8,
      image,
      lastFrame,
      negativePrompt,
      resolution = "720p",
      generateAudio = true,
      seed
    } = req.body;

    // Validation
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Build input for Veo model
    const input = {
      prompt,
      aspect_ratio: aspectRatio,
      duration,
      resolution,
      generate_audio: generateAudio
    };

    // Add optional image if provided
    if (image) {
      input.image = image;
    }

    // Add optional last frame if provided
    if (lastFrame) {
      input.last_frame = lastFrame;
    }

    // Add optional negative prompt if provided
    if (negativePrompt) {
      input.negative_prompt = negativePrompt;
    }

    // Add optional seed if provided
    if (seed !== undefined && seed !== null) {
      input.seed = seed;
    }

    logGeneration('veo', 'started', {
      aspectRatio,
      duration,
      resolution,
      generateAudio,
      hasImage: !!image,
      hasLastFrame: !!lastFrame,
      requestId: req.id
    });

    // Track analytics
    analytics.generation.started('veo', {
      aspect_ratio: aspectRatio,
      duration,
      resolution,
      generate_audio: generateAudio,
      has_image: !!image
    }, req);

    // Run the model
    const output = await replicate.run(VEO_MODEL, { input });

    logGeneration('veo', 'completed', { requestId: req.id });

    // Track analytics
    analytics.generation.completed('veo', { resolution, duration }, req);

    // Return the video URL
    res.json({
      success: true,
      model: 'veo-3.1-fast',
      videoUrl: output,
      parameters: {
        prompt,
        aspectRatio,
        duration,
        resolution,
        generateAudio,
        hasImage: !!image,
        hasLastFrame: !!lastFrame,
        negativePrompt,
        seed
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Veo video generation failed', { error: error.message, requestId: req.id });

    // Track analytics
    analytics.generation.failed('veo', error.message, {}, req);

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
      error: 'Video generation failed',
      message: error.message || 'Unknown error occurred'
    });
  }
});

module.exports = router;
