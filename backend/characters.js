const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { requireAuth, optionalAuth, requireAdmin } = require('./middleware/auth');
const { logger } = require('./services/logger');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
}

// ===========================================
// SERVER-SIDE CHARACTER CACHE
// ===========================================
const CACHE_TTL = 30 * 1000; // 30 seconds

let charactersCache = {
  public: { data: null, timestamp: 0 },
  all: { data: null, timestamp: 0 }
};

function getCachedCharacters(type) {
  const cache = charactersCache[type];
  if (cache.data && (Date.now() - cache.timestamp) < CACHE_TTL) {
    logger.debug('Characters cache hit', { type });
    return cache.data;
  }
  return null;
}

function setCachedCharacters(type, data) {
  charactersCache[type] = { data, timestamp: Date.now() };
  logger.debug('Characters cache set', { type, count: data?.length || 0 });
}

function clearCharactersCache() {
  charactersCache = {
    public: { data: null, timestamp: 0 },
    all: { data: null, timestamp: 0 }
  };
  logger.debug('Characters cache cleared');
}

// GET /api/characters - Get all characters with ownership status
router.get('/', optionalAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    // Use verified user ID from auth middleware
    const userId = req.userId;

    // Get user's owned characters
    let ownedCharacterIds = [];
    if (userId) {
      const { data: owned } = await supabase
        .from('user_characters')
        .select('character_id')
        .eq('user_id', userId);

      ownedCharacterIds = owned?.map(o => o.character_id) || [];
    }

    // Try to get from cache first
    let characters = getCachedCharacters('public');

    if (!characters) {
      // Get all active AND listed characters (public marketplace)
      // Exclude characters explicitly marked as unlisted (is_listed = false)
      // Characters with is_listed = true or NULL are shown
      // Only select columns needed for marketplace display
      const { data, error } = await supabase
        .from('marketplace_characters')
        .select('id, name, category, description, price, rating, purchases, tags, image_url, gallery_images, lora_url, trigger_word, is_active, sort_order, is_listed')
        .eq('is_active', true)
        .not('is_listed', 'eq', false)
        .order('sort_order', { ascending: true });

      if (error) {
        logger.error('Error fetching characters', { error: error.message, requestId: req.id });
        return res.status(500).json({ error: 'Failed to fetch characters' });
      }

      characters = data;
      setCachedCharacters('public', characters);
    }

    // Add ownership status
    const processedCharacters = characters.map(char => ({
      ...char,
      is_owned: char.price === 0 || ownedCharacterIds.includes(char.id)
    }));

    res.json({ characters: processedCharacters });

  } catch (error) {
    logger.error('Characters fetch error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/characters/all - Get all characters including inactive (admin only)
router.get('/all', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    // User is verified admin via requireAdmin middleware

    // Try to get from cache first
    let characters = getCachedCharacters('all');

    if (!characters) {
      const { data, error } = await supabase
        .from('marketplace_characters')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) {
        logger.error('Error fetching all characters', { error: error.message, requestId: req.id });
        return res.status(500).json({ error: 'Failed to fetch characters' });
      }

      characters = data;
      setCachedCharacters('all', characters);
    }

    res.json({ characters });

  } catch (error) {
    logger.error('Characters fetch error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/characters - Create a new character (admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    // User is verified admin via requireAdmin middleware

    const {
      name, category, description, price, tags,
      image_url, gallery_images, lora_url, trigger_word,
      is_active, is_listed, sort_order
    } = req.body;

    if (!name || !category) {
      return res.status(400).json({ error: 'Name and category are required' });
    }

    const { data: character, error } = await supabase
      .from('marketplace_characters')
      .insert({
        name,
        category,
        description,
        price: price || 0,
        tags: tags || [],
        image_url,
        gallery_images: gallery_images || [],
        lora_url,
        trigger_word,
        is_active: is_active !== false,
        is_listed: is_listed !== false,
        sort_order: sort_order || 0
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating character', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to create character' });
    }

    // Clear cache so new character appears immediately
    clearCharactersCache();

    res.status(201).json({ character });

  } catch (error) {
    logger.error('Create character error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/characters/:id - Update a character (admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;
    // User is verified admin via requireAdmin middleware

    const {
      name, category, description, price, rating, purchases, tags,
      image_url, gallery_images, lora_url, trigger_word,
      is_active, is_listed, sort_order
    } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (category !== undefined) updateData.category = category;
    if (description !== undefined) updateData.description = description;
    if (price !== undefined) updateData.price = price;
    if (rating !== undefined) updateData.rating = rating;
    if (purchases !== undefined) updateData.purchases = purchases;
    if (tags !== undefined) updateData.tags = tags;
    if (image_url !== undefined) updateData.image_url = image_url;
    if (gallery_images !== undefined) updateData.gallery_images = gallery_images;
    if (lora_url !== undefined) updateData.lora_url = lora_url;
    if (trigger_word !== undefined) updateData.trigger_word = trigger_word;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (is_listed !== undefined) updateData.is_listed = is_listed;
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    updateData.updated_at = new Date().toISOString();

    const { data: character, error } = await supabase
      .from('marketplace_characters')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating character', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to update character' });
    }

    // Clear cache so updates appear immediately
    clearCharactersCache();

    res.json({ character });

  } catch (error) {
    logger.error('Update character error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/characters/:id - Delete a character (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;
    // User is verified admin via requireAdmin middleware

    const { error } = await supabase
      .from('marketplace_characters')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Error deleting character', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to delete character' });
    }

    // Clear cache so deletion is reflected immediately
    clearCharactersCache();

    res.json({ success: true });

  } catch (error) {
    logger.error('Delete character error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/characters/:id/purchase - Purchase a character
router.post('/:id/purchase', requireAuth, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;
    // Use verified user ID from auth middleware
    const userId = req.userId;

    // Get character info
    const { data: character, error: charError } = await supabase
      .from('marketplace_characters')
      .select('*')
      .eq('id', id)
      .single();

    if (charError || !character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // Check if already owned
    const { data: existing } = await supabase
      .from('user_characters')
      .select('id')
      .eq('user_id', userId)
      .eq('character_id', id)
      .single();

    if (existing) {
      return res.json({ success: true, message: 'Already owned' });
    }

    // Record purchase
    const { error } = await supabase
      .from('user_characters')
      .insert({
        user_id: userId,
        character_id: id,
        amount_paid: character.price
      });

    if (error) {
      logger.error('Error recording purchase', { error: error.message, requestId: req.id });
      return res.status(500).json({ error: 'Failed to record purchase' });
    }

    // Increment purchase count
    await supabase
      .from('marketplace_characters')
      .update({ purchases: (character.purchases || 0) + 1 })
      .eq('id', id);

    res.json({ success: true });

  } catch (error) {
    logger.error('Purchase error', { error: error.message, requestId: req.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
