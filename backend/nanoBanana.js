const express = require('express');
const fetch = require('node-fetch');
const { compressImages } = require('./services/imageCompression');

const router = express.Router();

// OpenRouter API endpoint
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Nano Banana Pro model (Gemini 3 Pro Image Preview via OpenRouter)
const NANO_BANANA_MODEL = "google/gemini-3-pro-image-preview";

// Retry settings for rate limits
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000;

/**
 * Helper function to make API request with retry logic
 */
async function fetchWithRetry(url, options, maxRetries = MAX_RETRIES) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // If we get a 429, retry with exponential backoff
      if (response.status === 429 && attempt < maxRetries) {
        const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        console.log(`   ⏳ Rate limited (429), retrying in ${backoffMs / 1000}s... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        console.log(`   ⏳ Request failed, retrying in ${backoffMs / 1000}s... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

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

    console.log(`\n🍌 Generating ${numOutputs} image(s) with Nano Banana Pro via OpenRouter...`);
    console.log(`   Prompt: ${prompt}`);
    console.log(`   Aspect Ratio: ${aspectRatio}`);
    console.log(`   Reference Images: ${referenceImages.length}`);
    console.log(`   Model: ${NANO_BANANA_MODEL}`);

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

    for (let i = 0; i < numOutputs; i++) {
      console.log(`   Generating image ${i + 1}/${numOutputs}...`);

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

        // Make raw HTTP request to OpenRouter with retry logic
        const response = await fetchWithRetry(OPENROUTER_API_URL, {
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
          console.error(`   API Error ${response.status}:`, errorText);
          throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log(`   Response received, processing...`);
        console.log(`   Full result structure:`, JSON.stringify(result, null, 2).substring(0, 3000));

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
              console.log(`   ✅ Image ${i + 1}.${idx + 1} generated successfully (images array)`);
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
              console.log(`   ✅ Image ${i + 1} generated successfully (inline_data)`);
              imageFound = true;
            }
            // Check for image_url format
            if (part.type === 'image_url' && part.image_url?.url) {
              images.push(part.image_url.url);
              console.log(`   ✅ Image ${i + 1} generated successfully (image_url part)`);
              imageFound = true;
            }
            // Check for image type with b64_json
            if (part.type === 'image' && part.b64_json) {
              const imageDataUrl = `data:image/png;base64,${part.b64_json}`;
              images.push(imageDataUrl);
              console.log(`   ✅ Image ${i + 1} generated successfully (b64_json)`);
              imageFound = true;
            }
          }
        }

        // Method 3: Check content as string for base64 data
        if (!imageFound && message?.content && typeof message.content === 'string') {
          const base64Match = message.content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
          if (base64Match) {
            images.push(base64Match[0]);
            console.log(`   ✅ Image ${i + 1} generated successfully (base64 string)`);
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
                console.log(`   ✅ Image ${i + 1} generated successfully (result.data)`);
                imageFound = true;
              }
              if (item.url) {
                images.push(item.url);
                console.log(`   ✅ Image ${i + 1} generated successfully (result.data url)`);
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

        // Check finish reason
        if (result.choices[0]?.finish_reason === 'content_filter') {
          console.log(`   🚫 CONTENT FILTER: Image ${i + 1} explicitly blocked by content filter`);
          warnings.push(`Image was blocked by content filter`);
        } else if (result.choices[0]?.finish_reason) {
          console.log(`   Finish reason: ${result.choices[0].finish_reason}`);
        }
      } catch (apiError) {
        console.error(`   ❌ Error generating image ${i + 1}:`, apiError.message);
        warnings.push(`Image failed: ${apiError.message}`);
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

    console.log(`   ✅ Generation complete! Created ${images.length} image(s)`);
    if (warnings.length > 0) {
      console.log(`   ⚠️ Warnings: ${warnings.join(', ')}`);
    }

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
    console.error('Nano Banana Pro generation error:', error);

    // Handle specific error types
    if (error.message?.includes('API key') || error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'Please check your OpenRouter API key at https://openrouter.ai/keys'
      });
    }

    if (error.message?.includes('quota') || error.message?.includes('429')) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'You have exceeded your API rate limit. Please try again later.'
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
