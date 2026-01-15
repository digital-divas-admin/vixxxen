const express = require('express');
const router = express.Router();
const { routeGenerationRequest, getJobStatus } = require('./services/gpuRouter');
const { logger, logGeneration } = require('./services/logger');
const analytics = require('./services/analyticsService');

// RunPod Configuration (shared with qwen.js)
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID;
const RUNPOD_BASE_URL = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}`;

const POLL_INTERVAL = 3000; // Poll every 3 seconds
const MAX_POLL_ATTEMPTS = 200; // Max ~10 minutes of polling

// ============================================================================
// SFW INPAINT WORKFLOW (Qwen-based) - Uses separate image and mask
// ============================================================================
const getSfwInpaintWorkflow = ({ prompt, negativePrompt = '', seed = null, loras = [], denoise = 0.6 }) => {
  const actualSeed = seed ?? Math.floor(Math.random() * 999999999999999);
  const loraConfig = buildLoraConfig(loras, 'sfw');

  // Uses two LoadImage nodes: one for image, one for mask
  // ImageToMask converts the mask image's red channel to a mask tensor
  return {
    "3": {
      "inputs": {
        "seed": actualSeed,
        "steps": 6,
        "cfg": 1,
        "sampler_name": "euler",
        "scheduler": "simple",
        "denoise": denoise,
        "model": ["15", 0],
        "positive": ["6", 0],
        "negative": ["7", 0],
        "latent_image": ["16", 0]
      },
      "class_type": "KSampler",
      "_meta": { "title": "KSampler" }
    },
    "4": {
      "inputs": {
        "image": "mask_image.png"
      },
      "class_type": "LoadImage",
      "_meta": { "title": "Load Mask Image" }
    },
    "5": {
      "inputs": {
        "image": "input_image.png"
      },
      "class_type": "LoadImage",
      "_meta": { "title": "Load Image" }
    },
    "6": {
      "inputs": {
        "text": prompt,
        "clip": ["15", 1]
      },
      "class_type": "CLIPTextEncode",
      "_meta": { "title": "Positive Prompt" }
    },
    "7": {
      "inputs": {
        "text": negativePrompt || "",
        "clip": ["15", 1]
      },
      "class_type": "CLIPTextEncode",
      "_meta": { "title": "Negative Prompt" }
    },
    "8": {
      "inputs": {
        "samples": ["3", 0],
        "vae": ["11", 0]
      },
      "class_type": "VAEDecode",
      "_meta": { "title": "VAE Decode" }
    },
    "9": {
      "inputs": {
        "filename_prefix": "Inpaint_SFW",
        "images": ["8", 0]
      },
      "class_type": "SaveImage",
      "_meta": { "title": "Save Image" }
    },
    "10": {
      "inputs": {
        "clip_name": "qwen_2.5_vl_7b_fp8_scaled.safetensors",
        "type": "qwen_image",
        "device": "default"
      },
      "class_type": "CLIPLoader",
      "_meta": { "title": "Load CLIP" }
    },
    "11": {
      "inputs": { "vae_name": "qwen_image_vae.safetensors" },
      "class_type": "VAELoader",
      "_meta": { "title": "Load VAE" }
    },
    "12": {
      "inputs": {
        "pixels": ["5", 0],
        "vae": ["11", 0]
      },
      "class_type": "VAEEncode",
      "_meta": { "title": "VAE Encode" }
    },
    "14": {
      "inputs": {
        "unet_name": "qwen_image_bf16.safetensors",
        "weight_dtype": "default"
      },
      "class_type": "UNETLoader",
      "_meta": { "title": "Load Diffusion Model" }
    },
    "15": {
      "inputs": {
        "PowerLoraLoaderHeaderWidget": { "type": "PowerLoraLoaderHeaderWidget" },
        ...loraConfig,
        "➕ Add Lora": "",
        "model": ["14", 0],
        "clip": ["10", 0]
      },
      "class_type": "Power Lora Loader (rgthree)",
      "_meta": { "title": "Power Lora Loader (rgthree)" }
    },
    "16": {
      "inputs": {
        "samples": ["12", 0],
        "mask": ["17", 0]
      },
      "class_type": "SetLatentNoiseMask",
      "_meta": { "title": "Set Latent Noise Mask" }
    },
    "17": {
      "inputs": {
        "channel": "red",
        "image": ["4", 0]
      },
      "class_type": "ImageToMask",
      "_meta": { "title": "Image To Mask" }
    }
  };
};

// ============================================================================
// NSFW INPAINT WORKFLOW (SDXL-based) - Uses separate image and mask
// ============================================================================
const getNsfwInpaintWorkflow = ({ prompt, negativePrompt = '', seed = null, loras = [], denoise = 0.6 }) => {
  const actualSeed = seed ?? Math.floor(Math.random() * 999999999999999);
  const loraConfig = buildLoraConfig(loras, 'nsfw');

  // Uses two LoadImage nodes: one for image, one for mask
  // ImageToMask converts the mask image's red channel to a mask tensor
  return {
    "1": {
      "inputs": {
        "samples": ["2", 0],
        "vae": ["13", 2]
      },
      "class_type": "VAEDecode",
      "_meta": { "title": "VAE Decode" }
    },
    "2": {
      "inputs": {
        "seed": actualSeed,
        "steps": 28,
        "cfg": 7,
        "sampler_name": "dpmpp_sde",
        "scheduler": "karras",
        "denoise": denoise,
        "model": ["9", 0],
        "positive": ["12", 0],
        "negative": ["5", 0],
        "latent_image": ["16", 0]
      },
      "class_type": "KSampler",
      "_meta": { "title": "KSampler" }
    },
    "5": {
      "inputs": {
        "text": negativePrompt || "ugly, blurry, low quality",
        "clip": ["9", 1]
      },
      "class_type": "CLIPTextEncode",
      "_meta": { "title": "Negative Prompt" }
    },
    "6": {
      "inputs": {
        "image": "input_image.png"
      },
      "class_type": "LoadImage",
      "_meta": { "title": "Load Image" }
    },
    "7": {
      "inputs": {
        "image": "mask_image.png"
      },
      "class_type": "LoadImage",
      "_meta": { "title": "Load Mask Image" }
    },
    "9": {
      "inputs": {
        "PowerLoraLoaderHeaderWidget": { "type": "PowerLoraLoaderHeaderWidget" },
        ...loraConfig,
        "➕ Add Lora": "",
        "model": ["13", 0],
        "clip": ["13", 1]
      },
      "class_type": "Power Lora Loader (rgthree)",
      "_meta": { "title": "Power Lora Loader (rgthree)" }
    },
    "10": {
      "inputs": {
        "filename_prefix": "Inpaint_NSFW",
        "images": ["1", 0]
      },
      "class_type": "SaveImage",
      "_meta": { "title": "Save Image" }
    },
    "12": {
      "inputs": {
        "text": prompt,
        "clip": ["9", 1]
      },
      "class_type": "CLIPTextEncode",
      "_meta": { "title": "Positive Prompt" }
    },
    "13": {
      "inputs": { "ckpt_name": "DigitalDivasDesire.safetensors" },
      "class_type": "CheckpointLoaderSimple",
      "_meta": { "title": "Load Checkpoint" }
    },
    "14": {
      "inputs": {
        "pixels": ["6", 0],
        "vae": ["13", 2]
      },
      "class_type": "VAEEncode",
      "_meta": { "title": "VAE Encode" }
    },
    "16": {
      "inputs": {
        "samples": ["14", 0],
        "mask": ["17", 0]
      },
      "class_type": "SetLatentNoiseMask",
      "_meta": { "title": "Set Latent Noise Mask" }
    },
    "17": {
      "inputs": {
        "channel": "red",
        "image": ["7", 0]
      },
      "class_type": "ImageToMask",
      "_meta": { "title": "Image To Mask" }
    }
  };
};

// ============================================================================
// LORA CONFIG BUILDER
// ============================================================================
function buildLoraConfig(userLoras = [], mode = 'sfw') {
  // Default: all LoRAs disabled - use "None" to avoid empty string issues with Power Lora Loader
  // When no LoRA is selected, the base model is used directly
  const defaults = {
    "lora_1": { "on": false, "lora": "None", "strength": 1 },
    "lora_2": { "on": false, "lora": "None", "strength": 1 },
    "lora_3": { "on": false, "lora": "None", "strength": 1 }
  };

  // Override with user-provided LoRAs if any
  if (userLoras && userLoras.length > 0) {
    userLoras.forEach((lora, index) => {
      const loraKey = `lora_${index + 1}`;

      // Handle both string format ("lora.safetensors") and object format ({ name: "lora.safetensors", strength: 1 })
      if (typeof lora === 'string') {
        logger.debug('LoRA configured', { index: index + 1, lora, format: 'string' });
        defaults[loraKey] = {
          "on": true,
          "lora": lora,
          "strength": 1
        };
      } else {
        logger.debug('LoRA configured', { index: index + 1, lora: lora.name, format: 'object', strength: lora.strength ?? 1 });
        defaults[loraKey] = {
          "on": lora.enabled !== false,
          "lora": lora.name,
          "strength": lora.strength ?? 1
        };
      }
    });
  }

  return defaults;
}

// ============================================================================
// JOB POLLING (uses GPU router for endpoint-aware status checks)
// ============================================================================
async function pollJob(jobId) {
  logger.debug('Starting job polling', { jobId });

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    try {
      // Use GPU router to get status (routes to correct endpoint)
      const statusResult = await getJobStatus({
        jobId,
        runpodUrl: RUNPOD_BASE_URL,
        runpodApiKey: RUNPOD_API_KEY
      });

      if (!statusResult.success) {
        logger.debug('Poll failed', { attempt: attempt + 1, error: statusResult.error });
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        continue;
      }

      const data = statusResult.data;
      const status = data.status;

      if (status === 'COMPLETED') {
        logger.debug('Job completed', { jobId, outputKeys: data.output ? Object.keys(data.output) : 'none' });

        // Extract image from output
        let imageUrl = null;
        if (data.output) {
          if (data.output.images && data.output.images.length > 0) {
            const firstImage = data.output.images[0];

            // Handle different formats: string, {data: "..."}, {image: "..."}
            let base64Data;
            if (typeof firstImage === 'string') {
              base64Data = firstImage;
            } else if (firstImage && typeof firstImage === 'object' && firstImage.data) {
              base64Data = firstImage.data;
            } else if (firstImage && typeof firstImage === 'object' && firstImage.image) {
              base64Data = firstImage.image;
            }

            if (base64Data) {
              imageUrl = base64Data.startsWith('data:') ? base64Data : `data:image/png;base64,${base64Data}`;
            }
          } else if (data.output.image) {
            const imgData = data.output.image;
            if (typeof imgData === 'string') {
              imageUrl = imgData.startsWith('data:') ? imgData : `data:image/png;base64,${imgData}`;
            } else if (imgData && typeof imgData === 'object' && imgData.data) {
              imageUrl = imgData.data.startsWith('data:') ? imgData.data : `data:image/png;base64,${imgData.data}`;
            }
          } else if (data.output.message) {
            // Base64 output
            const base64Data = data.output.message;
            imageUrl = base64Data.startsWith('data:') ? base64Data : `data:image/png;base64,${base64Data}`;
          }
        }

        if (imageUrl) {
          return { success: true, image: imageUrl, endpoint: statusResult.endpoint };
        } else {
          logger.error('Job completed but no image in output', { jobId });
          return { success: false, error: 'No image in output', fullResponse: data };
        }
      } else if (status === 'FAILED') {
        logger.error('Job failed', { jobId, error: data.error });
        return { success: false, error: data.error || 'Job failed', fullResponse: data };
      } else if (status === 'CANCELLED') {
        return { success: false, error: 'Job was cancelled' };
      }

      // Still processing, wait and retry
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

    } catch (err) {
      logger.debug('Polling error', { attempt: attempt + 1, error: err.message });
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
  }

  return { success: false, error: 'Job timed out after polling' };
}

// ============================================================================
// SUBMIT JOB VIA GPU ROUTER (supports dedicated + serverless)
// ============================================================================
async function submitJob(workflow, mode, images = []) {
  if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
    throw new Error('RunPod not configured. Set RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID.');
  }

  logger.debug('Submitting inpaint job', { mode, imageCount: images.length });

  // NSFW inpaint uses SDXL on serverless, SFW uses Qwen on dedicated
  // Force each to the correct endpoint based on model availability
  const forceEndpoint = mode === 'NSFW' ? 'serverless' : 'dedicated';

  // Route through GPU router (handles dedicated/serverless/hybrid)
  const result = await routeGenerationRequest({
    workflow,
    runpodUrl: RUNPOD_BASE_URL,
    runpodApiKey: RUNPOD_API_KEY,
    images: images.length > 0 ? images : null,
    forceEndpoint
  });

  if (!result.success) {
    throw new Error(`Job submission failed: ${result.error}`);
  }

  logger.info('Inpaint job submitted', {
    jobId: result.jobId,
    endpoint: result.endpoint,
    usedFallback: result.usedFallback || false
  });

  return result.jobId;
}

// ============================================================================
// IMAGE PROXY (for CORS)
// ============================================================================
router.get('/proxy-image', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    logger.debug('Proxying image', { url: url.substring(0, 100) });

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch image' });
    }

    const contentType = response.headers.get('content-type');
    const buffer = await response.arrayBuffer();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentType || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    res.send(Buffer.from(buffer));

  } catch (error) {
    logger.error('Image proxy failed', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Proxy failed', message: error.message });
  }
});

// ============================================================================
// SFW INPAINTING ENDPOINT
// ============================================================================
router.post('/inpaint-sfw', async (req, res) => {
  try {
    const { image, mask, prompt, loras = [], denoise = 0.6 } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }

    if (!mask) {
      return res.status(400).json({ error: 'Mask is required (white=inpaint, black=keep)' });
    }

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    logGeneration('inpaint-sfw', 'started', {
      loraCount: loras.length,
      denoise,
      requestId: req.id
    });

    // Track analytics
    analytics.generation.started('inpaint-sfw', {
      lora_count: loras.length,
      denoise
    }, req);

    // Strip data URL prefix if present
    let base64Image = image;
    if (image.startsWith('data:')) {
      base64Image = image.split(',')[1];
    }
    let base64Mask = mask;
    if (mask.startsWith('data:')) {
      base64Mask = mask.split(',')[1];
    }

    // Build workflow
    const workflow = getSfwInpaintWorkflow({
      prompt,
      negativePrompt: '',
      loras,
      denoise
    });

    // Prepare images array (image + mask)
    const images = [
      { name: 'input_image.png', image: base64Image },
      { name: 'mask_image.png', image: base64Mask }
    ];

    // Submit via GPU router (handles dedicated/serverless routing)
    const jobId = await submitJob(workflow, 'SFW', images);

    // Poll for completion (uses router to query correct endpoint)
    const result = await pollJob(jobId);

    if (result.success) {
      logGeneration('inpaint-sfw', 'completed', { requestId: req.id });
      analytics.generation.completed('inpaint-sfw', {}, req);
      return res.json({
        success: true,
        mode: 'sfw',
        image: result.image,
        endpoint: result.endpoint,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.error('SFW inpaint failed', { error: result.error, requestId: req.id });
      analytics.generation.failed('inpaint-sfw', result.error, {}, req);
      return res.status(500).json({
        error: 'Inpaint failed',
        message: result.error,
        fullResponse: result.fullResponse
      });
    }

  } catch (error) {
    logger.error('SFW inpaint failed', { error: error.message, requestId: req.id });
    analytics.generation.failed('inpaint-sfw', error.message, {}, req);
    res.status(500).json({
      error: 'Inpaint failed',
      message: error.message
    });
  }
});

// ============================================================================
// NSFW INPAINTING ENDPOINT
// ============================================================================
router.post('/inpaint-nsfw', async (req, res) => {
  try {
    const { image, mask, prompt, loras = [], denoise = 0.6 } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }

    if (!mask) {
      return res.status(400).json({ error: 'Mask is required (white=inpaint, black=keep)' });
    }

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    logGeneration('inpaint-nsfw', 'started', {
      loraCount: loras.length,
      denoise,
      requestId: req.id
    });

    // Track analytics
    analytics.generation.started('inpaint-nsfw', {
      lora_count: loras.length,
      denoise
    }, req);

    // Strip data URL prefix if present
    let base64Image = image;
    if (image.startsWith('data:')) {
      base64Image = image.split(',')[1];
    }
    let base64Mask = mask;
    if (mask.startsWith('data:')) {
      base64Mask = mask.split(',')[1];
    }

    // Build workflow
    const workflow = getNsfwInpaintWorkflow({
      prompt,
      negativePrompt: '',
      loras,
      denoise
    });

    // Prepare images array (image + mask)
    const images = [
      { name: 'input_image.png', image: base64Image },
      { name: 'mask_image.png', image: base64Mask }
    ];

    // Submit via GPU router (handles dedicated/serverless routing)
    const jobId = await submitJob(workflow, 'NSFW', images);

    // Poll for completion (uses router to query correct endpoint)
    const result = await pollJob(jobId);

    if (result.success) {
      logGeneration('inpaint-nsfw', 'completed', { requestId: req.id });
      analytics.generation.completed('inpaint-nsfw', {}, req);
      return res.json({
        success: true,
        mode: 'nsfw',
        image: result.image,
        endpoint: result.endpoint,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.error('NSFW inpaint failed', { error: result.error, requestId: req.id });
      analytics.generation.failed('inpaint-nsfw', result.error, {}, req);
      return res.status(500).json({
        error: 'Inpaint failed',
        message: result.error,
        fullResponse: result.fullResponse
      });
    }

  } catch (error) {
    logger.error('NSFW inpaint failed', { error: error.message, requestId: req.id });
    analytics.generation.failed('inpaint-nsfw', error.message, {}, req);
    res.status(500).json({
      error: 'Inpaint failed',
      message: error.message
    });
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================
router.get('/health', (req, res) => {
  res.json({
    service: 'inpaint',
    status: RUNPOD_API_KEY && RUNPOD_ENDPOINT_ID ? 'configured' : 'not configured',
    endpoint: RUNPOD_ENDPOINT_ID ? `...${RUNPOD_ENDPOINT_ID.slice(-6)}` : 'not set',
    modes: ['sfw', 'nsfw']
  });
});

module.exports = router;
