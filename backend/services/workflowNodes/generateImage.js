/**
 * Generate Image Node Executor
 * Handles image generation within workflows
 * Calls WaveSpeed API directly instead of going through HTTP routes
 */

const fetch = require('node-fetch');
const { supabase } = require('../supabase');
const { logger } = require('../logger');
const { compressImages } = require('../imageCompression');

// WaveSpeed API endpoints
const WAVESPEED_TEXT2IMG_URL = 'https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5';
const WAVESPEED_IMG2IMG_URL = 'https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5/edit';

// Credit costs per model
const CREDIT_COSTS = {
  'seedream': 5,
  'nano-banana': 5,
  'qwen': 5
};

// Retry settings
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000;

/**
 * Fetch with retry logic for rate limits
 */
async function fetchWithRetry(url, options, maxRetries = MAX_RETRIES) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429 && attempt < maxRetries) {
        const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        logger.info(`Rate limited, retrying in ${backoffMs}ms...`);
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
 * Execute a Generate Image node
 */
async function executeGenerateImage(config, userId, context) {
  const {
    model = 'seedream',
    character_id,
    prompt,
    facelock_enabled = false,
    facelock_source = 'same',
    facelock_character_id,
    facelock_mode = 'sfw',
    aspect_ratio = '9:16',
    width = 768,
    height = 1344,
    num_outputs = 1
  } = config;

  logger.info('Executing Generate Image node', {
    model,
    character_id,
    facelock_enabled,
    num_outputs
  });

  // Validate prompt
  if (!prompt) {
    throw new Error('Prompt is required');
  }

  // Check for API key
  if (!process.env.WAVESPEED_API_KEY) {
    throw new Error('WaveSpeed API key not configured');
  }

  // Get facelock images if enabled
  let referenceImages = [];
  if (facelock_enabled && (model === 'seedream' || model === 'nano-banana')) {
    const facelockCharId = facelock_source === 'different' ? facelock_character_id : character_id;

    if (facelockCharId) {
      try {
        const { data: facelockData, error } = await supabase
          .from('character_facelock')
          .select(`
            image_url,
            user_images (
              storage_path,
              storage_bucket
            )
          `)
          .eq('user_id', userId)
          .eq('character_id', facelockCharId)
          .eq('mode', facelock_mode)
          .order('position');

        if (!error && facelockData) {
          for (const item of facelockData) {
            let imageUrl = item.image_url;

            // Get signed URL if using user_images
            if (item.user_images?.storage_path) {
              const { data: signedData } = await supabase.storage
                .from(item.user_images.storage_bucket || 'user-images')
                .createSignedUrl(item.user_images.storage_path, 3600);

              if (signedData?.signedUrl) {
                imageUrl = signedData.signedUrl;
              }
            }

            if (imageUrl) {
              referenceImages.push(imageUrl);
            }
          }
        }

        logger.info(`Loaded ${referenceImages.length} facelock images`);
      } catch (err) {
        logger.warn('Failed to load facelock images', { error: err.message });
      }
    }
  }

  // Build character prompt enhancement
  let enhancedPrompt = prompt;
  if (character_id) {
    const { data: character } = await supabase
      .from('characters')
      .select('name, prompt_prefix, prompt_suffix')
      .eq('id', character_id)
      .single();

    if (character) {
      if (character.prompt_prefix) {
        enhancedPrompt = `${character.prompt_prefix} ${enhancedPrompt}`;
      }
      if (character.prompt_suffix) {
        enhancedPrompt = `${enhancedPrompt} ${character.prompt_suffix}`;
      }
    }
  }

  // Generate images by calling WaveSpeed API directly
  let images = [];

  try {
    const hasReferenceImage = referenceImages.length > 0;
    const apiEndpoint = hasReferenceImage ? WAVESPEED_IMG2IMG_URL : WAVESPEED_TEXT2IMG_URL;

    // Compress reference images if present
    let compressedReferenceImages = [];
    if (hasReferenceImage) {
      compressedReferenceImages = await compressImages(referenceImages, {
        maxDimension: 1024,
        quality: 75
      });
    }

    // Build prompt with negative prompt
    let imagePrompt = enhancedPrompt;
    imagePrompt += ' Avoid: worst quality, low quality, blurry, distorted';

    if (compressedReferenceImages.length > 0) {
      imagePrompt = `Use these reference images as style guide. ${imagePrompt}`;
    }

    // Validate dimensions
    const validatedWidth = Math.min(Math.max(parseInt(width) || 768, 512), 4096);
    const validatedHeight = Math.min(Math.max(parseInt(height) || 1344, 512), 4096);
    const sizeString = `${validatedWidth}*${validatedHeight}`;

    // Build request body
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
        n: Math.min(num_outputs, 4),
        enable_base64_output: true,
        enable_sync_mode: true
      };
    }

    logger.info('Calling WaveSpeed API', {
      endpoint: hasReferenceImage ? 'img2img' : 'text2img',
      width: validatedWidth,
      height: validatedHeight,
      referenceImages: compressedReferenceImages.length
    });

    const response = await fetchWithRetry(apiEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`WaveSpeed API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    // Parse response - handle various response formats
    if (result.data && result.data.outputs) {
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
      images.push(result.data.url);
    } else if (result.data && result.data.base64) {
      images.push(`data:image/png;base64,${result.data.base64}`);
    } else if (result.outputs) {
      for (const output of result.outputs) {
        if (typeof output === 'string') {
          images.push(output.startsWith('http') ? output : `data:image/png;base64,${output}`);
        } else if (output.url) {
          images.push(output.url);
        } else if (output.base64) {
          images.push(`data:image/png;base64,${output.base64}`);
        }
      }
    } else if (result.output) {
      if (typeof result.output === 'string') {
        images.push(result.output.startsWith('http') ? result.output : `data:image/png;base64,${result.output}`);
      }
    }

    if (images.length === 0) {
      logger.warn('No images in WaveSpeed response', { result: JSON.stringify(result).substring(0, 500) });
      throw new Error('No images were generated');
    }

    logger.info('WaveSpeed generation successful', { imageCount: images.length });

  } catch (error) {
    logger.error('Image generation failed', { error: error.message, model });
    throw error;
  }

  // Deduct credits
  const creditsUsed = CREDIT_COSTS[model] * num_outputs;

  const { error: creditError } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: creditsUsed,
    p_description: `Workflow: Generate Image (${model})`
  });

  if (creditError) {
    logger.warn('Failed to deduct credits', { error: creditError.message });
  }

  logger.info('Generate Image node completed', {
    model,
    imagesGenerated: images.length,
    creditsUsed
  });

  return {
    output: {
      image_url: images[0],
      image_urls: images
    },
    creditsUsed
  };
}

module.exports = { executeGenerateImage };
