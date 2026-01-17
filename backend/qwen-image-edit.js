const express = require('express');
const router = express.Router();
const Replicate = require('replicate');
const { logger, logGeneration } = require('./services/logger');
const { screenImages, isEnabled: isModerationEnabled } = require('./services/imageModeration');
const { processImageInputs, screenAndSaveImages } = require('./services/userImageService');

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

    // Process images (resolve library IDs to base64)
    let processedImages = images;
    const userId = req.userId;
    if (userId) {
      const imageResult = await processImageInputs(images, userId);
      if (!imageResult.success) {
        return res.status(400).json({
          success: false,
          error: 'Failed to process images',
          message: imageResult.error,
          failedIds: imageResult.failedIds
        });
      }
      processedImages = imageResult.images;
    }

    // Screen uploaded images for celebrities and minors
    // Skip if all images came from library (already approved)
    const hasRawImages = images.some(img => !img.match(/^[0-9a-f-]{36}$/i));

    if (hasRawImages && isModerationEnabled()) {
      logger.info('Running moderation on Qwen image edit images', {
        imageCount: processedImages.length,
        userId: userId || 'anonymous',
        requestId: req.id
      });

      // Use screenAndSaveImages to auto-save rejected images to library
      const moderationResult = await screenAndSaveImages(processedImages, userId);

      if (!moderationResult.approved) {
        logger.warn('Image edit images rejected by moderation', {
          reasons: moderationResult.reasons,
          savedImageIds: moderationResult.savedImageIds,
          failedCount: moderationResult.failedCount,
          requestId: req.id
        });

        let message = `${moderationResult.failedCount} of ${moderationResult.totalCount} image(s) were flagged by content moderation.`;
        if (moderationResult.savedImageIds && moderationResult.savedImageIds.length > 0) {
          message += ' The flagged images have been saved to your library. You can appeal in your Image Library if you believe they were flagged in error.';
        }

        return res.status(400).json({
          success: false,
          error: 'Image rejected by content moderation',
          reasons: moderationResult.reasons,
          message,
          failedIndex: moderationResult.failedIndex,
          failedCount: moderationResult.failedCount,
          totalCount: moderationResult.totalCount,
          savedImageIds: moderationResult.savedImageIds,
          canAppeal: moderationResult.savedImageIds && moderationResult.savedImageIds.length > 0
        });
      }
    }

    logGeneration('qwen-image-edit', 'started', {
      imageCount: processedImages.length,
      aspectRatio,
      outputFormat,
      goFast,
      requestId: req.id
    });

    // Build input for Qwen Image Edit model
    const input = {
      image: processedImages,
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
