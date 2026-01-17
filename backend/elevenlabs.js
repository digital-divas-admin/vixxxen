const express = require('express');
const router = express.Router();
const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');
const { logger, logGeneration } = require('./services/logger');
const { RequestQueue, createFetchWithRetry } = require('./services/rateLimitService');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

// Create request queue for ElevenLabs API calls - 1 second minimum between requests
// ElevenLabs has strict rate limits, especially on voice cloning
const elevenLabsQueue = new RequestQueue(1000, 'ElevenLabs');

// Create fetchWithRetry configured for ElevenLabs
// Using improved settings: 5 retries, 3s initial backoff (ElevenLabs is faster), 60s max, with jitter
const fetchWithRetry = createFetchWithRetry({
  maxRetries: 5,
  initialBackoffMs: 3000,
  maxBackoffMs: 60000,
  jitterFactor: 0.3,
  name: 'ElevenLabs'
});

// Text-to-Speech endpoint
router.post('/tts', async (req, res) => {
  try {
    const { text, voiceId, stability, similarity_boost, style, model_id } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ error: 'ElevenLabs API key not configured' });
    }

    logGeneration('elevenlabs-tts', 'started', {
      textLength: text.length,
      voiceId,
      requestId: req.id
    });

    console.log(`   📋 Adding TTS request to queue (queue size: ${elevenLabsQueue.size})...`);

    const response = await elevenLabsQueue.add(() =>
      fetchWithRetry(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY
        },
        body: JSON.stringify({
          text,
          model_id: model_id || 'eleven_multilingual_v2',
          voice_settings: {
            stability: stability || 0.5,
            similarity_boost: similarity_boost || 0.75,
            style: style || 0,
            use_speaker_boost: true
          }
        })
      })
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('ElevenLabs TTS error', { error: errorData, requestId: req.id });

      // Handle specific error types
      if (response.status === 429) {
        throw new Error('Rate limit exceeded - please wait 30-60 seconds and try again');
      }

      throw new Error(errorData.detail?.message || errorData.error || 'TTS generation failed');
    }

    // Get the audio buffer
    const audioBuffer = await response.buffer();

    // Convert to base64 data URL
    const base64Audio = audioBuffer.toString('base64');
    const audioUrl = `data:audio/mpeg;base64,${base64Audio}`;

    logGeneration('elevenlabs-tts', 'completed', {
      audioSize: audioBuffer.length,
      requestId: req.id
    });

    res.json({
      audioUrl,
      duration: null, // ElevenLabs doesn't return duration in the response
      characters: text.length
    });

  } catch (error) {
    logger.error('TTS Error', { error: error.message, requestId: req.id });

    // Handle rate limit errors
    if (error.message?.includes('429') || error.message?.includes('rate') || error.message?.includes('Rate limit')) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'The audio service is experiencing high demand. Please wait 30-60 seconds and try again.',
        retryAfter: 30
      });
    }

    res.status(500).json({ error: error.message || 'Failed to generate audio' });
  }
});

// Voice cloning endpoint
router.post('/clone', upload.single('audio'), async (req, res) => {
  try {
    const { name, description } = req.body;
    const audioFile = req.file;

    if (!audioFile) {
      return res.status(400).json({ error: 'Audio file is required' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Voice name is required' });
    }

    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ error: 'ElevenLabs API key not configured' });
    }

    logGeneration('elevenlabs-clone', 'started', { name, requestId: req.id });

    // Create form data for the API
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description || '');
    formData.append('files', audioFile.buffer, {
      filename: audioFile.originalname,
      contentType: audioFile.mimetype
    });

    console.log(`   📋 Adding voice clone request to queue (queue size: ${elevenLabsQueue.size})...`);

    const response = await elevenLabsQueue.add(() =>
      fetchWithRetry(`${ELEVENLABS_BASE_URL}/voices/add`, {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          ...formData.getHeaders()
        },
        body: formData
      })
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('ElevenLabs clone error', { error: errorData, requestId: req.id });

      // Handle specific error types
      if (response.status === 429) {
        throw new Error('Rate limit exceeded - please wait 30-60 seconds and try again');
      }

      throw new Error(errorData.detail?.message || errorData.error || 'Voice cloning failed');
    }

    const data = await response.json();

    logGeneration('elevenlabs-clone', 'completed', {
      voiceId: data.voice_id,
      requestId: req.id
    });

    res.json({
      voiceId: data.voice_id,
      name: name
    });

  } catch (error) {
    logger.error('Voice Clone Error', { error: error.message, requestId: req.id });

    // Handle rate limit errors
    if (error.message?.includes('429') || error.message?.includes('rate') || error.message?.includes('Rate limit')) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'The voice cloning service is experiencing high demand. Please wait 30-60 seconds and try again.',
        retryAfter: 30
      });
    }

    res.status(500).json({ error: error.message || 'Failed to clone voice' });
  }
});

// Get available voices endpoint
router.get('/voices', async (req, res) => {
  try {
    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ error: 'ElevenLabs API key not configured' });
    }

    // Voice listing uses queue but with lower priority since it's read-only
    const response = await elevenLabsQueue.add(() =>
      fetchWithRetry(`${ELEVENLABS_BASE_URL}/voices`, {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY
        }
      })
    );

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Rate limit exceeded - please wait and try again');
      }
      throw new Error('Failed to fetch voices');
    }

    const data = await response.json();

    res.json({
      voices: data.voices.map(v => ({
        id: v.voice_id,
        name: v.name,
        category: v.category,
        description: v.description,
        preview_url: v.preview_url
      }))
    });

  } catch (error) {
    logger.error('Get Voices Error', { error: error.message, requestId: req.id });

    // Handle rate limit errors
    if (error.message?.includes('429') || error.message?.includes('rate') || error.message?.includes('Rate limit')) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Please wait a moment and try again.',
        retryAfter: 10
      });
    }

    res.status(500).json({ error: error.message || 'Failed to fetch voices' });
  }
});

module.exports = router;
