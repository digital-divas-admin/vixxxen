const express = require('express');
const router = express.Router();
const { supabase } = require('./services/supabase');
const { requireAuth } = require('./middleware/auth');
const { logger } = require('./services/logger');

// ===========================================
// GET /api/facelock/:characterId
// Get all face lock images for a character
// ===========================================
router.get('/:characterId', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const { characterId } = req.params;

    if (!characterId) {
      return res.status(400).json({ error: 'Character ID is required' });
    }

    // Fetch all face lock images for this user/character
    const { data, error } = await supabase
      .from('character_facelock')
      .select(`
        id,
        image_id,
        image_url,
        mode,
        position,
        created_at,
        user_images (
          id,
          storage_path,
          storage_bucket,
          status
        )
      `)
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .order('mode')
      .order('position');

    if (error) throw error;

    // Group by mode
    const sfw = [];
    const nsfw = [];

    for (const item of data || []) {
      // Get the image URL
      let imageUrl = item.image_url;

      // If using user_images, get the signed URL
      if (item.user_images && item.user_images.storage_path) {
        const { data: signedData } = await supabase.storage
          .from(item.user_images.storage_bucket || 'user-images')
          .createSignedUrl(item.user_images.storage_path, 3600); // 1 hour

        if (signedData?.signedUrl) {
          imageUrl = signedData.signedUrl;
        }
      }

      const entry = {
        id: item.id,
        imageId: item.image_id,
        imageUrl,
        position: item.position,
        createdAt: item.created_at
      };

      if (item.mode === 'sfw') {
        sfw.push(entry);
      } else {
        nsfw.push(entry);
      }
    }

    res.json({
      characterId,
      sfw,
      nsfw
    });

  } catch (error) {
    logger.error('Error fetching face lock', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to fetch face lock images' });
  }
});

// ===========================================
// POST /api/facelock/:characterId
// Add an image to face lock
// ===========================================
router.post('/:characterId', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const { characterId } = req.params;
    const { imageId, imageUrl, mode } = req.body;

    // Validation
    if (!characterId) {
      return res.status(400).json({ error: 'Character ID is required' });
    }

    if (!imageId && !imageUrl) {
      return res.status(400).json({ error: 'Either imageId or imageUrl is required' });
    }

    if (!mode || !['sfw', 'nsfw'].includes(mode)) {
      return res.status(400).json({ error: 'Mode must be "sfw" or "nsfw"' });
    }

    // Check current count for this mode
    const { count, error: countError } = await supabase
      .from('character_facelock')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .eq('mode', mode);

    if (countError) throw countError;

    if (count >= 5) {
      return res.status(400).json({
        error: 'Face lock set is full',
        message: `You already have 5 ${mode.toUpperCase()} face lock images. Remove one to add another.`,
        count: count
      });
    }

    // Get next position
    const nextPosition = count + 1;

    // If using imageId, verify it belongs to this user and is approved
    if (imageId) {
      const { data: imageData, error: imageError } = await supabase
        .from('user_images')
        .select('id, status')
        .eq('id', imageId)
        .eq('user_id', userId)
        .single();

      if (imageError || !imageData) {
        return res.status(404).json({ error: 'Image not found or not accessible' });
      }

      if (imageData.status === 'rejected') {
        return res.status(400).json({ error: 'Cannot use rejected images in face lock' });
      }
    }

    // Check if this image is already in face lock for this character/mode
    const existingQuery = supabase
      .from('character_facelock')
      .select('id')
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .eq('mode', mode);

    if (imageId) {
      existingQuery.eq('image_id', imageId);
    } else {
      existingQuery.eq('image_url', imageUrl);
    }

    const { data: existing, error: existingError } = await existingQuery.maybeSingle();

    if (existingError) {
      logger.error('Error checking for existing facelock', { error: existingError.message, requestId: req.id });
      throw existingError;
    }

    if (existing) {
      return res.status(400).json({
        error: 'Image already in face lock',
        message: `This image is already in your ${mode.toUpperCase()} face lock set.`
      });
    }

    // Insert the new face lock entry
    const { data, error } = await supabase
      .from('character_facelock')
      .insert({
        user_id: userId,
        character_id: characterId,
        image_id: imageId || null,
        image_url: imageId ? null : imageUrl,
        mode,
        position: nextPosition
      })
      .select()
      .single();

    if (error) throw error;

    logger.info('Face lock image added', {
      userId,
      characterId,
      mode,
      position: nextPosition,
      requestId: req.id
    });

    res.json({
      success: true,
      facelock: data,
      count: nextPosition,
      message: `Added to ${mode.toUpperCase()} Face Lock (${nextPosition}/5)`
    });

  } catch (error) {
    logger.error('Error adding face lock image', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to add face lock image' });
  }
});

// ===========================================
// DELETE /api/facelock/:characterId/:facelockId
// Remove an image from face lock
// ===========================================
router.delete('/:characterId/:facelockId', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const { characterId, facelockId } = req.params;

    // Delete the face lock entry (RLS will ensure ownership)
    const { data, error } = await supabase
      .from('character_facelock')
      .delete()
      .eq('id', facelockId)
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Face lock entry not found' });
      }
      throw error;
    }

    logger.info('Face lock image removed', {
      userId,
      characterId,
      facelockId,
      mode: data.mode,
      requestId: req.id
    });

    res.json({
      success: true,
      message: 'Removed from Face Lock',
      removed: data
    });

  } catch (error) {
    logger.error('Error removing face lock image', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to remove face lock image' });
  }
});

// ===========================================
// PUT /api/facelock/:characterId/reorder
// Reorder face lock images
// ===========================================
router.put('/:characterId/reorder', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const { characterId } = req.params;
    const { mode, order } = req.body; // order is array of facelock IDs in desired order

    if (!mode || !['sfw', 'nsfw'].includes(mode)) {
      return res.status(400).json({ error: 'Mode must be "sfw" or "nsfw"' });
    }

    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({ error: 'Order must be a non-empty array of IDs' });
    }

    if (order.length > 5) {
      return res.status(400).json({ error: 'Cannot have more than 5 images' });
    }

    // Update positions
    const updates = order.map((id, index) => ({
      id,
      position: index + 1
    }));

    // Use a transaction-like approach with multiple updates
    for (const update of updates) {
      const { error } = await supabase
        .from('character_facelock')
        .update({ position: update.position })
        .eq('id', update.id)
        .eq('user_id', userId)
        .eq('character_id', characterId)
        .eq('mode', mode);

      if (error) throw error;
    }

    logger.info('Face lock reordered', {
      userId,
      characterId,
      mode,
      newOrder: order,
      requestId: req.id
    });

    res.json({
      success: true,
      message: 'Face lock order updated'
    });

  } catch (error) {
    logger.error('Error reordering face lock', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to reorder face lock' });
  }
});

// ===========================================
// GET /api/facelock/:characterId/images
// Get face lock images ready for generation (resolved URLs/base64)
// Used by frontend before sending to generation endpoint
// ===========================================
router.get('/:characterId/images', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const { characterId } = req.params;
    const { mode } = req.query;

    if (!mode || !['sfw', 'nsfw'].includes(mode)) {
      return res.status(400).json({ error: 'Mode query param must be "sfw" or "nsfw"' });
    }

    // Fetch face lock images for this mode
    const { data, error } = await supabase
      .from('character_facelock')
      .select(`
        id,
        image_id,
        image_url,
        position,
        user_images (
          id,
          storage_path,
          storage_bucket
        )
      `)
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .eq('mode', mode)
      .order('position');

    if (error) throw error;

    // Resolve image URLs
    const images = [];
    for (const item of data || []) {
      let imageUrl = item.image_url;

      if (item.user_images && item.user_images.storage_path) {
        const { data: signedData } = await supabase.storage
          .from(item.user_images.storage_bucket || 'user-images')
          .createSignedUrl(item.user_images.storage_path, 3600);

        if (signedData?.signedUrl) {
          imageUrl = signedData.signedUrl;
        }
      }

      if (imageUrl) {
        images.push({
          id: item.id,
          imageId: item.image_id,
          url: imageUrl,
          position: item.position
        });
      }
    }

    res.json({
      characterId,
      mode,
      images,
      count: images.length
    });

  } catch (error) {
    logger.error('Error fetching face lock images for generation', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to fetch face lock images' });
  }
});

module.exports = router;
