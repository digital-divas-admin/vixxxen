/**
 * GPU Router Service
 *
 * Routes generation requests to dedicated GPU or serverless based on config.
 * Handles fallback logic when dedicated is unavailable or busy.
 *
 * Modes:
 * - 'serverless': Always use serverless (current behavior)
 * - 'dedicated': Always use dedicated (fail if unavailable)
 * - 'hybrid': Try dedicated first, fall back to serverless
 * - 'serverless-primary': Try serverless first, fall back to dedicated
 */

const { getGpuConfig } = require('./settingsService');

// Job tracking: maps jobId to { endpoint: 'dedicated' | 'serverless', ... }
const jobEndpoints = new Map();

// Track which character LoRA is currently loaded on dedicated GPU
// This helps avoid the ~35 second LoRA switch penalty
let dedicatedCurrentLoRA = null;
let dedicatedLoRATimestamp = 0;

/**
 * Extract the character LoRA from a ComfyUI workflow
 * Character LoRA is in node 76 (Power Lora Loader), lora_1 slot
 */
function extractCharacterLoRA(workflow) {
  try {
    // Look for Power Lora Loader node (node 76)
    const loraNode = workflow?.['76']?.inputs;
    if (!loraNode) return null;

    // Character LoRA is in lora_1
    const lora1 = loraNode.lora_1;
    if (lora1 && lora1.on && lora1.lora && lora1.lora !== 'character') {
      return lora1.lora;
    }

    return null;
  } catch (error) {
    console.log('   → Could not extract character LoRA:', error.message);
    return null;
  }
}

/**
 * Update tracking for which LoRA is loaded on dedicated
 */
function updateDedicatedLoRA(loraName) {
  dedicatedCurrentLoRA = loraName;
  dedicatedLoRATimestamp = Date.now();
  console.log(`   → Dedicated GPU now has LoRA: ${loraName || 'none'}`);
}

/**
 * Check if a different LoRA would require a switch on dedicated
 */
function wouldRequireLoRASwitch(requestedLoRA) {
  if (!dedicatedCurrentLoRA || !requestedLoRA) return false;
  return dedicatedCurrentLoRA !== requestedLoRA;
}

// Clean up old job mappings (older than 1 hour)
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [jobId, data] of jobEndpoints.entries()) {
    if (data.timestamp < oneHourAgo) {
      jobEndpoints.delete(jobId);
    }
  }
}, 5 * 60 * 1000);

/**
 * Check if dedicated GPU is healthy
 */
async function checkDedicatedHealth(dedicatedUrl) {
  if (!dedicatedUrl) return { healthy: false, reason: 'No URL configured' };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${dedicatedUrl}/health`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { healthy: false, reason: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return {
      healthy: data.status === 'healthy',
      queueDepth: data.queue?.depth || 0,
      reason: data.status !== 'healthy' ? 'Unhealthy status' : null
    };
  } catch (error) {
    return {
      healthy: false,
      reason: error.name === 'AbortError' ? 'Timeout' : error.message
    };
  }
}

/**
 * Submit job to dedicated GPU
 */
async function submitToDedicated(dedicatedUrl, workflow, timeout = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${dedicatedUrl}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { workflow } }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Dedicated GPU error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      success: true,
      jobId: data.id,
      status: data.status,
      endpoint: 'dedicated'
    };
  } catch (error) {
    clearTimeout(timeoutId);
    return {
      success: false,
      error: error.name === 'AbortError' ? 'Timeout' : error.message,
      endpoint: 'dedicated'
    };
  }
}

/**
 * Submit job to serverless (RunPod)
 */
async function submitToServerless(runpodUrl, runpodApiKey, workflow) {
  try {
    const response = await fetch(`${runpodUrl}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${runpodApiKey}`
      },
      body: JSON.stringify({ input: { workflow } })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Serverless error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      success: true,
      jobId: data.id,
      status: data.status,
      endpoint: 'serverless'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      endpoint: 'serverless'
    };
  }
}

/**
 * Route a generation request based on current config
 *
 * @param {object} options
 * @param {object} options.workflow - The ComfyUI workflow
 * @param {string} options.runpodUrl - RunPod serverless URL
 * @param {string} options.runpodApiKey - RunPod API key
 * @returns {Promise<{ success, jobId, status, endpoint, error?, usedFallback? }>}
 */
async function routeGenerationRequest({ workflow, runpodUrl, runpodApiKey }) {
  const config = await getGpuConfig();

  console.log(`🔀 GPU Router: mode=${config.mode}, dedicated=${config.dedicatedUrl ? 'configured' : 'not set'}`);

  // Mode: serverless - always use serverless (current behavior)
  if (config.mode === 'serverless' || !config.dedicatedUrl) {
    console.log('   → Using serverless (mode or no dedicated URL)');
    const result = await submitToServerless(runpodUrl, runpodApiKey, workflow);
    if (result.success) {
      trackJob(result.jobId, 'serverless');
    }
    return result;
  }

  // Mode: dedicated - always use dedicated, fail if unavailable
  if (config.mode === 'dedicated') {
    console.log('   → Using dedicated only');
    const result = await submitToDedicated(config.dedicatedUrl, workflow, config.dedicatedTimeout);
    if (result.success) {
      trackJob(result.jobId, 'dedicated');
    }
    return result;
  }

  // Mode: hybrid - try dedicated first, fall back to serverless
  // Smart LoRA routing: avoid dedicated if it would require a LoRA switch (~35s penalty)
  if (config.mode === 'hybrid') {
    console.log('   → Hybrid mode with smart LoRA routing');

    // Extract which character LoRA this request needs
    const requestedLoRA = extractCharacterLoRA(workflow);
    console.log(`   → Requested LoRA: ${requestedLoRA || 'none'}`);
    console.log(`   → Dedicated current LoRA: ${dedicatedCurrentLoRA || 'none'}`);

    // Check dedicated health first
    const health = await checkDedicatedHealth(config.dedicatedUrl);
    if (!health.healthy) {
      console.log(`   → Dedicated unhealthy (${health.reason}), using serverless`);
      const result = await submitToServerless(runpodUrl, runpodApiKey, workflow);
      if (result.success) {
        trackJob(result.jobId, 'serverless');
      }
      return { ...result, usedFallback: true, fallbackReason: health.reason };
    }

    // Smart routing: if this would require a LoRA switch, use serverless instead
    // This avoids the ~35 second switch penalty on dedicated
    if (requestedLoRA && wouldRequireLoRASwitch(requestedLoRA)) {
      console.log(`   → LoRA switch detected (${dedicatedCurrentLoRA} → ${requestedLoRA})`);
      console.log(`   → Routing to serverless to avoid 35s switch penalty`);
      const result = await submitToServerless(runpodUrl, runpodApiKey, workflow);
      if (result.success) {
        trackJob(result.jobId, 'serverless');
      }
      return { ...result, loraRouted: true, routingReason: 'Avoided LoRA switch on dedicated' };
    }

    // Try dedicated (no LoRA switch or same LoRA)
    const dedicatedResult = await submitToDedicated(config.dedicatedUrl, workflow, config.dedicatedTimeout);
    if (dedicatedResult.success) {
      // Track that this LoRA is now loaded on dedicated
      if (requestedLoRA) {
        updateDedicatedLoRA(requestedLoRA);
      }
      trackJob(dedicatedResult.jobId, 'dedicated');
      return dedicatedResult;
    }

    // Fall back to serverless
    console.log(`   → Dedicated failed (${dedicatedResult.error}), falling back to serverless`);
    const serverlessResult = await submitToServerless(runpodUrl, runpodApiKey, workflow);
    if (serverlessResult.success) {
      trackJob(serverlessResult.jobId, 'serverless');
    }
    return { ...serverlessResult, usedFallback: true, fallbackReason: dedicatedResult.error };
  }

  // Mode: serverless-primary - try serverless first, fall back to dedicated
  if (config.mode === 'serverless-primary') {
    console.log('   → Trying serverless first (serverless-primary mode)');

    const serverlessResult = await submitToServerless(runpodUrl, runpodApiKey, workflow);
    if (serverlessResult.success) {
      trackJob(serverlessResult.jobId, 'serverless');
      return serverlessResult;
    }

    // Fall back to dedicated
    console.log(`   → Serverless failed (${serverlessResult.error}), falling back to dedicated`);
    if (!config.dedicatedUrl) {
      return serverlessResult; // No dedicated to fall back to
    }

    const dedicatedResult = await submitToDedicated(config.dedicatedUrl, workflow, config.dedicatedTimeout);
    if (dedicatedResult.success) {
      trackJob(dedicatedResult.jobId, 'dedicated');
    }
    return { ...dedicatedResult, usedFallback: true, fallbackReason: serverlessResult.error };
  }

  // Unknown mode - default to serverless
  console.log('   → Unknown mode, using serverless');
  const result = await submitToServerless(runpodUrl, runpodApiKey, workflow);
  if (result.success) {
    trackJob(result.jobId, 'serverless');
  }
  return result;
}

/**
 * Track which endpoint a job was submitted to
 */
function trackJob(jobId, endpoint) {
  jobEndpoints.set(jobId, {
    endpoint,
    timestamp: Date.now()
  });
}

/**
 * Get the endpoint a job was submitted to
 */
function getJobEndpoint(jobId) {
  return jobEndpoints.get(jobId)?.endpoint || null;
}

/**
 * Get status from the appropriate endpoint
 */
async function getJobStatus({ jobId, runpodUrl, runpodApiKey }) {
  const config = await getGpuConfig();
  const endpoint = getJobEndpoint(jobId);

  // If we know where the job went, query that endpoint
  if (endpoint === 'dedicated' && config.dedicatedUrl) {
    return await getStatusFromDedicated(config.dedicatedUrl, jobId);
  }

  // Default to serverless (or if endpoint unknown)
  return await getStatusFromServerless(runpodUrl, runpodApiKey, jobId);
}

async function getStatusFromDedicated(dedicatedUrl, jobId) {
  try {
    const response = await fetch(`${dedicatedUrl}/status/${jobId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return { success: true, data, endpoint: 'dedicated' };
  } catch (error) {
    return { success: false, error: error.message, endpoint: 'dedicated' };
  }
}

async function getStatusFromServerless(runpodUrl, runpodApiKey, jobId) {
  try {
    const response = await fetch(`${runpodUrl}/status/${jobId}`, {
      headers: { 'Authorization': `Bearer ${runpodApiKey}` }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return { success: true, data, endpoint: 'serverless' };
  } catch (error) {
    return { success: false, error: error.message, endpoint: 'serverless' };
  }
}

/**
 * Get current dedicated GPU LoRA status
 */
function getDedicatedLoRAStatus() {
  return {
    currentLoRA: dedicatedCurrentLoRA,
    lastUpdated: dedicatedLoRATimestamp ? new Date(dedicatedLoRATimestamp).toISOString() : null,
    ageMs: dedicatedLoRATimestamp ? Date.now() - dedicatedLoRATimestamp : null
  };
}

/**
 * Reset dedicated LoRA tracking (e.g., when pod restarts)
 */
function resetDedicatedLoRA() {
  dedicatedCurrentLoRA = null;
  dedicatedLoRATimestamp = 0;
  console.log('   → Dedicated GPU LoRA tracking reset');
}

module.exports = {
  routeGenerationRequest,
  getJobStatus,
  getJobEndpoint,
  checkDedicatedHealth,
  getDedicatedLoRAStatus,
  resetDedicatedLoRA
};
