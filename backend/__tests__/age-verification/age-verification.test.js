/**
 * Age Verification Tests
 * Tests for age verification routes and helper functions
 */

const request = require('supertest');
const express = require('express');

// Mock fetch globally before requiring the module
global.fetch = jest.fn();

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase),
}));

let mockSupabase;
let ageVerificationRouter;
let app;

beforeEach(() => {
  jest.resetModules();

  // Reset fetch mock
  global.fetch.mockReset();

  // Reset Supabase mock
  mockSupabase = {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(),
        })),
      })),
      upsert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(),
        })),
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn(),
          })),
        })),
      })),
    })),
  };

  jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(() => mockSupabase),
  }));

  // Require fresh instance
  ageVerificationRouter = require('../../age-verification');

  // Create test Express app
  app = express();
  app.use(express.json());
  app.use('/api/age-verification', ageVerificationRouter);
});

// ============================================
// RESTRICTED_REGIONS Tests
// ============================================
describe('Region Restriction Logic', () => {

  describe('US Restricted States', () => {
    const restrictedStates = ['TX', 'UT', 'LA', 'VA', 'MS', 'AR', 'MT', 'NC', 'ID'];

    test.each(restrictedStates)('US + %s is restricted', async (state) => {
      // Mock IP geolocation
      global.fetch.mockResolvedValue({
        json: () => Promise.resolve({
          country_code: 'US',
          region_code: state,
        }),
      });

      const response = await request(app)
        .get('/api/age-verification/check-location')
        .set('x-forwarded-for', '1.2.3.4');

      expect(response.body.restricted).toBe(true);
      expect(response.body.message).toContain('not available in your region');
    });
  });

  describe('US Non-Restricted States', () => {
    const allowedStates = ['CA', 'NY', 'WA', 'FL', 'IL', 'OR', 'CO'];

    test.each(allowedStates)('US + %s is NOT restricted', async (state) => {
      global.fetch.mockResolvedValue({
        json: () => Promise.resolve({
          country_code: 'US',
          region_code: state,
        }),
      });

      const response = await request(app)
        .get('/api/age-verification/check-location')
        .set('x-forwarded-for', '1.2.3.4');

      expect(response.body.restricted).toBe(false);
      expect(response.body.message).toBeNull();
    });
  });

  describe('Non-US Countries', () => {
    const countries = ['CA', 'GB', 'DE', 'FR', 'AU', 'JP', 'BR'];

    test.each(countries)('Country %s is NOT restricted', async (country) => {
      global.fetch.mockResolvedValue({
        json: () => Promise.resolve({
          country_code: country,
          region_code: 'XX',
        }),
      });

      const response = await request(app)
        .get('/api/age-verification/check-location')
        .set('x-forwarded-for', '1.2.3.4');

      expect(response.body.restricted).toBe(false);
    });
  });

});

// ============================================
// IP Geolocation Tests
// ============================================
describe('IP Geolocation', () => {

  test('extracts IP from x-forwarded-for header (first IP)', async () => {
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({
        country_code: 'US',
        region_code: 'CA',
      }),
    });

    await request(app)
      .get('/api/age-verification/check-location')
      .set('x-forwarded-for', '1.1.1.1, 2.2.2.2, 3.3.3.3');

    // Should use first IP from the chain
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('1.1.1.1'));
  });

  test('extracts IP from x-real-ip header', async () => {
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({
        country_code: 'US',
        region_code: 'CA',
      }),
    });

    await request(app)
      .get('/api/age-verification/check-location')
      .set('x-real-ip', '4.4.4.4');

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('4.4.4.4'));
  });

  test('handles localhost IP specially', async () => {
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({
        country_code: 'US',
        region_code: 'CA',
      }),
    });

    // Localhost should send empty string to API (uses requester's IP)
    await request(app)
      .get('/api/age-verification/check-location');

    // The fetch should be called (implementation handles localhost)
    expect(global.fetch).toHaveBeenCalled();
  });

  test('defaults to US/CA on geolocation API failure', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));

    const response = await request(app)
      .get('/api/age-verification/check-location')
      .set('x-forwarded-for', '1.2.3.4');

    // Should default to non-restricted location (US + CA)
    expect(response.body.country_code).toBe('US');
    expect(response.body.region_code).toBe('CA');
    expect(response.body.restricted).toBe(false);
  });

  test('handles partial API response gracefully', async () => {
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({
        // Missing country_code and region_code
      }),
    });

    const response = await request(app)
      .get('/api/age-verification/check-location')
      .set('x-forwarded-for', '1.2.3.4');

    // Should default values
    expect(response.body.country_code).toBe('US');
    expect(response.body.region_code).toBe('');
  });

});

// ============================================
// GET /status Tests
// ============================================
describe('GET /api/age-verification/status', () => {

  test('returns 401 when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No user' },
    });

    const response = await request(app)
      .get('/api/age-verification/status')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
  });

  test('returns verified: false when no verification record exists', async () => {
    // Mock successful auth
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com' } },
      error: null,
    });

    // Mock no verification record found
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' }, // "Row not found" error code
          }),
        }),
      }),
    });

    const response = await request(app)
      .get('/api/age-verification/status')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.verified).toBe(false);
    expect(response.body.method).toBeNull();
  });

  test('returns verification record when exists', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com' } },
      error: null,
    });

    const verificationRecord = {
      user_id: 'user-123',
      verified: true,
      method: 'self_declaration',
      country_code: 'US',
      region_code: 'CA',
      verified_at: '2024-01-01T00:00:00Z',
    };

    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: verificationRecord,
            error: null,
          }),
        }),
      }),
    });

    const response = await request(app)
      .get('/api/age-verification/status')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.verified).toBe(true);
    expect(response.body.method).toBe('self_declaration');
    expect(response.body.verification).toEqual(verificationRecord);
  });

});

// ============================================
// POST /verify Tests
// ============================================
describe('POST /api/age-verification/verify', () => {

  test('returns 401 when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No user' },
    });

    const response = await request(app)
      .post('/api/age-verification/verify')
      .set('Authorization', 'Bearer invalid-token')
      .send({ confirmed: true });

    expect(response.status).toBe(401);
  });

  test('returns 400 when confirmed is missing', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com' } },
      error: null,
    });

    const response = await request(app)
      .post('/api/age-verification/verify')
      .set('Authorization', 'Bearer valid-token')
      .send({}); // Missing confirmed

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Age confirmation required');
  });

  test('returns 400 when confirmed is false', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com' } },
      error: null,
    });

    const response = await request(app)
      .post('/api/age-verification/verify')
      .set('Authorization', 'Bearer valid-token')
      .send({ confirmed: false });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Age confirmation required');
  });

  test('blocks verification for restricted region (Texas)', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com' } },
      error: null,
    });

    // Mock Texas location
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({
        country_code: 'US',
        region_code: 'TX',
      }),
    });

    // Mock upsert for blocked record
    const mockUpsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { verified: false, method: 'blocked' },
          error: null,
        }),
      }),
    });
    mockSupabase.from.mockReturnValue({ upsert: mockUpsert });

    const response = await request(app)
      .post('/api/age-verification/verify')
      .set('Authorization', 'Bearer valid-token')
      .set('x-forwarded-for', '1.2.3.4')
      .send({ confirmed: true });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(false);
    expect(response.body.verified).toBe(false);
    expect(response.body.blocked).toBe(true);
    expect(response.body.message).toContain('not available in your region');
  });

  test('allows verification for non-restricted region (California)', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com' } },
      error: null,
    });

    // Mock California location
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({
        country_code: 'US',
        region_code: 'CA',
      }),
    });

    // Mock upsert for successful verification
    const mockUpsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: {
            verified: true,
            method: 'self_declaration',
            country_code: 'US',
            region_code: 'CA',
          },
          error: null,
        }),
      }),
    });
    mockSupabase.from.mockReturnValue({ upsert: mockUpsert });

    const response = await request(app)
      .post('/api/age-verification/verify')
      .set('Authorization', 'Bearer valid-token')
      .set('x-forwarded-for', '1.2.3.4')
      .send({ confirmed: true });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.verified).toBe(true);
    expect(response.body.blocked).toBe(false);
  });

  test('allows verification for non-US country', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com' } },
      error: null,
    });

    // Mock UK location
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({
        country_code: 'GB',
        region_code: 'ENG',
      }),
    });

    const mockUpsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { verified: true, method: 'self_declaration' },
          error: null,
        }),
      }),
    });
    mockSupabase.from.mockReturnValue({ upsert: mockUpsert });

    const response = await request(app)
      .post('/api/age-verification/verify')
      .set('Authorization', 'Bearer valid-token')
      .set('x-forwarded-for', '1.2.3.4')
      .send({ confirmed: true });

    expect(response.body.success).toBe(true);
    expect(response.body.verified).toBe(true);
  });

  test('records correct data in upsert', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-999', email: 'test@test.com' } },
      error: null,
    });

    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({
        country_code: 'US',
        region_code: 'NY',
      }),
    });

    const mockUpsert = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { verified: true },
          error: null,
        }),
      }),
    });
    mockSupabase.from.mockReturnValue({ upsert: mockUpsert });

    await request(app)
      .post('/api/age-verification/verify')
      .set('Authorization', 'Bearer valid-token')
      .set('x-forwarded-for', '5.5.5.5')
      .send({ confirmed: true });

    // Verify upsert was called with correct data
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-999',
        verified: true,
        method: 'self_declaration',
        country_code: 'US',
        region_code: 'NY',
      }),
      { onConflict: 'user_id' }
    );
  });

});

// ============================================
// PUT /content-mode Tests
// ============================================
describe('PUT /api/age-verification/content-mode', () => {

  test('returns 401 when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No user' },
    });

    const response = await request(app)
      .put('/api/age-verification/content-mode')
      .set('Authorization', 'Bearer invalid-token')
      .send({ content_mode: 'safe' });

    expect(response.status).toBe(401);
  });

  test('returns 400 for invalid content mode', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com' } },
      error: null,
    });

    const response = await request(app)
      .put('/api/age-verification/content-mode')
      .set('Authorization', 'Bearer valid-token')
      .send({ content_mode: 'invalid-mode' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid content mode');
  });

  test('returns 400 when content_mode is missing', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com' } },
      error: null,
    });

    const response = await request(app)
      .put('/api/age-verification/content-mode')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid content mode');
  });

  test('successfully updates to safe mode', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com' } },
      error: null,
    });

    const mockUpdate = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { content_mode: 'safe' },
            error: null,
          }),
        }),
      }),
    });
    mockSupabase.from.mockReturnValue({ update: mockUpdate });

    const response = await request(app)
      .put('/api/age-verification/content-mode')
      .set('Authorization', 'Bearer valid-token')
      .send({ content_mode: 'safe' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.content_mode).toBe('safe');
  });

  test('successfully updates to nsfw mode', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com' } },
      error: null,
    });

    const mockUpdate = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { content_mode: 'nsfw' },
            error: null,
          }),
        }),
      }),
    });
    mockSupabase.from.mockReturnValue({ update: mockUpdate });

    const response = await request(app)
      .put('/api/age-verification/content-mode')
      .set('Authorization', 'Bearer valid-token')
      .send({ content_mode: 'nsfw' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.content_mode).toBe('nsfw');
  });

});

// ============================================
// GET /check-location Tests
// ============================================
describe('GET /api/age-verification/check-location', () => {

  test('returns location and restriction status', async () => {
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({
        country_code: 'US',
        region_code: 'WA',
      }),
    });

    const response = await request(app)
      .get('/api/age-verification/check-location')
      .set('x-forwarded-for', '1.2.3.4');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('country_code', 'US');
    expect(response.body).toHaveProperty('region_code', 'WA');
    expect(response.body).toHaveProperty('restricted', false);
  });

  test('does not require authentication', async () => {
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({
        country_code: 'US',
        region_code: 'CA',
      }),
    });

    // No auth header
    const response = await request(app)
      .get('/api/age-verification/check-location');

    expect(response.status).toBe(200);
  });

  test('returns restriction message for restricted regions', async () => {
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({
        country_code: 'US',
        region_code: 'UT', // Utah - restricted
      }),
    });

    const response = await request(app)
      .get('/api/age-verification/check-location')
      .set('x-forwarded-for', '1.2.3.4');

    expect(response.body.restricted).toBe(true);
    expect(response.body.message).toBe('NSFW content is not available in your region due to local regulations.');
  });

});
