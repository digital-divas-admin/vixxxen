-- Fix for Character Management System
-- Addresses RLS policy issues and adds purchase_type tracking
-- Run this in Supabase SQL Editor

-- =====================================================
-- 1. Fix RLS Policies for user_characters
-- =====================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own characters" ON public.user_characters;
DROP POLICY IF EXISTS "Service role can manage character ownership" ON public.user_characters;

-- Recreate policies with proper configuration
-- Users can only view their own characters
CREATE POLICY "Users can view own characters"
  ON public.user_characters FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own character ownership (for self-service purchases)
CREATE POLICY "Users can add own characters"
  ON public.user_characters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow service role (backend) to do anything
-- Note: Service role key bypasses RLS, but this ensures proper policy structure
CREATE POLICY "Service role full access"
  ON public.user_characters FOR ALL
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- 2. Add purchase_type column for tracking acquisition
-- =====================================================

-- Add the column if it doesn't exist
ALTER TABLE public.user_characters
ADD COLUMN IF NOT EXISTS purchase_type TEXT DEFAULT 'purchase'
CHECK (purchase_type IN ('purchase', 'admin_grant', 'onboarding', 'promo'));

-- Add column for tracking who granted (for admin grants)
ALTER TABLE public.user_characters
ADD COLUMN IF NOT EXISTS granted_by UUID REFERENCES auth.users(id);

-- Add notes column for admin to add context
ALTER TABLE public.user_characters
ADD COLUMN IF NOT EXISTS notes TEXT;

-- =====================================================
-- 3. Update existing records
-- =====================================================

-- Mark existing records with amount_paid = 0 as admin grants
UPDATE public.user_characters
SET purchase_type = 'admin_grant'
WHERE amount_paid = 0 OR amount_paid IS NULL;

-- Mark existing records with amount_paid > 0 as purchases
UPDATE public.user_characters
SET purchase_type = 'purchase'
WHERE amount_paid > 0 AND purchase_type IS NULL;

-- =====================================================
-- 4. Create index for efficient queries
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_user_characters_type
ON public.user_characters(purchase_type);

-- =====================================================
-- 5. Helper function for granting characters
-- =====================================================

CREATE OR REPLACE FUNCTION grant_character_access(
  p_user_id UUID,
  p_character_id UUID,
  p_purchase_type TEXT DEFAULT 'admin_grant',
  p_granted_by UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_result_id UUID;
BEGIN
  -- Validate character exists
  IF NOT EXISTS (SELECT 1 FROM marketplace_characters WHERE id = p_character_id) THEN
    RAISE EXCEPTION 'Character not found: %', p_character_id;
  END IF;

  -- Validate user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  -- Check if already owns
  IF EXISTS (
    SELECT 1 FROM user_characters
    WHERE user_id = p_user_id AND character_id = p_character_id
  ) THEN
    RAISE EXCEPTION 'User already owns this character';
  END IF;

  -- Insert the grant
  INSERT INTO user_characters (
    user_id,
    character_id,
    amount_paid,
    purchase_type,
    granted_by,
    notes
  )
  VALUES (
    p_user_id,
    p_character_id,
    0,
    p_purchase_type,
    p_granted_by,
    p_notes
  )
  RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users (backend will use service role)
GRANT EXECUTE ON FUNCTION grant_character_access TO authenticated;

-- =====================================================
-- 6. Function to get free characters for onboarding
-- =====================================================

CREATE OR REPLACE FUNCTION get_free_characters()
RETURNS SETOF marketplace_characters AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM marketplace_characters
  WHERE is_active = true
    AND price = 0
  ORDER BY sort_order, name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_free_characters TO authenticated;
GRANT EXECUTE ON FUNCTION get_free_characters TO anon;

-- =====================================================
-- 7. Function to claim free character during onboarding
-- =====================================================

CREATE OR REPLACE FUNCTION claim_onboarding_character(
  p_character_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_result_id UUID;
  v_price DECIMAL;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Verify character is free
  SELECT price INTO v_price
  FROM marketplace_characters
  WHERE id = p_character_id AND is_active = true;

  IF v_price IS NULL THEN
    RAISE EXCEPTION 'Character not found or inactive';
  END IF;

  IF v_price > 0 THEN
    RAISE EXCEPTION 'This character is not free';
  END IF;

  -- Check if user already owns any character (onboarding = first character only)
  IF EXISTS (
    SELECT 1 FROM user_characters
    WHERE user_id = v_user_id AND purchase_type = 'onboarding'
  ) THEN
    RAISE EXCEPTION 'Onboarding character already claimed';
  END IF;

  -- Check if already owns this specific character
  IF EXISTS (
    SELECT 1 FROM user_characters
    WHERE user_id = v_user_id AND character_id = p_character_id
  ) THEN
    RAISE EXCEPTION 'You already own this character';
  END IF;

  -- Insert
  INSERT INTO user_characters (
    user_id,
    character_id,
    amount_paid,
    purchase_type
  )
  VALUES (
    v_user_id,
    p_character_id,
    0,
    'onboarding'
  )
  RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION claim_onboarding_character TO authenticated;

COMMENT ON FUNCTION grant_character_access IS 'Admin function to grant character access to a user';
COMMENT ON FUNCTION get_free_characters IS 'Get all free characters available for selection';
COMMENT ON FUNCTION claim_onboarding_character IS 'Allow user to claim one free character during onboarding';
