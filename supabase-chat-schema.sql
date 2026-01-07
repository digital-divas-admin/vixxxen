-- ===========================================
-- CHAT SYSTEM SCHEMA
-- ===========================================
-- Tables for real-time chat: channels, messages, and channel membership

-- ===========================================
-- CHANNELS TABLE
-- ===========================================
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  tier_required TEXT,  -- NULL = no tier needed, 'supernova', 'mentorship'
  is_private BOOLEAN DEFAULT false,
  mentor_id UUID REFERENCES profiles(id),  -- For private mentor channels
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for channels
CREATE INDEX IF NOT EXISTS idx_channels_tier ON channels(tier_required);
CREATE INDEX IF NOT EXISTS idx_channels_private ON channels(is_private);
CREATE INDEX IF NOT EXISTS idx_channels_mentor ON channels(mentor_id) WHERE mentor_id IS NOT NULL;

-- Enable RLS
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone with valid membership can view public channels appropriate for their tier
-- Note: Backend uses service role for complex tier logic, but we add basic protection
CREATE POLICY "Authenticated users can view public channels"
ON channels
FOR SELECT
TO authenticated
USING (
  is_private = false
);

-- Policy: Users can view private channels they are members of
CREATE POLICY "Users can view private channels they belong to"
ON channels
FOR SELECT
TO authenticated
USING (
  is_private = true
  AND EXISTS (
    SELECT 1 FROM channel_members
    WHERE channel_members.channel_id = channels.id
    AND channel_members.user_id = auth.uid()
  )
);

-- Policy: Admins can manage all channels
CREATE POLICY "Admins can manage channels"
ON channels
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
-- MESSAGES TABLE
-- ===========================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for messages
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channel_id, created_at DESC);

-- Enable RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view messages in channels they have access to
CREATE POLICY "Users can view messages in accessible channels"
ON messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM channels c
    WHERE c.id = messages.channel_id
    AND (
      -- Public channel
      c.is_private = false
      -- Or user is a member of private channel
      OR EXISTS (
        SELECT 1 FROM channel_members cm
        WHERE cm.channel_id = c.id
        AND cm.user_id = auth.uid()
      )
      -- Or user is admin
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'admin'
      )
    )
  )
);

-- Policy: Users can send messages to channels they have access to
CREATE POLICY "Users can send messages to accessible channels"
ON messages
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM channels c
    WHERE c.id = messages.channel_id
    AND (
      c.is_private = false
      OR EXISTS (
        SELECT 1 FROM channel_members cm
        WHERE cm.channel_id = c.id
        AND cm.user_id = auth.uid()
      )
    )
  )
);

-- Policy: Users can delete their own messages
CREATE POLICY "Users can delete own messages"
ON messages
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Policy: Admins can delete any message
CREATE POLICY "Admins can delete any message"
ON messages
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- ===========================================
-- CHANNEL MEMBERS TABLE
-- ===========================================
-- For private channel membership (mentorship channels, etc.)
CREATE TABLE IF NOT EXISTS channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_channel_members_channel ON channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id);

-- Enable RLS
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see members of channels they belong to
CREATE POLICY "Users can view members of their channels"
ON channel_members
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM channel_members cm
    WHERE cm.channel_id = channel_members.channel_id
    AND cm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Policy: Admins can manage channel membership
CREATE POLICY "Admins can manage channel members"
ON channel_members
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
CREATE OR REPLACE FUNCTION update_chat_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_channels_updated_at ON channels;
CREATE TRIGGER trigger_channels_updated_at
  BEFORE UPDATE ON channels
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_updated_at();

DROP TRIGGER IF EXISTS trigger_messages_updated_at ON messages;
CREATE TRIGGER trigger_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_updated_at();

-- ===========================================
-- SEED DATA: Default Channels
-- ===========================================
INSERT INTO channels (name, description, tier_required, is_private) VALUES
  ('general', 'General discussion for all members', 'supernova', false),
  ('introductions', 'Introduce yourself to the community', 'supernova', false),
  ('showcase', 'Share your AI-generated creations', 'supernova', false),
  ('tips-tricks', 'Tips and tricks for better generations', 'supernova', false),
  ('mentorship-lounge', 'Exclusive mentorship tier discussion', 'mentorship', false)
ON CONFLICT DO NOTHING;
