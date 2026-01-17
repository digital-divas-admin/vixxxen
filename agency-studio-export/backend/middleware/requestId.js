/**
 * Request ID Middleware
 * Assigns unique ID to each request for logging and tracing
 */

const { v4: uuidv4 } = require('uuid');
const { createRequestLogger } = require('../services/logger');

function requestId(req, res, next) {
  // Use existing request ID from header or generate new one
  req.requestId = req.headers['x-request-id'] || uuidv4().substring(0, 8);

  // Add to response headers for client-side debugging
  res.setHeader('X-Request-ID', req.requestId);

  // Create request-scoped logger
  req.log = createRequestLogger(req.requestId);

  next();
}

module.exports = { requestId };
