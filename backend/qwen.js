const express = require('express');
const router = express.Router();

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
        console.log(`   → LoRA ${index + 1}: ${lora} (string format)`);
        defaultLoras[loraKey] = {
          "on": true,
          "lora": lora,
          "strength": 1
        };
      } else {
        console.log(`   → LoRA ${index + 1}: ${lora.name} (object format, strength: ${lora.strength ?? 1})`);
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

// POST /api/qwen/generate - Submit a generation job to RunPod
router.post('/generate', async (req, res) => {
  try {
    const { prompt, negativePrompt, loras, width, height, seed } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
      console.error('❌ RunPod configuration missing');
      return res.status(500).json({
        error: 'RunPod not configured',
        message: 'RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID must be set'
      });
    }

    console.log('🎨 Qwen generation request:', {
      prompt: prompt.substring(0, 100),
      loras,
      width,
      height
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

    // RunPod request body
    const requestBody = {
      input: {
        workflow
      }
    };

    console.log('\n📤 Submitting job to RunPod:');
    console.log(`   Endpoint: ${RUNPOD_BASE_URL}/run`);
    console.log(`   Prompt: ${prompt.substring(0, 100)}...`);

    // Submit job to RunPod
    const response = await fetch(`${RUNPOD_BASE_URL}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RUNPOD_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ RunPod error:', errorText);
      return res.status(response.status).json({
        error: 'Failed to submit job to RunPod',
        details: errorText
      });
    }

    const data = await response.json();
    console.log('📋 RunPod job submitted:', data);

    // Return job ID for status polling
    res.json({
      jobId: data.id,
      status: data.status
    });

  } catch (error) {
    console.error('❌ Qwen generate error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/qwen/status/:jobId - Check job status on RunPod
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
      return res.status(500).json({ error: 'RunPod not configured' });
    }

    const response = await fetch(`${RUNPOD_BASE_URL}/status/${jobId}`, {
      headers: {
        'Authorization': `Bearer ${RUNPOD_API_KEY}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: 'Failed to get job status',
        details: errorText
      });
    }

    const data = await response.json();

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
      console.log('✅ RunPod job completed.');
      console.log('   Output keys:', Object.keys(data.output));
      console.log('   Full output (first 1000 chars):', JSON.stringify(data.output, null, 2).substring(0, 1000));

      // Extract image URL from output
      // RunPod ComfyUI worker can return images in different formats
      if (data.output.images && data.output.images.length > 0) {
        const firstImage = data.output.images[0];
        console.log('   → Found images array with', data.output.images.length, 'items');
        console.log('   → First image type:', typeof firstImage);

        // Handle different image formats
        let base64Data;
        if (typeof firstImage === 'string') {
          // Direct string format
          base64Data = firstImage;
        } else if (firstImage && typeof firstImage === 'object' && firstImage.data) {
          // Object format: { data: "base64string" }
          console.log('   → Image is object with data property');
          base64Data = firstImage.data;
        } else if (firstImage && typeof firstImage === 'object' && firstImage.image) {
          // Object format: { image: "base64string" }
          base64Data = firstImage.image;
        }

        if (base64Data) {
          console.log('   → Base64 data length:', base64Data.length);
          console.log('   → Base64 preview:', base64Data.substring(0, 50));
          result.imageUrl = base64Data.startsWith('data:') ? base64Data : `data:image/png;base64,${base64Data}`;
          result.images = [result.imageUrl];
        } else {
          console.log('   → Could not extract base64 from image object:', JSON.stringify(firstImage).substring(0, 200));
          result.output = data.output;
        }
      } else if (data.output.image) {
        console.log('   → Found single image');
        const imageData = typeof data.output.image === 'object' && data.output.image.data
          ? data.output.image.data
          : data.output.image;
        result.imageUrl = imageData.startsWith('data:') ? imageData : `data:image/png;base64,${imageData}`;
        result.images = [result.imageUrl];
      } else if (data.output.message && typeof data.output.message === 'string') {
        // Base64 output format from ComfyUI worker
        const base64Data = data.output.message;
        console.log('   → Found output.message (length:', base64Data.length, ')');
        console.log('   → Starts with:', base64Data.substring(0, 50));
        // Handle both with and without data: prefix
        result.imageUrl = base64Data.startsWith('data:') ? base64Data : `data:image/png;base64,${base64Data}`;
        result.images = [result.imageUrl];
        console.log('✅ Extracted base64 image from output.message');
      } else {
        // Pass through raw output for debugging
        console.log('   → No recognized image format, passing through raw output');
        result.output = data.output;
      }
    }

    // Include error info if failed
    if (data.status === 'FAILED') {
      console.error('❌ RunPod job failed:', data.error);
      result.error = data.error;
    }

    res.json(result);

  } catch (error) {
    console.error('❌ Qwen status error:', error);
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
