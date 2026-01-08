-- System Settings Table
-- Stores key-value configuration for the application
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);

-- Enable RLS (Row Level Security)
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can read/write (backend only)
-- This ensures settings can only be accessed via the backend API
CREATE POLICY "Service role full access" ON system_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Insert default GPU configuration
INSERT INTO system_settings (key, value)
VALUES (
  'gpu_config',
  '{
    "mode": "serverless",
    "dedicatedUrl": null,
    "dedicatedTimeout": 5000,
    "enabled": true
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Grant usage to service role
GRANT ALL ON system_settings TO service_role;
