const express = require('express');
const { compressImages } = require('./services/imageCompression');
const { logger, logGeneration } = require('./services/logger');
const analytics = require('./services/analyticsService');
const { RequestQueue, createFetchWithRetry } = require('./services/rateLimitService');

const router = express.Router();

// OpenRouter API endpoint
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Nano Banana Pro model (Gemini 3 Pro Image Preview via OpenRouter)
const NANO_BANANA_MODEL = "google/gemini-3-pro-image-preview";

// Create request queue for OpenRouter API calls - 1.5 second minimum between requests
// This serializes concurrent requests to avoid hitting rate limits
const openRouterQueue = new RequestQueue(1500, 'OpenRouter');

// Create fetchWithRetry configured for OpenRouter
// Using improved settings: 5 retries, 5s initial backoff, 60s max, with jitter
const fetchWithRetry = createFetchWithRetry({
  maxRetries: 5,
  initialBackoffMs: 5000,
  maxBackoffMs: 60000,
  jitterFactor: 0.3,
  name: 'Nano Banana'
});

/**
 * POST /api/nano-banana/generate
 * Generate an image using Nano Banana Pro (Gemini 3 via OpenRouter)
 *
 * Body:
 * {
 *   prompt: string (required)
 *   aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" (default: "1:1")
 *   numOutputs: number (default: 1, max: 4)
 *   guidanceScale: number (default: 3.5)
 * }
 */
router.post('/generate', async (req, res) => {
  try {
    const {
      prompt,
      aspectRatio = "1:1",
      numOutputs = 1,
      guidanceScale = 3.5,
      referenceImages = []
    } = req.body;

    // Validation
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({ error: 'OpenRouter API key not configured' });
    }

    const validAspectRatios = ["1:1", "16:9", "9:16", "4:3", "3:4"];
    if (!validAspectRatios.includes(aspectRatio)) {
      return res.status(400).json({
        error: `Invalid aspect ratio. Must be one of: ${validAspectRatios.join(', ')}`
      });
    }

    logGeneration('nano-banana', 'started', {
      numOutputs,
      aspectRatio,
      referenceImages: referenceImages.length,
      requestId: req.id
    });

    // Track generation started
    analytics.generation.started('nano-banana', {
      num_outputs: numOutputs,
      aspect_ratio: aspectRatio,
      reference_images: referenceImages.length
    }, req);

    // Compress reference images to avoid API size limits
    let compressedReferenceImages = [];
    if (referenceImages && referenceImages.length > 0) {
      compressedReferenceImages = await compressImages(referenceImages, {
        maxDimension: 1536,
        quality: 80
      });
    }

    // Generate images sequentially
    const images = [];
    const warnings = [];
    let contentFilterBlocked = false;

    for (let i = 0; i < numOutputs; i++) {
      logger.debug('Generating image', { model: 'nano-banana', index: i + 1, total: numOutputs });

      try {
        // Build the prompt
        let imagePrompt = prompt;

        // Build messages array
        let messages = [];

        // Add reference images if provided
        if (compressedReferenceImages && compressedReferenceImages.length > 0) {
          const contentParts = compressedReferenceImages.map(imageDataUrl => ({
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
          model: NANO_BANANA_MODEL,
          messages: messages,
          modalities: ["image", "text"],
          image_config: {
            aspect_ratio: aspectRatio
          }
        };

        console.log(`   Request body:`, JSON.stringify(requestBody, null, 2).substring(0, 1000));

        // Make request through the queue (serializes concurrent requests to avoid rate limits)
        console.log(`   📋 Adding request to queue (queue size: ${openRouterQueue.size})...`);

        const response = await openRouterQueue.add(() =>
          fetchWithRetry(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': process.env.FRONTEND_URL || 'https://www.digitaldivas.ai',
              'X-Title': 'DivaForge'
            },
            body: JSON.stringify(requestBody)
          })
        );

        if (!response.ok) {
          const errorText = await response.text();
          logger.error('Nano Banana API error', { status: response.status, requestId: req.id });
          throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();

        // Extract images from response
        const message = result.choices[0]?.message;
        let imageFound = false;

        // Check for refusal first
        if (message?.refusal) {
          console.log(`   ⚠️ Model refused request: ${message.refusal}`);
          warnings.push(`Model refused: ${message.refusal}`);
        }

        // Log message structure for debugging
        if (message) {
          console.log(`   Message keys:`, Object.keys(message));
          if (message.reasoning) {
            console.log(`   Model reasoning:`, message.reasoning.substring(0, 200));
          }
        }

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
            // Check for inline_data format (Google-style)
            if (part.inline_data?.data) {
              const mimeType = part.inline_data.mime_type || 'image/png';
              const imageDataUrl = `data:${mimeType};base64,${part.inline_data.data}`;
              images.push(imageDataUrl);
              logger.debug('Image extracted', { method: 'inline_data', index: i + 1 });
              imageFound = true;
            }
            // Check for image_url format
            if (part.type === 'image_url' && part.image_url?.url) {
              images.push(part.image_url.url);
              logger.debug('Image extracted', { method: 'image_url_part', index: i + 1 });
              imageFound = true;
            }
            // Check for image type with b64_json
            if (part.type === 'image' && part.b64_json) {
              const imageDataUrl = `data:image/png;base64,${part.b64_json}`;
              images.push(imageDataUrl);
              logger.debug('Image extracted', { method: 'b64_json', index: i + 1 });
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

        // Method 4: Check for image in result directly (some APIs)
        if (!imageFound && result.data) {
          if (Array.isArray(result.data)) {
            for (const item of result.data) {
              if (item.b64_json) {
                const imageDataUrl = `data:image/png;base64,${item.b64_json}`;
                images.push(imageDataUrl);
                logger.debug('Image extracted', { method: 'result_data', index: i + 1 });
                imageFound = true;
              }
              if (item.url) {
                images.push(item.url);
                logger.debug('Image extracted', { method: 'result_data_url', index: i + 1 });
                imageFound = true;
              }
            }
          }
        }

        if (!imageFound) {
          console.log(`   ⚠️ No image found in response for image ${i + 1}`);
          console.log(`   Message keys:`, message ? Object.keys(message) : 'no message');
          console.log(`   Message content type:`, typeof message?.content);

          // Log the full text content - this usually explains why no image was generated
          if (message?.content && typeof message.content === 'string') {
            console.log(`   📝 MODEL TEXT RESPONSE (content filter may have blocked image):`);
            console.log(`   ${message.content}`);
          }

          // Check for explicit refusal
          if (message?.refusal) {
            console.log(`   🚫 MODEL REFUSAL: ${message.refusal}`);
            warnings.push(`Model refused: ${message.refusal}`);
          }

          warnings.push(`No image in response ${i + 1} - model returned text instead (likely content filter)`);
        }

        // Check finish reason - detect content filter
        const nativeFinishReason = result.choices[0]?.native_finish_reason;
        const finishReason = result.choices[0]?.finish_reason;

        if (nativeFinishReason === 'IMAGE_OTHER' || finishReason === 'content_filter') {
          console.log(`   🚫 CONTENT FILTER DETECTED: native_finish_reason=${nativeFinishReason}, finish_reason=${finishReason}`);
          // Set a flag to return a helpful error
          contentFilterBlocked = true;
        } else if (finishReason) {
          console.log(`   Finish reason: ${finishReason}`);
        }
      } catch (apiError) {
        logger.error('Image generation failed', { index: i + 1, error: apiError.message, requestId: req.id });
        warnings.push(`Image failed: ${apiError.message}`);
      }

      // Small delay between requests to avoid rate limiting
      if (i < numOutputs - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (images.length === 0) {
      // Check if it was blocked by content filter - return helpful error
      if (contentFilterBlocked) {
        return res.status(451).json({
          error: 'Content blocked by Nano Banana',
          message: 'This content was blocked by Nano Banana\'s safety filter. Try using Seedream instead - it supports a wider range of content.',
          suggestion: 'seedream',
          code: 'CONTENT_FILTER'
        });
      }

      const errorMsg = warnings.length > 0
        ? `No images were generated. ${warnings.join('. ')}`
        : 'No images were generated.';
      throw new Error(errorMsg);
    }

    logGeneration('nano-banana', 'completed', { imagesGenerated: images.length, requestId: req.id });

    // Track generation completed
    analytics.generation.completed('nano-banana', {
      images_generated: images.length,
      warnings_count: warnings.length
    }, req);

    // Return the generated images
    res.json({
      success: true,
      model: 'nano-banana-pro',
      images: images,
      warnings: warnings.length > 0 ? warnings : undefined,
      parameters: {
        prompt,
        aspectRatio,
        numOutputs,
        guidanceScale
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Nano Banana generation error', { error: error.message, requestId: req.id });

    // Track generation failed
    analytics.generation.failed('nano-banana', error.message, {}, req);

    // Handle specific error types
    if (error.message?.includes('API key') || error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'Please check your OpenRouter API key at https://openrouter.ai/keys'
      });
    }

    if (error.message?.includes('quota') || error.message?.includes('429') || error.message?.includes('rate')) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'The AI service is experiencing high demand. Please wait 30-60 seconds and try again.',
        retryAfter: 30
      });
    }

    res.status(500).json({
      error: error.message || 'Failed to generate image',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/nano-banana/status
 * Check if Nano Banana Pro is configured and available
 */
router.get('/status', (req, res) => {
  res.json({
    model: 'nano-banana-pro',
    configured: !!process.env.OPENROUTER_API_KEY,
    endpoint: NANO_BANANA_MODEL,
    provider: 'openrouter',
    status: process.env.OPENROUTER_API_KEY ? 'ready' : 'missing_api_key'
  });
});

module.exports = router;
