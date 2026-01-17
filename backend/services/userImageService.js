/**
 * User Image Service
 * Helper functions for working with user image library in generation endpoints
 */

const { supabase } = require('./supabase');
const { logger } = require('./logger');

/**
 * Resolve library image IDs to base64 data URLs
 * Only returns data for approved images
 *
 * @param {string[]} imageIds - Array of image UUIDs from user's library
 * @param {string} userId - The user's ID
 * @returns {Promise<{success: boolean, images?: string[], error?: string, failedIds?: string[]}>}
 */
async function resolveLibraryImages(imageIds, userId) {
  if (!supabase) {
    return { success: false, error: 'Database not configured' };
  }

  if (!imageIds || imageIds.length === 0) {
    return { success: true, images: [] };
  }

  // Validate UUIDs
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const invalidIds = imageIds.filter(id => !uuidRegex.test(id));
  if (invalidIds.length > 0) {
    return { success: false, error: `Invalid image IDs: ${invalidIds.join(', ')}` };
  }

  try {
    // Get image records
    const { data: images, error: fetchError } = await supabase
      .from('user_images')
      .select('id, storage_path, status, mime_type')
      .in('id', imageIds)
      .eq('user_id', userId);

    if (fetchError) {
      logger.error('Failed to fetch library images', { error: fetchError.message, userId });
      return { success: false, error: 'Failed to fetch images from library' };
    }

    // Check for missing images
    const foundIds = images.map(img => img.id);
    const missingIds = imageIds.filter(id => !foundIds.includes(id));
    if (missingIds.length > 0) {
      return {
        success: false,
        error: `Images not found in your library: ${missingIds.join(', ')}`,
        failedIds: missingIds
      };
    }

    // Check for unapproved images
    const unapprovedImages = images.filter(img => !['auto_approved', 'approved'].includes(img.status));
    if (unapprovedImages.length > 0) {
      const reasons = unapprovedImages.map(img => {
        if (img.status === 'pending_review') {
          return `${img.id} (pending review - submit an appeal or wait for approval)`;
        } else if (img.status === 'rejected') {
          return `${img.id} (rejected)`;
        }
        return `${img.id} (${img.status})`;
      });

      return {
        success: false,
        error: 'Some images are not approved for use',
        failedIds: unapprovedImages.map(img => img.id),
        reasons
      };
    }

    // Download and convert all images to base64
    const base64Images = await Promise.all(images.map(async (image) => {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('user-images')
        .download(image.storage_path);

      if (downloadError || !fileData) {
        throw new Error(`Failed to download image ${image.id}`);
      }

      const buffer = await fileData.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      return `data:${image.mime_type};base64,${base64}`;
    }));

    // Maintain order matching input imageIds
    const orderedImages = imageIds.map(id => {
      const index = foundIds.indexOf(id);
      return base64Images[index];
    });

    return { success: true, images: orderedImages };

  } catch (error) {
    logger.error('Error resolving library images', { error: error.message, userId });
    return { success: false, error: error.message };
  }
}

/**
 * Check if a value looks like a library image ID (UUID) vs raw base64
 * @param {string} value
 * @returns {boolean}
 */
function isLibraryImageId(value) {
  if (!value || typeof value !== 'string') return false;
  // UUIDs are 36 chars, base64 images are much longer
  if (value.length !== 36) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Process a mixed array of library IDs and raw base64 images
 * Returns all as base64 data URLs
 *
 * @param {string[]} images - Mixed array of library IDs and base64 images
 * @param {string} userId - User ID for library lookups
 * @returns {Promise<{success: boolean, images?: string[], error?: string}>}
 */
async function processImageInputs(images, userId) {
  if (!images || images.length === 0) {
    return { success: true, images: [] };
  }

  const libraryIds = [];
  const rawImages = [];
  const indexMap = []; // Track which position each image came from

  // Separate library IDs from raw images
  images.forEach((img, index) => {
    if (isLibraryImageId(img)) {
      libraryIds.push(img);
      indexMap.push({ type: 'library', id: img, originalIndex: index });
    } else {
      rawImages.push(img);
      indexMap.push({ type: 'raw', data: img, originalIndex: index });
    }
  });

  // Resolve library images if any
  let resolvedLibraryImages = {};
  if (libraryIds.length > 0) {
    const result = await resolveLibraryImages(libraryIds, userId);
    if (!result.success) {
      return result;
    }
    // Map IDs to resolved images
    libraryIds.forEach((id, i) => {
      resolvedLibraryImages[id] = result.images[i];
    });
  }

  // Reconstruct in original order
  const processedImages = indexMap.map(item => {
    if (item.type === 'library') {
      return resolvedLibraryImages[item.id];
    }
    return item.data;
  });

  return { success: true, images: processedImages };
}

module.exports = {
  resolveLibraryImages,
  isLibraryImageId,
  processImageInputs
};
