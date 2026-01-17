/**
 * Email Service Tests
 */

// Mock Resend before importing the module
const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: mockSend
    }
  }))
}));

jest.mock('../../services/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  },
  maskEmail: jest.fn((email) => email.replace(/(.{2}).*(@.*)/, '$1***$2'))
}));

// Set required env vars before importing
process.env.RESEND_API_KEY = 'test-api-key';
process.env.FRONTEND_URL = 'https://vixxxen.com';

const {
  sendImageApprovedEmail,
  sendImageRejectedEmail,
  isEmailConfigured
} = require('../../email');

describe('Email Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isEmailConfigured', () => {
    it('should return true when RESEND_API_KEY is set', () => {
      expect(isEmailConfigured()).toBe(true);
    });
  });

  describe('sendImageApprovedEmail', () => {
    it('should send approval email with correct content', async () => {
      mockSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });

      const result = await sendImageApprovedEmail('user@example.com', 'John');

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);

      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.to).toBe('user@example.com');
      expect(callArgs.subject).toContain('approved');
      expect(callArgs.html).toContain('John');
      expect(callArgs.html).toContain('approved');
      expect(callArgs.html).toContain('Image Library');
    });

    it('should use email prefix as name when no name provided', async () => {
      mockSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });

      await sendImageApprovedEmail('testuser@example.com');

      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.html).toContain('testuser');
    });

    it('should handle send errors gracefully', async () => {
      mockSend.mockResolvedValue({ data: null, error: { message: 'Rate limited' } });

      const result = await sendImageApprovedEmail('user@example.com', 'John');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle exceptions gracefully', async () => {
      mockSend.mockRejectedValue(new Error('Network error'));

      const result = await sendImageApprovedEmail('user@example.com', 'John');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('sendImageRejectedEmail', () => {
    it('should send rejection email with reason', async () => {
      mockSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });

      const result = await sendImageRejectedEmail(
        'user@example.com',
        'John',
        'Image appears to contain a celebrity face'
      );

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);

      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.to).toBe('user@example.com');
      expect(callArgs.subject).toContain('Review');
      expect(callArgs.html).toContain('John');
      expect(callArgs.html).toContain('celebrity face');
    });

    it('should use default reason when none provided', async () => {
      mockSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });

      await sendImageRejectedEmail('user@example.com', 'John');

      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.html).toContain('did not meet our content guidelines');
    });

    it('should handle send errors gracefully', async () => {
      mockSend.mockResolvedValue({ data: null, error: { message: 'Invalid email' } });

      const result = await sendImageRejectedEmail('invalid', 'John', 'reason');

      expect(result.success).toBe(false);
    });

    it('should handle exceptions gracefully', async () => {
      mockSend.mockRejectedValue(new Error('Service unavailable'));

      const result = await sendImageRejectedEmail('user@example.com', 'John', 'reason');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Service unavailable');
    });
  });

  describe('Email Template', () => {
    it('should include brand styling', async () => {
      mockSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });

      await sendImageApprovedEmail('user@example.com', 'John');

      const callArgs = mockSend.mock.calls[0][0];
      // Check for brand colors
      expect(callArgs.html).toContain('#ff2ebb'); // Primary brand color
      expect(callArgs.html).toContain('Vixxxen');
    });

    it('should include call-to-action button', async () => {
      mockSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });

      await sendImageApprovedEmail('user@example.com', 'John');

      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.html).toContain('https://vixxxen.com');
      expect(callArgs.html).toContain('Open Image Library');
    });
  });
});
