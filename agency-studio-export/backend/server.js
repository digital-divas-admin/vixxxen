/**
 * Agency Studio API Server
 * Main entry point for the backend application
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { config, validateEnv } = require('./config');
const { logger } = require('./services/logger');
const { requestId } = require('./middleware/requestId');
const { resolveAgency } = require('./middleware/agency');

// Route imports
const healthRoutes = require('./routes/health');
const agencyRoutes = require('./routes/agency');
const teamRoutes = require('./routes/team');
const generationRoutes = require('./routes/generation');

// Validate environment on startup
try {
  validateEnv();
} catch (error) {
  logger.error('Environment validation failed:', error.message);
  process.exit(1);
}

const app = express();

// ===================
// Security Middleware
// ===================

// Helmet for security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // Disable CSP for now (frontend handles it)
}));

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // In development, allow localhost
    if (config.isDev && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
      return callback(null, true);
    }

    // Allow configured frontend URL
    if (origin === config.frontendUrl) {
      return callback(null, true);
    }

    // Allow any subdomain of agencystudio (production)
    if (origin.match(/^https:\/\/[a-z0-9-]+\.agencystudio\.com$/)) {
      return callback(null, true);
    }

    // Allow any subdomain of onrender.com (staging)
    if (origin.match(/^https:\/\/[a-z0-9-]+\.onrender\.com$/)) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Agency-Slug'],
}));

// ===================
// General Middleware
// ===================

// Request ID for tracing
app.use(requestId);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(morgan(config.isDev ? 'dev' : 'combined', {
  stream: {
    write: (message) => logger.info(message.trim()),
  },
}));

// ===================
// Rate Limiting
// ===================

// General rate limit
const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by user if authenticated, otherwise by IP
    return req.agencyUser?.id || req.ip;
  },
});

// Stricter limit for generation endpoints
const generationLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.generationMax,
  message: { error: 'Generation rate limit exceeded. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.agencyUser?.id || req.ip;
  },
});

// Apply general limiter to all routes
app.use('/api', generalLimiter);

// ===================
// Routes
// ===================

// Health check (no agency resolution needed)
app.use('/health', healthRoutes);

// Agency resolution for all /api routes
app.use('/api', resolveAgency);

// API routes
app.use('/api/agency', agencyRoutes);
app.use('/api/team', teamRoutes);

// Generation routes
app.use('/api/generate', generationLimiter, generationRoutes);

// ===================
// Static Files (Production)
// ===================

if (config.isProd) {
  const path = require('path');
  const staticPath = path.join(__dirname, '../frontend/dist');

  app.use(express.static(staticPath));

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(staticPath, 'index.html'));
  });
}

// ===================
// Error Handling
// ===================

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  const requestLog = req.log || logger;

  // CORS errors
  if (err.message === 'Not allowed by CORS') {
    requestLog.warn(`CORS blocked: ${req.headers.origin}`);
    return res.status(403).json({ error: 'CORS error: Origin not allowed' });
  }

  // Log error
  requestLog.error('Unhandled error:', err);

  // Don't leak error details in production
  res.status(err.status || 500).json({
    error: config.isDev ? err.message : 'Internal server error',
    ...(config.isDev && { stack: err.stack }),
  });
});

// ===================
// Server Startup
// ===================

const server = app.listen(config.port, () => {
  logger.info(`Agency Studio API running on port ${config.port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`Frontend URL: ${config.frontendUrl}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

module.exports = app;
