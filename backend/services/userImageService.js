/**
 * User Image Service
 * Helper functions for working with user image library in generation endpoints
 */

const { supabase } = require('./supabase');
const { logger } = require('./logger');
const crypto = require('crypto');

// Moderation thresholds - same as user-images.js
const MODERATION_THRESHOLDS = {
  CELEBRITY_HARD_FLAG: 95,
  CELEBRITY_SOFT_FLAG: 85,
  MINOR_HARD_FLAG: 75
};

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
 * Check if a value looks like a URL
 * @param {string} value
 * @returns {boolean}
 */
function isUrl(value) {
  if (!value || typeof value !== 'string') return false;
  return value.startsWith('http://') || value.startsWith('https://');
}

/**
 * Fetch a URL and convert it to a base64 data URL
 * @param {string} url
 * @returns {Promise<{success: boolean, dataUrl?: string, error?: string}>}
 */
async function fetchUrlToBase64(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, error: `Failed to fetch URL: ${response.status}` };
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // Validate it's an image
    if (!contentType.startsWith('image/')) {
      return { success: false, error: `URL is not an image: ${contentType}` };
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;

    return { success: true, dataUrl };
  } catch (error) {
    logger.error('Error fetching URL to base64', { url: url.substring(0, 100), error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Process a mixed array of library IDs, URLs, and raw base64 images
 * Returns all as base64 data URLs
 *
 * @param {string[]} images - Mixed array of library IDs, URLs, and base64 images
 * @param {string} userId - User ID for library lookups
 * @returns {Promise<{success: boolean, images?: string[], error?: string}>}
 */
async function processImageInputs(images, userId) {
  if (!images || images.length === 0) {
    return { success: true, images: [] };
  }

  const libraryIds = [];
  const urls = [];
  const indexMap = []; // Track which position each image came from

  // Separate library IDs, URLs, and raw base64 images
  images.forEach((img, index) => {
    if (isLibraryImageId(img)) {
      libraryIds.push(img);
      indexMap.push({ type: 'library', id: img, originalIndex: index });
    } else if (isUrl(img)) {
      urls.push({ url: img, index });
      indexMap.push({ type: 'url', url: img, originalIndex: index });
    } else {
      // Raw base64 data URL
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

  // Fetch URLs and convert to base64
  let resolvedUrls = {};
  if (urls.length > 0) {
    logger.info('Fetching URLs for image processing', { count: urls.length });
    for (const { url, index } of urls) {
      const result = await fetchUrlToBase64(url);
      if (!result.success) {
        logger.warn('Failed to fetch URL', { url: url.substring(0, 100), error: result.error });
        return { success: false, error: `Failed to fetch image URL: ${result.error}` };
      }
      resolvedUrls[url] = result.dataUrl;
    }
  }

  // Reconstruct in original order
  const processedImages = indexMap.map(item => {
    if (item.type === 'library') {
      return resolvedLibraryImages[item.id];
    }
    if (item.type === 'url') {
      return resolvedUrls[item.url];
    }
    return item.data;
  });

  return { success: true, images: processedImages };
}

/**
 * Save an image to the user's library with moderation result
 * Used when an image is rejected during generation - saves it for appeal
 *
 * @param {string} base64Image - The image as base64 (with or without data URL prefix)
 * @param {string} userId - User ID
 * @param {Object} moderationResult - Result from screenImage
 * @returns {Promise<{success: boolean, imageId?: string, error?: string}>}
 */
async function saveToLibrary(base64Image, userId, moderationResult = null) {
  if (!supabase) {
    return { success: false, error: 'Database not configured' };
  }

  if (!userId) {
    return { success: false, error: 'User ID required' };
  }

  try {
    // Parse base64 and determine mime type
    let base64Data = base64Image;
    let mimeType = 'image/png';

    if (base64Image.startsWith('data:')) {
      const matches = base64Image.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        base64Data = matches[2];
      }
    }

    // Convert to buffer
    const buffer = Buffer.from(base64Data, 'base64');
    const fileSize = buffer.length;

    // Generate unique filename
    const ext = mimeType.split('/')[1] || 'png';
    const filename = `${crypto.randomUUID()}.${ext}`;
    const storagePath = `${userId}/${filename}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('user-images')
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false
      });

    if (uploadError) {
      logger.error('Failed to upload image to storage', { error: uploadError.message, userId });
      return { success: false, error: 'Failed to upload image' };
    }

    // Determine status based on moderation result
    let status = 'auto_approved';
    let celebrityConfidence = null;
    let minorConfidence = null;
    let moderationFlags = null;

    if (moderationResult) {
      // Extract confidence scores
      if (moderationResult.celebrities && moderationResult.celebrities.length > 0) {
        celebrityConfidence = Math.max(...moderationResult.celebrities.map(c => c.confidence));
      }

      // Look for minor-related labels
      if (moderationResult.moderationLabels) {
        const minorLabels = moderationResult.moderationLabels.filter(l =>
          isMinorRelatedLabel(l.name, l.parentName)
        );
        if (minorLabels.length > 0) {
          minorConfidence = Math.max(...minorLabels.map(l => l.confidence));
        }
      }

      moderationFlags = {
        celebrities: moderationResult.celebrities || [],
        labels: moderationResult.moderationLabels || [],
        reasons: moderationResult.reasons || []
      };

      // If moderation rejected the image, ALWAYS set to pending_review
      // This ensures rejected images can't be used until manually approved
      if (moderationResult.approved === false) {
        status = 'pending_review';
      } else if (celebrityConfidence >= MODERATION_THRESHOLDS.CELEBRITY_SOFT_FLAG) {
        // Soft flag passed moderation but log it
        logger.info('Image soft-flagged but passed moderation', {
          celebrityConfidence,
          userId
        });
      }
    }

    // Create database record
    const { data: imageRecord, error: insertError } = await supabase
      .from('user_images')
      .insert({
        user_id: userId,
        storage_path: storagePath,
        storage_bucket: 'user-images',
        filename,
        file_size: fileSize,
        mime_type: mimeType,
        status,
        moderation_flags: moderationFlags,
        celebrity_confidence: celebrityConfidence,
        minor_confidence: minorConfidence
      })
      .select('id, status')
      .single();

    if (insertError) {
      logger.error('Failed to create image record', { error: insertError.message, userId });
      // Clean up uploaded file
      await supabase.storage.from('user-images').remove([storagePath]);
      return { success: false, error: 'Failed to save image record' };
    }

    logger.info('Image saved to library', {
      imageId: imageRecord.id,
      status: imageRecord.status,
      userId
    });

    return {
      success: true,
      imageId: imageRecord.id,
      status: imageRecord.status,
      needsReview: status === 'pending_review'
    };

  } catch (error) {
    logger.error('Error saving to library', { error: error.message, userId });
    return { success: false, error: error.message };
  }
}

/**
 * Check if a label indicates content involving minors
 */
function isMinorRelatedLabel(name, parentName) {
  const minorIndicators = [
    'child', 'minor', 'underage', 'infant', 'baby',
    'toddler', 'teen', 'adolescent', 'youth', 'kid', 'pediatric'
  ];

  const lowerName = (name || '').toLowerCase();
  const lowerParent = (parentName || '').toLowerCase();

  return minorIndicators.some(indicator =>
    lowerName.includes(indicator) || lowerParent.includes(indicator)
  );
}

/**
 * Screen images and auto-save rejected ones to library
 * Returns detailed info about which images passed/failed
 *
 * @param {string[]} images - Array of base64 images
 * @param {string} userId - User ID (required for saving to library)
 * @param {Object} options - Screening options
 * @returns {Promise<Object>}
 */
async function screenAndSaveImages(images, userId, options = {}) {
  const { screenImages, isEnabled } = require('./imageModeration');

  // Fail-closed: if moderation is not enabled, block uploads for safety
  if (!isEnabled()) {
    logger.error('Moderation not enabled - blocking uploads for safety');
    return {
      approved: false,
      serviceUnavailable: true,
      reasons: ['Image moderation service is temporarily unavailable. Please try again later.'],
      failedIndex: 0,
      failedCount: images?.length || 0,
      totalCount: images?.length || 0
    };
  }

  if (!images || images.length === 0) {
    return { approved: true, images: [] };
  }

  const results = [];
  const savedImages = [];
  let allApproved = true;
  let firstFailedIndex = null;
  let serviceUnavailable = false;

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    if (!image) {
      results.push({ index: i, approved: true, skipped: true });
      continue;
    }

    // Screen this image
    const { screenImage } = require('./imageModeration');
    const moderationResult = await screenImage(image, options);

    if (moderationResult.approved) {
      results.push({
        index: i,
        approved: true,
        moderationResult
      });
    } else {
      allApproved = false;
      if (firstFailedIndex === null) firstFailedIndex = i;

      // Track if this is a service unavailability vs content rejection
      if (moderationResult.serviceUnavailable) {
        serviceUnavailable = true;
      }

      // Only save to library for appeal if it's a CONTENT issue (not service unavailability)
      // Service unavailability shouldn't create pending appeals
      let savedInfo = null;
      if (userId && !moderationResult.serviceUnavailable) {
        const saveResult = await saveToLibrary(image, userId, moderationResult);
        if (saveResult.success) {
          savedInfo = {
            imageId: saveResult.imageId,
            status: saveResult.status
          };
          savedImages.push(saveResult.imageId);
        }
      }

      results.push({
        index: i,
        approved: false,
        reasons: moderationResult.reasons,
        hasCelebrity: moderationResult.hasCelebrity,
        hasMinor: moderationResult.hasMinor,
        serviceUnavailable: moderationResult.serviceUnavailable,
        savedToLibrary: savedInfo
      });
    }
  }

  if (allApproved) {
    return { approved: true, images, results };
  }

  // Build helpful error message
  const failedResults = results.filter(r => !r.approved);
  const errorMessages = failedResults.map(r => {
    const imgNum = r.index + 1;
    const reasons = r.reasons.join(', ');
    const savedMsg = r.savedToLibrary
      ? ` (saved to library as ${r.savedToLibrary.imageId} - you can appeal)`
      : '';
    return `Image ${imgNum}: ${reasons}${savedMsg}`;
  });

  return {
    approved: false,
    failedIndex: firstFailedIndex,
    failedCount: failedResults.length,
    totalCount: images.length,
    results,
    savedImageIds: savedImages,
    errorMessage: errorMessages.join('; '),
    reasons: failedResults.flatMap(r => r.reasons),
    serviceUnavailable
  };
}

module.exports = {
  resolveLibraryImages,
  isLibraryImageId,
  processImageInputs,
  saveToLibrary,
  screenAndSaveImages
};
