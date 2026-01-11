-- Landing Page CMS Schema
-- Run this in Supabase SQL Editor

-- ===========================================
-- 1. LANDING PAGE SECTIONS (controls visibility and order)
-- ===========================================
create table if not exists public.landing_sections (
  id uuid default gen_random_uuid() primary key,
  section_key varchar(50) not null unique,
  display_name varchar(100) not null,
  display_order integer not null default 0,
  is_visible boolean default true,
  settings jsonb default '{}',
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_landing_sections_order on public.landing_sections(display_order);

-- ===========================================
-- 2. LANDING PAGE CONTENT (text, headlines, CTAs)
-- ===========================================
create table if not exists public.landing_content (
  id uuid default gen_random_uuid() primary key,
  section_key varchar(50) not null,
  content_key varchar(100) not null,
  content_type varchar(20) not null default 'text', -- 'text', 'html', 'image', 'video'
  content_value text not null,
  display_order integer default 0,
  metadata jsonb default '{}', -- for links, alt text, etc.
  is_visible boolean default true,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(section_key, content_key)
);

create index if not exists idx_landing_content_section on public.landing_content(section_key);

-- ===========================================
-- 3. LANDING PAGE STATS (social proof numbers)
-- ===========================================
create table if not exists public.landing_stats (
  id uuid default gen_random_uuid() primary key,
  value varchar(50) not null,
  label varchar(100) not null,
  icon varchar(50) default '📊',
  display_order integer not null default 0,
  is_visible boolean default true,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_landing_stats_order on public.landing_stats(display_order);

-- ===========================================
-- 4. LANDING PAGE FEATURED CHARACTERS (case studies)
-- ===========================================
create table if not exists public.landing_characters (
  id uuid default gen_random_uuid() primary key,
  name varchar(100) not null,
  handle varchar(100),
  image_url text not null,
  metrics jsonb not null default '[]', -- [{icon, value, label}]
  cta_text varchar(100) default 'See Their Content',
  cta_link text,
  display_order integer not null default 0,
  is_visible boolean default true,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_landing_characters_order on public.landing_characters(display_order);

-- ===========================================
-- 5. LANDING PAGE PIPELINE STEPS
-- ===========================================
create table if not exists public.landing_pipeline_steps (
  id uuid default gen_random_uuid() primary key,
  step_number integer not null,
  title varchar(100) not null,
  description text not null,
  icon varchar(50) default '1️⃣',
  display_order integer not null default 0,
  is_visible boolean default true,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_landing_pipeline_order on public.landing_pipeline_steps(display_order);

-- ===========================================
-- 6. LANDING PAGE CAPABILITIES (feature cards)
-- ===========================================
create table if not exists public.landing_capabilities (
  id uuid default gen_random_uuid() primary key,
  icon varchar(50) not null,
  title varchar(100) not null,
  description text not null,
  display_order integer not null default 0,
  is_visible boolean default true,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_landing_capabilities_order on public.landing_capabilities(display_order);

-- ===========================================
-- 7. LANDING PAGE SHOWCASE IMAGES (content gallery)
-- ===========================================
create table if not exists public.landing_showcase (
  id uuid default gen_random_uuid() primary key,
  image_url text not null,
  caption varchar(200),
  content_type varchar(50) default 'image', -- 'image', 'video'
  size varchar(20) default 'medium', -- 'large', 'medium', 'small' for bento grid
  display_order integer not null default 0,
  is_visible boolean default true,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_landing_showcase_order on public.landing_showcase(display_order);

-- ===========================================
-- 8. ROW LEVEL SECURITY
-- ===========================================

-- Enable RLS on all tables
alter table public.landing_sections enable row level security;
alter table public.landing_content enable row level security;
alter table public.landing_stats enable row level security;
alter table public.landing_characters enable row level security;
alter table public.landing_pipeline_steps enable row level security;
alter table public.landing_capabilities enable row level security;
alter table public.landing_showcase enable row level security;

-- Public read access (landing page is public)
create policy "Anyone can view landing sections" on public.landing_sections for select using (true);
create policy "Anyone can view landing content" on public.landing_content for select using (true);
create policy "Anyone can view landing stats" on public.landing_stats for select using (true);
create policy "Anyone can view landing characters" on public.landing_characters for select using (true);
create policy "Anyone can view landing pipeline" on public.landing_pipeline_steps for select using (true);
create policy "Anyone can view landing capabilities" on public.landing_capabilities for select using (true);
create policy "Anyone can view landing showcase" on public.landing_showcase for select using (true);

-- Admin write access (using service role key bypasses RLS anyway)
create policy "Service role can manage landing sections" on public.landing_sections for all using (true);
create policy "Service role can manage landing content" on public.landing_content for all using (true);
create policy "Service role can manage landing stats" on public.landing_stats for all using (true);
create policy "Service role can manage landing characters" on public.landing_characters for all using (true);
create policy "Service role can manage landing pipeline" on public.landing_pipeline_steps for all using (true);
create policy "Service role can manage landing capabilities" on public.landing_capabilities for all using (true);
create policy "Service role can manage landing showcase" on public.landing_showcase for all using (true);

-- ===========================================
-- 9. SEED DEFAULT DATA
-- ===========================================

-- Sections
insert into public.landing_sections (section_key, display_name, display_order, is_visible) values
  ('hero', 'Hero Section', 1, true),
  ('stats', 'Stats Bar', 2, true),
  ('characters', 'Featured Characters', 3, true),
  ('pipeline', 'The System Pipeline', 4, true),
  ('showcase', 'Content Showcase', 5, true),
  ('capabilities', 'Generation Capabilities', 6, true),
  ('education', 'Education & Mentorship', 7, true),
  ('pricing', 'Pricing Preview', 8, true),
  ('final_cta', 'Final Call to Action', 9, true)
on conflict (section_key) do nothing;

-- Hero Content
insert into public.landing_content (section_key, content_key, content_type, content_value, metadata) values
  ('hero', 'headline', 'text', 'Build Your AI Content Empire', '{}'),
  ('hero', 'subheadline', 'text', 'Create a character. Generate content. Monetize everywhere.', '{}'),
  ('hero', 'primary_cta_text', 'text', 'Start Building', '{}'),
  ('hero', 'primary_cta_link', 'text', '#signup', '{}'),
  ('hero', 'secondary_cta_text', 'text', 'See How It Works', '{}'),
  ('hero', 'secondary_cta_link', 'text', '#pipeline', '{}'),
  ('hero', 'trust_badge', 'text', 'Join 500+ creators building their AI empire', '{}')
on conflict (section_key, content_key) do nothing;

-- Stats
insert into public.landing_stats (value, label, icon, display_order) values
  ('$2.4M+', 'Creator Revenue', '💰', 1),
  ('500+', 'Active Creators', '👥', 2),
  ('12M+', 'Content Generated', '🖼️', 3),
  ('50K+', 'Followers Grown', '📈', 4)
on conflict do nothing;

-- Featured Characters (dummy data)
insert into public.landing_characters (name, handle, image_url, metrics, cta_text, display_order) values
  ('Luna Vega', '@lunavega.ai', 'https://placehold.co/400x500/1a1a2e/ff2ebb?text=Luna', '[{"icon": "📸", "value": "85K", "label": "Instagram Followers"}, {"icon": "💰", "value": "$8,500/mo", "label": "Fanvue Revenue"}, {"icon": "🎯", "value": "4 months", "label": "Time to Build"}]', 'See Her Journey', 1),
  ('Aria Chen', '@ariachen.ai', 'https://placehold.co/400x500/1a1a2e/00b2ff?text=Aria', '[{"icon": "📸", "value": "120K", "label": "Instagram Followers"}, {"icon": "💰", "value": "$12,000/mo", "label": "Fanvue Revenue"}, {"icon": "🎯", "value": "6 months", "label": "Time to Build"}]', 'See Her Journey', 2),
  ('Nova Sky', '@novasky.ai', 'https://placehold.co/400x500/1a1a2e/9b59b6?text=Nova', '[{"icon": "📸", "value": "65K", "label": "Instagram Followers"}, {"icon": "💰", "value": "$5,200/mo", "label": "Fanvue Revenue"}, {"icon": "🎯", "value": "3 months", "label": "Time to Build"}]', 'See Her Journey', 3)
on conflict do nothing;

-- Pipeline Steps
insert into public.landing_pipeline_steps (step_number, title, description, icon, display_order) values
  (1, 'Create', 'Design your unique character identity with our AI tools', '🎨', 1),
  (2, 'Generate', 'Produce stunning images, videos & content at scale', '✨', 2),
  (3, 'Grow', 'Build your audience on Instagram, Twitter & TikTok', '📱', 3),
  (4, 'Monetize', 'Convert followers to paid subscribers on Fanvue & more', '💎', 4)
on conflict do nothing;

-- Capabilities
insert into public.landing_capabilities (icon, title, description, display_order) values
  ('📸', 'AI Images', 'Multiple AI models for any style. Consistent character identity across all generations.', 1),
  ('🎬', 'AI Videos', 'Create motion content with Kling, Veo, and WAN. Perfect for reels and stories.', 2),
  ('✏️', 'Smart Editing', 'Background removal, inpainting, and enhancement tools built right in.', 3),
  ('🎭', 'Character System', 'Build and maintain consistent personas that your audience will recognize.', 4),
  ('🔊', 'AI Voice', 'Add voice to your content with ElevenLabs integration for authentic audio.', 5),
  ('📱', 'Social-Ready', 'Export in perfect sizes for Instagram, Twitter, TikTok, and more.', 6)
on conflict do nothing;

-- Content Showcase (placeholder images)
insert into public.landing_showcase (image_url, caption, content_type, size, display_order) values
  ('https://placehold.co/600x800/1a1a2e/ff2ebb?text=Hero+Shot', 'Professional photoshoot quality', 'image', 'large', 1),
  ('https://placehold.co/400x400/1a1a2e/00b2ff?text=Story', 'Instagram Story', 'image', 'medium', 2),
  ('https://placehold.co/400x400/1a1a2e/9b59b6?text=Tweet', 'Twitter Post', 'image', 'medium', 3),
  ('https://placehold.co/300x300/1a1a2e/ff2ebb?text=Lifestyle', 'Lifestyle content', 'image', 'small', 4),
  ('https://placehold.co/300x300/1a1a2e/00b2ff?text=Promo', 'Promotional post', 'image', 'small', 5),
  ('https://placehold.co/300x300/1a1a2e/9b59b6?text=Casual', 'Casual selfie', 'image', 'small', 6),
  ('https://placehold.co/300x300/1a1a2e/ff2ebb?text=Premium', 'Premium content', 'image', 'small', 7)
on conflict do nothing;

-- Education Section Content
insert into public.landing_content (section_key, content_key, content_type, content_value, metadata) values
  ('education', 'headline', 'text', 'We Don''t Just Give You Tools', '{}'),
  ('education', 'subheadline', 'text', 'We Teach You The Business', '{}'),
  ('education', 'bullet_1', 'text', 'Step-by-step courses from zero to revenue', '{}'),
  ('education', 'bullet_2', 'text', 'Platform growth strategies that actually work', '{}'),
  ('education', 'bullet_3', 'text', 'Monetization playbooks for Fanvue, Patreon & more', '{}'),
  ('education', 'bullet_4', 'text', 'Private 1-on-1 mentorship available', '{}'),
  ('education', 'cta_text', 'text', 'Explore Courses', '{}'),
  ('education', 'cta_link', 'text', '#courses', '{}')
on conflict (section_key, content_key) do nothing;

-- Pricing Section Content
insert into public.landing_content (section_key, content_key, content_type, content_value, metadata) values
  ('pricing', 'headline', 'text', 'Choose Your Path', '{}'),
  ('pricing', 'show_pricing_cards', 'text', 'true', '{}'),
  ('pricing', 'featured_tier', 'text', 'creator', '{}')
on conflict (section_key, content_key) do nothing;

-- Final CTA Content
insert into public.landing_content (section_key, content_key, content_type, content_value, metadata) values
  ('final_cta', 'headline', 'text', 'Ready to Build Your AI Creator Business?', '{}'),
  ('final_cta', 'subheadline', 'text', 'Join hundreds of creators already building their empires', '{}'),
  ('final_cta', 'primary_cta_text', 'text', 'Get Started Free', '{}'),
  ('final_cta', 'primary_cta_link', 'text', '#signup', '{}'),
  ('final_cta', 'secondary_cta_text', 'text', 'Talk to Us', '{}'),
  ('final_cta', 'secondary_cta_link', 'text', 'mailto:admin@digitaldivas.ai', '{}')
on conflict (section_key, content_key) do nothing;

-- Showcase Section Content
insert into public.landing_content (section_key, content_key, content_type, content_value, metadata) values
  ('showcase', 'headline', 'text', 'One Character. Unlimited Content.', '{}'),
  ('showcase', 'subheadline', 'text', 'Same face. Same style. Infinite variety.', '{}')
on conflict (section_key, content_key) do nothing;

-- Characters Section Content
insert into public.landing_content (section_key, content_key, content_type, content_value, metadata) values
  ('characters', 'headline', 'text', 'Creators Are Building Real Businesses', '{}'),
  ('characters', 'subheadline', 'text', 'See what''s possible with Vixxxen', '{}')
on conflict (section_key, content_key) do nothing;

-- Pipeline Section Content
insert into public.landing_content (section_key, content_key, content_type, content_value, metadata) values
  ('pipeline', 'headline', 'text', 'Your Path to AI Creator Income', '{}')
on conflict (section_key, content_key) do nothing;

-- Capabilities Section Content
insert into public.landing_content (section_key, content_key, content_type, content_value, metadata) values
  ('capabilities', 'headline', 'text', 'Professional Tools. Stunning Results.', '{}')
on conflict (section_key, content_key) do nothing;

-- ===========================================
-- 10. UPDATE TRIGGERS
-- ===========================================

-- Function to update timestamps
create or replace function update_landing_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- Apply triggers
create trigger update_landing_sections_updated_at before update on public.landing_sections
  for each row execute function update_landing_updated_at();

create trigger update_landing_content_updated_at before update on public.landing_content
  for each row execute function update_landing_updated_at();

create trigger update_landing_stats_updated_at before update on public.landing_stats
  for each row execute function update_landing_updated_at();

create trigger update_landing_characters_updated_at before update on public.landing_characters
  for each row execute function update_landing_updated_at();

create trigger update_landing_pipeline_updated_at before update on public.landing_pipeline_steps
  for each row execute function update_landing_updated_at();

create trigger update_landing_capabilities_updated_at before update on public.landing_capabilities
  for each row execute function update_landing_updated_at();

create trigger update_landing_showcase_updated_at before update on public.landing_showcase
  for each row execute function update_landing_updated_at();
