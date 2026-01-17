/**
 * Gallery Routes
 * Fetch and manage saved gallery items
 */

const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');
const { logger } = require('../services/logger');

/**
 * GET /api/gallery
 * Fetch gallery items for the current user
 */
router.get('/', requireAuth, async (req, res) => {
  const { agency, agencyUser } = req;
  const { limit = 50, offset = 0, type } = req.query;

  try {
    let query = supabaseAdmin
      .from('gallery_items')
      .select('*')
      .eq('agency_id', agency.id)
      .eq('user_id', agencyUser.id)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (type) {
      query = query.eq('type', type);
    }

    const { data: items, error } = await query;

    if (error) {
      logger.error('Error fetching gallery items:', error);
      return res.status(500).json({ error: 'Failed to fetch gallery items' });
    }

    // Get total count
    const { count } = await supabaseAdmin
      .from('gallery_items')
      .select('*', { count: 'exact', head: true })
      .eq('agency_id', agency.id)
      .eq('user_id', agencyUser.id);

    res.json({
      items: items || [],
      total: count || 0,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('Error in gallery route:', error);
    res.status(500).json({ error: 'Failed to fetch gallery items' });
  }
});

/**
 * DELETE /api/gallery/:id
 * Delete a gallery item
 */
router.delete('/:id', requireAuth, async (req, res) => {
  const { agency, agencyUser } = req;
  const { id } = req.params;

  try {
    const { error } = await supabaseAdmin
      .from('gallery_items')
      .delete()
      .eq('id', id)
      .eq('agency_id', agency.id)
      .eq('user_id', agencyUser.id);

    if (error) {
      logger.error('Error deleting gallery item:', error);
      return res.status(500).json({ error: 'Failed to delete item' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting gallery item:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

/**
 * PUT /api/gallery/:id/favorite
 * Toggle favorite status
 */
router.put('/:id/favorite', requireAuth, async (req, res) => {
  const { agency, agencyUser } = req;
  const { id } = req.params;

  try {
    // Get current status
    const { data: item } = await supabaseAdmin
      .from('gallery_items')
      .select('is_favorited')
      .eq('id', id)
      .eq('agency_id', agency.id)
      .eq('user_id', agencyUser.id)
      .single();

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Toggle
    const { data: updated, error } = await supabaseAdmin
      .from('gallery_items')
      .update({ is_favorited: !item.is_favorited })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating favorite:', error);
      return res.status(500).json({ error: 'Failed to update favorite' });
    }

    res.json({ success: true, item: updated });
  } catch (error) {
    logger.error('Error toggling favorite:', error);
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

/**
 * DELETE /api/gallery
 * Clear all gallery items for the user
 */
router.delete('/', requireAuth, async (req, res) => {
  const { agency, agencyUser } = req;

  try {
    const { error } = await supabaseAdmin
      .from('gallery_items')
      .delete()
      .eq('agency_id', agency.id)
      .eq('user_id', agencyUser.id);

    if (error) {
      logger.error('Error clearing gallery:', error);
      return res.status(500).json({ error: 'Failed to clear gallery' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error clearing gallery:', error);
    res.status(500).json({ error: 'Failed to clear gallery' });
  }
});

module.exports = router;
