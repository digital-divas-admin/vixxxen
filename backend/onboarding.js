const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { requireAuth, optionalAuth } = require('./middleware/auth');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// ===========================================
// PUBLIC ENDPOINTS (no auth required)
// ===========================================

// GET /api/onboarding/config - Get onboarding wizard configuration
router.get('/config', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { data: steps, error } = await supabase
      .from('onboarding_config')
      .select('*')
      .eq('is_enabled', true)
      .order('step_order', { ascending: true });

    if (error) throw error;

    res.json({ steps });
  } catch (error) {
    console.error('Error fetching onboarding config:', error);
    res.status(500).json({ error: 'Failed to fetch onboarding config' });
  }
});

// GET /api/onboarding/content-plans - Get available content plans
router.get('/content-plans', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { data: plans, error } = await supabase
      .from('content_plans')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;

    res.json({ plans });
  } catch (error) {
    console.error('Error fetching content plans:', error);
    res.status(500).json({ error: 'Failed to fetch content plans' });
  }
});

// GET /api/onboarding/education-tiers - Get available education tiers
router.get('/education-tiers', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { data: tiers, error } = await supabase
      .from('education_tiers')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;

    res.json({ tiers });
  } catch (error) {
    console.error('Error fetching education tiers:', error);
    res.status(500).json({ error: 'Failed to fetch education tiers' });
  }
});

// GET /api/onboarding/starter-characters - Get starter characters
router.get('/starter-characters', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const { data: characters, error } = await supabase
      .from('marketplace_characters')
      .select('*')
      .eq('is_starter', true)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    res.json({ characters });
  } catch (error) {
    console.error('Error fetching starter characters:', error);
    res.status(500).json({ error: 'Failed to fetch starter characters' });
  }
});

// ===========================================
// AUTHENTICATED ENDPOINTS
// ===========================================

// GET /api/onboarding/progress - Get user's onboarding progress
router.get('/progress', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;

    const { data: progress, error } = await supabase
      .from('onboarding_progress')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      throw error;
    }

    res.json({ progress: progress || null });
  } catch (error) {
    console.error('Error fetching onboarding progress:', error);
    res.status(500).json({ error: 'Failed to fetch onboarding progress' });
  }
});

// POST /api/onboarding/progress - Create or update onboarding progress
router.post('/progress', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const { current_step, completed_steps, skipped_steps, selections, completed } = req.body;

    const progressData = {
      user_id: userId,
      current_step,
      completed_steps: completed_steps || [],
      skipped_steps: skipped_steps || [],
      selections: selections || {},
      updated_at: new Date().toISOString()
    };

    if (completed) {
      progressData.completed_at = new Date().toISOString();
    }

    const { data: progress, error } = await supabase
      .from('onboarding_progress')
      .upsert(progressData, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;

    res.json({ progress });
  } catch (error) {
    console.error('Error updating onboarding progress:', error);
    res.status(500).json({ error: 'Failed to update onboarding progress' });
  }
});

// POST /api/onboarding/complete-step - Mark a step as complete
router.post('/complete-step', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const { step_key, skipped, selection } = req.body;

    // Get current progress
    let { data: progress } = await supabase
      .from('onboarding_progress')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Initialize if doesn't exist
    if (!progress) {
      progress = {
        user_id: userId,
        completed_steps: [],
        skipped_steps: [],
        selections: {}
      };
    }

    // Update arrays
    const completedSteps = progress.completed_steps || [];
    const skippedSteps = progress.skipped_steps || [];
    const selections = progress.selections || {};

    if (skipped) {
      if (!skippedSteps.includes(step_key)) {
        skippedSteps.push(step_key);
      }
    } else {
      if (!completedSteps.includes(step_key)) {
        completedSteps.push(step_key);
      }
    }

    if (selection) {
      selections[step_key] = selection;
    }

    // Upsert progress
    const { data: updatedProgress, error } = await supabase
      .from('onboarding_progress')
      .upsert({
        user_id: userId,
        completed_steps: completedSteps,
        skipped_steps: skippedSteps,
        selections: selections,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;

    res.json({ progress: updatedProgress });
  } catch (error) {
    console.error('Error completing step:', error);
    res.status(500).json({ error: 'Failed to complete step' });
  }
});

// GET /api/onboarding/user-subscriptions - Get user's current subscriptions
router.get('/user-subscriptions', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;

    // Get content subscription with plan details
    const { data: contentSub } = await supabase
      .from('user_content_subscriptions')
      .select(`
        *,
        plan:content_plans(*)
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    // Get education subscription (from memberships)
    const { data: educationSub } = await supabase
      .from('memberships')
      .select(`
        *,
        tier_details:education_tiers!memberships_education_tier_id_fkey(*)
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    res.json({
      content_subscription: contentSub || null,
      education_subscription: educationSub || null
    });
  } catch (error) {
    console.error('Error fetching user subscriptions:', error);
    res.status(500).json({ error: 'Failed to fetch user subscriptions' });
  }
});

// ===========================================
// PROMPT/REMINDER ENDPOINTS
// ===========================================

// GET /api/onboarding/check-prompts - Check if any prompts should be shown
router.get('/check-prompts', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;

    // Get user's profile data
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits, created_at')
      .eq('id', userId)
      .single();

    if (!profile) {
      return res.json({ prompt: null });
    }

    // Get user's subscriptions
    const { data: contentSub } = await supabase
      .from('user_content_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    const { data: educationSub } = await supabase
      .from('memberships')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    // Get user's owned characters count
    const { count: ownedCharCount } = await supabase
      .from('user_characters')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Get user's generation count (approximate from transactions)
    const { count: genCount } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('type', 'debit');

    // Get enabled prompt triggers
    const { data: triggers } = await supabase
      .from('prompt_triggers')
      .select('*')
      .eq('is_enabled', true)
      .order('priority', { ascending: false });

    if (!triggers || triggers.length === 0) {
      return res.json({ prompt: null });
    }

    // Get user's recent prompts
    const { data: recentPrompts } = await supabase
      .from('user_prompts')
      .select('*')
      .eq('user_id', userId)
      .order('shown_at', { ascending: false });

    const daysSinceSignup = Math.floor(
      (Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Build context for trigger evaluation
    const context = {
      credits: profile.credits,
      has_content_plan: !!contentSub,
      has_education: !!educationSub,
      owned_characters_count: ownedCharCount || 0,
      generations_count: genCount || 0,
      days_since_signup: daysSinceSignup
    };

    // Find the first matching trigger
    for (const trigger of triggers) {
      // Check if this trigger matches the context
      if (!evaluateTrigger(trigger.condition, context)) {
        continue;
      }

      // Check cooldown
      const lastShown = recentPrompts?.find(p => p.trigger_key === trigger.trigger_key);
      if (lastShown) {
        const hoursSinceShown = (Date.now() - new Date(lastShown.shown_at).getTime()) / (1000 * 60 * 60);
        if (hoursSinceShown < trigger.cooldown_hours) {
          continue;
        }

        // Check max shows
        if (trigger.max_shows > 0 && lastShown.show_count >= trigger.max_shows) {
          continue;
        }
      }

      // This trigger should fire - return the prompt
      return res.json({
        prompt: {
          trigger_key: trigger.trigger_key,
          type: trigger.prompt_type,
          title: trigger.prompt_title,
          message: trigger.prompt_message,
          cta: trigger.prompt_cta
        }
      });
    }

    res.json({ prompt: null });
  } catch (error) {
    console.error('Error checking prompts:', error);
    res.status(500).json({ error: 'Failed to check prompts' });
  }
});

// POST /api/onboarding/prompt-shown - Record that a prompt was shown
router.post('/prompt-shown', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const { trigger_key } = req.body;

    // Check if there's an existing record
    const { data: existing } = await supabase
      .from('user_prompts')
      .select('*')
      .eq('user_id', userId)
      .eq('trigger_key', trigger_key)
      .single();

    if (existing) {
      // Update show count
      await supabase
        .from('user_prompts')
        .update({
          show_count: existing.show_count + 1,
          shown_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    } else {
      // Create new record
      await supabase
        .from('user_prompts')
        .insert({
          user_id: userId,
          trigger_key: trigger_key,
          show_count: 1
        });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error recording prompt shown:', error);
    res.status(500).json({ error: 'Failed to record prompt shown' });
  }
});

// POST /api/onboarding/prompt-dismissed - Record that a prompt was dismissed
router.post('/prompt-dismissed', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const { trigger_key } = req.body;

    await supabase
      .from('user_prompts')
      .update({
        dismissed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('trigger_key', trigger_key);

    res.json({ success: true });
  } catch (error) {
    console.error('Error recording prompt dismissed:', error);
    res.status(500).json({ error: 'Failed to record prompt dismissed' });
  }
});

// POST /api/onboarding/prompt-converted - Record that a prompt led to conversion
router.post('/prompt-converted', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    const userId = req.userId;
    const { trigger_key } = req.body;

    await supabase
      .from('user_prompts')
      .update({
        converted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('trigger_key', trigger_key);

    res.json({ success: true });
  } catch (error) {
    console.error('Error recording prompt conversion:', error);
    res.status(500).json({ error: 'Failed to record prompt conversion' });
  }
});

// ===========================================
// ADMIN ENDPOINTS
// ===========================================

// Helper to check admin status
async function isAdmin(userId) {
  if (!supabase) return false;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  return profile?.role === 'admin';
}

// GET /api/onboarding/admin/config - Get all config (including disabled)
router.get('/admin/config', requireAuth, async (req, res) => {
  try {
    if (!await isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { data: steps, error } = await supabase
      .from('onboarding_config')
      .select('*')
      .order('step_order', { ascending: true });

    if (error) throw error;

    res.json({ steps });
  } catch (error) {
    console.error('Error fetching admin config:', error);
    res.status(500).json({ error: 'Failed to fetch admin config' });
  }
});

// PUT /api/onboarding/admin/config/:stepKey - Update a config step
router.put('/admin/config/:stepKey', requireAuth, async (req, res) => {
  try {
    if (!await isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { stepKey } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.step_key;
    delete updates.created_at;

    updates.updated_at = new Date().toISOString();

    const { data: step, error } = await supabase
      .from('onboarding_config')
      .update(updates)
      .eq('step_key', stepKey)
      .select()
      .single();

    if (error) throw error;

    res.json({ step });
  } catch (error) {
    console.error('Error updating config step:', error);
    res.status(500).json({ error: 'Failed to update config step' });
  }
});

// GET /api/onboarding/admin/plans - Get all content plans (including inactive)
router.get('/admin/plans', requireAuth, async (req, res) => {
  try {
    if (!await isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { data: plans, error } = await supabase
      .from('content_plans')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) throw error;

    res.json({ plans });
  } catch (error) {
    console.error('Error fetching admin plans:', error);
    res.status(500).json({ error: 'Failed to fetch admin plans' });
  }
});

// PUT /api/onboarding/admin/plans/:slug - Update a content plan
router.put('/admin/plans/:slug', requireAuth, async (req, res) => {
  try {
    if (!await isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { slug } = req.params;
    const updates = req.body;

    delete updates.id;
    delete updates.slug;
    delete updates.created_at;
    updates.updated_at = new Date().toISOString();

    const { data: plan, error } = await supabase
      .from('content_plans')
      .update(updates)
      .eq('slug', slug)
      .select()
      .single();

    if (error) throw error;

    res.json({ plan });
  } catch (error) {
    console.error('Error updating content plan:', error);
    res.status(500).json({ error: 'Failed to update content plan' });
  }
});

// GET /api/onboarding/admin/tiers - Get all education tiers (including inactive)
router.get('/admin/tiers', requireAuth, async (req, res) => {
  try {
    if (!await isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { data: tiers, error } = await supabase
      .from('education_tiers')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) throw error;

    res.json({ tiers });
  } catch (error) {
    console.error('Error fetching admin tiers:', error);
    res.status(500).json({ error: 'Failed to fetch admin tiers' });
  }
});

// PUT /api/onboarding/admin/tiers/:slug - Update an education tier
router.put('/admin/tiers/:slug', requireAuth, async (req, res) => {
  try {
    if (!await isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { slug } = req.params;
    const updates = req.body;

    delete updates.id;
    delete updates.slug;
    delete updates.created_at;
    updates.updated_at = new Date().toISOString();

    const { data: tier, error } = await supabase
      .from('education_tiers')
      .update(updates)
      .eq('slug', slug)
      .select()
      .single();

    if (error) throw error;

    res.json({ tier });
  } catch (error) {
    console.error('Error updating education tier:', error);
    res.status(500).json({ error: 'Failed to update education tier' });
  }
});

// PUT /api/onboarding/admin/starter-character/:id - Toggle starter status
router.put('/admin/starter-character/:id', requireAuth, async (req, res) => {
  try {
    if (!await isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const { is_starter } = req.body;

    const { data: character, error } = await supabase
      .from('marketplace_characters')
      .update({
        is_starter: is_starter,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ character });
  } catch (error) {
    console.error('Error updating starter character:', error);
    res.status(500).json({ error: 'Failed to update starter character' });
  }
});

// GET /api/onboarding/admin/triggers - Get all prompt triggers
router.get('/admin/triggers', requireAuth, async (req, res) => {
  try {
    if (!await isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { data: triggers, error } = await supabase
      .from('prompt_triggers')
      .select('*')
      .order('priority', { ascending: false });

    if (error) throw error;

    res.json({ triggers });
  } catch (error) {
    console.error('Error fetching admin triggers:', error);
    res.status(500).json({ error: 'Failed to fetch admin triggers' });
  }
});

// PUT /api/onboarding/admin/triggers/:triggerKey - Update a prompt trigger
router.put('/admin/triggers/:triggerKey', requireAuth, async (req, res) => {
  try {
    if (!await isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { triggerKey } = req.params;
    const updates = req.body;

    delete updates.id;
    delete updates.trigger_key;
    delete updates.created_at;
    updates.updated_at = new Date().toISOString();

    const { data: trigger, error } = await supabase
      .from('prompt_triggers')
      .update(updates)
      .eq('trigger_key', triggerKey)
      .select()
      .single();

    if (error) throw error;

    res.json({ trigger });
  } catch (error) {
    console.error('Error updating prompt trigger:', error);
    res.status(500).json({ error: 'Failed to update prompt trigger' });
  }
});

// ===========================================
// HELPER FUNCTIONS
// ===========================================

// Evaluate a trigger condition against user context
function evaluateTrigger(condition, context) {
  try {
    // Credits conditions
    if (condition.credits_below !== undefined) {
      if (context.credits >= condition.credits_below) return false;
    }
    if (condition.credits_equal !== undefined) {
      if (context.credits !== condition.credits_equal) return false;
    }

    // Subscription conditions
    if (condition.has_content_plan !== undefined) {
      if (context.has_content_plan !== condition.has_content_plan) return false;
    }
    if (condition.has_education !== undefined) {
      if (context.has_education !== condition.has_education) return false;
    }

    // Time conditions
    if (condition.days_since_signup !== undefined) {
      if (context.days_since_signup < condition.days_since_signup) return false;
    }

    // Milestone conditions
    if (condition.generations_count !== undefined) {
      if (context.generations_count < condition.generations_count) return false;
    }
    if (condition.owned_characters_count !== undefined) {
      if (context.owned_characters_count > condition.owned_characters_count) return false;
    }

    return true;
  } catch (error) {
    console.error('Error evaluating trigger:', error);
    return false;
  }
}

module.exports = router;
