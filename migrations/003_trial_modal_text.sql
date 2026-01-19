-- Trial Modal Text Configuration
-- Adds configurable text fields for the trial popup modal

-- Add new columns for modal text customization
ALTER TABLE trial_settings
ADD COLUMN IF NOT EXISTS modal_title TEXT DEFAULT 'Try AI Image Generation',
ADD COLUMN IF NOT EXISTS modal_subtitle TEXT DEFAULT 'See what you can create - no signup required',
ADD COLUMN IF NOT EXISTS character_subtitle TEXT DEFAULT 'Demo Character',
ADD COLUMN IF NOT EXISTS character_description TEXT DEFAULT 'Generate multiple images with the same character',
ADD COLUMN IF NOT EXISTS input_label TEXT DEFAULT 'Describe the scene',
ADD COLUMN IF NOT EXISTS generate_button_text TEXT DEFAULT 'Generate',
ADD COLUMN IF NOT EXISTS conversion_heading TEXT DEFAULT 'Like what you see?',
ADD COLUMN IF NOT EXISTS benefits_list JSONB DEFAULT '[
  "20 free credits every month",
  "Choose from 50+ unique characters",
  "Access NSFW content",
  "Save and download your images"
]'::jsonb,
ADD COLUMN IF NOT EXISTS cta_button_text TEXT DEFAULT 'Create Free Account',
ADD COLUMN IF NOT EXISTS exhausted_heading TEXT DEFAULT 'You''ve used your free trials!',
ADD COLUMN IF NOT EXISTS exhausted_description TEXT DEFAULT 'Create a free account to continue generating amazing AI images.';

-- Update existing row with defaults if columns are null
UPDATE trial_settings SET
  modal_title = COALESCE(modal_title, 'Try AI Image Generation'),
  modal_subtitle = COALESCE(modal_subtitle, 'See what you can create - no signup required'),
  character_subtitle = COALESCE(character_subtitle, 'Demo Character'),
  character_description = COALESCE(character_description, 'Generate multiple images with the same character'),
  input_label = COALESCE(input_label, 'Describe the scene'),
  generate_button_text = COALESCE(generate_button_text, 'Generate'),
  conversion_heading = COALESCE(conversion_heading, 'Like what you see?'),
  benefits_list = COALESCE(benefits_list, '[
    "20 free credits every month",
    "Choose from 50+ unique characters",
    "Access NSFW content",
    "Save and download your images"
  ]'::jsonb),
  cta_button_text = COALESCE(cta_button_text, 'Create Free Account'),
  exhausted_heading = COALESCE(exhausted_heading, 'You''ve used your free trials!'),
  exhausted_description = COALESCE(exhausted_description, 'Create a free account to continue generating amazing AI images.');

COMMENT ON COLUMN trial_settings.modal_title IS 'Main heading shown in trial modal';
COMMENT ON COLUMN trial_settings.modal_subtitle IS 'Subheading shown below the title';
COMMENT ON COLUMN trial_settings.character_subtitle IS 'Text after character name (e.g. "Demo Character")';
COMMENT ON COLUMN trial_settings.character_description IS 'Description below character name';
COMMENT ON COLUMN trial_settings.input_label IS 'Label above the prompt textarea';
COMMENT ON COLUMN trial_settings.generate_button_text IS 'Text on the generate button';
COMMENT ON COLUMN trial_settings.conversion_heading IS 'Heading for the signup prompt section';
COMMENT ON COLUMN trial_settings.benefits_list IS 'JSON array of benefit strings shown in bullet list';
COMMENT ON COLUMN trial_settings.cta_button_text IS 'Text on the signup call-to-action button';
COMMENT ON COLUMN trial_settings.exhausted_heading IS 'Heading shown when trials are exhausted';
COMMENT ON COLUMN trial_settings.exhausted_description IS 'Description shown when trials are exhausted';
