-- =============================================
-- WORKFLOWS SCHEMA
-- Visual workflow automation for Digital Divas
-- =============================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- WORKFLOWS TABLE
-- Stores workflow definitions
-- =============================================
CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Workflow',
  description TEXT,

  -- The workflow graph (nodes + edges) stored as JSON
  graph JSONB NOT NULL DEFAULT '{"nodes": [], "edges": []}',

  -- Workflow state
  is_enabled BOOLEAN NOT NULL DEFAULT false,

  -- Trigger configuration (for future scheduled triggers)
  trigger_type TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'schedule', 'webhook'
  trigger_config JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_run_at TIMESTAMP WITH TIME ZONE,

  -- Constraints
  CONSTRAINT valid_trigger_type CHECK (trigger_type IN ('manual', 'schedule', 'webhook'))
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_workflows_trigger_type ON workflows(trigger_type) WHERE is_enabled = true;

-- =============================================
-- WORKFLOW EXECUTIONS TABLE
-- Tracks each run of a workflow
-- =============================================
CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Execution state
  status TEXT NOT NULL DEFAULT 'pending',
  current_node_id TEXT, -- Which node is currently executing

  -- Accumulated context (outputs from completed nodes)
  context JSONB NOT NULL DEFAULT '{}',

  -- Error information
  error_message TEXT,
  error_node_id TEXT, -- Which node caused the error

  -- Credit tracking
  credits_used INTEGER NOT NULL DEFAULT 0,
  credits_estimated INTEGER, -- Estimated total before run

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Constraints
  CONSTRAINT valid_execution_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
);

-- Indexes for execution queries
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_user_id ON workflow_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status) WHERE status = 'running';

-- =============================================
-- WORKFLOW STEP RESULTS TABLE
-- Stores output from each node execution
-- =============================================
CREATE TABLE IF NOT EXISTS workflow_step_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL, -- The node ID from the graph
  node_type TEXT NOT NULL, -- 'generate-image', 'save-gallery', etc.

  -- Step state
  status TEXT NOT NULL DEFAULT 'pending',

  -- Input/Output data
  input_data JSONB, -- What was passed to this node
  output_data JSONB, -- What this node produced

  -- Cost tracking
  credits_used INTEGER NOT NULL DEFAULT 0,

  -- Error information
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Constraints
  CONSTRAINT valid_step_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped'))
);

-- Index for step lookups
CREATE INDEX IF NOT EXISTS idx_workflow_step_results_execution_id ON workflow_step_results(execution_id);

-- =============================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_step_results ENABLE ROW LEVEL SECURITY;

-- Workflows: Users can only access their own workflows
CREATE POLICY workflows_select_own ON workflows
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY workflows_insert_own ON workflows
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY workflows_update_own ON workflows
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY workflows_delete_own ON workflows
  FOR DELETE USING (auth.uid() = user_id);

-- Workflow Executions: Users can only access their own executions
CREATE POLICY workflow_executions_select_own ON workflow_executions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY workflow_executions_insert_own ON workflow_executions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY workflow_executions_update_own ON workflow_executions
  FOR UPDATE USING (auth.uid() = user_id);

-- Step Results: Access through execution ownership
CREATE POLICY workflow_step_results_select_own ON workflow_step_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workflow_executions
      WHERE workflow_executions.id = workflow_step_results.execution_id
      AND workflow_executions.user_id = auth.uid()
    )
  );

-- =============================================
-- SERVICE ROLE POLICIES
-- For backend operations
-- =============================================

-- Allow service role full access (for backend execution engine)
CREATE POLICY workflows_service_all ON workflows
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY workflow_executions_service_all ON workflow_executions
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY workflow_step_results_service_all ON workflow_step_results
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- =============================================
-- TRIGGERS
-- =============================================

-- Update updated_at on workflows
CREATE OR REPLACE FUNCTION update_workflow_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW
  EXECUTE FUNCTION update_workflow_updated_at();

-- Update last_run_at when execution starts
CREATE OR REPLACE FUNCTION update_workflow_last_run()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'running' AND OLD.status = 'pending' THEN
    UPDATE workflows SET last_run_at = NOW() WHERE id = NEW.workflow_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workflow_executions_started
  AFTER UPDATE ON workflow_executions
  FOR EACH ROW
  EXECUTE FUNCTION update_workflow_last_run();
