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
const { initializeChat } = require('./chat');
const { requireAuth } = require('./middleware/auth');

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
      deepseek: !!process.env.REPLICATE_API_KEY,
      elevenlabs: !!process.env.ELEVENLABS_API_KEY
    }
  });
});

// API Routes

// Generation endpoints - require auth + rate limiter (30/min)
// All generation endpoints require login to prevent abuse
app.use('/api/seedream', requireAuth, generationLimiter, seedreamRouter);
app.use('/api/nano-banana', requireAuth, generationLimiter, nanoBananaRouter);
app.use('/api/kling', requireAuth, generationLimiter, klingRouter);
app.use('/api/wan', requireAuth, generationLimiter, wanRouter);
app.use('/api/veo', requireAuth, generationLimiter, veoRouter);
app.use('/api/eraser', requireAuth, generationLimiter, eraserRouter);
app.use('/api/qwen-image-edit', requireAuth, generationLimiter, qwenImageEditRouter);
app.use('/api/qwen', requireAuth, generationLimiter, qwenRouter);
app.use('/api/deepseek', requireAuth, generationLimiter, deepseekRouter);
app.use('/api/bg-remover', requireAuth, generationLimiter, bgRemoverRouter);
app.use('/api/elevenlabs', requireAuth, generationLimiter, elevenlabsRouter);
app.use('/api/inpaint', requireAuth, generationLimiter, inpaintRouter);

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

  // Debug: Show XAI API Key status
  if (process.env.XAI_API_KEY) {
    console.log(`\n🔑 xAI API Key loaded: ${process.env.XAI_API_KEY.substring(0, 10)}...`);
  } else {
    console.log('\n⚠️  WARNING: XAI_API_KEY not found in environment variables!');
    console.log('   Make sure .env file contains: XAI_API_KEY=your-key-here');
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
  console.log('\n📝 Make sure to set REPLICATE_API_KEY, GOOGLE_API_KEY, and XAI_API_KEY in your .env file\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
