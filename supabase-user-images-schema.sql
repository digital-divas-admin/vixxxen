-- User Images Library Schema
-- Allows users to upload images, get them moderated, and appeal if flagged

-- Create enum for image status
CREATE TYPE user_image_status AS ENUM (
  'auto_approved',    -- Passed moderation automatically
  'pending_review',   -- Flagged by moderation, awaiting admin review
  'approved',         -- Manually approved by admin after appeal
  'rejected'          -- Rejected by admin after review
);

-- Main user_images table
CREATE TABLE IF NOT EXISTS user_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Image storage
  storage_path TEXT NOT NULL,           -- Path in Supabase storage
  storage_bucket TEXT NOT NULL DEFAULT 'user-images',
  filename TEXT,                        -- Original filename
  file_size INTEGER,                    -- Size in bytes
  mime_type TEXT,                       -- e.g., 'image/jpeg', 'image/png'

  -- Moderation
  status user_image_status NOT NULL DEFAULT 'pending_review',
  moderation_flags JSONB,               -- Rekognition detection details
  celebrity_confidence DECIMAL(5,2),    -- Highest celebrity match confidence
  minor_confidence DECIMAL(5,2),        -- Highest minor detection confidence

  -- Appeal process
  appeal_reason TEXT,                   -- User's explanation for appeal
  appeal_submitted_at TIMESTAMPTZ,

  -- Admin review
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,                    -- Admin's notes on decision

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,               -- For auto-cleanup of rejected images

  -- Indexes
  CONSTRAINT valid_confidence CHECK (
    (celebrity_confidence IS NULL OR (celebrity_confidence >= 0 AND celebrity_confidence <= 100)) AND
    (minor_confidence IS NULL OR (minor_confidence >= 0 AND minor_confidence <= 100))
  )
);

-- Create indexes for common queries
CREATE INDEX idx_user_images_user_id ON user_images(user_id);
CREATE INDEX idx_user_images_status ON user_images(status);
CREATE INDEX idx_user_images_user_status ON user_images(user_id, status);
CREATE INDEX idx_user_images_pending ON user_images(status, appeal_submitted_at)
  WHERE status = 'pending_review' AND appeal_submitted_at IS NOT NULL;
CREATE INDEX idx_user_images_expires ON user_images(expires_at)
  WHERE expires_at IS NOT NULL;

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_user_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_images_updated_at
  BEFORE UPDATE ON user_images
  FOR EACH ROW
  EXECUTE FUNCTION update_user_images_updated_at();

-- Row Level Security
ALTER TABLE user_images ENABLE ROW LEVEL SECURITY;

-- Users can view their own images
CREATE POLICY "Users can view own images"
  ON user_images FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own images
CREATE POLICY "Users can upload images"
  ON user_images FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own images (for appeals)
CREATE POLICY "Users can update own images"
  ON user_images FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own images
CREATE POLICY "Users can delete own images"
  ON user_images FOR DELETE
  USING (auth.uid() = user_id);

-- Admins can view all images (for review queue)
CREATE POLICY "Admins can view all images"
  ON user_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Admins can update any image (for approving/rejecting)
CREATE POLICY "Admins can update all images"
  ON user_images FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create storage bucket for user images (run this in Supabase dashboard)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('user-images', 'user-images', false);

-- Storage policies (run in Supabase dashboard)
-- Users can upload to their own folder
-- CREATE POLICY "Users can upload own images"
--   ON storage.objects FOR INSERT
--   WITH CHECK (
--     bucket_id = 'user-images' AND
--     auth.uid()::text = (storage.foldername(name))[1]
--   );

-- Users can view their own images
-- CREATE POLICY "Users can view own images"
--   ON storage.objects FOR SELECT
--   USING (
--     bucket_id = 'user-images' AND
--     auth.uid()::text = (storage.foldername(name))[1]
--   );

-- Users can delete their own images
-- CREATE POLICY "Users can delete own images"
--   ON storage.objects FOR DELETE
--   USING (
--     bucket_id = 'user-images' AND
--     auth.uid()::text = (storage.foldername(name))[1]
--   );

-- Admins can view all user images
-- CREATE POLICY "Admins can view all user images"
--   ON storage.objects FOR SELECT
--   USING (
--     bucket_id = 'user-images' AND
--     EXISTS (
--       SELECT 1 FROM profiles
--       WHERE profiles.id = auth.uid()
--       AND profiles.role = 'admin'
--     )
--   );

-- Function to clean up expired rejected images (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_user_images()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM user_images
    WHERE expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant execute to authenticated users (for cron job)
-- GRANT EXECUTE ON FUNCTION cleanup_expired_user_images TO service_role;
