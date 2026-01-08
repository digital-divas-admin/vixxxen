-- ===========================================
-- MEMBERSHIPS SCHEMA
-- ===========================================
-- Tracks user subscription tiers for chat access and premium features

CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tier TEXT NOT NULL,  -- 'supernova', 'mentorship'
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,  -- NULL = no expiry (lifetime or recurring)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)  -- One membership per user
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_tier ON memberships(tier);
CREATE INDEX IF NOT EXISTS idx_memberships_active ON memberships(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own membership
CREATE POLICY "Users can view own membership"
ON memberships
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Policy: Admins can view all memberships
CREATE POLICY "Admins can view all memberships"
ON memberships
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Policy: Only service role can insert/update/delete memberships
-- (Memberships are managed by payment webhooks via service role)
CREATE POLICY "Service role manages memberships"
ON memberships
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy: Admins can manage memberships (for manual overrides)
CREATE POLICY "Admins can manage memberships"
ON memberships
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- ===========================================
-- TRIGGER FOR UPDATED_AT
-- ===========================================
CREATE OR REPLACE FUNCTION update_memberships_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_memberships_updated_at ON memberships;
CREATE TRIGGER trigger_memberships_updated_at
  BEFORE UPDATE ON memberships
  FOR EACH ROW
  EXECUTE FUNCTION update_memberships_updated_at();

-- ===========================================
-- HELPER FUNCTION: Check if user has tier access
-- ===========================================
-- Can be used in other RLS policies
CREATE OR REPLACE FUNCTION user_has_tier(required_tier TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  user_tier TEXT;
BEGIN
  SELECT tier INTO user_tier
  FROM memberships
  WHERE user_id = auth.uid()
  AND is_active = true
  AND (expires_at IS NULL OR expires_at > now());

  IF user_tier IS NULL THEN
    RETURN false;
  END IF;

  -- Mentorship includes supernova access
  IF required_tier = 'supernova' THEN
    RETURN user_tier IN ('supernova', 'mentorship');
  END IF;

  IF required_tier = 'mentorship' THEN
    RETURN user_tier = 'mentorship';
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- HELPER FUNCTION: Check if user is admin
-- ===========================================
-- Reusable function for RLS policies
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
