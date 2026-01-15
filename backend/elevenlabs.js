const express = require('express');
const router = express.Router();
const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');
const { logger, logGeneration } = require('./services/logger');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

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

    const response = await fetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`, {
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
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('ElevenLabs TTS error', { error: errorData, requestId: req.id });
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

    const response = await fetch(`${ELEVENLABS_BASE_URL}/voices/add`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('ElevenLabs clone error', { error: errorData, requestId: req.id });
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
    res.status(500).json({ error: error.message || 'Failed to clone voice' });
  }
});

// Get available voices endpoint
router.get('/voices', async (req, res) => {
  try {
    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ error: 'ElevenLabs API key not configured' });
    }

    const response = await fetch(`${ELEVENLABS_BASE_URL}/voices`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });

    if (!response.ok) {
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
    res.status(500).json({ error: error.message || 'Failed to fetch voices' });
  }
});

module.exports = router;
