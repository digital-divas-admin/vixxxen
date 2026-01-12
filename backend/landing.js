const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { requireAdmin } = require('./middleware/auth');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
}

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
      console.error('Error fetching landing page data:', errors);
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
    console.error('Landing page fetch error:', error);
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
      console.error('Error fetching sections:', error);
      return res.status(500).json({ error: 'Failed to fetch sections' });
    }

    res.json({ sections: data });
  } catch (error) {
    console.error('Sections fetch error:', error);
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
      console.error('Error fetching admin landing data:', errors);
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
    console.error('Admin landing fetch error:', error);
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
      console.error('Error updating section:', error);
      return res.status(500).json({ error: 'Failed to update section' });
    }

    res.json({ section: data });
  } catch (error) {
    console.error('Section update error:', error);
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
    console.error('Section reorder error:', error);
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
      console.error('Error updating content:', error);
      return res.status(500).json({ error: 'Failed to update content' });
    }

    res.json({ content: data });
  } catch (error) {
    console.error('Content update error:', error);
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
      console.error('Error creating content:', error);
      return res.status(500).json({ error: 'Failed to create content' });
    }

    res.json({ content: data });
  } catch (error) {
    console.error('Content create error:', error);
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
      console.error('Error deleting content:', error);
      return res.status(500).json({ error: 'Failed to delete content' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Content delete error:', error);
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
      console.error('Error creating stat:', error);
      return res.status(500).json({ error: 'Failed to create stat' });
    }

    res.json({ stat: data });
  } catch (error) {
    console.error('Stat create error:', error);
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
      console.error('Error updating stat:', error);
      return res.status(500).json({ error: 'Failed to update stat' });
    }

    res.json({ stat: data });
  } catch (error) {
    console.error('Stat update error:', error);
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
      console.error('Error deleting stat:', error);
      return res.status(500).json({ error: 'Failed to delete stat' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Stat delete error:', error);
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
      console.error('Error creating character:', error);
      return res.status(500).json({ error: 'Failed to create character' });
    }

    res.json({ character: data });
  } catch (error) {
    console.error('Character create error:', error);
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
      console.error('Error updating character:', error);
      return res.status(500).json({ error: 'Failed to update character' });
    }

    res.json({ character: data });
  } catch (error) {
    console.error('Character update error:', error);
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
      console.error('Error deleting character:', error);
      return res.status(500).json({ error: 'Failed to delete character' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Character delete error:', error);
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
      console.error('Error creating pipeline step:', error);
      return res.status(500).json({ error: 'Failed to create pipeline step' });
    }

    res.json({ step: data });
  } catch (error) {
    console.error('Pipeline create error:', error);
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
      console.error('Error updating pipeline step:', error);
      return res.status(500).json({ error: 'Failed to update pipeline step' });
    }

    res.json({ step: data });
  } catch (error) {
    console.error('Pipeline update error:', error);
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
      console.error('Error deleting pipeline step:', error);
      return res.status(500).json({ error: 'Failed to delete pipeline step' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Pipeline delete error:', error);
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
      console.error('Error creating capability:', error);
      return res.status(500).json({ error: 'Failed to create capability' });
    }

    res.json({ capability: data });
  } catch (error) {
    console.error('Capability create error:', error);
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
      console.error('Error updating capability:', error);
      return res.status(500).json({ error: 'Failed to update capability' });
    }

    res.json({ capability: data });
  } catch (error) {
    console.error('Capability update error:', error);
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
      console.error('Error deleting capability:', error);
      return res.status(500).json({ error: 'Failed to delete capability' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Capability delete error:', error);
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
      console.error('Error creating showcase item:', error);
      return res.status(500).json({ error: 'Failed to create showcase item' });
    }

    res.json({ showcase: data });
  } catch (error) {
    console.error('Showcase create error:', error);
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
      console.error('Error updating showcase item:', error);
      return res.status(500).json({ error: 'Failed to update showcase item' });
    }

    res.json({ showcase: data });
  } catch (error) {
    console.error('Showcase update error:', error);
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
      console.error('Error deleting showcase item:', error);
      return res.status(500).json({ error: 'Failed to delete showcase item' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Showcase delete error:', error);
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
    console.error('Reorder error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
