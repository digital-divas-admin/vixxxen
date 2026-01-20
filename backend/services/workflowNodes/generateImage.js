/**
 * Generate Image Node Executor
 * Handles image generation within workflows
 * Supports: Seedream (WaveSpeed), Nano Banana (OpenRouter), Qwen (RunPod)
 */

const fetch = require('node-fetch');
const { supabase } = require('../supabase');
const { logger } = require('../logger');
const { compressImages } = require('../imageCompression');
const { routeGenerationRequest, getJobStatus } = require('../gpuRouter');

// API Endpoints
const WAVESPEED_TEXT2IMG_URL = 'https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5';
const WAVESPEED_IMG2IMG_URL = 'https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5/edit';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const NANO_BANANA_MODEL = 'google/gemini-3-pro-image-preview';

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
 * Fetch URL and convert to base64 data URL
 */
async function fetchUrlToBase64(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const buffer = await response.buffer();
    const contentType = response.headers.get('content-type') || 'image/png';
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch (error) {
    logger.warn('Failed to fetch URL to base64', { error: error.message });
    return null;
  }
}

/**
 * Get facelock reference images for a character (as base64 data URLs)
 */
async function getFacelockImages(userId, characterId, mode = 'sfw') {
  const referenceImages = [];

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
      .eq('character_id', characterId)
      .eq('mode', mode)
      .order('position');

    if (!error && facelockData) {
      for (const item of facelockData) {
        let imageUrl = item.image_url;

        if (item.user_images?.storage_path) {
          const { data: signedData } = await supabase.storage
            .from(item.user_images.storage_bucket || 'user-images')
            .createSignedUrl(item.user_images.storage_path, 3600);

          if (signedData?.signedUrl) {
            imageUrl = signedData.signedUrl;
          }
        }

        if (imageUrl) {
          // Convert HTTP URLs to base64
          if (imageUrl.startsWith('http')) {
            const base64Url = await fetchUrlToBase64(imageUrl);
            if (base64Url) {
              referenceImages.push(base64Url);
            }
          } else {
            // Already base64 or data URL
            referenceImages.push(imageUrl);
          }
        }
      }
    }

    logger.info(`Loaded ${referenceImages.length} facelock images`);
  } catch (err) {
    logger.warn('Failed to load facelock images', { error: err.message });
  }

  return referenceImages;
}

/**
 * Enhance prompt with character prefix/suffix
 */
async function enhancePromptWithCharacter(prompt, characterId) {
  if (!characterId) return prompt;

  const { data: character } = await supabase
    .from('characters')
    .select('name, prompt_prefix, prompt_suffix')
    .eq('id', characterId)
    .single();

  if (character) {
    if (character.prompt_prefix) {
      prompt = `${character.prompt_prefix} ${prompt}`;
    }
    if (character.prompt_suffix) {
      prompt = `${prompt} ${character.prompt_suffix}`;
    }
  }

  return prompt;
}

/**
 * Generate image using Seedream (WaveSpeed API)
 */
async function generateWithSeedream(config, userId, referenceImages) {
  if (!process.env.WAVESPEED_API_KEY) {
    throw new Error('WaveSpeed API key not configured');
  }

  const { prompt, width = 2048, height = 2048, num_outputs = 1 } = config;
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

  // Build prompt
  let imagePrompt = prompt + ' Avoid: worst quality, low quality, blurry, distorted';
  if (compressedReferenceImages.length > 0) {
    imagePrompt = `Use these reference images as style guide. ${imagePrompt}`;
  }

  // Validate dimensions - img2img requires minimum 3,686,400 pixels (1920x1920)
  let validatedWidth = Math.min(Math.max(parseInt(width) || 2048, 512), 4096);
  let validatedHeight = Math.min(Math.max(parseInt(height) || 2048, 512), 4096);

  // Ensure minimum pixel count for img2img mode
  const MIN_PIXELS_IMG2IMG = 3686400; // ~1920x1920
  if (hasReferenceImage && (validatedWidth * validatedHeight) < MIN_PIXELS_IMG2IMG) {
    // Scale up proportionally to meet minimum
    const currentPixels = validatedWidth * validatedHeight;
    const scale = Math.sqrt(MIN_PIXELS_IMG2IMG / currentPixels);
    validatedWidth = Math.ceil(validatedWidth * scale);
    validatedHeight = Math.ceil(validatedHeight * scale);
    logger.info('Scaled up dimensions for img2img minimum', {
      originalWidth: width, originalHeight: height,
      scaledWidth: validatedWidth, scaledHeight: validatedHeight
    });
  }

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
    logger.error('WaveSpeed API error', { status: response.status, error: errorText });
    throw new Error(`WaveSpeed API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  logger.info('WaveSpeed API response', {
    hasData: !!result.data,
    hasId: !!result.id,
    keys: Object.keys(result)
  });

  // Parse the response
  let images = parseWaveSpeedResponse(result);

  // Handle async mode - if we got a task ID, poll for result
  if (images.length === 0 && result.id && !result.data) {
    logger.info('WaveSpeed returned task ID, polling for result', { taskId: result.id });
    const taskResult = await pollWaveSpeedTask(result.id);
    images = parseWaveSpeedResponse(taskResult);
  }

  if (images.length === 0) {
    logger.warn('No images in WaveSpeed response', { response: JSON.stringify(result).substring(0, 500) });
  }

  return images;
}

/**
 * Poll WaveSpeed task for completion
 */
async function pollWaveSpeedTask(taskId) {
  // IMPORTANT: Must use /result suffix - matches working seedream.js implementation
  const pollUrl = `https://api.wavespeed.ai/api/v3/predictions/${taskId}/result`;
  const maxAttempts = 60; // 2 minutes max
  const pollInterval = 2000; // 2 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const response = await fetch(pollUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.WAVESPEED_API_KEY}`
      }
    });

    if (!response.ok) {
      logger.warn('Poll request failed', { status: response.status, attempt });
      continue;
    }

    const result = await response.json();
    logger.info('Poll result', { status: result.status, attempt });

    if (result.status === 'completed' || result.status === 'succeeded') {
      // Return result.data if available, otherwise result (matches seedream.js)
      return result.data || result;
    }

    if (result.status === 'failed' || result.status === 'error') {
      throw new Error(`WaveSpeed task failed: ${result.error || 'Unknown error'}`);
    }

    // If we have output data already, return it
    if (result.outputs || result.output || (result.data && (result.data.outputs || result.data.url))) {
      return result.data || result;
    }
  }

  throw new Error('WaveSpeed task timed out after 2 minutes');
}

/**
 * Parse WaveSpeed API response
 */
function parseWaveSpeedResponse(result) {
  const images = [];

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

  return images;
}

/**
 * Generate image using Nano Banana (OpenRouter/Gemini)
 */
async function generateWithNanoBanana(config, userId, referenceImages) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured');
  }

  const { prompt, aspect_ratio = '9:16', num_outputs = 1 } = config;

  // Compress reference images if present
  let compressedReferenceImages = [];
  if (referenceImages.length > 0) {
    compressedReferenceImages = await compressImages(referenceImages, {
      maxDimension: 1536,
      quality: 80
    });
  }

  const images = [];

  for (let i = 0; i < num_outputs; i++) {
    // Build messages array
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
      image_config: {
        aspect_ratio: aspect_ratio
      }
    };

    logger.info('Calling OpenRouter API', { model: NANO_BANANA_MODEL, aspectRatio: aspect_ratio });

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
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const extractedImages = parseOpenRouterResponse(result);
    images.push(...extractedImages);
  }

  return images;
}

/**
 * Parse OpenRouter API response
 */
function parseOpenRouterResponse(result) {
  const images = [];
  const message = result.choices?.[0]?.message;

  if (!message) return images;

  // Method 1: Check message.images array
  if (message.images && message.images.length > 0) {
    message.images.forEach(image => {
      const imageUrl = image.image_url?.url || image.url;
      if (imageUrl) images.push(imageUrl);
    });
  }

  // Method 2: Check content as array of parts
  if (images.length === 0 && Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part.inline_data?.data) {
        const mimeType = part.inline_data.mime_type || 'image/png';
        images.push(`data:${mimeType};base64,${part.inline_data.data}`);
      }
      if (part.type === 'image_url' && part.image_url?.url) {
        images.push(part.image_url.url);
      }
      if (part.type === 'image' && part.b64_json) {
        images.push(`data:image/png;base64,${part.b64_json}`);
      }
    }
  }

  // Method 3: Check content as string for base64 data
  if (images.length === 0 && message.content && typeof message.content === 'string') {
    const base64Match = message.content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
    if (base64Match) {
      images.push(base64Match[0]);
    }
  }

  // Method 4: Check result.data
  if (images.length === 0 && result.data) {
    if (Array.isArray(result.data)) {
      for (const item of result.data) {
        if (item.b64_json) {
          images.push(`data:image/png;base64,${item.b64_json}`);
        }
        if (item.url) {
          images.push(item.url);
        }
      }
    }
  }

  return images;
}

/**
 * Generate image using Qwen (RunPod)
 */
async function generateWithQwen(config, userId) {
  if (!process.env.RUNPOD_API_KEY || !process.env.RUNPOD_ENDPOINT_ID) {
    throw new Error('RunPod API key or endpoint not configured');
  }

  const { prompt, character_id, width = 1152, height = 1536 } = config;

  // Get character LoRA if available
  let loras = [];
  if (character_id) {
    const { data: character } = await supabase
      .from('characters')
      .select('lora_url, lora_strength')
      .eq('id', character_id)
      .single();

    if (character?.lora_url) {
      loras.push({
        name: character.lora_url,
        strength: character.lora_strength || 1
      });
    }
  }

  // Build ComfyUI workflow
  const workflow = buildQwenWorkflow({
    prompt,
    negativePrompt: '',
    width: parseInt(width) || 1152,
    height: parseInt(height) || 1536,
    loras
  });

  const runpodUrl = `https://api.runpod.ai/v2/${process.env.RUNPOD_ENDPOINT_ID}`;

  logger.info('Submitting Qwen job to RunPod', { width, height, loraCount: loras.length });

  // Submit job
  const submitResult = await routeGenerationRequest({
    workflow,
    runpodUrl,
    runpodApiKey: process.env.RUNPOD_API_KEY
  });

  if (!submitResult.success) {
    throw new Error(`Failed to submit Qwen job: ${submitResult.error}`);
  }

  const jobId = submitResult.jobId;
  logger.info('Qwen job submitted', { jobId });

  // Poll for completion (max 5 minutes)
  const maxWaitTime = 5 * 60 * 1000;
  const pollInterval = 2000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const statusResult = await getJobStatus({
      jobId,
      runpodUrl,
      runpodApiKey: process.env.RUNPOD_API_KEY
    });

    if (!statusResult.success) {
      logger.warn('Failed to get job status', { jobId, error: statusResult.error });
      continue;
    }

    const data = statusResult.data;

    if (data.status === 'COMPLETED') {
      logger.info('Qwen job completed', { jobId });
      return parseQwenResponse(data.output);
    }

    if (data.status === 'FAILED' || data.status === 'CANCELLED') {
      throw new Error(`Qwen job ${data.status.toLowerCase()}: ${data.error || 'Unknown error'}`);
    }

    // Still processing, continue polling
  }

  throw new Error('Qwen job timed out after 5 minutes');
}

/**
 * Build Qwen ComfyUI workflow
 */
function buildQwenWorkflow({ prompt, negativePrompt = '', width = 1152, height = 1536, seed = null, loras = [] }) {
  const actualSeed = seed ?? Math.floor(Math.random() * 999999999999999);
  const loraConfig = buildLoraConfig(loras);

  return {
    "3": {
      "inputs": {
        "seed": actualSeed,
        "steps": 4,
        "cfg": 1,
        "sampler_name": "euler",
        "scheduler": "simple",
        "denoise": 1,
        "model": ["66", 0],
        "positive": ["6", 0],
        "negative": ["7", 0],
        "latent_image": ["58", 0]
      },
      "class_type": "KSampler",
      "_meta": { "title": "KSampler" }
    },
    "6": {
      "inputs": { "text": prompt, "clip": ["38", 0] },
      "class_type": "CLIPTextEncode",
      "_meta": { "title": "CLIP Text Encode (Positive Prompt)" }
    },
    "7": {
      "inputs": { "text": negativePrompt, "clip": ["38", 0] },
      "class_type": "CLIPTextEncode",
      "_meta": { "title": "CLIP Text Encode (Negative Prompt)" }
    },
    "8": {
      "inputs": { "samples": ["3", 0], "vae": ["39", 0] },
      "class_type": "VAEDecode",
      "_meta": { "title": "VAE Decode" }
    },
    "37": {
      "inputs": { "unet_name": "qwen_image_bf16.safetensors", "weight_dtype": "default" },
      "class_type": "UNETLoader",
      "_meta": { "title": "Load Diffusion Model" }
    },
    "38": {
      "inputs": { "clip_name": "qwen_2.5_vl_7b_fp8_scaled.safetensors", "type": "qwen_image", "device": "default" },
      "class_type": "CLIPLoader",
      "_meta": { "title": "Load CLIP" }
    },
    "39": {
      "inputs": { "vae_name": "qwen_image_vae.safetensors" },
      "class_type": "VAELoader",
      "_meta": { "title": "Load VAE" }
    },
    "58": {
      "inputs": { "width": width, "height": height, "batch_size": 1 },
      "class_type": "EmptySD3LatentImage",
      "_meta": { "title": "EmptySD3LatentImage" }
    },
    "65": {
      "inputs": { "filename_prefix": "qwen_output", "images": ["8", 0] },
      "class_type": "SaveImage",
      "_meta": { "title": "Save Image" }
    },
    "66": {
      "inputs": { "shift": 2, "model": ["76", 0] },
      "class_type": "ModelSamplingAuraFlow",
      "_meta": { "title": "ModelSamplingAuraFlow" }
    },
    "76": {
      "inputs": {
        "PowerLoraLoaderHeaderWidget": { "type": "PowerLoraLoaderHeaderWidget" },
        ...loraConfig,
        "➕ Add Lora": "",
        "model": ["37", 0]
      },
      "class_type": "Power Lora Loader (rgthree)",
      "_meta": { "title": "Power Lora Loader (rgthree)" }
    }
  };
}

/**
 * Build LoRA configuration for Qwen
 */
function buildLoraConfig(userLoras = []) {
  const defaultLoras = {
    "lora_1": { "on": false, "lora": "character", "strength": 1 },
    "lora_2": { "on": true, "lora": "qwen-boreal-portraits-portraits-high-rank.safetensors", "strength": 0.6 },
    "lora_3": { "on": true, "lora": "Qwen-Image-Lightning-4steps-V2.0.safetensors", "strength": 1 }
  };

  if (userLoras && userLoras.length > 0) {
    userLoras.forEach((lora, index) => {
      const loraKey = `lora_${index + 1}`;
      if (typeof lora === 'string') {
        defaultLoras[loraKey] = { "on": true, "lora": lora, "strength": 1 };
      } else {
        defaultLoras[loraKey] = {
          "on": lora.enabled !== false,
          "lora": lora.name,
          "strength": lora.strength ?? 1
        };
      }
    });
  }

  return defaultLoras;
}

/**
 * Parse Qwen RunPod response
 */
function parseQwenResponse(output) {
  const images = [];

  if (output?.images && output.images.length > 0) {
    for (const image of output.images) {
      let base64Data;
      if (typeof image === 'string') {
        base64Data = image;
      } else if (image?.data) {
        base64Data = image.data;
      } else if (image?.image) {
        base64Data = image.image;
      }

      if (base64Data) {
        images.push(base64Data.startsWith('data:') ? base64Data : `data:image/png;base64,${base64Data}`);
      }
    }
  } else if (output?.image) {
    const imageData = typeof output.image === 'object' && output.image.data
      ? output.image.data
      : output.image;
    images.push(imageData.startsWith('data:') ? imageData : `data:image/png;base64,${imageData}`);
  }

  return images;
}

/**
 * Execute a Generate Image node
 */
async function executeGenerateImage(config, userId, context) {
  const {
    model = 'seedream',
    character_id,
    prompt,
    prompts, // Array of prompts from Generate Prompts node
    facelock_enabled = false,
    facelock_source = 'same',
    facelock_character_id,
    facelock_mode = 'sfw',
    num_outputs = 1
  } = config;

  // Determine prompts to process - either array from connected node or single prompt
  let promptsToProcess = [];
  if (prompts && Array.isArray(prompts) && prompts.length > 0) {
    promptsToProcess = prompts;
    logger.info('Executing Generate Image node with prompts array', {
      model,
      character_id,
      facelock_enabled,
      promptCount: prompts.length
    });
  } else if (prompt) {
    promptsToProcess = [prompt];
    logger.info('Executing Generate Image node with single prompt', {
      model,
      character_id,
      facelock_enabled,
      num_outputs
    });
  } else {
    throw new Error('Prompt is required (either single prompt or prompts array)');
  }

  // Get facelock images once (used for all generations)
  let referenceImages = [];
  if (facelock_enabled && (model === 'seedream' || model === 'nano-banana')) {
    const facelockCharId = facelock_source === 'different' ? facelock_character_id : character_id;
    if (facelockCharId) {
      referenceImages = await getFacelockImages(userId, facelockCharId, facelock_mode);
    }
  }

  // Generate images for each prompt
  let allImages = [];
  let generationCount = 0;

  for (const currentPrompt of promptsToProcess) {
    // Enhance prompt with character prefix/suffix
    const enhancedPrompt = await enhancePromptWithCharacter(currentPrompt, character_id);

    const enhancedConfig = {
      ...config,
      prompt: enhancedPrompt,
      num_outputs: 1 // Generate one image per prompt when using array
    };

    logger.info('Generating image', {
      promptIndex: generationCount + 1,
      totalPrompts: promptsToProcess.length,
      model
    });

    try {
      let images = [];

      switch (model) {
        case 'seedream':
          images = await generateWithSeedream(enhancedConfig, userId, referenceImages);
          break;
        case 'nano-banana':
          images = await generateWithNanoBanana(enhancedConfig, userId, referenceImages);
          break;
        case 'qwen':
          images = await generateWithQwen(enhancedConfig, userId);
          break;
        default:
          throw new Error(`Unsupported model: ${model}`);
      }

      if (images.length > 0) {
        allImages.push(...images);
        generationCount++;
      }
    } catch (error) {
      logger.error('Failed to generate image for prompt', {
        promptIndex: generationCount + 1,
        error: error.message
      });
      // Continue with other prompts even if one fails
    }
  }

  if (allImages.length === 0) {
    throw new Error('No images were generated');
  }

  logger.info('Image generation successful', {
    model,
    imageCount: allImages.length,
    promptsProcessed: generationCount,
    totalPrompts: promptsToProcess.length
  });

  // Deduct credits based on actual generations
  const creditsUsed = CREDIT_COSTS[model] * generationCount;

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
    imagesGenerated: allImages.length,
    creditsUsed
  });

  return {
    output: {
      image_url: allImages[0],
      image_urls: allImages
    },
    creditsUsed
  };
}

module.exports = { executeGenerateImage };
