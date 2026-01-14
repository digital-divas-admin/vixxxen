/**
 * Admin Character CRUD Tests
 * Tests for character management (marketplace)
 */

const request = require('supertest');
const express = require('express');

// Mock Supabase
const mockSupabase = {
  from: jest.fn()
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase)
}));

// Mock auth middleware
jest.mock('../../middleware/auth', () => ({
  requireAuth: (req, res, next) => {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.userId = 'user-123';
    next();
  },
  optionalAuth: (req, res, next) => {
    if (req.headers.authorization) {
      req.userId = 'user-123';
    }
    next();
  },
  requireAdmin: (req, res, next) => {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!req.headers['x-admin']) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.userId = 'admin-123';
    next();
  },
  verifyOwnership: () => (req, res, next) => next()
}));

// Set env vars before import
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

// Import router after mocks
const charactersRouter = require('../../characters');

describe('Character CRUD API', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/characters', charactersRouter);
  });

  describe('GET /api/characters', () => {
    describe('public access', () => {
      it('should return public characters for unauthenticated users', async () => {
        const mockCharacters = [
          { id: '1', name: 'Character 1', price: 0, is_active: true },
          { id: '2', name: 'Character 2', price: 500, is_active: true }
        ];

        mockSupabase.from.mockImplementation((table) => {
          if (table === 'marketplace_characters') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  not: jest.fn().mockReturnValue({
                    order: jest.fn().mockResolvedValue({ data: mockCharacters, error: null })
                  })
                })
              })
            };
          }
          if (table === 'user_characters') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ data: [], error: null })
              })
            };
          }
        });

        const response = await request(app)
          .get('/api/characters');

        expect(response.status).toBe(200);
        expect(response.body.characters).toHaveLength(2);
        // Free character should be marked as owned
        expect(response.body.characters[0].is_owned).toBe(true);
        // Paid character should not be owned
        expect(response.body.characters[1].is_owned).toBe(false);
      });

      it('should mark owned characters for authenticated users', async () => {
        const mockCharacters = [
          { id: '1', name: 'Character 1', price: 500, is_active: true },
          { id: '2', name: 'Character 2', price: 500, is_active: true }
        ];

        mockSupabase.from.mockImplementation((table) => {
          if (table === 'marketplace_characters') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  not: jest.fn().mockReturnValue({
                    order: jest.fn().mockResolvedValue({ data: mockCharacters, error: null })
                  })
                })
              })
            };
          }
          if (table === 'user_characters') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({
                  data: [{ character_id: '1' }], // User owns character 1
                  error: null
                })
              })
            };
          }
        });

        const response = await request(app)
          .get('/api/characters')
          .set('Authorization', 'Bearer test-token');

        expect(response.status).toBe(200);
        expect(response.body.characters[0].is_owned).toBe(true);
        expect(response.body.characters[1].is_owned).toBe(false);
      });

      it('should use cache for subsequent requests', async () => {
        // Reset modules to get fresh cache
        jest.resetModules();

        const mockCharacters = [{ id: '1', name: 'Cached Character', price: 0 }];
        let callCount = 0;

        // Re-setup mocks after module reset
        const mockSupabaseNew = {
          from: jest.fn().mockImplementation((table) => {
            if (table === 'marketplace_characters') {
              callCount++;
              return {
                select: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    not: jest.fn().mockReturnValue({
                      order: jest.fn().mockResolvedValue({ data: mockCharacters, error: null })
                    })
                  })
                })
              };
            }
            if (table === 'user_characters') {
              return {
                select: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({ data: [], error: null })
                })
              };
            }
          })
        };

        jest.mock('@supabase/supabase-js', () => ({
          createClient: jest.fn(() => mockSupabaseNew)
        }));

        const freshRouter = require('../../characters');
        const freshApp = express();
        freshApp.use(express.json());
        freshApp.use('/api/characters', freshRouter);

        // First request
        await request(freshApp).get('/api/characters');
        // Second request (should use cache)
        await request(freshApp).get('/api/characters');

        // Marketplace query should only be called once due to caching
        expect(callCount).toBe(1);
      });
    });

    describe('error handling', () => {
      it('should handle database errors', async () => {
        // Reset modules to get fresh cache (prevents cached successful responses)
        jest.resetModules();

        const mockSupabaseError = {
          from: jest.fn().mockImplementation((table) => {
            if (table === 'marketplace_characters') {
              return {
                select: jest.fn().mockReturnValue({
                  eq: jest.fn().mockReturnValue({
                    not: jest.fn().mockReturnValue({
                      order: jest.fn().mockResolvedValue({
                        data: null,
                        error: { message: 'Database error' }
                      })
                    })
                  })
                })
              };
            }
            if (table === 'user_characters') {
              return {
                select: jest.fn().mockReturnValue({
                  eq: jest.fn().mockResolvedValue({ data: [], error: null })
                })
              };
            }
          })
        };

        jest.mock('@supabase/supabase-js', () => ({
          createClient: jest.fn(() => mockSupabaseError)
        }));

        const errorRouter = require('../../characters');
        const errorApp = express();
        errorApp.use(express.json());
        errorApp.use('/api/characters', errorRouter);

        const response = await request(errorApp)
          .get('/api/characters');

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Failed to fetch characters');
      });
    });
  });

  describe('GET /api/characters/all (Admin)', () => {
    it('should require admin authentication', async () => {
      const response = await request(app)
        .get('/api/characters/all')
        .set('Authorization', 'Bearer test-token');
      // No x-admin header

      expect(response.status).toBe(403);
    });

    it('should return all characters for admin', async () => {
      const mockCharacters = [
        { id: '1', name: 'Active', is_active: true, is_listed: true },
        { id: '2', name: 'Inactive', is_active: false, is_listed: true },
        { id: '3', name: 'Unlisted', is_active: true, is_listed: false }
      ];

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({ data: mockCharacters, error: null })
        })
      });

      const response = await request(app)
        .get('/api/characters/all')
        .set('Authorization', 'Bearer admin-token')
        .set('x-admin', 'true');

      expect(response.status).toBe(200);
      expect(response.body.characters).toHaveLength(3);
    });
  });

  describe('POST /api/characters (Admin Create)', () => {
    it('should require admin authentication', async () => {
      const response = await request(app)
        .post('/api/characters')
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'New Character', category: 'anime' });

      expect(response.status).toBe(403);
    });

    it('should require name and category', async () => {
      const response = await request(app)
        .post('/api/characters')
        .set('Authorization', 'Bearer admin-token')
        .set('x-admin', 'true')
        .send({ name: 'Test' }); // Missing category

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Name and category are required');
    });

    it('should create character with all fields', async () => {
      const newCharacter = {
        id: 'new-123',
        name: 'New Character',
        category: 'anime',
        description: 'A test character',
        price: 500,
        tags: ['tag1', 'tag2'],
        image_url: 'https://example.com/image.png',
        gallery_images: ['https://example.com/g1.png'],
        lora_url: 'https://example.com/lora.safetensors',
        trigger_word: 'newchar',
        is_active: true,
        is_listed: true,
        sort_order: 10
      };

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: newCharacter, error: null })
          })
        })
      });

      const response = await request(app)
        .post('/api/characters')
        .set('Authorization', 'Bearer admin-token')
        .set('x-admin', 'true')
        .send({
          name: 'New Character',
          category: 'anime',
          description: 'A test character',
          price: 500,
          tags: ['tag1', 'tag2'],
          image_url: 'https://example.com/image.png',
          gallery_images: ['https://example.com/g1.png'],
          lora_url: 'https://example.com/lora.safetensors',
          trigger_word: 'newchar',
          is_active: true,
          is_listed: true,
          sort_order: 10
        });

      expect(response.status).toBe(201);
      expect(response.body.character).toEqual(newCharacter);
    });

    it('should use default values for optional fields', async () => {
      let capturedInsert;
      mockSupabase.from.mockReturnValue({
        insert: jest.fn((data) => {
          capturedInsert = data;
          return {
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: '1', ...data },
                error: null
              })
            })
          };
        })
      });

      await request(app)
        .post('/api/characters')
        .set('Authorization', 'Bearer admin-token')
        .set('x-admin', 'true')
        .send({ name: 'Minimal', category: 'realistic' });

      expect(capturedInsert.price).toBe(0);
      expect(capturedInsert.tags).toEqual([]);
      expect(capturedInsert.gallery_images).toEqual([]);
      expect(capturedInsert.is_active).toBe(true);
      expect(capturedInsert.is_listed).toBe(true);
      expect(capturedInsert.sort_order).toBe(0);
    });

    it('should handle database errors', async () => {
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Duplicate key' }
            })
          })
        })
      });

      const response = await request(app)
        .post('/api/characters')
        .set('Authorization', 'Bearer admin-token')
        .set('x-admin', 'true')
        .send({ name: 'Duplicate', category: 'anime' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to create character');
    });
  });

  describe('PUT /api/characters/:id (Admin Update)', () => {
    it('should require admin authentication', async () => {
      const response = await request(app)
        .put('/api/characters/char-123')
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(403);
    });

    it('should update character fields', async () => {
      const updatedCharacter = {
        id: 'char-123',
        name: 'Updated Name',
        category: 'anime',
        price: 750,
        is_active: false
      };

      mockSupabase.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: updatedCharacter, error: null })
            })
          })
        })
      });

      const response = await request(app)
        .put('/api/characters/char-123')
        .set('Authorization', 'Bearer admin-token')
        .set('x-admin', 'true')
        .send({ name: 'Updated Name', price: 750, is_active: false });

      expect(response.status).toBe(200);
      expect(response.body.character.name).toBe('Updated Name');
      expect(response.body.character.price).toBe(750);
      expect(response.body.character.is_active).toBe(false);
    });

    it('should only update provided fields', async () => {
      let capturedUpdate;
      mockSupabase.from.mockReturnValue({
        update: jest.fn((data) => {
          capturedUpdate = data;
          return {
            eq: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'char-123', ...data },
                  error: null
                })
              })
            })
          };
        })
      });

      await request(app)
        .put('/api/characters/char-123')
        .set('Authorization', 'Bearer admin-token')
        .set('x-admin', 'true')
        .send({ name: 'Only Name Updated' });

      expect(capturedUpdate.name).toBe('Only Name Updated');
      expect(capturedUpdate.price).toBeUndefined();
      expect(capturedUpdate.category).toBeUndefined();
      // updated_at should always be set
      expect(capturedUpdate.updated_at).toBeDefined();
    });

    it('should update all character fields', async () => {
      let capturedUpdate;
      mockSupabase.from.mockReturnValue({
        update: jest.fn((data) => {
          capturedUpdate = data;
          return {
            eq: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'char-123', ...data },
                  error: null
                })
              })
            })
          };
        })
      });

      await request(app)
        .put('/api/characters/char-123')
        .set('Authorization', 'Bearer admin-token')
        .set('x-admin', 'true')
        .send({
          name: 'Full Update',
          category: 'realistic',
          description: 'New description',
          price: 1000,
          rating: 4.5,
          purchases: 50,
          tags: ['new', 'tags'],
          image_url: 'https://new.url/image.png',
          gallery_images: ['https://new.url/g1.png'],
          lora_url: 'https://new.url/lora.safetensors',
          trigger_word: 'newword',
          is_active: true,
          is_listed: false,
          sort_order: 5
        });

      expect(capturedUpdate.name).toBe('Full Update');
      expect(capturedUpdate.category).toBe('realistic');
      expect(capturedUpdate.description).toBe('New description');
      expect(capturedUpdate.price).toBe(1000);
      expect(capturedUpdate.rating).toBe(4.5);
      expect(capturedUpdate.purchases).toBe(50);
      expect(capturedUpdate.tags).toEqual(['new', 'tags']);
      expect(capturedUpdate.image_url).toBe('https://new.url/image.png');
      expect(capturedUpdate.gallery_images).toEqual(['https://new.url/g1.png']);
      expect(capturedUpdate.lora_url).toBe('https://new.url/lora.safetensors');
      expect(capturedUpdate.trigger_word).toBe('newword');
      expect(capturedUpdate.is_active).toBe(true);
      expect(capturedUpdate.is_listed).toBe(false);
      expect(capturedUpdate.sort_order).toBe(5);
    });

    it('should handle database errors', async () => {
      mockSupabase.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'Not found' }
              })
            })
          })
        })
      });

      const response = await request(app)
        .put('/api/characters/nonexistent')
        .set('Authorization', 'Bearer admin-token')
        .set('x-admin', 'true')
        .send({ name: 'Test' });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to update character');
    });
  });

  describe('DELETE /api/characters/:id (Admin Delete)', () => {
    it('should require admin authentication', async () => {
      const response = await request(app)
        .delete('/api/characters/char-123')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(403);
    });

    it('should delete character successfully', async () => {
      mockSupabase.from.mockReturnValue({
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null })
        })
      });

      const response = await request(app)
        .delete('/api/characters/char-123')
        .set('Authorization', 'Bearer admin-token')
        .set('x-admin', 'true');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should handle database errors', async () => {
      mockSupabase.from.mockReturnValue({
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            error: { message: 'Foreign key constraint' }
          })
        })
      });

      const response = await request(app)
        .delete('/api/characters/char-123')
        .set('Authorization', 'Bearer admin-token')
        .set('x-admin', 'true');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to delete character');
    });
  });

  describe('POST /api/characters/:id/purchase', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/characters/char-123/purchase');

      expect(response.status).toBe(401);
    });

    it('should handle already owned character', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'marketplace_characters') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'char-123', name: 'Test', price: 500 },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'user_characters') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: { id: 'ownership-123' }, // Already owned
                    error: null
                  })
                })
              })
            })
          };
        }
      });

      const response = await request(app)
        .post('/api/characters/char-123/purchase')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Already owned');
    });

    it('should purchase character successfully', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'marketplace_characters') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'char-123', name: 'Test', price: 500, purchases: 10 },
                  error: null
                })
              })
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null })
            })
          };
        }
        if (table === 'user_characters') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: null, // Not owned yet
                    error: { code: 'PGRST116' }
                  })
                })
              })
            }),
            insert: jest.fn().mockResolvedValue({ error: null })
          };
        }
      });

      const response = await request(app)
        .post('/api/characters/char-123/purchase')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 404 for non-existent character', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' }
            })
          })
        })
      });

      const response = await request(app)
        .post('/api/characters/nonexistent/purchase')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Character not found');
    });

    it('should handle purchase recording errors', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'marketplace_characters') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'char-123', name: 'Test', price: 500 },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'user_characters') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: null,
                    error: { code: 'PGRST116' }
                  })
                })
              })
            }),
            insert: jest.fn().mockResolvedValue({
              error: { message: 'Insert failed' }
            })
          };
        }
      });

      const response = await request(app)
        .post('/api/characters/char-123/purchase')
        .set('Authorization', 'Bearer test-token');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to record purchase');
    });
  });
});
