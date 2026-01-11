-- ===========================================
-- ONBOARDING SYSTEM SCHEMA
-- ===========================================
-- Configuration-driven onboarding wizard, content plans,
-- education tiers, and reminder system

-- ===========================================
-- 1. CONTENT PLANS CONFIG
-- ===========================================
-- Admin-configurable content subscription plans (Basic/Creator/Pro)

CREATE TABLE IF NOT EXISTS content_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,  -- 'basic', 'creator', 'pro'
  name TEXT NOT NULL,  -- 'Basic', 'Creator', 'Pro'
  description TEXT,
  credits_monthly INTEGER NOT NULL DEFAULT 100,
  price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_annual DECIMAL(10,2) NOT NULL DEFAULT 0,
  features JSONB DEFAULT '[]'::jsonb,  -- Array of feature strings
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default content plans
INSERT INTO content_plans (slug, name, description, credits_monthly, price_monthly, price_annual, features, display_order) VALUES
  ('basic', 'Basic', 'Perfect for getting started', 100, 9.00, 86.00,
   '["100 credits per month", "Standard AI models", "Basic support", "Community access"]'::jsonb, 1),
  ('creator', 'Creator', 'For serious content creators', 500, 29.00, 278.00,
   '["500 credits per month", "Premium AI models", "Priority queue", "Priority support"]'::jsonb, 2),
  ('pro', 'Pro', 'Unlimited creative power', 2000, 79.00, 758.00,
   '["2000 credits per month", "All AI models", "Fastest generation", "VIP support", "API access"]'::jsonb, 3)
ON CONFLICT (slug) DO NOTHING;

-- ===========================================
-- 2. EDUCATION TIERS CONFIG
-- ===========================================
-- Admin-configurable education tiers (Silver/Gold/Platinum)

CREATE TABLE IF NOT EXISTS education_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,  -- 'silver', 'gold', 'platinum'
  name TEXT NOT NULL,  -- 'Silver', 'Gold', 'Platinum'
  description TEXT,
  price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_annual DECIMAL(10,2) NOT NULL DEFAULT 0,
  features JSONB DEFAULT '[]'::jsonb,  -- Array of feature strings
  learn_tab_access JSONB DEFAULT '[]'::jsonb,  -- Which learn content types they can access
  community_channels JSONB DEFAULT '[]'::jsonb,  -- Which channel types they can access
  has_live_workshops BOOLEAN DEFAULT false,
  has_mentorship BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default education tiers
INSERT INTO education_tiers (slug, name, description, price_monthly, price_annual, features, learn_tab_access, community_channels, has_live_workshops, has_mentorship, display_order) VALUES
  ('silver', 'Silver', 'Start your learning journey', 19.00, 182.00,
   '["Self-paced guides and tutorials", "Community chat access", "Basic resources library", "Monthly Q&A sessions"]'::jsonb,
   '["guides", "tutorials", "basic_resources"]'::jsonb,
   '["public"]'::jsonb,
   false, false, 1),
  ('gold', 'Gold', 'Level up with expert guidance', 49.00, 470.00,
   '["Everything in Silver", "Live workshops (2x/month)", "Advanced courses", "Private community channels", "Priority Q&A"]'::jsonb,
   '["guides", "tutorials", "basic_resources", "advanced_courses", "workshops"]'::jsonb,
   '["public", "gold_private"]'::jsonb,
   true, false, 2),
  ('platinum', 'Platinum', 'Personal mentorship & mastery', 149.00, 1430.00,
   '["Everything in Gold", "1:1 mentorship sessions", "Personal guidance & feedback", "Direct mentor access", "Custom learning path"]'::jsonb,
   '["guides", "tutorials", "basic_resources", "advanced_courses", "workshops", "mentorship_content"]'::jsonb,
   '["public", "gold_private", "platinum_private", "mentor_dm"]'::jsonb,
   true, true, 3)
ON CONFLICT (slug) DO NOTHING;

-- ===========================================
-- 3. USER CONTENT SUBSCRIPTIONS
-- ===========================================
-- Tracks user content plan subscriptions (separate from education)

CREATE TABLE IF NOT EXISTS user_content_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES content_plans(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'past_due')),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  current_period_start TIMESTAMPTZ DEFAULT now(),
  current_period_end TIMESTAMPTZ,
  credits_remaining INTEGER DEFAULT 0,  -- Credits left this period
  stripe_subscription_id TEXT,  -- For payment integration
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)  -- One content subscription per user
);

-- ===========================================
-- 4. ONBOARDING CONFIG
-- ===========================================
-- Admin-configurable onboarding wizard steps

CREATE TABLE IF NOT EXISTS onboarding_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_key TEXT NOT NULL UNIQUE,  -- 'create_account', 'choose_character', etc.
  step_order INTEGER NOT NULL DEFAULT 0,
  is_enabled BOOLEAN DEFAULT true,
  is_required BOOLEAN DEFAULT false,  -- Can this step be skipped?
  title TEXT NOT NULL,
  subtitle TEXT,
  skip_button_text TEXT DEFAULT 'Skip for now',
  continue_button_text TEXT DEFAULT 'Continue',
  config JSONB DEFAULT '{}'::jsonb,  -- Step-specific configuration
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default onboarding steps
INSERT INTO onboarding_config (step_key, step_order, is_enabled, is_required, title, subtitle, skip_button_text, continue_button_text, config) VALUES
  ('create_account', 1, true, true, 'Create Your Account', 'Get 20 free credits to start creating', NULL, 'Create Account',
   '{"credits_bonus": 20}'::jsonb),
  ('choose_character', 2, true, false, 'Meet Your AI Companions', 'These starter characters are yours to create with - free forever', 'Skip for now', 'Continue',
   '{"show_marketplace_link": true}'::jsonb),
  ('choose_plan', 3, true, false, 'Choose Your Plan', 'Your 20 credits let you create amazing content. Want more?', 'Continue with free credits', 'Subscribe',
   '{"show_annual_toggle": true}'::jsonb),
  ('choose_education', 4, true, false, 'Level Up Your Skills', 'Learn to create stunning content with our education paths', 'Skip - I just want to create', 'Subscribe',
   '{"show_annual_toggle": true}'::jsonb),
  ('welcome', 5, true, true, 'Welcome to Vixxxen!', 'You''re all set to start creating', NULL, 'Start Creating',
   '{"show_quick_tour": true}'::jsonb)
ON CONFLICT (step_key) DO NOTHING;

-- ===========================================
-- 5. ONBOARDING PROGRESS
-- ===========================================
-- Tracks where each user is in the onboarding flow

CREATE TABLE IF NOT EXISTS onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  current_step TEXT,  -- Current step_key
  completed_steps JSONB DEFAULT '[]'::jsonb,  -- Array of completed step_keys
  skipped_steps JSONB DEFAULT '[]'::jsonb,  -- Array of skipped step_keys
  selections JSONB DEFAULT '{}'::jsonb,  -- What they chose at each step
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,  -- When they finished the whole wizard
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- ===========================================
-- 6. PROMPT TRIGGERS CONFIG
-- ===========================================
-- Admin-configurable triggers for reminder prompts

CREATE TABLE IF NOT EXISTS prompt_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_key TEXT NOT NULL UNIQUE,  -- 'low_credits', 'no_plan_reminder', etc.
  trigger_type TEXT NOT NULL,  -- 'credits', 'time', 'action', 'milestone'
  condition JSONB NOT NULL,  -- The condition to check, e.g., {"credits_below": 5}
  prompt_type TEXT NOT NULL,  -- 'upgrade_plan', 'suggest_education', 'buy_character'
  prompt_title TEXT NOT NULL,
  prompt_message TEXT NOT NULL,
  prompt_cta TEXT NOT NULL,  -- Call to action button text
  cooldown_hours INTEGER DEFAULT 24,  -- Min hours between showing this prompt
  max_shows INTEGER DEFAULT 0,  -- 0 = unlimited
  is_enabled BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,  -- Higher = more important, show first
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default prompt triggers
INSERT INTO prompt_triggers (trigger_key, trigger_type, condition, prompt_type, prompt_title, prompt_message, prompt_cta, cooldown_hours, priority) VALUES
  ('low_credits_5', 'credits', '{"credits_below": 5}'::jsonb, 'upgrade_plan',
   'Running Low on Credits', 'You have less than 5 credits left. Upgrade to keep creating amazing content!', 'View Plans', 24, 10),
  ('zero_credits', 'credits', '{"credits_equal": 0}'::jsonb, 'upgrade_plan',
   'Out of Credits', 'You''ve used all your credits. Subscribe to a plan for monthly credits and premium features.', 'Get More Credits', 4, 20),
  ('no_plan_7_days', 'time', '{"days_since_signup": 7, "has_content_plan": false}'::jsonb, 'upgrade_plan',
   'Enjoying Vixxxen?', 'You''ve been creating for a week! Ready to unlock more credits and features?', 'Explore Plans', 72, 5),
  ('no_education_20_gens', 'milestone', '{"generations_count": 20, "has_education": false}'::jsonb, 'suggest_education',
   'You''re Getting Good!', 'You''ve created 20 pieces of content. Want to learn advanced techniques from experts?', 'Explore Education', 168, 3),
  ('suggest_character', 'milestone', '{"generations_count": 10, "owned_characters_count": 0}'::jsonb, 'buy_character',
   'Ready for a Unique Look?', 'You''ve been using starter characters. Explore unique AI characters in our marketplace!', 'Browse Characters', 168, 2)
ON CONFLICT (trigger_key) DO NOTHING;

-- ===========================================
-- 7. USER PROMPTS (Shown/Dismissed Tracking)
-- ===========================================
-- Tracks which prompts have been shown to users

CREATE TABLE IF NOT EXISTS user_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trigger_key TEXT NOT NULL,  -- References prompt_triggers.trigger_key
  shown_at TIMESTAMPTZ DEFAULT now(),
  dismissed_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,  -- If they clicked CTA
  show_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_prompts_user_trigger ON user_prompts(user_id, trigger_key);

-- ===========================================
-- 8. STARTER CHARACTERS MIGRATION
-- ===========================================
-- Add is_starter column to marketplace_characters

ALTER TABLE marketplace_characters
ADD COLUMN IF NOT EXISTS is_starter BOOLEAN DEFAULT false;

-- Mark existing free characters as starters
UPDATE marketplace_characters
SET is_starter = true
WHERE price = 0 OR price IS NULL;

-- Create index for starter lookup
CREATE INDEX IF NOT EXISTS idx_marketplace_characters_starter
ON marketplace_characters(is_starter) WHERE is_starter = true;

-- ===========================================
-- 9. UPDATE MEMBERSHIPS FOR NEW TIERS
-- ===========================================
-- Add silver tier support to existing memberships

-- Update tier check to include silver
ALTER TABLE memberships
DROP CONSTRAINT IF EXISTS memberships_tier_check;

-- No constraint - let the education_tiers table be the source of truth
-- The tier column will store the slug from education_tiers

-- Add education_tier_id for proper foreign key (optional migration)
ALTER TABLE memberships
ADD COLUMN IF NOT EXISTS education_tier_id UUID REFERENCES education_tiers(id);

-- ===========================================
-- 10. UPDATE USER_HAS_TIER FUNCTION
-- ===========================================
-- Update the helper function to support silver/gold/platinum

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

  -- Tier hierarchy: platinum > gold > silver
  IF required_tier = 'silver' THEN
    RETURN user_tier IN ('silver', 'gold', 'platinum', 'supernova', 'mentorship');
  END IF;

  IF required_tier = 'gold' OR required_tier = 'supernova' THEN
    RETURN user_tier IN ('gold', 'platinum', 'supernova', 'mentorship');
  END IF;

  IF required_tier = 'platinum' OR required_tier = 'mentorship' THEN
    RETURN user_tier IN ('platinum', 'mentorship');
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 11. PROFILES UPDATE - Starting Credits
-- ===========================================
-- Change default credits from 1250 to 20 for new users

ALTER TABLE profiles
ALTER COLUMN credits SET DEFAULT 20;

-- ===========================================
-- 12. RLS POLICIES
-- ===========================================

-- Content Plans (public read)
ALTER TABLE content_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active plans" ON content_plans FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage plans" ON content_plans FOR ALL USING (is_admin());

-- Education Tiers (public read)
ALTER TABLE education_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active tiers" ON education_tiers FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage tiers" ON education_tiers FOR ALL USING (is_admin());

-- User Content Subscriptions
ALTER TABLE user_content_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own subscription" ON user_content_subscriptions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Service role manages subscriptions" ON user_content_subscriptions FOR ALL TO service_role USING (true);
CREATE POLICY "Admins can manage subscriptions" ON user_content_subscriptions FOR ALL USING (is_admin());

-- Onboarding Config (public read)
ALTER TABLE onboarding_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view enabled steps" ON onboarding_config FOR SELECT USING (is_enabled = true);
CREATE POLICY "Admins can manage config" ON onboarding_config FOR ALL USING (is_admin());

-- Onboarding Progress
ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own progress" ON onboarding_progress FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own progress" ON onboarding_progress FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can insert own progress" ON onboarding_progress FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can view all progress" ON onboarding_progress FOR SELECT USING (is_admin());

-- Prompt Triggers (public read)
ALTER TABLE prompt_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view enabled triggers" ON prompt_triggers FOR SELECT USING (is_enabled = true);
CREATE POLICY "Admins can manage triggers" ON prompt_triggers FOR ALL USING (is_admin());

-- User Prompts
ALTER TABLE user_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own prompts" ON user_prompts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can manage own prompts" ON user_prompts FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Service role manages prompts" ON user_prompts FOR ALL TO service_role USING (true);

-- ===========================================
-- 13. UPDATED_AT TRIGGERS
-- ===========================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_content_plans_updated_at ON content_plans;
CREATE TRIGGER trigger_content_plans_updated_at
  BEFORE UPDATE ON content_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_education_tiers_updated_at ON education_tiers;
CREATE TRIGGER trigger_education_tiers_updated_at
  BEFORE UPDATE ON education_tiers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_user_content_subscriptions_updated_at ON user_content_subscriptions;
CREATE TRIGGER trigger_user_content_subscriptions_updated_at
  BEFORE UPDATE ON user_content_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_onboarding_config_updated_at ON onboarding_config;
CREATE TRIGGER trigger_onboarding_config_updated_at
  BEFORE UPDATE ON onboarding_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_onboarding_progress_updated_at ON onboarding_progress;
CREATE TRIGGER trigger_onboarding_progress_updated_at
  BEFORE UPDATE ON onboarding_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_prompt_triggers_updated_at ON prompt_triggers;
CREATE TRIGGER trigger_prompt_triggers_updated_at
  BEFORE UPDATE ON prompt_triggers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_user_prompts_updated_at ON user_prompts;
CREATE TRIGGER trigger_user_prompts_updated_at
  BEFORE UPDATE ON user_prompts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- 14. HELPER FUNCTIONS
-- ===========================================

-- Check if user has an active content subscription
CREATE OR REPLACE FUNCTION user_has_content_plan()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_content_subscriptions
    WHERE user_id = auth.uid()
    AND status = 'active'
    AND (current_period_end IS NULL OR current_period_end > now())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user has any education tier
CREATE OR REPLACE FUNCTION user_has_education()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM memberships
    WHERE user_id = auth.uid()
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get starter characters
CREATE OR REPLACE FUNCTION get_starter_characters()
RETURNS SETOF marketplace_characters AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM marketplace_characters
  WHERE is_starter = true
  AND is_active = true
  ORDER BY sort_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- MIGRATIONS: Run these if tables already exist
-- ===========================================

-- Add badge_text column to content_plans (for "Most Popular", "Best Value", etc.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_plans' AND column_name = 'badge_text'
  ) THEN
    ALTER TABLE content_plans ADD COLUMN badge_text TEXT;
  END IF;
END $$;

-- Add badge_text column to education_tiers (for "Popular", "Premium", etc.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'education_tiers' AND column_name = 'badge_text'
  ) THEN
    ALTER TABLE education_tiers ADD COLUMN badge_text TEXT;
  END IF;
END $$;

-- ===========================================
-- DONE! Run this in Supabase SQL Editor
-- ===========================================
