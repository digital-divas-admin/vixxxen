const express = require('express');
const router = express.Router();
const Replicate = require('replicate');
const { logger, logGeneration } = require('./services/logger');
const { screenImages, isEnabled: isModerationEnabled } = require('./services/imageModeration');

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_KEY,
});

const QWEN_IMAGE_EDIT_MODEL = "qwen/qwen-image-edit-plus";

router.post('/generate', async (req, res) => {
  try {
    const {
      images, // array of image URLs/base64
      prompt,
      aspectRatio = "match_input_image",
      outputFormat = "webp",
      seed,
      goFast = true,
      outputQuality = 95,
      disableSafetyChecker = false
    } = req.body;

    // Validate inputs
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one image is required'
      });
    }

    if (images.length > 3) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 3 images allowed (1-3 works best)'
      });
    }

    if (!prompt || prompt.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    // Screen uploaded images for celebrities and minors
    if (isModerationEnabled()) {
      const moderationResult = await screenImages(images);
      if (!moderationResult.approved) {
        logger.warn('Image edit images rejected by moderation', {
          reasons: moderationResult.reasons,
          requestId: req.id
        });
        return res.status(400).json({
          success: false,
          error: 'Image rejected by content moderation',
          reasons: moderationResult.reasons,
          message: 'One or more uploaded images contain content that is not allowed (celebrity or minor detected).'
        });
      }
    }

    logGeneration('qwen-image-edit', 'started', {
      imageCount: images.length,
      aspectRatio,
      outputFormat,
      goFast,
      requestId: req.id
    });

    // Build input for Qwen Image Edit model
    const input = {
      image: images,
      prompt: prompt.trim(),
      aspect_ratio: aspectRatio,
      output_format: outputFormat,
      go_fast: goFast,
      output_quality: outputQuality,
      disable_safety_checker: disableSafetyChecker
    };

    // Add seed if provided
    if (seed !== undefined && seed !== null && seed !== '') {
      input.seed = parseInt(seed);
    }

    const output = await replicate.run(QWEN_IMAGE_EDIT_MODEL, { input });

    logGeneration('qwen-image-edit', 'completed', { requestId: req.id });

    // Output is an array of image URLs
    res.json({
      success: true,
      model: 'qwen-image-edit-plus',
      images: output,
      metadata: {
        prompt,
        imageCount: images.length,
        aspectRatio,
        outputFormat,
        goFast,
        seed: input.seed
      }
    });

  } catch (error) {
    logger.error('Qwen Image Edit error', { error: error.message, requestId: req.id });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to edit images'
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    service: 'qwen-image-edit',
    status: 'healthy',
    model: QWEN_IMAGE_EDIT_MODEL
  });
});

module.exports = router;
