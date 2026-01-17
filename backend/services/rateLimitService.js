/**
 * Rate Limit Service
 *
 * Provides reusable rate limiting utilities for API calls across modules.
 * Includes request queuing to serialize concurrent requests and exponential
 * backoff with jitter for handling 429 rate limit responses.
 *
 * Created in Branch 8 to extend the rate limit handling pattern from
 * seedream.js (Branch 7) to other API modules.
 */

const fetch = require('node-fetch');

// Default retry settings - can be overridden per-queue
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_INITIAL_BACKOFF_MS = 5000; // Start with 5 seconds
const DEFAULT_MAX_BACKOFF_MS = 60000; // Cap at 60 seconds
const DEFAULT_JITTER_FACTOR = 0.3; // Add up to 30% random jitter

/**
 * Add jitter to backoff to avoid thundering herd problem
 * @param {number} baseMs - Base milliseconds for backoff
 * @param {number} jitterFactor - Jitter factor (0-1, default 0.3)
 * @returns {number} Backoff time with jitter added
 */
function addJitter(baseMs, jitterFactor = DEFAULT_JITTER_FACTOR) {
  const jitter = baseMs * jitterFactor * Math.random();
  return Math.floor(baseMs + jitter);
}

/**
 * Request Queue for serializing API calls to avoid concurrent rate limits.
 * Each API endpoint should have its own queue instance.
 */
class RequestQueue {
  /**
   * Create a new RequestQueue
   * @param {number} minDelayMs - Minimum delay between requests (default: 1000ms)
   * @param {string} name - Optional name for logging purposes
   */
  constructor(minDelayMs = 1000, name = 'default') {
    this.queue = [];
    this.processing = false;
    this.minDelayMs = minDelayMs;
    this.lastRequestTime = 0;
    this.name = name;
  }

  /**
   * Add a request function to the queue
   * @param {Function} requestFn - Async function that performs the request
   * @returns {Promise} Resolves with the request result
   */
  async add(requestFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Process queued requests sequentially
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const { requestFn, resolve, reject } = this.queue.shift();

      // Ensure minimum delay between requests
      const timeSinceLastRequest = Date.now() - this.lastRequestTime;
      if (timeSinceLastRequest < this.minDelayMs) {
        await new Promise(r => setTimeout(r, this.minDelayMs - timeSinceLastRequest));
      }

      try {
        this.lastRequestTime = Date.now();
        const result = await requestFn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }

    this.processing = false;
  }

  /**
   * Get the current queue size
   * @returns {number} Number of pending requests
   */
  get size() {
    return this.queue.length;
  }
}

/**
 * Create a fetchWithRetry function with custom settings
 * @param {Object} options - Configuration options
 * @param {number} options.maxRetries - Maximum number of retry attempts
 * @param {number} options.initialBackoffMs - Initial backoff delay in milliseconds
 * @param {number} options.maxBackoffMs - Maximum backoff delay in milliseconds
 * @param {number} options.jitterFactor - Jitter factor (0-1)
 * @param {string} options.name - Name for logging
 * @returns {Function} Configured fetchWithRetry function
 */
function createFetchWithRetry(options = {}) {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    initialBackoffMs = DEFAULT_INITIAL_BACKOFF_MS,
    maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
    jitterFactor = DEFAULT_JITTER_FACTOR,
    name = 'API'
  } = options;

  /**
   * Make a fetch request with automatic retry on 429 errors
   * @param {string} url - URL to fetch
   * @param {Object} fetchOptions - Fetch options (method, headers, body, etc.)
   * @returns {Promise<Response>} Fetch response
   */
  return async function fetchWithRetry(url, fetchOptions) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, fetchOptions);

        // If we get a 429, retry with exponential backoff + jitter
        if (response.status === 429 && attempt < maxRetries) {
          const baseBackoff = Math.min(initialBackoffMs * Math.pow(2, attempt), maxBackoffMs);
          const backoffMs = addJitter(baseBackoff, jitterFactor);
          console.log(`   ⏳ [${name}] Rate limited (429), retrying in ${(backoffMs / 1000).toFixed(1)}s... (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }

        return response;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          const baseBackoff = Math.min(initialBackoffMs * Math.pow(2, attempt), maxBackoffMs);
          const backoffMs = addJitter(baseBackoff, jitterFactor);
          console.log(`   ⏳ [${name}] Request failed, retrying in ${(backoffMs / 1000).toFixed(1)}s... (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    throw lastError || new Error(`[${name}] Request failed after ${maxRetries} retries`);
  };
}

/**
 * Default fetchWithRetry function using default settings
 */
const fetchWithRetry = createFetchWithRetry();

module.exports = {
  RequestQueue,
  fetchWithRetry,
  createFetchWithRetry,
  addJitter,
  DEFAULT_MAX_RETRIES,
  DEFAULT_INITIAL_BACKOFF_MS,
  DEFAULT_MAX_BACKOFF_MS,
  DEFAULT_JITTER_FACTOR
};
