/**
 * User Images Library API
 * Allows users to upload images, view their library, and appeal moderation decisions
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('./services/supabase');
const { requireAuth } = require('./middleware/auth');
const { logger } = require('./services/logger');
const { screenImage, isEnabled: isModerationEnabled } = require('./services/imageModeration');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.'));
    }
  }
});

// Confidence thresholds for moderation tiers
const MODERATION_THRESHOLDS = {
  CELEBRITY_HARD_FLAG: 95,    // >95% = requires review
  CELEBRITY_SOFT_FLAG: 85,    // 85-95% = auto-approve but log
  MINOR_HARD_FLAG: 75         // Any minor detection above this = requires review
};

// Days until rejected images are auto-deleted
const REJECTED_EXPIRY_DAYS = 7;

/**
 * POST /api/user-images/upload
 * Upload an image to the user's library
 */
router.post('/upload', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const file = req.file;
    const imageId = uuidv4();
    const fileExt = file.originalname.split('.').pop() || 'jpg';
    const storagePath = `${userId}/${imageId}.${fileExt}`;

    // Screen the image if moderation is enabled
    let status = 'auto_approved';
    let moderationFlags = null;
    let celebrityConfidence = null;
    let minorConfidence = null;
    let expiresAt = null;

    if (isModerationEnabled()) {
      try {
        const moderationResult = await screenImage(file.buffer, {
          celebrityConfidenceThreshold: MODERATION_THRESHOLDS.CELEBRITY_SOFT_FLAG,
          moderationConfidenceThreshold: MODERATION_THRESHOLDS.MINOR_HARD_FLAG
        });

        moderationFlags = {
          celebrities: moderationResult.celebrities || [],
          moderationLabels: moderationResult.moderationLabels || [],
          reasons: moderationResult.reasons || []
        };

        // Get highest confidence values
        if (moderationResult.celebrities && moderationResult.celebrities.length > 0) {
          celebrityConfidence = Math.max(...moderationResult.celebrities.map(c => c.confidence));
        }

        // Check for minor-related labels
        const minorLabels = (moderationResult.moderationLabels || []).filter(label => {
          const name = (label.name || '').toLowerCase();
          const parent = (label.parentName || '').toLowerCase();
          return ['child', 'minor', 'underage', 'infant', 'baby', 'toddler', 'teen', 'adolescent', 'youth', 'kid']
            .some(term => name.includes(term) || parent.includes(term));
        });

        if (minorLabels.length > 0) {
          minorConfidence = Math.max(...minorLabels.map(l => l.confidence));
        }

        // Determine status based on confidence tiers
        if (minorConfidence && minorConfidence >= MODERATION_THRESHOLDS.MINOR_HARD_FLAG) {
          // Minor detected - hard flag
          status = 'pending_review';
          logger.warn('Image flagged for minor detection', { userId, imageId, minorConfidence });
        } else if (celebrityConfidence && celebrityConfidence >= MODERATION_THRESHOLDS.CELEBRITY_HARD_FLAG) {
          // High confidence celebrity - hard flag
          status = 'pending_review';
          logger.warn('Image flagged for celebrity detection', { userId, imageId, celebrityConfidence });
        } else if (celebrityConfidence && celebrityConfidence >= MODERATION_THRESHOLDS.CELEBRITY_SOFT_FLAG) {
          // Medium confidence celebrity - auto-approve but log
          status = 'auto_approved';
          logger.info('Image soft-flagged for celebrity (auto-approved)', { userId, imageId, celebrityConfidence });
        } else {
          // No issues
          status = 'auto_approved';
        }

      } catch (moderationError) {
        logger.error('Moderation check failed', { error: moderationError.message, userId, imageId });
        // On moderation error, flag for manual review to be safe
        status = 'pending_review';
        moderationFlags = { error: moderationError.message };
      }
    }

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('user-images')
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (uploadError) {
      logger.error('Storage upload failed', { error: uploadError.message, userId, imageId });
      return res.status(500).json({ error: 'Failed to upload image' });
    }

    // Create database record
    const { data: imageRecord, error: dbError } = await supabase
      .from('user_images')
      .insert({
        id: imageId,
        user_id: userId,
        storage_path: storagePath,
        storage_bucket: 'user-images',
        filename: file.originalname,
        file_size: file.size,
        mime_type: file.mimetype,
        status,
        moderation_flags: moderationFlags,
        celebrity_confidence: celebrityConfidence,
        minor_confidence: minorConfidence,
        expires_at: expiresAt
      })
      .select()
      .single();

    if (dbError) {
      logger.error('Database insert failed', { error: dbError.message, userId, imageId });
      // Try to clean up the uploaded file
      await supabase.storage.from('user-images').remove([storagePath]);
      return res.status(500).json({ error: 'Failed to save image record' });
    }

    // Get signed URL for the image
    const { data: urlData } = await supabase.storage
      .from('user-images')
      .createSignedUrl(storagePath, 3600); // 1 hour expiry

    const response = {
      id: imageRecord.id,
      status: imageRecord.status,
      filename: imageRecord.filename,
      url: urlData?.signedUrl,
      createdAt: imageRecord.created_at
    };

    // Add helpful message based on status
    if (status === 'pending_review') {
      response.message = 'This image has been flagged for review. You can submit an appeal to have it approved.';
      response.canAppeal = true;
      response.moderationReasons = moderationFlags?.reasons || [];
    } else {
      response.message = 'Image uploaded and approved. You can use it in your generations.';
      response.canAppeal = false;
    }

    res.json(response);

  } catch (error) {
    logger.error('Image upload error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: error.message || 'Failed to upload image' });
  }
});

/**
 * GET /api/user-images
 * List user's images with optional status filter
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const { status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('user_images')
      .select('id, filename, storage_path, status, created_at, appeal_submitted_at, celebrity_confidence, minor_confidence', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: images, error, count } = await query;

    if (error) throw error;

    // Get signed URLs for all images
    const imagesWithUrls = await Promise.all(images.map(async (image) => {
      const { data: urlData } = await supabase.storage
        .from('user-images')
        .createSignedUrl(image.storage_path, 3600);

      return {
        ...image,
        url: urlData?.signedUrl,
        canAppeal: image.status === 'pending_review' && !image.appeal_submitted_at,
        canUse: ['auto_approved', 'approved'].includes(image.status)
      };
    }));

    res.json({
      images: imagesWithUrls,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    logger.error('List images error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to list images' });
  }
});

/**
 * GET /api/user-images/:id
 * Get a specific image with full details
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const imageId = req.params.id;

    const { data: image, error } = await supabase
      .from('user_images')
      .select('*')
      .eq('id', imageId)
      .eq('user_id', userId)
      .single();

    if (error || !image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Get signed URL
    const { data: urlData } = await supabase.storage
      .from('user-images')
      .createSignedUrl(image.storage_path, 3600);

    res.json({
      ...image,
      url: urlData?.signedUrl,
      canAppeal: image.status === 'pending_review' && !image.appeal_submitted_at,
      canUse: ['auto_approved', 'approved'].includes(image.status)
    });

  } catch (error) {
    logger.error('Get image error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to get image' });
  }
});

/**
 * POST /api/user-images/:id/appeal
 * Submit an appeal for a flagged image
 */
router.post('/:id/appeal', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const imageId = req.params.id;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ error: 'Please provide a reason for your appeal (at least 10 characters)' });
    }

    if (reason.length > 1000) {
      return res.status(400).json({ error: 'Appeal reason must be less than 1000 characters' });
    }

    // Get the image
    const { data: image, error: fetchError } = await supabase
      .from('user_images')
      .select('status, appeal_submitted_at')
      .eq('id', imageId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    if (image.status !== 'pending_review') {
      return res.status(400).json({ error: 'This image is not pending review' });
    }

    if (image.appeal_submitted_at) {
      return res.status(400).json({ error: 'An appeal has already been submitted for this image' });
    }

    // Submit the appeal
    const { data: updated, error: updateError } = await supabase
      .from('user_images')
      .update({
        appeal_reason: reason.trim(),
        appeal_submitted_at: new Date().toISOString()
      })
      .eq('id', imageId)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) throw updateError;

    logger.info('Appeal submitted', { userId, imageId });

    res.json({
      success: true,
      message: 'Your appeal has been submitted. We will review it within 24-48 hours.',
      image: {
        id: updated.id,
        status: updated.status,
        appealSubmittedAt: updated.appeal_submitted_at
      }
    });

  } catch (error) {
    logger.error('Appeal submission error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to submit appeal' });
  }
});

/**
 * DELETE /api/user-images/:id
 * Delete an image from the library
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const imageId = req.params.id;

    // Get the image first to get storage path
    const { data: image, error: fetchError } = await supabase
      .from('user_images')
      .select('storage_path')
      .eq('id', imageId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Delete from storage
    await supabase.storage
      .from('user-images')
      .remove([image.storage_path]);

    // Delete from database
    const { error: deleteError } = await supabase
      .from('user_images')
      .delete()
      .eq('id', imageId)
      .eq('user_id', userId);

    if (deleteError) throw deleteError;

    logger.info('Image deleted', { userId, imageId });

    res.json({ success: true, message: 'Image deleted' });

  } catch (error) {
    logger.error('Delete image error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

/**
 * GET /api/user-images/:id/data
 * Get the actual image data (base64) for use in generation
 * Only returns data for approved images
 */
router.get('/:id/data', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const imageId = req.params.id;

    // Get the image record
    const { data: image, error: fetchError } = await supabase
      .from('user_images')
      .select('storage_path, status, mime_type')
      .eq('id', imageId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Only allow approved images
    if (!['auto_approved', 'approved'].includes(image.status)) {
      return res.status(403).json({
        error: 'Image not approved',
        status: image.status,
        message: image.status === 'pending_review'
          ? 'This image is pending review. Submit an appeal or wait for approval.'
          : 'This image was rejected and cannot be used.'
      });
    }

    // Download the image from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('user-images')
      .download(image.storage_path);

    if (downloadError || !fileData) {
      return res.status(500).json({ error: 'Failed to retrieve image' });
    }

    // Convert to base64
    const buffer = await fileData.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const dataUrl = `data:${image.mime_type};base64,${base64}`;

    res.json({
      id: imageId,
      dataUrl,
      mimeType: image.mime_type
    });

  } catch (error) {
    logger.error('Get image data error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to get image data' });
  }
});

// =============================================================================
// ADMIN ENDPOINTS
// =============================================================================

// Helper to check if user is admin
async function isAdmin(userId) {
  if (!supabase || !userId) return false;
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  return data?.role === 'admin';
}

/**
 * GET /api/user-images/admin/queue
 * Get the review queue (pending appeals)
 */
router.get('/admin/queue', requireAuth, async (req, res) => {
  try {
    if (!await isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { limit = 50, offset = 0, hasAppeal, flagType } = req.query;

    let query = supabase
      .from('user_images')
      .select(`
        id, user_id, filename, status, moderation_flags,
        celebrity_confidence, minor_confidence,
        appeal_reason, appeal_submitted_at,
        created_at, storage_path
      `, { count: 'exact' })
      .eq('status', 'pending_review')
      .order('appeal_submitted_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    // Filter by whether appeal was submitted
    if (hasAppeal === 'true') {
      query = query.not('appeal_submitted_at', 'is', null);
    } else if (hasAppeal === 'false') {
      query = query.is('appeal_submitted_at', null);
    }

    // Filter by flag type
    if (flagType === 'celebrity') {
      query = query.not('celebrity_confidence', 'is', null);
    } else if (flagType === 'minor') {
      query = query.not('minor_confidence', 'is', null);
    }

    const { data: images, error, count } = await query;

    if (error) throw error;

    // Handle empty results
    if (!images || images.length === 0) {
      return res.json({
        images: [],
        total: 0,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    }

    // Batch fetch user profiles
    const userIds = [...new Set(images.map(img => img.user_id).filter(Boolean))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, display_name')
      .in('id', userIds);

    const profileMap = new Map((profiles || []).map(p => [p.id, p]));

    // Get signed URLs for preview and add user data
    const imagesWithUrls = await Promise.all(images.map(async (image) => {
      const { data: urlData } = await supabase.storage
        .from('user-images')
        .createSignedUrl(image.storage_path, 3600);

      const profile = profileMap.get(image.user_id);

      return {
        ...image,
        url: urlData?.signedUrl,
        user_email: profile?.email || null,
        user_display_name: profile?.display_name || null,
        storage_path: undefined // Don't expose storage path to client
      };
    }));

    res.json({
      images: imagesWithUrls,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    logger.error('Admin queue error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to get review queue' });
  }
});

/**
 * GET /api/user-images/admin/stats
 * Get moderation statistics
 */
router.get('/admin/stats', requireAuth, async (req, res) => {
  try {
    if (!await isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get counts by status
    const { data: images, error } = await supabase
      .from('user_images')
      .select('status, appeal_submitted_at');

    if (error) throw error;

    const stats = {
      total: images.length,
      auto_approved: 0,
      pending_review: 0,
      pending_with_appeal: 0,
      approved: 0,
      rejected: 0
    };

    images.forEach(img => {
      if (stats.hasOwnProperty(img.status)) {
        stats[img.status]++;
      }
      if (img.status === 'pending_review' && img.appeal_submitted_at) {
        stats.pending_with_appeal++;
      }
    });

    res.json({ stats });

  } catch (error) {
    logger.error('Admin stats error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

/**
 * GET /api/user-images/admin/:id
 * Get full details of an image for review
 */
router.get('/admin/:id', requireAuth, async (req, res) => {
  try {
    if (!await isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const imageId = req.params.id;

    const { data: image, error } = await supabase
      .from('user_images')
      .select(`
        *,
        user:profiles!user_id(id, email, display_name, created_at),
        reviewer:profiles!reviewed_by(id, email, display_name)
      `)
      .eq('id', imageId)
      .single();

    if (error || !image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Get signed URL
    const { data: urlData } = await supabase.storage
      .from('user-images')
      .createSignedUrl(image.storage_path, 3600);

    res.json({
      ...image,
      url: urlData?.signedUrl
    });

  } catch (error) {
    logger.error('Admin get image error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to get image' });
  }
});

/**
 * POST /api/user-images/admin/:id/review
 * Approve or reject an image
 */
router.post('/admin/:id/review', requireAuth, async (req, res) => {
  try {
    if (!await isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const adminId = req.userId;
    const imageId = req.params.id;
    const { decision, notes } = req.body;

    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be "approved" or "rejected"' });
    }

    // Get the image
    const { data: image, error: fetchError } = await supabase
      .from('user_images')
      .select('status, user_id')
      .eq('id', imageId)
      .single();

    if (fetchError || !image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    if (image.status !== 'pending_review') {
      return res.status(400).json({ error: 'This image is not pending review' });
    }

    // Calculate expiry for rejected images
    let expiresAt = null;
    if (decision === 'rejected') {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + REJECTED_EXPIRY_DAYS);
      expiresAt = expiry.toISOString();
    }

    // Update the image
    const { data: updated, error: updateError } = await supabase
      .from('user_images')
      .update({
        status: decision,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        review_notes: notes || null,
        expires_at: expiresAt
      })
      .eq('id', imageId)
      .select()
      .single();

    if (updateError) throw updateError;

    logger.info('Image review completed', {
      imageId,
      decision,
      adminId,
      userId: image.user_id
    });

    // TODO: Send notification to user (email or in-app)

    res.json({
      success: true,
      message: `Image ${decision}`,
      image: {
        id: updated.id,
        status: updated.status,
        reviewedAt: updated.reviewed_at
      }
    });

  } catch (error) {
    logger.error('Admin review error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to review image' });
  }
});

/**
 * POST /api/user-images/admin/bulk-review
 * Approve or reject multiple images at once
 */
router.post('/admin/bulk-review', requireAuth, async (req, res) => {
  try {
    if (!await isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const adminId = req.userId;
    const { imageIds, decision, notes } = req.body;

    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      return res.status(400).json({ error: 'imageIds must be a non-empty array' });
    }

    if (imageIds.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 images per bulk operation' });
    }

    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be "approved" or "rejected"' });
    }

    // Calculate expiry for rejected images
    let expiresAt = null;
    if (decision === 'rejected') {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + REJECTED_EXPIRY_DAYS);
      expiresAt = expiry.toISOString();
    }

    // Update all images
    const { data: updated, error: updateError } = await supabase
      .from('user_images')
      .update({
        status: decision,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        review_notes: notes || null,
        expires_at: expiresAt
      })
      .in('id', imageIds)
      .eq('status', 'pending_review')
      .select('id');

    if (updateError) throw updateError;

    logger.info('Bulk review completed', {
      decision,
      adminId,
      requested: imageIds.length,
      updated: updated?.length || 0
    });

    res.json({
      success: true,
      message: `${updated?.length || 0} images ${decision}`,
      updatedCount: updated?.length || 0
    });

  } catch (error) {
    logger.error('Admin bulk review error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to bulk review images' });
  }
});

module.exports = router;
