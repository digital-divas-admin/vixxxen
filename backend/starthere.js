const express = require('express');
const router = express.Router();
const { supabase } = require('./services/supabase');
const { requireAuth, optionalAuth, requireAdmin } = require('./middleware/auth');
const { logger } = require('./services/logger');

// GET /api/starthere - Get all start here guides with user progress
router.get('/', optionalAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    // Use verified user ID from auth middleware
    const userId = req.userId;

    // Get user's completed guides if authenticated
    let userCompletedGuides = [];
    if (userId) {
      const { data: completions } = await supabase
        .from('starthere_completions')
        .select('guide_id')
        .eq('user_id', userId);

      userCompletedGuides = completions?.map(c => c.guide_id) || [];
    }

    // Get all guides ordered by sort_order
    const { data: guides, error } = await supabase
      .from('starthere_guides')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      logger.error('Error fetching start here guides', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to fetch guides' });
    }

    // Add completion status to each guide
    const processedGuides = guides.map(guide => ({
      id: guide.id,
      title: guide.title,
      description: guide.description,
      icon: guide.icon,
      thumbnail_url: guide.thumbnail_url,
      content_url: guide.content_url,
      content_body: guide.content_body,
      duration: guide.duration,
      sort_order: guide.sort_order,
      is_completed: userCompletedGuides.includes(guide.id)
    }));

    res.json({ guides: processedGuides });

  } catch (error) {
    logger.error('Start here fetch error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/starthere/:id/complete - Mark a guide as complete
router.post('/:id/complete', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;
    // Use verified user ID from auth middleware
    const userId = req.userId;

    // Check if already completed
    const { data: existing } = await supabase
      .from('starthere_completions')
      .select('id')
      .eq('user_id', userId)
      .eq('guide_id', id)
      .single();

    if (existing) {
      return res.json({ success: true, message: 'Already completed' });
    }

    // Insert completion record
    const { error } = await supabase
      .from('starthere_completions')
      .insert({
        user_id: userId,
        guide_id: id
      });

    if (error) {
      logger.error('Error marking guide complete', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to mark guide complete' });
    }

    res.json({ success: true });

  } catch (error) {
    logger.error('Mark complete error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/starthere - Create a new guide (admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    // User is verified admin via requireAdmin middleware

    const { title, description, icon, thumbnail_url, content_url, content_body, duration, sort_order } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const { data: guide, error } = await supabase
      .from('starthere_guides')
      .insert({
        title,
        description,
        icon,
        thumbnail_url,
        content_url,
        content_body,
        duration,
        sort_order: sort_order || 0
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating guide', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to create guide' });
    }

    res.status(201).json({ guide });

  } catch (error) {
    logger.error('Create guide error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/starthere/:id - Update a guide (admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;
    // User is verified admin via requireAdmin middleware

    const { title, description, icon, thumbnail_url, content_url, content_body, duration, sort_order } = req.body;

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (icon !== undefined) updateData.icon = icon;
    if (thumbnail_url !== undefined) updateData.thumbnail_url = thumbnail_url;
    if (content_url !== undefined) updateData.content_url = content_url;
    if (content_body !== undefined) updateData.content_body = content_body;
    if (duration !== undefined) updateData.duration = duration;
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    updateData.updated_at = new Date().toISOString();

    const { data: guide, error } = await supabase
      .from('starthere_guides')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating guide', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to update guide' });
    }

    res.json({ guide });

  } catch (error) {
    logger.error('Update guide error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/starthere/:id - Delete a guide (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;
    // User is verified admin via requireAdmin middleware

    const { error } = await supabase
      .from('starthere_guides')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Error deleting guide', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to delete guide' });
    }

    res.json({ success: true });

  } catch (error) {
    logger.error('Delete guide error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
