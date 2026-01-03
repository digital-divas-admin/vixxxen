-- Start Here Guides Schema
-- Run this in Supabase SQL Editor

-- 1. Create starthere_guides table
create table if not exists public.starthere_guides (
  id uuid default gen_random_uuid() primary key,
  title varchar(255) not null,
  description text,
  icon varchar(10) default '📋',
  thumbnail_url text,
  content_url text,
  content_body text,
  duration varchar(50),
  sort_order integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create starthere_completions table to track user progress
create table if not exists public.starthere_completions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  guide_id uuid references public.starthere_guides(id) on delete cascade not null,
  completed_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, guide_id)
);

-- 3. Create indexes for performance
create index if not exists idx_starthere_guides_sort_order on public.starthere_guides(sort_order);
create index if not exists idx_starthere_completions_user_id on public.starthere_completions(user_id);
create index if not exists idx_starthere_completions_guide_id on public.starthere_completions(guide_id);

-- 4. RLS Policies for starthere_guides
alter table public.starthere_guides enable row level security;

create policy "Anyone can view start here guides"
  on public.starthere_guides for select
  using (true);

create policy "Admins can manage start here guides"
  on public.starthere_guides for all
  using (true);

-- 5. RLS Policies for starthere_completions
alter table public.starthere_completions enable row level security;

create policy "Users can view their own completions"
  on public.starthere_completions for select
  using (auth.uid() = user_id);

create policy "Users can mark guides as complete"
  on public.starthere_completions for insert
  with check (auth.uid() = user_id);

create policy "Service role can manage completions"
  on public.starthere_completions for all
  using (true);

-- 6. Insert sample guides
insert into public.starthere_guides (title, description, icon, duration, sort_order) values
  ('How to Create an Instagram Account', 'Learn how to set up your AI influencer Instagram account the right way - from username to bio optimization.', '📱', '10 min read', 1),
  ('Choosing Your Niche', 'Discover how to pick a profitable niche that aligns with your AI character and audience.', '🎯', '8 min read', 2),
  ('Creating Your First AI Character', 'Step-by-step guide to designing and generating your AI influencer persona.', '✨', '15 min read', 3),
  ('Content Strategy Basics', 'Learn how often to post and what types of content perform best on Instagram.', '📅', '12 min read', 4),
  ('Setting Up Your Content Calendar', 'Organize your posting schedule for consistent growth and engagement.', '📆', '10 min read', 5),
  ('Growing Your First 1000 Followers', 'Proven strategies to build your initial audience and gain traction.', '📈', '15 min read', 6),
  ('Monetization Basics', 'Introduction to revenue streams available for AI influencers.', '💰', '10 min read', 7)
on conflict do nothing;
