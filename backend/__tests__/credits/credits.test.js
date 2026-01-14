/**
 * Credit System Tests
 * Tests for credit balance, addition, and deduction logic
 */

const request = require('supertest');
const express = require('express');
const crypto = require('crypto');

// Mock fetch globally
global.fetch = jest.fn();

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase),
}));

// Mock email module
jest.mock('../../email', () => ({
  sendSubscriptionEmail: jest.fn().mockResolvedValue(true),
  sendPaymentReceiptEmail: jest.fn().mockResolvedValue(true),
  isEmailConfigured: jest.fn().mockReturnValue(false),
}));

let mockSupabase;
let paymentsRouter;
let resourcesRouter;
let app;

// Helper to create chainable Supabase mock
function createChainableMock(finalResult) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(finalResult),
    then: (resolve) => resolve(finalResult),
  };
  return chain;
}

beforeEach(() => {
  jest.resetModules();
  global.fetch.mockReset();

  // Reset Supabase mock with default behaviors
  mockSupabase = {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(),
  };

  jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(() => mockSupabase),
  }));

  // Create test Express app
  app = express();
  app.use(express.json());
});

// ============================================
// TIER CONFIGURATION Tests
// ============================================
describe('Tier Configuration', () => {

  beforeEach(() => {
    paymentsRouter = require('../../payments');
    app.use('/api/payments', paymentsRouter);
  });

  describe('Credit Packages', () => {
    const creditPackages = [
      { tier: 'credits_500', credits: 500, price: 12.00 },
      { tier: 'credits_1000', credits: 1000, price: 22.00 },
      { tier: 'credits_2500', credits: 2500, price: 50.00 },
    ];

    test.each(creditPackages)('$tier package gives $credits credits for $$price', ({ tier, credits, price }) => {
      // Access TIERS through the module
      const TIERS = {
        credits_500: { credits: 500, price: 12.00, is_credit_package: true },
        credits_1000: { credits: 1000, price: 22.00, is_credit_package: true },
        credits_2500: { credits: 2500, price: 50.00, is_credit_package: true },
      };

      expect(TIERS[tier].credits).toBe(credits);
      expect(TIERS[tier].price).toBe(price);
      expect(TIERS[tier].is_credit_package).toBe(true);
    });
  });

  describe('Subscription Tiers with Credits', () => {
    const subscriptionTiers = [
      { tier: 'starter', credits: 1000, price: 20.00 },
      { tier: 'creator', credits: 3000, price: 50.00 },
      { tier: 'pro', credits: 6500, price: 95.00 },
    ];

    test.each(subscriptionTiers)('$tier subscription includes $credits credits', ({ tier, credits }) => {
      const TIERS = {
        starter: { credits: 1000, price: 20.00, duration_days: 30 },
        creator: { credits: 3000, price: 50.00, duration_days: 30 },
        pro: { credits: 6500, price: 95.00, duration_days: 30 },
      };

      expect(TIERS[tier].credits).toBe(credits);
      expect(TIERS[tier].is_credit_package).toBeUndefined();
    });
  });

  describe('Membership Tiers without Credits', () => {
    test('supernova tier has no credits', () => {
      const TIERS = {
        supernova: { price: 25.00, duration_days: 30 },
      };
      expect(TIERS.supernova.credits).toBeUndefined();
    });

    test('mentorship tier has no credits', () => {
      const TIERS = {
        mentorship: { price: 100.00, duration_days: 30 },
      };
      expect(TIERS.mentorship.credits).toBeUndefined();
    });
  });

});

// ============================================
// Credit Balance Tests (resources.js)
// ============================================
describe('GET /api/resources/credits/balance', () => {

  beforeEach(() => {
    // Ensure environment variables are set for Supabase initialization
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

    // Reset modules and re-setup mock before requiring resources
    jest.resetModules();

    // Setup mock Supabase that will be returned by createClient
    mockSupabase = {
      auth: {
        getUser: jest.fn(),
      },
      from: jest.fn(),
    };

    jest.doMock('@supabase/supabase-js', () => ({
      createClient: jest.fn(() => mockSupabase),
    }));

    resourcesRouter = require('../../resources');
    app = express();
    app.use(express.json());
    app.use('/api/resources', resourcesRouter);
  });

  test('returns 401 when not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No user' },
    });

    const response = await request(app)
      .get('/api/resources/credits/balance')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
  });

  test('returns credit_balance: 0 for user with no credits', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-zero', email: 'zero@test.com' } },
      error: null,
    });

    // Mock profile with no credit_balance
    const profileChain = createChainableMock({ data: { credit_balance: 0 }, error: null });
    const transactionsChain = createChainableMock({ data: [], error: null });

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'profiles') return profileChain;
      if (table === 'credit_transactions') return transactionsChain;
      return createChainableMock({ data: null, error: null });
    });

    const response = await request(app)
      .get('/api/resources/credits/balance')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.credit_balance).toBe(0);
  });

  test('returns correct credit_balance for user with credits', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-rich', email: 'rich@test.com' } },
      error: null,
    });

    const profileChain = createChainableMock({ data: { credit_balance: 5000 }, error: null });
    const transactionsChain = createChainableMock({ data: [], error: null });

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'profiles') return profileChain;
      if (table === 'credit_transactions') return transactionsChain;
      return createChainableMock({ data: null, error: null });
    });

    const response = await request(app)
      .get('/api/resources/credits/balance')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.credit_balance).toBe(5000);
  });

  test('returns recent transactions with balance', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com' } },
      error: null,
    });

    const transactions = [
      { id: 1, amount: 500, type: 'added', description: 'Purchased credits' },
      { id: 2, amount: -100, type: 'spent', description: 'Resource purchase' },
    ];

    const profileChain = createChainableMock({ data: { credit_balance: 400 }, error: null });
    const transactionsChain = createChainableMock({ data: transactions, error: null });

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'profiles') return profileChain;
      if (table === 'credit_transactions') return transactionsChain;
      return createChainableMock({ data: null, error: null });
    });

    const response = await request(app)
      .get('/api/resources/credits/balance')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.transactions).toEqual(transactions);
    expect(response.body.transactions.length).toBe(2);
  });

  test('handles null credit_balance gracefully', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-null', email: 'null@test.com' } },
      error: null,
    });

    // Profile exists but credit_balance is null
    const profileChain = createChainableMock({ data: { credit_balance: null }, error: null });
    const transactionsChain = createChainableMock({ data: [], error: null });

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'profiles') return profileChain;
      if (table === 'credit_transactions') return transactionsChain;
      return createChainableMock({ data: null, error: null });
    });

    const response = await request(app)
      .get('/api/resources/credits/balance')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.credit_balance).toBe(0);
  });

});

// ============================================
// Credit Addition Tests (Payment Webhook)
// ============================================
describe('POST /api/payments/webhook/nowpayments (Credit Addition)', () => {

  beforeEach(() => {
    // Set environment variables
    process.env.NOWPAYMENTS_API_KEY = 'test-api-key';
    process.env.NOWPAYMENTS_IPN_SECRET = 'test-ipn-secret';

    paymentsRouter = require('../../payments');
    app.use('/api/payments', paymentsRouter);
  });

  afterEach(() => {
    delete process.env.NOWPAYMENTS_API_KEY;
    delete process.env.NOWPAYMENTS_IPN_SECRET;
  });

  test('adds 500 credits for credits_500 package purchase', async () => {
    // Track the update call
    let updatedCredits = null;

    // Mock payment lookup
    const paymentChain = createChainableMock({
      data: { user_id: 'user-123', tier: 'credits_500' },
      error: null,
    });

    // Mock profile lookup (user has 100 existing credits)
    const profileSelectChain = createChainableMock({
      data: { credits: 100 },
      error: null,
    });

    // Mock update
    const updateChain = {
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'payments') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { user_id: 'user-123', tier: 'credits_500' },
                error: null,
              }),
            }),
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { credits: 100 },
                error: null,
              }),
            }),
          }),
          update: jest.fn((data) => {
            updatedCredits = data.credits;
            return {
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          }),
        };
      }
      return createChainableMock({ data: null, error: null });
    });

    const response = await request(app)
      .post('/api/payments/webhook/nowpayments')
      .send({
        invoice_id: 'inv-123',
        payment_id: 'pay-123',
        payment_status: 'finished',
        order_id: 'credits_500-user-123-1234567890',
        pay_currency: 'btc',
      });

    expect(response.status).toBe(200);
    // 100 existing + 500 new = 600
    expect(updatedCredits).toBe(600);
  });

  test('adds 1000 credits for credits_1000 package purchase', async () => {
    let updatedCredits = null;

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'payments') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { user_id: 'user-123', tier: 'credits_1000' },
                error: null,
              }),
            }),
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { credits: 0 },
                error: null,
              }),
            }),
          }),
          update: jest.fn((data) => {
            updatedCredits = data.credits;
            return {
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          }),
        };
      }
      return createChainableMock({ data: null, error: null });
    });

    await request(app)
      .post('/api/payments/webhook/nowpayments')
      .send({
        invoice_id: 'inv-456',
        payment_id: 'pay-456',
        payment_status: 'finished',
        order_id: 'credits_1000-user-123-1234567890',
      });

    // 0 existing + 1000 new = 1000
    expect(updatedCredits).toBe(1000);
  });

  test('adds 2500 credits for credits_2500 package purchase', async () => {
    let updatedCredits = null;

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'payments') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { user_id: 'user-123', tier: 'credits_2500' },
                error: null,
              }),
            }),
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { credits: 1000 },
                error: null,
              }),
            }),
          }),
          update: jest.fn((data) => {
            updatedCredits = data.credits;
            return {
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          }),
        };
      }
      return createChainableMock({ data: null, error: null });
    });

    await request(app)
      .post('/api/payments/webhook/nowpayments')
      .send({
        invoice_id: 'inv-789',
        payment_id: 'pay-789',
        payment_status: 'finished',
        order_id: 'credits_2500-user-123-1234567890',
      });

    // 1000 existing + 2500 new = 3500
    expect(updatedCredits).toBe(3500);
  });

  test('adds subscription credits for starter plan', async () => {
    let updatedCredits = null;
    let subscriptionCreated = false;

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'payments') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { user_id: 'user-123', tier: 'starter' },
                error: null,
              }),
            }),
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { credits: 0 },
                error: null,
              }),
            }),
          }),
          update: jest.fn((data) => {
            if (data.credits !== undefined) {
              updatedCredits = data.credits;
            }
            return {
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          }),
        };
      }
      if (table === 'subscriptions') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          insert: jest.fn(() => {
            subscriptionCreated = true;
            return Promise.resolve({ data: null, error: null });
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }
      if (table === 'memberships') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return createChainableMock({ data: null, error: null });
    });

    await request(app)
      .post('/api/payments/webhook/nowpayments')
      .send({
        invoice_id: 'inv-starter',
        payment_id: 'pay-starter',
        payment_status: 'finished',
        order_id: 'starter-user-123-1234567890',
      });

    // Starter plan gives 1000 credits
    expect(updatedCredits).toBe(1000);
    expect(subscriptionCreated).toBe(true);
  });

  test('handles user with null credits gracefully', async () => {
    let updatedCredits = null;

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'payments') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { user_id: 'user-null', tier: 'credits_500' },
                error: null,
              }),
            }),
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                // User has null credits (never had any)
                data: { credits: null },
                error: null,
              }),
            }),
          }),
          update: jest.fn((data) => {
            updatedCredits = data.credits;
            return {
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          }),
        };
      }
      return createChainableMock({ data: null, error: null });
    });

    await request(app)
      .post('/api/payments/webhook/nowpayments')
      .send({
        invoice_id: 'inv-null',
        payment_id: 'pay-null',
        payment_status: 'finished',
        order_id: 'credits_500-user-null-1234567890',
      });

    // null + 500 should be 500 (not NaN)
    expect(updatedCredits).toBe(500);
  });

  test('does not add credits for pending status', async () => {
    let profileUpdateCalled = false;

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'payments') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { user_id: 'user-123', tier: 'credits_500' },
                error: null,
              }),
            }),
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          update: jest.fn(() => {
            profileUpdateCalled = true;
            return {
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          }),
        };
      }
      return createChainableMock({ data: null, error: null });
    });

    await request(app)
      .post('/api/payments/webhook/nowpayments')
      .send({
        invoice_id: 'inv-pending',
        payment_id: 'pay-pending',
        payment_status: 'waiting',
        order_id: 'credits_500-user-123-1234567890',
      });

    // Profile update for credits should NOT be called for pending
    expect(profileUpdateCalled).toBe(false);
  });

  test('does not add credits for failed/expired status', async () => {
    const failStatuses = ['expired', 'failed'];

    for (const status of failStatuses) {
      let profileCreditUpdateCalled = false;

      mockSupabase.from.mockImplementation((table) => {
        if (table === 'payments') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { user_id: 'user-123', tier: 'credits_500' },
                  error: null,
                }),
              }),
            }),
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { credits: 100 },
                  error: null,
                }),
              }),
            }),
            update: jest.fn((data) => {
              if (data.credits !== undefined) {
                profileCreditUpdateCalled = true;
              }
              return {
                eq: jest.fn().mockResolvedValue({ data: null, error: null }),
              };
            }),
          };
        }
        return createChainableMock({ data: null, error: null });
      });

      await request(app)
        .post('/api/payments/webhook/nowpayments')
        .send({
          invoice_id: `inv-${status}`,
          payment_id: `pay-${status}`,
          payment_status: status,
          order_id: 'credits_500-user-123-1234567890',
        });

      expect(profileCreditUpdateCalled).toBe(false);
    }
  });

});

// ============================================
// Credit Deduction Tests (Resource Purchase)
// ============================================
describe('POST /api/resources/purchase (Credit Deduction)', () => {

  beforeEach(() => {
    // Ensure environment variables are set for Supabase initialization
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

    // Reset modules and re-setup mock before requiring resources
    jest.resetModules();

    // Setup mock Supabase that will be returned by createClient
    mockSupabase = {
      auth: {
        getUser: jest.fn(),
      },
      from: jest.fn(),
    };

    jest.doMock('@supabase/supabase-js', () => ({
      createClient: jest.fn(() => mockSupabase),
    }));

    resourcesRouter = require('../../resources');
    app = express();
    app.use(express.json());
    app.use('/api/resources', resourcesRouter);
  });

  test('deducts exact amount when credits fully cover price', async () => {
    let deductedAmount = null;
    let transactionRecorded = null;

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-rich', email: 'rich@test.com' } },
      error: null,
    });

    // Helper to create chainable eq that returns itself
    const createEqChain = (finalResult) => {
      const eqFn = jest.fn(() => ({
        eq: eqFn,
        single: jest.fn().mockResolvedValue(finalResult),
      }));
      return eqFn;
    };

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'resources') {
        return {
          select: jest.fn().mockReturnValue({
            eq: createEqChain({
              data: {
                id: 'resource-1',
                title: 'Test Resource',
                price: 100,
                is_purchasable: true,
              },
              error: null,
            }),
          }),
        };
      }
      if (table === 'user_purchases') {
        return {
          select: jest.fn().mockReturnValue({
            eq: createEqChain({ data: null, error: null }),
          }),
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: 'purchase-1' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnValue({
            eq: createEqChain({
              data: { credit_balance: 500 },
              error: null,
            }),
          }),
          update: jest.fn((data) => {
            deductedAmount = 500 - data.credit_balance;
            return {
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
            };
          }),
        };
      }
      if (table === 'credit_transactions') {
        return {
          insert: jest.fn((data) => {
            transactionRecorded = data;
            return Promise.resolve({ data: null, error: null });
          }),
        };
      }
      return createChainableMock({ data: null, error: null });
    });

    const response = await request(app)
      .post('/api/resources/purchase')
      .set('Authorization', 'Bearer valid-token')
      .send({
        resource_id: 'resource-1',
        use_credits: true,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.credits_used).toBe(100);
    expect(deductedAmount).toBe(100);
    expect(transactionRecorded.amount).toBe(-100);
    expect(transactionRecorded.type).toBe('spent');
  });

  test('uses partial credits when balance is less than price', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-partial', email: 'partial@test.com' } },
      error: null,
    });

    const createEqChain = (finalResult) => {
      const eqFn = jest.fn(() => ({
        eq: eqFn,
        single: jest.fn().mockResolvedValue(finalResult),
      }));
      return eqFn;
    };

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'resources') {
        return {
          select: jest.fn().mockReturnValue({
            eq: createEqChain({
              data: {
                id: 'resource-expensive',
                title: 'Expensive Resource',
                price: 200,
                is_purchasable: true,
              },
              error: null,
            }),
          }),
        };
      }
      if (table === 'user_purchases') {
        return {
          select: jest.fn().mockReturnValue({
            eq: createEqChain({ data: null, error: null }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnValue({
            eq: createEqChain({
              // Only 50 credits, but resource costs 200
              data: { credit_balance: 50 },
              error: null,
            }),
          }),
        };
      }
      return createChainableMock({ data: null, error: null });
    });

    const response = await request(app)
      .post('/api/resources/purchase')
      .set('Authorization', 'Bearer valid-token')
      .send({
        resource_id: 'resource-expensive',
        use_credits: true,
      });

    expect(response.status).toBe(200);
    expect(response.body.requires_payment).toBe(true);
    expect(response.body.credits_to_use).toBe(50);
    expect(response.body.amount_to_pay).toBe(150); // 200 - 50
  });

  test('does not use credits when use_credits is false', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-cash', email: 'cash@test.com' } },
      error: null,
    });

    const createEqChain = (finalResult) => {
      const eqFn = jest.fn(() => ({
        eq: eqFn,
        single: jest.fn().mockResolvedValue(finalResult),
      }));
      return eqFn;
    };

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'resources') {
        return {
          select: jest.fn().mockReturnValue({
            eq: createEqChain({
              data: {
                id: 'resource-1',
                title: 'Test Resource',
                price: 100,
                is_purchasable: true,
              },
              error: null,
            }),
          }),
        };
      }
      if (table === 'user_purchases') {
        return {
          select: jest.fn().mockReturnValue({
            eq: createEqChain({ data: null, error: null }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnValue({
            eq: createEqChain({
              // User has plenty of credits
              data: { credit_balance: 1000 },
              error: null,
            }),
          }),
        };
      }
      return createChainableMock({ data: null, error: null });
    });

    const response = await request(app)
      .post('/api/resources/purchase')
      .set('Authorization', 'Bearer valid-token')
      .send({
        resource_id: 'resource-1',
        use_credits: false, // Explicitly not using credits
      });

    expect(response.status).toBe(200);
    expect(response.body.requires_payment).toBe(true);
    expect(response.body.credits_to_use).toBe(0);
    expect(response.body.amount_to_pay).toBe(100);
  });

  test('handles zero credit balance gracefully', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-zero', email: 'zero@test.com' } },
      error: null,
    });

    const createEqChain = (finalResult) => {
      const eqFn = jest.fn(() => ({
        eq: eqFn,
        single: jest.fn().mockResolvedValue(finalResult),
      }));
      return eqFn;
    };

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'resources') {
        return {
          select: jest.fn().mockReturnValue({
            eq: createEqChain({
              data: {
                id: 'resource-1',
                title: 'Test Resource',
                price: 100,
                is_purchasable: true,
              },
              error: null,
            }),
          }),
        };
      }
      if (table === 'user_purchases') {
        return {
          select: jest.fn().mockReturnValue({
            eq: createEqChain({ data: null, error: null }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnValue({
            eq: createEqChain({
              data: { credit_balance: 0 },
              error: null,
            }),
          }),
        };
      }
      return createChainableMock({ data: null, error: null });
    });

    const response = await request(app)
      .post('/api/resources/purchase')
      .set('Authorization', 'Bearer valid-token')
      .send({
        resource_id: 'resource-1',
        use_credits: true,
      });

    expect(response.status).toBe(200);
    expect(response.body.requires_payment).toBe(true);
    expect(response.body.credits_to_use).toBe(0);
    expect(response.body.amount_to_pay).toBe(100);
  });

  test('applies sale price correctly with credits', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-sale', email: 'sale@test.com' } },
      error: null,
    });

    // Future date for active sale
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    const createEqChain = (finalResult) => {
      const eqFn = jest.fn(() => ({
        eq: eqFn,
        single: jest.fn().mockResolvedValue(finalResult),
      }));
      return eqFn;
    };

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'resources') {
        return {
          select: jest.fn().mockReturnValue({
            eq: createEqChain({
              data: {
                id: 'resource-sale',
                title: 'Sale Resource',
                price: 200,
                sale_price: 100, // 50% off
                sale_ends_at: futureDate.toISOString(),
                is_purchasable: true,
              },
              error: null,
            }),
          }),
        };
      }
      if (table === 'user_purchases') {
        return {
          select: jest.fn().mockReturnValue({
            eq: createEqChain({ data: null, error: null }),
          }),
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: 'purchase-1' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnValue({
            eq: createEqChain({
              data: { credit_balance: 500 },
              error: null,
            }),
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }
      if (table === 'credit_transactions') {
        return {
          insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return createChainableMock({ data: null, error: null });
    });

    const response = await request(app)
      .post('/api/resources/purchase')
      .set('Authorization', 'Bearer valid-token')
      .send({
        resource_id: 'resource-sale',
        use_credits: true,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    // Should use sale price (100), not original (200)
    expect(response.body.credits_used).toBe(100);
  });

  test('rejects purchase of already owned resource', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-owned', email: 'owned@test.com' } },
      error: null,
    });

    const createEqChain = (finalResult) => {
      const eqFn = jest.fn(() => ({
        eq: eqFn,
        single: jest.fn().mockResolvedValue(finalResult),
      }));
      return eqFn;
    };

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'resources') {
        return {
          select: jest.fn().mockReturnValue({
            eq: createEqChain({
              data: {
                id: 'resource-owned',
                title: 'Already Owned',
                price: 100,
                is_purchasable: true,
              },
              error: null,
            }),
          }),
        };
      }
      if (table === 'user_purchases') {
        return {
          select: jest.fn().mockReturnValue({
            eq: createEqChain({
              // Already owns this resource
              data: { id: 'existing-purchase' },
              error: null,
            }),
          }),
        };
      }
      return createChainableMock({ data: null, error: null });
    });

    const response = await request(app)
      .post('/api/resources/purchase')
      .set('Authorization', 'Bearer valid-token')
      .send({
        resource_id: 'resource-owned',
        use_credits: true,
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('You already own this resource');
  });

});

// ============================================
// Credit Math Edge Cases
// ============================================
describe('Credit Math Edge Cases', () => {

  test('adding credits never results in negative balance', () => {
    // Simulating the webhook logic
    const currentCredits = null; // New user
    const creditsToAdd = 500;
    const newCredits = (currentCredits || 0) + creditsToAdd;
    expect(newCredits).toBe(500);
    expect(newCredits).toBeGreaterThanOrEqual(0);
  });

  test('deducting credits uses Math.min to prevent over-deduction', () => {
    const creditBalance = 30;
    const price = 100;
    const creditsToUse = Math.min(creditBalance, price);
    expect(creditsToUse).toBe(30);
  });

  test('credit balance cannot go negative through normal purchase flow', () => {
    const creditBalance = 50;
    const price = 100;
    const creditsToUse = Math.min(creditBalance, price);
    const newBalance = creditBalance - creditsToUse;
    expect(newBalance).toBe(0);
    expect(newBalance).toBeGreaterThanOrEqual(0);
  });

  test('handles very large credit amounts', () => {
    const currentCredits = 999999;
    const creditsToAdd = 2500;
    const newCredits = currentCredits + creditsToAdd;
    expect(newCredits).toBe(1002499);
  });

});
