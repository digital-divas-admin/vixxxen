/**
 * API Service
 * Centralized API client for backend communication
 */

const API_BASE = import.meta.env.VITE_API_URL || '';

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Make an authenticated API request
 */
async function request(endpoint, options = {}) {
  const { headers = {}, ...rest } = options;

  // Get auth token from localStorage
  const token = localStorage.getItem('supabase.auth.token');
  const parsedToken = token ? JSON.parse(token) : null;
  const accessToken = parsedToken?.access_token;

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      ...headers,
    },
  });

  // Handle non-JSON responses
  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    throw new ApiError(
      data?.error || data?.message || 'An error occurred',
      response.status,
      data
    );
  }

  return data;
}

/**
 * API methods
 */
export const api = {
  // Agency
  getAgencyConfig: () => request('/api/agency/config'),
  getMe: () => request('/api/agency/me'),
  updateAgencySettings: (settings) =>
    request('/api/agency/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  getUsage: () => request('/api/agency/usage'),

  // Team
  getTeam: () => request('/api/team'),
  inviteUser: (data) =>
    request('/api/team/invite', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateUser: (userId, data) =>
    request(`/api/team/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  removeUser: (userId) =>
    request(`/api/team/${userId}`, {
      method: 'DELETE',
    }),

  // Generation (Phase 2)
  // generateImage: (data) => request('/api/generate/image', { method: 'POST', body: JSON.stringify(data) }),
  // generateVideo: (data) => request('/api/generate/video', { method: 'POST', body: JSON.stringify(data) }),

  // Health
  healthCheck: () => request('/health'),
};

export { ApiError };
