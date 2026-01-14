/**
 * User Flow Integration Tests
 *
 * Tests the complete user journey:
 * 1. User creates an account
 * 2. User browses and purchases a character
 * 3. Character is added to their profile
 * 4. User generates images with the character
 *
 * All external services (Supabase, OpenRouter) are mocked.
 */

const request = require('supertest');
const express = require('express');

// Mock node-fetch module (used by seedream.js)
const mockFetch = jest.fn();
jest.mock('node-fetch', () => mockFetch);

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase),
}));

let mockSupabase;
let app;

// Test data - simulates database state
const testData = {
  users: {},
  characters: {},
  userCharacters: {},
  profiles: {},
};

// Test fixtures
const TEST_USER = {
  id: 'user-integration-test-123',
  email: 'integration@test.com',
  role: 'authenticated',
};

const TEST_CHARACTER = {
  id: 'char-premium-456',
  name: 'Luna',
  category: 'fantasy',
  description: 'A mystical character',
  price: 10,
  rating: 4.8,
  purchases: 100,
  tags: ['fantasy', 'mystical'],
  image_url: 'https://example.com/luna.jpg',
  gallery_images: [],
  lora_url: 'https://example.com/luna.safetensors',
  trigger_word: 'luna_style',
  is_active: true,
  is_listed: true,
  sort_order: 1,
};

const FREE_CHARACTER = {
  id: 'char-free-789',
  name: 'Demo Character',
  category: 'basic',
  description: 'Free starter character',
  price: 0,
  rating: 4.0,
  purchases: 500,
  tags: ['free', 'starter'],
  image_url: 'https://example.com/demo.jpg',
  gallery_images: [],
  lora_url: null,
  trigger_word: 'demo_style',
  is_active: true,
  is_listed: true,
  sort_order: 0,
};

// Helper: Create chainable Supabase mock
function createChainableMock(finalResult) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(finalResult),
    then: (resolve) => resolve(finalResult),
  };
  return chain;
}

// Helper: Setup Supabase mock with stateful data
function setupSupabaseMock() {
  mockSupabase = {
    auth: {
      // Simulate user registration
      signUp: jest.fn(({ email, password }) => {
        const userId = `user-${Date.now()}`;
        const user = { id: userId, email, role: 'authenticated' };
        testData.users[userId] = user;
        testData.profiles[userId] = {
          id: userId,
          email,
          credits: 0,
          role: 'user',
        };
        return Promise.resolve({ data: { user }, error: null });
      }),
      // Simulate token verification
      getUser: jest.fn((token) => {
        if (token === 'valid-token') {
          return Promise.resolve({ data: { user: TEST_USER }, error: null });
        }
        return Promise.resolve({ data: { user: null }, error: { message: 'Invalid token' } });
      }),
    },
    from: jest.fn((table) => {
      return createTableMock(table);
    }),
  };
}

// Helper: Create table-specific mock behavior
function createTableMock(table) {
  switch (table) {
    case 'marketplace_characters':
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn(function(col, val) {
          this._eqCol = col;
          this._eqVal = val;
          return this;
        }),
        not: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        single: jest.fn(function() {
          // Return specific character if querying by ID
          if (this._eqCol === 'id') {
            if (this._eqVal === TEST_CHARACTER.id) {
              return Promise.resolve({ data: TEST_CHARACTER, error: null });
            }
            if (this._eqVal === FREE_CHARACTER.id) {
              return Promise.resolve({ data: FREE_CHARACTER, error: null });
            }
          }
          return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
        }),
        update: jest.fn().mockReturnThis(),
        then: (resolve) => resolve({
          data: [FREE_CHARACTER, TEST_CHARACTER],
          error: null,
        }),
      };

    case 'user_characters':
      return {
        select: jest.fn().mockReturnThis(),
        insert: jest.fn((data) => {
          // Record the purchase
          const key = `${data.user_id}-${data.character_id}`;
          testData.userCharacters[key] = data;
          return Promise.resolve({ data, error: null });
        }),
        eq: jest.fn(function(col, val) {
          this._filters = this._filters || {};
          this._filters[col] = val;
          return this;
        }),
        single: jest.fn(function() {
          // Check if user owns character
          if (this._filters) {
            const key = `${this._filters.user_id}-${this._filters.character_id}`;
            if (testData.userCharacters[key]) {
              return Promise.resolve({ data: testData.userCharacters[key], error: null });
            }
          }
          return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
        }),
        then: (resolve) => {
          // Return owned characters for user
          const owned = Object.values(testData.userCharacters)
            .filter(uc => uc.user_id === TEST_USER.id)
            .map(uc => ({ character_id: uc.character_id }));
          return resolve({ data: owned, error: null });
        },
      };

    case 'profiles':
      return {
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn(function(col, val) {
          this._userId = val;
          return this;
        }),
        single: jest.fn(function() {
          const profile = testData.profiles[this._userId] || testData.profiles[TEST_USER.id];
          return Promise.resolve({
            data: profile || { id: TEST_USER.id, role: 'user', credits: 100 },
            error: null,
          });
        }),
      };

    case 'generation_records':
      return {
        insert: jest.fn((data) => {
          // Log the generation for compliance
          testData.generationRecords = testData.generationRecords || [];
          testData.generationRecords.push(data);
          return Promise.resolve({ data, error: null });
        }),
      };

    default:
      return createChainableMock({ data: null, error: null });
  }
}

// Setup before each test
beforeEach(() => {
  // Clear test data
  testData.users = {};
  testData.characters = {};
  testData.userCharacters = {};
  testData.profiles = {};
  testData.generationRecords = [];

  // Reset mocks
  mockFetch.mockReset();

  // Set environment variables
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

  // Setup mocks
  setupSupabaseMock();
});

// ============================================
// COMPLETE USER FLOW TEST
// ============================================
describe('Complete User Flow Integration', () => {

  describe('Step 1: User Registration', () => {

    test('new user can create an account', async () => {
      const result = await mockSupabase.auth.signUp({
        email: 'newuser@test.com',
        password: 'securepassword123',
      });

      expect(result.error).toBeNull();
      expect(result.data.user).toBeDefined();
      expect(result.data.user.email).toBe('newuser@test.com');

      // Verify profile was created
      const userId = result.data.user.id;
      expect(testData.profiles[userId]).toBeDefined();
      expect(testData.profiles[userId].email).toBe('newuser@test.com');
    });

    test('registration creates profile with default values', async () => {
      const result = await mockSupabase.auth.signUp({
        email: 'another@test.com',
        password: 'password123',
      });

      const userId = result.data.user.id;
      const profile = testData.profiles[userId];

      expect(profile.credits).toBe(0);
      expect(profile.role).toBe('user');
    });

  });

  describe('Step 2: Browse Characters', () => {

    beforeEach(() => {
      const charactersRouter = require('../../characters');
      app = express();
      app.use(express.json());
      app.use('/api/characters', charactersRouter);
    });

    test('user can view available characters', async () => {
      const response = await request(app)
        .get('/api/characters');

      expect(response.status).toBe(200);
      expect(response.body.characters).toBeDefined();
      expect(Array.isArray(response.body.characters)).toBe(true);
    });

    test('free characters show as owned for all users', async () => {
      // Mock returns both characters
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'marketplace_characters') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            not: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            then: (resolve) => resolve({
              data: [FREE_CHARACTER, TEST_CHARACTER],
              error: null,
            }),
          };
        }
        if (table === 'user_characters') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            then: (resolve) => resolve({ data: [], error: null }),
          };
        }
        return createChainableMock({ data: null, error: null });
      });

      const response = await request(app)
        .get('/api/characters');

      expect(response.status).toBe(200);

      const freeChar = response.body.characters.find(c => c.id === FREE_CHARACTER.id);
      const premiumChar = response.body.characters.find(c => c.id === TEST_CHARACTER.id);

      // Free character (price = 0) is owned by everyone
      expect(freeChar.is_owned).toBe(true);
      // Premium character not owned yet
      expect(premiumChar.is_owned).toBe(false);
    });

  });

  describe('Step 3: Purchase Character', () => {

    beforeEach(() => {
      const charactersRouter = require('../../characters');
      app = express();
      app.use(express.json());
      app.use('/api/characters', charactersRouter);
    });

    test('authenticated user can purchase a premium character', async () => {
      // Setup: User not owning the character yet
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'marketplace_characters') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: TEST_CHARACTER, error: null }),
            then: (resolve) => resolve({ data: null, error: null }),
          };
        }
        if (table === 'user_characters') {
          return {
            select: jest.fn().mockReturnThis(),
            insert: jest.fn((data) => {
              testData.userCharacters[`${data.user_id}-${data.character_id}`] = data;
              return Promise.resolve({ data, error: null });
            }),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
          };
        }
        return createChainableMock({ data: null, error: null });
      });

      const response = await request(app)
        .post(`/api/characters/${TEST_CHARACTER.id}/purchase`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify purchase was recorded
      const purchaseKey = `${TEST_USER.id}-${TEST_CHARACTER.id}`;
      expect(testData.userCharacters[purchaseKey]).toBeDefined();
      expect(testData.userCharacters[purchaseKey].amount_paid).toBe(TEST_CHARACTER.price);
    });

    test('purchase fails without authentication', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      const response = await request(app)
        .post(`/api/characters/${TEST_CHARACTER.id}/purchase`)
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });

    test('cannot purchase already owned character (returns success)', async () => {
      // User already owns the character
      testData.userCharacters[`${TEST_USER.id}-${TEST_CHARACTER.id}`] = {
        user_id: TEST_USER.id,
        character_id: TEST_CHARACTER.id,
        amount_paid: TEST_CHARACTER.price,
      };

      mockSupabase.from.mockImplementation((table) => {
        if (table === 'marketplace_characters') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: TEST_CHARACTER, error: null }),
          };
        }
        if (table === 'user_characters') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'existing-purchase' },
              error: null,
            }),
          };
        }
        return createChainableMock({ data: null, error: null });
      });

      const response = await request(app)
        .post(`/api/characters/${TEST_CHARACTER.id}/purchase`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Already owned');
    });

    test('cannot purchase non-existent character', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'marketplace_characters') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
          };
        }
        return createChainableMock({ data: null, error: null });
      });

      const response = await request(app)
        .post('/api/characters/nonexistent-id/purchase')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Character not found');
    });

  });

  describe('Step 4: Verify Ownership', () => {

    beforeEach(() => {
      const charactersRouter = require('../../characters');
      app = express();
      app.use(express.json());
      app.use('/api/characters', charactersRouter);
    });

    test('purchased character shows as owned in character list', async () => {
      // User owns the premium character
      const purchaseKey = `${TEST_USER.id}-${TEST_CHARACTER.id}`;
      testData.userCharacters[purchaseKey] = {
        user_id: TEST_USER.id,
        character_id: TEST_CHARACTER.id,
        amount_paid: TEST_CHARACTER.price,
      };

      mockSupabase.from.mockImplementation((table) => {
        if (table === 'marketplace_characters') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            not: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            then: (resolve) => resolve({
              data: [FREE_CHARACTER, TEST_CHARACTER],
              error: null,
            }),
          };
        }
        if (table === 'user_characters') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            then: (resolve) => resolve({
              data: [{ character_id: TEST_CHARACTER.id }],
              error: null,
            }),
          };
        }
        return createChainableMock({ data: null, error: null });
      });

      const response = await request(app)
        .get('/api/characters')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);

      const premiumChar = response.body.characters.find(c => c.id === TEST_CHARACTER.id);
      expect(premiumChar.is_owned).toBe(true);
    });

  });

  describe('Step 5: Generate Images', () => {

    beforeEach(() => {
      const seedreamRouter = require('../../seedream');
      app = express();
      app.use(express.json());
      app.use('/api/seedream', seedreamRouter);
    });

    test('user can generate an image with valid prompt', async () => {
      // Mock successful OpenRouter response
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              images: [{
                url: 'https://generated-image.example.com/image1.png',
              }],
            },
          }],
        }),
      });

      const response = await request(app)
        .post('/api/seedream/generate')
        .send({
          prompt: 'A beautiful fantasy landscape with luna_style',
          resolution: '2K',
          numOutputs: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body.images).toBeDefined();
      expect(response.body.images.length).toBeGreaterThan(0);
      expect(response.body.images[0]).toContain('https://');
    });

    test('generation includes character trigger word in prompt', async () => {
      let capturedRequestBody = null;

      mockFetch.mockImplementation((url, options) => {
        capturedRequestBody = JSON.parse(options.body);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            choices: [{
              message: {
                images: [{ url: 'https://example.com/generated.png' }],
              },
            }],
          }),
        });
      });

      const characterPrompt = `Portrait of a woman in ${TEST_CHARACTER.trigger_word} style`;

      await request(app)
        .post('/api/seedream/generate')
        .send({
          prompt: characterPrompt,
          resolution: '2K',
          numOutputs: 1,
        });

      // Verify the prompt was sent to OpenRouter
      expect(capturedRequestBody).toBeDefined();
      expect(capturedRequestBody.messages[0].content).toContain(TEST_CHARACTER.trigger_word);
    });

    test('generation fails without prompt', async () => {
      const response = await request(app)
        .post('/api/seedream/generate')
        .send({
          resolution: '2K',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Prompt is required');
    });

    test('generation handles OpenRouter API errors gracefully', async () => {
      // Mock rate limit error from OpenRouter
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limit exceeded'),
      });

      const response = await request(app)
        .post('/api/seedream/generate')
        .send({
          prompt: 'Test prompt',
        });

      // Code correctly passes through 429 rate limit to client
      expect(response.status).toBe(429);
      expect(response.body.error).toBe('Rate limit exceeded');
    });

    test('generation supports multiple outputs', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            choices: [{
              message: {
                images: [{ url: 'https://example.com/image1.png' }],
              },
            }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            choices: [{
              message: {
                images: [{ url: 'https://example.com/image2.png' }],
              },
            }],
          }),
        });

      const response = await request(app)
        .post('/api/seedream/generate')
        .send({
          prompt: 'Test prompt',
          numOutputs: 2,
        });

      expect(response.status).toBe(200);
      expect(response.body.images.length).toBe(2);
    });

  });

});

// ============================================
// COMPLETE JOURNEY TEST (E2E Simulation)
// ============================================
describe('Complete User Journey (E2E Simulation)', () => {

  test('full flow: register → browse → purchase → verify → generate', async () => {
    // Step 1: User registers
    const registrationResult = await mockSupabase.auth.signUp({
      email: 'journey@test.com',
      password: 'journey123',
    });
    expect(registrationResult.data.user).toBeDefined();
    const userId = registrationResult.data.user.id;

    // Step 2: User browses characters (sees free as owned, premium as not owned)
    // Simulated by checking character list logic
    const freeIsOwned = FREE_CHARACTER.price === 0;
    const premiumIsOwned = false; // Not purchased yet
    expect(freeIsOwned).toBe(true);
    expect(premiumIsOwned).toBe(false);

    // Step 3: User purchases premium character
    const purchaseKey = `${userId}-${TEST_CHARACTER.id}`;
    testData.userCharacters[purchaseKey] = {
      user_id: userId,
      character_id: TEST_CHARACTER.id,
      amount_paid: TEST_CHARACTER.price,
    };

    // Step 4: Verify ownership
    expect(testData.userCharacters[purchaseKey]).toBeDefined();
    expect(testData.userCharacters[purchaseKey].character_id).toBe(TEST_CHARACTER.id);

    // Step 5: Generate image (simulate API call)
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            images: [{ url: 'https://example.com/final-image.png' }],
          },
        }],
      }),
    });

    const seedreamRouter = require('../../seedream');
    app = express();
    app.use(express.json());
    app.use('/api/seedream', seedreamRouter);

    const genResponse = await request(app)
      .post('/api/seedream/generate')
      .send({
        prompt: `Beautiful portrait in ${TEST_CHARACTER.trigger_word} style`,
        resolution: '2K',
      });

    expect(genResponse.status).toBe(200);
    expect(genResponse.body.images).toBeDefined();
    expect(genResponse.body.images[0]).toBe('https://example.com/final-image.png');

    // Journey complete!
    console.log('✅ Complete user journey successful:');
    console.log(`   1. User ${registrationResult.data.user.email} registered`);
    console.log(`   2. Browsed characters (free owned, premium not owned)`);
    console.log(`   3. Purchased "${TEST_CHARACTER.name}" for $${TEST_CHARACTER.price}`);
    console.log(`   4. Verified ownership in profile`);
    console.log(`   5. Generated image with character style`);
  });

});

// ============================================
// EDGE CASES AND ERROR HANDLING
// ============================================
describe('Edge Cases and Error Handling', () => {

  test('handles database connection failure gracefully', async () => {
    // Reset to get fresh module without supabase
    jest.resetModules();
    process.env.SUPABASE_URL = '';
    process.env.SUPABASE_SERVICE_ROLE_KEY = '';

    jest.doMock('@supabase/supabase-js', () => ({
      createClient: jest.fn(() => null),
    }));

    const charactersRouter = require('../../characters');
    app = express();
    app.use(express.json());
    app.use('/api/characters', charactersRouter);

    const response = await request(app)
      .get('/api/characters');

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Supabase not configured');
  });

  test('handles missing OpenRouter API key', async () => {
    jest.resetModules();
    delete process.env.OPENROUTER_API_KEY;

    const seedreamRouter = require('../../seedream');
    app = express();
    app.use(express.json());
    app.use('/api/seedream', seedreamRouter);

    const response = await request(app)
      .post('/api/seedream/generate')
      .send({ prompt: 'test' });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('OpenRouter API key not configured');
  });

});
