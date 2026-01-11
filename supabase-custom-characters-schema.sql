-- ===========================================
-- CUSTOM CHARACTER ORDERS SCHEMA
-- ===========================================
-- Allows users to commission custom AI characters
-- based on Instagram inspiration

-- ===========================================
-- 1. CUSTOM CHARACTER CONFIG (Admin-editable pricing)
-- ===========================================

CREATE TABLE IF NOT EXISTS custom_character_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_price DECIMAL(10,2) NOT NULL DEFAULT 795.00,
  revision_price DECIMAL(10,2) NOT NULL DEFAULT 100.00,
  rush_fee DECIMAL(10,2) NOT NULL DEFAULT 200.00,
  max_revisions INTEGER NOT NULL DEFAULT 3,
  standard_days_min INTEGER NOT NULL DEFAULT 3,
  standard_days_max INTEGER NOT NULL DEFAULT 5,
  rush_days INTEGER NOT NULL DEFAULT 2,
  max_upload_images INTEGER NOT NULL DEFAULT 10,
  max_image_size_mb INTEGER NOT NULL DEFAULT 5,
  is_active BOOLEAN DEFAULT true,
  requirements_text TEXT DEFAULT 'Requirements for inspiration accounts:
- Model should have minimal tattoos
- Account should have at least 50 posts
- Should include variety: face shots, body shots
- Make sure you love the overall VIBE of the account',
  disclaimers JSONB DEFAULT '[
    "I understand the final result is based on AI and may not exactly match my inspiration references",
    "I understand individual features (eyes, nose, etc.) cannot be altered without using a full revision",
    "I understand the character creation process takes 3-5 business days (or 2 days for rush orders)",
    "I confirm all Instagram accounts I provided meet the requirements (50+ posts, variety of shots, minimal tattoos)"
  ]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default config
INSERT INTO custom_character_config (id) VALUES (gen_random_uuid())
ON CONFLICT DO NOTHING;

-- ===========================================
-- 2. CUSTOM CHARACTER ORDERS
-- ===========================================

CREATE TABLE IF NOT EXISTS custom_character_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number SERIAL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',           -- Order placed, waiting to start
    'in_progress',       -- Being worked on
    'delivered',         -- Initial delivery sent
    'revision_requested', -- Customer requested revision
    'completed'          -- Final delivery accepted
  )),

  -- Character name chosen by customer
  character_name TEXT NOT NULL,

  -- Instagram inspiration
  face_instagram_1 TEXT NOT NULL,
  face_instagram_1_notes TEXT,
  face_instagram_2 TEXT NOT NULL,
  face_instagram_2_notes TEXT,
  body_instagram TEXT NOT NULL,
  body_instagram_notes TEXT,

  -- Additional references
  google_drive_link TEXT,
  uploaded_images JSONB DEFAULT '[]'::jsonb, -- Array of storage URLs

  -- Pricing
  is_rush BOOLEAN DEFAULT false,
  revisions_purchased INTEGER NOT NULL DEFAULT 0,
  revisions_used INTEGER DEFAULT 0,
  base_price DECIMAL(10,2) NOT NULL,
  revision_price DECIMAL(10,2) NOT NULL,
  rush_fee DECIMAL(10,2) DEFAULT 0,
  total_price DECIMAL(10,2) NOT NULL,

  -- Character assignment
  interim_character_id UUID REFERENCES marketplace_characters(id),
  final_character_id UUID REFERENCES marketplace_characters(id),

  -- Acknowledgments (which disclaimers were checked)
  acknowledgments JSONB DEFAULT '[]'::jsonb,

  -- Integration
  asana_task_id TEXT,
  asana_task_url TEXT,

  -- Admin notes
  admin_notes TEXT,

  -- Timestamps
  estimated_delivery DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_custom_character_orders_user_id ON custom_character_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_character_orders_status ON custom_character_orders(status);

-- ===========================================
-- 3. CUSTOM CHARACTER REVISIONS
-- ===========================================

CREATE TABLE IF NOT EXISTS custom_character_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES custom_character_orders(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  feedback TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested',
    'in_progress',
    'completed'
  )),
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,

  UNIQUE(order_id, revision_number)
);

-- ===========================================
-- 4. ROW LEVEL SECURITY
-- ===========================================

-- Enable RLS
ALTER TABLE custom_character_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_character_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_character_revisions ENABLE ROW LEVEL SECURITY;

-- Config: Read by anyone (public pricing), write by admins only
CREATE POLICY "Anyone can read custom character config"
  ON custom_character_config FOR SELECT
  USING (true);

CREATE POLICY "Admins can update custom character config"
  ON custom_character_config FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Orders: Users can view their own, admins can view all
CREATE POLICY "Users can view own custom character orders"
  ON custom_character_orders FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can create own custom character orders"
  ON custom_character_orders FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can update custom character orders"
  ON custom_character_orders FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Revisions: Users can view/create their own, admins can view/update all
CREATE POLICY "Users can view own revisions"
  ON custom_character_revisions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM custom_character_orders
      WHERE id = custom_character_revisions.order_id
      AND (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
    )
  );

CREATE POLICY "Users can create revisions for own orders"
  ON custom_character_revisions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM custom_character_orders
      WHERE id = custom_character_revisions.order_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can update revisions"
  ON custom_character_revisions FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ===========================================
-- 5. FUNCTIONS
-- ===========================================

-- Function to get next order number (for display purposes)
CREATE OR REPLACE FUNCTION get_next_custom_order_number()
RETURNS INTEGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(order_number), 0) + 1 INTO next_num FROM custom_character_orders;
  RETURN next_num;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- DONE! Run this in Supabase SQL Editor
-- ===========================================
