/**
 * Content Filter Module
 * Manages blocked words for content restrictions in safe and NSFW modes
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
// Separate caches for each mode
let safeModeCache = null;
let nsfwModeCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get blocked words from cache or database for a specific mode
 * @param {string} mode - 'safe' or 'nsfw'
 */
async function getBlockedWords(mode = 'safe') {
  const now = Date.now();

  // Check cache based on mode
  const cache = mode === 'nsfw' ? nsfwModeCache : safeModeCache;
  if (cache && (now - cacheTimestamp) < CACHE_TTL) {
    return cache;
  }

  // Fetch from database
  if (!supabase) {
    console.error('Content filter: Supabase not configured');
    return [];
  }

  // Get words that apply to this mode or 'both'
  const { data, error } = await supabase
    .from('safe_mode_blocked_words')
    .select('word, category, applies_to')
    .eq('is_active', true)
    .or(`applies_to.eq.${mode},applies_to.eq.both`);

  if (error) {
    console.error('Error fetching blocked words:', error);
    // Return cached data if available, even if stale
    return cache || [];
  }

  // Update appropriate cache
  if (mode === 'nsfw') {
    nsfwModeCache = data || [];
  } else {
    safeModeCache = data || [];
  }
  cacheTimestamp = now;
  console.log(`📝 Blocked words cache updated for ${mode} mode: ${data?.length || 0} words`);

  return data || [];
}

/**
 * Clear the blocked words cache (call after modifications)
 */
function clearCache() {
  safeModeCache = null;
  nsfwModeCache = null;
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
 * Query param: mode ('safe' or 'nsfw') - defaults to 'safe'
 * Public access - no auth required
 */
router.get('/blocked-words', async (req, res) => {
  try {
    const mode = req.query.mode === 'nsfw' ? 'nsfw' : 'safe';
    const words = await getBlockedWords(mode);

    // Return just the words array for frontend (no categories needed for validation)
    const wordList = words.map(w => w.word.toLowerCase());

    res.json({
      words: wordList,
      count: wordList.length,
      mode: mode,
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
 * Body: { prompt, mode } - mode defaults to 'safe'
 * Public access - no auth required
 */
router.post('/validate', async (req, res) => {
  try {
    const { prompt, mode = 'safe' } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const validMode = mode === 'nsfw' ? 'nsfw' : 'safe';
    const blockedWords = await getBlockedWords(validMode);
    const isBlocked = containsBlockedContent(prompt, blockedWords);

    res.json({
      valid: !isBlocked,
      blocked: isBlocked,
      mode: validMode
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

    const { category, search, applies_to } = req.query;

    let query = supabase
      .from('safe_mode_blocked_words')
      .select('*')
      .order('word', { ascending: true });

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    if (applies_to && applies_to !== 'all') {
      query = query.eq('applies_to', applies_to);
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

    const { word, category = 'explicit', applies_to = 'safe' } = req.body;

    if (!word || typeof word !== 'string' || word.trim().length === 0) {
      return res.status(400).json({ error: 'Word is required' });
    }

    // Validate applies_to value
    const validAppliesTo = ['safe', 'nsfw', 'both'].includes(applies_to) ? applies_to : 'safe';

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
        applies_to: validAppliesTo,
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
    const { word, category, is_active, applies_to } = req.body;

    const updates = {};
    if (word !== undefined) updates.word = word.trim().toLowerCase();
    if (category !== undefined) updates.category = category;
    if (is_active !== undefined) updates.is_active = is_active;
    if (applies_to !== undefined && ['safe', 'nsfw', 'both'].includes(applies_to)) {
      updates.applies_to = applies_to;
    }

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

    const { words, category = 'explicit', applies_to = 'safe' } = req.body;

    if (!Array.isArray(words) || words.length === 0) {
      return res.status(400).json({ error: 'Words array is required' });
    }

    // Validate applies_to value
    const validAppliesTo = ['safe', 'nsfw', 'both'].includes(applies_to) ? applies_to : 'safe';

    // Clean and normalize words
    const cleanedWords = words
      .filter(w => typeof w === 'string' && w.trim().length > 0)
      .map(w => w.trim().toLowerCase());

    if (cleanedWords.length === 0) {
      return res.status(400).json({ error: 'No valid words provided' });
    }

    // Get existing words to filter out duplicates
    const { data: existingWords } = await supabase
      .from('safe_mode_blocked_words')
      .select('word')
      .in('word', cleanedWords);

    const existingSet = new Set((existingWords || []).map(w => w.word.toLowerCase()));

    // Filter out words that already exist
    const newWords = cleanedWords.filter(w => !existingSet.has(w));

    if (newWords.length === 0) {
      return res.status(200).json({
        message: 'All words already exist',
        added: 0,
        requested: words.length,
        duplicates: words.length
      });
    }

    // Prepare words for insertion
    const wordsToInsert = newWords.map(w => ({
      word: w,
      category: category,
      applies_to: validAppliesTo,
      is_active: true
    }));

    // Insert new words
    const { data, error } = await supabase
      .from('safe_mode_blocked_words')
      .insert(wordsToInsert)
      .select();

    if (error) {
      console.error('Error bulk adding words:', error);
      return res.status(500).json({ error: 'Failed to add words', details: error.message });
    }

    // Clear cache
    clearCache();

    res.status(201).json({
      message: `Added ${data?.length || 0} words`,
      added: data?.length || 0,
      requested: words.length,
      duplicates: words.length - (data?.length || 0)
    });
  } catch (error) {
    console.error('Error bulk adding words:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
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
