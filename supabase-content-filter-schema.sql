-- ===========================================
-- SAFE MODE BLOCKED WORDS SCHEMA
-- ===========================================
-- This table stores words/phrases that are blocked in Safe Mode
-- to prevent generation of inappropriate content.

-- Create the blocked words table
CREATE TABLE IF NOT EXISTS safe_mode_blocked_words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word TEXT NOT NULL,
  category TEXT DEFAULT 'explicit',  -- 'explicit', 'violence', 'other'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create unique index on lowercase word to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_words_word_lower
ON safe_mode_blocked_words (LOWER(word));

-- Create index for active words lookup
CREATE INDEX IF NOT EXISTS idx_blocked_words_active
ON safe_mode_blocked_words (is_active) WHERE is_active = true;

-- Create index for category filtering
CREATE INDEX IF NOT EXISTS idx_blocked_words_category
ON safe_mode_blocked_words (category);

-- Enable Row Level Security
ALTER TABLE safe_mode_blocked_words ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read active blocked words (needed for frontend validation)
CREATE POLICY "Anyone can read active blocked words"
ON safe_mode_blocked_words
FOR SELECT
USING (is_active = true);

-- Policy: Only admins can insert/update/delete
-- Note: You'll need to create an is_admin function or use a role check
CREATE POLICY "Admins can manage blocked words"
ON safe_mode_blocked_words
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_admin = true
  )
);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_blocked_words_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_blocked_words_updated_at ON safe_mode_blocked_words;
CREATE TRIGGER trigger_blocked_words_updated_at
  BEFORE UPDATE ON safe_mode_blocked_words
  FOR EACH ROW
  EXECUTE FUNCTION update_blocked_words_updated_at();

-- ===========================================
-- INITIAL SEED DATA
-- ===========================================
-- Common explicit/NSFW terms to block in safe mode

INSERT INTO safe_mode_blocked_words (word, category) VALUES
  -- Explicit nudity terms
  ('nude', 'explicit'),
  ('naked', 'explicit'),
  ('nudity', 'explicit'),
  ('topless', 'explicit'),
  ('bottomless', 'explicit'),
  ('unclothed', 'explicit'),
  ('undressed', 'explicit'),
  ('bare breasts', 'explicit'),
  ('bare chest', 'explicit'),
  ('exposed', 'explicit'),
  ('nsfw', 'explicit'),
  ('xxx', 'explicit'),
  ('porn', 'explicit'),
  ('pornographic', 'explicit'),
  ('erotic', 'explicit'),
  ('sexual', 'explicit'),
  ('sexy', 'explicit'),
  ('seductive', 'explicit'),
  ('provocative', 'explicit'),
  ('lingerie', 'explicit'),
  ('underwear', 'explicit'),
  ('bikini', 'explicit'),
  ('bra', 'explicit'),
  ('panties', 'explicit'),
  ('thong', 'explicit'),
  ('nipple', 'explicit'),
  ('nipples', 'explicit'),
  ('genitals', 'explicit'),
  ('breasts', 'explicit'),
  ('boobs', 'explicit'),
  ('butt', 'explicit'),
  ('buttocks', 'explicit'),
  ('ass', 'explicit'),
  ('penis', 'explicit'),
  ('vagina', 'explicit'),
  ('vulva', 'explicit'),
  ('groin', 'explicit'),
  ('crotch', 'explicit'),
  ('cleavage', 'explicit'),
  ('strip', 'explicit'),
  ('stripper', 'explicit'),
  ('striptease', 'explicit'),
  ('pole dance', 'explicit'),
  ('lap dance', 'explicit'),
  ('dominatrix', 'explicit'),
  ('bondage', 'explicit'),
  ('fetish', 'explicit'),
  ('kink', 'explicit'),
  ('bdsm', 'explicit'),
  ('hentai', 'explicit'),
  ('lewd', 'explicit'),
  ('slutty', 'explicit'),
  ('whore', 'explicit'),
  ('hooker', 'explicit'),
  ('escort', 'explicit'),
  ('prostitute', 'explicit'),
  ('orgasm', 'explicit'),
  ('masturbat', 'explicit'),
  ('intercourse', 'explicit'),
  ('fornication', 'explicit'),
  ('copulation', 'explicit')
ON CONFLICT DO NOTHING;

-- Verify the data
-- SELECT COUNT(*) as total_words FROM safe_mode_blocked_words;
-- SELECT * FROM safe_mode_blocked_words ORDER BY category, word;
