/**
 * Nano Banana Pro Image Generation Route
 * Uses OpenRouter API for Gemini 3 Pro Image Preview
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

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const NANO_BANANA_MODEL = "google/gemini-3-pro-image-preview";

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000;

async function fetchWithRetry(url, options, maxRetries = MAX_RETRIES) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429 && attempt < maxRetries) {
        const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

/**
 * POST /api/generate/nano-banana
 * Generate images using Nano Banana Pro (Gemini 3)
 */
router.post('/', requireAuth, requireCredits('nanoBanana'), async (req, res) => {
  const { agency, agencyUser } = req;

  try {
    const {
      prompt,
      aspectRatio = "1:1",
      numOutputs = 1,
      referenceImages = []
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!config.openrouter.apiKey) {
      return res.status(500).json({ error: 'OpenRouter API key not configured' });
    }

    const validAspectRatios = ["1:1", "16:9", "9:16", "4:3", "3:4"];
    if (!validAspectRatios.includes(aspectRatio)) {
      return res.status(400).json({
        error: `Invalid aspect ratio. Must be one of: ${validAspectRatios.join(', ')}`
      });
    }

    logger.info(`Generating ${numOutputs} image(s) with Nano Banana Pro`, {
      agencyId: agency.id,
      userId: agencyUser.id
    });

    let compressedReferenceImages = [];
    if (referenceImages && referenceImages.length > 0) {
      compressedReferenceImages = await compressImages(referenceImages, {
        maxDimension: 1536,
        quality: 80
      });
    }

    const images = [];
    const warnings = [];

    for (let i = 0; i < numOutputs; i++) {
      try {
        let messages = [];

        if (compressedReferenceImages.length > 0) {
          const contentParts = compressedReferenceImages.map(imageDataUrl => ({
            type: "image_url",
            image_url: { url: imageDataUrl }
          }));
          contentParts.push({ type: "text", text: `Use these as reference. ${prompt}` });
          messages.push({ role: "user", content: contentParts });
        } else {
          messages.push({ role: "user", content: prompt });
        }

        const requestBody = {
          model: NANO_BANANA_MODEL,
          messages: messages,
          modalities: ["image", "text"],
          image_config: { aspect_ratio: aspectRatio }
        };

        const response = await fetchWithRetry(OPENROUTER_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.openrouter.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': config.frontendUrl,
            'X-Title': 'Agency Studio'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        const message = result.choices[0]?.message;
        let imageFound = false;

        // Check message.images array - only take first image from each response
        if (message?.images && message.images.length > 0) {
          const image = message.images[0]; // Only take first image
          const imageUrl = image.image_url?.url || image.url;
          if (imageUrl) {
            images.push(imageUrl);
            imageFound = true;
          }
        }

        // Check content as array - only take first image found
        if (!imageFound && Array.isArray(message?.content)) {
          for (const part of message.content) {
            if (part.inline_data?.data) {
              const mimeType = part.inline_data.mime_type || 'image/png';
              images.push(`data:${mimeType};base64,${part.inline_data.data}`);
              imageFound = true;
              break; // Only take first image
            }
            if (part.type === 'image_url' && part.image_url?.url) {
              images.push(part.image_url.url);
              imageFound = true;
              break; // Only take first image
            }
          }
        }

        if (!imageFound) {
          warnings.push(`No image in response ${i + 1}`);
        }

      } catch (apiError) {
        warnings.push(`Image ${i + 1} failed: ${apiError.message}`);
      }

      if (i < numOutputs - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (images.length === 0) {
      throw new Error('No images were generated. ' + warnings.join('. '));
    }

    // Deduct credits
    await deductCredits(req);

    // Log generation
    await supabaseAdmin.from('generations').insert({
      agency_id: agency.id,
      user_id: agencyUser.id,
      type: 'image',
      model: 'nanoBanana',
      prompt,
      parameters: { aspectRatio, numOutputs },
      status: 'completed',
      result_url: images[0],
      result_metadata: { imageCount: images.length },
      credits_cost: req.creditCost,
      completed_at: new Date().toISOString()
    });

    res.json({
      success: true,
      model: 'nano-banana-pro',
      images,
      warnings: warnings.length > 0 ? warnings : undefined,
      parameters: { prompt, aspectRatio, numOutputs },
      creditsUsed: req.creditCost,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Nano Banana generation error:', error);

    res.status(500).json({
      error: error.message || 'Failed to generate image'
    });
  }
});

/**
 * GET /api/generate/nano-banana/status
 */
router.get('/status', (req, res) => {
  res.json({
    model: 'nano-banana-pro',
    configured: !!config.openrouter.apiKey,
    status: config.openrouter.apiKey ? 'ready' : 'missing_api_key'
  });
});

module.exports = router;
