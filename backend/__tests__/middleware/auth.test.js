/**
 * Auth Middleware Tests
 * Tests for authentication and authorization middleware
 */

const {
  createMockRequest,
  createMockResponse,
  createMockNext,
  createAuthenticatedRequest,
} = require('../mocks/express');
const { testUsers, testProfiles, testTokens } = require('../mocks/supabase');

// We need to mock @supabase/supabase-js before requiring the auth module
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase),
}));

// Mock Supabase instance that we can control
let mockSupabase;

// Import the module under test AFTER setting up mocks
let authModule;

beforeEach(() => {
  // Reset the mock Supabase client before each test
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
    })),
  };

  // Clear module cache and re-require to get fresh instance
  jest.resetModules();

  // Re-mock after reset
  jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(() => mockSupabase),
  }));

  authModule = require('../../middleware/auth');
});

describe('Auth Middleware', () => {

  // ============================================
  // extractToken Tests
  // ============================================
  describe('extractToken()', () => {

    test('returns null when no header provided', () => {
      const result = authModule.extractToken(null);
      expect(result).toBeNull();
    });

    test('returns null when header is undefined', () => {
      const result = authModule.extractToken(undefined);
      expect(result).toBeNull();
    });

    test('returns null when header is empty string', () => {
      const result = authModule.extractToken('');
      expect(result).toBeNull();
    });

    test('returns null when header has no Bearer prefix', () => {
      const result = authModule.extractToken('some-token');
      expect(result).toBeNull();
    });

    test('returns null when header has wrong prefix', () => {
      const result = authModule.extractToken('Basic some-token');
      expect(result).toBeNull();
    });

    test('returns empty string when Bearer has trailing space (handled as no token)', () => {
      const result = authModule.extractToken('Bearer ');
      // Returns empty string, which is falsy and handled correctly downstream
      expect(result).toBe('');
    });

    test('returns null when only "Bearer" without space', () => {
      const result = authModule.extractToken('Bearer');
      expect(result).toBeNull();
    });

    test('extracts token with proper "Bearer TOKEN" format', () => {
      const result = authModule.extractToken('Bearer my-jwt-token');
      expect(result).toBe('my-jwt-token');
    });

    test('extracts token with lowercase "bearer"', () => {
      const result = authModule.extractToken('bearer my-jwt-token');
      expect(result).toBe('my-jwt-token');
    });

    test('extracts token with mixed case "BeArEr"', () => {
      const result = authModule.extractToken('BeArEr my-jwt-token');
      expect(result).toBe('my-jwt-token');
    });

    test('returns null when more than 2 parts', () => {
      const result = authModule.extractToken('Bearer token extra-stuff');
      expect(result).toBeNull();
    });

  });

  // ============================================
  // requireAuth Tests
  // ============================================
  describe('requireAuth()', () => {

    test('returns 401 when no authorization header', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await authModule.requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(next).not.toHaveBeenCalled();
    });

    test('returns 401 when authorization header is malformed', async () => {
      const req = createMockRequest({
        headers: { authorization: 'InvalidHeader' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authModule.requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(next).not.toHaveBeenCalled();
    });

    test('returns 401 when token is expired', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Token expired' },
      });

      const req = createAuthenticatedRequest(testTokens.expired);
      const res = createMockResponse();
      const next = createMockNext();

      await authModule.requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
      expect(next).not.toHaveBeenCalled();
    });

    test('returns 401 when token is invalid', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid JWT' },
      });

      const req = createAuthenticatedRequest(testTokens.invalid);
      const res = createMockResponse();
      const next = createMockNext();

      await authModule.requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
      expect(next).not.toHaveBeenCalled();
    });

    test('returns 401 when Supabase returns no user', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const req = createAuthenticatedRequest(testTokens.valid);
      const res = createMockResponse();
      const next = createMockNext();

      await authModule.requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
      expect(next).not.toHaveBeenCalled();
    });

    test('attaches user and calls next() on valid token', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: testUsers.regular },
        error: null,
      });

      const req = createAuthenticatedRequest(testTokens.valid);
      const res = createMockResponse();
      const next = createMockNext();

      await authModule.requireAuth(req, res, next);

      expect(req.user).toEqual(testUsers.regular);
      expect(req.userId).toBe(testUsers.regular.id);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('returns 500 when Supabase throws unexpected error', async () => {
      mockSupabase.auth.getUser.mockRejectedValue(new Error('Network error'));

      const req = createAuthenticatedRequest(testTokens.valid);
      const res = createMockResponse();
      const next = createMockNext();

      await authModule.requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication failed' });
      expect(next).not.toHaveBeenCalled();
    });

    test('calls Supabase getUser with extracted token', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: testUsers.regular },
        error: null,
      });

      const req = createAuthenticatedRequest('my-specific-token');
      const res = createMockResponse();
      const next = createMockNext();

      await authModule.requireAuth(req, res, next);

      expect(mockSupabase.auth.getUser).toHaveBeenCalledWith('my-specific-token');
    });

  });

  // ============================================
  // optionalAuth Tests
  // ============================================
  describe('optionalAuth()', () => {

    test('sets user to null and calls next() when no header', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await authModule.optionalAuth(req, res, next);

      expect(req.user).toBeNull();
      expect(req.userId).toBeNull();
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('sets user to null and calls next() on invalid token', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      const req = createAuthenticatedRequest(testTokens.invalid);
      const res = createMockResponse();
      const next = createMockNext();

      await authModule.optionalAuth(req, res, next);

      expect(req.user).toBeNull();
      expect(req.userId).toBeNull();
      expect(next).toHaveBeenCalled();
      // Should NOT return an error response
      expect(res.status).not.toHaveBeenCalled();
    });

    test('sets user to null and calls next() on expired token', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Token expired' },
      });

      const req = createAuthenticatedRequest(testTokens.expired);
      const res = createMockResponse();
      const next = createMockNext();

      await authModule.optionalAuth(req, res, next);

      expect(req.user).toBeNull();
      expect(req.userId).toBeNull();
      expect(next).toHaveBeenCalled();
    });

    test('attaches user and calls next() on valid token', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: testUsers.regular },
        error: null,
      });

      const req = createAuthenticatedRequest(testTokens.valid);
      const res = createMockResponse();
      const next = createMockNext();

      await authModule.optionalAuth(req, res, next);

      expect(req.user).toEqual(testUsers.regular);
      expect(req.userId).toBe(testUsers.regular.id);
      expect(next).toHaveBeenCalled();
    });

    test('continues silently on Supabase error', async () => {
      mockSupabase.auth.getUser.mockRejectedValue(new Error('Network error'));

      const req = createAuthenticatedRequest(testTokens.valid);
      const res = createMockResponse();
      const next = createMockNext();

      await authModule.optionalAuth(req, res, next);

      expect(req.user).toBeNull();
      expect(req.userId).toBeNull();
      expect(next).toHaveBeenCalled();
      // Should NOT return error
      expect(res.status).not.toHaveBeenCalled();
    });

  });

  // ============================================
  // requireAdmin Tests
  // ============================================
  describe('requireAdmin()', () => {

    test('returns 401 when no authorization header', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await authModule.requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(next).not.toHaveBeenCalled();
    });

    test('returns 401 when token is invalid', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      const req = createAuthenticatedRequest(testTokens.invalid);
      const res = createMockResponse();
      const next = createMockNext();

      await authModule.requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    });

    test('returns 403 when user role is "user"', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: testUsers.regular },
        error: null,
      });

      // Mock profile lookup returning regular user role
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { role: 'user' },
              error: null,
            }),
          }),
        }),
      });

      const req = createAuthenticatedRequest(testTokens.valid);
      const res = createMockResponse();
      const next = createMockNext();

      await authModule.requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' });
      expect(next).not.toHaveBeenCalled();
    });

    test('returns 403 when user role is "moderator"', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: testUsers.moderator },
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { role: 'moderator' },
              error: null,
            }),
          }),
        }),
      });

      const req = createAuthenticatedRequest(testTokens.moderator);
      const res = createMockResponse();
      const next = createMockNext();

      await authModule.requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' });
      expect(next).not.toHaveBeenCalled();
    });

    test('attaches user, sets isAdmin, and calls next() for admin', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: testUsers.admin },
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { role: 'admin' },
              error: null,
            }),
          }),
        }),
      });

      const req = createAuthenticatedRequest(testTokens.admin);
      const res = createMockResponse();
      const next = createMockNext();

      await authModule.requireAdmin(req, res, next);

      expect(req.user).toEqual(testUsers.admin);
      expect(req.userId).toBe(testUsers.admin.id);
      expect(req.isAdmin).toBe(true);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('returns 500 on unexpected error', async () => {
      mockSupabase.auth.getUser.mockRejectedValue(new Error('Database error'));

      const req = createAuthenticatedRequest(testTokens.valid);
      const res = createMockResponse();
      const next = createMockNext();

      await authModule.requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication failed' });
    });

    test('queries profiles table for role check', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: testUsers.regular },
        error: null,
      });

      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { role: 'user' },
            error: null,
          }),
        }),
      });

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
      });

      const req = createAuthenticatedRequest(testTokens.valid);
      const res = createMockResponse();
      const next = createMockNext();

      await authModule.requireAdmin(req, res, next);

      expect(mockSupabase.from).toHaveBeenCalledWith('profiles');
      expect(mockSelect).toHaveBeenCalledWith('role');
    });

  });

  // ============================================
  // verifyOwnership Tests
  // ============================================
  describe('verifyOwnership()', () => {

    test('returns 401 when req.userId is not set', () => {
      const middleware = authModule.verifyOwnership();
      const req = createMockRequest({
        params: { userId: 'some-user-id' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(next).not.toHaveBeenCalled();
    });

    test('allows access when userId matches (params)', () => {
      const middleware = authModule.verifyOwnership();
      const req = createMockRequest({
        userId: 'user-123',
        params: { userId: 'user-123' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('allows access when userId matches (query)', () => {
      const middleware = authModule.verifyOwnership();
      const req = createMockRequest({
        userId: 'user-123',
        query: { user_id: 'user-123' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('allows access when userId matches (body)', () => {
      const middleware = authModule.verifyOwnership();
      const req = createMockRequest({
        userId: 'user-123',
        body: { user_id: 'user-123' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('returns 403 when userId does not match', () => {
      const middleware = authModule.verifyOwnership();
      const req = createMockRequest({
        userId: 'user-123',
        params: { userId: 'different-user-456' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access denied' });
      expect(next).not.toHaveBeenCalled();
    });

    test('allows admin to access any user data', () => {
      const middleware = authModule.verifyOwnership();
      const req = createMockRequest({
        userId: 'admin-user',
        isAdmin: true,
        params: { userId: 'different-user-456' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('allows access when no userId in request (no restriction)', () => {
      const middleware = authModule.verifyOwnership();
      const req = createMockRequest({
        userId: 'user-123',
        // No userId in params, query, or body
      });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('uses custom param name when specified', () => {
      const middleware = authModule.verifyOwnership('targetUser');
      const req = createMockRequest({
        userId: 'user-123',
        params: { targetUser: 'user-123' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('denies with custom param name when mismatch', () => {
      const middleware = authModule.verifyOwnership('targetUser');
      const req = createMockRequest({
        userId: 'user-123',
        params: { targetUser: 'other-user' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

  });

});
