/**
 * Express Request/Response Mock Factory
 * Creates configurable mocks for Express middleware testing
 */

/**
 * Create a mock Express request object
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock request object
 */
function createMockRequest(overrides = {}) {
  return {
    headers: {},
    params: {},
    query: {},
    body: {},
    path: '/test',
    method: 'GET',
    ip: '127.0.0.1',
    connection: {
      remoteAddress: '127.0.0.1',
    },
    user: null,
    userId: null,
    isAdmin: false,
    ...overrides,
  };
}

/**
 * Create a mock Express response object
 * @returns {Object} Mock response object with jest spies
 */
function createMockResponse() {
  const res = {
    statusCode: 200,
    _json: null,
    _sent: false,
  };

  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });

  res.json = jest.fn((data) => {
    res._json = data;
    res._sent = true;
    return res;
  });

  res.send = jest.fn((data) => {
    res._sent = true;
    return res;
  });

  res.end = jest.fn(() => {
    res._sent = true;
    return res;
  });

  return res;
}

/**
 * Create a mock next function
 * @returns {Function} Jest mock function
 */
function createMockNext() {
  return jest.fn();
}

/**
 * Helper to create request with auth header
 * @param {string} token - JWT token
 * @param {Object} overrides - Additional request properties
 * @returns {Object} Mock request with authorization header
 */
function createAuthenticatedRequest(token, overrides = {}) {
  return createMockRequest({
    headers: {
      authorization: `Bearer ${token}`,
      ...overrides.headers,
    },
    ...overrides,
  });
}

/**
 * Helper to create request with specific IP
 * @param {string} ip - IP address
 * @param {Object} overrides - Additional request properties
 * @returns {Object} Mock request with IP set
 */
function createRequestWithIP(ip, overrides = {}) {
  return createMockRequest({
    ip,
    headers: {
      'x-forwarded-for': ip,
      ...overrides.headers,
    },
    connection: {
      remoteAddress: ip,
    },
    ...overrides,
  });
}

module.exports = {
  createMockRequest,
  createMockResponse,
  createMockNext,
  createAuthenticatedRequest,
  createRequestWithIP,
};
