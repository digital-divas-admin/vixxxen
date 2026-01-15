-- ===========================================
-- ANALYTICS ADVANCED FEATURES
-- Phase 5: Session Duration, Retention Cohorts, Reports, Alerts
-- ===========================================

-- 1. USER SESSIONS TABLE
-- Tracks individual user sessions with start/end times
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  anonymous_id TEXT,
  session_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  page_views INTEGER DEFAULT 1,
  events_count INTEGER DEFAULT 0,
  first_page TEXT,
  last_page TEXT,
  referrer TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for session queries
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON user_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_started_at ON user_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_anonymous_id ON user_sessions(anonymous_id);

-- 2. USER RETENTION TABLE
-- Pre-aggregated retention data for faster queries
CREATE TABLE IF NOT EXISTS user_retention (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  signup_date DATE NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  day_1_returned BOOLEAN DEFAULT FALSE,
  day_7_returned BOOLEAN DEFAULT FALSE,
  day_14_returned BOOLEAN DEFAULT FALSE,
  day_30_returned BOOLEAN DEFAULT FALSE,
  total_sessions INTEGER DEFAULT 1,
  total_events INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for retention queries
CREATE INDEX IF NOT EXISTS idx_user_retention_user_id ON user_retention(user_id);
CREATE INDEX IF NOT EXISTS idx_user_retention_signup_date ON user_retention(signup_date);

-- 3. ANALYTICS ALERTS TABLE
-- Configurable alerts for metric thresholds
CREATE TABLE IF NOT EXISTS analytics_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  metric_type TEXT NOT NULL, -- 'conversion_rate', 'daily_signups', 'session_duration', etc.
  condition TEXT NOT NULL, -- 'below', 'above', 'equals'
  threshold NUMERIC NOT NULL,
  check_interval TEXT DEFAULT 'daily', -- 'hourly', 'daily', 'weekly'
  is_active BOOLEAN DEFAULT TRUE,
  last_checked_at TIMESTAMPTZ,
  last_triggered_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. ANALYTICS ALERT HISTORY
-- Log of triggered alerts
CREATE TABLE IF NOT EXISTS analytics_alert_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID REFERENCES analytics_alerts(id) ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metric_value NUMERIC NOT NULL,
  threshold_value NUMERIC NOT NULL,
  message TEXT,
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alert_history_alert_id ON analytics_alert_history(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_triggered_at ON analytics_alert_history(triggered_at);

-- 5. ANALYTICS REPORTS TABLE
-- Scheduled report configurations
CREATE TABLE IF NOT EXISTS analytics_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  report_type TEXT NOT NULL, -- 'daily_summary', 'weekly_summary', 'retention', 'funnel'
  schedule TEXT NOT NULL, -- 'daily', 'weekly', 'monthly'
  recipients JSONB DEFAULT '[]'::jsonb, -- Array of email addresses
  is_active BOOLEAN DEFAULT TRUE,
  last_sent_at TIMESTAMPTZ,
  next_send_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. ANALYTICS REPORT HISTORY
-- Archive of generated reports
CREATE TABLE IF NOT EXISTS analytics_report_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES analytics_reports(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  report_data JSONB NOT NULL,
  sent_to JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'generated' -- 'generated', 'sent', 'failed'
);

CREATE INDEX IF NOT EXISTS idx_report_history_report_id ON analytics_report_history(report_id);
CREATE INDEX IF NOT EXISTS idx_report_history_generated_at ON analytics_report_history(generated_at);

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_retention ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_alert_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_report_history ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY admin_user_sessions ON user_sessions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY admin_user_retention ON user_retention FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY admin_analytics_alerts ON analytics_alerts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY admin_alert_history ON analytics_alert_history FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY admin_analytics_reports ON analytics_reports FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY admin_report_history ON analytics_report_history FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Service role can insert sessions
CREATE POLICY service_insert_sessions ON user_sessions FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY service_update_sessions ON user_sessions FOR UPDATE TO service_role
  USING (true);

CREATE POLICY service_retention ON user_retention FOR ALL TO service_role
  USING (true);

-- ===========================================
-- HELPER FUNCTION: Update session on heartbeat
-- ===========================================

CREATE OR REPLACE FUNCTION update_session_heartbeat(p_session_id TEXT, p_page TEXT DEFAULT NULL)
RETURNS void AS $$
BEGIN
  UPDATE user_sessions
  SET
    ended_at = NOW(),
    duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
    page_views = page_views + CASE WHEN p_page IS NOT NULL AND p_page != last_page THEN 1 ELSE 0 END,
    last_page = COALESCE(p_page, last_page)
  WHERE session_id = p_session_id
    AND ended_at IS NULL OR ended_at > NOW() - INTERVAL '30 minutes';
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- HELPER FUNCTION: Calculate retention for a user
-- ===========================================

CREATE OR REPLACE FUNCTION update_user_retention(p_user_id UUID)
RETURNS void AS $$
DECLARE
  v_signup_date DATE;
  v_last_seen TIMESTAMPTZ;
BEGIN
  -- Get signup date from profiles
  SELECT created_at::DATE INTO v_signup_date
  FROM profiles WHERE id = p_user_id;

  IF v_signup_date IS NULL THEN
    RETURN;
  END IF;

  -- Get last activity
  SELECT MAX(created_at) INTO v_last_seen
  FROM analytics_events WHERE user_id = p_user_id;

  IF v_last_seen IS NULL THEN
    v_last_seen = NOW();
  END IF;

  -- Upsert retention record
  INSERT INTO user_retention (user_id, signup_date, first_seen_at, last_seen_at)
  VALUES (p_user_id, v_signup_date, v_signup_date, v_last_seen)
  ON CONFLICT (user_id) DO UPDATE SET
    last_seen_at = GREATEST(user_retention.last_seen_at, v_last_seen),
    day_1_returned = user_retention.day_1_returned OR (v_last_seen::DATE > user_retention.signup_date),
    day_7_returned = user_retention.day_7_returned OR (v_last_seen::DATE >= user_retention.signup_date + 7),
    day_14_returned = user_retention.day_14_returned OR (v_last_seen::DATE >= user_retention.signup_date + 14),
    day_30_returned = user_retention.day_30_returned OR (v_last_seen::DATE >= user_retention.signup_date + 30),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Add unique constraint for user_retention
ALTER TABLE user_retention ADD CONSTRAINT unique_user_retention UNIQUE (user_id);
