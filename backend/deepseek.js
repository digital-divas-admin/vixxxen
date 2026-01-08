const express = require('express');
const router = express.Router();
const Replicate = require('replicate');
const https = require('https');

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_KEY,
});

// Vision models
const GPT5_MODEL = "openai/gpt-5";
const XAI_API_URL = "https://api.x.ai/v1/chat/completions";
const GROK_VISION_MODEL = "grok-2-vision-1212";  // For image analysis
const GROK_TEXT_MODEL = "grok-2-1212";           // For text-only chat

router.post('/caption', async (req, res) => {
  try {
    let {
      messages, // Array of conversation messages
      model = 'gpt-5', // 'gpt-5' or 'grok-4'
      maxTokens = 4096,
      reasoningEffort = 'medium',
      verbosity = 'medium',
      stream = true // Enable streaming by default
    } = req.body;

    // Validate inputs
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Messages array is required'
      });
    }

    // Check if the latest message has an image
    const lastMessage = messages[messages.length - 1];
    const hasImage = !!lastMessage.image;

    // GPT-5 is vision-only, so force Grok-4 for text-only queries
    if (model === 'gpt-5' && !hasImage) {
      console.log('GPT-5 requires an image. Switching to Grok-4 for text-only query.');
      model = 'grok-4';
    }

    console.log(`Received ${model.toUpperCase()} ${hasImage ? 'vision' : 'text-only'} request:`, {
      hasImage,
      messageCount: messages.length,
      latestMessage: lastMessage.content?.substring(0, 100),
      streaming: stream
    });

    // Set headers for streaming
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
    }

    let fullResponse = '';

    if (model === 'grok-4') {
      // Use xAI API directly for Grok
      // Select the right model based on whether there's an image
      const grokModel = hasImage ? GROK_VISION_MODEL : GROK_TEXT_MODEL;
      console.log(`Calling xAI ${grokModel}${hasImage ? ' (vision)' : ' (text)'}...`);

      // Build messages array from conversation history
      const grokMessages = [
        {
          role: 'system',
          content: 'You are Grok, a highly intelligent, helpful AI assistant.'
        }
      ];

      // Convert conversation history to xAI format
      for (const msg of messages) {
        if (msg.role === 'user') {
          if (msg.image) {
            // Vision request with image
            let imageUrl = msg.image;
            if (!msg.image.startsWith('data:')) {
              imageUrl = `data:image/jpeg;base64,${msg.image}`;
            }

            grokMessages.push({
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: imageUrl,
                    detail: 'high'
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
            grokMessages.push({
              role: 'user',
              content: msg.content
            });
          }
        } else if (msg.role === 'assistant') {
          grokMessages.push({
            role: 'assistant',
            content: msg.content
          });
        }
      }

      const requestPayload = {
        model: grokModel,
        messages: grokMessages,
        max_completion_tokens: maxTokens,
        stream: stream
      };

      // Log request structure (without full image data)
      console.log('xAI Request Structure:', {
        model: requestPayload.model,
        messages: requestPayload.messages.map(msg => ({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content :
            msg.content.map(c => ({
              type: c.type,
              ...(c.type === 'image_url' ? { imageUrl: c.image_url.url.substring(0, 50) + '...' } : { text: c.text })
            }))
        })),
        max_completion_tokens: requestPayload.max_completion_tokens
      });

      const requestBody = JSON.stringify(requestPayload);

      // Make HTTPS request using native Node.js module
      await new Promise((resolve, reject) => {
        const options = {
          hostname: 'api.x.ai',
          path: '/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
            'Content-Length': Buffer.byteLength(requestBody)
          }
        };

        const req = https.request(options, (apiRes) => {
          if (apiRes.statusCode < 200 || apiRes.statusCode >= 300) {
            let errorData = '';
            apiRes.on('data', (chunk) => {
              errorData += chunk;
            });
            apiRes.on('end', () => {
              try {
                const error = JSON.parse(errorData);
                console.error('xAI API Error Response:', JSON.stringify(error, null, 2));
                reject(new Error(`xAI API error: ${error.error?.message || apiRes.statusMessage}`));
              } catch (e) {
                console.error('xAI API Raw Error:', errorData);
                reject(new Error(`xAI API error: ${apiRes.statusMessage}`));
              }
            });
            return;
          }

          if (stream) {
            // Handle streaming response
            let buffer = '';

            apiRes.on('data', (chunk) => {
              buffer += chunk.toString();
              const lines = buffer.split('\n');
              buffer = lines.pop(); // Keep incomplete line in buffer

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  if (data === '[DONE]') {
                    res.write('data: [DONE]\n\n');
                    continue;
                  }

                  try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                      fullResponse += content;
                      res.write(`data: ${JSON.stringify({ content })}\n\n`);
                    }
                  } catch (e) {
                    // Skip invalid JSON
                  }
                }
              }
            });

            apiRes.on('end', () => {
              console.log('Grok-4 streaming completed');
              res.write('data: [DONE]\n\n');
              res.end();
              resolve();
            });

            apiRes.on('error', (error) => {
              console.error('Stream error:', error);
              reject(error);
            });
          } else {
            // Handle non-streaming response
            let data = '';
            apiRes.on('data', (chunk) => {
              data += chunk;
            });

            apiRes.on('end', () => {
              try {
                const xaiData = JSON.parse(data);
                fullResponse = xaiData.choices[0]?.message?.content || 'No response received';
                console.log('Grok-4 vision analysis completed');
                resolve();
              } catch (e) {
                reject(new Error('Failed to parse xAI response'));
              }
            });
          }
        });

        req.on('error', (error) => {
          reject(error);
        });

        req.write(requestBody);
        req.end();
      });

    } else {
      // Use Replicate for GPT-5
      console.log(`Calling GPT-5 via Replicate${hasImage ? ' with vision' : ''}...`);

      // Build prompt from conversation history
      let conversationPrompt = '';
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.role === 'user') {
          conversationPrompt += (i > 0 ? '\n\n' : '') + `User: ${msg.content}`;
        } else if (msg.role === 'assistant') {
          conversationPrompt += `\n\nAssistant: ${msg.content}`;
        }
      }

      const input = {
        prompt: conversationPrompt,
        reasoning_effort: reasoningEffort,
        verbosity: verbosity,
        max_completion_tokens: maxTokens
      };

      // Only include image from the last message if provided
      if (hasImage && lastMessage.image) {
        input.image_input = [lastMessage.image];
      }

      if (stream) {
        // Stream the response
        let eventCount = 0;
        for await (const event of replicate.stream(GPT5_MODEL, { input })) {
          eventCount++;

          // Debug: Log first event to understand structure
          if (eventCount === 1) {
            console.log('GPT-5 stream event type:', typeof event);
            console.log('GPT-5 stream event sample:', JSON.stringify(event).substring(0, 200));
          }

          // Handle both string and object events
          let content = '';
          if (typeof event === 'string') {
            content = event;
          } else if (typeof event === 'object' && event !== null) {
            // Replicate streams might return objects with different structures
            // Try common patterns
            content = event.output || event.text || event.data || event.content || '';

            // If still not found, log it
            if (!content && eventCount <= 3) {
              console.log('Unable to extract content from event:', JSON.stringify(event));
            }
          }

          if (content) {
            fullResponse += content;
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        }
        console.log(`GPT-5 streaming completed (${eventCount} events)`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        // Non-streaming response
        const output = await replicate.run(GPT5_MODEL, { input });

        // Output is an array of strings that we need to concatenate
        if (Array.isArray(output)) {
          fullResponse = output.join('');
        } else {
          fullResponse = output;
        }

        console.log('GPT-5 vision analysis completed');

        res.json({
          success: true,
          model: model,
          response: fullResponse,
          metadata: {
            question,
            maxTokens,
            reasoningEffort,
            verbosity
          }
        });
      }
    }

  } catch (error) {
    console.error('Caption/chat error:', error);

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
      gpt5: GPT5_MODEL,
      grok4: 'xai/grok-4 (direct API)'
    }
  });
});

module.exports = router;
