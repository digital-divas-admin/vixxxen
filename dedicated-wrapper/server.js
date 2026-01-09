/**
 * ComfyUI RunPod-Compatible Wrapper
 *
 * Exposes a RunPod-compatible API interface for a local ComfyUI instance.
 * This allows seamless switching between dedicated GPU and serverless.
 *
 * API Endpoints (matching RunPod Serverless):
 * - POST /run - Submit a generation job
 * - GET /status/:jobId - Check job status
 * - GET /health - Health check with queue info
 */

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Configuration
const COMFYUI_HOST = process.env.COMFYUI_HOST || '127.0.0.1';
const COMFYUI_PORT = process.env.COMFYUI_PORT || '8188';
const COMFYUI_URL = `http://${COMFYUI_HOST}:${COMFYUI_PORT}`;
const PORT = process.env.PORT || 3000;

// In-memory job tracking
// Maps our jobId -> { promptId, status, output, error, createdAt }
const jobs = new Map();

// Clean up old jobs (older than 1 hour)
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [jobId, job] of jobs.entries()) {
    if (job.createdAt < oneHourAgo) {
      jobs.delete(jobId);
    }
  }
}, 5 * 60 * 1000); // Run every 5 minutes

// WebSocket connection for real-time updates from ComfyUI
let ws = null;
let wsConnected = false;

function connectWebSocket() {
  try {
    ws = new WebSocket(`ws://${COMFYUI_HOST}:${COMFYUI_PORT}/ws`);

    ws.on('open', () => {
      console.log('✅ Connected to ComfyUI WebSocket');
      wsConnected = true;
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleComfyUIMessage(message);
      } catch (e) {
        // Ignore non-JSON messages
      }
    });

    ws.on('close', () => {
      console.log('⚠️ ComfyUI WebSocket disconnected, reconnecting in 5s...');
      wsConnected = false;
      setTimeout(connectWebSocket, 5000);
    });

    ws.on('error', (err) => {
      console.error('❌ ComfyUI WebSocket error:', err.message);
      wsConnected = false;
    });
  } catch (err) {
    console.error('❌ Failed to connect WebSocket:', err.message);
    setTimeout(connectWebSocket, 5000);
  }
}

function handleComfyUIMessage(message) {
  // ComfyUI sends messages like:
  // { type: 'status', data: { status: { exec_info: { queue_remaining: 0 } } } }
  // { type: 'executing', data: { node: '3', prompt_id: 'xxx' } }
  // { type: 'executed', data: { node: '60', output: { images: [...] }, prompt_id: 'xxx' } }

  if (message.type === 'executing' && message.data?.prompt_id) {
    // Find job by promptId and update status
    for (const [jobId, job] of jobs.entries()) {
      if (job.promptId === message.data.prompt_id) {
        if (message.data.node === null) {
          // null node means execution finished
          job.status = 'COMPLETED';
        } else {
          job.status = 'IN_PROGRESS';
        }
        break;
      }
    }
  }

  if (message.type === 'executed' && message.data?.prompt_id) {
    // Capture output from the SaveImage node
    for (const [jobId, job] of jobs.entries()) {
      if (job.promptId === message.data.prompt_id) {
        if (message.data.output?.images) {
          job.outputImages = message.data.output.images;
        }
        break;
      }
    }
  }

  if (message.type === 'execution_error' && message.data?.prompt_id) {
    for (const [jobId, job] of jobs.entries()) {
      if (job.promptId === message.data.prompt_id) {
        job.status = 'FAILED';
        job.error = message.data.exception_message || 'Execution failed';
        break;
      }
    }
  }
}

// Start WebSocket connection
connectWebSocket();

/**
 * POST /run - Submit a generation job
 * Matches RunPod serverless API format
 */
app.post('/run', async (req, res) => {
  try {
    const { input } = req.body;

    if (!input || !input.workflow) {
      return res.status(400).json({ error: 'Missing input.workflow' });
    }

    // Generate our own job ID
    const jobId = uuidv4();

    // Submit to ComfyUI
    const response = await fetch(`${COMFYUI_URL}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: input.workflow,
        client_id: jobId // Use our jobId as client_id for tracking
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ ComfyUI /prompt error:', errorText);
      return res.status(response.status).json({
        error: 'Failed to submit job to ComfyUI',
        details: errorText
      });
    }

    const data = await response.json();

    // Store job mapping
    jobs.set(jobId, {
      promptId: data.prompt_id,
      status: 'IN_QUEUE',
      output: null,
      outputImages: null,
      error: null,
      createdAt: Date.now()
    });

    console.log(`📋 Job submitted: ${jobId} -> ComfyUI prompt ${data.prompt_id}`);

    // Return RunPod-compatible response
    res.json({
      id: jobId,
      status: 'IN_QUEUE'
    });

  } catch (error) {
    console.error('❌ /run error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /status/:jobId - Check job status
 * Matches RunPod serverless API format
 */
app.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = jobs.get(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // If job is completed or failed, return cached result
    if (job.status === 'COMPLETED' || job.status === 'FAILED') {
      const result = {
        id: jobId,
        status: job.status
      };

      if (job.status === 'COMPLETED') {
        // Fetch the actual output from ComfyUI history
        const output = await fetchJobOutput(job.promptId);
        if (output) {
          result.output = output;
        }
      }

      if (job.status === 'FAILED' && job.error) {
        result.error = job.error;
      }

      return res.json(result);
    }

    // Check current status from ComfyUI queue
    const queueStatus = await getQueueStatus();

    // Check if our job is in the queue or running
    let currentStatus = 'IN_QUEUE';

    if (queueStatus) {
      const isRunning = queueStatus.queue_running?.some(
        item => item[1] === job.promptId
      );
      const isPending = queueStatus.queue_pending?.some(
        item => item[1] === job.promptId
      );

      if (isRunning) {
        currentStatus = 'IN_PROGRESS';
      } else if (!isPending && !isRunning) {
        // Not in queue - might be completed, check history
        const history = await fetchHistory(job.promptId);
        if (history && history[job.promptId]) {
          currentStatus = 'COMPLETED';
          job.status = 'COMPLETED';
        }
      }
    }

    const result = {
      id: jobId,
      status: currentStatus
    };

    // If completed, include output
    if (currentStatus === 'COMPLETED') {
      const output = await fetchJobOutput(job.promptId);
      if (output) {
        result.output = output;
      }
    }

    res.json(result);

  } catch (error) {
    console.error('❌ /status error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /health - Health check
 * Returns queue depth and connection status
 */
app.get('/health', async (req, res) => {
  try {
    const queueStatus = await getQueueStatus();

    const queueDepth = queueStatus
      ? (queueStatus.queue_pending?.length || 0) + (queueStatus.queue_running?.length || 0)
      : -1;

    res.json({
      service: 'comfyui-wrapper',
      status: wsConnected ? 'healthy' : 'degraded',
      comfyui: {
        connected: wsConnected,
        url: COMFYUI_URL
      },
      queue: {
        depth: queueDepth,
        pending: queueStatus?.queue_pending?.length || 0,
        running: queueStatus?.queue_running?.length || 0
      },
      activeJobs: jobs.size
    });
  } catch (error) {
    res.status(503).json({
      service: 'comfyui-wrapper',
      status: 'unhealthy',
      error: error.message
    });
  }
});

/**
 * Helper: Get ComfyUI queue status
 */
async function getQueueStatus() {
  try {
    const response = await fetch(`${COMFYUI_URL}/queue`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('❌ Failed to get queue status:', error.message);
    return null;
  }
}

/**
 * Helper: Fetch job history from ComfyUI
 */
async function fetchHistory(promptId) {
  try {
    const response = await fetch(`${COMFYUI_URL}/history/${promptId}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('❌ Failed to fetch history:', error.message);
    return null;
  }
}

/**
 * Helper: Fetch and format job output
 * Converts ComfyUI output to RunPod-compatible format
 */
async function fetchJobOutput(promptId) {
  try {
    const history = await fetchHistory(promptId);
    if (!history || !history[promptId]) return null;

    const outputs = history[promptId].outputs;
    if (!outputs) return null;

    // Find SaveImage node output (usually node "60" in the workflow)
    // ComfyUI stores images as { filename, subfolder, type }
    const images = [];

    for (const nodeId of Object.keys(outputs)) {
      const nodeOutput = outputs[nodeId];
      if (nodeOutput.images) {
        for (const img of nodeOutput.images) {
          // Fetch the actual image and convert to base64
          const imageUrl = `${COMFYUI_URL}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${img.type || 'output'}`;

          try {
            const imgResponse = await fetch(imageUrl);
            if (imgResponse.ok) {
              const buffer = await imgResponse.arrayBuffer();
              const base64 = Buffer.from(buffer).toString('base64');
              images.push(base64);
            }
          } catch (imgError) {
            console.error('❌ Failed to fetch image:', imgError.message);
          }
        }
      }
    }

    if (images.length > 0) {
      return { images };
    }

    return null;
  } catch (error) {
    console.error('❌ Failed to fetch job output:', error.message);
    return null;
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 ComfyUI Wrapper running on port ${PORT}`);
  console.log(`   ComfyUI URL: ${COMFYUI_URL}`);
  console.log(`   WebSocket: ${wsConnected ? 'connected' : 'connecting...'}`);
});
