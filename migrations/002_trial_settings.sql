-- Trial Settings Table
-- Configurable settings for the "Try It Now" trial feature
-- Allows admins to select demo character, customize prompts, and reference images

CREATE TABLE IF NOT EXISTS trial_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Character configuration (no FK constraint - validated at application level)
  character_id UUID,
  character_name TEXT DEFAULT 'Luna',
  character_preview_image TEXT,  -- URL shown in modal

  -- Prompt configuration
  base_prompt TEXT DEFAULT 'beautiful young woman, elegant, photorealistic, high quality',
  placeholder_text TEXT DEFAULT 'e.g. wearing a red dress, walking in a park at golden hour...',

  -- Reference images for img2img (JSON array of URLs)
  reference_images JSONB DEFAULT '[]'::jsonb,

  -- Feature toggle
  enabled BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Only one settings row should exist (singleton pattern)
CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_settings_singleton ON trial_settings ((true));

-- RLS: Service role only (backend access)
ALTER TABLE trial_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for trial_settings" ON trial_settings
  FOR ALL
  USING (auth.role() = 'service_role');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_trial_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_trial_settings_updated_at ON trial_settings;
CREATE TRIGGER update_trial_settings_updated_at
  BEFORE UPDATE ON trial_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_trial_settings_updated_at();

-- Insert default settings row
INSERT INTO trial_settings (
  character_name,
  base_prompt,
  placeholder_text,
  reference_images,
  enabled
) VALUES (
  'Luna',
  'beautiful young woman with flowing silver hair and bright blue eyes, elegant, photorealistic, high quality',
  'e.g. wearing a red dress, walking in a park at golden hour...',
  '[]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

COMMENT ON TABLE trial_settings IS 'Configuration for the trial generation feature';
COMMENT ON COLUMN trial_settings.character_id IS 'Optional character ID for demo character (no FK - validated at app level)';
COMMENT ON COLUMN trial_settings.reference_images IS 'Array of image URLs sent to Seedream for consistent character generation';
