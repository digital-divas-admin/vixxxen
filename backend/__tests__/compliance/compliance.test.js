/**
 * Compliance Logging Tests
 * Tests for 2257 compliance record keeping
 */

const request = require('supertest');
const express = require('express');

// Mock global fetch for IP geolocation (compliance.js uses global fetch)
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Supabase
const mockSupabase = {
  from: jest.fn(),
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase),
}));

// Set required env vars before importing router
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

// Import router after mocks
const complianceRouter = require('../../compliance');

// Create test app
function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/compliance', complianceRouter);
  return app;
}

describe('Compliance Logging', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();

    // Default mock for IP geolocation
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({
        country_code: 'US',
        region_code: 'CA'
      })
    });
  });

  describe('POST /api/compliance/log-generation', () => {
    describe('successful logging', () => {
      it('should log a generation record successfully', async () => {
        const mockRecord = {
          id: 'record-123',
          content_hash: 'abc123hash',
          user_id: 'user-123',
          content_type: 'image',
          model_used: 'seedream',
          nsfw_mode: true,
          output_count: 2
        };

        mockSupabase.from.mockReturnValue({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: mockRecord, error: null })
            })
          })
        });

        const response = await request(app)
          .post('/api/compliance/log-generation')
          .send({
            user_id: 'user-123',
            content_identifier: 'https://example.com/image.png',
            content_type: 'image',
            model_used: 'seedream',
            prompt: 'A beautiful landscape',
            nsfw_mode: true,
            output_count: 2
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.logged).toBe(true);
        expect(response.body.record_id).toBe('record-123');
        expect(response.body.content_hash).toBe('abc123hash');
      });

      it('should log generation with minimal required fields', async () => {
        const mockRecord = {
          id: 'record-456',
          content_hash: 'hash456',
          content_type: 'image',
          model_used: 'unknown'
        };

        mockSupabase.from.mockReturnValue({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: mockRecord, error: null })
            })
          })
        });

        const response = await request(app)
          .post('/api/compliance/log-generation')
          .send({});

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.logged).toBe(true);
      });

      it('should extract IP from x-forwarded-for header', async () => {
        let capturedInsert;
        mockSupabase.from.mockReturnValue({
          insert: jest.fn((data) => {
            capturedInsert = data;
            return {
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: '1', content_hash: 'hash' },
                  error: null
                })
              })
            };
          })
        });

        await request(app)
          .post('/api/compliance/log-generation')
          .set('x-forwarded-for', '192.168.1.1, 10.0.0.1')
          .send({ content_identifier: 'test' });

        expect(capturedInsert.ip_address).toBe('192.168.1.1');
      });

      it('should extract IP from x-real-ip header', async () => {
        let capturedInsert;
        mockSupabase.from.mockReturnValue({
          insert: jest.fn((data) => {
            capturedInsert = data;
            return {
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: '1', content_hash: 'hash' },
                  error: null
                })
              })
            };
          })
        });

        await request(app)
          .post('/api/compliance/log-generation')
          .set('x-real-ip', '10.20.30.40')
          .send({ content_identifier: 'test' });

        expect(capturedInsert.ip_address).toBe('10.20.30.40');
      });

      it('should capture user agent', async () => {
        let capturedInsert;
        mockSupabase.from.mockReturnValue({
          insert: jest.fn((data) => {
            capturedInsert = data;
            return {
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: '1', content_hash: 'hash' },
                  error: null
                })
              })
            };
          })
        });

        await request(app)
          .post('/api/compliance/log-generation')
          .set('user-agent', 'Mozilla/5.0 TestBrowser')
          .send({ content_identifier: 'test' });

        expect(capturedInsert.user_agent).toBe('Mozilla/5.0 TestBrowser');
      });

      it('should get location from IP', async () => {
        mockFetch.mockResolvedValue({
          json: () => Promise.resolve({
            country_code: 'DE',
            region_code: 'BY'
          })
        });

        let capturedInsert;
        mockSupabase.from.mockReturnValue({
          insert: jest.fn((data) => {
            capturedInsert = data;
            return {
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: '1', content_hash: 'hash' },
                  error: null
                })
              })
            };
          })
        });

        await request(app)
          .post('/api/compliance/log-generation')
          .set('x-forwarded-for', '8.8.8.8')
          .send({ content_identifier: 'test' });

        expect(capturedInsert.country_code).toBe('DE');
        expect(capturedInsert.region_code).toBe('BY');
      });

      it('should handle localhost IP for geolocation', async () => {
        // Localhost should query without IP (gets default location)
        mockFetch.mockResolvedValue({
          json: () => Promise.resolve({
            country_code: 'US',
            region_code: 'CA'
          })
        });

        mockSupabase.from.mockReturnValue({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: '1', content_hash: 'hash' },
                error: null
              })
            })
          })
        });

        await request(app)
          .post('/api/compliance/log-generation')
          .send({ content_identifier: 'test' });

        // Should have been called with empty IP for localhost
        expect(mockFetch).toHaveBeenCalled();
      });
    });

    describe('database not configured', () => {
      it('should return logged=false when database is not configured', async () => {
        // This test simulates the scenario where supabase is null
        // We need to re-import the module with different env vars
        jest.resetModules();

        // Clear env vars
        const originalUrl = process.env.SUPABASE_URL;
        const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        delete process.env.SUPABASE_URL;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;

        // Re-mock supabase to return null
        jest.mock('@supabase/supabase-js', () => ({
          createClient: jest.fn(() => null),
        }));

        const complianceRouterNoDb = require('../../compliance');
        const appNoDb = express();
        appNoDb.use(express.json());
        appNoDb.use('/api/compliance', complianceRouterNoDb);

        const response = await request(appNoDb)
          .post('/api/compliance/log-generation')
          .send({ content_identifier: 'test' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.logged).toBe(false);
        expect(response.body.reason).toBe('Database not configured');

        // Restore env vars
        process.env.SUPABASE_URL = originalUrl;
        process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
      });
    });

    describe('error handling', () => {
      it('should handle database insert error gracefully', async () => {
        mockSupabase.from.mockReturnValue({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'Database connection failed' }
              })
            })
          })
        });

        const response = await request(app)
          .post('/api/compliance/log-generation')
          .send({ content_identifier: 'test' });

        // Should not fail the request
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.logged).toBe(false);
        expect(response.body.reason).toBe('Database connection failed');
      });

      it('should handle geolocation API error gracefully', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));

        mockSupabase.from.mockReturnValue({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: '1', content_hash: 'hash' },
                error: null
              })
            })
          })
        });

        const response = await request(app)
          .post('/api/compliance/log-generation')
          .send({ content_identifier: 'test' });

        // Should still succeed - geolocation errors don't block logging
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      it('should handle unexpected exceptions gracefully', async () => {
        mockSupabase.from.mockImplementation(() => {
          throw new Error('Unexpected error');
        });

        const response = await request(app)
          .post('/api/compliance/log-generation')
          .send({ content_identifier: 'test' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.logged).toBe(false);
        expect(response.body.reason).toBe('Unexpected error');
      });
    });

    describe('content hash generation', () => {
      it('should generate unique content hashes', async () => {
        const hashes = [];

        mockSupabase.from.mockReturnValue({
          insert: jest.fn((data) => {
            hashes.push(data.content_hash);
            return {
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: '1', content_hash: data.content_hash },
                  error: null
                })
              })
            };
          })
        });

        await request(app)
          .post('/api/compliance/log-generation')
          .send({ content_identifier: 'image1.png' });

        await request(app)
          .post('/api/compliance/log-generation')
          .send({ content_identifier: 'image2.png' });

        // Hashes should be different
        expect(hashes.length).toBe(2);
        expect(hashes[0]).not.toBe(hashes[1]);
        // Hashes should be SHA-256 (64 hex chars)
        expect(hashes[0]).toMatch(/^[a-f0-9]{64}$/);
        expect(hashes[1]).toMatch(/^[a-f0-9]{64}$/);
      });
    });
  });

  describe('GET /api/compliance/my-records', () => {
    describe('successful retrieval', () => {
      it('should return user records with pagination', async () => {
        const mockRecords = [
          { id: '1', content_type: 'image', model_used: 'seedream', nsfw_mode: false, created_at: '2024-01-01', output_count: 1 },
          { id: '2', content_type: 'video', model_used: 'kling', nsfw_mode: true, created_at: '2024-01-02', output_count: 1 }
        ];

        mockSupabase.from.mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                range: jest.fn().mockResolvedValue({
                  data: mockRecords,
                  count: 25,
                  error: null
                })
              })
            })
          })
        });

        const response = await request(app)
          .get('/api/compliance/my-records')
          .query({ user_id: 'user-123', limit: 10, offset: 0 });

        expect(response.status).toBe(200);
        expect(response.body.records).toEqual(mockRecords);
        expect(response.body.total).toBe(25);
        expect(response.body.limit).toBe(10);
        expect(response.body.offset).toBe(0);
      });

      it('should use default pagination values', async () => {
        mockSupabase.from.mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                range: jest.fn().mockResolvedValue({
                  data: [],
                  count: 0,
                  error: null
                })
              })
            })
          })
        });

        const response = await request(app)
          .get('/api/compliance/my-records')
          .query({ user_id: 'user-123' });

        expect(response.status).toBe(200);
        expect(response.body.limit).toBe(50); // Default
        expect(response.body.offset).toBe(0); // Default
      });
    });

    describe('validation', () => {
      it('should require user_id', async () => {
        const response = await request(app)
          .get('/api/compliance/my-records');

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('User ID required');
      });
    });

    describe('error handling', () => {
      it('should handle database errors', async () => {
        mockSupabase.from.mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                range: jest.fn().mockRejectedValue(new Error('Database error'))
              })
            })
          })
        });

        const response = await request(app)
          .get('/api/compliance/my-records')
          .query({ user_id: 'user-123' });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Failed to fetch records');
      });

      it('should handle query errors', async () => {
        mockSupabase.from.mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                range: jest.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Query failed' }
                })
              })
            })
          })
        });

        const response = await request(app)
          .get('/api/compliance/my-records')
          .query({ user_id: 'user-123' });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Failed to fetch records');
      });
    });
  });

  describe('GET /api/compliance/stats', () => {
    describe('admin access', () => {
      it('should return stats for admin users', async () => {
        const mockStats = [
          { content_type: 'image', nsfw_mode: false, created_at: '2024-01-01' },
          { content_type: 'image', nsfw_mode: true, created_at: '2024-01-02' },
          { content_type: 'video', nsfw_mode: true, created_at: '2024-01-03' },
          { content_type: 'image', nsfw_mode: false, created_at: '2024-01-04' }
        ];

        // Mock admin check
        const mockFromCalls = [];
        mockSupabase.from.mockImplementation((table) => {
          mockFromCalls.push(table);
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
          if (table === 'generation_records') {
            return {
              select: jest.fn().mockReturnValue({
                gte: jest.fn().mockResolvedValue({
                  data: mockStats,
                  error: null
                })
              })
            };
          }
        });

        const response = await request(app)
          .get('/api/compliance/stats')
          .query({ user_id: 'admin-123' });

        expect(response.status).toBe(200);
        expect(response.body.period).toBe('last_30_days');
        expect(response.body.stats.total_generations).toBe(4);
        expect(response.body.stats.by_type.image).toBe(3);
        expect(response.body.stats.by_type.video).toBe(1);
        expect(response.body.stats.nsfw_count).toBe(2);
        expect(response.body.stats.safe_count).toBe(2);
      });
    });

    describe('access control', () => {
      it('should deny access to non-admin users', async () => {
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
          .get('/api/compliance/stats')
          .query({ user_id: 'regular-user' });

        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Admin access required');
      });

      it('should deny access when user not found', async () => {
        mockSupabase.from.mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: null
              })
            })
          })
        });

        const response = await request(app)
          .get('/api/compliance/stats')
          .query({ user_id: 'unknown-user' });

        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Admin access required');
      });
    });

    describe('error handling', () => {
      it('should handle database errors during stats fetch', async () => {
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
          if (table === 'generation_records') {
            return {
              select: jest.fn().mockReturnValue({
                gte: jest.fn().mockRejectedValue(new Error('Stats query failed'))
              })
            };
          }
        });

        const response = await request(app)
          .get('/api/compliance/stats')
          .query({ user_id: 'admin-123' });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Failed to fetch stats');
      });

      it('should handle stats query errors', async () => {
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
          if (table === 'generation_records') {
            return {
              select: jest.fn().mockReturnValue({
                gte: jest.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Query error' }
                })
              })
            };
          }
        });

        const response = await request(app)
          .get('/api/compliance/stats')
          .query({ user_id: 'admin-123' });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Failed to fetch stats');
      });
    });

    describe('stats aggregation', () => {
      it('should correctly aggregate empty stats', async () => {
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
          if (table === 'generation_records') {
            return {
              select: jest.fn().mockReturnValue({
                gte: jest.fn().mockResolvedValue({
                  data: [],
                  error: null
                })
              })
            };
          }
        });

        const response = await request(app)
          .get('/api/compliance/stats')
          .query({ user_id: 'admin-123' });

        expect(response.status).toBe(200);
        expect(response.body.stats.total_generations).toBe(0);
        expect(response.body.stats.by_type).toEqual({});
        expect(response.body.stats.nsfw_count).toBe(0);
        expect(response.body.stats.safe_count).toBe(0);
      });

      it('should count multiple content types correctly', async () => {
        const mockStats = [
          { content_type: 'image', nsfw_mode: false },
          { content_type: 'image', nsfw_mode: true },
          { content_type: 'video', nsfw_mode: true },
          { content_type: 'audio', nsfw_mode: false },
          { content_type: 'image', nsfw_mode: true }
        ];

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
          if (table === 'generation_records') {
            return {
              select: jest.fn().mockReturnValue({
                gte: jest.fn().mockResolvedValue({
                  data: mockStats,
                  error: null
                })
              })
            };
          }
        });

        const response = await request(app)
          .get('/api/compliance/stats')
          .query({ user_id: 'admin-123' });

        expect(response.status).toBe(200);
        expect(response.body.stats.total_generations).toBe(5);
        expect(response.body.stats.by_type.image).toBe(3);
        expect(response.body.stats.by_type.video).toBe(1);
        expect(response.body.stats.by_type.audio).toBe(1);
        expect(response.body.stats.nsfw_count).toBe(3);
        expect(response.body.stats.safe_count).toBe(2);
      });
    });
  });
});
