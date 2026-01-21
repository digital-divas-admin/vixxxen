-- ===========================================
-- WORKFLOW SCHEDULES TABLE
-- ===========================================
-- Stores scheduled triggers for automated workflow execution

CREATE TABLE IF NOT EXISTS workflow_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Schedule configuration
  cron_expression VARCHAR(100) NOT NULL,  -- e.g., "0 9 * * *" = 9am daily
  timezone VARCHAR(50) DEFAULT 'UTC',      -- e.g., "America/New_York"

  -- Status
  is_enabled BOOLEAN DEFAULT true,

  -- Tracking
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  last_error TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient querying of due schedules
CREATE INDEX IF NOT EXISTS idx_workflow_schedules_next_run
  ON workflow_schedules(next_run_at)
  WHERE is_enabled = true;

-- Index for user's schedules
CREATE INDEX IF NOT EXISTS idx_workflow_schedules_user
  ON workflow_schedules(user_id);

-- Index for workflow's schedules
CREATE INDEX IF NOT EXISTS idx_workflow_schedules_workflow
  ON workflow_schedules(workflow_id);

-- Enable RLS
ALTER TABLE workflow_schedules ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own schedules
CREATE POLICY "Users can view own schedules" ON workflow_schedules
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own schedules" ON workflow_schedules
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own schedules" ON workflow_schedules
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own schedules" ON workflow_schedules
  FOR DELETE USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_workflow_schedule_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
DROP TRIGGER IF EXISTS workflow_schedules_updated_at ON workflow_schedules;
CREATE TRIGGER workflow_schedules_updated_at
  BEFORE UPDATE ON workflow_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_workflow_schedule_timestamp();

-- Comment on table
COMMENT ON TABLE workflow_schedules IS 'Stores scheduled triggers for automated workflow execution';
COMMENT ON COLUMN workflow_schedules.cron_expression IS 'Standard cron expression (minute hour day month weekday)';
COMMENT ON COLUMN workflow_schedules.timezone IS 'IANA timezone for schedule interpretation';
COMMENT ON COLUMN workflow_schedules.next_run_at IS 'Pre-calculated next execution time for efficient querying';
