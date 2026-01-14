/**
 * Nano Banana (OpenRouter) Generation Tests
 */

const request = require('supertest');
const express = require('express');

// Mock node-fetch
const mockFetch = jest.fn();
jest.mock('node-fetch', () => mockFetch);

// Store original env
const originalEnv = process.env;

describe('Nano Banana Generation', () => {
  let app;
  let nanoBananaRouter;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Set required env vars
    process.env = {
      ...originalEnv,
      OPENROUTER_API_KEY: 'test-openrouter-key',
      FRONTEND_URL: 'https://test.digitaldivas.ai'
    };

    // Import router after setting env
    nanoBananaRouter = require('../../nanoBanana');

    app = express();
    app.use(express.json());
    app.use('/api/nano-banana', nanoBananaRouter);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('POST /api/nano-banana/generate', () => {
    describe('validation', () => {
      it('should require a prompt', async () => {
        const response = await request(app)
          .post('/api/nano-banana/generate')
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Prompt is required');
      });

      it('should reject invalid aspect ratio', async () => {
        const response = await request(app)
          .post('/api/nano-banana/generate')
          .send({
            prompt: 'A beautiful sunset',
            aspectRatio: '2:1' // Invalid
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid aspect ratio');
      });

      it('should accept valid aspect ratios', async () => {
        const validRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'];

        for (const ratio of validRatios) {
          mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              choices: [{
                message: {
                  content: [
                    { inline_data: { data: 'base64imagedata', mime_type: 'image/png' } }
                  ]
                }
              }]
            })
          });

          const response = await request(app)
            .post('/api/nano-banana/generate')
            .send({
              prompt: 'Test prompt',
              aspectRatio: ratio
            });

          expect(response.status).toBe(200);
        }
      });

      it('should require API key to be configured', async () => {
        // Reset modules and clear API key
        jest.resetModules();
        delete process.env.OPENROUTER_API_KEY;

        const noKeyRouter = require('../../nanoBanana');
        const noKeyApp = express();
        noKeyApp.use(express.json());
        noKeyApp.use('/api/nano-banana', noKeyRouter);

        const response = await request(noKeyApp)
          .post('/api/nano-banana/generate')
          .send({ prompt: 'Test prompt' });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('OpenRouter API key not configured');
      });
    });

    describe('successful generation', () => {
      it('should generate single image successfully (inline_data format)', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            choices: [{
              message: {
                content: [
                  { inline_data: { data: 'abc123base64data', mime_type: 'image/png' } }
                ]
              }
            }]
          })
        });

        const response = await request(app)
          .post('/api/nano-banana/generate')
          .send({
            prompt: 'A beautiful mountain landscape',
            aspectRatio: '16:9',
            numOutputs: 1
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.model).toBe('nano-banana-pro');
        expect(response.body.images).toHaveLength(1);
        expect(response.body.images[0]).toBe('data:image/png;base64,abc123base64data');
        expect(response.body.parameters.prompt).toBe('A beautiful mountain landscape');
        expect(response.body.parameters.aspectRatio).toBe('16:9');
      });

      it('should generate image with image_url format', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            choices: [{
              message: {
                content: [
                  { type: 'image_url', image_url: { url: 'https://example.com/image.png' } }
                ]
              }
            }]
          })
        });

        const response = await request(app)
          .post('/api/nano-banana/generate')
          .send({ prompt: 'Test image' });

        expect(response.status).toBe(200);
        expect(response.body.images).toHaveLength(1);
        expect(response.body.images[0]).toBe('https://example.com/image.png');
      });

      it('should generate image with b64_json format', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            choices: [{
              message: {
                content: [
                  { type: 'image', b64_json: 'base64imagedata' }
                ]
              }
            }]
          })
        });

        const response = await request(app)
          .post('/api/nano-banana/generate')
          .send({ prompt: 'Test image' });

        expect(response.status).toBe(200);
        expect(response.body.images).toHaveLength(1);
        expect(response.body.images[0]).toBe('data:image/png;base64,base64imagedata');
      });

      it('should handle message.images array format', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            choices: [{
              message: {
                images: [
                  { url: 'https://example.com/img1.png' },
                  { image_url: { url: 'https://example.com/img2.png' } }
                ]
              }
            }]
          })
        });

        const response = await request(app)
          .post('/api/nano-banana/generate')
          .send({ prompt: 'Test image' });

        expect(response.status).toBe(200);
        expect(response.body.images.length).toBeGreaterThan(0);
      });

      it('should extract base64 from string content', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            choices: [{
              message: {
                content: 'Here is your image: data:image/png;base64,abc123 enjoy!'
              }
            }]
          })
        });

        const response = await request(app)
          .post('/api/nano-banana/generate')
          .send({ prompt: 'Test image' });

        expect(response.status).toBe(200);
        expect(response.body.images).toHaveLength(1);
      });

      it('should handle multiple outputs', async () => {
        // Mock responses for 2 sequential requests
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              choices: [{
                message: {
                  content: [{ inline_data: { data: 'image1data', mime_type: 'image/png' } }]
                }
              }]
            })
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              choices: [{
                message: {
                  content: [{ inline_data: { data: 'image2data', mime_type: 'image/png' } }]
                }
              }]
            })
          });

        const response = await request(app)
          .post('/api/nano-banana/generate')
          .send({
            prompt: 'Test multiple images',
            numOutputs: 2
          });

        expect(response.status).toBe(200);
        expect(response.body.images).toHaveLength(2);
      }, 15000);

      it('should include reference images in request', async () => {
        let capturedBody;
        mockFetch.mockImplementation(async (url, options) => {
          capturedBody = JSON.parse(options.body);
          return {
            ok: true,
            json: () => Promise.resolve({
              choices: [{
                message: {
                  content: [{ inline_data: { data: 'imagedata', mime_type: 'image/png' } }]
                }
              }]
            })
          };
        });

        await request(app)
          .post('/api/nano-banana/generate')
          .send({
            prompt: 'Modify this image',
            referenceImages: ['data:image/png;base64,referenceimg']
          });

        expect(capturedBody.messages[0].content).toEqual(expect.arrayContaining([
          expect.objectContaining({
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,referenceimg' }
          })
        ]));
      });
    });

    describe('error handling', () => {
      it('should handle API errors', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error')
        });

        const response = await request(app)
          .post('/api/nano-banana/generate')
          .send({ prompt: 'Test image' });

        expect(response.status).toBe(500);
        expect(response.body.error).toContain('No images were generated');
      });

      it('should handle 401 unauthorized errors', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized')
        });

        const response = await request(app)
          .post('/api/nano-banana/generate')
          .send({ prompt: 'Test image' });

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Invalid API key');
      });

      it('should handle 429 rate limit errors', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 429,
          text: () => Promise.resolve('Rate limit exceeded')
        });

        const response = await request(app)
          .post('/api/nano-banana/generate')
          .send({ prompt: 'Test image' });

        expect(response.status).toBe(429);
        expect(response.body.error).toBe('Rate limit exceeded');
      });

      it('should handle content filter blocks', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            choices: [{
              finish_reason: 'content_filter',
              message: { content: '' }
            }]
          })
        });

        const response = await request(app)
          .post('/api/nano-banana/generate')
          .send({ prompt: 'Test image' });

        expect(response.status).toBe(500);
        expect(response.body.error).toContain('No images were generated');
      });

      it('should handle no image in response', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            choices: [{
              message: { content: 'Just text, no image' }
            }]
          })
        });

        const response = await request(app)
          .post('/api/nano-banana/generate')
          .send({ prompt: 'Test image' });

        expect(response.status).toBe(500);
        expect(response.body.error).toContain('No images were generated');
      });
    });
  });

  describe('GET /api/nano-banana/status', () => {
    it('should return ready status when API key is configured', async () => {
      const response = await request(app).get('/api/nano-banana/status');

      expect(response.status).toBe(200);
      expect(response.body.model).toBe('nano-banana-pro');
      expect(response.body.configured).toBe(true);
      expect(response.body.status).toBe('ready');
      expect(response.body.provider).toBe('openrouter');
    });

    it('should return missing_api_key status when not configured', async () => {
      jest.resetModules();
      delete process.env.OPENROUTER_API_KEY;

      const noKeyRouter = require('../../nanoBanana');
      const noKeyApp = express();
      noKeyApp.use(express.json());
      noKeyApp.use('/api/nano-banana', noKeyRouter);

      const response = await request(noKeyApp).get('/api/nano-banana/status');

      expect(response.status).toBe(200);
      expect(response.body.configured).toBe(false);
      expect(response.body.status).toBe('missing_api_key');
    });
  });
});
