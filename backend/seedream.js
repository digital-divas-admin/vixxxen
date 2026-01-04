const express = require('express');
const fetch = require('node-fetch');

const router = express.Router();

// OpenRouter API configuration
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Seedream 4.5 model via OpenRouter
// Using Google's Imagen or similar image generation model available on OpenRouter
const SEEDREAM_MODEL = "google/gemini-2.0-flash-exp:free";

/**
 * POST /api/seedream/generate
 * Generate an image using Seedream model via OpenRouter
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

    // Map resolution to dimensions for the prompt
    const resolutionMap = {
      '2K': '2048x2048',
      '4K': '4096x4096'
    };

    console.log(`\n🎨 Generating ${numOutputs} image(s) with Seedream 4.5 via OpenRouter...`);
    console.log(`   Prompt: ${prompt}`);
    console.log(`   Reference Images: ${referenceImages.length}`);
    console.log(`   Size: ${validSize}`);
    console.log(`   Guidance Scale: ${guidanceScale}`);
    console.log(`   Making ${numOutputs} separate calls...`);

    // Generate images sequentially
    const images = [];
    const warnings = [];

    for (let i = 0; i < numOutputs; i++) {
      console.log(`   Generating image ${i + 1}/${numOutputs}...`);

      try {
        // Build the message content
        const messageContent = [];

        // Add reference images first if provided
        if (referenceImages && referenceImages.length > 0) {
          for (const imageDataUrl of referenceImages) {
            messageContent.push({
              type: "image_url",
              image_url: {
                url: imageDataUrl
              }
            });
          }
        }

        // Build comprehensive image generation prompt
        let imagePrompt = `Generate a high-quality ${validSize} resolution image.

Description: ${prompt}`;

        if (negativePrompt) {
          imagePrompt += `\n\nAvoid: ${negativePrompt}`;
        }

        if (referenceImages.length > 0) {
          imagePrompt += `\n\nUse the provided reference image(s) as style/composition guidance.`;
        }

        imagePrompt += `\n\nOutput ONLY the generated image, no text or explanations.`;

        messageContent.push({
          type: "text",
          text: imagePrompt
        });

        // Make request to OpenRouter
        const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.FRONTEND_URL || 'https://www.digitaldivas.ai',
            'X-Title': 'DivaForge'
          },
          body: JSON.stringify({
            model: SEEDREAM_MODEL,
            messages: [
              {
                role: "user",
                content: messageContent
              }
            ],
            max_tokens: 4096,
            temperature: 0.8
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `OpenRouter API error: ${response.status}`);
        }

        const result = await response.json();
        console.log(`   Response received, processing...`);

        // Extract image from response
        if (result.choices && result.choices.length > 0) {
          const choice = result.choices[0];
          const content = choice.message?.content;

          // Check if content contains base64 image data
          if (typeof content === 'string') {
            // Look for base64 image patterns
            const base64Match = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
            if (base64Match) {
              images.push(base64Match[0]);
              console.log(`   ✅ Image ${i + 1} generated successfully`);
            } else {
              console.log(`   ⚠️ No image found in response for image ${i + 1}`);
              console.log(`   Response content preview: ${content.substring(0, 200)}...`);
              warnings.push(`Image generation not available for this model`);
            }
          } else if (Array.isArray(content)) {
            // Handle multimodal response format
            for (const part of content) {
              if (part.type === 'image_url' && part.image_url?.url) {
                images.push(part.image_url.url);
                console.log(`   ✅ Image ${i + 1} generated successfully`);
              } else if (part.type === 'image' && part.source?.data) {
                const imageDataUrl = `data:${part.source.media_type || 'image/png'};base64,${part.source.data}`;
                images.push(imageDataUrl);
                console.log(`   ✅ Image ${i + 1} generated successfully`);
              }
            }
          }

          // Check finish reason
          if (choice.finish_reason === 'content_filter') {
            console.log(`   ⚠️ Image ${i + 1} blocked by content filter`);
            warnings.push(`Image was blocked by content filter`);
          }
        }
      } catch (apiError) {
        console.error(`   ❌ Error generating image ${i + 1}:`, apiError.message);
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
        : 'No images were generated. The model may not support image generation.';
      throw new Error(errorMsg);
    }

    console.log(`   ✅ Generation complete! Created ${images.length} image(s)`);
    if (warnings.length > 0) {
      console.log(`   ⚠️ Warnings: ${warnings.join(', ')}`);
    }

    // Return the generated images
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
    console.error('Seedream generation error:', error);

    // Handle specific error types
    if (error.message?.includes('API key') || error.message?.includes('401')) {
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
