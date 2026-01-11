require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
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
    console.error('GPU status check error:', error);
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
    console.log(`🖼️ Proxying image: ${url.substring(0, 100)}...`);
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
    console.error('❌ Image proxy failed:', error.message);
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
  console.error('Error:', err);
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
  console.log(`\n🚀 Vixxxen Backend running on http://localhost:${PORT}`);
  console.log('\n📋 API Status:');
  console.log(`   Seedream 4.5: ${process.env.REPLICATE_API_KEY ? '✅ Configured' : '❌ Missing API Key'}`);
  console.log(`   Nano Banana Pro: ${process.env.GOOGLE_API_KEY ? '✅ Configured' : '❌ Missing API Key'}`);
  console.log(`   Qwen Image Edit Plus: ${process.env.REPLICATE_API_KEY ? '✅ Configured' : '❌ Missing API Key'}`);
  console.log(`   GPT-5 Vision (Caption): ${process.env.REPLICATE_API_KEY ? '✅ Configured' : '❌ Missing API Key'}`);
  console.log(`   Grok-4 Vision (Caption): ${process.env.XAI_API_KEY ? '✅ Configured' : '❌ Missing XAI_API_KEY'}`);
  console.log(`   Kling 2.5 Turbo Pro: ${process.env.REPLICATE_API_KEY ? '✅ Configured' : '❌ Missing API Key'}`);
  console.log(`   Wan 2.2: ${process.env.REPLICATE_API_KEY ? '✅ Configured' : '❌ Missing API Key'}`);
  console.log(`   Veo 3.1 Fast: ${process.env.REPLICATE_API_KEY ? '✅ Configured' : '❌ Missing API Key'}`);
  console.log(`   Bria Eraser: ${process.env.REPLICATE_API_KEY ? '✅ Configured' : '❌ Missing API Key'}`);
  console.log(`   851 Labs BG Remover: ${process.env.REPLICATE_API_KEY ? '✅ Configured' : '❌ Missing API Key'}`);
  console.log(`   ElevenLabs TTS: ${process.env.ELEVENLABS_API_KEY ? '✅ Configured' : '❌ Missing ELEVENLABS_API_KEY'}`);
  console.log(`   Email (Resend): ${process.env.RESEND_API_KEY ? '✅ Configured' : '⚠️  Optional - Set RESEND_API_KEY'}`);

  // Debug: Show OpenRouter API Key status (for AI Chat)
  if (process.env.OPENROUTER_API_KEY) {
    console.log(`\n🔑 OpenRouter API Key loaded: ${process.env.OPENROUTER_API_KEY.substring(0, 10)}...`);
  } else {
    console.log('\n⚠️  WARNING: OPENROUTER_API_KEY not found in environment variables!');
    console.log('   AI Chat will not work. Set OPENROUTER_API_KEY=your-key-here');
  }

  console.log('\n💡 Available endpoints:');
  console.log(`   GET  http://localhost:${PORT}/health`);
  console.log(`   POST http://localhost:${PORT}/api/seedream/generate`);
  console.log(`   POST http://localhost:${PORT}/api/nano-banana/generate`);
  console.log(`   POST http://localhost:${PORT}/api/qwen-image-edit/generate`);
  console.log(`   POST http://localhost:${PORT}/api/deepseek/caption`);
  console.log(`   POST http://localhost:${PORT}/api/kling/generate`);
  console.log(`   POST http://localhost:${PORT}/api/wan/generate`);
  console.log(`   POST http://localhost:${PORT}/api/veo/generate`);
  console.log(`   POST http://localhost:${PORT}/api/eraser/erase`);
  console.log('\n📝 Make sure to set REPLICATE_API_KEY, GOOGLE_API_KEY, and OPENROUTER_API_KEY in your .env file\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
