/**
 * Qwen Generation Tests (uses GPU Router + RunPod)
 */

const request = require('supertest');
const express = require('express');

// Mock GPU Router service
const mockRouteGenerationRequest = jest.fn();
const mockGetJobStatus = jest.fn();

jest.mock('../../services/gpuRouter', () => ({
  routeGenerationRequest: mockRouteGenerationRequest,
  getJobStatus: mockGetJobStatus
}));

// Store original env
const originalEnv = process.env;

describe('Qwen Generation', () => {
  let app;
  let qwenRouter;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Set required env vars
    process.env = {
      ...originalEnv,
      RUNPOD_API_KEY: 'test-runpod-key',
      RUNPOD_ENDPOINT_ID: 'test-endpoint-123'
    };

    // Clear and re-mock
    jest.mock('../../services/gpuRouter', () => ({
      routeGenerationRequest: mockRouteGenerationRequest,
      getJobStatus: mockGetJobStatus
    }));

    // Import router after setting env
    qwenRouter = require('../../qwen');

    app = express();
    app.use(express.json());
    app.use('/api/qwen', qwenRouter);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('POST /api/qwen/generate', () => {
    describe('validation', () => {
      it('should require a prompt', async () => {
        const response = await request(app)
          .post('/api/qwen/generate')
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Prompt is required');
      });

      it('should require RunPod API key', async () => {
        jest.resetModules();
        delete process.env.RUNPOD_API_KEY;

        const noKeyRouter = require('../../qwen');
        const noKeyApp = express();
        noKeyApp.use(express.json());
        noKeyApp.use('/api/qwen', noKeyRouter);

        const response = await request(noKeyApp)
          .post('/api/qwen/generate')
          .send({ prompt: 'Test prompt' });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('RunPod not configured');
      });

      it('should require RunPod endpoint ID', async () => {
        jest.resetModules();
        delete process.env.RUNPOD_ENDPOINT_ID;

        const noEndpointRouter = require('../../qwen');
        const noEndpointApp = express();
        noEndpointApp.use(express.json());
        noEndpointApp.use('/api/qwen', noEndpointRouter);

        const response = await request(noEndpointApp)
          .post('/api/qwen/generate')
          .send({ prompt: 'Test prompt' });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('RunPod not configured');
      });
    });

    describe('successful generation', () => {
      it('should submit job successfully', async () => {
        mockRouteGenerationRequest.mockResolvedValue({
          success: true,
          jobId: 'job-123',
          status: 'IN_QUEUE',
          endpoint: 'serverless'
        });

        const response = await request(app)
          .post('/api/qwen/generate')
          .send({
            prompt: 'A beautiful landscape',
            width: 1024,
            height: 1024
          });

        expect(response.status).toBe(200);
        expect(response.body.jobId).toBe('job-123');
        expect(response.body.status).toBe('IN_QUEUE');
        expect(response.body.endpoint).toBe('serverless');
      });

      it('should use default dimensions when not specified', async () => {
        mockRouteGenerationRequest.mockResolvedValue({
          success: true,
          jobId: 'job-456',
          status: 'IN_QUEUE',
          endpoint: 'serverless'
        });

        await request(app)
          .post('/api/qwen/generate')
          .send({ prompt: 'Test prompt' });

        expect(mockRouteGenerationRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            workflow: expect.objectContaining({
              '58': expect.objectContaining({
                inputs: expect.objectContaining({
                  width: 1152,
                  height: 1536
                })
              })
            })
          })
        );
      });

      it('should include negative prompt in workflow', async () => {
        mockRouteGenerationRequest.mockResolvedValue({
          success: true,
          jobId: 'job-789',
          status: 'IN_QUEUE',
          endpoint: 'serverless'
        });

        await request(app)
          .post('/api/qwen/generate')
          .send({
            prompt: 'A beautiful sunset',
            negativePrompt: 'blurry, low quality'
          });

        expect(mockRouteGenerationRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            workflow: expect.objectContaining({
              '7': expect.objectContaining({
                inputs: expect.objectContaining({
                  text: 'blurry, low quality'
                })
              })
            })
          })
        );
      });

      it('should include LoRAs in workflow', async () => {
        mockRouteGenerationRequest.mockResolvedValue({
          success: true,
          jobId: 'job-lora',
          status: 'IN_QUEUE',
          endpoint: 'serverless'
        });

        await request(app)
          .post('/api/qwen/generate')
          .send({
            prompt: 'Test prompt',
            loras: [
              'custom-lora.safetensors',
              { name: 'another-lora.safetensors', strength: 0.8 }
            ]
          });

        expect(mockRouteGenerationRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            workflow: expect.objectContaining({
              '76': expect.objectContaining({
                inputs: expect.objectContaining({
                  lora_1: expect.objectContaining({
                    on: true,
                    lora: 'custom-lora.safetensors',
                    strength: 1
                  }),
                  lora_2: expect.objectContaining({
                    on: true,
                    lora: 'another-lora.safetensors',
                    strength: 0.8
                  })
                })
              })
            })
          })
        );
      });

      it('should indicate when fallback was used', async () => {
        mockRouteGenerationRequest.mockResolvedValue({
          success: true,
          jobId: 'job-fallback',
          status: 'IN_QUEUE',
          endpoint: 'serverless',
          usedFallback: true
        });

        const response = await request(app)
          .post('/api/qwen/generate')
          .send({ prompt: 'Test prompt' });

        expect(response.status).toBe(200);
        expect(response.body.usedFallback).toBe(true);
      });
    });

    describe('error handling', () => {
      it('should handle GPU router errors', async () => {
        mockRouteGenerationRequest.mockResolvedValue({
          success: false,
          error: 'All endpoints unavailable'
        });

        const response = await request(app)
          .post('/api/qwen/generate')
          .send({ prompt: 'Test prompt' });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Failed to submit job');
        expect(response.body.details).toBe('All endpoints unavailable');
      });

      it('should handle unexpected exceptions', async () => {
        mockRouteGenerationRequest.mockRejectedValue(new Error('Network failure'));

        const response = await request(app)
          .post('/api/qwen/generate')
          .send({ prompt: 'Test prompt' });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Network failure');
      });
    });
  });

  describe('GET /api/qwen/status/:jobId', () => {
    describe('validation', () => {
      it('should require RunPod configuration', async () => {
        jest.resetModules();
        delete process.env.RUNPOD_API_KEY;

        const noKeyRouter = require('../../qwen');
        const noKeyApp = express();
        noKeyApp.use(express.json());
        noKeyApp.use('/api/qwen', noKeyRouter);

        const response = await request(noKeyApp)
          .get('/api/qwen/status/job-123');

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('RunPod not configured');
      });
    });

    describe('status mapping', () => {
      it('should map IN_QUEUE to queued', async () => {
        mockGetJobStatus.mockResolvedValue({
          success: true,
          data: { id: 'job-123', status: 'IN_QUEUE' }
        });

        const response = await request(app)
          .get('/api/qwen/status/job-123');

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('queued');
        expect(response.body.rawStatus).toBe('IN_QUEUE');
      });

      it('should map IN_PROGRESS to processing', async () => {
        mockGetJobStatus.mockResolvedValue({
          success: true,
          data: { id: 'job-123', status: 'IN_PROGRESS' }
        });

        const response = await request(app)
          .get('/api/qwen/status/job-123');

        expect(response.body.status).toBe('processing');
      });

      it('should map COMPLETED to completed', async () => {
        mockGetJobStatus.mockResolvedValue({
          success: true,
          data: { id: 'job-123', status: 'COMPLETED', output: {} }
        });

        const response = await request(app)
          .get('/api/qwen/status/job-123');

        expect(response.body.status).toBe('completed');
      });

      it('should map FAILED to failed', async () => {
        mockGetJobStatus.mockResolvedValue({
          success: true,
          data: { id: 'job-123', status: 'FAILED', error: 'Out of memory' }
        });

        const response = await request(app)
          .get('/api/qwen/status/job-123');

        expect(response.body.status).toBe('failed');
        expect(response.body.error).toBe('Out of memory');
      });

      it('should map CANCELLED to cancelled', async () => {
        mockGetJobStatus.mockResolvedValue({
          success: true,
          data: { id: 'job-123', status: 'CANCELLED' }
        });

        const response = await request(app)
          .get('/api/qwen/status/job-123');

        expect(response.body.status).toBe('cancelled');
      });
    });

    describe('output handling', () => {
      it('should extract image from images array (string format)', async () => {
        mockGetJobStatus.mockResolvedValue({
          success: true,
          data: {
            id: 'job-123',
            status: 'COMPLETED',
            output: {
              images: ['base64imagedata']
            }
          }
        });

        const response = await request(app)
          .get('/api/qwen/status/job-123');

        expect(response.body.status).toBe('completed');
        expect(response.body.imageUrl).toBe('data:image/png;base64,base64imagedata');
        expect(response.body.images).toHaveLength(1);
      });

      it('should extract image from images array (object with data)', async () => {
        mockGetJobStatus.mockResolvedValue({
          success: true,
          data: {
            id: 'job-123',
            status: 'COMPLETED',
            output: {
              images: [{ data: 'base64data' }]
            }
          }
        });

        const response = await request(app)
          .get('/api/qwen/status/job-123');

        expect(response.body.imageUrl).toBe('data:image/png;base64,base64data');
      });

      it('should extract image from images array (object with image)', async () => {
        mockGetJobStatus.mockResolvedValue({
          success: true,
          data: {
            id: 'job-123',
            status: 'COMPLETED',
            output: {
              images: [{ image: 'base64data' }]
            }
          }
        });

        const response = await request(app)
          .get('/api/qwen/status/job-123');

        expect(response.body.imageUrl).toBe('data:image/png;base64,base64data');
      });

      it('should extract single image from output.image', async () => {
        mockGetJobStatus.mockResolvedValue({
          success: true,
          data: {
            id: 'job-123',
            status: 'COMPLETED',
            output: {
              image: 'singleimagebase64'
            }
          }
        });

        const response = await request(app)
          .get('/api/qwen/status/job-123');

        expect(response.body.imageUrl).toBe('data:image/png;base64,singleimagebase64');
      });

      it('should extract image from output.message', async () => {
        mockGetJobStatus.mockResolvedValue({
          success: true,
          data: {
            id: 'job-123',
            status: 'COMPLETED',
            output: {
              message: 'messagebase64data'
            }
          }
        });

        const response = await request(app)
          .get('/api/qwen/status/job-123');

        expect(response.body.imageUrl).toBe('data:image/png;base64,messagebase64data');
      });

      it('should handle data: prefix in output', async () => {
        mockGetJobStatus.mockResolvedValue({
          success: true,
          data: {
            id: 'job-123',
            status: 'COMPLETED',
            output: {
              images: ['data:image/png;base64,alreadyprefixed']
            }
          }
        });

        const response = await request(app)
          .get('/api/qwen/status/job-123');

        // Should not double-prefix
        expect(response.body.imageUrl).toBe('data:image/png;base64,alreadyprefixed');
      });

      it('should pass through raw output for unknown formats', async () => {
        mockGetJobStatus.mockResolvedValue({
          success: true,
          data: {
            id: 'job-123',
            status: 'COMPLETED',
            output: {
              someUnknownField: 'value'
            }
          }
        });

        const response = await request(app)
          .get('/api/qwen/status/job-123');

        expect(response.body.output).toEqual({ someUnknownField: 'value' });
        expect(response.body.imageUrl).toBeUndefined();
      });
    });

    describe('error handling', () => {
      it('should handle GPU router status errors', async () => {
        mockGetJobStatus.mockResolvedValue({
          success: false,
          error: 'Job not found'
        });

        const response = await request(app)
          .get('/api/qwen/status/job-123');

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Failed to get job status');
        expect(response.body.details).toBe('Job not found');
      });

      it('should handle unexpected exceptions', async () => {
        mockGetJobStatus.mockRejectedValue(new Error('Connection timeout'));

        const response = await request(app)
          .get('/api/qwen/status/job-123');

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Connection timeout');
      });
    });
  });

  describe('GET /api/qwen/health', () => {
    it('should return configured status when API key is set', async () => {
      const response = await request(app).get('/api/qwen/health');

      expect(response.status).toBe(200);
      expect(response.body.service).toBe('qwen');
      expect(response.body.status).toBe('configured');
      expect(response.body.endpoint).toContain('123'); // Partial endpoint ID
    });

    it('should return not configured when missing config', async () => {
      jest.resetModules();
      delete process.env.RUNPOD_API_KEY;

      const noKeyRouter = require('../../qwen');
      const noKeyApp = express();
      noKeyApp.use(express.json());
      noKeyApp.use('/api/qwen', noKeyRouter);

      const response = await request(noKeyApp).get('/api/qwen/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('not configured');
    });
  });
});
