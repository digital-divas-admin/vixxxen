-- ===========================================
-- ADD APPEARANCE DESCRIPTION TO CHARACTERS
-- ===========================================
-- This adds a field for consistent character appearance descriptions
-- used by AI prompt generation in workflows

-- Add appearance_description column to marketplace_characters table
ALTER TABLE marketplace_characters
ADD COLUMN IF NOT EXISTS appearance_description TEXT;

COMMENT ON COLUMN marketplace_characters.appearance_description IS
'Detailed physical appearance description for consistent AI prompt generation.
Example: "Young woman with wavy blonde hair to shoulders, bright blue eyes, fair skin, athletic build, age 25"';
