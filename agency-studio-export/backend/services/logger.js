/**
 * Winston logger with request ID tracking
 * Provides structured logging for debugging and monitoring
 */

const winston = require('winston');
const { config } = require('../config');

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom format for development
const devFormat = printf(({ level, message, timestamp, requestId, ...meta }) => {
  const reqId = requestId ? `[${requestId}]` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} ${level} ${reqId} ${message}${metaStr}`;
});

// Custom format for production (JSON)
const prodFormat = printf(({ level, message, timestamp, requestId, ...meta }) => {
  return JSON.stringify({
    timestamp,
    level,
    requestId,
    message,
    ...meta,
  });
});

const logger = winston.createLogger({
  level: config.isDev ? 'debug' : 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' })
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        config.isDev ? colorize() : winston.format.uncolorize(),
        config.isDev ? devFormat : prodFormat
      ),
    }),
  ],
});

// Create a child logger with request ID
function createRequestLogger(requestId) {
  return logger.child({ requestId });
}

module.exports = { logger, createRequestLogger };
