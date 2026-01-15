const express = require('express');
const router = express.Router();
const { OpenRouter } = require('@openrouter/sdk');
const { logger, logGeneration } = require('./services/logger');

const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// OpenRouter model - handles both text and vision
const GROK_MODEL = "x-ai/grok-4.1-fast";

router.post('/caption', async (req, res) => {
  try {
    const {
      messages, // Array of conversation messages
      maxTokens = 4096,
      stream = true // Enable streaming by default
    } = req.body;

    // Validate inputs
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Messages array is required'
      });
    }

    // Check if any message has an image
    const hasImage = messages.some(msg => !!msg.image);

    logGeneration('grok-caption', 'started', {
      hasImage,
      messageCount: messages.length,
      streaming: stream,
      requestId: req.id
    });

    // Set headers for streaming
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
    }

    // Build messages array for OpenRouter
    const openrouterMessages = [
      {
        role: 'system',
        content: 'You are Grok, a highly intelligent, helpful AI assistant.'
      }
    ];

    // Convert conversation history to OpenRouter format
    for (const msg of messages) {
      if (msg.role === 'user') {
        if (msg.image) {
          // Vision request with image - OpenRouter SDK uses camelCase
          let imageData = msg.image;
          if (!msg.image.startsWith('data:')) {
            imageData = `data:image/jpeg;base64,${msg.image}`;
          }

          openrouterMessages.push({
            role: 'user',
            content: [
              {
                type: 'image_url',
                imageUrl: {
                  url: imageData
                }
              },
              {
                type: 'text',
                text: msg.content
              }
            ]
          });
        } else {
          // Text-only message
          openrouterMessages.push({
            role: 'user',
            content: msg.content
          });
        }
      } else if (msg.role === 'assistant') {
        openrouterMessages.push({
          role: 'assistant',
          content: msg.content
        });
      }
    }

    let fullResponse = '';

    if (stream) {
      // Streaming response using OpenRouter SDK
      const streamResponse = await openrouter.chat.send({
        model: GROK_MODEL,
        messages: openrouterMessages,
        max_tokens: maxTokens,
        stream: true,
        streamOptions: { includeUsage: true }
      });

      for await (const event of streamResponse) {
        const content = event.choices?.[0]?.delta?.content;
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      logGeneration('grok-caption', 'completed', { streaming: true, requestId: req.id });
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // Non-streaming response
      const response = await openrouter.chat.send({
        model: GROK_MODEL,
        messages: openrouterMessages,
        max_tokens: maxTokens,
        stream: false
      });

      fullResponse = response.choices?.[0]?.message?.content || 'No response received';
      logGeneration('grok-caption', 'completed', { streaming: false, requestId: req.id });

      res.json({
        success: true,
        model: 'grok-4',
        response: fullResponse,
        metadata: {
          maxTokens
        }
      });
    }

  } catch (error) {
    logger.error('Caption/chat error', { error: error.message, requestId: req.id });

    // Check if headers already sent (streaming failed mid-way)
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process request'
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    service: 'vision-caption',
    status: 'healthy',
    models: {
      grok: GROK_MODEL + ' (via OpenRouter)'
    }
  });
});

module.exports = router;
