/**
 * User Image Service Tests
 */

// Mock dependencies before importing
const mockSupabase = {
  from: jest.fn(),
  storage: {
    from: jest.fn()
  }
};

jest.mock('../../services/supabase', () => ({
  supabase: mockSupabase
}));

jest.mock('../../services/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

jest.mock('../../services/imageModeration', () => ({
  screenImage: jest.fn(),
  isEnabled: jest.fn()
}));

const {
  resolveLibraryImages,
  isLibraryImageId,
  processImageInputs,
  saveToLibrary,
  screenAndSaveImages
} = require('../../services/userImageService');

const { screenImage, isEnabled } = require('../../services/imageModeration');

describe('User Image Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isLibraryImageId', () => {
    it('should return true for valid UUIDs', () => {
      expect(isLibraryImageId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isLibraryImageId('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
    });

    it('should return false for invalid UUIDs', () => {
      expect(isLibraryImageId('not-a-uuid')).toBe(false);
      expect(isLibraryImageId('12345')).toBe(false);
      expect(isLibraryImageId('')).toBe(false);
      expect(isLibraryImageId(null)).toBe(false);
      expect(isLibraryImageId(undefined)).toBe(false);
    });

    it('should return false for base64 images', () => {
      const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      expect(isLibraryImageId(base64Image)).toBe(false);
    });

    it('should return false for UUIDs with wrong length', () => {
      expect(isLibraryImageId('550e8400-e29b-41d4-a716-44665544000')).toBe(false); // Too short
      expect(isLibraryImageId('550e8400-e29b-41d4-a716-4466554400001')).toBe(false); // Too long
    });
  });

  describe('resolveLibraryImages', () => {
    it('should return empty array for empty input', async () => {
      const result = await resolveLibraryImages([], 'user-123');
      expect(result.success).toBe(true);
      expect(result.images).toEqual([]);
    });

    it('should return error for invalid UUIDs', async () => {
      const result = await resolveLibraryImages(['invalid-id'], 'user-123');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid image IDs');
    });

    it('should return error when images not found', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: [], error: null })
          })
        })
      });

      const result = await resolveLibraryImages(
        ['550e8400-e29b-41d4-a716-446655440000'],
        'user-123'
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('Images not found');
    });

    it('should return error for unapproved images', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [{
                id: '550e8400-e29b-41d4-a716-446655440000',
                storage_path: 'user-123/image.png',
                status: 'pending_review',
                mime_type: 'image/png'
              }],
              error: null
            })
          })
        })
      });

      const result = await resolveLibraryImages(
        ['550e8400-e29b-41d4-a716-446655440000'],
        'user-123'
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('not approved');
    });

    it('should resolve approved images to base64', async () => {
      const mockImageData = Buffer.from('fake-image-data');

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [{
                id: '550e8400-e29b-41d4-a716-446655440000',
                storage_path: 'user-123/image.png',
                status: 'auto_approved',
                mime_type: 'image/png'
              }],
              error: null
            })
          })
        })
      });

      mockSupabase.storage.from.mockReturnValue({
        download: jest.fn().mockResolvedValue({
          data: {
            arrayBuffer: () => Promise.resolve(mockImageData.buffer)
          },
          error: null
        })
      });

      const result = await resolveLibraryImages(
        ['550e8400-e29b-41d4-a716-446655440000'],
        'user-123'
      );

      expect(result.success).toBe(true);
      expect(result.images).toHaveLength(1);
      expect(result.images[0]).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('processImageInputs', () => {
    it('should return empty array for empty input', async () => {
      const result = await processImageInputs([], 'user-123');
      expect(result.success).toBe(true);
      expect(result.images).toEqual([]);
    });

    it('should pass through raw base64 images', async () => {
      const base64Image = 'data:image/png;base64,abc123';
      const result = await processImageInputs([base64Image], 'user-123');
      expect(result.success).toBe(true);
      expect(result.images).toEqual([base64Image]);
    });

    it('should resolve library IDs while preserving raw images', async () => {
      const base64Image = 'data:image/png;base64,rawimage';
      const libraryId = '550e8400-e29b-41d4-a716-446655440000';
      const mockImageData = Buffer.from('library-image-data');

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [{
                id: libraryId,
                storage_path: 'user-123/image.png',
                status: 'approved',
                mime_type: 'image/png'
              }],
              error: null
            })
          })
        })
      });

      mockSupabase.storage.from.mockReturnValue({
        download: jest.fn().mockResolvedValue({
          data: {
            arrayBuffer: () => Promise.resolve(mockImageData.buffer)
          },
          error: null
        })
      });

      const result = await processImageInputs([base64Image, libraryId], 'user-123');

      expect(result.success).toBe(true);
      expect(result.images).toHaveLength(2);
      expect(result.images[0]).toBe(base64Image); // Raw image unchanged
      expect(result.images[1]).toMatch(/^data:image\/png;base64,/); // Library image resolved
    });
  });

  describe('saveToLibrary', () => {
    it('should return error if no userId', async () => {
      const result = await saveToLibrary('data:image/png;base64,abc', null);
      expect(result.success).toBe(false);
      expect(result.error).toBe('User ID required');
    });

    it('should save image with auto_approved status when no moderation issues', async () => {
      const mockImageId = '550e8400-e29b-41d4-a716-446655440000';

      mockSupabase.storage.from.mockReturnValue({
        upload: jest.fn().mockResolvedValue({ error: null })
      });

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: mockImageId, status: 'auto_approved' },
              error: null
            })
          })
        })
      });

      const result = await saveToLibrary('data:image/png;base64,abc123', 'user-123');

      expect(result.success).toBe(true);
      expect(result.imageId).toBe(mockImageId);
      expect(result.status).toBe('auto_approved');
    });

    it('should save with pending_review when celebrity detected above hard threshold', async () => {
      const mockImageId = '550e8400-e29b-41d4-a716-446655440000';

      mockSupabase.storage.from.mockReturnValue({
        upload: jest.fn().mockResolvedValue({ error: null })
      });

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: mockImageId, status: 'pending_review' },
              error: null
            })
          })
        })
      });

      const moderationResult = {
        celebrities: [{ name: 'Famous Person', confidence: 98 }],
        moderationLabels: []
      };

      const result = await saveToLibrary('data:image/png;base64,abc123', 'user-123', moderationResult);

      expect(result.success).toBe(true);
      expect(result.needsReview).toBe(true);
    });

    it('should save with pending_review when minor detected', async () => {
      const mockImageId = '550e8400-e29b-41d4-a716-446655440000';

      mockSupabase.storage.from.mockReturnValue({
        upload: jest.fn().mockResolvedValue({ error: null })
      });

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: mockImageId, status: 'pending_review' },
              error: null
            })
          })
        })
      });

      const moderationResult = {
        celebrities: [],
        moderationLabels: [{ name: 'Child', parentName: 'Person', confidence: 80 }]
      };

      const result = await saveToLibrary('data:image/png;base64,abc123', 'user-123', moderationResult);

      expect(result.success).toBe(true);
      expect(result.needsReview).toBe(true);
    });

    it('should cleanup storage on database error', async () => {
      const removeMock = jest.fn().mockResolvedValue({ error: null });

      mockSupabase.storage.from.mockReturnValue({
        upload: jest.fn().mockResolvedValue({ error: null }),
        remove: removeMock
      });

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database error' }
            })
          })
        })
      });

      const result = await saveToLibrary('data:image/png;base64,abc123', 'user-123');

      expect(result.success).toBe(false);
      expect(removeMock).toHaveBeenCalled();
    });
  });

  describe('screenAndSaveImages', () => {
    it('should skip screening when moderation is disabled', async () => {
      isEnabled.mockReturnValue(false);

      const images = ['data:image/png;base64,abc123'];
      const result = await screenAndSaveImages(images, 'user-123');

      expect(result.approved).toBe(true);
      expect(result.skipped).toBe(true);
      expect(screenImage).not.toHaveBeenCalled();
    });

    it('should return approved when all images pass moderation', async () => {
      isEnabled.mockReturnValue(true);
      screenImage.mockResolvedValue({
        approved: true,
        hasCelebrity: false,
        hasMinor: false,
        reasons: [],
        celebrities: [],
        moderationLabels: []
      });

      const images = ['data:image/png;base64,abc123', 'data:image/png;base64,def456'];
      const result = await screenAndSaveImages(images, 'user-123');

      expect(result.approved).toBe(true);
      expect(screenImage).toHaveBeenCalledTimes(2);
    });

    it('should reject and save when image fails moderation', async () => {
      isEnabled.mockReturnValue(true);
      screenImage.mockResolvedValue({
        approved: false,
        hasCelebrity: true,
        hasMinor: false,
        reasons: ['Celebrity detected: Famous Person'],
        celebrities: [{ name: 'Famous Person', confidence: 98 }],
        moderationLabels: []
      });

      const mockImageId = '550e8400-e29b-41d4-a716-446655440000';

      mockSupabase.storage.from.mockReturnValue({
        upload: jest.fn().mockResolvedValue({ error: null })
      });

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: mockImageId, status: 'pending_review' },
              error: null
            })
          })
        })
      });

      const images = ['data:image/png;base64,abc123'];
      const result = await screenAndSaveImages(images, 'user-123');

      expect(result.approved).toBe(false);
      expect(result.savedImageIds).toContain(mockImageId);
      expect(result.reasons).toContain('Celebrity detected: Famous Person');
    });

    it('should identify which image failed in a batch', async () => {
      isEnabled.mockReturnValue(true);

      // First image passes, second fails
      screenImage
        .mockResolvedValueOnce({
          approved: true,
          hasCelebrity: false,
          hasMinor: false,
          reasons: [],
          celebrities: [],
          moderationLabels: []
        })
        .mockResolvedValueOnce({
          approved: false,
          hasCelebrity: false,
          hasMinor: true,
          reasons: ['Content involving minors detected'],
          celebrities: [],
          moderationLabels: [{ name: 'Child', confidence: 85 }]
        });

      const mockImageId = '550e8400-e29b-41d4-a716-446655440000';

      mockSupabase.storage.from.mockReturnValue({
        upload: jest.fn().mockResolvedValue({ error: null })
      });

      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: mockImageId, status: 'pending_review' },
              error: null
            })
          })
        })
      });

      const images = ['data:image/png;base64,good', 'data:image/png;base64,bad'];
      const result = await screenAndSaveImages(images, 'user-123');

      expect(result.approved).toBe(false);
      expect(result.failedIndex).toBe(1); // Second image failed (index 1)
      expect(result.failedCount).toBe(1);
      expect(result.totalCount).toBe(2);
    });

    it('should skip null/empty images in array', async () => {
      isEnabled.mockReturnValue(true);
      screenImage.mockResolvedValue({
        approved: true,
        hasCelebrity: false,
        hasMinor: false,
        reasons: [],
        celebrities: [],
        moderationLabels: []
      });

      const images = [null, 'data:image/png;base64,abc123', '', undefined];
      const result = await screenAndSaveImages(images, 'user-123');

      expect(result.approved).toBe(true);
      expect(screenImage).toHaveBeenCalledTimes(1); // Only called for the valid image
    });
  });
});
