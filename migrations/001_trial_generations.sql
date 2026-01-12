-- Trial Generations Table
-- Tracks trial image generations for unauthenticated users
-- Used for rate limiting and abuse prevention

CREATE TABLE IF NOT EXISTS trial_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  fingerprint TEXT,                    -- browser fingerprint (optional, adds extra protection)
  generations_used INTEGER DEFAULT 0,
  first_generation_at TIMESTAMP WITH TIME ZONE,
  last_generation_at TIMESTAMP WITH TIME ZONE,
  converted_to_user_id UUID REFERENCES auth.users(id), -- track if they signed up
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast IP lookups
CREATE INDEX IF NOT EXISTS idx_trial_generations_ip ON trial_generations(ip_address);

-- Index for fingerprint lookups
CREATE INDEX IF NOT EXISTS idx_trial_generations_fingerprint ON trial_generations(fingerprint);

-- Index for cleanup of old records
CREATE INDEX IF NOT EXISTS idx_trial_generations_created_at ON trial_generations(created_at);

-- Row Level Security (RLS)
ALTER TABLE trial_generations ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table (backend only)
CREATE POLICY "Service role only" ON trial_generations
  FOR ALL
  USING (auth.role() = 'service_role');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_trial_generations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_trial_generations_updated_at ON trial_generations;
CREATE TRIGGER update_trial_generations_updated_at
  BEFORE UPDATE ON trial_generations
  FOR EACH ROW
  EXECUTE FUNCTION update_trial_generations_updated_at();

-- Global daily cap table for monitoring total trial usage
CREATE TABLE IF NOT EXISTS trial_daily_caps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  total_generations INTEGER DEFAULT 0,
  max_allowed INTEGER DEFAULT 500, -- configurable daily limit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for date lookups
CREATE INDEX IF NOT EXISTS idx_trial_daily_caps_date ON trial_daily_caps(date);

-- RLS for daily caps
ALTER TABLE trial_daily_caps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only for daily caps" ON trial_daily_caps
  FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE trial_generations IS 'Tracks trial image generations for rate limiting';
COMMENT ON TABLE trial_daily_caps IS 'Global daily cap on trial generations for cost control';

-- Function to increment daily cap (atomic operation)
CREATE OR REPLACE FUNCTION increment_trial_daily_cap(target_date DATE)
RETURNS void AS $$
BEGIN
  INSERT INTO trial_daily_caps (date, total_generations)
  VALUES (target_date, 1)
  ON CONFLICT (date)
  DO UPDATE SET total_generations = trial_daily_caps.total_generations + 1;
END;
$$ LANGUAGE plpgsql;
