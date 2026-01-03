-- 2257 Compliance Schema for DivaForge
-- Run this in Supabase SQL Editor
-- This creates audit trail for all AI-generated content

-- Create generation_records table
CREATE TABLE IF NOT EXISTS generation_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Content identification
  content_hash TEXT NOT NULL,              -- SHA-256 hash of generated content
  content_type TEXT NOT NULL CHECK (content_type IN ('image', 'video', 'audio')),

  -- Generation details
  model_used TEXT NOT NULL,                -- AI model used (nano-banana, seedream, kling, etc.)
  prompt TEXT,                             -- User's prompt (may be null for privacy)
  nsfw_mode BOOLEAN DEFAULT false,         -- Was NSFW mode enabled

  -- Output details
  output_url TEXT,                         -- URL/path to generated content (if stored)
  output_count INTEGER DEFAULT 1,          -- Number of outputs generated

  -- Audit metadata
  ip_address TEXT,                         -- User's IP at time of generation
  user_agent TEXT,                         -- Browser/client info
  country_code TEXT,                       -- Country from IP
  region_code TEXT,                        -- State/region from IP

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Index for faster queries
  CONSTRAINT generation_records_content_hash_idx UNIQUE (content_hash)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_generation_records_user_id ON generation_records(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_records_created_at ON generation_records(created_at);
CREATE INDEX IF NOT EXISTS idx_generation_records_content_type ON generation_records(content_type);
CREATE INDEX IF NOT EXISTS idx_generation_records_nsfw ON generation_records(nsfw_mode);

-- Enable RLS
ALTER TABLE generation_records ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own records
CREATE POLICY "Users can read own generation records"
  ON generation_records FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Authenticated users can insert records
CREATE POLICY "Authenticated users can insert generation records"
  ON generation_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Admins can read all records (for compliance audits)
CREATE POLICY "Admins can read all generation records"
  ON generation_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create a view for compliance reporting
CREATE OR REPLACE VIEW generation_stats AS
SELECT
  DATE_TRUNC('day', created_at) as date,
  content_type,
  nsfw_mode,
  COUNT(*) as generation_count,
  COUNT(DISTINCT user_id) as unique_users
FROM generation_records
GROUP BY DATE_TRUNC('day', created_at), content_type, nsfw_mode
ORDER BY date DESC;

-- Grant access to the view
GRANT SELECT ON generation_stats TO authenticated;

-- Add comment for documentation
COMMENT ON TABLE generation_records IS '2257 Compliance: Audit trail for all AI-generated content. Records retained for 7 years per industry standard.';
