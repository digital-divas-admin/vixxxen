/**
 * Generate Image Node Executor
 * Handles image generation within workflows
 */

const fetch = require('node-fetch');
const { supabase } = require('../supabase');
const { logger } = require('../logger');

// Credit costs per model
const CREDIT_COSTS = {
  'seedream': 5,
  'nano-banana': 5,
  'qwen': 5
};

/**
 * Execute a Generate Image node
 *
 * @param {Object} config - Node configuration
 * @param {string} config.model - 'seedream', 'nano-banana', or 'qwen'
 * @param {string} config.character_id - Character ID for LoRA
 * @param {string} config.prompt - Image prompt
 * @param {boolean} config.facelock_enabled - Whether to use facelock
 * @param {string} config.facelock_source - 'same' or 'different'
 * @param {string} config.facelock_character_id - Character ID for facelock (if different)
 * @param {string} config.facelock_mode - 'sfw' or 'nsfw'
 * @param {string} config.aspect_ratio - Aspect ratio (for nano-banana)
 * @param {number} config.width - Width (for seedream)
 * @param {number} config.height - Height (for seedream)
 * @param {number} config.num_outputs - Number of images to generate
 * @param {string} userId - User ID executing the workflow
 * @param {Object} context - Workflow context with previous node outputs
 * @returns {Object} { output: { image_url, image_urls }, creditsUsed }
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
    // Get character details for LoRA/prompt enhancement
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

  // Call the appropriate generation endpoint
  let images = [];
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';

  try {
    let endpoint, payload;

    if (model === 'seedream') {
      endpoint = `${baseUrl}/api/seedream/generate`;
      payload = {
        prompt: enhancedPrompt,
        width,
        height,
        numOutputs: num_outputs,
        referenceImages
      };
    } else if (model === 'nano-banana') {
      endpoint = `${baseUrl}/api/nano-banana/generate`;
      payload = {
        prompt: enhancedPrompt,
        aspectRatio: aspect_ratio,
        numOutputs: num_outputs,
        referenceImages
      };
    } else {
      throw new Error(`Unsupported model: ${model}`);
    }

    // Make internal API call
    // Note: In production, this should use internal service calls
    // For now, we'll call the endpoint directly
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Use service-level auth for internal calls
        'x-workflow-internal': 'true'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Generation failed: ${response.status}`);
    }

    const result = await response.json();
    images = result.images || [];

    if (images.length === 0) {
      throw new Error('No images were generated');
    }

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
