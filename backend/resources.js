const express = require('express');
const router = express.Router();
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { requireAuth, optionalAuth, requireAdmin } = require('./middleware/auth');
const { logger, maskUserId } = require('./services/logger');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
}

// GET /api/resources - Get all resources with access control
router.get('/', optionalAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { type, topic } = req.query;
    // Use verified user ID from auth middleware (not query param)
    const userId = req.userId;

    // Get user's membership tier if authenticated
    let userTier = null;
    let userPurchases = [];
    let userCredits = 0;

    if (userId) {
      const { data: membership } = await supabase
        .from('memberships')
        .select('tier')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

      userTier = membership?.tier || null;

      // Get user's purchases
      const { data: purchases } = await supabase
        .from('user_purchases')
        .select('resource_id')
        .eq('user_id', userId);

      userPurchases = purchases?.map(p => p.resource_id) || [];

      // Get user's credit balance
      const { data: profile } = await supabase
        .from('profiles')
        .select('credit_balance')
        .eq('id', userId)
        .single();

      userCredits = profile?.credit_balance || 0;
    }

    // Build query
    let query = supabase
      .from('resources')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply filters
    if (type && type !== 'all') {
      query = query.eq('type', type);
    }
    if (topic && topic !== 'all') {
      query = query.eq('topic', topic);
    }

    const { data: resources, error } = await query;

    if (error) {
      logger.error('Error fetching resources', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to fetch resources' });
    }

    // Process resources based on user's access tier and purchases
    const processedResources = resources.map(resource => {
      let isLocked = true;
      let canAccess = false;
      const isPurchased = userPurchases.includes(resource.id);

      // Determine which tiers get this for free (with backwards compatibility)
      const freeForSupernova = resource.free_for_supernova !== undefined
        ? resource.free_for_supernova
        : (resource.access_tier !== 'mentorship');
      const freeForMentorship = resource.free_for_mentorship !== undefined
        ? resource.free_for_mentorship
        : true;

      // Check if user has purchased this resource
      if (isPurchased) {
        isLocked = false;
        canAccess = true;
      } else if (userTier === 'mentorship' && freeForMentorship) {
        // Mentorship can access if resource is free for mentorship
        isLocked = false;
        canAccess = true;
      } else if (userTier === 'supernova' && freeForSupernova) {
        // Supernova can access if resource is free for supernova
        isLocked = false;
        canAccess = true;
      }
      // No membership = all locked (isLocked stays true) unless purchased

      // Calculate current price (sale or regular)
      let currentPrice = resource.price;
      let isOnSale = false;
      if (resource.sale_price && resource.sale_ends_at) {
        const saleEnds = new Date(resource.sale_ends_at);
        if (saleEnds > new Date()) {
          currentPrice = resource.sale_price;
          isOnSale = true;
        }
      }

      return {
        id: resource.id,
        title: resource.title,
        description: resource.description,
        type: resource.type,
        topic: resource.topic,
        thumbnail_url: resource.thumbnail_url,
        access_tier: resource.access_tier,
        free_for_supernova: freeForSupernova,
        free_for_mentorship: freeForMentorship,
        duration: resource.duration,
        created_at: resource.created_at,
        is_locked: isLocked,
        is_purchased: isPurchased,
        // Price info
        is_purchasable: resource.is_purchasable || false,
        price: resource.price,
        sale_price: resource.sale_price,
        sale_ends_at: resource.sale_ends_at,
        current_price: currentPrice,
        is_on_sale: isOnSale,
        // Creator info
        creator_id: resource.creator_id,
        revenue_share_percent: resource.revenue_share_percent,
        // Only include content if user has access
        content_url: canAccess ? resource.content_url : null,
        content_body: canAccess ? resource.content_body : null
      };
    });

    res.json({
      resources: processedResources,
      user_tier: userTier,
      user_credits: userCredits,
      total: processedResources.length
    });

  } catch (error) {
    logger.error('Resources API error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/resources/bootstrap - Get all user data in one call
// IMPORTANT: This route must be defined BEFORE /:id to avoid being caught by the wildcard
// Changed from /:userId to use authenticated user - prevents IDOR vulnerability
router.get('/bootstrap', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    // Use verified user ID from auth middleware (not URL param)
    const userId = req.userId;

    // Run all queries in parallel for maximum speed
    const [profileResult, charactersResult, membershipResult, subscriptionResult] = await Promise.all([
      // Get profile
      supabase
        .from('profiles')
        .select('id, email, full_name, display_name, credits, plan, avatar_url')
        .eq('id', userId)
        .single(),

      // Get owned characters
      supabase
        .from('user_characters')
        .select('character_id')
        .eq('user_id', userId),

      // Get membership
      supabase
        .from('memberships')
        .select('tier, is_active')
        .eq('user_id', userId)
        .single(),

      // Get subscription
      supabase
        .from('subscriptions')
        .select('tier, status, expires_at')
        .eq('user_id', userId)
        .single()
    ]);

    // Handle profile (required)
    if (profileResult.error) {
      logger.error('Bootstrap: Profile fetch error', { error: profileResult.error.message, requestId: req.id });
      return res.status(404).json({ error: 'User profile not found' });
    }

    const profile = profileResult.data;
    const characters = charactersResult.data || [];
    const membership = membershipResult.data;
    const subscription = subscriptionResult.data;

    // Determine user plan from membership or subscription
    let userPlan = 'Free Plan';
    const tierNames = {
      'rising_star': 'Rising Star',
      'supernova': 'Supernova',
      'mentorship': 'Mentorship',
      'starter': 'Starter Plan',
      'creator': 'Creator Plan',
      'pro': 'Pro Plan'
    };

    if (membership && membership.is_active && membership.tier) {
      userPlan = tierNames[membership.tier] || membership.tier.charAt(0).toUpperCase() + membership.tier.slice(1);
    } else if (subscription && subscription.status === 'active') {
      userPlan = tierNames[subscription.tier] || subscription.tier.charAt(0).toUpperCase() + subscription.tier.slice(1);
    } else if (profile.plan) {
      userPlan = profile.plan.charAt(0).toUpperCase() + profile.plan.slice(1) + ' Plan';
    }

    // Check if subscription is expired
    let subscriptionActive = false;
    if (subscription && subscription.status === 'active' && subscription.expires_at) {
      subscriptionActive = new Date(subscription.expires_at) > new Date();
    }

    res.json({
      profile: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        credits: profile.credits || 0,
        avatar_url: profile.avatar_url
      },
      plan: userPlan,
      characters: characters.map(c => c.character_id),
      membership: membership ? {
        tier: membership.tier,
        is_active: membership.is_active
      } : null,
      subscription: subscription ? {
        tier: subscription.tier,
        status: subscription.status,
        expires_at: subscription.expires_at,
        is_active: subscriptionActive
      } : null
    });

  } catch (error) {
    logger.error('Bootstrap error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Failed to load user data' });
  }
});

// GET /api/resources/:id - Get single resource with full content (if authorized)
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;
    // Use verified user ID from auth middleware
    const userId = req.userId;

    // Get user's membership tier
    let userTier = null;
    if (userId) {
      const { data: membership } = await supabase
        .from('memberships')
        .select('tier')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

      userTier = membership?.tier || null;
    }

    // Fetch the resource
    const { data: resource, error } = await supabase
      .from('resources')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !resource) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    // Check access
    let canAccess = false;
    if (userTier === 'mentorship') {
      canAccess = true;
    } else if (userTier === 'supernova' && resource.access_tier === 'supernova') {
      canAccess = true;
    }

    if (!canAccess) {
      return res.status(403).json({
        error: 'Access denied',
        required_tier: resource.access_tier,
        user_tier: userTier,
        resource: {
          id: resource.id,
          title: resource.title,
          description: resource.description,
          type: resource.type,
          topic: resource.topic,
          access_tier: resource.access_tier,
          duration: resource.duration
        }
      });
    }

    res.json({ resource });

  } catch (error) {
    logger.error('Resource fetch error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/resources/status - Check if resources API is configured
router.get('/status', async (req, res) => {
  res.json({
    configured: !!supabase,
    supabase_url: !!supabaseUrl,
    service_key: !!supabaseServiceKey
  });
});

// POST /api/resources/upload - Upload thumbnail image (admin only)
router.post('/upload', requireAdmin, upload.single('thumbnail'), async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    // User is verified admin via requireAdmin middleware
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Generate unique filename
    const fileExt = req.file.originalname.split('.').pop();
    const fileName = `resource-thumbnails/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('resources')
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      logger.error('Upload error', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to upload image' });
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('resources')
      .getPublicUrl(fileName);

    res.json({
      success: true,
      url: publicUrl,
      path: fileName
    });

  } catch (error) {
    logger.error('Upload error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/resources - Create new resource (admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    // User is verified admin via requireAdmin middleware
    const userId = req.userId;

    const {
      title, description, type, topic, thumbnail_url, content_url, content_body, access_tier, duration,
      // Tier access fields
      free_for_supernova, free_for_mentorship,
      // Pricing fields
      is_purchasable, price, sale_price, sale_ends_at, revenue_share_percent
    } = req.body;

    // Validate required fields
    if (!title || !type || !topic) {
      return res.status(400).json({ error: 'Missing required fields: title, type, topic' });
    }

    // Validate enum values
    const validTypes = ['tutorial', 'guide', 'video'];
    const validTopics = ['prompts', 'techniques', 'tools', 'business'];
    const validTiers = ['supernova', 'mentorship'];

    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
    }
    if (!validTopics.includes(topic)) {
      return res.status(400).json({ error: `Invalid topic. Must be one of: ${validTopics.join(', ')}` });
    }
    if (access_tier && !validTiers.includes(access_tier)) {
      return res.status(400).json({ error: `Invalid access_tier. Must be one of: ${validTiers.join(', ')}` });
    }

    const { data: resource, error } = await supabase
      .from('resources')
      .insert({
        title,
        description,
        type,
        topic,
        thumbnail_url,
        content_url,
        content_body,
        access_tier: access_tier || 'supernova',
        free_for_supernova: free_for_supernova !== undefined ? free_for_supernova : true,
        free_for_mentorship: free_for_mentorship !== undefined ? free_for_mentorship : true,
        duration,
        // Pricing fields
        is_purchasable: is_purchasable || false,
        price: price || null,
        sale_price: sale_price || null,
        sale_ends_at: sale_ends_at || null,
        revenue_share_percent: revenue_share_percent || 70,
        creator_id: is_purchasable ? userId : null
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating resource', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to create resource' });
    }

    res.status(201).json({ resource });

  } catch (error) {
    logger.error('Create resource error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/resources/:id - Update resource (admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;
    // User is verified admin via requireAdmin middleware

    const {
      title, description, type, topic, thumbnail_url, content_url, content_body, access_tier, duration,
      // Tier access fields
      free_for_supernova, free_for_mentorship,
      // Pricing fields
      is_purchasable, price, sale_price, sale_ends_at, revenue_share_percent
    } = req.body;

    // Build update object with only provided fields
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (type !== undefined) updateData.type = type;
    if (topic !== undefined) updateData.topic = topic;
    if (thumbnail_url !== undefined) updateData.thumbnail_url = thumbnail_url;
    if (content_url !== undefined) updateData.content_url = content_url;
    if (content_body !== undefined) updateData.content_body = content_body;
    if (access_tier !== undefined) updateData.access_tier = access_tier;
    if (free_for_supernova !== undefined) updateData.free_for_supernova = free_for_supernova;
    if (free_for_mentorship !== undefined) updateData.free_for_mentorship = free_for_mentorship;
    if (duration !== undefined) updateData.duration = duration;
    // Pricing fields
    if (is_purchasable !== undefined) updateData.is_purchasable = is_purchasable;
    if (price !== undefined) updateData.price = price;
    if (sale_price !== undefined) updateData.sale_price = sale_price;
    if (sale_ends_at !== undefined) updateData.sale_ends_at = sale_ends_at;
    if (revenue_share_percent !== undefined) updateData.revenue_share_percent = revenue_share_percent;
    updateData.updated_at = new Date().toISOString();

    const { data: resource, error } = await supabase
      .from('resources')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating resource', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to update resource' });
    }

    if (!resource) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    res.json({ resource });

  } catch (error) {
    logger.error('Update resource error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/resources/:id - Delete resource (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;
    // User is verified admin via requireAdmin middleware

    const { error } = await supabase
      .from('resources')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Error deleting resource', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to delete resource' });
    }

    res.json({ success: true, message: 'Resource deleted' });

  } catch (error) {
    logger.error('Delete resource error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================
// PURCHASE ENDPOINTS
// =============================================

// GET /api/resources/purchases - Get user's purchased resources
router.get('/purchases/list', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    // Use verified user ID from auth middleware
    const userId = req.userId;

    const { data: purchases, error } = await supabase
      .from('user_purchases')
      .select(`
        *,
        resources (id, title, description, type, topic, thumbnail_url, duration)
      `)
      .eq('user_id', userId)
      .order('purchased_at', { ascending: false });

    if (error) {
      logger.error('Error fetching purchases', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to fetch purchases' });
    }

    res.json({ purchases });

  } catch (error) {
    logger.error('Purchases fetch error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/resources/credits - Get user's credit balance and history
router.get('/credits/balance', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    // Use verified user ID from auth middleware
    const userId = req.userId;

    // Get credit balance
    const { data: profile } = await supabase
      .from('profiles')
      .select('credit_balance')
      .eq('id', userId)
      .single();

    // Get recent transactions
    const { data: transactions } = await supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    res.json({
      credit_balance: profile?.credit_balance || 0,
      transactions: transactions || []
    });

  } catch (error) {
    logger.error('Credits fetch error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/resources/purchase - Initiate a resource purchase
router.post('/purchase', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    // Use verified user ID from auth middleware
    const userId = req.userId;
    const { resource_id, use_credits } = req.body;

    if (!resource_id) {
      return res.status(400).json({ error: 'resource_id is required' });
    }

    // Get resource
    const { data: resource, error: resourceError } = await supabase
      .from('resources')
      .select('*')
      .eq('id', resource_id)
      .single();

    if (resourceError || !resource) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    if (!resource.is_purchasable) {
      return res.status(400).json({ error: 'This resource is not available for individual purchase' });
    }

    // Check if already purchased
    const { data: existingPurchase } = await supabase
      .from('user_purchases')
      .select('id')
      .eq('user_id', userId)
      .eq('resource_id', resource_id)
      .single();

    if (existingPurchase) {
      return res.status(400).json({ error: 'You already own this resource' });
    }

    // Calculate price
    let price = resource.price;
    if (resource.sale_price && resource.sale_ends_at) {
      const saleEnds = new Date(resource.sale_ends_at);
      if (saleEnds > new Date()) {
        price = resource.sale_price;
      }
    }

    // Get user's credit balance
    const { data: profile } = await supabase
      .from('profiles')
      .select('credit_balance')
      .eq('id', userId)
      .single();

    const creditBalance = profile?.credit_balance || 0;
    let creditsToUse = 0;
    let amountToPay = price;

    if (use_credits && creditBalance > 0) {
      creditsToUse = Math.min(creditBalance, price);
      amountToPay = price - creditsToUse;
    }

    // If fully covered by credits, complete purchase immediately
    if (amountToPay <= 0) {
      // Deduct credits
      await supabase
        .from('profiles')
        .update({ credit_balance: creditBalance - creditsToUse })
        .eq('id', userId);

      // Record credit transaction
      await supabase
        .from('credit_transactions')
        .insert({
          user_id: userId,
          amount: -creditsToUse,
          type: 'spent',
          description: `Purchased: ${resource.title}`,
          resource_id
        });

      // Create purchase record
      const { data: purchase, error: purchaseError } = await supabase
        .from('user_purchases')
        .insert({
          user_id: userId,
          resource_id,
          amount_paid: 0,
          original_price: resource.price,
          payment_provider: 'credits'
        })
        .select()
        .single();

      if (purchaseError) {
        logger.error('Purchase error', { error: purchaseError.message, requestId: req.id });
        return res.status(500).json({ error: 'Failed to complete purchase' });
      }

      // Handle creator earnings if applicable
      if (resource.creator_id && resource.revenue_share_percent) {
        const creatorAmount = (price * resource.revenue_share_percent) / 100;
        const platformFee = price - creatorAmount;

        await supabase
          .from('creator_earnings')
          .insert({
            creator_id: resource.creator_id,
            purchase_id: purchase.id,
            resource_id,
            gross_amount: price,
            platform_fee: platformFee,
            net_amount: creatorAmount
          });
      }

      return res.json({
        success: true,
        purchase,
        message: 'Purchase completed with credits',
        credits_used: creditsToUse
      });
    }

    // Otherwise, return payment info for Coinbase
    res.json({
      requires_payment: true,
      resource_id,
      resource_title: resource.title,
      original_price: resource.price,
      current_price: price,
      credits_available: creditBalance,
      credits_to_use: creditsToUse,
      amount_to_pay: amountToPay
    });

  } catch (error) {
    logger.error('Purchase initiation error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/resources/purchase/confirm - Confirm purchase after payment
router.post('/purchase/confirm', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    // Use verified user ID from auth middleware
    const userId = req.userId;
    const { resource_id, payment_id, credits_used } = req.body;

    if (!resource_id) {
      return res.status(400).json({ error: 'resource_id is required' });
    }

    // Get resource
    const { data: resource } = await supabase
      .from('resources')
      .select('*')
      .eq('id', resource_id)
      .single();

    if (!resource) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    // Calculate price paid
    let price = resource.price;
    if (resource.sale_price && resource.sale_ends_at) {
      const saleEnds = new Date(resource.sale_ends_at);
      if (saleEnds > new Date()) {
        price = resource.sale_price;
      }
    }

    const amountPaid = price - (credits_used || 0);

    // Deduct credits if used
    if (credits_used > 0) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('credit_balance')
        .eq('id', userId)
        .single();

      await supabase
        .from('profiles')
        .update({ credit_balance: (profile?.credit_balance || 0) - credits_used })
        .eq('id', userId);

      await supabase
        .from('credit_transactions')
        .insert({
          user_id: userId,
          amount: -credits_used,
          type: 'spent',
          description: `Partial payment for: ${resource.title}`,
          resource_id
        });
    }

    // Create purchase record
    const { data: purchase, error: purchaseError } = await supabase
      .from('user_purchases')
      .insert({
        user_id: userId,
        resource_id,
        amount_paid: amountPaid,
        original_price: resource.price,
        payment_provider: 'coinbase',
        payment_id
      })
      .select()
      .single();

    if (purchaseError) {
      logger.error('Purchase confirmation error', { error: purchaseError.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to confirm purchase' });
    }

    // Handle creator earnings
    if (resource.creator_id && resource.revenue_share_percent) {
      const creatorAmount = (price * resource.revenue_share_percent) / 100;
      const platformFee = price - creatorAmount;

      await supabase
        .from('creator_earnings')
        .insert({
          creator_id: resource.creator_id,
          purchase_id: purchase.id,
          resource_id,
          gross_amount: price,
          platform_fee: platformFee,
          net_amount: creatorAmount
        });
    }

    res.json({
      success: true,
      purchase,
      message: 'Purchase confirmed'
    });

  } catch (error) {
    logger.error('Purchase confirmation error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/resources/earnings - Get creator's earnings (for creators)
router.get('/earnings', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    // Use verified user ID from auth middleware
    const userId = req.userId;

    // Get earnings summary
    const { data: earnings, error } = await supabase
      .from('creator_earnings')
      .select(`
        *,
        resources (title),
        user_purchases (purchased_at)
      `)
      .eq('creator_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Earnings fetch error', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to fetch earnings' });
    }

    // Calculate totals
    const totalEarned = earnings?.reduce((sum, e) => sum + parseFloat(e.net_amount), 0) || 0;
    const pendingPayout = earnings?.filter(e => !e.paid_out).reduce((sum, e) => sum + parseFloat(e.net_amount), 0) || 0;
    const paidOut = earnings?.filter(e => e.paid_out).reduce((sum, e) => sum + parseFloat(e.net_amount), 0) || 0;

    res.json({
      earnings,
      summary: {
        total_earned: totalEarned,
        pending_payout: pendingPayout,
        paid_out: paidOut
      }
    });

  } catch (error) {
    logger.error('Earnings fetch error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
