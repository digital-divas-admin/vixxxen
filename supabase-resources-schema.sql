-- DivaForge Resource Library Schema
-- Run this in Supabase SQL Editor after the main schema

-- 1. RESOURCES TABLE
create table public.resources (
  id uuid default gen_random_uuid() primary key,
  title varchar(255) not null,
  description text,
  type varchar(50) not null check (type in ('tutorial', 'guide', 'video')),
  topic varchar(100) not null check (topic in ('prompts', 'techniques', 'tools', 'business')),
  thumbnail_url text,
  content_url text,                  -- External link (video URL, PDF, etc.)
  content_body text,                 -- Inline content for tutorials/guides (HTML/Markdown)
  access_tier varchar(50) not null check (access_tier in ('supernova', 'mentorship')),
  duration varchar(20),              -- For videos: "5:30", for guides: "10 min read"
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. INDEX for faster filtering
create index idx_resources_type on public.resources(type);
create index idx_resources_topic on public.resources(topic);
create index idx_resources_access_tier on public.resources(access_tier);

-- 3. ENABLE ROW LEVEL SECURITY
alter table public.resources enable row level security;

-- 4. RLS POLICIES FOR RESOURCES
-- NOTE: Access control for content is handled by the get_accessible_resources function
-- The raw table shows metadata only; content is protected by the function

-- Authenticated users can view resource metadata (title, thumbnail, tier info)
-- Full content access is controlled by the get_accessible_resources function
create policy "Authenticated users can view resource metadata"
  on public.resources for select
  to authenticated
  using (true);

-- Admins can manage resources
create policy "Admins can manage resources"
  on public.resources for all
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- Service role can manage resources (for backend operations)
create policy "Service role can manage resources"
  on public.resources for all
  to service_role
  using (true)
  with check (true);

-- 6. FUNCTION: Get resources filtered by user's membership tier
create or replace function public.get_accessible_resources(p_user_id uuid)
returns table (
  id uuid,
  title varchar(255),
  description text,
  type varchar(50),
  topic varchar(100),
  thumbnail_url text,
  content_url text,
  content_body text,
  access_tier varchar(50),
  duration varchar(20),
  is_locked boolean,
  created_at timestamp with time zone
) as $$
declare
  v_user_tier varchar(50);
begin
  -- Get user's membership tier
  select m.tier into v_user_tier
  from public.memberships m
  where m.user_id = p_user_id and m.is_active = true;

  return query
  select
    r.id,
    r.title,
    r.description,
    r.type,
    r.topic,
    r.thumbnail_url,
    -- Only return content URLs/body if user has access
    case
      when v_user_tier = 'mentorship' then r.content_url
      when v_user_tier = 'supernova' and r.access_tier = 'supernova' then r.content_url
      else null
    end as content_url,
    case
      when v_user_tier = 'mentorship' then r.content_body
      when v_user_tier = 'supernova' and r.access_tier = 'supernova' then r.content_body
      else null
    end as content_body,
    r.access_tier,
    r.duration,
    -- Determine if resource is locked for this user
    case
      when v_user_tier is null then true  -- No membership = all locked
      when v_user_tier = 'mentorship' then false  -- Mentorship = nothing locked
      when v_user_tier = 'supernova' and r.access_tier = 'mentorship' then true  -- Supernova can't access mentorship content
      else false
    end as is_locked,
    r.created_at
  from public.resources r
  order by r.created_at desc;
end;
$$ language plpgsql security definer;

-- 7. SAMPLE DATA (remove or modify for production)
insert into public.resources (title, description, type, topic, thumbnail_url, content_url, content_body, access_tier, duration) values
  -- Supernova tier resources
  ('Mastering AI Prompts', 'Learn the fundamentals of writing effective prompts for image generation.', 'tutorial', 'prompts', null, null, '<h2>Introduction to Prompting</h2><p>Great prompts are the foundation of amazing AI-generated images...</p>', 'supernova', '15 min read'),
  ('Seedream Quick Start Guide', 'Get up and running with Seedream 4.5 in minutes.', 'guide', 'tools', null, null, '<h2>Getting Started</h2><p>Seedream is one of the most powerful image generation models...</p>', 'supernova', '10 min read'),
  ('Understanding Guidance Scale', 'Deep dive into how guidance scale affects your generations.', 'tutorial', 'techniques', null, null, '<h2>What is Guidance Scale?</h2><p>Guidance scale controls how closely the AI follows your prompt...</p>', 'supernova', '8 min read'),
  ('Introduction to AI Art', 'Watch this comprehensive overview of AI image generation.', 'video', 'techniques', null, 'https://www.youtube.com/watch?v=example1', null, 'supernova', '12:30'),

  -- Mentorship tier resources (exclusive)
  ('Advanced Composition Techniques', 'Master-level techniques for creating stunning compositions.', 'tutorial', 'techniques', null, null, '<h2>Advanced Composition</h2><p>Professional artists use these secret techniques...</p>', 'mentorship', '25 min read'),
  ('Building Your AI Art Business', 'Turn your AI art skills into a profitable business.', 'guide', 'business', null, null, '<h2>Monetizing Your Skills</h2><p>Learn how top creators are earning six figures...</p>', 'mentorship', '30 min read'),
  ('Private Mentorship: Prompt Engineering', 'Exclusive deep-dive into professional prompt engineering.', 'video', 'prompts', null, 'https://www.youtube.com/watch?v=example2', null, 'mentorship', '45:00'),
  ('Client Management for AI Artists', 'How to work with clients and deliver professional results.', 'guide', 'business', null, null, '<h2>Working with Clients</h2><p>Managing client expectations is crucial...</p>', 'mentorship', '20 min read');

-- Done! Resource library schema is ready.
