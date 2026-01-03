const express = require('express');
const router = express.Router();

const COMFY_API_BASE = 'http://comfy-api-env.eba-jy7gqi2w.us-east-1.elasticbeanstalk.com';
const REQUEST_TIMEOUT = 10 * 60 * 1000; // 10 minutes for cold starts

// POST /api/qwen/generate - Submit a generation job to ComfyUI
router.post('/generate', async (req, res) => {
  try {
    const { prompt, loras, width, height } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log('🎨 Qwen generation request:', { prompt: prompt.substring(0, 100), loras, width, height });

    // Build request body
    const requestBody = {
      prompt,
      loras: loras || []
    };

    // Add dimensions if provided (defaults to 1152x1536 on server)
    if (width) requestBody.width = width;
    if (height) requestBody.height = height;

    // Log full request details
    const endpoint = `${COMFY_API_BASE}/api/v1/generate`;
    console.log('\n📤 FULL REQUEST TO COMFYUI:');
    console.log(`   URL: ${endpoint}`);
    console.log(`   Method: POST`);
    console.log(`   Headers: { "Content-Type": "application/json" }`);
    console.log(`   Body: ${JSON.stringify(requestBody, null, 2)}`);
    console.log('\n   Equivalent curl command:');
    console.log(`   curl -X POST "${endpoint}" \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '${JSON.stringify(requestBody)}'`);
    console.log('');

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      // Submit job to ComfyUI
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('ComfyUI error:', errorData);
        return res.status(response.status).json({
          error: errorData.error || 'Failed to submit job to ComfyUI'
        });
      }

      const data = await response.json();
      console.log('📋 ComfyUI job submitted:', data);

      res.json(data);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('❌ Qwen generation request timed out after 10 minutes');
        return res.status(504).json({
          error: 'Request timed out',
          message: 'The server took too long to respond. It may be warming up - please try again.'
        });
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('Qwen generate error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/qwen/status/:jobId - Check job status
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(`${COMFY_API_BASE}/api/v1/status/${jobId}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: errorData.error || 'Failed to get job status'
      });
    }

    const data = await response.json();

    // Log completed job response to see structure
    if (data.status === 'completed' || data.status === 'success' || data.state === 'completed') {
      console.log('✅ ComfyUI job completed. Response keys:', Object.keys(data));
      console.log('✅ Full response:', JSON.stringify(data, null, 2).substring(0, 2000));
    }

    res.json(data);
  } catch (error) {
    console.error('Qwen status error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

module.exports = router;
