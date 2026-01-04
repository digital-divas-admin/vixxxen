const express = require('express');
const { OpenRouter } = require('@openrouter/sdk');

const router = express.Router();

// Nano Banana Pro model (Gemini 3 Pro Image Preview via OpenRouter)
const NANO_BANANA_MODEL = "google/gemini-3-pro-image-preview";

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

        // Build image generation prompt with aspect ratio
        let imagePrompt = `Generate an image with aspect ratio ${aspectRatio}: ${prompt}`;

        if (referenceImages.length > 0) {
          imagePrompt += ` Use the provided reference image(s) as style guidance.`;
        }

        messageContent.push({
          type: "text",
          text: imagePrompt
        });

        // Make request to OpenRouter using SDK
        const result = await openrouter.chat.send({
          model: NANO_BANANA_MODEL,
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
