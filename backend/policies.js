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

// GET /api/policies - Get all active policies
router.get('/', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { data: policies, error } = await supabase
      .from('policies')
      .select('*')
      .eq('is_active', true)
      .order('type');

    if (error) {
      console.error('Error fetching policies:', error);
      return res.status(500).json({ error: 'Failed to fetch policies' });
    }

    res.json({ policies });

  } catch (error) {
    console.error('Policies fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/policies/:type - Get a specific policy by type
router.get('/:type', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { type } = req.params;

    const { data: policy, error } = await supabase
      .from('policies')
      .select('*')
      .eq('type', type)
      .eq('is_active', true)
      .single();

    if (error) {
      console.error('Error fetching policy:', error);
      return res.status(404).json({ error: 'Policy not found' });
    }

    res.json({ policy });

  } catch (error) {
    console.error('Policy fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/policies/admin/all - Get all policies including inactive (admin only)
router.get('/admin/all', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    // User is verified admin via requireAdmin middleware

    const { data: policies, error } = await supabase
      .from('policies')
      .select('*')
      .order('type');

    if (error) {
      console.error('Error fetching all policies:', error);
      return res.status(500).json({ error: 'Failed to fetch policies' });
    }

    res.json({ policies });

  } catch (error) {
    console.error('Policies fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/policies/:type - Update or create a policy (admin only)
router.put('/:type', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { type } = req.params;
    // User is verified admin via requireAdmin middleware

    console.log(`📝 Policy update request for type: ${type}`);

    const { title, content, is_active } = req.body;

    // First, check if the policy exists
    const { data: existingPolicy } = await supabase
      .from('policies')
      .select('id')
      .eq('type', type)
      .single();

    let policy;
    let error;

    if (existingPolicy) {
      // Update existing policy
      const updateData = {
        updated_at: new Date().toISOString()
      };

      if (title !== undefined) updateData.title = title;
      if (content !== undefined) updateData.content = content;
      if (is_active !== undefined) updateData.is_active = is_active;

      const result = await supabase
        .from('policies')
        .update(updateData)
        .eq('type', type)
        .select()
        .single();

      policy = result.data;
      error = result.error;
      console.log(`📝 Updated existing policy: ${type}`);
    } else {
      // Create new policy
      const insertData = {
        type,
        title: title || `${type.charAt(0).toUpperCase() + type.slice(1)} Policy`,
        content: content || '',
        is_active: is_active !== undefined ? is_active : true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const result = await supabase
        .from('policies')
        .insert(insertData)
        .select()
        .single();

      policy = result.data;
      error = result.error;
      console.log(`📝 Created new policy: ${type}`);
    }

    if (error) {
      console.error('Error saving policy:', error);
      return res.status(500).json({ error: 'Failed to save policy', details: error.message });
    }

    res.json({ policy });

  } catch (error) {
    console.error('Save policy error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

module.exports = router;
