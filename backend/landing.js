const express = require('express');
const router = express.Router();
const { supabase } = require('./services/supabase');
const { requireAdmin } = require('./middleware/auth');
const { logger } = require('./services/logger');

// ===========================================
// PUBLIC ENDPOINTS (no auth required)
// ===========================================

// GET /api/landing - Get all landing page content in one call
router.get('/', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    // Fetch all landing page data in parallel
    const [
      sectionsResult,
      contentResult,
      statsResult,
      charactersResult,
      pipelineResult,
      capabilitiesResult,
      showcaseResult
    ] = await Promise.all([
      supabase.from('landing_sections').select('*').eq('is_visible', true).order('display_order'),
      supabase.from('landing_content').select('*').eq('is_visible', true),
      supabase.from('landing_stats').select('*').eq('is_visible', true).order('display_order'),
      supabase.from('landing_characters').select('*').eq('is_visible', true).order('display_order'),
      supabase.from('landing_pipeline_steps').select('*').eq('is_visible', true).order('display_order'),
      supabase.from('landing_capabilities').select('*').eq('is_visible', true).order('display_order'),
      supabase.from('landing_showcase').select('*').eq('is_visible', true).order('display_order')
    ]);

    // Check for errors
    const errors = [
      sectionsResult.error,
      contentResult.error,
      statsResult.error,
      charactersResult.error,
      pipelineResult.error,
      capabilitiesResult.error,
      showcaseResult.error
    ].filter(Boolean);

    if (errors.length > 0) {
      logger.error('Error fetching landing page data', { errors, requestId: req.id });
      return res.status(500).json({ error: 'Failed to fetch landing page data' });
    }

    // Organize content by section
    const contentBySection = {};
    contentResult.data.forEach(item => {
      if (!contentBySection[item.section_key]) {
        contentBySection[item.section_key] = {};
      }
      contentBySection[item.section_key][item.content_key] = {
        value: item.content_value,
        type: item.content_type,
        metadata: item.metadata
      };
    });

    res.json({
      sections: sectionsResult.data,
      content: contentBySection,
      stats: statsResult.data,
      characters: charactersResult.data,
      pipeline: pipelineResult.data,
      capabilities: capabilitiesResult.data,
      showcase: showcaseResult.data
    });

  } catch (error) {
    logger.error('Landing page fetch error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/landing/sections - Get visible sections
router.get('/sections', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { data, error } = await supabase
      .from('landing_sections')
      .select('*')
      .eq('is_visible', true)
      .order('display_order');

    if (error) {
      logger.error('Error fetching sections', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to fetch sections' });
    }

    res.json({ sections: data });
  } catch (error) {
    logger.error('Sections fetch error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===========================================
// ADMIN ENDPOINTS (auth required)
// ===========================================

// GET /api/landing/admin/all - Get ALL landing page content including hidden (admin only)
router.get('/admin/all', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const [
      sectionsResult,
      contentResult,
      statsResult,
      charactersResult,
      pipelineResult,
      capabilitiesResult,
      showcaseResult
    ] = await Promise.all([
      supabase.from('landing_sections').select('*').order('display_order'),
      supabase.from('landing_content').select('*').order('section_key, display_order'),
      supabase.from('landing_stats').select('*').order('display_order'),
      supabase.from('landing_characters').select('*').order('display_order'),
      supabase.from('landing_pipeline_steps').select('*').order('display_order'),
      supabase.from('landing_capabilities').select('*').order('display_order'),
      supabase.from('landing_showcase').select('*').order('display_order')
    ]);

    const errors = [
      sectionsResult.error,
      contentResult.error,
      statsResult.error,
      charactersResult.error,
      pipelineResult.error,
      capabilitiesResult.error,
      showcaseResult.error
    ].filter(Boolean);

    if (errors.length > 0) {
      logger.error('Error fetching admin landing data', { errors, requestId: req.id });
      return res.status(500).json({ error: 'Failed to fetch landing page data' });
    }

    res.json({
      sections: sectionsResult.data,
      content: contentResult.data,
      stats: statsResult.data,
      characters: charactersResult.data,
      pipeline: pipelineResult.data,
      capabilities: capabilitiesResult.data,
      showcase: showcaseResult.data
    });

  } catch (error) {
    logger.error('Admin landing fetch error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/landing/admin/sections/:id - Update section
router.put('/admin/sections/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;
    const { display_order, is_visible, settings } = req.body;

    const updateData = {};
    if (display_order !== undefined) updateData.display_order = display_order;
    if (is_visible !== undefined) updateData.is_visible = is_visible;
    if (settings !== undefined) updateData.settings = settings;

    const { data, error } = await supabase
      .from('landing_sections')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating section', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to update section' });
    }

    res.json({ section: data });
  } catch (error) {
    logger.error('Section update error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/landing/admin/sections/reorder - Reorder sections
router.put('/admin/sections/reorder', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { order } = req.body; // Array of {id, display_order}

    const updates = order.map(item =>
      supabase
        .from('landing_sections')
        .update({ display_order: item.display_order })
        .eq('id', item.id)
    );

    await Promise.all(updates);

    res.json({ success: true });
  } catch (error) {
    logger.error('Section reorder error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/landing/admin/content/:id - Update content item
router.put('/admin/content/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;
    const { content_value, content_type, metadata, is_visible } = req.body;

    const updateData = {};
    if (content_value !== undefined) updateData.content_value = content_value;
    if (content_type !== undefined) updateData.content_type = content_type;
    if (metadata !== undefined) updateData.metadata = metadata;
    if (is_visible !== undefined) updateData.is_visible = is_visible;

    const { data, error } = await supabase
      .from('landing_content')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating content', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to update content' });
    }

    res.json({ content: data });
  } catch (error) {
    logger.error('Content update error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/landing/admin/content - Create new content item
router.post('/admin/content', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { section_key, content_key, content_value, content_type, metadata, display_order } = req.body;

    const { data, error } = await supabase
      .from('landing_content')
      .insert({
        section_key,
        content_key,
        content_value,
        content_type: content_type || 'text',
        metadata: metadata || {},
        display_order: display_order || 0
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating content', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to create content' });
    }

    res.json({ content: data });
  } catch (error) {
    logger.error('Content create error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/landing/admin/content/:id - Delete content item
router.delete('/admin/content/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;

    const { error } = await supabase
      .from('landing_content')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Error deleting content', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to delete content' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Content delete error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===========================================
// STATS ADMIN ENDPOINTS
// ===========================================

// POST /api/landing/admin/stats - Create stat
router.post('/admin/stats', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { value, label, icon, display_order } = req.body;

    const { data, error } = await supabase
      .from('landing_stats')
      .insert({ value, label, icon: icon || '📊', display_order: display_order || 0 })
      .select()
      .single();

    if (error) {
      logger.error('Error creating stat', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to create stat' });
    }

    res.json({ stat: data });
  } catch (error) {
    logger.error('Stat create error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/landing/admin/stats/:id - Update stat
router.put('/admin/stats/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;
    const { value, label, icon, display_order, is_visible } = req.body;

    const updateData = {};
    if (value !== undefined) updateData.value = value;
    if (label !== undefined) updateData.label = label;
    if (icon !== undefined) updateData.icon = icon;
    if (display_order !== undefined) updateData.display_order = display_order;
    if (is_visible !== undefined) updateData.is_visible = is_visible;

    const { data, error } = await supabase
      .from('landing_stats')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating stat', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to update stat' });
    }

    res.json({ stat: data });
  } catch (error) {
    logger.error('Stat update error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/landing/admin/stats/:id - Delete stat
router.delete('/admin/stats/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;

    const { error } = await supabase
      .from('landing_stats')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Error deleting stat', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to delete stat' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Stat delete error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===========================================
// CHARACTERS ADMIN ENDPOINTS
// ===========================================

// POST /api/landing/admin/characters - Create character
router.post('/admin/characters', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { name, handle, image_url, metrics, cta_text, cta_link, display_order } = req.body;

    const { data, error } = await supabase
      .from('landing_characters')
      .insert({
        name,
        handle,
        image_url,
        metrics: metrics || [],
        cta_text: cta_text || 'See Their Content',
        cta_link,
        display_order: display_order || 0
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating character', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to create character' });
    }

    res.json({ character: data });
  } catch (error) {
    logger.error('Character create error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/landing/admin/characters/:id - Update character
router.put('/admin/characters/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;
    const { name, handle, image_url, metrics, cta_text, cta_link, display_order, is_visible } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (handle !== undefined) updateData.handle = handle;
    if (image_url !== undefined) updateData.image_url = image_url;
    if (metrics !== undefined) updateData.metrics = metrics;
    if (cta_text !== undefined) updateData.cta_text = cta_text;
    if (cta_link !== undefined) updateData.cta_link = cta_link;
    if (display_order !== undefined) updateData.display_order = display_order;
    if (is_visible !== undefined) updateData.is_visible = is_visible;

    const { data, error } = await supabase
      .from('landing_characters')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating character', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to update character' });
    }

    res.json({ character: data });
  } catch (error) {
    logger.error('Character update error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/landing/admin/characters/:id - Delete character
router.delete('/admin/characters/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;

    const { error } = await supabase
      .from('landing_characters')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Error deleting character', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to delete character' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Character delete error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===========================================
// PIPELINE ADMIN ENDPOINTS
// ===========================================

// POST /api/landing/admin/pipeline - Create pipeline step
router.post('/admin/pipeline', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { step_number, title, description, icon, display_order } = req.body;

    const { data, error } = await supabase
      .from('landing_pipeline_steps')
      .insert({
        step_number,
        title,
        description,
        icon: icon || '1️⃣',
        display_order: display_order || 0
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating pipeline step', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to create pipeline step' });
    }

    res.json({ step: data });
  } catch (error) {
    logger.error('Pipeline create error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/landing/admin/pipeline/:id - Update pipeline step
router.put('/admin/pipeline/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;
    const { step_number, title, description, icon, display_order, is_visible } = req.body;

    const updateData = {};
    if (step_number !== undefined) updateData.step_number = step_number;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (icon !== undefined) updateData.icon = icon;
    if (display_order !== undefined) updateData.display_order = display_order;
    if (is_visible !== undefined) updateData.is_visible = is_visible;

    const { data, error } = await supabase
      .from('landing_pipeline_steps')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating pipeline step', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to update pipeline step' });
    }

    res.json({ step: data });
  } catch (error) {
    logger.error('Pipeline update error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/landing/admin/pipeline/:id - Delete pipeline step
router.delete('/admin/pipeline/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;

    const { error } = await supabase
      .from('landing_pipeline_steps')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Error deleting pipeline step', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to delete pipeline step' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Pipeline delete error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===========================================
// CAPABILITIES ADMIN ENDPOINTS
// ===========================================

// POST /api/landing/admin/capabilities - Create capability
router.post('/admin/capabilities', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { icon, title, description, display_order } = req.body;

    const { data, error } = await supabase
      .from('landing_capabilities')
      .insert({ icon, title, description, display_order: display_order || 0 })
      .select()
      .single();

    if (error) {
      logger.error('Error creating capability', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to create capability' });
    }

    res.json({ capability: data });
  } catch (error) {
    logger.error('Capability create error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/landing/admin/capabilities/:id - Update capability
router.put('/admin/capabilities/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;
    const { icon, title, description, display_order, is_visible } = req.body;

    const updateData = {};
    if (icon !== undefined) updateData.icon = icon;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (display_order !== undefined) updateData.display_order = display_order;
    if (is_visible !== undefined) updateData.is_visible = is_visible;

    const { data, error } = await supabase
      .from('landing_capabilities')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating capability', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to update capability' });
    }

    res.json({ capability: data });
  } catch (error) {
    logger.error('Capability update error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/landing/admin/capabilities/:id - Delete capability
router.delete('/admin/capabilities/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;

    const { error } = await supabase
      .from('landing_capabilities')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Error deleting capability', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to delete capability' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Capability delete error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===========================================
// SHOWCASE ADMIN ENDPOINTS
// ===========================================

// POST /api/landing/admin/showcase - Create showcase item
router.post('/admin/showcase', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { image_url, caption, content_type, size, display_order } = req.body;

    const { data, error } = await supabase
      .from('landing_showcase')
      .insert({
        image_url,
        caption,
        content_type: content_type || 'image',
        size: size || 'medium',
        display_order: display_order || 0
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating showcase item', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to create showcase item' });
    }

    res.json({ showcase: data });
  } catch (error) {
    logger.error('Showcase create error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/landing/admin/showcase/:id - Update showcase item
router.put('/admin/showcase/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;
    const { image_url, caption, content_type, size, display_order, is_visible } = req.body;

    const updateData = {};
    if (image_url !== undefined) updateData.image_url = image_url;
    if (caption !== undefined) updateData.caption = caption;
    if (content_type !== undefined) updateData.content_type = content_type;
    if (size !== undefined) updateData.size = size;
    if (display_order !== undefined) updateData.display_order = display_order;
    if (is_visible !== undefined) updateData.is_visible = is_visible;

    const { data, error } = await supabase
      .from('landing_showcase')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating showcase item', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to update showcase item' });
    }

    res.json({ showcase: data });
  } catch (error) {
    logger.error('Showcase update error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/landing/admin/showcase/:id - Delete showcase item
router.delete('/admin/showcase/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;

    const { error } = await supabase
      .from('landing_showcase')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Error deleting showcase item', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to delete showcase item' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Showcase delete error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===========================================
// BULK REORDER ENDPOINTS
// ===========================================

// PUT /api/landing/admin/reorder/:table - Reorder items in any table
router.put('/admin/reorder/:table', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { table } = req.params;
    const { order } = req.body; // Array of {id, display_order}

    // Validate table name
    const validTables = [
      'landing_stats',
      'landing_characters',
      'landing_pipeline_steps',
      'landing_capabilities',
      'landing_showcase'
    ];

    if (!validTables.includes(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    const updates = order.map(item =>
      supabase
        .from(table)
        .update({ display_order: item.display_order })
        .eq('id', item.id)
    );

    await Promise.all(updates);

    res.json({ success: true });
  } catch (error) {
    logger.error('Reorder error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
