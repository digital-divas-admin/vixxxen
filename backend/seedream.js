const express = require('express');
const fetch = require('node-fetch');
const { logger, logGeneration } = require('./services/logger');
const analytics = require('./services/analyticsService');

const router = express.Router();

// OpenRouter API endpoint
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Seedream 4.5 model via OpenRouter
const SEEDREAM_MODEL = "bytedance-seed/seedream-4.5";

/**
 * POST /api/seedream/generate
 * Generate an image using Seedream 4.5 model via OpenRouter
 *
 * Body:
 * {
 *   prompt: string (required)
 *   negativePrompt: string (optional)
 *   resolution: "2K" | "4K" (default: "2K")
 *   numOutputs: number (default: 1, max: 4)
 *   guidanceScale: number (default: 7)
 *   numInferenceSteps: number (default: 28)
 * }
 */
router.post('/generate', async (req, res) => {
  try {
    const {
      prompt,
      negativePrompt = "worst quality, low quality, blurry, distorted",
      resolution = "2K",
      numOutputs = 1,
      guidanceScale = 7,
      numInferenceSteps = 28,
      referenceImages = []
    } = req.body;

    // Validation
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({ error: 'OpenRouter API key not configured' });
    }

    // Validate reference images (Seedream 4.5 supports up to 14)
    if (referenceImages.length > 14) {
      return res.status(400).json({ error: 'Maximum 14 reference images allowed' });
    }

    // Seedream 4.5 uses 'size' parameter: "2K", "4K", or "custom"
    const validSize = ['2K', '4K'].includes(resolution) ? resolution : '2K';

    logGeneration('seedream', 'started', {
      numOutputs,
      size: validSize,
      referenceImages: referenceImages.length,
      requestId: req.id
    });

    // Track generation started
    analytics.generation.started('seedream', {
      num_outputs: numOutputs,
      size: validSize,
      reference_images: referenceImages.length
    }, req);

    // Generate images sequentially
    const images = [];
    const warnings = [];

    for (let i = 0; i < numOutputs; i++) {
      logger.debug('Generating image', { model: 'seedream', index: i + 1, total: numOutputs });

      try {
        // Build the prompt
        let imagePrompt = prompt;
        if (negativePrompt) {
          imagePrompt += ` Avoid: ${negativePrompt}`;
        }

        // Build messages array
        let messages = [];

        // Add reference images if provided
        if (referenceImages && referenceImages.length > 0) {
          const contentParts = referenceImages.map(imageDataUrl => ({
            type: "image_url",
            image_url: { url: imageDataUrl }
          }));
          contentParts.push({ type: "text", text: `Use these as reference. ${imagePrompt}` });
          messages.push({ role: "user", content: contentParts });
        } else {
          // Simple string content for basic generation
          messages.push({ role: "user", content: imagePrompt });
        }

        // Build request body with all required parameters
        const requestBody = {
          model: SEEDREAM_MODEL,
          messages: messages,
          modalities: ["image", "text"]
        };

        // Make raw HTTP request to OpenRouter
        const response = await fetch(OPENROUTER_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.FRONTEND_URL || 'https://www.digitaldivas.ai',
            'X-Title': 'DivaForge'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.error('Seedream API error', { status: response.status, requestId: req.id });
          throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();

        // Extract images from response
        const message = result.choices[0]?.message;
        let imageFound = false;

        // Method 1: Check message.images array (OpenRouter standard)
        if (message?.images && message.images.length > 0) {
          message.images.forEach((image, idx) => {
            const imageUrl = image.image_url?.url || image.url;
            if (imageUrl) {
              images.push(imageUrl);
              logger.debug('Image extracted', { method: 'images_array', index: i + 1 });
              imageFound = true;
            }
          });
        }

        // Method 2: Check content as array of parts (multimodal response)
        if (!imageFound && Array.isArray(message?.content)) {
          for (const part of message.content) {
            if (part.inline_data?.data) {
              const mimeType = part.inline_data.mime_type || 'image/png';
              const imageDataUrl = `data:${mimeType};base64,${part.inline_data.data}`;
              images.push(imageDataUrl);
              logger.debug('Image extracted', { method: 'inline_data', index: i + 1 });
              imageFound = true;
            }
            if (part.type === 'image_url' && part.image_url?.url) {
              images.push(part.image_url.url);
              logger.debug('Image extracted', { method: 'image_url_part', index: i + 1 });
              imageFound = true;
            }
          }
        }

        // Method 3: Check content as string for base64 data
        if (!imageFound && message?.content && typeof message.content === 'string') {
          const base64Match = message.content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
          if (base64Match) {
            images.push(base64Match[0]);
            logger.debug('Image extracted', { method: 'base64_string', index: i + 1 });
            imageFound = true;
          }
        }

        if (!imageFound) {
          logger.warn('No image in response', { index: i + 1, requestId: req.id });
          warnings.push(`No image in response ${i + 1}`);
        }

        // Check finish reason
        if (result.choices[0]?.finish_reason === 'content_filter') {
          logger.warn('Image blocked by content filter', { index: i + 1, requestId: req.id });
          warnings.push(`Image was blocked by content filter`);
        }
      } catch (apiError) {
        logger.error('Image generation failed', { index: i + 1, error: apiError.message, requestId: req.id });
        warnings.push(`Image ${i + 1} failed: ${apiError.message}`);
      }

      // Small delay between requests to avoid rate limiting
      if (i < numOutputs - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (images.length === 0) {
      const errorMsg = warnings.length > 0
        ? `No images were generated. ${warnings.join('. ')}`
        : 'No images were generated.';
      throw new Error(errorMsg);
    }

    logGeneration('seedream', 'completed', { imagesGenerated: images.length, requestId: req.id });

    // Track generation completed
    analytics.generation.completed('seedream', {
      images_generated: images.length,
      warnings_count: warnings.length
    }, req);

    // Return the generated images
    // Note: Credits are handled by the frontend via Supabase RPC functions
    res.json({
      success: true,
      model: 'seedream-4.5',
      images: images,
      warnings: warnings.length > 0 ? warnings : undefined,
      parameters: {
        prompt,
        size: validSize,
        numOutputs,
        referenceImagesCount: referenceImages.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Seedream generation error', { error: error.message, requestId: req.id });

    // Track generation failed
    analytics.generation.failed('seedream', error.message, {}, req);

    // Handle specific error types
    if (error.message?.includes('API key') || error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'Please check your OpenRouter API key at https://openrouter.ai/keys'
      });
    }

    if (error.message?.includes('insufficient') || error.message?.includes('402')) {
      return res.status(402).json({
        error: 'Insufficient funds',
        message: 'Please add credits to your OpenRouter account at https://openrouter.ai/credits'
      });
    }

    if (error.message?.includes('rate') || error.message?.includes('429')) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Please try again later.'
      });
    }

    res.status(500).json({
      error: error.message || 'Failed to generate image',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/seedream/status
 * Check if Seedream is configured and available
 */
router.get('/status', (req, res) => {
  res.json({
    model: 'seedream-4.5',
    configured: !!process.env.OPENROUTER_API_KEY,
    endpoint: SEEDREAM_MODEL,
    provider: 'openrouter',
    status: process.env.OPENROUTER_API_KEY ? 'ready' : 'missing_api_key'
  });
});

module.exports = router;
