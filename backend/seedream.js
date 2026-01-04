const express = require('express');
const { OpenRouter } = require('@openrouter/sdk');

const router = express.Router();

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

    console.log(`\n🎨 Generating ${numOutputs} image(s) with Seedream 4.5 via OpenRouter...`);
    console.log(`   Prompt: ${prompt}`);
    console.log(`   Reference Images: ${referenceImages.length}`);
    console.log(`   Size: ${validSize}`);
    console.log(`   Guidance Scale: ${guidanceScale}`);
    console.log(`   Model: ${SEEDREAM_MODEL}`);

    // Initialize OpenRouter client
    const openrouter = new OpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY
    });

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
        let imagePrompt = `Generate a high-quality ${validSize} resolution image: ${prompt}`;

        if (negativePrompt) {
          imagePrompt += ` Avoid: ${negativePrompt}`;
        }

        if (referenceImages.length > 0) {
          imagePrompt += ` Use the provided reference image(s) as style/composition guidance.`;
        }

        messageContent.push({
          type: "text",
          text: imagePrompt
        });

        // Make request to OpenRouter using SDK
        const result = await openrouter.chat.send({
          model: SEEDREAM_MODEL,
          messages: [
            {
              role: "user",
              content: messageContent
            }
          ],
          modalities: ["image", "text"]
        });

        console.log(`   Response received, processing...`);

        // Extract images from response
        const message = result.choices[0]?.message;

        if (message?.images && message.images.length > 0) {
          message.images.forEach((image, idx) => {
            const imageUrl = image.image_url?.url;
            if (imageUrl) {
              images.push(imageUrl);
              console.log(`   ✅ Image ${i + 1}.${idx + 1} generated successfully`);
            }
          });
        } else if (message?.content) {
          // Check if content contains base64 image data
          const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
          const base64Match = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
          if (base64Match) {
            images.push(base64Match[0]);
            console.log(`   ✅ Image ${i + 1} generated successfully (base64)`);
          } else {
            console.log(`   ⚠️ No image found in response for image ${i + 1}`);
            console.log(`   Response content preview: ${content.substring(0, 200)}...`);
            warnings.push(`No image in response ${i + 1}`);
          }
        } else {
          console.log(`   ⚠️ No image found in response for image ${i + 1}`);
          warnings.push(`No image in response ${i + 1}`);
        }

        // Check finish reason
        if (result.choices[0]?.finish_reason === 'content_filter') {
          console.log(`   ⚠️ Image ${i + 1} blocked by content filter`);
          warnings.push(`Image was blocked by content filter`);
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
