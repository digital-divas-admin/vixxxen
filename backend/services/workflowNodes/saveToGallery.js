/**
 * Save to Gallery Node Executor
 * Saves generated images to user's image library
 */

const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../supabase');
const { logger } = require('../logger');

/**
 * Execute a Save to Gallery node
 *
 * @param {Object} config - Node configuration
 * @param {string} config.image_url - Single image URL to save (or use from context)
 * @param {string[]} config.image_urls - Multiple image URLs to save
 * @param {string} config.folder - Optional folder/tag for organization
 * @param {string} userId - User ID executing the workflow
 * @param {Object} context - Workflow context with previous node outputs
 * @returns {Object} { output: { saved_ids, saved_urls }, creditsUsed }
 */
async function executeSaveToGallery(config, userId, context) {
  const {
    image_url,
    image_urls,
    folder = 'workflow'
  } = config;

  logger.info('Executing Save to Gallery node', { userId, folder });

  // Collect all images to save
  let imagesToSave = [];

  if (image_urls && Array.isArray(image_urls)) {
    imagesToSave = [...image_urls];
  } else if (image_url) {
    imagesToSave = [image_url];
  }

  if (imagesToSave.length === 0) {
    throw new Error('No images provided to save');
  }

  const savedIds = [];
  const savedUrls = [];

  for (const imgUrl of imagesToSave) {
    try {
      // Download the image
      let imageBuffer;
      let contentType = 'image/png';

      if (imgUrl.startsWith('data:')) {
        // Base64 data URL
        const matches = imgUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          contentType = matches[1];
          imageBuffer = Buffer.from(matches[2], 'base64');
        } else {
          throw new Error('Invalid data URL format');
        }
      } else {
        // HTTP URL - download it
        const response = await fetch(imgUrl);
        if (!response.ok) {
          throw new Error(`Failed to download image: ${response.status}`);
        }
        contentType = response.headers.get('content-type') || 'image/png';
        imageBuffer = Buffer.from(await response.arrayBuffer());
      }

      // Generate unique filename
      const imageId = uuidv4();
      const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' :
                  contentType.includes('webp') ? 'webp' :
                  contentType.includes('gif') ? 'gif' : 'png';
      const storagePath = `${userId}/${folder}/${imageId}.${ext}`;

      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('user-images')
        .upload(storagePath, imageBuffer, {
          contentType,
          upsert: false
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Create database record
      const { data: imageRecord, error: dbError } = await supabase
        .from('user_images')
        .insert({
          id: imageId,
          user_id: userId,
          storage_path: storagePath,
          storage_bucket: 'user-images',
          filename: `${folder}_${imageId}.${ext}`,
          file_size: imageBuffer.length,
          mime_type: contentType,
          status: 'auto_approved' // Workflow-generated images are pre-approved
        })
        .select()
        .single();

      if (dbError) {
        // Clean up uploaded file
        await supabase.storage.from('user-images').remove([storagePath]);
        throw new Error(`Database insert failed: ${dbError.message}`);
      }

      // Get signed URL for the saved image
      const { data: signedData } = await supabase.storage
        .from('user-images')
        .createSignedUrl(storagePath, 3600 * 24 * 7); // 7 days

      savedIds.push(imageId);
      savedUrls.push(signedData?.signedUrl || imgUrl);

      logger.info('Image saved to gallery', { imageId, storagePath });

    } catch (error) {
      logger.error('Failed to save image', { error: error.message });
      // Continue with other images
    }
  }

  if (savedIds.length === 0) {
    throw new Error('Failed to save any images');
  }

  logger.info('Save to Gallery node completed', {
    savedCount: savedIds.length,
    totalAttempted: imagesToSave.length
  });

  return {
    output: {
      saved_ids: savedIds,
      saved_urls: savedUrls,
      saved_count: savedIds.length
    },
    creditsUsed: 0 // Saving is free
  };
}

module.exports = { executeSaveToGallery };
