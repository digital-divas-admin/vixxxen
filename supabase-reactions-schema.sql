-- Message Reactions Schema
-- Adds Discord-style emoji reactions to chat messages

-- Table to store individual reactions
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each user can only react once per emoji per message
  UNIQUE(message_id, user_id, emoji)
);

-- Index for fast lookups by message
CREATE INDEX idx_message_reactions_message_id ON message_reactions(message_id);

-- Index for fast lookups by user (to check if user already reacted)
CREATE INDEX idx_message_reactions_user_id ON message_reactions(user_id);

-- Enable RLS
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all reactions
CREATE POLICY "Anyone can view reactions" ON message_reactions
  FOR SELECT USING (true);

-- Policy: Authenticated users can add reactions
CREATE POLICY "Authenticated users can add reactions" ON message_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can remove their own reactions
CREATE POLICY "Users can remove own reactions" ON message_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- Function to get reaction counts for a message
CREATE OR REPLACE FUNCTION get_message_reactions(p_message_id UUID)
RETURNS TABLE (
  emoji TEXT,
  count BIGINT,
  user_ids UUID[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mr.emoji,
    COUNT(*)::BIGINT as count,
    ARRAY_AGG(mr.user_id) as user_ids
  FROM message_reactions mr
  WHERE mr.message_id = p_message_id
  GROUP BY mr.emoji
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get reactions for multiple messages at once (for bulk loading)
CREATE OR REPLACE FUNCTION get_bulk_message_reactions(p_message_ids UUID[])
RETURNS TABLE (
  message_id UUID,
  emoji TEXT,
  count BIGINT,
  user_ids UUID[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mr.message_id,
    mr.emoji,
    COUNT(*)::BIGINT as count,
    ARRAY_AGG(mr.user_id) as user_ids
  FROM message_reactions mr
  WHERE mr.message_id = ANY(p_message_ids)
  GROUP BY mr.message_id, mr.emoji
  ORDER BY mr.message_id, COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
