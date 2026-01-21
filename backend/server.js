require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const { logger, logError } = require('./services/logger');
const seedreamRouter = require('./seedream');
const nanoBananaRouter = require('./nanoBanana');
const klingRouter = require('./kling');
const wanRouter = require('./wan');
const veoRouter = require('./veo');
const eraserRouter = require('./eraser');
const qwenImageEditRouter = require('./qwen-image-edit');
const qwenRouter = require('./qwen');
const deepseekRouter = require('./deepseek');
const bgRemoverRouter = require('./bg-remover');
const elevenlabsRouter = require('./elevenlabs');
const paymentsRouter = require('./payments');
const resourcesRouter = require('./resources');
const starthereRouter = require('./starthere');
const charactersRouter = require('./characters');
const policiesRouter = require('./policies');
const ageVerificationRouter = require('./age-verification');
const complianceRouter = require('./compliance');
const reportsRouter = require('./reports');
const inpaintRouter = require('./inpaint');
const contentFilterRouter = require('./content-filter');
const emailRouter = require('./email-routes');
const adminRouter = require('./admin');
const onboardingRouter = require('./onboarding');
const customCharactersRouter = require('./custom-characters');
const landingRouter = require('./landing');
const trialRouter = require('./trial');
const analyticsEventsRouter = require('./analytics-events');
const userImagesRouter = require('./user-images');
const facelockRouter = require('./facelock');
const workflowsRouter = require('./workflows');
const workflowSchedulesRouter = require('./workflowSchedules');
const { initializeChat } = require('./chat');
const { requireAuth } = require('./middleware/auth');
const { checkDedicatedHealth } = require('./services/gpuRouter');
const { getGpuConfig } = require('./services/settingsService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
const PORT = process.env.PORT || 3001;

// Initialize Socket.io chat
initializeChat(io);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for base64-encoded images
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Request ID middleware - adds unique ID to each request for log correlation
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('x-request-id', req.id);
  next();
});

// Trust first proxy (required for rate limiting behind Render/reverse proxies)
// This allows express-rate-limit to correctly identify client IPs from X-Forwarded-For header
app.set('trust proxy', 1);

// ===========================================
// RATE LIMITING CONFIGURATION
// ===========================================

// General API rate limiter - 100 requests per minute per IP
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limiter for sensitive endpoints - 10 requests per 15 minutes per IP
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many requests to this endpoint, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Generation limiter for AI endpoints - 30 requests per minute per IP
// (prevents abuse while allowing normal usage)
const generationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { error: 'Generation rate limit exceeded. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Wrapper that only applies generation limiter to POST requests
// This allows status polling (GET) to bypass the strict generation rate limit
const generationLimiterPostOnly = (req, res, next) => {
  if (req.method === 'POST') {
    return generationLimiter(req, res, next);
  }
  next();
};

// Apply general rate limiting to all API routes
app.use('/api/', generalLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      seedream: !!process.env.REPLICATE_API_KEY,
      nanoBanana: !!process.env.GOOGLE_API_KEY,
      kling: !!process.env.REPLICATE_API_KEY,
      wan: !!process.env.REPLICATE_API_KEY,
      veo: !!process.env.REPLICATE_API_KEY,
      eraser: !!process.env.REPLICATE_API_KEY,
      qwenImageEdit: !!process.env.REPLICATE_API_KEY,
      deepseek: !!process.env.OPENROUTER_API_KEY,
      elevenlabs: !!process.env.ELEVENLABS_API_KEY,
      email: !!process.env.RESEND_API_KEY
    }
  });
});

// GPU status endpoint - returns dedicated GPU health for frontend status indicator
app.get('/api/gpu-status', async (req, res) => {
  try {
    const config = await getGpuConfig();

    // If no dedicated GPU configured or mode is serverless-only
    if (!config.dedicatedUrl || config.mode === 'serverless') {
      return res.json({
        mode: config.mode || 'serverless',
        dedicated: {
          configured: false,
          healthy: false,
          status: 'not_configured'
        },
        serverless: {
          available: true
        }
      });
    }

    // Check dedicated GPU health
    const health = await checkDedicatedHealth(config.dedicatedUrl);

    res.json({
      mode: config.mode,
      dedicated: {
        configured: true,
        healthy: health.healthy,
        status: health.healthy ? 'online' : 'offline',
        queueDepth: health.queueDepth || 0,
        reason: health.reason || null
      },
      serverless: {
        available: true
      }
    });
  } catch (error) {
    logger.error('GPU status check error', { error: error.message, requestId: req.id });
    res.json({
      mode: 'unknown',
      dedicated: {
        configured: false,
        healthy: false,
        status: 'error',
        reason: error.message
      },
      serverless: {
        available: true
      }
    });
  }
});

// API Routes

// Generation endpoints - require auth + rate limiter (30/min for POST only)
// All generation endpoints require login to prevent abuse
// Status polling (GET) uses the general rate limiter (100/min) to avoid 429 errors
app.use('/api/seedream', requireAuth, generationLimiterPostOnly, seedreamRouter);
app.use('/api/nano-banana', requireAuth, generationLimiterPostOnly, nanoBananaRouter);
app.use('/api/kling', requireAuth, generationLimiterPostOnly, klingRouter);
app.use('/api/wan', requireAuth, generationLimiterPostOnly, wanRouter);
app.use('/api/veo', requireAuth, generationLimiterPostOnly, veoRouter);
app.use('/api/eraser', requireAuth, generationLimiterPostOnly, eraserRouter);
app.use('/api/qwen-image-edit', requireAuth, generationLimiterPostOnly, qwenImageEditRouter);
app.use('/api/qwen', requireAuth, generationLimiterPostOnly, qwenRouter);
app.use('/api/deepseek', requireAuth, generationLimiterPostOnly, deepseekRouter);
app.use('/api/bg-remover', requireAuth, generationLimiterPostOnly, bgRemoverRouter);
app.use('/api/elevenlabs', requireAuth, generationLimiterPostOnly, elevenlabsRouter);

// Public image proxy for inpaint (allows img tags to load cross-origin images)
app.get('/api/inpaint/proxy-image', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    logger.debug('Proxying image', { url: url.substring(0, 100), requestId: req.id });
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch image' });
    }
    const contentType = response.headers.get('content-type');
    const buffer = await response.arrayBuffer();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentType || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(buffer));
  } catch (error) {
    logger.error('Image proxy failed', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Proxy failed', message: error.message });
  }
});

// Inpaint routes (protected, except proxy-image above)
app.use('/api/inpaint', requireAuth, generationLimiterPostOnly, inpaintRouter);

// Sensitive endpoints - apply strict rate limiter (10/15min)
app.use('/api/payments', strictLimiter, paymentsRouter);
app.use('/api/age-verification', strictLimiter, ageVerificationRouter);

// Standard endpoints - use general rate limiter (already applied globally)
app.use('/api/resources', resourcesRouter);
app.use('/api/starthere', starthereRouter);
app.use('/api/characters', charactersRouter);
app.use('/api/policies', policiesRouter);
app.use('/api/compliance', complianceRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/content-filter', contentFilterRouter);
app.use('/api/email', emailRouter);
app.use('/api/admin', adminRouter);
app.use('/api/onboarding', onboardingRouter);
app.use('/api/custom-characters', customCharactersRouter);
app.use('/api/landing', landingRouter);
app.use('/api/analytics', analyticsEventsRouter);
app.use('/api/user-images', userImagesRouter);
app.use('/api/facelock', requireAuth, facelockRouter);
app.use('/api/workflows', requireAuth, workflowsRouter);
app.use('/api/workflow-schedules', workflowSchedulesRouter);

// Trial endpoint - public (no auth) but rate limited for image generation
// Uses generationLimiterPostOnly to rate limit POST /generate but allow GET /status freely
app.use('/api/trial', generationLimiterPostOnly, trialRouter);

// Serve static files from the parent directory (frontend)
app.use(express.static(path.join(__dirname, '..')));

// Serve content directory for educational modules
app.use('/content', express.static(path.join(__dirname, '..', 'content')));

// SPA fallback - serve index.html for non-API routes
app.get('*', (req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api/') || req.path === '/health') {
    return next();
  }
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  logError(err, { requestId: req.id, path: req.path, method: req.method });
  res.status(500).json({
    error: err.message || 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 404 handler for API routes
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
server.listen(PORT, () => {
  logger.info(`Vixxxen Backend started on port ${PORT}`);

  // Log API configuration status
  const apiStatus = {
    replicate: !!process.env.REPLICATE_API_KEY,
    googleGenAI: !!process.env.GOOGLE_API_KEY,
    xai: !!process.env.XAI_API_KEY,
    openRouter: !!process.env.OPENROUTER_API_KEY,
    elevenLabs: !!process.env.ELEVENLABS_API_KEY,
    resend: !!process.env.RESEND_API_KEY
  };

  logger.info('API configuration status', apiStatus);

  if (!process.env.OPENROUTER_API_KEY) {
    logger.warn('OPENROUTER_API_KEY not configured - AI Chat will not work');
  }

  // Only show detailed startup info in development
  if (process.env.NODE_ENV !== 'production') {
    console.log(`\nVixxxen Backend running on http://localhost:${PORT}`);
    console.log('\nAPI Status:');
    console.log(`   Seedream 4.5: ${apiStatus.replicate ? 'Configured' : 'Missing API Key'}`);
    console.log(`   Nano Banana Pro: ${apiStatus.googleGenAI ? 'Configured' : 'Missing API Key'}`);
    console.log(`   OpenRouter (Chat): ${apiStatus.openRouter ? 'Configured' : 'Missing API Key'}`);
    console.log(`   ElevenLabs TTS: ${apiStatus.elevenLabs ? 'Configured' : 'Missing API Key'}`);
    console.log(`   Email (Resend): ${apiStatus.resend ? 'Configured' : 'Optional'}`);
    console.log('\nEndpoints: GET /health, POST /api/*/generate\n');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
  });
});
