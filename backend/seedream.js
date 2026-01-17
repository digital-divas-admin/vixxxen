const express = require('express');
const fetch = require('node-fetch');
const { compressImages } = require('./services/imageCompression');
const { logger, logGeneration } = require('./services/logger');
const analytics = require('./services/analyticsService');
const { screenImages, isEnabled: isModerationEnabled } = require('./services/imageModeration');

const router = express.Router();

// WaveSpeed API endpoints for Seedream 4.5
const WAVESPEED_TEXT2IMG_URL = 'https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5';
const WAVESPEED_IMG2IMG_URL = 'https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5/edit';
const WAVESPEED_RESULT_URL = 'https://api.wavespeed.ai/api/v3/predictions';

// Retry settings for rate limits - increased for better rate limit handling
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 5000; // Start with 5 seconds
const MAX_BACKOFF_MS = 60000; // Cap at 60 seconds
const JITTER_FACTOR = 0.3; // Add up to 30% random jitter

// Request queue for serializing WaveSpeed API calls to avoid concurrent rate limits
class RequestQueue {
  constructor(minDelayMs = 1000) {
    this.queue = [];
    this.processing = false;
    this.minDelayMs = minDelayMs;
    this.lastRequestTime = 0;
  }

  async add(requestFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const { requestFn, resolve, reject } = this.queue.shift();

      // Ensure minimum delay between requests
      const timeSinceLastRequest = Date.now() - this.lastRequestTime;
      if (timeSinceLastRequest < this.minDelayMs) {
        await new Promise(r => setTimeout(r, this.minDelayMs - timeSinceLastRequest));
      }

      try {
        this.lastRequestTime = Date.now();
        const result = await requestFn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }

    this.processing = false;
  }
}

// Shared request queue for all Seedream requests - 1.5 second minimum between requests
const wavespeedQueue = new RequestQueue(1500);

/**
 * Add jitter to backoff to avoid thundering herd problem
 */
function addJitter(baseMs) {
  const jitter = baseMs * JITTER_FACTOR * Math.random();
  return Math.floor(baseMs + jitter);
}

/**
 * Helper function to make API request with retry logic for 429 errors
 */
async function fetchWithRetry(url, options, maxRetries = MAX_RETRIES) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // If we get a 429, retry with exponential backoff + jitter
      if (response.status === 429 && attempt < maxRetries) {
        const baseBackoff = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
        const backoffMs = addJitter(baseBackoff);
        console.log(`   ⏳ Rate limited (429), retrying in ${(backoffMs / 1000).toFixed(1)}s... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const baseBackoff = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
        const backoffMs = addJitter(baseBackoff);
        console.log(`   ⏳ Request failed, retrying in ${(backoffMs / 1000).toFixed(1)}s... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

/**
 * POST /api/seedream/generate
 * Generate an image using Seedream 4.5 model via WaveSpeed API
 *
 * Body:
 * {
 *   prompt: string (required)
 *   negativePrompt: string (optional)
 *   width: number (default: 2048)
 *   height: number (default: 2048)
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
      width = 2048,
      height = 2048,
      numOutputs = 1,
      guidanceScale = 7,
      numInferenceSteps = 28,
      referenceImages = []
    } = req.body;

    // Validation
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!process.env.WAVESPEED_API_KEY) {
      return res.status(500).json({ error: 'WaveSpeed API key not configured' });
    }

    // Validate dimensions (WaveSpeed supports up to 4096x4096)
    const validatedWidth = Math.min(Math.max(parseInt(width) || 2048, 512), 4096);
    const validatedHeight = Math.min(Math.max(parseInt(height) || 2048, 512), 4096);

    // Determine which endpoint to use based on whether we have reference images
    const hasReferenceImage = referenceImages && referenceImages.length > 0;
    const apiEndpoint = hasReferenceImage ? WAVESPEED_IMG2IMG_URL : WAVESPEED_TEXT2IMG_URL;
    const modelName = hasReferenceImage ? 'seedream-v4.5-edit' : 'seedream-v4.5';

    // Screen reference images for celebrities and minors before processing
    if (hasReferenceImage && isModerationEnabled()) {
      const moderationResult = await screenImages(referenceImages);
      if (!moderationResult.approved) {
        logger.warn('Reference images rejected by moderation', {
          reasons: moderationResult.reasons,
          requestId: req.id
        });
        return res.status(400).json({
          error: 'Reference image rejected by content moderation',
          reasons: moderationResult.reasons,
          message: 'One or more reference images contain content that is not allowed (celebrity or minor detected).'
        });
      }
    }

    console.log(`\n🎨 Generating ${numOutputs} image(s) with Seedream 4.5 via WaveSpeed...`);
    console.log(`   Prompt: ${prompt}`);
    console.log(`   📐 DIMENSIONS: ${validatedWidth}x${validatedHeight}`);
    console.log(`   Reference Images: ${referenceImages.length}`);
    console.log(`   Using endpoint: ${hasReferenceImage ? 'seedream-v4.5-edit (img2img)' : 'seedream-v4.5 (text2img)'}`);
    console.log(`   Model: bytedance/${modelName}`);

    // Compress reference images more aggressively (1024px is plenty for style guidance)
    let compressedReferenceImages = [];
    if (referenceImages && referenceImages.length > 0) {
      compressedReferenceImages = await compressImages(referenceImages, {
        maxDimension: 1024,
        quality: 75
      });
    }

    // Generate images
    const images = [];
    const warnings = [];

    // Build the full prompt
    let imagePrompt = prompt;
    if (negativePrompt) {
      imagePrompt += ` Avoid: ${negativePrompt}`;
    }

    // Add reference context if provided
    if (compressedReferenceImages.length > 0) {
      imagePrompt = `Use these reference images as style guide. ${imagePrompt}`;
    }

    console.log(`   Submitting generation request...`);

    try {
      // Build request body for WaveSpeed API
      // Format size as "width*height"
      const sizeString = `${validatedWidth}*${validatedHeight}`;

      let requestBody;

      if (hasReferenceImage && compressedReferenceImages.length > 0) {
        // Image-to-image mode (seedream-v4.5/edit)
        // API expects "images" as an array, not "image"
        requestBody = {
          prompt: imagePrompt,
          images: compressedReferenceImages, // Array of images (1-10 supported)
          size: sizeString,
          enable_base64_output: true,
          enable_sync_mode: true
        };
      } else {
        // Text-to-image mode (seedream-v4.5)
        requestBody = {
          prompt: imagePrompt,
          size: sizeString,
          n: Math.min(numOutputs, 4),
          enable_base64_output: true,
          enable_sync_mode: true
        };
      }

      console.log(`   Request body:`, JSON.stringify({ ...requestBody, images: requestBody.images ? `[${requestBody.images.length} base64 images]` : undefined }, null, 2));

      // Make request to WaveSpeed API through the queue (serializes concurrent requests)
      // This prevents multiple simultaneous requests from hitting rate limits
      console.log(`   📋 Adding request to queue (queue size: ${wavespeedQueue.queue.length})...`);

      const response = await wavespeedQueue.add(() =>
        fetchWithRetry(apiEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        })
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`   API Error ${response.status}:`, errorText);
        throw new Error(`WaveSpeed API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`   Response received:`, JSON.stringify(result, null, 2).substring(0, 1000));

      // Handle sync mode response
      if (result.data && result.data.outputs) {
        // Sync mode - images directly in response
        for (const output of result.data.outputs) {
          if (typeof output === 'string') {
            // WaveSpeed returns data URLs directly as strings
            images.push(output);
            console.log(`   ✅ Image generated successfully (data URL string)`);
          } else if (output.url) {
            images.push(output.url);
            console.log(`   ✅ Image generated successfully (URL)`);
          } else if (output.base64) {
            images.push(`data:image/png;base64,${output.base64}`);
            console.log(`   ✅ Image generated successfully (base64)`);
          }
        }
      } else if (result.data && result.data.url) {
        // Single image URL
        images.push(result.data.url);
        console.log(`   ✅ Image generated successfully (single URL)`);
      } else if (result.data && result.data.base64) {
        // Single base64 image
        images.push(`data:image/png;base64,${result.data.base64}`);
        console.log(`   ✅ Image generated successfully (single base64)`);
      } else if (result.outputs) {
        // Alternative format
        for (const output of result.outputs) {
          if (typeof output === 'string') {
            if (output.startsWith('http')) {
              images.push(output);
            } else {
              images.push(`data:image/png;base64,${output}`);
            }
            console.log(`   ✅ Image generated successfully`);
          } else if (output.url) {
            images.push(output.url);
          } else if (output.base64) {
            images.push(`data:image/png;base64,${output.base64}`);
          }
        }
      } else if (result.output) {
        // Single output format
        if (typeof result.output === 'string') {
          if (result.output.startsWith('http')) {
            images.push(result.output);
          } else {
            images.push(`data:image/png;base64,${result.output}`);
          }
          console.log(`   ✅ Image generated successfully`);
        }
      } else if (result.id && !result.data) {
        // Async mode - need to poll for result
        console.log(`   Task submitted with ID: ${result.id}, polling for result...`);

        const taskResult = await pollForResult(result.id, process.env.WAVESPEED_API_KEY);

        if (taskResult.outputs) {
          for (const output of taskResult.outputs) {
            if (typeof output === 'string') {
              if (output.startsWith('http')) {
                images.push(output);
              } else {
                images.push(`data:image/png;base64,${output}`);
              }
            } else if (output.url) {
              images.push(output.url);
            } else if (output.base64) {
              images.push(`data:image/png;base64,${output.base64}`);
            }
            console.log(`   ✅ Image generated successfully (polled)`);
          }
        } else if (taskResult.output) {
          if (typeof taskResult.output === 'string') {
            if (taskResult.output.startsWith('http')) {
              images.push(taskResult.output);
            } else {
              images.push(`data:image/png;base64,${taskResult.output}`);
            }
            console.log(`   ✅ Image generated successfully (polled)`);
          }
        }
      }

      if (images.length === 0) {
        console.log(`   ⚠️ No images found in response`);
        console.log(`   Full response:`, JSON.stringify(result, null, 2));
        warnings.push('No images in API response');
      }

    } catch (apiError) {
      console.error(`   ❌ Error generating image:`, apiError.message);
      warnings.push(`Generation failed: ${apiError.message}`);
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
    res.json({
      success: true,
      model: 'seedream-4.5',
      images: images,
      warnings: warnings.length > 0 ? warnings : undefined,
      parameters: {
        prompt,
        width: validatedWidth,
        height: validatedHeight,
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
        message: 'Please check your WaveSpeed API key'
      });
    }

    if (error.message?.includes('insufficient') || error.message?.includes('402')) {
      return res.status(402).json({
        error: 'Insufficient funds',
        message: 'Please add credits to your WaveSpeed account'
      });
    }

    if (error.message?.includes('rate') || error.message?.includes('429')) {
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
 * Poll for async task result
 */
async function pollForResult(taskId, apiKey, maxAttempts = 60) {
  const pollUrl = `${WAVESPEED_RESULT_URL}/${taskId}/result`;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between polls

    const response = await fetch(pollUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Polling error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log(`   Polling attempt ${attempt + 1}: status = ${result.status || 'unknown'}`);

    if (result.status === 'completed' || result.status === 'succeeded') {
      return result.data || result;
    }

    if (result.status === 'failed' || result.status === 'error') {
      throw new Error(result.error || 'Generation failed');
    }

    // If we have output data, return it
    if (result.outputs || result.output || (result.data && (result.data.outputs || result.data.url))) {
      return result.data || result;
    }
  }

  throw new Error('Timeout waiting for image generation');
}

/**
 * GET /api/seedream/status
 * Check if Seedream is configured and available
 */
router.get('/status', (req, res) => {
  res.json({
    model: 'seedream-4.5',
    configured: !!process.env.WAVESPEED_API_KEY,
    endpoints: {
      text2img: WAVESPEED_TEXT2IMG_URL,
      img2img: WAVESPEED_IMG2IMG_URL
    },
    provider: 'wavespeed',
    status: process.env.WAVESPEED_API_KEY ? 'ready' : 'missing_api_key'
  });
});

module.exports = router;
