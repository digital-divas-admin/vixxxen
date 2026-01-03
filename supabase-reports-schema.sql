-- Reports System Schema for DivaForge
-- Run this in Supabase SQL Editor
-- Content and chat message reporting with admin moderation

-- Create reports table
CREATE TABLE IF NOT EXISTS reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Reporter info
  reporter_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  anonymous BOOLEAN DEFAULT false,

  -- Content being reported
  content_type TEXT NOT NULL CHECK (content_type IN ('image', 'video', 'audio', 'chat_message')),
  content_id TEXT,                    -- ID reference (chat message id, etc.)
  content_url TEXT,                   -- Snapshot URL for generated content
  content_preview TEXT,               -- Text preview for chat messages

  -- Who created the reported content
  reported_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Report details
  reason TEXT NOT NULL CHECK (reason IN (
    'illegal_content',
    'underage_depiction',
    'non_consensual',
    'harassment',
    'spam',
    'impersonation',
    'hate_speech',
    'other'
  )),
  details TEXT,                       -- Optional explanation from reporter

  -- Moderation status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  auto_hidden BOOLEAN DEFAULT false,  -- Was content auto-hidden due to report threshold

  -- Admin review
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  action_taken TEXT CHECK (action_taken IN ('none', 'warning', 'content_removed', 'user_suspended', 'user_banned')),
  admin_notes TEXT,

  -- Notification tracking
  reporter_notified BOOLEAN DEFAULT false,
  reporter_notified_at TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_content_type ON reports(content_type);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported_user ON reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);
CREATE INDEX IF NOT EXISTS idx_reports_content_id ON reports(content_id);

-- Enable RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Policy: Users can create reports
CREATE POLICY "Users can create reports"
  ON reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_user_id);

-- Policy: Users can view their own reports
CREATE POLICY "Users can view own reports"
  ON reports FOR SELECT
  USING (auth.uid() = reporter_user_id);

-- Policy: Admins can view all reports
CREATE POLICY "Admins can view all reports"
  ON reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy: Admins can update reports
CREATE POLICY "Admins can update reports"
  ON reports FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create report rate limiting table
CREATE TABLE IF NOT EXISTS report_rate_limits (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  report_count INTEGER DEFAULT 0,
  window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_report_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on rate limits
ALTER TABLE report_rate_limits ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view/update their own rate limit
CREATE POLICY "Users manage own rate limit"
  ON report_rate_limits FOR ALL
  USING (auth.uid() = user_id);

-- Create view for report statistics
CREATE OR REPLACE VIEW report_stats AS
SELECT
  status,
  content_type,
  reason,
  COUNT(*) as count,
  DATE_TRUNC('day', created_at) as date
FROM reports
GROUP BY status, content_type, reason, DATE_TRUNC('day', created_at)
ORDER BY date DESC;

-- Grant access to admins
GRANT SELECT ON report_stats TO authenticated;

-- Function to check if content should be auto-hidden (3+ pending reports)
CREATE OR REPLACE FUNCTION check_auto_hide()
RETURNS TRIGGER AS $$
DECLARE
  report_count INTEGER;
BEGIN
  -- Count pending reports for this content
  SELECT COUNT(*) INTO report_count
  FROM reports
  WHERE content_type = NEW.content_type
    AND content_id = NEW.content_id
    AND status = 'pending';

  -- Auto-hide if 3 or more reports
  IF report_count >= 3 THEN
    UPDATE reports
    SET auto_hidden = true
    WHERE content_type = NEW.content_type
      AND content_id = NEW.content_id
      AND status = 'pending';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to check auto-hide on new reports
CREATE TRIGGER trigger_check_auto_hide
  AFTER INSERT ON reports
  FOR EACH ROW
  EXECUTE FUNCTION check_auto_hide();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER trigger_reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW
  EXECUTE FUNCTION update_reports_updated_at();

-- Add comment for documentation
COMMENT ON TABLE reports IS 'Content and chat message reports with moderation workflow. Auto-hides content after 3 pending reports.';
