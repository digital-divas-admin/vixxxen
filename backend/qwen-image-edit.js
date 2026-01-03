const express = require('express');
const router = express.Router();
const Replicate = require('replicate');

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

    console.log('Received Qwen Image Edit request:', {
      imageCount: images?.length || 0,
      prompt: prompt?.substring(0, 100),
      aspectRatio,
      outputFormat,
      goFast
    });

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

    console.log('Calling Qwen Image Edit model with input:', {
      ...input,
      image: `[${input.image.length} images]`
    });

    const output = await replicate.run(QWEN_IMAGE_EDIT_MODEL, { input });

    console.log('Qwen Image Edit generation completed');

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
    console.error('Qwen Image Edit error:', error);
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
