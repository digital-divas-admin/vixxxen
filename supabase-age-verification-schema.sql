-- Age Verification Schema for DivaForge
-- Run this in Supabase SQL Editor

-- Create age_verifications table
CREATE TABLE IF NOT EXISTS age_verifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  verified BOOLEAN DEFAULT false NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('self_declaration', 'blocked', 'id_verified')),
  country_code TEXT,
  region_code TEXT,
  ip_address TEXT,
  verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_age_verifications_user_id ON age_verifications(user_id);

-- Enable RLS
ALTER TABLE age_verifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own verification status
CREATE POLICY "Users can read own verification"
  ON age_verifications FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own verification
CREATE POLICY "Users can insert own verification"
  ON age_verifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own verification
CREATE POLICY "Users can update own verification"
  ON age_verifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Add content_mode to profiles table (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'content_mode'
  ) THEN
    ALTER TABLE profiles ADD COLUMN content_mode TEXT DEFAULT 'safe' CHECK (content_mode IN ('safe', 'nsfw'));
  END IF;
END $$;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_age_verification_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
DROP TRIGGER IF EXISTS age_verification_updated_at ON age_verifications;
CREATE TRIGGER age_verification_updated_at
  BEFORE UPDATE ON age_verifications
  FOR EACH ROW
  EXECUTE FUNCTION update_age_verification_timestamp();
