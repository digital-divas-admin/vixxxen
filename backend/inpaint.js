const express = require('express');
const router = express.Router();

// RunPod Configuration (shared with qwen.js)
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID;
const RUNPOD_BASE_URL = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}`;

const POLL_INTERVAL = 3000; // Poll every 3 seconds
const MAX_POLL_ATTEMPTS = 200; // Max ~10 minutes of polling

// ============================================================================
// SFW INPAINT WORKFLOW (Qwen-based) - Uses separate image and mask
// ============================================================================
const getSfwInpaintWorkflow = ({ prompt, negativePrompt = '', seed = null, loras = [] }) => {
  const actualSeed = seed ?? Math.floor(Math.random() * 999999999999999);
  const loraConfig = buildLoraConfig(loras, 'sfw');

  // Use separate LoadImage nodes for image and mask
  return {
    "3": {
      "inputs": {
        "seed": actualSeed,
        "steps": 6,
        "cfg": 1,
        "sampler_name": "euler",
        "scheduler": "simple",
        "denoise": 0.6,
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
      "_meta": { "title": "Load Mask" }
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
        "mask": ["4", 1]
      },
      "class_type": "SetLatentNoiseMask",
      "_meta": { "title": "Set Latent Noise Mask" }
    }
  };
};

// ============================================================================
// NSFW INPAINT WORKFLOW (SDXL-based) - Uses separate image and mask
// ============================================================================
const getNsfwInpaintWorkflow = ({ prompt, negativePrompt = '', seed = null, loras = [] }) => {
  const actualSeed = seed ?? Math.floor(Math.random() * 999999999999999);
  const loraConfig = buildLoraConfig(loras, 'nsfw');

  // Use separate LoadImage nodes for image and mask
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
        "denoise": 0.85,
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
      "_meta": { "title": "Load Mask" }
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
      "inputs": { "ckpt_name": "pornmaster_proSDXLV7.safetensors" },
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
        "mask": ["7", 1]
      },
      "class_type": "SetLatentNoiseMask",
      "_meta": { "title": "Set Latent Noise Mask" }
    }
  };
};

// ============================================================================
// LORA CONFIG BUILDER
// ============================================================================
function buildLoraConfig(userLoras = [], mode = 'sfw') {
  // Default LoRAs for SFW (Qwen-based)
  const sfwDefaults = {
    "lora_1": { "on": false, "lora": "", "strength": 1 },
    "lora_2": { "on": true, "lora": "qwen-boreal-portraits-portraits-high-rank.safetensors", "strength": 0.7 },
    "lora_3": { "on": true, "lora": "Qwen-Image-Lightning-4steps-V2.0.safetensors", "strength": 1 }
  };

  // Default LoRAs for NSFW (SDXL-based) - none enabled by default
  const nsfwDefaults = {
    "lora_1": { "on": false, "lora": "", "strength": 1 },
    "lora_2": { "on": false, "lora": "", "strength": 0.8 },
    "lora_3": { "on": false, "lora": "", "strength": 1 }
  };

  const defaults = mode === 'nsfw' ? nsfwDefaults : sfwDefaults;

  // Override with user-provided LoRAs if any
  if (userLoras && userLoras.length > 0) {
    userLoras.forEach((lora, index) => {
      const loraKey = `lora_${index + 1}`;

      // Handle both string format ("lora.safetensors") and object format ({ name: "lora.safetensors", strength: 1 })
      if (typeof lora === 'string') {
        console.log(`   → LoRA ${index + 1}: ${lora} (string format)`);
        defaults[loraKey] = {
          "on": true,
          "lora": lora,
          "strength": 1
        };
      } else {
        console.log(`   → LoRA ${index + 1}: ${lora.name} (object format, strength: ${lora.strength ?? 1})`);
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
// RUNPOD JOB POLLING
// ============================================================================
async function pollRunPodJob(jobId) {
  console.log(`🔄 Polling RunPod job: ${jobId}`);

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    try {
      console.log(`   Polling attempt ${attempt + 1}/${MAX_POLL_ATTEMPTS}...`);

      const response = await fetch(`${RUNPOD_BASE_URL}/status/${jobId}`, {
        headers: { 'Authorization': `Bearer ${RUNPOD_API_KEY}` }
      });

      if (!response.ok) {
        console.error(`   Poll failed with status ${response.status}`);
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        continue;
      }

      const data = await response.json();
      console.log(`   Job status: ${data.status}`);

      if (data.status === 'COMPLETED') {
        console.log(`✅ Job completed!`);
        console.log(`   Output keys:`, data.output ? Object.keys(data.output) : 'none');

        // Extract image from output
        let imageUrl = null;
        if (data.output) {
          if (data.output.images && data.output.images.length > 0) {
            const firstImage = data.output.images[0];
            console.log(`   First image type:`, typeof firstImage);

            // Handle different formats: string, {data: "..."}, {image: "..."}
            let base64Data;
            if (typeof firstImage === 'string') {
              base64Data = firstImage;
            } else if (firstImage && typeof firstImage === 'object' && firstImage.data) {
              console.log(`   → Image is object with data property`);
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
          console.log(`   ✅ Extracted image (length: ${imageUrl.length})`);
          return { success: true, image: imageUrl };
        } else {
          console.error('❌ Job completed but no image in output:', JSON.stringify(data.output, null, 2).substring(0, 500));
          return { success: false, error: 'No image in output', fullResponse: data };
        }
      } else if (data.status === 'FAILED') {
        console.error(`❌ Job failed:`, data.error);
        console.error(`   Full failed response:`, JSON.stringify(data, null, 2).substring(0, 1000));
        return { success: false, error: data.error || 'Job failed', fullResponse: data };
      } else if (data.status === 'CANCELLED') {
        return { success: false, error: 'Job was cancelled' };
      }

      // Still processing, wait and retry
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

    } catch (err) {
      console.error(`   Polling error (attempt ${attempt + 1}):`, err.message);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
  }

  return { success: false, error: 'Job timed out after polling' };
}

// ============================================================================
// SUBMIT JOB TO RUNPOD
// ============================================================================
async function submitToRunPod(workflow, mode, images = []) {
  if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
    throw new Error('RunPod not configured. Set RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID.');
  }

  console.log(`📤 Submitting ${mode} inpaint job to RunPod...`);
  console.log(`   Images to upload: ${images.length}`);

  // Build input payload
  const input = { workflow };

  // Add images if provided (for inpainting)
  if (images.length > 0) {
    input.images = images;
    console.log(`   Image names: ${images.map(i => i.name).join(', ')}`);
  }

  const response = await fetch(`${RUNPOD_BASE_URL}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RUNPOD_API_KEY}`
    },
    body: JSON.stringify({ input })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RunPod submission failed: ${errorText}`);
  }

  const data = await response.json();
  console.log(`📋 Job submitted: ${data.id}`);

  return data.id;
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

    console.log(`🖼️ Proxying image: ${url.substring(0, 100)}...`);

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
    console.error('❌ Image proxy failed:', error.message);
    res.status(500).json({ error: 'Proxy failed', message: error.message });
  }
});

// ============================================================================
// SFW INPAINTING ENDPOINT
// ============================================================================
router.post('/inpaint-sfw', async (req, res) => {
  try {
    const { image, mask, prompt, loras = [] } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }

    if (!mask) {
      return res.status(400).json({ error: 'Mask is required (white=inpaint, black=keep)' });
    }

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log(`🎨 Starting SFW inpaint...`);
    console.log(`   Prompt: ${prompt}`);
    console.log(`   LoRAs: ${loras.length > 0 ? JSON.stringify(loras) : 'none'}`);
    console.log(`   Image size: ${Math.round(image.length / 1024)}KB`);
    console.log(`   Mask size: ${Math.round(mask.length / 1024)}KB`);

    // Strip data URL prefix if present
    let base64Image = image;
    if (image.startsWith('data:')) {
      base64Image = image.split(',')[1];
    }

    let base64Mask = mask;
    if (mask.startsWith('data:')) {
      base64Mask = mask.split(',')[1];
    }

    // Build workflow (images are passed separately)
    const workflow = getSfwInpaintWorkflow({
      prompt,
      negativePrompt: '',
      loras
    });

    // Prepare images array for RunPod (image + mask)
    const images = [
      { name: 'input_image.png', image: base64Image },
      { name: 'mask_image.png', image: base64Mask }
    ];

    // Submit to RunPod with images
    const jobId = await submitToRunPod(workflow, 'SFW', images);

    // Poll for completion
    const result = await pollRunPodJob(jobId);

    if (result.success) {
      return res.json({
        success: true,
        mode: 'sfw',
        image: result.image,
        timestamp: new Date().toISOString()
      });
    } else {
      return res.status(500).json({
        error: 'Inpaint failed',
        message: result.error,
        fullResponse: result.fullResponse
      });
    }

  } catch (error) {
    console.error('❌ SFW inpaint failed:', error.message);
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
    const { image, mask, prompt, loras = [] } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }

    if (!mask) {
      return res.status(400).json({ error: 'Mask is required (white=inpaint, black=keep)' });
    }

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log(`🎨 Starting NSFW inpaint...`);
    console.log(`   Prompt: ${prompt}`);
    console.log(`   LoRAs: ${loras.length > 0 ? JSON.stringify(loras) : 'none'}`);
    console.log(`   Image size: ${Math.round(image.length / 1024)}KB`);
    console.log(`   Mask size: ${Math.round(mask.length / 1024)}KB`);

    // Strip data URL prefix if present
    let base64Image = image;
    if (image.startsWith('data:')) {
      base64Image = image.split(',')[1];
    }

    let base64Mask = mask;
    if (mask.startsWith('data:')) {
      base64Mask = mask.split(',')[1];
    }

    // Build workflow (images are passed separately)
    const workflow = getNsfwInpaintWorkflow({
      prompt,
      negativePrompt: '',
      loras
    });

    // Prepare images array for RunPod (image + mask)
    const images = [
      { name: 'input_image.png', image: base64Image },
      { name: 'mask_image.png', image: base64Mask }
    ];

    // Submit to RunPod with images
    const jobId = await submitToRunPod(workflow, 'NSFW', images);

    // Poll for completion
    const result = await pollRunPodJob(jobId);

    if (result.success) {
      return res.json({
        success: true,
        mode: 'nsfw',
        image: result.image,
        timestamp: new Date().toISOString()
      });
    } else {
      return res.status(500).json({
        error: 'Inpaint failed',
        message: result.error,
        fullResponse: result.fullResponse
      });
    }

  } catch (error) {
    console.error('❌ NSFW inpaint failed:', error.message);
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
