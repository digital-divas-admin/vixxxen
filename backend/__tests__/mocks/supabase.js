/**
 * Supabase Mock Factory
 * Creates configurable mocks for Supabase client operations
 */

/**
 * Create a mock Supabase client with configurable responses
 * @param {Object} options - Configuration options
 * @returns {Object} Mock Supabase client
 */
function createMockSupabase(options = {}) {
  const {
    // Auth responses
    authUser = null,
    authError = null,
    // Query responses
    selectData = null,
    selectError = null,
    insertData = null,
    insertError = null,
    updateData = null,
    updateError = null,
    upsertData = null,
    upsertError = null,
  } = options;

  // Track calls for assertions
  const calls = {
    auth: [],
    from: [],
    select: [],
    insert: [],
    update: [],
    upsert: [],
    eq: [],
    single: [],
  };

  // Chainable query builder mock
  const createQueryBuilder = (defaultData, defaultError) => {
    let currentData = defaultData;
    let currentError = defaultError;

    const builder = {
      select: jest.fn((columns) => {
        calls.select.push(columns);
        return builder;
      }),
      insert: jest.fn((data) => {
        calls.insert.push(data);
        currentData = insertData;
        currentError = insertError;
        return builder;
      }),
      update: jest.fn((data) => {
        calls.update.push(data);
        currentData = updateData;
        currentError = updateError;
        return builder;
      }),
      upsert: jest.fn((data, opts) => {
        calls.upsert.push({ data, opts });
        currentData = upsertData;
        currentError = upsertError;
        return builder;
      }),
      eq: jest.fn((column, value) => {
        calls.eq.push({ column, value });
        return builder;
      }),
      order: jest.fn(() => builder),
      limit: jest.fn(() => builder),
      single: jest.fn(() => {
        calls.single.push(true);
        return Promise.resolve({ data: currentData, error: currentError });
      }),
      // For non-single queries
      then: (resolve) => resolve({ data: currentData, error: currentError }),
    };

    return builder;
  };

  const mockSupabase = {
    auth: {
      getUser: jest.fn((token) => {
        calls.auth.push(token);
        return Promise.resolve({
          data: { user: authUser },
          error: authError,
        });
      }),
    },
    from: jest.fn((table) => {
      calls.from.push(table);
      return createQueryBuilder(selectData, selectError);
    }),
    // Expose calls for assertions
    _calls: calls,
    // Helper to reset all mocks
    _reset: () => {
      Object.keys(calls).forEach(key => calls[key] = []);
      mockSupabase.auth.getUser.mockClear();
      mockSupabase.from.mockClear();
    },
  };

  return mockSupabase;
}

/**
 * Create test fixture users
 */
const testUsers = {
  regular: {
    id: 'user-123-regular',
    email: 'user@test.com',
    role: 'authenticated',
  },
  admin: {
    id: 'user-456-admin',
    email: 'admin@test.com',
    role: 'authenticated',
  },
  moderator: {
    id: 'user-789-moderator',
    email: 'mod@test.com',
    role: 'authenticated',
  },
  unverified: {
    id: 'user-000-unverified',
    email: 'unverified@test.com',
    role: 'authenticated',
  },
};

/**
 * Create test fixture profiles (database records)
 */
const testProfiles = {
  regular: {
    id: testUsers.regular.id,
    email: testUsers.regular.email,
    role: 'user',
    credits: 500,
    credit_balance: 500,
    content_mode: 'safe',
  },
  admin: {
    id: testUsers.admin.id,
    email: testUsers.admin.email,
    role: 'admin',
    credits: 10000,
    credit_balance: 10000,
    content_mode: 'nsfw',
  },
  moderator: {
    id: testUsers.moderator.id,
    email: testUsers.moderator.email,
    role: 'moderator',
    credits: 1000,
    credit_balance: 1000,
    content_mode: 'safe',
  },
  zeroCredits: {
    id: 'user-zero-credits',
    email: 'broke@test.com',
    role: 'user',
    credits: 0,
    credit_balance: 0,
    content_mode: 'safe',
  },
  richUser: {
    id: 'user-rich',
    email: 'rich@test.com',
    role: 'user',
    credits: 50000,
    credit_balance: 50000,
    content_mode: 'nsfw',
  },
};

/**
 * Generate mock JWT tokens for testing
 */
const testTokens = {
  valid: 'valid-jwt-token-123',
  expired: 'expired-jwt-token-456',
  invalid: 'invalid-jwt-token-789',
  malformed: 'not-a-real-token',
  admin: 'admin-jwt-token-admin',
  moderator: 'moderator-jwt-token-mod',
};

module.exports = {
  createMockSupabase,
  testUsers,
  testProfiles,
  testTokens,
};
