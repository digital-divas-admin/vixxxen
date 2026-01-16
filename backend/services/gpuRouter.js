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
const { logger } = require('./logger');

// Job tracking: maps jobId to { endpoint: 'dedicated' | 'serverless', ... }
const jobEndpoints = new Map();

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
 * @param {string} dedicatedUrl - URL of dedicated GPU wrapper
 * @param {object} workflow - ComfyUI workflow
 * @param {number} timeout - Request timeout in ms
 * @param {array} images - Optional array of {name, image} for inpainting
 */
async function submitToDedicated(dedicatedUrl, workflow, timeout = 5000, images = null) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Build input payload
    const input = { workflow };
    if (images && images.length > 0) {
      input.images = images;
    }

    const targetUrl = `${dedicatedUrl}/run`;
    logger.debug('Dedicated POST', { url: targetUrl });

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(timeoutId);

    logger.debug('Dedicated response', { status: response.status, statusText: response.statusText });

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
 * @param {string} runpodUrl - RunPod API URL
 * @param {string} runpodApiKey - RunPod API key
 * @param {object} workflow - ComfyUI workflow
 * @param {array} images - Optional array of {name, image} for inpainting
 */
async function submitToServerless(runpodUrl, runpodApiKey, workflow, images = null) {
  try {
    // Build input payload
    const input = { workflow };
    if (images && images.length > 0) {
      input.images = images;
    }

    const response = await fetch(`${runpodUrl}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${runpodApiKey}`
      },
      body: JSON.stringify({ input })
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
 * @param {array} options.images - Optional array of {name, image} for inpainting
 * @param {string} options.forceEndpoint - Force routing to 'serverless' or 'dedicated' (bypasses config)
 * @returns {Promise<{ success, jobId, status, endpoint, error?, usedFallback? }>}
 */
async function routeGenerationRequest({ workflow, runpodUrl, runpodApiKey, images = null, forceEndpoint = null }) {
  const config = await getGpuConfig();

  logger.debug('GPU Router', { mode: config.mode, dedicatedConfigured: !!config.dedicatedUrl, images: images?.length || 0, forceEndpoint });

  // Force endpoint override (bypasses all config logic)
  if (forceEndpoint === 'serverless') {
    logger.debug('Forced to serverless');
    const result = await submitToServerless(runpodUrl, runpodApiKey, workflow, images);
    if (result.success) {
      trackJob(result.jobId, 'serverless');
    }
    return result;
  }

  if (forceEndpoint === 'dedicated') {
    logger.debug('Forced to dedicated');
    if (!config.dedicatedUrl) {
      return { success: false, error: 'Dedicated URL not configured', endpoint: 'dedicated' };
    }
    const result = await submitToDedicated(config.dedicatedUrl, workflow, config.dedicatedTimeout, images);
    if (result.success) {
      trackJob(result.jobId, 'dedicated');
    }
    return result;
  }

  // Mode: serverless - always use serverless (current behavior)
  if (config.mode === 'serverless' || !config.dedicatedUrl) {
    logger.debug('Using serverless (mode or no dedicated URL)');
    const result = await submitToServerless(runpodUrl, runpodApiKey, workflow, images);
    if (result.success) {
      trackJob(result.jobId, 'serverless');
    }
    return result;
  }

  // Mode: dedicated - always use dedicated, fail if unavailable
  if (config.mode === 'dedicated') {
    logger.debug('Using dedicated only');
    const result = await submitToDedicated(config.dedicatedUrl, workflow, config.dedicatedTimeout, images);
    if (result.success) {
      trackJob(result.jobId, 'dedicated');
    }
    return result;
  }

  // Mode: hybrid - try dedicated first, fall back to serverless
  if (config.mode === 'hybrid') {
    logger.debug('Trying dedicated first (hybrid mode)');

    // Check dedicated health first
    const health = await checkDedicatedHealth(config.dedicatedUrl);
    if (!health.healthy) {
      logger.debug('Dedicated unhealthy, using serverless', { reason: health.reason });
      const result = await submitToServerless(runpodUrl, runpodApiKey, workflow, images);
      if (result.success) {
        trackJob(result.jobId, 'serverless');
      }
      return { ...result, usedFallback: true, fallbackReason: health.reason };
    }

    // Try dedicated
    const dedicatedResult = await submitToDedicated(config.dedicatedUrl, workflow, config.dedicatedTimeout, images);
    if (dedicatedResult.success) {
      trackJob(dedicatedResult.jobId, 'dedicated');
      return dedicatedResult;
    }

    // Fall back to serverless
    logger.debug('Dedicated failed, falling back to serverless', { error: dedicatedResult.error });
    const serverlessResult = await submitToServerless(runpodUrl, runpodApiKey, workflow, images);
    if (serverlessResult.success) {
      trackJob(serverlessResult.jobId, 'serverless');
    }
    return { ...serverlessResult, usedFallback: true, fallbackReason: dedicatedResult.error };
  }

  // Mode: serverless-primary - try serverless first, fall back to dedicated
  if (config.mode === 'serverless-primary') {
    logger.debug('Trying serverless first (serverless-primary mode)');

    const serverlessResult = await submitToServerless(runpodUrl, runpodApiKey, workflow, images);
    if (serverlessResult.success) {
      trackJob(serverlessResult.jobId, 'serverless');
      return serverlessResult;
    }

    // Fall back to dedicated
    logger.debug('Serverless failed, falling back to dedicated', { error: serverlessResult.error });
    if (!config.dedicatedUrl) {
      return serverlessResult; // No dedicated to fall back to
    }

    const dedicatedResult = await submitToDedicated(config.dedicatedUrl, workflow, config.dedicatedTimeout, images);
    if (dedicatedResult.success) {
      trackJob(dedicatedResult.jobId, 'dedicated');
    }
    return { ...dedicatedResult, usedFallback: true, fallbackReason: serverlessResult.error };
  }

  // Unknown mode - default to serverless
  logger.debug('Unknown mode, using serverless');
  const result = await submitToServerless(runpodUrl, runpodApiKey, workflow, images);
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

module.exports = {
  routeGenerationRequest,
  getJobStatus,
  getJobEndpoint,
  checkDedicatedHealth
};
