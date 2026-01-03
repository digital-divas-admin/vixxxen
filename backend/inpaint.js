const express = require('express');
const router = express.Router();

const COMFYUI_BASE_URL = 'http://comfy-api-env.eba-jy7gqi2w.us-east-1.elasticbeanstalk.com/api/v1';
const INPAINT_TIMEOUT = 10 * 60 * 1000; // 10 minutes for cold starts
const POLL_INTERVAL = 3000; // Poll every 3 seconds
const MAX_POLL_ATTEMPTS = 200; // Max 10 minutes of polling

// Helper function to poll for job completion
async function pollJobStatus(statusUrl, jobId) {
  // Build full URL if it's a relative path
  const fullStatusUrl = statusUrl.startsWith('http')
    ? statusUrl
    : `${COMFYUI_BASE_URL.replace('/api/v1', '')}${statusUrl}`;

  console.log(`🔄 Polling job status at: ${fullStatusUrl}`);

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    try {
      console.log(`   Polling attempt ${attempt + 1}/${MAX_POLL_ATTEMPTS}...`);

      const response = await fetch(fullStatusUrl);
      const responseText = await response.text();

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        console.error(`   Failed to parse response as JSON:`, responseText.substring(0, 500));
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        continue;
      }

      console.log(`   Job status: ${data.status}`);
      console.log(`   Response keys: ${Object.keys(data).join(', ')}`);

      if (data.status === 'completed' || data.status === 'success') {
        console.log(`   Full completed response:`, JSON.stringify(data, null, 2).substring(0, 1000));

        // Extract image URL from various possible response formats
        const imageUrl = data.image || data.imageUrl || data.output || data.url || data.result ||
                        (data.images && data.images[0]) ||
                        (data.outputs && data.outputs[0]) ||
                        (data.output && data.output.images && data.output.images[0]);

        if (imageUrl) {
          console.log(`✅ Job completed, image URL found: ${imageUrl.substring(0, 100)}...`);
          return { success: true, image: imageUrl };
        } else {
          console.error('❌ Job completed but no image URL in response:', JSON.stringify(data, null, 2));
          return { success: false, error: 'Job completed but no image URL found', fullResponse: data };
        }
      } else if (data.status === 'failed' || data.status === 'error') {
        console.error(`❌ Job failed!`);
        console.error(`   Error: ${data.error || 'No error message'}`);
        console.error(`   Message: ${data.message || 'No message'}`);
        console.error(`   Full failed response:`, JSON.stringify(data, null, 2));
        return {
          success: false,
          error: data.error || data.message || 'Job failed',
          details: data.details || data.debug || null,
          fullResponse: data
        };
      }

      // Job still processing, wait and retry
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

    } catch (err) {
      console.error(`   Polling error (attempt ${attempt + 1}):`, err.message);
      console.error(`   Error stack:`, err.stack);
      // Continue polling even on network errors
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
  }

  return { success: false, error: 'Job timed out after 5 minutes' };
}

// Image proxy to bypass CORS restrictions
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

    // Set CORS headers and content type
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentType || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    res.send(Buffer.from(buffer));

  } catch (error) {
    console.error('❌ Image proxy failed:', error.message);
    res.status(500).json({ error: 'Proxy failed', message: error.message });
  }
});

// SFW Inpainting
router.post('/inpaint-sfw', async (req, res) => {
  try {
    const { image, prompt, loras = [] } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Image is required (base64 PNG with alpha mask)' });
    }

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log(`🎨 Starting SFW inpaint...`);
    console.log(`   Prompt: ${prompt}`);
    console.log(`   LoRAs: ${loras.length > 0 ? JSON.stringify(loras) : 'none'}`);
    console.log(`   Image base64 length: ${image.length} chars (${Math.round(image.length / 1024)}KB)`);
    console.log(`   Image starts with: ${image.substring(0, 50)}...`);
    console.log(`   Endpoint: ${COMFYUI_BASE_URL}/inpaint-sfw`);

    // Create abort controller for initial request timeout (10 min for cold starts)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), INPAINT_TIMEOUT);

    try {
      const response = await fetch(`${COMFYUI_BASE_URL}/inpaint-sfw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image,
          prompt,
          loras
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ ComfyUI SFW inpaint error:', errorText);
        return res.status(response.status).json({
          error: 'Inpaint failed',
          details: errorText
        });
      }

      const result = await response.json();
      console.log(`📥 Initial response:`, JSON.stringify(result).substring(0, 200));

      // Check if this is an async job response
      if (result.statusUrl || result.jobId) {
        console.log(`🔄 Async job detected, polling for completion...`);
        const pollResult = await pollJobStatus(result.statusUrl, result.jobId);

        if (pollResult.success) {
          return res.json({
            success: true,
            mode: 'sfw',
            image: pollResult.image,
            timestamp: new Date().toISOString()
          });
        } else {
          console.error(`❌ SFW inpaint poll failed:`, pollResult);
          return res.status(500).json({
            error: 'Inpaint failed',
            message: pollResult.error,
            details: pollResult.details || null,
            fullResponse: pollResult.fullResponse || null
          });
        }
      }

      // Direct response with image
      const imageUrl = result.image || result.imageUrl || result.output || result.url;
      if (imageUrl) {
        console.log(`✅ SFW inpaint complete (direct response)`);
        return res.json({
          success: true,
          mode: 'sfw',
          image: imageUrl,
          timestamp: new Date().toISOString()
        });
      }

      // Fallback: return whatever we got
      console.log(`✅ SFW inpaint complete`);
      res.json({
        success: true,
        mode: 'sfw',
        ...result,
        timestamp: new Date().toISOString()
      });

    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('❌ SFW inpaint initial request timed out');
        return res.status(504).json({
          error: 'Inpaint timed out',
          message: 'The ComfyUI server took too long to respond. Please try again.'
        });
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('❌ SFW inpaint failed:', error.message);
    console.error('   Full error:', error);
    res.status(500).json({
      error: 'Inpaint failed',
      message: error.message || 'Unknown error occurred',
      hint: 'The ComfyUI server may be down or unreachable. Check if the API is running.'
    });
  }
});

// NSFW Inpainting
router.post('/inpaint-nsfw', async (req, res) => {
  try {
    const { image, prompt, loras = [] } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Image is required (base64 PNG with alpha mask)' });
    }

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log(`🎨 Starting NSFW inpaint...`);
    console.log(`   Prompt: ${prompt}`);
    console.log(`   LoRAs: ${loras.length > 0 ? JSON.stringify(loras) : 'none'}`);
    console.log(`   Image base64 length: ${image.length} chars (${Math.round(image.length / 1024)}KB)`);
    console.log(`   Image starts with: ${image.substring(0, 50)}...`);
    console.log(`   Endpoint: ${COMFYUI_BASE_URL}/inpaint`);

    // Create abort controller for initial request timeout (10 min for cold starts)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), INPAINT_TIMEOUT);

    try {
      const response = await fetch(`${COMFYUI_BASE_URL}/inpaint`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image,
          prompt,
          loras
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ ComfyUI NSFW inpaint error:', errorText);
        return res.status(response.status).json({
          error: 'Inpaint failed',
          details: errorText
        });
      }

      const result = await response.json();
      console.log(`📥 Initial response:`, JSON.stringify(result).substring(0, 200));

      // Check if this is an async job response
      if (result.statusUrl || result.jobId) {
        console.log(`🔄 Async job detected, polling for completion...`);
        const pollResult = await pollJobStatus(result.statusUrl, result.jobId);

        if (pollResult.success) {
          return res.json({
            success: true,
            mode: 'nsfw',
            image: pollResult.image,
            timestamp: new Date().toISOString()
          });
        } else {
          console.error(`❌ NSFW inpaint poll failed:`, pollResult);
          return res.status(500).json({
            error: 'Inpaint failed',
            message: pollResult.error,
            details: pollResult.details || null,
            fullResponse: pollResult.fullResponse || null
          });
        }
      }

      // Direct response with image
      const imageUrl = result.image || result.imageUrl || result.output || result.url;
      if (imageUrl) {
        console.log(`✅ NSFW inpaint complete (direct response)`);
        return res.json({
          success: true,
          mode: 'nsfw',
          image: imageUrl,
          timestamp: new Date().toISOString()
        });
      }

      // Fallback: return whatever we got
      console.log(`✅ NSFW inpaint complete`);
      res.json({
        success: true,
        mode: 'nsfw',
        ...result,
        timestamp: new Date().toISOString()
      });

    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('❌ NSFW inpaint initial request timed out');
        return res.status(504).json({
          error: 'Inpaint timed out',
          message: 'The ComfyUI server took too long to respond. Please try again.'
        });
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('❌ NSFW inpaint failed:', error.message);
    console.error('   Full error:', error);
    res.status(500).json({
      error: 'Inpaint failed',
      message: error.message || 'Unknown error occurred',
      hint: 'The ComfyUI server may be down or unreachable. Check if the API is running.'
    });
  }
});

module.exports = router;
