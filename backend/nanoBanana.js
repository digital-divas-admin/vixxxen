const express = require('express');
const { GoogleGenAI, Modality } = require('@google/genai');

const router = express.Router();

// Initialize Google GenAI client
const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY
});

// Nano Banana Pro model (Gemini 3 Pro Image Preview)
const NANO_BANANA_MODEL = "gemini-3-pro-image-preview";

/**
 * POST /api/nano-banana/generate
 * Generate an image using Nano Banana Pro (Gemini 3 Pro Image)
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

    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({ error: 'Google API key not configured' });
    }

    const validAspectRatios = ["1:1", "16:9", "9:16", "4:3", "3:4"];
    if (!validAspectRatios.includes(aspectRatio)) {
      return res.status(400).json({
        error: `Invalid aspect ratio. Must be one of: ${validAspectRatios.join(', ')}`
      });
    }

    console.log(`\n🍌 Generating ${numOutputs} image(s) with Nano Banana Pro...`);
    console.log(`   Prompt: ${prompt}`);
    console.log(`   Aspect Ratio: ${aspectRatio}`);
    console.log(`   Reference Images: ${referenceImages.length}`);
    console.log(`   Model: ${NANO_BANANA_MODEL}`);

    // Generate images sequentially (Google AI API typically generates one at a time)
    const images = [];
    const warnings = [];

    for (let i = 0; i < numOutputs; i++) {
      console.log(`   Generating image ${i + 1}/${numOutputs}...`);

      try {
        let requestContent;

        // If we have reference images, build a multi-part request like the Python example
        // Python: model.generate_content([text_prompt, ref_img])
        if (referenceImages && referenceImages.length > 0) {
          const contentParts = [];

          // Add text prompt first
          contentParts.push({
            text: prompt
          });

          // Add reference images
          for (const imageDataUrl of referenceImages) {
            // Extract base64 data from data URL
            const base64Data = imageDataUrl.split(',')[1];
            const mimeType = imageDataUrl.match(/data:([^;]+);/)?.[1] || 'image/png';

            contentParts.push({
              inlineData: {
                data: base64Data,
                mimeType: mimeType
              }
            });
          }

          requestContent = contentParts;
        } else {
          // Simple text-only request (this was working before)
          requestContent = prompt;
        }

        console.log(`   Request content type:`, Array.isArray(requestContent) ? 'array' : 'string');

        // Use generateContent with the image generation model
        const result = await ai.models.generateContent({
          model: NANO_BANANA_MODEL,
          contents: requestContent
        });

        console.log(`   Response received, processing...`);
        console.log(`   Type of result:`, typeof result);
        console.log(`   Result has candidates?:`, !!result?.candidates);
        console.log(`   Result has response?:`, !!result?.response);

        // Try to access response.candidates if it exists
        const candidatesSource = result?.response?.candidates || result?.candidates;
        console.log(`   Candidates source:`, candidatesSource ? 'found' : 'not found');

        // Extract image data from response according to official Google docs
        if (candidatesSource && candidatesSource.length > 0) {
          const candidate = candidatesSource[0];
          console.log(`   Processing candidate, has content?:`, !!candidate?.content);
          console.log(`   Finish reason:`, candidate?.finishReason);

          // Check for safety blocks
          if (candidate.finishReason === 'IMAGE_SAFETY' || candidate.finishReason === 'SAFETY') {
            console.log(`   ⚠️ Image ${i + 1} blocked by safety filters`);
            warnings.push(`Image was blocked by Google safety filters`);
            continue; // Skip to next image
          }

          // Look for image parts in the response
          if (candidate.content && candidate.content.parts) {
            for (const part of candidate.content.parts) {
              if (part.text) {
                console.log(`   Model text: ${part.text}`);
              } else if (part.inlineData && part.inlineData.data) {
                // Convert base64 to data URL
                const mimeType = part.inlineData.mimeType || 'image/png';
                const imageDataUrl = `data:${mimeType};base64,${part.inlineData.data}`;
                images.push(imageDataUrl);
                console.log(`   ✅ Image ${i + 1} generated successfully (${mimeType})`);
              }
            }
          }
        }

        // If no image was found, log the response structure for debugging
        if (images.length === i) {
          console.log(`   ⚠️ No image found in response for image ${i + 1}`);
          console.log(`   Result keys:`, Object.keys(result));
          console.log(`   Full response:`, JSON.stringify(result, null, 2).substring(0, 5000));

          // Check if there's a response property
          if (result.response) {
            console.log(`   result.response exists, keys:`, Object.keys(result.response));
            console.log(`   result.response:`, JSON.stringify(result.response, null, 2).substring(0, 3000));
          }
        }
      } catch (apiError) {
        console.error(`   ❌ Error generating image ${i + 1}:`, apiError.message);
        if (apiError.response) {
          console.error(`   API Response:`, apiError.response);
        }
        warnings.push(`Image failed`);
        // Don't throw - continue with remaining images
      }

      // Small delay between requests to avoid rate limiting
      if (i < numOutputs - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (images.length === 0) {
      const errorMsg = warnings.length > 0
        ? `No images were generated. ${warnings.join('. ')}`
        : 'No images were generated. The API response may have changed format.';
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
    if (error.message?.includes('API key')) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'Please check your Google AI Studio API key at https://aistudio.google.com/apikey'
      });
    }

    if (error.message?.includes('quota')) {
      return res.status(429).json({
        error: 'Quota exceeded',
        message: 'You have exceeded your API quota. Please check your usage at https://aistudio.google.com/'
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
    configured: !!process.env.GOOGLE_API_KEY,
    endpoint: NANO_BANANA_MODEL,
    status: process.env.GOOGLE_API_KEY ? 'ready' : 'missing_api_key'
  });
});

module.exports = router;
