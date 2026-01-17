/**
 * User Images API Route Tests
 */

const request = require('supertest');
const express = require('express');

// Mock dependencies
const mockSupabase = {
  from: jest.fn(),
  storage: {
    from: jest.fn()
  }
};

jest.mock('../../services/supabase', () => ({
  supabase: mockSupabase
}));

jest.mock('../../services/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

jest.mock('../../services/imageModeration', () => ({
  screenImage: jest.fn(),
  isEnabled: jest.fn()
}));

// Mock auth middleware to set userId
jest.mock('../../middleware/auth', () => ({
  requireAuth: (req, res, next) => {
    if (req.headers.authorization === 'Bearer valid-token') {
      req.userId = 'test-user-123';
      req.user = { id: 'test-user-123', email: 'test@example.com' };
      return next();
    }
    if (req.headers.authorization === 'Bearer admin-token') {
      req.userId = 'admin-user-123';
      req.user = { id: 'admin-user-123', email: 'admin@example.com' };
      req.isAdmin = true;
      return next();
    }
    return res.status(401).json({ error: 'Authentication required' });
  }
}));

const userImagesRouter = require('../../user-images');
const { screenImage, isEnabled } = require('../../services/imageModeration');

describe('User Images API', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/user-images', userImagesRouter);
  });

  describe('GET /api/user-images (list images)', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/user-images')
        .expect(401);

      expect(response.body.error).toBe('Authentication required');
    });

    it('should return user images with signed URLs', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              range: jest.fn().mockResolvedValue({
                data: [
                  {
                    id: 'image-1',
                    filename: 'test.png',
                    status: 'auto_approved',
                    created_at: '2024-01-01T00:00:00Z',
                    appeal_submitted_at: null
                  }
                ],
                error: null,
                count: 1
              })
            })
          })
        })
      });

      mockSupabase.storage.from.mockReturnValue({
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://storage.example.com/signed-url' }
        })
      });

      const response = await request(app)
        .get('/api/user-images')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.images).toHaveLength(1);
      expect(response.body.images[0]).toMatchObject({
        id: 'image-1',
        filename: 'test.png',
        status: 'auto_approved',
        canUse: true,
        canAppeal: false
      });
      expect(response.body.total).toBe(1);
    });

    it('should filter by status', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockImplementation((field, value) => {
            if (field === 'user_id') {
              return {
                order: jest.fn().mockReturnValue({
                  range: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({
                      data: [],
                      error: null,
                      count: 0
                    })
                  })
                }),
                eq: jest.fn().mockReturnValue({
                  order: jest.fn().mockReturnValue({
                    range: jest.fn().mockResolvedValue({
                      data: [],
                      error: null,
                      count: 0
                    })
                  })
                })
              };
            }
            return mockQuery;
          })
        })
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      await request(app)
        .get('/api/user-images?status=pending_review')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);
    });
  });

  describe('GET /api/user-images/:id (get single image)', () => {
    it('should return 404 for non-existent image', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'Not found' }
              })
            })
          })
        })
      });

      const response = await request(app)
        .get('/api/user-images/non-existent-id')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(response.body.error).toBe('Image not found');
    });

    it('should return image details with canAppeal flag', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  id: 'image-1',
                  storage_path: 'test-user-123/image.png',
                  status: 'pending_review',
                  appeal_submitted_at: null
                },
                error: null
              })
            })
          })
        })
      });

      mockSupabase.storage.from.mockReturnValue({
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://storage.example.com/signed-url' }
        })
      });

      const response = await request(app)
        .get('/api/user-images/image-1')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.canAppeal).toBe(true);
      expect(response.body.canUse).toBe(false);
    });
  });

  describe('POST /api/user-images/:id/appeal', () => {
    it('should require a reason', async () => {
      const response = await request(app)
        .post('/api/user-images/image-1/appeal')
        .set('Authorization', 'Bearer valid-token')
        .send({})
        .expect(400);

      expect(response.body.error).toContain('reason');
    });

    it('should require reason to be at least 10 characters', async () => {
      const response = await request(app)
        .post('/api/user-images/image-1/appeal')
        .set('Authorization', 'Bearer valid-token')
        .send({ reason: 'Short' })
        .expect(400);

      expect(response.body.error).toContain('10 characters');
    });

    it('should reject if reason exceeds 1000 characters', async () => {
      const response = await request(app)
        .post('/api/user-images/image-1/appeal')
        .set('Authorization', 'Bearer valid-token')
        .send({ reason: 'a'.repeat(1001) })
        .expect(400);

      expect(response.body.error).toContain('1000 characters');
    });

    it('should return 404 for non-existent image', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'Not found' }
              })
            })
          })
        })
      });

      const response = await request(app)
        .post('/api/user-images/non-existent/appeal')
        .set('Authorization', 'Bearer valid-token')
        .send({ reason: 'This is a valid appeal reason for testing' })
        .expect(404);

      expect(response.body.error).toBe('Image not found');
    });

    it('should reject appeal for non-pending image', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  status: 'auto_approved',
                  appeal_submitted_at: null
                },
                error: null
              })
            })
          })
        })
      });

      const response = await request(app)
        .post('/api/user-images/image-1/appeal')
        .set('Authorization', 'Bearer valid-token')
        .send({ reason: 'This is a valid appeal reason for testing' })
        .expect(400);

      expect(response.body.error).toContain('not pending review');
    });

    it('should reject if appeal already submitted', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  status: 'pending_review',
                  appeal_submitted_at: '2024-01-01T00:00:00Z'
                },
                error: null
              })
            })
          })
        })
      });

      const response = await request(app)
        .post('/api/user-images/image-1/appeal')
        .set('Authorization', 'Bearer valid-token')
        .send({ reason: 'This is a valid appeal reason for testing' })
        .expect(400);

      expect(response.body.error).toContain('already been submitted');
    });

    it('should successfully submit appeal', async () => {
      // First call: fetch image status
      const selectMock = jest.fn().mockReturnValueOnce({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                status: 'pending_review',
                appeal_submitted_at: null
              },
              error: null
            })
          })
        })
      });

      // Second call: update with appeal
      const updateMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  id: 'image-1',
                  status: 'pending_review',
                  appeal_submitted_at: '2024-01-01T00:00:00Z'
                },
                error: null
              })
            })
          })
        })
      });

      mockSupabase.from.mockImplementation(() => ({
        select: selectMock,
        update: updateMock
      }));

      const response = await request(app)
        .post('/api/user-images/image-1/appeal')
        .set('Authorization', 'Bearer valid-token')
        .send({ reason: 'This image was incorrectly flagged because it does not contain any celebrities' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('submitted');
    });
  });

  describe('DELETE /api/user-images/:id', () => {
    it('should return 404 for non-existent image', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'Not found' }
              })
            })
          })
        })
      });

      const response = await request(app)
        .delete('/api/user-images/non-existent')
        .set('Authorization', 'Bearer valid-token')
        .expect(404);

      expect(response.body.error).toBe('Image not found');
    });

    it('should delete image from storage and database', async () => {
      const removeMock = jest.fn().mockResolvedValue({ error: null });
      const deleteMock = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null })
        })
      });

      mockSupabase.from.mockImplementation(() => ({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { storage_path: 'test-user-123/image.png' },
                error: null
              })
            })
          })
        }),
        delete: deleteMock
      }));

      mockSupabase.storage.from.mockReturnValue({
        remove: removeMock
      });

      const response = await request(app)
        .delete('/api/user-images/image-1')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(removeMock).toHaveBeenCalledWith(['test-user-123/image.png']);
    });
  });

  describe('GET /api/user-images/:id/data', () => {
    it('should return 403 for non-approved image', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  storage_path: 'test-user-123/image.png',
                  status: 'pending_review',
                  mime_type: 'image/png'
                },
                error: null
              })
            })
          })
        })
      });

      const response = await request(app)
        .get('/api/user-images/image-1/data')
        .set('Authorization', 'Bearer valid-token')
        .expect(403);

      expect(response.body.error).toBe('Image not approved');
      expect(response.body.status).toBe('pending_review');
    });

    it('should return base64 data for approved image', async () => {
      const mockImageBuffer = Buffer.from('fake-image-content');

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  storage_path: 'test-user-123/image.png',
                  status: 'auto_approved',
                  mime_type: 'image/png'
                },
                error: null
              })
            })
          })
        })
      });

      mockSupabase.storage.from.mockReturnValue({
        download: jest.fn().mockResolvedValue({
          data: {
            arrayBuffer: () => Promise.resolve(mockImageBuffer.buffer)
          },
          error: null
        })
      });

      const response = await request(app)
        .get('/api/user-images/image-1/data')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.id).toBe('image-1');
      expect(response.body.dataUrl).toMatch(/^data:image\/png;base64,/);
      expect(response.body.mimeType).toBe('image/png');
    });

    it('should accept manually approved images', async () => {
      const mockImageBuffer = Buffer.from('fake-image-content');

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  storage_path: 'test-user-123/image.png',
                  status: 'approved', // manually approved by admin
                  mime_type: 'image/png'
                },
                error: null
              })
            })
          })
        })
      });

      mockSupabase.storage.from.mockReturnValue({
        download: jest.fn().mockResolvedValue({
          data: {
            arrayBuffer: () => Promise.resolve(mockImageBuffer.buffer)
          },
          error: null
        })
      });

      const response = await request(app)
        .get('/api/user-images/image-1/data')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.dataUrl).toMatch(/^data:image\/png;base64,/);
    });
  });
});

describe('Admin Endpoints', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/user-images', userImagesRouter);
  });

  describe('GET /api/user-images/admin/queue', () => {
    it('should require admin access', async () => {
      // Mock isAdmin to return false for regular users
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { role: 'user' },
              error: null
            })
          })
        })
      });

      const response = await request(app)
        .get('/api/user-images/admin/queue')
        .set('Authorization', 'Bearer valid-token')
        .expect(403);

      expect(response.body.error).toBe('Admin access required');
    });

    it('should return pending images for admin', async () => {
      // Mock isAdmin check
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { role: 'admin' },
                  error: null
                })
              })
            })
          };
        }
        // user_images table query
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({
                  range: jest.fn().mockResolvedValue({
                    data: [{
                      id: 'pending-image',
                      user_id: 'user-1',
                      status: 'pending_review',
                      appeal_submitted_at: '2024-01-01T00:00:00Z',
                      storage_path: 'user-1/image.png'
                    }],
                    error: null,
                    count: 1
                  })
                })
              })
            })
          })
        };
      });

      mockSupabase.storage.from.mockReturnValue({
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://storage.example.com/signed-url' }
        })
      });

      const response = await request(app)
        .get('/api/user-images/admin/queue')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(response.body.images).toHaveLength(1);
      expect(response.body.images[0].storage_path).toBeUndefined(); // Should not expose storage path
    });
  });

  describe('POST /api/user-images/admin/:id/review', () => {
    it('should reject invalid decision', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { role: 'admin' },
              error: null
            })
          })
        })
      });

      const response = await request(app)
        .post('/api/user-images/admin/image-1/review')
        .set('Authorization', 'Bearer admin-token')
        .send({ decision: 'maybe' })
        .expect(400);

      expect(response.body.error).toContain('approved');
    });

    it('should approve image', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { role: 'admin' },
                  error: null
                })
              })
            })
          };
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { status: 'pending_review', user_id: 'user-1' },
                error: null
              })
            })
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'image-1', status: 'approved', reviewed_at: '2024-01-01T00:00:00Z' },
                  error: null
                })
              })
            })
          })
        };
      });

      const response = await request(app)
        .post('/api/user-images/admin/image-1/review')
        .set('Authorization', 'Bearer admin-token')
        .send({ decision: 'approved', notes: 'Image is fine' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Image approved');
    });

    it('should reject image and set expiry', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { role: 'admin' },
                  error: null
                })
              })
            })
          };
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { status: 'pending_review', user_id: 'user-1' },
                error: null
              })
            })
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'image-1', status: 'rejected', reviewed_at: '2024-01-01T00:00:00Z' },
                  error: null
                })
              })
            })
          })
        };
      });

      const response = await request(app)
        .post('/api/user-images/admin/image-1/review')
        .set('Authorization', 'Bearer admin-token')
        .send({ decision: 'rejected', notes: 'Celebrity detected' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Image rejected');
    });
  });

  describe('POST /api/user-images/admin/bulk-review', () => {
    it('should require non-empty imageIds array', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { role: 'admin' },
              error: null
            })
          })
        })
      });

      const response = await request(app)
        .post('/api/user-images/admin/bulk-review')
        .set('Authorization', 'Bearer admin-token')
        .send({ imageIds: [], decision: 'approved' })
        .expect(400);

      expect(response.body.error).toContain('non-empty array');
    });

    it('should limit bulk operations to 50 images', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { role: 'admin' },
              error: null
            })
          })
        })
      });

      const response = await request(app)
        .post('/api/user-images/admin/bulk-review')
        .set('Authorization', 'Bearer admin-token')
        .send({
          imageIds: Array(51).fill('image-id'),
          decision: 'approved'
        })
        .expect(400);

      expect(response.body.error).toContain('50 images');
    });

    it('should bulk approve images', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { role: 'admin' },
                  error: null
                })
              })
            })
          };
        }
        return {
          update: jest.fn().mockReturnValue({
            in: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                select: jest.fn().mockResolvedValue({
                  data: [{ id: 'image-1' }, { id: 'image-2' }],
                  error: null
                })
              })
            })
          })
        };
      });

      const response = await request(app)
        .post('/api/user-images/admin/bulk-review')
        .set('Authorization', 'Bearer admin-token')
        .send({
          imageIds: ['image-1', 'image-2'],
          decision: 'approved'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.updatedCount).toBe(2);
    });
  });
});
