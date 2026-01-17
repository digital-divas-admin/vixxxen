/**
 * Image Moderation Service Tests
 */

// Mock AWS SDK before importing the module
const mockSend = jest.fn();
const mockRekognitionClient = jest.fn().mockImplementation(() => ({
  send: mockSend
}));

jest.mock('@aws-sdk/client-rekognition', () => ({
  RekognitionClient: mockRekognitionClient,
  DetectModerationLabelsCommand: jest.fn().mockImplementation((params) => ({
    type: 'DetectModerationLabelsCommand',
    params
  })),
  RecognizeCelebritiesCommand: jest.fn().mockImplementation((params) => ({
    type: 'RecognizeCelebritiesCommand',
    params
  })),
  DetectFacesCommand: jest.fn().mockImplementation((params) => ({
    type: 'DetectFacesCommand',
    params
  }))
}));

jest.mock('../../services/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock sharp for image conversion
jest.mock('sharp', () => {
  return jest.fn().mockImplementation(() => ({
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('mock-converted-image'))
  }));
});

jest.mock('node-fetch', () => jest.fn());

// Store original env
const originalEnv = process.env;

describe('Image Moderation Service', () => {
  let imageModeration;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Set required env vars
    process.env = {
      ...originalEnv,
      AWS_ACCESS_KEY_ID: 'test-access-key',
      AWS_SECRET_ACCESS_KEY: 'test-secret-key',
      AWS_REGION: 'us-east-1'
    };

    imageModeration = require('../../services/imageModeration');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('isEnabled', () => {
    it('should return true when AWS credentials are configured', () => {
      expect(imageModeration.isEnabled()).toBe(true);
    });

    it('should return false when AWS credentials are missing', () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      jest.resetModules();
      const mod = require('../../services/imageModeration');
      expect(mod.isEnabled()).toBe(false);
    });
  });

  describe('screenImage', () => {
    it('should return approved when no issues detected', async () => {
      // Mock celebrity detection - no celebrities, no moderation labels, no minor faces
      mockSend
        .mockResolvedValueOnce({ CelebrityFaces: [] })
        .mockResolvedValueOnce({ ModerationLabels: [] })
        .mockResolvedValueOnce({ FaceDetails: [] });

      const result = await imageModeration.screenImage(
        Buffer.from('fake-image-data')
      );

      expect(result.approved).toBe(true);
      expect(result.hasCelebrity).toBe(false);
      expect(result.hasMinor).toBe(false);
      expect(result.reasons).toHaveLength(0);
    });

    it('should reject when celebrity detected with high confidence', async () => {
      mockSend
        .mockResolvedValueOnce({
          CelebrityFaces: [{
            Name: 'Famous Person',
            MatchConfidence: 95,
            Id: 'celeb-123',
            Urls: ['https://example.com/celeb']
          }]
        })
        .mockResolvedValueOnce({ ModerationLabels: [] })
        .mockResolvedValueOnce({ FaceDetails: [{ AgeRange: { Low: 25, High: 35 }, Confidence: 99 }] });

      const result = await imageModeration.screenImage(
        Buffer.from('fake-image-data')
      );

      expect(result.approved).toBe(false);
      expect(result.hasCelebrity).toBe(true);
      expect(result.celebrities).toHaveLength(1);
      expect(result.celebrities[0].name).toBe('Famous Person');
      expect(result.reasons).toContain('Celebrity detected: Famous Person');
    });

    it('should not flag celebrity below threshold', async () => {
      mockSend
        .mockResolvedValueOnce({
          CelebrityFaces: [{
            Name: 'Similar Looking Person',
            MatchConfidence: 70, // Below default 90 threshold
            Id: 'celeb-456',
            Urls: []
          }]
        })
        .mockResolvedValueOnce({ ModerationLabels: [] })
        .mockResolvedValueOnce({ FaceDetails: [] });

      const result = await imageModeration.screenImage(
        Buffer.from('fake-image-data')
      );

      expect(result.approved).toBe(true);
      expect(result.hasCelebrity).toBe(false);
      expect(result.celebrities).toHaveLength(0);
    });

    it('should reject when minor-related content detected', async () => {
      mockSend
        .mockResolvedValueOnce({ CelebrityFaces: [] })
        .mockResolvedValueOnce({
          ModerationLabels: [{
            Name: 'Child',
            ParentName: 'Person',
            Confidence: 85,
            TaxonomyLevel: 2
          }]
        })
        .mockResolvedValueOnce({ FaceDetails: [] });

      const result = await imageModeration.screenImage(
        Buffer.from('fake-image-data')
      );

      expect(result.approved).toBe(false);
      expect(result.hasMinor).toBe(true);
      expect(result.reasons.some(r => r.includes('minor'))).toBe(true);
    });

    it('should reject when face detected with estimated age under 18', async () => {
      mockSend
        .mockResolvedValueOnce({ CelebrityFaces: [] })
        .mockResolvedValueOnce({ ModerationLabels: [] })
        .mockResolvedValueOnce({
          FaceDetails: [{
            AgeRange: { Low: 8, High: 14 },
            Confidence: 99
          }]
        });

      const result = await imageModeration.screenImage(
        Buffer.from('fake-image-data')
      );

      expect(result.approved).toBe(false);
      expect(result.hasMinor).toBe(true);
      expect(result.reasons.some(r => r.includes('minor') && r.includes('8-14'))).toBe(true);
    });

    it('should reject when any face is under 18 even if others are adults', async () => {
      mockSend
        .mockResolvedValueOnce({ CelebrityFaces: [] })
        .mockResolvedValueOnce({ ModerationLabels: [] })
        .mockResolvedValueOnce({
          FaceDetails: [
            { AgeRange: { Low: 25, High: 35 }, Confidence: 99 },
            { AgeRange: { Low: 10, High: 16 }, Confidence: 99 }
          ]
        });

      const result = await imageModeration.screenImage(
        Buffer.from('fake-image-data')
      );

      expect(result.approved).toBe(false);
      expect(result.hasMinor).toBe(true);
      expect(result.faceDetails.faceCount).toBe(2);
      expect(result.faceDetails.minorFaces).toHaveLength(1);
    });

    it('should approve when face age range HIGH is 18 or above', async () => {
      mockSend
        .mockResolvedValueOnce({ CelebrityFaces: [] })
        .mockResolvedValueOnce({ ModerationLabels: [] })
        .mockResolvedValueOnce({
          FaceDetails: [{
            AgeRange: { Low: 16, High: 22 },
            Confidence: 99
          }]
        });

      const result = await imageModeration.screenImage(
        Buffer.from('fake-image-data')
      );

      expect(result.approved).toBe(true);
      expect(result.hasMinor).toBe(false);
    });

    it('should handle base64 input with data URL prefix', async () => {
      mockSend
        .mockResolvedValueOnce({ CelebrityFaces: [] })
        .mockResolvedValueOnce({ ModerationLabels: [] })
        .mockResolvedValueOnce({ FaceDetails: [] });

      const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const result = await imageModeration.screenImage(base64Image);

      expect(result.approved).toBe(true);
      expect(mockSend).toHaveBeenCalled();
    });

    it('should handle base64 input without data URL prefix', async () => {
      mockSend
        .mockResolvedValueOnce({ CelebrityFaces: [] })
        .mockResolvedValueOnce({ ModerationLabels: [] })
        .mockResolvedValueOnce({ FaceDetails: [] });

      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const result = await imageModeration.screenImage(base64Image);

      expect(result.approved).toBe(true);
    });

    it('should skip celebrity check when disabled', async () => {
      mockSend
        .mockResolvedValueOnce({ ModerationLabels: [] })
        .mockResolvedValueOnce({ FaceDetails: [] });

      const result = await imageModeration.screenImage(
        Buffer.from('fake-image-data'),
        { checkCelebrities: false }
      );

      expect(result.approved).toBe(true);
      // Should call moderation labels + face detection, not celebrities
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should skip moderation check when disabled', async () => {
      mockSend
        .mockResolvedValueOnce({ CelebrityFaces: [] })
        .mockResolvedValueOnce({ FaceDetails: [] });

      const result = await imageModeration.screenImage(
        Buffer.from('fake-image-data'),
        { checkModeration: false }
      );

      expect(result.approved).toBe(true);
      // Should call celebrities + face detection, not moderation labels
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should use custom confidence thresholds', async () => {
      mockSend
        .mockResolvedValueOnce({
          CelebrityFaces: [{
            Name: 'Celebrity',
            MatchConfidence: 85, // Below custom 95 threshold
            Id: 'celeb-789',
            Urls: []
          }]
        })
        .mockResolvedValueOnce({ ModerationLabels: [] })
        .mockResolvedValueOnce({ FaceDetails: [] });

      const result = await imageModeration.screenImage(
        Buffer.from('fake-image-data'),
        { celebrityConfidenceThreshold: 95 }
      );

      expect(result.approved).toBe(true);
      expect(result.hasCelebrity).toBe(false);
    });

    it('should reject and include error reason on AWS error', async () => {
      mockSend.mockRejectedValue(new Error('AWS Service Unavailable'));

      const result = await imageModeration.screenImage(
        Buffer.from('fake-image-data')
      );

      expect(result.approved).toBe(false);
      expect(result.reasons).toContain('Moderation check failed: AWS Service Unavailable');
    });

    it('should skip moderation when AWS not configured', async () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      jest.resetModules();
      const mod = require('../../services/imageModeration');

      const result = await mod.screenImage(Buffer.from('fake-image-data'));

      expect(result.approved).toBe(true);
      expect(result.skipped).toBe(true);
    });

    it('should detect multiple minor-related labels', () => {
      // Test the internal minor detection logic via full flow
      const minorTerms = ['child', 'minor', 'underage', 'infant', 'baby', 'toddler', 'teen', 'adolescent', 'youth', 'kid'];

      minorTerms.forEach(async (term) => {
        mockSend
          .mockResolvedValueOnce({ CelebrityFaces: [] })
          .mockResolvedValueOnce({
            ModerationLabels: [{
              Name: term.charAt(0).toUpperCase() + term.slice(1),
              ParentName: 'Person',
              Confidence: 80
            }]
          })
          .mockResolvedValueOnce({ FaceDetails: [] });

        const result = await imageModeration.screenImage(Buffer.from('fake'));
        expect(result.hasMinor).toBe(true);
      });
    });
  });

  describe('screenImages', () => {
    it('should return approved for empty array', async () => {
      const result = await imageModeration.screenImages([]);

      expect(result.approved).toBe(true);
      expect(result.failedIndex).toBeNull();
    });

    it('should return approved when all images pass', async () => {
      mockSend
        .mockResolvedValue({ CelebrityFaces: [], ModerationLabels: [], FaceDetails: [] });

      const result = await imageModeration.screenImages([
        Buffer.from('image1'),
        Buffer.from('image2')
      ]);

      expect(result.approved).toBe(true);
    });

    it('should fail fast and return index of failed image', async () => {
      // First image passes
      mockSend
        .mockResolvedValueOnce({ CelebrityFaces: [] })
        .mockResolvedValueOnce({ ModerationLabels: [] })
        .mockResolvedValueOnce({ FaceDetails: [] });

      // Second image fails
      mockSend
        .mockResolvedValueOnce({
          CelebrityFaces: [{
            Name: 'Celebrity',
            MatchConfidence: 95,
            Id: 'celeb',
            Urls: []
          }]
        })
        .mockResolvedValueOnce({ ModerationLabels: [] })
        .mockResolvedValueOnce({ FaceDetails: [{ AgeRange: { Low: 25, High: 35 }, Confidence: 99 }] });

      const result = await imageModeration.screenImages([
        Buffer.from('image1'),
        Buffer.from('image2'),
        Buffer.from('image3') // Should not be checked due to fail fast
      ]);

      expect(result.approved).toBe(false);
      expect(result.failedIndex).toBe(1);
      expect(result.hasCelebrity).toBe(true);
    });

    it('should skip null/empty entries in array', async () => {
      mockSend
        .mockResolvedValue({ CelebrityFaces: [], ModerationLabels: [], FaceDetails: [] });

      const result = await imageModeration.screenImages([
        null,
        Buffer.from('valid-image'),
        undefined,
        ''
      ]);

      expect(result.approved).toBe(true);
      // Only the valid image should be screened
    });

    it('should skip when AWS not configured', async () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      jest.resetModules();
      const mod = require('../../services/imageModeration');

      const result = await mod.screenImages([Buffer.from('image')]);

      expect(result.approved).toBe(true);
      expect(result.skipped).toBe(true);
    });

    it('should handle screening errors gracefully', async () => {
      mockSend.mockRejectedValue(new Error('API Error'));

      const result = await imageModeration.screenImages([
        Buffer.from('image')
      ]);

      expect(result.approved).toBe(false);
      expect(result.failedIndex).toBe(0);
      expect(result.reasons[0]).toContain('API Error');
    });
  });

  describe('screenImageFromUrl', () => {
    it('should fetch and screen image from URL', async () => {
      const nodeFetch = require('node-fetch');
      const mockBuffer = Buffer.from('fetched-image-data');

      nodeFetch.mockResolvedValue({
        ok: true,
        buffer: () => Promise.resolve(mockBuffer)
      });

      mockSend
        .mockResolvedValueOnce({ CelebrityFaces: [] })
        .mockResolvedValueOnce({ ModerationLabels: [] })
        .mockResolvedValueOnce({ FaceDetails: [] });

      const result = await imageModeration.screenImageFromUrl('https://example.com/image.jpg');

      expect(result.approved).toBe(true);
      expect(nodeFetch).toHaveBeenCalledWith('https://example.com/image.jpg');
    });

    it('should return rejection on fetch error', async () => {
      const nodeFetch = require('node-fetch');
      nodeFetch.mockResolvedValue({
        ok: false,
        status: 404
      });

      const result = await imageModeration.screenImageFromUrl('https://example.com/notfound.jpg');

      expect(result.approved).toBe(false);
      expect(result.reasons[0]).toContain('Failed to fetch image');
    });

    it('should handle network errors', async () => {
      const nodeFetch = require('node-fetch');
      nodeFetch.mockRejectedValue(new Error('Network timeout'));

      const result = await imageModeration.screenImageFromUrl('https://example.com/timeout.jpg');

      expect(result.approved).toBe(false);
      expect(result.reasons[0]).toContain('Network timeout');
    });
  });
});
