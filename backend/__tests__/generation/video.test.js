/**
 * Video Generation Tests (Kling, Wan, Veo via Replicate)
 */

const request = require('supertest');
const express = require('express');

// Mock Replicate SDK
const mockReplicateRun = jest.fn();

jest.mock('replicate', () => {
  return jest.fn().mockImplementation(() => ({
    run: mockReplicateRun
  }));
});

// Store original env
const originalEnv = process.env;

describe('Video Generation Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      REPLICATE_API_KEY: 'test-replicate-key'
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Kling Video Generation', () => {
    let app;
    let klingRouter;

    beforeEach(() => {
      jest.resetModules();
      klingRouter = require('../../kling');
      app = express();
      app.use(express.json());
      app.use('/api/kling', klingRouter);
    });

    describe('POST /api/kling/generate', () => {
      describe('validation', () => {
        it('should require a prompt', async () => {
          const response = await request(app)
            .post('/api/kling/generate')
            .send({});

          expect(response.status).toBe(400);
          expect(response.body.error).toBe('Prompt is required');
        });

        it('should require API key', async () => {
          jest.resetModules();
          delete process.env.REPLICATE_API_KEY;

          const noKeyRouter = require('../../kling');
          const noKeyApp = express();
          noKeyApp.use(express.json());
          noKeyApp.use('/api/kling', noKeyRouter);

          const response = await request(noKeyApp)
            .post('/api/kling/generate')
            .send({ prompt: 'Test prompt' });

          expect(response.status).toBe(500);
          expect(response.body.error).toBe('Replicate API key not configured');
        });

        it('should reject invalid aspect ratio', async () => {
          const response = await request(app)
            .post('/api/kling/generate')
            .send({
              prompt: 'Test video',
              aspectRatio: '4:3' // Invalid for Kling
            });

          expect(response.status).toBe(400);
          expect(response.body.error).toContain('Invalid aspect ratio');
        });

        it('should accept valid aspect ratios', async () => {
          const validRatios = ['16:9', '9:16', '1:1'];

          for (const ratio of validRatios) {
            mockReplicateRun.mockResolvedValueOnce('https://example.com/video.mp4');

            const response = await request(app)
              .post('/api/kling/generate')
              .send({
                prompt: 'Test prompt',
                aspectRatio: ratio
              });

            expect(response.status).toBe(200);
          }
        });

        it('should reject invalid duration', async () => {
          const response = await request(app)
            .post('/api/kling/generate')
            .send({
              prompt: 'Test video',
              duration: 15 // Too long
            });

          expect(response.status).toBe(400);
          expect(response.body.error).toContain('Duration must be between 1 and 10');
        });

        it('should reject duration less than 1', async () => {
          const response = await request(app)
            .post('/api/kling/generate')
            .send({
              prompt: 'Test video',
              duration: 0
            });

          expect(response.status).toBe(400);
        });
      });

      describe('successful generation', () => {
        it('should generate video successfully', async () => {
          mockReplicateRun.mockResolvedValue('https://replicate.com/output/video.mp4');

          const response = await request(app)
            .post('/api/kling/generate')
            .send({
              prompt: 'A cat playing in a garden',
              aspectRatio: '16:9',
              duration: 5
            });

          expect(response.status).toBe(200);
          expect(response.body.success).toBe(true);
          expect(response.body.model).toBe('kling-2.5-turbo-pro');
          expect(response.body.videoUrl).toBe('https://replicate.com/output/video.mp4');
          expect(response.body.parameters.prompt).toBe('A cat playing in a garden');
          expect(response.body.parameters.aspectRatio).toBe('16:9');
          expect(response.body.parameters.duration).toBe(5);
        });

        it('should pass start image to model', async () => {
          mockReplicateRun.mockResolvedValue('https://example.com/video.mp4');

          await request(app)
            .post('/api/kling/generate')
            .send({
              prompt: 'Animate this image',
              startImage: 'data:image/png;base64,startimagedata'
            });

          expect(mockReplicateRun).toHaveBeenCalledWith(
            'kwaivgi/kling-v2.5-turbo-pro',
            expect.objectContaining({
              input: expect.objectContaining({
                start_image: 'data:image/png;base64,startimagedata'
              })
            })
          );
        });

        it('should pass negative prompt to model', async () => {
          mockReplicateRun.mockResolvedValue('https://example.com/video.mp4');

          await request(app)
            .post('/api/kling/generate')
            .send({
              prompt: 'A beautiful sunset',
              negativePrompt: 'blurry, dark'
            });

          expect(mockReplicateRun).toHaveBeenCalledWith(
            'kwaivgi/kling-v2.5-turbo-pro',
            expect.objectContaining({
              input: expect.objectContaining({
                negative_prompt: 'blurry, dark'
              })
            })
          );
        });

        it('should use default values', async () => {
          mockReplicateRun.mockResolvedValue('https://example.com/video.mp4');

          await request(app)
            .post('/api/kling/generate')
            .send({ prompt: 'Test prompt' });

          expect(mockReplicateRun).toHaveBeenCalledWith(
            'kwaivgi/kling-v2.5-turbo-pro',
            expect.objectContaining({
              input: expect.objectContaining({
                prompt: 'Test prompt',
                aspect_ratio: '16:9', // Default
                duration: 5, // Default
                guidance_scale: 0.5
              })
            })
          );
        });
      });

      describe('error handling', () => {
        it('should handle API key errors', async () => {
          mockReplicateRun.mockRejectedValue(new Error('Invalid API key'));

          const response = await request(app)
            .post('/api/kling/generate')
            .send({ prompt: 'Test prompt' });

          expect(response.status).toBe(401);
          expect(response.body.error).toBe('Invalid API key');
        });

        it('should handle quota errors', async () => {
          mockReplicateRun.mockRejectedValue(new Error('Exceeded quota limit'));

          const response = await request(app)
            .post('/api/kling/generate')
            .send({ prompt: 'Test prompt' });

          expect(response.status).toBe(429);
          expect(response.body.error).toBe('Quota exceeded');
        });

        it('should handle generic errors', async () => {
          mockReplicateRun.mockRejectedValue(new Error('Model unavailable'));

          const response = await request(app)
            .post('/api/kling/generate')
            .send({ prompt: 'Test prompt' });

          expect(response.status).toBe(500);
          expect(response.body.error).toBe('Model unavailable');
        });
      });
    });

    describe('GET /api/kling/status', () => {
      it('should return ready status when configured', async () => {
        const response = await request(app).get('/api/kling/status');

        expect(response.status).toBe(200);
        expect(response.body.model).toBe('kling-2.5-turbo-pro');
        expect(response.body.configured).toBe(true);
        expect(response.body.status).toBe('ready');
      });

      it('should return missing_api_key when not configured', async () => {
        jest.resetModules();
        delete process.env.REPLICATE_API_KEY;

        const noKeyRouter = require('../../kling');
        const noKeyApp = express();
        noKeyApp.use(express.json());
        noKeyApp.use('/api/kling', noKeyRouter);

        const response = await request(noKeyApp).get('/api/kling/status');

        expect(response.body.configured).toBe(false);
        expect(response.body.status).toBe('missing_api_key');
      });
    });
  });

  describe('Wan Video Generation', () => {
    let app;
    let wanRouter;

    beforeEach(() => {
      jest.resetModules();
      wanRouter = require('../../wan');
      app = express();
      app.use(express.json());
      app.use('/api/wan', wanRouter);
    });

    describe('POST /api/wan/generate', () => {
      describe('validation', () => {
        it('should require a prompt', async () => {
          const response = await request(app)
            .post('/api/wan/generate')
            .send({});

          expect(response.status).toBe(400);
          expect(response.body.error).toBe('Prompt is required');
        });
      });

      describe('successful generation', () => {
        it('should generate video successfully', async () => {
          mockReplicateRun.mockResolvedValue('https://replicate.com/output/wan-video.mp4');

          const response = await request(app)
            .post('/api/wan/generate')
            .send({
              prompt: 'A flowing river',
              resolution: '720p',
              numFrames: 81,
              framesPerSecond: 16
            });

          expect(response.status).toBe(200);
          expect(response.body.success).toBe(true);
          expect(response.body.model).toBe('wan-2.2-i2v-a14b');
          expect(response.body.videoUrl).toBe('https://replicate.com/output/wan-video.mp4');
          expect(response.body.parameters.resolution).toBe('720p');
          expect(response.body.parameters.numFrames).toBe(81);
          expect(response.body.parameters.framesPerSecond).toBe(16);
        });

        it('should pass optional image parameter', async () => {
          mockReplicateRun.mockResolvedValue('https://example.com/video.mp4');

          await request(app)
            .post('/api/wan/generate')
            .send({
              prompt: 'Animate this',
              image: 'data:image/png;base64,imagedata'
            });

          expect(mockReplicateRun).toHaveBeenCalledWith(
            'wan-video/wan-2.2-i2v-a14b',
            expect.objectContaining({
              input: expect.objectContaining({
                image: 'data:image/png;base64,imagedata'
              })
            })
          );
        });

        it('should pass seed when provided', async () => {
          mockReplicateRun.mockResolvedValue('https://example.com/video.mp4');

          await request(app)
            .post('/api/wan/generate')
            .send({
              prompt: 'Test video',
              seed: 12345
            });

          expect(mockReplicateRun).toHaveBeenCalledWith(
            'wan-video/wan-2.2-i2v-a14b',
            expect.objectContaining({
              input: expect.objectContaining({
                seed: 12345
              })
            })
          );
        });

        it('should use default values', async () => {
          mockReplicateRun.mockResolvedValue('https://example.com/video.mp4');

          await request(app)
            .post('/api/wan/generate')
            .send({ prompt: 'Test prompt' });

          expect(mockReplicateRun).toHaveBeenCalledWith(
            'wan-video/wan-2.2-i2v-a14b',
            expect.objectContaining({
              input: expect.objectContaining({
                prompt: 'Test prompt',
                resolution: '480p', // Default
                num_frames: 81, // Default
                frames_per_second: 16, // Default
                sample_steps: 30, // Default
                sample_shift: 5, // Default
                go_fast: false // Default
              })
            })
          );
        });
      });

      describe('error handling', () => {
        it('should handle invalid input errors', async () => {
          mockReplicateRun.mockRejectedValue(new Error('Invalid input parameters'));

          const response = await request(app)
            .post('/api/wan/generate')
            .send({ prompt: 'Test prompt' });

          expect(response.status).toBe(400);
          expect(response.body.error).toBe('Invalid input parameters');
        });

        it('should handle rate limit errors', async () => {
          mockReplicateRun.mockRejectedValue(new Error('Rate limit exceeded'));

          const response = await request(app)
            .post('/api/wan/generate')
            .send({ prompt: 'Test prompt' });

          expect(response.status).toBe(429);
          expect(response.body.error).toContain('Rate limit');
        });

        it('should handle generic errors', async () => {
          mockReplicateRun.mockRejectedValue(new Error('Unknown error'));

          const response = await request(app)
            .post('/api/wan/generate')
            .send({ prompt: 'Test prompt' });

          expect(response.status).toBe(500);
          expect(response.body.error).toBe('Video generation failed');
        });
      });
    });
  });

  describe('Veo Video Generation', () => {
    let app;
    let veoRouter;

    beforeEach(() => {
      jest.resetModules();
      veoRouter = require('../../veo');
      app = express();
      app.use(express.json());
      app.use('/api/veo', veoRouter);
    });

    describe('POST /api/veo/generate', () => {
      describe('validation', () => {
        it('should require a prompt', async () => {
          const response = await request(app)
            .post('/api/veo/generate')
            .send({});

          expect(response.status).toBe(400);
          expect(response.body.error).toBe('Prompt is required');
        });
      });

      describe('successful generation', () => {
        it('should generate video successfully', async () => {
          mockReplicateRun.mockResolvedValue('https://replicate.com/output/veo-video.mp4');

          const response = await request(app)
            .post('/api/veo/generate')
            .send({
              prompt: 'A cinematic scene',
              aspectRatio: '16:9',
              duration: 8,
              resolution: '1080p',
              generateAudio: true
            });

          expect(response.status).toBe(200);
          expect(response.body.success).toBe(true);
          expect(response.body.model).toBe('veo-3.1-fast');
          expect(response.body.videoUrl).toBe('https://replicate.com/output/veo-video.mp4');
          expect(response.body.parameters.aspectRatio).toBe('16:9');
          expect(response.body.parameters.duration).toBe(8);
          expect(response.body.parameters.resolution).toBe('1080p');
          expect(response.body.parameters.generateAudio).toBe(true);
        });

        it('should pass optional image parameter', async () => {
          mockReplicateRun.mockResolvedValue('https://example.com/video.mp4');

          await request(app)
            .post('/api/veo/generate')
            .send({
              prompt: 'Animate this image',
              image: 'data:image/png;base64,startimage'
            });

          expect(mockReplicateRun).toHaveBeenCalledWith(
            'google/veo-3.1-fast',
            expect.objectContaining({
              input: expect.objectContaining({
                image: 'data:image/png;base64,startimage'
              })
            })
          );
        });

        it('should pass last frame parameter', async () => {
          mockReplicateRun.mockResolvedValue('https://example.com/video.mp4');

          await request(app)
            .post('/api/veo/generate')
            .send({
              prompt: 'Transition video',
              lastFrame: 'data:image/png;base64,endimage'
            });

          expect(mockReplicateRun).toHaveBeenCalledWith(
            'google/veo-3.1-fast',
            expect.objectContaining({
              input: expect.objectContaining({
                last_frame: 'data:image/png;base64,endimage'
              })
            })
          );
        });

        it('should pass negative prompt', async () => {
          mockReplicateRun.mockResolvedValue('https://example.com/video.mp4');

          await request(app)
            .post('/api/veo/generate')
            .send({
              prompt: 'Beautiful scene',
              negativePrompt: 'blurry, dark, low quality'
            });

          expect(mockReplicateRun).toHaveBeenCalledWith(
            'google/veo-3.1-fast',
            expect.objectContaining({
              input: expect.objectContaining({
                negative_prompt: 'blurry, dark, low quality'
              })
            })
          );
        });

        it('should pass seed when provided', async () => {
          mockReplicateRun.mockResolvedValue('https://example.com/video.mp4');

          await request(app)
            .post('/api/veo/generate')
            .send({
              prompt: 'Test video',
              seed: 54321
            });

          expect(mockReplicateRun).toHaveBeenCalledWith(
            'google/veo-3.1-fast',
            expect.objectContaining({
              input: expect.objectContaining({
                seed: 54321
              })
            })
          );
        });

        it('should use default values', async () => {
          mockReplicateRun.mockResolvedValue('https://example.com/video.mp4');

          await request(app)
            .post('/api/veo/generate')
            .send({ prompt: 'Test prompt' });

          expect(mockReplicateRun).toHaveBeenCalledWith(
            'google/veo-3.1-fast',
            expect.objectContaining({
              input: expect.objectContaining({
                prompt: 'Test prompt',
                aspect_ratio: '16:9', // Default
                duration: 8, // Default
                resolution: '720p', // Default
                generate_audio: true // Default
              })
            })
          );
        });
      });

      describe('error handling', () => {
        it('should handle invalid input errors', async () => {
          mockReplicateRun.mockRejectedValue(new Error('Invalid input format'));

          const response = await request(app)
            .post('/api/veo/generate')
            .send({ prompt: 'Test prompt' });

          expect(response.status).toBe(400);
          expect(response.body.error).toBe('Invalid input parameters');
        });

        it('should handle rate limit errors', async () => {
          mockReplicateRun.mockRejectedValue(new Error('Rate limit exceeded'));

          const response = await request(app)
            .post('/api/veo/generate')
            .send({ prompt: 'Test prompt' });

          expect(response.status).toBe(429);
          expect(response.body.error).toContain('Rate limit');
        });

        it('should handle generic errors', async () => {
          mockReplicateRun.mockRejectedValue(new Error('GPU unavailable'));

          const response = await request(app)
            .post('/api/veo/generate')
            .send({ prompt: 'Test prompt' });

          expect(response.status).toBe(500);
          expect(response.body.error).toBe('Video generation failed');
          expect(response.body.message).toBe('GPU unavailable');
        });
      });
    });
  });
});
