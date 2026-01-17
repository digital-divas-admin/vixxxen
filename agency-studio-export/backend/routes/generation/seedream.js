/**
 * Seedream Image Generation Route
 * Uses WaveSpeed API for Seedream 4.5 model
 */

const express = require('express');
const fetch = require('node-fetch');
const { compressImages } = require('../../services/imageCompression');
const { logger } = require('../../services/logger');
const { supabaseAdmin } = require('../../services/supabase');
const { requireAuth } = require('../../middleware/auth');
const { requireCredits, deductCredits } = require('../../middleware/credits');
const { config } = require('../../config');

const router = express.Router();

// WaveSpeed API endpoints
const WAVESPEED_TEXT2IMG_URL = 'https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5';
const WAVESPEED_IMG2IMG_URL = 'https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5/edit';
const WAVESPEED_RESULT_URL = 'https://api.wavespeed.ai/api/v3/predictions';

// Retry settings
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 60000;
const JITTER_FACTOR = 0.3;

// Request queue to avoid rate limits
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

const wavespeedQueue = new RequestQueue(1500);

function addJitter(baseMs) {
  const jitter = baseMs * JITTER_FACTOR * Math.random();
  return Math.floor(baseMs + jitter);
}

async function fetchWithRetry(url, options, maxRetries = MAX_RETRIES) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429 && attempt < maxRetries) {
        const baseBackoff = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
        const backoffMs = addJitter(baseBackoff);
        console.log(`   Rate limited (429), retrying in ${(backoffMs / 1000).toFixed(1)}s...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const baseBackoff = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
        const backoffMs = addJitter(baseBackoff);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

async function pollForResult(taskId, apiKey, maxAttempts = 60) {
  const pollUrl = `${WAVESPEED_RESULT_URL}/${taskId}/result`;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000));

    const response = await fetch(pollUrl, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Polling error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (result.status === 'completed' || result.status === 'succeeded') {
      return result.data || result;
    }

    if (result.status === 'failed' || result.status === 'error') {
      throw new Error(result.error || 'Generation failed');
    }

    if (result.outputs || result.output || (result.data && (result.data.outputs || result.data.url))) {
      return result.data || result;
    }
  }

  throw new Error('Timeout waiting for image generation');
}

/**
 * POST /api/generate/seedream
 * Generate images using Seedream 4.5
 */
router.post('/', requireAuth, requireCredits('seedream'), async (req, res) => {
  const { agency, agencyUser } = req;

  try {
    const {
      prompt,
      negativePrompt = "worst quality, low quality, blurry, distorted",
      width = 2048,
      height = 2048,
      numOutputs = 1,
      referenceImages = []
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!config.wavespeed.apiKey) {
      return res.status(500).json({ error: 'WaveSpeed API key not configured' });
    }

    const validatedWidth = Math.min(Math.max(parseInt(width) || 2048, 512), 4096);
    const validatedHeight = Math.min(Math.max(parseInt(height) || 2048, 512), 4096);

    const hasReferenceImage = referenceImages && referenceImages.length > 0;
    const apiEndpoint = hasReferenceImage ? WAVESPEED_IMG2IMG_URL : WAVESPEED_TEXT2IMG_URL;

    logger.info(`Generating ${numOutputs} image(s) with Seedream 4.5`, {
      agencyId: agency.id,
      userId: agencyUser.id
    });

    let compressedReferenceImages = [];
    if (hasReferenceImage) {
      compressedReferenceImages = await compressImages(referenceImages, {
        maxDimension: 1024,
        quality: 75
      });
    }

    let imagePrompt = prompt;
    if (negativePrompt) {
      imagePrompt += ` Avoid: ${negativePrompt}`;
    }
    if (compressedReferenceImages.length > 0) {
      imagePrompt = `Use these reference images as style guide. ${imagePrompt}`;
    }

    const sizeString = `${validatedWidth}*${validatedHeight}`;

    let requestBody;
    if (hasReferenceImage && compressedReferenceImages.length > 0) {
      requestBody = {
        prompt: imagePrompt,
        images: compressedReferenceImages,
        size: sizeString,
        enable_base64_output: true,
        enable_sync_mode: true
      };
    } else {
      requestBody = {
        prompt: imagePrompt,
        size: sizeString,
        n: Math.min(numOutputs, 4),
        enable_base64_output: true,
        enable_sync_mode: true
      };
    }

    const response = await wavespeedQueue.add(() =>
      fetchWithRetry(apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.wavespeed.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })
    );

    // Log request details
    logger.info('WaveSpeed request body:', JSON.stringify(requestBody, (key, val) => {
      if (key === 'images' && Array.isArray(val)) return `[${val.length} images]`;
      return val;
    }));

    const responseText = await response.text();
    logger.info(`WaveSpeed response status: ${response.status}`);
    logger.info(`WaveSpeed response text (first 2000 chars): ${responseText.substring(0, 2000)}`);

    if (!response.ok) {
      throw new Error(`WaveSpeed API error: ${response.status} - ${responseText}`);
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      logger.error('Failed to parse WaveSpeed response as JSON:', e.message);
      throw new Error('Invalid JSON response from WaveSpeed API');
    }

    logger.info('Parsed result keys:', Object.keys(result || {}));

    const images = [];

    // Extract images from response - handle all possible formats
    if (result.data && result.data.outputs) {
      // Sync mode - images directly in response
      for (const output of result.data.outputs) {
        if (typeof output === 'string') {
          images.push(output);
        } else if (output.url) {
          images.push(output.url);
        } else if (output.base64) {
          images.push(`data:image/png;base64,${output.base64}`);
        }
      }
    } else if (result.data && result.data.url) {
      // Single image URL
      images.push(result.data.url);
    } else if (result.data && result.data.base64) {
      // Single base64 image
      images.push(`data:image/png;base64,${result.data.base64}`);
    } else if (result.outputs) {
      // Alternative format - outputs at root level
      for (const output of result.outputs) {
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
      }
    } else if (result.output) {
      // Single output format
      if (typeof result.output === 'string') {
        if (result.output.startsWith('http')) {
          images.push(result.output);
        } else {
          images.push(`data:image/png;base64,${result.output}`);
        }
      }
    } else if (result.id && !result.data) {
      // Async mode - need to poll for result
      logger.info(`Task submitted with ID: ${result.id}, polling for result...`);
      const taskResult = await pollForResult(result.id, config.wavespeed.apiKey);

      if (taskResult.outputs) {
        for (const output of taskResult.outputs) {
          if (typeof output === 'string') {
            images.push(output.startsWith('http') ? output : `data:image/png;base64,${output}`);
          } else if (output.url) {
            images.push(output.url);
          } else if (output.base64) {
            images.push(`data:image/png;base64,${output.base64}`);
          }
        }
      } else if (taskResult.output) {
        if (typeof taskResult.output === 'string') {
          if (taskResult.output.startsWith('http')) {
            images.push(taskResult.output);
          } else {
            images.push(`data:image/png;base64,${taskResult.output}`);
          }
        }
      }
    }

    if (images.length === 0) {
      throw new Error('No images were generated');
    }

    // Deduct credits
    await deductCredits(req);

    // Log generation to database
    await supabaseAdmin.from('generations').insert({
      agency_id: agency.id,
      user_id: agencyUser.id,
      type: 'image',
      model: 'seedream',
      prompt,
      parameters: { width: validatedWidth, height: validatedHeight, numOutputs },
      status: 'completed',
      result_url: images[0],
      result_metadata: { imageCount: images.length },
      credits_cost: req.creditCost,
      completed_at: new Date().toISOString()
    });

    res.json({
      success: true,
      model: 'seedream-4.5',
      images,
      parameters: {
        prompt,
        width: validatedWidth,
        height: validatedHeight,
        numOutputs
      },
      creditsUsed: req.creditCost,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Seedream generation error:', error);

    if (error.message?.includes('429')) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Please wait 30-60 seconds and try again.'
      });
    }

    res.status(500).json({
      error: error.message || 'Failed to generate image'
    });
  }
});

/**
 * GET /api/generate/seedream/status
 */
router.get('/status', (req, res) => {
  res.json({
    model: 'seedream-4.5',
    configured: !!config.wavespeed.apiKey,
    status: config.wavespeed.apiKey ? 'ready' : 'missing_api_key'
  });
});

module.exports = router;
