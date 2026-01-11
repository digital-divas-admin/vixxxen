const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./middleware/auth');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

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

// ===========================================
// PUBLIC ENDPOINTS
// ===========================================

// GET /api/custom-characters/config - Get pricing and configuration
router.get('/config', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { data: config, error } = await supabase
      .from('custom_character_config')
      .select('*')
      .single();

    if (error) throw error;

    // Return only public-facing config
    res.json({
      config: {
        base_price: config.base_price,
        revision_price: config.revision_price,
        rush_fee: config.rush_fee,
        max_revisions: config.max_revisions,
        standard_days_min: config.standard_days_min,
        standard_days_max: config.standard_days_max,
        rush_days: config.rush_days,
        max_upload_images: config.max_upload_images,
        max_image_size_mb: config.max_image_size_mb,
        is_active: config.is_active,
        requirements_text: config.requirements_text,
        disclaimers: config.disclaimers
      }
    });
  } catch (error) {
    console.error('Error fetching custom character config:', error);
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

// ===========================================
// AUTHENTICATED ENDPOINTS
// ===========================================

// POST /api/custom-characters/orders - Create a new custom character order
router.post('/orders', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const {
      character_name,
      face_instagram_1,
      face_instagram_1_notes,
      face_instagram_2,
      face_instagram_2_notes,
      body_instagram,
      body_instagram_notes,
      google_drive_link,
      uploaded_images,
      is_rush,
      revisions_purchased,
      interim_character_id,
      acknowledgments
    } = req.body;

    // Validate required fields
    if (!character_name || !face_instagram_1 || !face_instagram_2 || !body_instagram) {
      return res.status(400).json({
        error: 'Character name and all Instagram accounts are required'
      });
    }

    // Get current pricing config
    const { data: config, error: configError } = await supabase
      .from('custom_character_config')
      .select('*')
      .single();

    if (configError) throw configError;

    if (!config.is_active) {
      return res.status(400).json({ error: 'Custom characters are currently unavailable' });
    }

    // Calculate pricing
    const basePrice = parseFloat(config.base_price);
    const revisionPrice = parseFloat(config.revision_price);
    const rushFee = is_rush ? parseFloat(config.rush_fee) : 0;
    const revisionsTotal = (revisions_purchased || 0) * revisionPrice;
    const totalPrice = basePrice + revisionsTotal + rushFee;

    // Calculate estimated delivery
    const deliveryDays = is_rush ? config.rush_days : config.standard_days_max;
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + deliveryDays);

    // Create the order
    const { data: order, error: orderError } = await supabase
      .from('custom_character_orders')
      .insert({
        user_id: userId,
        character_name,
        face_instagram_1,
        face_instagram_1_notes: face_instagram_1_notes || null,
        face_instagram_2,
        face_instagram_2_notes: face_instagram_2_notes || null,
        body_instagram,
        body_instagram_notes: body_instagram_notes || null,
        google_drive_link: google_drive_link || null,
        uploaded_images: uploaded_images || [],
        is_rush: is_rush || false,
        revisions_purchased: revisions_purchased || 0,
        base_price: basePrice,
        revision_price: revisionPrice,
        rush_fee: rushFee,
        total_price: totalPrice,
        interim_character_id: interim_character_id || null,
        acknowledgments: acknowledgments || [],
        estimated_delivery: estimatedDelivery.toISOString().split('T')[0],
        status: 'pending'
      })
      .select()
      .single();

    if (orderError) throw orderError;

    res.json({ order });
  } catch (error) {
    console.error('Error creating custom character order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// GET /api/custom-characters/orders - Get user's own orders
router.get('/orders', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;

    const { data: orders, error } = await supabase
      .from('custom_character_orders')
      .select(`
        *,
        interim_character:marketplace_characters!interim_character_id(id, name, image_url),
        final_character:marketplace_characters!final_character_id(id, name, image_url)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ orders });
  } catch (error) {
    console.error('Error fetching user orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /api/custom-characters/orders/:id - Get specific order details
router.get('/orders/:id', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const orderId = req.params.id;
    const admin = await isAdmin(userId);

    // Build query
    let query = supabase
      .from('custom_character_orders')
      .select(`
        *,
        interim_character:marketplace_characters!interim_character_id(id, name, image_url),
        final_character:marketplace_characters!final_character_id(id, name, image_url),
        revisions:custom_character_revisions(*)
      `)
      .eq('id', orderId);

    // Non-admins can only see their own orders
    if (!admin) {
      query = query.eq('user_id', userId);
    }

    const { data: order, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Order not found' });
      }
      throw error;
    }

    res.json({ order });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// POST /api/custom-characters/orders/:id/revision - Request a revision
router.post('/orders/:id/revision', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const orderId = req.params.id;
    const { feedback } = req.body;

    if (!feedback) {
      return res.status(400).json({ error: 'Feedback is required' });
    }

    // Get the order
    const { data: order, error: orderError } = await supabase
      .from('custom_character_orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if revisions are available
    if (order.revisions_used >= order.revisions_purchased) {
      return res.status(400).json({ error: 'No revisions remaining' });
    }

    // Check order status
    if (order.status !== 'delivered') {
      return res.status(400).json({
        error: 'Revisions can only be requested after initial delivery'
      });
    }

    const revisionNumber = order.revisions_used + 1;

    // Create revision request
    const { data: revision, error: revisionError } = await supabase
      .from('custom_character_revisions')
      .insert({
        order_id: orderId,
        revision_number: revisionNumber,
        feedback,
        status: 'requested'
      })
      .select()
      .single();

    if (revisionError) throw revisionError;

    // Update order status and revision count
    const { error: updateError } = await supabase
      .from('custom_character_orders')
      .update({
        status: 'revision_requested',
        revisions_used: revisionNumber,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (updateError) throw updateError;

    res.json({ revision });
  } catch (error) {
    console.error('Error requesting revision:', error);
    res.status(500).json({ error: 'Failed to request revision' });
  }
});

// ===========================================
// ADMIN ENDPOINTS
// ===========================================

// GET /api/custom-characters/admin/config - Get full config (admin)
router.get('/admin/config', requireAuth, async (req, res) => {
  try {
    if (!await isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { data: config, error } = await supabase
      .from('custom_character_config')
      .select('*')
      .single();

    if (error) throw error;

    res.json({ config });
  } catch (error) {
    console.error('Error fetching admin config:', error);
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

// PUT /api/custom-characters/admin/config - Update config (admin)
router.put('/admin/config', requireAuth, async (req, res) => {
  try {
    if (!await isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const updates = req.body;
    delete updates.id;
    delete updates.created_at;
    updates.updated_at = new Date().toISOString();

    const { data: config, error } = await supabase
      .from('custom_character_config')
      .update(updates)
      .select()
      .single();

    if (error) throw error;

    res.json({ config });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// GET /api/custom-characters/admin/orders - Get all orders (admin)
router.get('/admin/orders', requireAuth, async (req, res) => {
  try {
    if (!await isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('custom_character_orders')
      .select(`
        *,
        user:profiles!user_id(id, email, display_name),
        interim_character:marketplace_characters!interim_character_id(id, name),
        final_character:marketplace_characters!final_character_id(id, name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: orders, count, error } = await query;

    if (error) throw error;

    res.json({ orders, total: count });
  } catch (error) {
    console.error('Error fetching admin orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /api/custom-characters/admin/orders/:id - Get order details (admin)
router.get('/admin/orders/:id', requireAuth, async (req, res) => {
  try {
    if (!await isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { data: order, error } = await supabase
      .from('custom_character_orders')
      .select(`
        *,
        user:profiles!user_id(id, email, display_name),
        interim_character:marketplace_characters!interim_character_id(id, name, image_url),
        final_character:marketplace_characters!final_character_id(id, name, image_url),
        revisions:custom_character_revisions(*)
      `)
      .eq('id', req.params.id)
      .single();

    if (error) throw error;

    res.json({ order });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// PUT /api/custom-characters/admin/orders/:id - Update order (admin)
router.put('/admin/orders/:id', requireAuth, async (req, res) => {
  try {
    if (!await isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const orderId = req.params.id;
    const updates = req.body;

    // Don't allow changing certain fields
    delete updates.id;
    delete updates.user_id;
    delete updates.created_at;
    delete updates.order_number;
    updates.updated_at = new Date().toISOString();

    // Handle status-specific timestamp updates
    if (updates.status === 'in_progress' && !updates.started_at) {
      updates.started_at = new Date().toISOString();
    }
    if (updates.status === 'delivered' && !updates.delivered_at) {
      updates.delivered_at = new Date().toISOString();
    }
    if (updates.status === 'completed' && !updates.completed_at) {
      updates.completed_at = new Date().toISOString();
    }

    const { data: order, error } = await supabase
      .from('custom_character_orders')
      .update(updates)
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw error;

    res.json({ order });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// PUT /api/custom-characters/admin/revisions/:id - Update revision (admin)
router.put('/admin/revisions/:id', requireAuth, async (req, res) => {
  try {
    if (!await isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const revisionId = req.params.id;
    const { status, admin_notes } = req.body;

    const updates = {};
    if (status) updates.status = status;
    if (admin_notes !== undefined) updates.admin_notes = admin_notes;
    if (status === 'completed') updates.completed_at = new Date().toISOString();

    const { data: revision, error } = await supabase
      .from('custom_character_revisions')
      .update(updates)
      .eq('id', revisionId)
      .select()
      .single();

    if (error) throw error;

    res.json({ revision });
  } catch (error) {
    console.error('Error updating revision:', error);
    res.status(500).json({ error: 'Failed to update revision' });
  }
});

// GET /api/custom-characters/admin/stats - Get order statistics (admin)
router.get('/admin/stats', requireAuth, async (req, res) => {
  try {
    if (!await isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get counts by status
    const { data: orders, error } = await supabase
      .from('custom_character_orders')
      .select('status');

    if (error) throw error;

    const stats = {
      pending: 0,
      in_progress: 0,
      delivered: 0,
      revision_requested: 0,
      completed: 0,
      total: orders.length
    };

    orders.forEach(order => {
      if (stats.hasOwnProperty(order.status)) {
        stats[order.status]++;
      }
    });

    res.json({ stats });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
