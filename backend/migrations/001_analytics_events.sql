-- Analytics Events Table
-- Stores all user behavior events for internal analytics

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User identification
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  anonymous_id TEXT, -- Fingerprint/session ID for pre-signup users
  session_id UUID, -- Groups events within a single visit

  -- Event details
  event_name TEXT NOT NULL,
  event_category TEXT NOT NULL, -- 'onboarding', 'generation', 'chat', 'monetization', etc.
  event_data JSONB DEFAULT '{}', -- Flexible payload for event-specific data

  -- Context
  page_url TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,

  -- Client info
  user_agent TEXT,
  ip_hash TEXT, -- Hashed for privacy

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_anonymous_id ON analytics_events(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_category ON analytics_events(event_category);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);

-- Composite index for funnel queries
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_category_time
  ON analytics_events(user_id, event_category, created_at);

-- User Activity Summary Table
-- Aggregated daily stats for fast dashboard queries
CREATE TABLE IF NOT EXISTS user_activity_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Activity counts
  sessions_count INT DEFAULT 0,
  page_views INT DEFAULT 0,
  generations_count INT DEFAULT 0,
  messages_sent INT DEFAULT 0,
  credits_used INT DEFAULT 0,

  -- Engagement
  time_spent_seconds INT DEFAULT 0,
  last_active_at TIMESTAMPTZ,

  -- Unique constraint
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_user_activity_summary_user_id ON user_activity_summary(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_summary_date ON user_activity_summary(date);

-- Funnel Progress Table
-- Track where users are in key conversion funnels
CREATE TABLE IF NOT EXISTS funnel_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anonymous_id TEXT, -- For pre-signup funnels

  funnel_name TEXT NOT NULL, -- 'onboarding', 'trial', 'character_creation', 'checkout'
  current_step TEXT NOT NULL,
  steps_completed JSONB DEFAULT '[]', -- Array of completed step names

  started_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  abandoned_at TIMESTAMPTZ,

  -- Metadata
  funnel_data JSONB DEFAULT '{}' -- Store selections, choices made, etc.
);

CREATE INDEX IF NOT EXISTS idx_funnel_progress_user_id ON funnel_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_funnel_progress_anonymous_id ON funnel_progress(anonymous_id);
CREATE INDEX IF NOT EXISTS idx_funnel_progress_funnel_name ON funnel_progress(funnel_name);

-- Enable Row Level Security
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_progress ENABLE ROW LEVEL SECURITY;

-- Policies: Service role can do everything, users can only see their own data
CREATE POLICY "Service role full access on analytics_events" ON analytics_events
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own analytics" ON analytics_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on user_activity_summary" ON user_activity_summary
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own activity" ON user_activity_summary
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on funnel_progress" ON funnel_progress
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own funnel progress" ON funnel_progress
  FOR SELECT USING (auth.uid() = user_id);
