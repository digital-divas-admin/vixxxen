/**
 * Dedicated GPU Wrapper Server
 *
 * Provides RunPod-compatible API for dedicated ComfyUI Pod.
 * Supports both txt2img workflows and inpaint workflows with image uploads.
 *
 * Endpoints:
 *   POST /run     - Submit a job (workflow + optional images)
 *   GET /status/:id - Get job status
 *   GET /health   - Health check
 *
 * Deploy to Pod:
 *   1. Copy this file to /workspace/dedicated-wrapper/server.js
 *   2. Run: cd /workspace/dedicated-wrapper && npm install express ws
 *   3. Run: node server.js
 */

const express = require("express");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json({ limit: "100mb" })); // Increased limit for image uploads

// ComfyUI input directory for uploaded images
const COMFYUI_INPUT_DIR = "/workspace/ComfyUI/input";

// Job tracking
const jobs = new Map();

// WebSocket connection to ComfyUI
let wsConnected = false;
const ws = new WebSocket("ws://localhost:8188/ws");

ws.on("open", () => {
  console.log("WebSocket connected to ComfyUI");
  wsConnected = true;
});

ws.on("close", () => {
  console.log("WebSocket closed");
  wsConnected = false;
});

ws.on("error", (err) => {
  console.error("WebSocket error:", err.message);
});

ws.on("message", async (data) => {
  try {
    const msg = JSON.parse(data);

    // Check for queue completion
    if (msg.type === "status" && msg.data?.status?.exec_info?.queue_remaining === 0) {
      // Fetch outputs for any queued jobs
      for (const [promptId, job] of jobs) {
        if (job.status === "IN_QUEUE" || job.status === "IN_PROGRESS") {
          await fetchOutput(promptId);
        }
      }
    }

    // Track execution progress
    if (msg.type === "executing" && msg.data?.node) {
      const promptId = msg.data.prompt_id;
      const job = jobs.get(promptId);
      if (job && job.status === "IN_QUEUE") {
        job.status = "IN_PROGRESS";
      }
    }
  } catch (err) {
    // Ignore parse errors
  }
});

/**
 * Fetch output images from ComfyUI history
 */
async function fetchOutput(promptId) {
  const job = jobs.get(promptId);
  if (!job) return;

  try {
    const response = await fetch(`http://localhost:8188/history/${promptId}`);
    const history = await response.json();

    if (history[promptId]?.status?.completed) {
      const images = [];

      // Extract images from all output nodes
      for (const nodeId in history[promptId].outputs || {}) {
        const output = history[promptId].outputs[nodeId];
        if (output.images) {
          for (const img of output.images) {
            const imageUrl = `http://localhost:8188/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}&type=output`;
            const imgResponse = await fetch(imageUrl);
            const buffer = Buffer.from(await imgResponse.arrayBuffer());
            images.push(buffer.toString("base64"));
          }
        }
      }

      job.status = "COMPLETED";
      job.output = { images };
      console.log(`==> Job ${promptId}: Got ${images.length} images`);
    }
  } catch (err) {
    console.error(`Error fetching output for ${promptId}:`, err.message);
  }
}

/**
 * Save uploaded images to ComfyUI input directory
 */
async function saveImages(images) {
  if (!images || images.length === 0) return;

  // Ensure input directory exists
  if (!fs.existsSync(COMFYUI_INPUT_DIR)) {
    fs.mkdirSync(COMFYUI_INPUT_DIR, { recursive: true });
  }

  for (const img of images) {
    const { name, image } = img;
    if (!name || !image) continue;

    const filePath = path.join(COMFYUI_INPUT_DIR, name);
    const buffer = Buffer.from(image, "base64");

    fs.writeFileSync(filePath, buffer);
    console.log(`   Saved image: ${name} (${Math.round(buffer.length / 1024)}KB)`);
  }
}

/**
 * Health check endpoint
 */
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    ws: wsConnected,
    queue: {
      depth: Array.from(jobs.values()).filter(j => j.status === "IN_QUEUE" || j.status === "IN_PROGRESS").length
    }
  });
});

/**
 * Submit job endpoint
 * Accepts: { input: { workflow: {...}, images: [{name, image}, ...] } }
 */
app.post("/run", async (req, res) => {
  console.log("==> /run");

  const workflow = req.body?.input?.workflow;
  const images = req.body?.input?.images;

  if (!workflow) {
    return res.status(400).json({ error: "workflow required in input.workflow" });
  }

  try {
    // Save any uploaded images first
    if (images && images.length > 0) {
      console.log(`   Uploading ${images.length} images...`);
      await saveImages(images);
    }

    // Submit workflow to ComfyUI
    const response = await fetch("http://localhost:8188/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("   ComfyUI error:", errorText);
      return res.status(500).json({ error: "ComfyUI rejected workflow", details: errorText });
    }

    const data = await response.json();
    const promptId = data.prompt_id;

    console.log(`   Job: ${promptId}`);

    // Track the job
    jobs.set(promptId, {
      id: promptId,
      status: "IN_QUEUE",
      output: null,
      createdAt: Date.now()
    });

    res.json({ id: promptId, status: "IN_QUEUE" });

  } catch (err) {
    console.error("   Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Job status endpoint
 */
app.get("/status/:id", (req, res) => {
  const job = jobs.get(req.params.id);

  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  res.json({
    id: job.id,
    status: job.status,
    output: job.output
  });
});

// Cleanup old jobs every 5 minutes
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < oneHourAgo) {
      jobs.delete(id);
    }
  }
}, 5 * 60 * 1000);

// Start server
const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Dedicated wrapper running on port ${PORT}`);
  console.log(`ComfyUI input dir: ${COMFYUI_INPUT_DIR}`);
});
