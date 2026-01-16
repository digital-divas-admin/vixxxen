/**
 * Analytics Events API Tests
 * Tests for internal analytics tracking system
 */

const request = require('supertest');
const express = require('express');

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

// Mock auth middleware
jest.mock('../../middleware/auth', () => ({
  optionalAuth: (req, res, next) => {
    // Simulate authenticated user if header present
    if (req.headers.authorization === 'Bearer valid-token') {
      req.userId = 'user-123';
    }
    next();
  },
  requireAdmin: (req, res, next) => {
    if (req.headers.authorization === 'Bearer admin-token') {
      req.userId = 'admin-123';
      next();
    } else {
      res.status(403).json({ error: 'Admin access required' });
    }
  }
}));

// Import router after mocks
const analyticsRouter = require('../../analytics-events');

// Create test app
function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.id = 'test-request-id';
    next();
  });
  app.use('/api/analytics', analyticsRouter);
  return app;
}

describe('Analytics Events API', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
  });

  // ===========================================
  // POST /api/analytics/event
  // ===========================================
  describe('POST /api/analytics/event', () => {
    it('should track event successfully for authenticated user', async () => {
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null })
      });

      const response = await request(app)
        .post('/api/analytics/event')
        .set('Authorization', 'Bearer valid-token')
        .send({
          event_name: 'onboarding_started',
          event_category: 'onboarding',
          event_data: { source: 'landing_page' },
          session_id: 'session-123'
        });

      expect(response.status).toBe(200);
      expect(response.body.tracked).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith('analytics_events');
    });

    it('should track event for anonymous user', async () => {
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null })
      });

      const response = await request(app)
        .post('/api/analytics/event')
        .send({
          event_name: 'trial_started',
          event_category: 'trial',
          anonymous_id: 'anon-456',
          session_id: 'session-789'
        });

      expect(response.status).toBe(200);
      expect(response.body.tracked).toBe(true);
    });

    it('should reject event without event_name', async () => {
      const response = await request(app)
        .post('/api/analytics/event')
        .send({
          event_category: 'onboarding'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('event_name');
    });

    it('should reject event without event_category', async () => {
      const response = await request(app)
        .post('/api/analytics/event')
        .send({
          event_name: 'test_event'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('event_category');
    });

    it('should reject invalid event_category', async () => {
      const response = await request(app)
        .post('/api/analytics/event')
        .send({
          event_name: 'test_event',
          event_category: 'invalid_category'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid event_category');
    });

    it('should handle database errors gracefully', async () => {
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: { message: 'Database error' } })
      });

      const response = await request(app)
        .post('/api/analytics/event')
        .send({
          event_name: 'onboarding_started',
          event_category: 'onboarding'
        });

      expect(response.status).toBe(200);
      expect(response.body.tracked).toBe(false);
      expect(response.body.reason).toBe('database_error');
    });

    it('should extract UTM parameters from page_url', async () => {
      let insertedData = null;
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockImplementation((data) => {
          insertedData = data;
          return Promise.resolve({ error: null });
        })
      });

      const response = await request(app)
        .post('/api/analytics/event')
        .send({
          event_name: 'session_started',
          event_category: 'session',
          page_url: 'https://example.com?utm_source=google&utm_medium=cpc&utm_campaign=summer'
        });

      expect(response.status).toBe(200);
      expect(insertedData.utm_source).toBe('google');
      expect(insertedData.utm_medium).toBe('cpc');
      expect(insertedData.utm_campaign).toBe('summer');
    });
  });

  // ===========================================
  // POST /api/analytics/events (batch)
  // ===========================================
  describe('POST /api/analytics/events', () => {
    it('should track batch of events successfully', async () => {
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null })
      });

      const response = await request(app)
        .post('/api/analytics/events')
        .set('Authorization', 'Bearer valid-token')
        .send({
          events: [
            { event_name: 'page_viewed', event_category: 'session', event_data: { page: 'home' } },
            { event_name: 'button_clicked', event_category: 'engagement', event_data: { button: 'signup' } },
            { event_name: 'modal_opened', event_category: 'engagement', event_data: { modal: 'pricing' } }
          ]
        });

      expect(response.status).toBe(200);
      expect(response.body.tracked).toBe(3);
    });

    it('should reject empty events array', async () => {
      const response = await request(app)
        .post('/api/analytics/events')
        .send({ events: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('events array');
    });

    it('should reject missing events array', async () => {
      const response = await request(app)
        .post('/api/analytics/events')
        .send({});

      expect(response.status).toBe(400);
    });

    it('should reject more than 50 events', async () => {
      const events = Array(51).fill({
        event_name: 'test',
        event_category: 'session'
      });

      const response = await request(app)
        .post('/api/analytics/events')
        .send({ events });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Maximum 50');
    });

    it('should handle batch database errors gracefully', async () => {
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: { message: 'Batch insert failed' } })
      });

      const response = await request(app)
        .post('/api/analytics/events')
        .send({
          events: [
            { event_name: 'test', event_category: 'session' }
          ]
        });

      expect(response.status).toBe(200);
      expect(response.body.tracked).toBe(0);
      expect(response.body.reason).toBe('database_error');
    });
  });

  // ===========================================
  // POST /api/analytics/funnel/update
  // ===========================================
  describe('POST /api/analytics/funnel/update', () => {
    it('should create new funnel progress for authenticated user', async () => {
      // First query returns no existing progress
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null, error: null })
            })
          })
        })
      });

      // Insert new progress
      mockSupabase.from.mockReturnValueOnce({
        insert: jest.fn().mockResolvedValue({ error: null })
      });

      const response = await request(app)
        .post('/api/analytics/funnel/update')
        .set('Authorization', 'Bearer valid-token')
        .send({
          funnel_name: 'onboarding',
          current_step: 'choose_plan',
          step_completed: 'choose_character'
        });

      expect(response.status).toBe(200);
      expect(response.body.updated).toBe(true);
    });

    it('should update existing funnel progress', async () => {
      // First query returns existing progress
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  id: 'progress-123',
                  steps_completed: ['step1'],
                  funnel_data: { initial: 'data' }
                },
                error: null
              })
            })
          })
        })
      });

      // Update progress
      mockSupabase.from.mockReturnValueOnce({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null })
        })
      });

      const response = await request(app)
        .post('/api/analytics/funnel/update')
        .set('Authorization', 'Bearer valid-token')
        .send({
          funnel_name: 'onboarding',
          current_step: 'welcome',
          step_completed: 'step2',
          funnel_data: { new: 'data' }
        });

      expect(response.status).toBe(200);
      expect(response.body.updated).toBe(true);
    });

    it('should reject without funnel_name', async () => {
      const response = await request(app)
        .post('/api/analytics/funnel/update')
        .set('Authorization', 'Bearer valid-token')
        .send({
          current_step: 'step1'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('funnel_name');
    });

    it('should reject without current_step', async () => {
      const response = await request(app)
        .post('/api/analytics/funnel/update')
        .set('Authorization', 'Bearer valid-token')
        .send({
          funnel_name: 'onboarding'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('current_step');
    });

    it('should require user_id or anonymous_id', async () => {
      // Mock the initial database query
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: null })
          })
        })
      });

      const response = await request(app)
        .post('/api/analytics/funnel/update')
        .send({
          funnel_name: 'trial',
          current_step: 'started'
          // No anonymous_id and no auth header = no user
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('anonymous_id');
    });

    it('should mark funnel as completed', async () => {
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: 'progress-123', steps_completed: ['step1', 'step2'] },
                error: null
              })
            })
          })
        })
      });

      let updateData = null;
      mockSupabase.from.mockReturnValueOnce({
        update: jest.fn().mockImplementation((data) => {
          updateData = data;
          return {
            eq: jest.fn().mockResolvedValue({ error: null })
          };
        })
      });

      const response = await request(app)
        .post('/api/analytics/funnel/update')
        .set('Authorization', 'Bearer valid-token')
        .send({
          funnel_name: 'onboarding',
          current_step: 'completed',
          completed: true
        });

      expect(response.status).toBe(200);
      expect(updateData.completed_at).toBeDefined();
    });
  });

  // ===========================================
  // GET /api/analytics/admin/funnel/:name
  // ===========================================
  describe('GET /api/analytics/admin/funnel/:name', () => {
    it('should require admin access', async () => {
      const response = await request(app)
        .get('/api/analytics/admin/funnel/onboarding')
        .set('Authorization', 'Bearer valid-token'); // Not admin

      expect(response.status).toBe(403);
    });

    it('should return funnel statistics for admin', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockResolvedValue({
              data: [
                { steps_completed: ['step1', 'step2'], completed_at: '2024-01-01', abandoned_at: null },
                { steps_completed: ['step1'], completed_at: null, abandoned_at: '2024-01-02' },
                { steps_completed: ['step1', 'step2', 'step3'], completed_at: '2024-01-03', abandoned_at: null },
                { steps_completed: ['step1'], current_step: 'step2', completed_at: null, abandoned_at: null }
              ],
              error: null
            })
          })
        })
      });

      const response = await request(app)
        .get('/api/analytics/admin/funnel/onboarding')
        .set('Authorization', 'Bearer admin-token');

      expect(response.status).toBe(200);
      expect(response.body.funnel_name).toBe('onboarding');
      expect(response.body.summary.total_started).toBe(4);
      expect(response.body.summary.completed).toBe(2);
      expect(response.body.summary.abandoned).toBe(1);
      expect(response.body.summary.in_progress).toBe(1);
      expect(response.body.steps_completed).toBeDefined();
    });

    it('should support custom date range', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            gte: jest.fn().mockResolvedValue({ data: [], error: null })
          })
        })
      });

      const response = await request(app)
        .get('/api/analytics/admin/funnel/onboarding?days=7')
        .set('Authorization', 'Bearer admin-token');

      expect(response.status).toBe(200);
      expect(response.body.period_days).toBe(7);
    });
  });

  // ===========================================
  // GET /api/analytics/admin/events/summary
  // ===========================================
  describe('GET /api/analytics/admin/events/summary', () => {
    it('should require admin access', async () => {
      const response = await request(app)
        .get('/api/analytics/admin/events/summary');

      expect(response.status).toBe(403);
    });

    it('should return event summary for admin', async () => {
      // First call for events
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          gte: jest.fn().mockResolvedValue({
            data: [
              { event_category: 'onboarding', event_name: 'onboarding_started' },
              { event_category: 'onboarding', event_name: 'onboarding_completed' },
              { event_category: 'trial', event_name: 'trial_started' },
              { event_category: 'generation', event_name: 'generation_started' },
              { event_category: 'generation', event_name: 'generation_started' }
            ],
            error: null
          })
        })
      });

      // Second call for unique users
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          gte: jest.fn().mockReturnValue({
            not: jest.fn().mockResolvedValue({
              data: [
                { user_id: 'user-1' },
                { user_id: 'user-2' },
                { user_id: 'user-1' } // Duplicate
              ],
              error: null
            })
          })
        })
      });

      const response = await request(app)
        .get('/api/analytics/admin/events/summary')
        .set('Authorization', 'Bearer admin-token');

      expect(response.status).toBe(200);
      expect(response.body.total_events).toBe(5);
      expect(response.body.unique_users).toBe(2);
      expect(response.body.events_by_category.onboarding).toBe(2);
      expect(response.body.events_by_category.generation).toBe(2);
      expect(response.body.top_events).toBeDefined();
    });
  });

  // ===========================================
  // GET /api/analytics/admin/daily
  // ===========================================
  describe('GET /api/analytics/admin/daily', () => {
    it('should require admin access', async () => {
      const response = await request(app)
        .get('/api/analytics/admin/daily');

      expect(response.status).toBe(403);
    });

    it('should return daily statistics for admin', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          gte: jest.fn().mockReturnValue({
            order: jest.fn().mockResolvedValue({
              data: [
                { created_at: '2024-01-15T10:00:00Z', event_category: 'session', user_id: 'user-1' },
                { created_at: '2024-01-15T11:00:00Z', event_category: 'session', user_id: 'user-2' },
                { created_at: '2024-01-15T12:00:00Z', event_category: 'generation', user_id: 'user-1' },
                { created_at: '2024-01-16T10:00:00Z', event_category: 'session', user_id: 'user-3' }
              ],
              error: null
            })
          })
        })
      });

      const response = await request(app)
        .get('/api/analytics/admin/daily')
        .set('Authorization', 'Bearer admin-token');

      expect(response.status).toBe(200);
      expect(response.body.daily).toBeDefined();
      expect(response.body.daily.length).toBe(2);
      expect(response.body.daily[0].date).toBe('2024-01-15');
      expect(response.body.daily[0].events).toBe(3);
      expect(response.body.daily[0].unique_users).toBe(2);
    });
  });

  // ===========================================
  // Valid event categories
  // ===========================================
  describe('Valid event categories', () => {
    const validCategories = [
      'onboarding',
      'trial',
      'generation',
      'character',
      'chat',
      'monetization',
      'session',
      'engagement'
    ];

    validCategories.forEach(category => {
      it(`should accept '${category}' as valid category`, async () => {
        mockSupabase.from.mockReturnValue({
          insert: jest.fn().mockResolvedValue({ error: null })
        });

        const response = await request(app)
          .post('/api/analytics/event')
          .send({
            event_name: 'test_event',
            event_category: category
          });

        expect(response.status).toBe(200);
        expect(response.body.tracked).toBe(true);
      });
    });
  });
});
