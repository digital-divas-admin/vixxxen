/**
 * Content Filter Module
 * Manages blocked words for safe mode content restrictions
 */
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
// BLOCKED WORDS CACHE
// ===========================================
let blockedWordsCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get blocked words from cache or database
 */
async function getBlockedWords() {
  const now = Date.now();

  // Return cached data if still valid
  if (blockedWordsCache && (now - cacheTimestamp) < CACHE_TTL) {
    return blockedWordsCache;
  }

  // Fetch from database
  if (!supabase) {
    console.error('Content filter: Supabase not configured');
    return [];
  }

  const { data, error } = await supabase
    .from('safe_mode_blocked_words')
    .select('word, category')
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching blocked words:', error);
    // Return cached data if available, even if stale
    return blockedWordsCache || [];
  }

  // Update cache
  blockedWordsCache = data || [];
  cacheTimestamp = now;
  console.log(`📝 Blocked words cache updated: ${blockedWordsCache.length} words`);

  return blockedWordsCache;
}

/**
 * Clear the blocked words cache (call after modifications)
 */
function clearCache() {
  blockedWordsCache = null;
  cacheTimestamp = 0;
  console.log('📝 Blocked words cache cleared');
}

/**
 * Check if a prompt contains blocked words (substring match, case insensitive)
 * @param {string} prompt - The prompt to check
 * @param {Array} blockedWords - Array of {word, category} objects
 * @returns {boolean} - True if prompt contains blocked words
 */
function containsBlockedContent(prompt, blockedWords) {
  if (!prompt || !blockedWords || blockedWords.length === 0) {
    return false;
  }

  const lowerPrompt = prompt.toLowerCase();

  for (const { word } of blockedWords) {
    if (lowerPrompt.includes(word.toLowerCase())) {
      return true;
    }
  }

  return false;
}

// ===========================================
// PUBLIC ENDPOINTS
// ===========================================

/**
 * GET /api/content-filter/blocked-words
 * Get list of active blocked words for frontend validation
 * Public access - no auth required
 */
router.get('/blocked-words', async (req, res) => {
  try {
    const words = await getBlockedWords();

    // Return just the words array for frontend (no categories needed for validation)
    const wordList = words.map(w => w.word.toLowerCase());

    res.json({
      words: wordList,
      count: wordList.length,
      cached: Date.now() - cacheTimestamp < 1000 // Was this from cache?
    });
  } catch (error) {
    console.error('Error getting blocked words:', error);
    res.status(500).json({ error: 'Failed to fetch blocked words' });
  }
});

/**
 * POST /api/content-filter/validate
 * Validate a prompt against blocked words
 * Public access - no auth required
 */
router.post('/validate', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const blockedWords = await getBlockedWords();
    const isBlocked = containsBlockedContent(prompt, blockedWords);

    res.json({
      valid: !isBlocked,
      blocked: isBlocked
    });
  } catch (error) {
    console.error('Error validating prompt:', error);
    res.status(500).json({ error: 'Validation failed' });
  }
});

// ===========================================
// ADMIN ENDPOINTS
// ===========================================

/**
 * GET /api/content-filter/admin/words
 * Get all blocked words with full details (admin only)
 */
router.get('/admin/words', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { category, search } = req.query;

    let query = supabase
      .from('safe_mode_blocked_words')
      .select('*')
      .order('word', { ascending: true });

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    if (search) {
      query = query.ilike('word', `%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching blocked words:', error);
      return res.status(500).json({ error: 'Failed to fetch blocked words' });
    }

    res.json({
      words: data,
      count: data.length
    });
  } catch (error) {
    console.error('Error in admin words endpoint:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/content-filter/admin/words
 * Add a new blocked word (admin only)
 */
router.post('/admin/words', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { word, category = 'explicit' } = req.body;

    if (!word || typeof word !== 'string' || word.trim().length === 0) {
      return res.status(400).json({ error: 'Word is required' });
    }

    const trimmedWord = word.trim().toLowerCase();

    // Check if word already exists
    const { data: existing } = await supabase
      .from('safe_mode_blocked_words')
      .select('id')
      .ilike('word', trimmedWord)
      .single();

    if (existing) {
      return res.status(409).json({ error: 'Word already exists' });
    }

    const { data, error } = await supabase
      .from('safe_mode_blocked_words')
      .insert({
        word: trimmedWord,
        category: category,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding blocked word:', error);
      return res.status(500).json({ error: 'Failed to add word' });
    }

    // Clear cache so new word takes effect immediately
    clearCache();

    res.status(201).json({
      message: 'Word added successfully',
      word: data
    });
  } catch (error) {
    console.error('Error adding blocked word:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /api/content-filter/admin/words/:id
 * Update a blocked word (admin only)
 */
router.put('/admin/words/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;
    const { word, category, is_active } = req.body;

    const updates = {};
    if (word !== undefined) updates.word = word.trim().toLowerCase();
    if (category !== undefined) updates.category = category;
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const { data, error } = await supabase
      .from('safe_mode_blocked_words')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating blocked word:', error);
      return res.status(500).json({ error: 'Failed to update word' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Word not found' });
    }

    // Clear cache
    clearCache();

    res.json({
      message: 'Word updated successfully',
      word: data
    });
  } catch (error) {
    console.error('Error updating blocked word:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /api/content-filter/admin/words/:id
 * Delete a blocked word (admin only)
 */
router.delete('/admin/words/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { id } = req.params;

    const { error } = await supabase
      .from('safe_mode_blocked_words')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting blocked word:', error);
      return res.status(500).json({ error: 'Failed to delete word' });
    }

    // Clear cache
    clearCache();

    res.json({
      message: 'Word deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting blocked word:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/content-filter/admin/words/bulk
 * Add multiple blocked words at once (admin only)
 */
router.post('/admin/words/bulk', requireAdmin, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { words, category = 'explicit' } = req.body;

    if (!Array.isArray(words) || words.length === 0) {
      return res.status(400).json({ error: 'Words array is required' });
    }

    // Prepare words for insertion
    const wordsToInsert = words
      .filter(w => typeof w === 'string' && w.trim().length > 0)
      .map(w => ({
        word: w.trim().toLowerCase(),
        category: category,
        is_active: true
      }));

    if (wordsToInsert.length === 0) {
      return res.status(400).json({ error: 'No valid words provided' });
    }

    // Insert with upsert to handle duplicates gracefully
    const { data, error } = await supabase
      .from('safe_mode_blocked_words')
      .upsert(wordsToInsert, {
        onConflict: 'word',
        ignoreDuplicates: true
      })
      .select();

    if (error) {
      console.error('Error bulk adding words:', error);
      return res.status(500).json({ error: 'Failed to add words' });
    }

    // Clear cache
    clearCache();

    res.status(201).json({
      message: `Added ${data?.length || 0} words`,
      added: data?.length || 0,
      requested: words.length
    });
  } catch (error) {
    console.error('Error bulk adding words:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/content-filter/admin/cache/clear
 * Manually clear the blocked words cache (admin only)
 */
router.post('/admin/cache/clear', requireAdmin, async (req, res) => {
  clearCache();
  res.json({ message: 'Cache cleared successfully' });
});

// Export router and helper functions for use in other modules
module.exports = router;
module.exports.getBlockedWords = getBlockedWords;
module.exports.containsBlockedContent = containsBlockedContent;
module.exports.clearCache = clearCache;
