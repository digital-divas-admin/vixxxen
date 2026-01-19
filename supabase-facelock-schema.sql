-- Face Lock Schema
-- Allows users to save reference images per character for consistent AI generations
-- Supports separate SFW and NSFW image sets (up to 5 each)

-- Main character_facelock table
CREATE TABLE IF NOT EXISTS character_facelock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id UUID NOT NULL,  -- References the character (custom or system)

  -- Image reference (can be user_images ID or direct URL)
  image_id UUID REFERENCES user_images(id) ON DELETE CASCADE,
  image_url TEXT,  -- Fallback if not using user_images

  -- Mode and ordering
  mode TEXT NOT NULL CHECK (mode IN ('sfw', 'nsfw')),
  position INTEGER NOT NULL CHECK (position >= 1 AND position <= 5),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  -- Ensure unique position per user/character/mode
  CONSTRAINT unique_facelock_position UNIQUE (user_id, character_id, mode, position),
  -- Ensure max 5 images per user/character/mode
  CONSTRAINT valid_position CHECK (position BETWEEN 1 AND 5)
);

-- Create indexes for common queries
CREATE INDEX idx_facelock_user_character ON character_facelock(user_id, character_id);
CREATE INDEX idx_facelock_user_char_mode ON character_facelock(user_id, character_id, mode);
CREATE INDEX idx_facelock_image ON character_facelock(image_id) WHERE image_id IS NOT NULL;

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_facelock_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER facelock_updated_at
  BEFORE UPDATE ON character_facelock
  FOR EACH ROW
  EXECUTE FUNCTION update_facelock_updated_at();

-- Row Level Security
ALTER TABLE character_facelock ENABLE ROW LEVEL SECURITY;

-- Users can view their own face lock images
CREATE POLICY "Users can view own facelock"
  ON character_facelock FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own face lock images
CREATE POLICY "Users can add facelock images"
  ON character_facelock FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own face lock images
CREATE POLICY "Users can update own facelock"
  ON character_facelock FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own face lock images
CREATE POLICY "Users can delete own facelock"
  ON character_facelock FOR DELETE
  USING (auth.uid() = user_id);

-- Function to get next available position for a user/character/mode
CREATE OR REPLACE FUNCTION get_next_facelock_position(
  p_user_id UUID,
  p_character_id UUID,
  p_mode TEXT
)
RETURNS INTEGER AS $$
DECLARE
  next_pos INTEGER;
BEGIN
  SELECT COALESCE(MAX(position), 0) + 1 INTO next_pos
  FROM character_facelock
  WHERE user_id = p_user_id
    AND character_id = p_character_id
    AND mode = p_mode;

  IF next_pos > 5 THEN
    RETURN NULL;  -- Set is full
  END IF;

  RETURN next_pos;
END;
$$ LANGUAGE plpgsql;

-- Function to reorder positions after deletion
CREATE OR REPLACE FUNCTION reorder_facelock_positions()
RETURNS TRIGGER AS $$
BEGIN
  -- Reorder remaining images to fill gaps
  WITH numbered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY position) as new_pos
    FROM character_facelock
    WHERE user_id = OLD.user_id
      AND character_id = OLD.character_id
      AND mode = OLD.mode
  )
  UPDATE character_facelock cf
  SET position = n.new_pos
  FROM numbered n
  WHERE cf.id = n.id
    AND cf.position != n.new_pos;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER facelock_reorder_after_delete
  AFTER DELETE ON character_facelock
  FOR EACH ROW
  EXECUTE FUNCTION reorder_facelock_positions();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_next_facelock_position TO authenticated;
