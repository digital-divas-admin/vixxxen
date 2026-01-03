const express = require('express');
const Replicate = require('replicate');

const router = express.Router();

// Initialize Replicate client
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_KEY,
});

// Seedream 4.5 model endpoint (ByteDance official - upgraded version with better reference image support)
const SEEDREAM_MODEL = "bytedance/seedream-4.5";

/**
 * POST /api/seedream/generate
 * Generate an image using Seedream model
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

    if (!process.env.REPLICATE_API_KEY) {
      return res.status(500).json({ error: 'Replicate API key not configured' });
    }

    // Validate reference images (Seedream 4.5 supports up to 14)
    if (referenceImages.length > 14) {
      return res.status(400).json({ error: 'Maximum 14 reference images allowed' });
    }

    // Seedream 4.5 uses 'size' parameter: "2K", "4K", or "custom"
    const validSize = ['2K', '4K'].includes(resolution) ? resolution : '2K';

    console.log(`\n🎨 Generating ${numOutputs} image(s) with Seedream 4.5...`);
    console.log(`   Prompt: ${prompt}`);
    console.log(`   Reference Images: ${referenceImages.length}`);
    console.log(`   Size: ${validSize}`);
    console.log(`   Guidance Scale: ${guidanceScale}`);
    console.log(`   Note: Seedream 4.5 doesn't support batch generation, making ${numOutputs} separate calls`);

    // Seedream 4 doesn't support num_outputs, so we make multiple calls
    // Run sequentially to avoid rate limits for accounts with low credit
    console.log(`   Running ${numOutputs} generation(s) sequentially to avoid rate limits...`);
    const outputs = [];

    for (let i = 0; i < numOutputs; i++) {
      console.log(`   Generating image ${i + 1}/${numOutputs}...`);

      // Build input object according to Seedream 4.5 schema
      const input = {
        prompt,
        size: validSize,
        aspect_ratio: referenceImages.length > 0 ? "match_input_image" : "1:1",
        sequential_image_generation: "disabled",
        max_images: 1
      };

      // Add reference images if provided
      if (referenceImages.length > 0) {
        // Use image_input parameter as per Seedream 4.5 official schema
        input.image_input = referenceImages;
        console.log(`   Using ${referenceImages.length} reference image(s) via image_input parameter (array)`);
        console.log(`   First image preview: ${referenceImages[0].substring(0, 100)}...`);
      } else {
        input.image_input = []; // Empty array when no references
      }

      console.log(`   Input parameters:`, JSON.stringify({
        ...input,
        image_input: input.image_input.length > 0 ? `[${input.image_input.length} images, ${input.image_input[0].substring(0, 50)}...]` : "[]"
      }, null, 2));

      try {
        const output = await replicate.run(SEEDREAM_MODEL, {
          input
        });
        console.log(`   ✅ Image ${i + 1} generated successfully`);
        console.log(`   Output type: ${typeof output}, isArray: ${Array.isArray(output)}`);
        if (Array.isArray(output)) {
          console.log(`   Output contains ${output.length} item(s)`);
        }
        outputs.push(output);
      } catch (apiError) {
        console.error(`   ❌ Error generating image ${i + 1}:`, apiError.message);
        console.error(`   Full error:`, JSON.stringify(apiError, null, 2));
        throw apiError;
      }

      // Small delay between requests to avoid rate limiting
      if (i < numOutputs - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`   ✅ Generation complete!`);
    console.log(`   Received ${outputs.length} response(s)`);

    // Flatten the results (each output might be a single URL or array)
    let images = [];
    outputs.forEach(output => {
      if (Array.isArray(output)) {
        images.push(...output);
      } else {
        images.push(output);
      }
    });

    console.log(`   Final image count: ${images.length}`);

    // Return the generated images
    res.json({
      success: true,
      model: 'seedream-4.5',
      images: images,
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
    if (error.message?.includes('insufficient_quota')) {
      return res.status(402).json({
        error: 'Insufficient funds',
        message: 'Please add credits to your Replicate account at https://replicate.com/account/billing'
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
    model: 'seedream',
    configured: !!process.env.REPLICATE_API_KEY,
    endpoint: SEEDREAM_MODEL,
    status: process.env.REPLICATE_API_KEY ? 'ready' : 'missing_api_key'
  });
});

module.exports = router;
