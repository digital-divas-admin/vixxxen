/**
 * Centralized configuration management
 * All environment variables are validated and typed here
 */

const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

// Validate required environment variables on startup
function validateEnv() {
  const missing = requiredEnvVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',
  isProd: process.env.NODE_ENV === 'production',

  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },

  // CORS
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // AI APIs
  replicate: {
    apiKey: process.env.REPLICATE_API_KEY,
  },
  wavespeed: {
    apiKey: process.env.WAVESPEED_API_KEY,
  },
  google: {
    apiKey: process.env.GOOGLE_API_KEY,
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
  },

  // Stripe
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },

  // Email
  resend: {
    apiKey: process.env.RESEND_API_KEY,
  },

  // Rate limiting
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // requests per window
    generationMax: 30, // generation requests per window
  },

  // Credit costs per operation
  creditCosts: {
    // Image generation
    seedream: 10,
    nanoBanana: 8,
    qwen: 5,
    // Video generation
    kling: 50,
    wan: 40,
    veo: 60,
    // Editing
    bgRemover: 3,
    inpaint: 5,
    eraser: 3,
    // Chat
    chat: 2,
  },
};

module.exports = { config, validateEnv };
