-- ===========================================
-- ADD APPEARANCE DESCRIPTION TO CHARACTERS
-- ===========================================
-- This adds a field for consistent character appearance descriptions
-- used by AI prompt generation in workflows

-- Add appearance_description column to characters table
ALTER TABLE characters
ADD COLUMN IF NOT EXISTS appearance_description TEXT;

-- Add comment explaining the field
COMMENT ON COLUMN characters.appearance_description IS
'Detailed physical appearance description for consistent AI prompt generation.
Example: "Young woman with wavy blonde hair to shoulders, bright blue eyes, fair skin, athletic build, age 25"';

-- If marketplace_characters also needs this (for future use)
ALTER TABLE marketplace_characters
ADD COLUMN IF NOT EXISTS appearance_description TEXT;

COMMENT ON COLUMN marketplace_characters.appearance_description IS
'Detailed physical appearance description for consistent AI prompt generation.';
