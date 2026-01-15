const express = require('express');
const Replicate = require('replicate');
const { logger, logGeneration } = require('./services/logger');
const analytics = require('./services/analyticsService');

const router = express.Router();

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_KEY,
});

const WAN_MODEL = "wan-video/wan-2.2-i2v-a14b";

router.post('/generate', async (req, res) => {
  try {
    const {
      prompt,
      image,
      resolution = "480p",
      numFrames = 81,
      framesPerSecond = 16,
      sampleSteps = 30,
      sampleShift = 5,
      goFast = false,
      seed
    } = req.body;

    // Validation
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Build input for Wan model
    const input = {
      prompt,
      resolution,
      num_frames: numFrames,
      frames_per_second: framesPerSecond,
      sample_steps: sampleSteps,
      sample_shift: sampleShift,
      go_fast: goFast
    };

    // Add optional image if provided
    if (image) {
      input.image = image;
    }

    // Add optional seed if provided
    if (seed !== undefined && seed !== null) {
      input.seed = seed;
    }

    logGeneration('wan', 'started', {
      resolution,
      numFrames,
      framesPerSecond,
      hasImage: !!image,
      requestId: req.id
    });

    // Track analytics
    analytics.generation.started('wan', {
      resolution,
      num_frames: numFrames,
      frames_per_second: framesPerSecond,
      has_image: !!image
    }, req);

    // Run the model
    const output = await replicate.run(WAN_MODEL, { input });

    logGeneration('wan', 'completed', { requestId: req.id });

    // Track analytics
    analytics.generation.completed('wan', { resolution }, req);

    // Return the video URL
    res.json({
      success: true,
      model: 'wan-2.2-i2v-a14b',
      videoUrl: output,
      parameters: {
        prompt,
        resolution,
        numFrames,
        framesPerSecond,
        sampleSteps,
        sampleShift,
        goFast,
        hasImage: !!image,
        seed
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Wan video generation failed', { error: error.message, requestId: req.id });

    // Track analytics
    analytics.generation.failed('wan', error.message, {}, req);

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
