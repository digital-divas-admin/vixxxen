/**
 * Centralized logging service for Vixxxen Backend
 *
 * Features:
 * - Structured JSON logging in production
 * - Pretty-print logging in development
 * - Automatic timestamps
 * - Request ID correlation
 * - Sensitive data sanitization
 */

const winston = require('winston');

// Determine environment
const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

// Custom format for development (pretty print)
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
    const reqIdStr = requestId ? `[${requestId.substring(0, 8)}]` : '';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level} ${reqIdStr} ${message}${metaStr}`;
  })
);

// Custom format for production (JSON)
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Create the logger instance
const logger = winston.createLogger({
  level: logLevel,
  format: isProduction ? prodFormat : devFormat,
  defaultMeta: { service: 'vixxxen-backend' },
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true
    })
  ]
});

// ============================================
// SANITIZATION UTILITIES
// ============================================

/**
 * Mask an email address for logging
 * user@example.com -> u***@example.com
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string') return '[no-email]';
  const parts = email.split('@');
  if (parts.length !== 2) return '[invalid-email]';
  const [local, domain] = parts;
  const maskedLocal = local.length > 1
    ? local[0] + '***'
    : '***';
  return `${maskedLocal}@${domain}`;
}

/**
 * Mask a user ID for logging
 * abc123-def456-ghi789 -> abc1...
 */
function maskUserId(userId) {
  if (!userId || typeof userId !== 'string') return '[no-id]';
  return userId.length > 4 ? userId.substring(0, 4) + '...' : userId;
}

/**
 * Mask an API key for logging
 * sk-abc123xyz -> sk-abc1...
 */
function maskApiKey(key) {
  if (!key || typeof key !== 'string') return '[no-key]';
  return key.length > 8 ? key.substring(0, 8) + '...' : '***';
}

/**
 * Sanitize payment data - removes sensitive fields
 */
function sanitizePaymentData(data) {
  if (!data || typeof data !== 'object') return data;

  const sanitized = { ...data };
  const sensitiveFields = [
    'payment_id', 'invoice_id', 'order_id', 'pay_address',
    'payin_address', 'payout_address', 'ipn_callback_url',
    'token', 'access_token', 'secret', 'api_key'
  ];

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  // Mask user-related fields
  if (sanitized.user_id) sanitized.user_id = maskUserId(sanitized.user_id);
  if (sanitized.userId) sanitized.userId = maskUserId(sanitized.userId);
  if (sanitized.email) sanitized.email = maskEmail(sanitized.email);

  return sanitized;
}

/**
 * Truncate long strings for logging
 */
function truncate(str, maxLength = 100) {
  if (!str || typeof str !== 'string') return str;
  return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
}

/**
 * Sanitize a generic object for logging - removes common sensitive fields
 */
function sanitizeObject(obj, maxDepth = 2) {
  if (!obj || typeof obj !== 'object') return obj;
  if (maxDepth <= 0) return '[object]';

  const sensitiveKeys = [
    'password', 'token', 'secret', 'api_key', 'apiKey',
    'authorization', 'auth', 'credential', 'private_key',
    'access_token', 'refresh_token', 'session'
  ];

  const sanitized = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();

    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value, maxDepth - 1);
    } else if (typeof value === 'string' && value.length > 200) {
      sanitized[key] = truncate(value, 200);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// ============================================
// CHILD LOGGER FACTORY
// ============================================

/**
 * Create a child logger with request context
 * Usage: const reqLogger = logger.child({ requestId: req.id });
 */
function createRequestLogger(requestId) {
  return logger.child({ requestId });
}

// ============================================
// CONVENIENCE METHODS
// ============================================

/**
 * Log an API request (info level)
 */
function logRequest(req, message, meta = {}) {
  const requestId = req.id || req.requestId;
  logger.info(message, {
    requestId,
    method: req.method,
    path: req.path,
    userId: req.userId ? maskUserId(req.userId) : undefined,
    ...meta
  });
}

/**
 * Log an API response (info level)
 */
function logResponse(req, statusCode, message, meta = {}) {
  const requestId = req.id || req.requestId;
  logger.info(message, {
    requestId,
    statusCode,
    ...meta
  });
}

/**
 * Log an error with context
 */
function logError(error, context = {}) {
  const errorInfo = {
    message: error.message,
    name: error.name,
    stack: isProduction ? undefined : error.stack,
    ...sanitizeObject(context)
  };
  logger.error(error.message, errorInfo);
}

/**
 * Log admin action with masked user info
 */
function logAdminAction(adminEmail, action, meta = {}) {
  logger.info(`Admin action: ${action}`, {
    adminEmail: maskEmail(adminEmail),
    ...sanitizeObject(meta)
  });
}

/**
 * Log payment event with sanitized data
 */
function logPaymentEvent(event, data) {
  logger.info(`Payment: ${event}`, sanitizePaymentData(data));
}

/**
 * Log generation request
 */
function logGeneration(model, prompt, meta = {}) {
  logger.info(`Generation: ${model}`, {
    prompt: truncate(prompt, 100),
    ...meta
  });
}

// Export everything
module.exports = {
  logger,
  createRequestLogger,

  // Sanitization utilities
  maskEmail,
  maskUserId,
  maskApiKey,
  sanitizePaymentData,
  sanitizeObject,
  truncate,

  // Convenience methods
  logRequest,
  logResponse,
  logError,
  logAdminAction,
  logPaymentEvent,
  logGeneration
};
