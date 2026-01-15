const express = require('express');
const router = express.Router();
const { routeGenerationRequest, getJobStatus } = require('./services/gpuRouter');
const { logger, logGeneration } = require('./services/logger');

// RunPod Configuration
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID;
const RUNPOD_BASE_URL = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}`;

// Base workflow template for Qwen txt2img
const getWorkflowTemplate = ({ prompt, negativePrompt = '', width = 1152, height = 1536, seed = null, loras = [] }) => {
  // Generate random seed if not provided
  const actualSeed = seed ?? Math.floor(Math.random() * 999999999999999);

  // Build LoRA configuration
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
      "inputs": {
        "text": prompt,
        "clip": ["38", 0]
      },
      "class_type": "CLIPTextEncode",
      "_meta": { "title": "CLIP Text Encode (Positive Prompt)" }
    },
    "7": {
      "inputs": {
        "text": negativePrompt,
        "clip": ["38", 0]
      },
      "class_type": "CLIPTextEncode",
      "_meta": { "title": "CLIP Text Encode (Negative Prompt)" }
    },
    "8": {
      "inputs": {
        "samples": ["3", 0],
        "vae": ["39", 0]
      },
      "class_type": "VAEDecode",
      "_meta": { "title": "VAE Decode" }
    },
    "37": {
      "inputs": {
        "unet_name": "qwen_image_bf16.safetensors",
        "weight_dtype": "default"
      },
      "class_type": "UNETLoader",
      "_meta": { "title": "Load Diffusion Model" }
    },
    "38": {
      "inputs": {
        "clip_name": "qwen_2.5_vl_7b_fp8_scaled.safetensors",
        "type": "qwen_image",
        "device": "default"
      },
      "class_type": "CLIPLoader",
      "_meta": { "title": "Load CLIP" }
    },
    "39": {
      "inputs": {
        "vae_name": "qwen_image_vae.safetensors"
      },
      "class_type": "VAELoader",
      "_meta": { "title": "Load VAE" }
    },
    "58": {
      "inputs": {
        "width": width,
        "height": height,
        "batch_size": 1
      },
      "class_type": "EmptySD3LatentImage",
      "_meta": { "title": "EmptySD3LatentImage" }
    },
    "60": {
      "inputs": {
        "filename_prefix": "txt2img/%date:yyyy-MM-dd%/%date:yyyy-MM-dd%",
        "images": ["8", 0]
      },
      "class_type": "SaveImage",
      "_meta": { "title": "Save Image" }
    },
    "66": {
      "inputs": {
        "shift": 2,
        "model": ["76", 0]
      },
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
};

// Build LoRA configuration from user input
function buildLoraConfig(userLoras = []) {
  // Default LoRAs that are always included
  const defaultLoras = {
    // Character LoRA slot - will be set by user selection
    "lora_1": { "on": false, "lora": "character", "strength": 1 },
    // Boreal portraits - good quality
    "lora_2": { "on": true, "lora": "qwen-boreal-portraits-portraits-high-rank.safetensors", "strength": 0.6 },
    // Lightning LoRA for fast 4-step generation
    "lora_3": { "on": true, "lora": "Qwen-Image-Lightning-4steps-V2.0.safetensors", "strength": 1 }
  };

  // If user provided LoRAs, merge them in
  if (userLoras && userLoras.length > 0) {
    userLoras.forEach((lora, index) => {
      const loraKey = `lora_${index + 1}`;

      // Handle both string format ("lora.safetensors") and object format ({ name: "lora.safetensors", strength: 1 })
      if (typeof lora === 'string') {
        logger.debug('LoRA configured', { index: index + 1, lora, format: 'string' });
        defaultLoras[loraKey] = {
          "on": true,
          "lora": lora,
          "strength": 1
        };
      } else {
        logger.debug('LoRA configured', { index: index + 1, lora: lora.name, format: 'object', strength: lora.strength ?? 1 });
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

// POST /api/qwen/generate - Submit a generation job via GPU router
router.post('/generate', async (req, res) => {
  try {
    const { prompt, negativePrompt, loras, width, height, seed } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
      logger.error('RunPod configuration missing', { requestId: req.id });
      return res.status(500).json({
        error: 'RunPod not configured',
        message: 'RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID must be set'
      });
    }

    logGeneration('qwen', 'started', {
      loraCount: loras?.length || 0,
      width: width || 1152,
      height: height || 1536,
      requestId: req.id
    });

    // Build the workflow
    const workflow = getWorkflowTemplate({
      prompt,
      negativePrompt,
      width: width || 1152,
      height: height || 1536,
      seed,
      loras
    });

    // Route through GPU router (handles dedicated/serverless/hybrid)
    const result = await routeGenerationRequest({
      workflow,
      runpodUrl: RUNPOD_BASE_URL,
      runpodApiKey: RUNPOD_API_KEY
    });

    if (!result.success) {
      logger.error('GPU router error', { error: result.error, requestId: req.id });
      return res.status(500).json({
        error: 'Failed to submit job',
        details: result.error
      });
    }

    logger.info('Job submitted', {
      jobId: result.jobId,
      endpoint: result.endpoint,
      usedFallback: result.usedFallback || false,
      requestId: req.id
    });

    // Return job ID for status polling
    res.json({
      jobId: result.jobId,
      status: result.status,
      endpoint: result.endpoint,
      usedFallback: result.usedFallback || false
    });

  } catch (error) {
    logger.error('Qwen generate error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/qwen/status/:jobId - Check job status via GPU router
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
      return res.status(500).json({ error: 'RunPod not configured' });
    }

    // Get status via GPU router (routes to correct endpoint)
    const statusResult = await getJobStatus({
      jobId,
      runpodUrl: RUNPOD_BASE_URL,
      runpodApiKey: RUNPOD_API_KEY
    });

    if (!statusResult.success) {
      return res.status(500).json({
        error: 'Failed to get job status',
        details: statusResult.error
      });
    }

    const data = statusResult.data;

    // Map RunPod status to our expected format
    const statusMap = {
      'IN_QUEUE': 'queued',
      'IN_PROGRESS': 'processing',
      'COMPLETED': 'completed',
      'FAILED': 'failed',
      'CANCELLED': 'cancelled'
    };

    const result = {
      jobId: data.id,
      status: statusMap[data.status] || data.status,
      rawStatus: data.status
    };

    // If completed, include the output
    if (data.status === 'COMPLETED' && data.output) {
      logger.debug('RunPod job completed', { jobId, outputKeys: Object.keys(data.output) });

      // Extract image URL from output
      // RunPod ComfyUI worker can return images in different formats
      if (data.output.images && data.output.images.length > 0) {
        const firstImage = data.output.images[0];

        // Handle different image formats
        let base64Data;
        if (typeof firstImage === 'string') {
          // Direct string format
          base64Data = firstImage;
        } else if (firstImage && typeof firstImage === 'object' && firstImage.data) {
          // Object format: { data: "base64string" }
          base64Data = firstImage.data;
        } else if (firstImage && typeof firstImage === 'object' && firstImage.image) {
          // Object format: { image: "base64string" }
          base64Data = firstImage.image;
        }

        if (base64Data) {
          result.imageUrl = base64Data.startsWith('data:') ? base64Data : `data:image/png;base64,${base64Data}`;
          result.images = [result.imageUrl];
        } else {
          logger.debug('Could not extract base64 from image object', { jobId });
          result.output = data.output;
        }
      } else if (data.output.image) {
        const imageData = typeof data.output.image === 'object' && data.output.image.data
          ? data.output.image.data
          : data.output.image;
        result.imageUrl = imageData.startsWith('data:') ? imageData : `data:image/png;base64,${imageData}`;
        result.images = [result.imageUrl];
      } else if (data.output.message && typeof data.output.message === 'string') {
        // Base64 output format from ComfyUI worker
        const base64Data = data.output.message;
        // Handle both with and without data: prefix
        result.imageUrl = base64Data.startsWith('data:') ? base64Data : `data:image/png;base64,${base64Data}`;
        result.images = [result.imageUrl];
        logger.debug('Extracted base64 image from output.message', { jobId });
      } else {
        // Pass through raw output for debugging
        logger.debug('No recognized image format', { jobId });
        result.output = data.output;
      }
    }

    // Include error info if failed
    if (data.status === 'FAILED') {
      logger.error('RunPod job failed', { jobId, error: data.error });
      result.error = data.error;
    }

    res.json(result);

  } catch (error) {
    logger.error('Qwen status error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/qwen/health - Health check
router.get('/health', (req, res) => {
  res.json({
    service: 'qwen',
    status: RUNPOD_API_KEY && RUNPOD_ENDPOINT_ID ? 'configured' : 'not configured',
    endpoint: RUNPOD_ENDPOINT_ID ? `...${RUNPOD_ENDPOINT_ID.slice(-6)}` : 'not set'
  });
});

module.exports = router;
