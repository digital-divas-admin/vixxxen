-- Face Lock Schema Fix
-- Adds foreign key constraint for character_id

-- Add foreign key constraint to marketplace_characters
-- This ensures referential integrity - facelock entries can only reference valid characters
ALTER TABLE character_facelock
ADD CONSTRAINT fk_facelock_character
FOREIGN KEY (character_id) REFERENCES marketplace_characters(id) ON DELETE CASCADE;

-- Note: ON DELETE CASCADE means if a character is deleted, all facelock entries for it are also deleted
