-- =============================================
-- Agency Studio Database Schema
-- Run this in your Supabase SQL Editor
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABLES
-- =============================================

-- Agency Plans (subscription tiers)
CREATE TABLE agency_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    monthly_credits INTEGER NOT NULL,
    max_users INTEGER NOT NULL,
    price_cents INTEGER NOT NULL,
    custom_domain_allowed BOOLEAN DEFAULT false,
    features JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agencies (the paying customers)
CREATE TABLE agencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    custom_domain TEXT UNIQUE,
    status TEXT DEFAULT 'active' CHECK (status IN ('trial', 'active', 'suspended', 'cancelled')),

    -- Billing
    plan_id UUID REFERENCES agency_plans(id),
    stripe_customer_id TEXT,
    billing_email TEXT,
    billing_cycle_start TIMESTAMPTZ DEFAULT NOW(),

    -- Credits
    monthly_credit_allocation INTEGER DEFAULT 0,
    credit_pool INTEGER DEFAULT 0,
    credits_used_this_cycle INTEGER DEFAULT 0,

    -- Settings (branding, features, defaults)
    settings JSONB DEFAULT '{
        "branding": {
            "logo_url": null,
            "favicon_url": null,
            "app_name": "Agency Studio",
            "primary_color": "#6366f1",
            "secondary_color": "#10b981"
        },
        "features": {
            "image_gen": true,
            "video_gen": true,
            "editing": true,
            "chat": true,
            "nsfw_enabled": true,
            "models_allowed": ["seedream", "nanoBanana", "qwen", "kling", "wan", "veo"]
        },
        "defaults": {
            "default_model": "seedream",
            "default_credits_per_user": null
        }
    }'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agency Users (users within an agency)
CREATE TABLE agency_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

    -- Auth (links to Supabase Auth)
    auth_user_id UUID UNIQUE,
    email TEXT NOT NULL,
    name TEXT,
    avatar_url TEXT,

    -- Role & Permissions
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),

    -- Individual credit limits (null = unlimited from pool)
    credit_limit INTEGER,
    credits_used_this_cycle INTEGER DEFAULT 0,

    -- Status
    status TEXT DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'suspended')),
    invited_at TIMESTAMPTZ,
    joined_at TIMESTAMPTZ,
    last_active_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(agency_id, email)
);

-- Generations (track all generated content)
CREATE TABLE generations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES agency_users(id) ON DELETE CASCADE,

    type TEXT NOT NULL CHECK (type IN ('image', 'video', 'edit', 'chat')),
    model TEXT NOT NULL,

    -- Request details
    prompt TEXT,
    parameters JSONB,

    -- Result
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    result_url TEXT,
    result_metadata JSONB,
    error_message TEXT,

    -- Cost
    credits_cost INTEGER NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Gallery Items (saved/favorited content)
CREATE TABLE gallery_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES agency_users(id) ON DELETE CASCADE,
    generation_id UUID REFERENCES generations(id) ON DELETE SET NULL,

    title TEXT,
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    type TEXT NOT NULL CHECK (type IN ('image', 'video')),

    is_favorited BOOLEAN DEFAULT false,
    tags TEXT[],

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX idx_agencies_slug ON agencies(slug);
CREATE INDEX idx_agencies_custom_domain ON agencies(custom_domain) WHERE custom_domain IS NOT NULL;
CREATE INDEX idx_agencies_status ON agencies(status);

CREATE INDEX idx_agency_users_agency ON agency_users(agency_id);
CREATE INDEX idx_agency_users_auth_user ON agency_users(auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX idx_agency_users_email ON agency_users(email);
CREATE INDEX idx_agency_users_status ON agency_users(status);

CREATE INDEX idx_generations_agency ON generations(agency_id);
CREATE INDEX idx_generations_user ON generations(user_id);
CREATE INDEX idx_generations_created ON generations(created_at DESC);
CREATE INDEX idx_generations_status ON generations(status);

CREATE INDEX idx_gallery_items_agency_user ON gallery_items(agency_id, user_id);
CREATE INDEX idx_gallery_items_created ON gallery_items(created_at DESC);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_items ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's agency_id
CREATE OR REPLACE FUNCTION get_user_agency_id()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT agency_id
        FROM agency_users
        WHERE auth_user_id = auth.uid()
        AND status = 'active'
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION is_agency_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM agency_users
        WHERE auth_user_id = auth.uid()
        AND status = 'active'
        AND role IN ('owner', 'admin')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Agencies: Users can only see their own agency
CREATE POLICY "Users can view their own agency"
    ON agencies FOR SELECT
    USING (id = get_user_agency_id());

-- Agency Users: Users can see other users in their agency
CREATE POLICY "Users can view agency members"
    ON agency_users FOR SELECT
    USING (agency_id = get_user_agency_id());

-- Agency Users: Only admins can insert (invite)
CREATE POLICY "Admins can invite users"
    ON agency_users FOR INSERT
    WITH CHECK (agency_id = get_user_agency_id() AND is_agency_admin());

-- Agency Users: Only admins can update
CREATE POLICY "Admins can update users"
    ON agency_users FOR UPDATE
    USING (agency_id = get_user_agency_id() AND is_agency_admin());

-- Agency Users: Only admins can delete
CREATE POLICY "Admins can delete users"
    ON agency_users FOR DELETE
    USING (agency_id = get_user_agency_id() AND is_agency_admin());

-- Generations: Users can view all agency generations
CREATE POLICY "Users can view agency generations"
    ON generations FOR SELECT
    USING (agency_id = get_user_agency_id());

-- Generations: Users can create their own generations
CREATE POLICY "Users can create generations"
    ON generations FOR INSERT
    WITH CHECK (agency_id = get_user_agency_id() AND user_id IN (
        SELECT id FROM agency_users WHERE auth_user_id = auth.uid()
    ));

-- Gallery Items: Users can view all agency gallery items
CREATE POLICY "Users can view agency gallery"
    ON gallery_items FOR SELECT
    USING (agency_id = get_user_agency_id());

-- Gallery Items: Users can manage their own items
CREATE POLICY "Users can manage their gallery items"
    ON gallery_items FOR ALL
    USING (user_id IN (
        SELECT id FROM agency_users WHERE auth_user_id = auth.uid()
    ));

-- =============================================
-- FUNCTIONS & TRIGGERS
-- =============================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_agencies_updated_at
    BEFORE UPDATE ON agencies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_agency_users_updated_at
    BEFORE UPDATE ON agency_users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_gallery_items_updated_at
    BEFORE UPDATE ON gallery_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Link auth user to agency_user on signup
CREATE OR REPLACE FUNCTION link_auth_user_to_agency()
RETURNS TRIGGER AS $$
BEGIN
    -- Find an invited user with this email and link them
    UPDATE agency_users
    SET
        auth_user_id = NEW.id,
        status = 'active',
        joined_at = NOW()
    WHERE email = NEW.email
    AND status = 'invited'
    AND auth_user_id IS NULL;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION link_auth_user_to_agency();

-- =============================================
-- SEED DATA
-- =============================================

-- Insert default plans
INSERT INTO agency_plans (name, description, monthly_credits, max_users, price_cents, custom_domain_allowed, features) VALUES
('Starter', 'Perfect for small teams getting started', 5000, 5, 9900, false, '{"priority_support": false}'::jsonb),
('Professional', 'For growing agencies with more needs', 20000, 25, 29900, true, '{"priority_support": true}'::jsonb),
('Enterprise', 'Custom solution for large organizations', 100000, 999, 99900, true, '{"priority_support": true, "dedicated_support": true}'::jsonb);

-- Insert a demo agency for testing
INSERT INTO agencies (
    name,
    slug,
    status,
    plan_id,
    monthly_credit_allocation,
    credit_pool,
    settings
) VALUES (
    'Demo Agency',
    'demo',
    'active',
    (SELECT id FROM agency_plans WHERE name = 'Professional'),
    20000,
    20000,
    '{
        "branding": {
            "logo_url": null,
            "favicon_url": null,
            "app_name": "Demo Studio",
            "primary_color": "#6366f1",
            "secondary_color": "#10b981"
        },
        "features": {
            "image_gen": true,
            "video_gen": true,
            "editing": true,
            "chat": true,
            "nsfw_enabled": true,
            "models_allowed": ["seedream", "nanoBanana", "qwen", "kling", "wan", "veo"]
        },
        "defaults": {
            "default_model": "seedream",
            "default_credits_per_user": null
        }
    }'::jsonb
);

-- Note: After running this schema, you'll need to:
-- 1. Create a user in Supabase Auth
-- 2. Insert an agency_user record linking them to the demo agency
--
-- Example:
-- INSERT INTO agency_users (agency_id, email, name, role, status)
-- VALUES (
--     (SELECT id FROM agencies WHERE slug = 'demo'),
--     'admin@example.com',
--     'Admin User',
--     'owner',
--     'invited'
-- );
--
-- Then when that user signs up with that email, they'll be automatically linked.
