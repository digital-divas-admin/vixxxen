-- Generated Images Table (for Supabase Storage integration)
-- Run this in Supabase SQL Editor

-- 1. CREATE TABLE for image metadata
create table public.generated_images (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  storage_path text not null,
  public_url text not null,
  prompt text,
  negative_prompt text,
  model text not null,
  aspect_ratio text,
  resolution text,
  character_id text,
  credits_used integer default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. ENABLE RLS
alter table public.generated_images enable row level security;

-- 3. RLS POLICIES - users can only see their own images
create policy "Users can view own images"
  on public.generated_images for select
  using (auth.uid() = user_id);

create policy "Users can insert own images"
  on public.generated_images for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own images"
  on public.generated_images for delete
  using (auth.uid() = user_id);

-- 4. INDEX for faster queries
create index idx_generated_images_user_id on public.generated_images(user_id);
create index idx_generated_images_created_at on public.generated_images(created_at desc);

-- 5. STORAGE POLICIES for the generated-images bucket
-- Allow authenticated users to upload to their own folder
insert into storage.policies (name, bucket_id, operation, definition, check_expression)
values (
  'Users can upload own images',
  'generated-images',
  'INSERT',
  'true',
  '(bucket_id = ''generated-images'' AND auth.uid()::text = (storage.foldername(name))[1])'
) on conflict do nothing;

-- Allow anyone to view images (public bucket)
insert into storage.policies (name, bucket_id, operation, definition)
values (
  'Public read access',
  'generated-images',
  'SELECT',
  'true'
) on conflict do nothing;

-- Allow users to delete their own images
insert into storage.policies (name, bucket_id, operation, definition)
values (
  'Users can delete own images',
  'generated-images',
  'DELETE',
  'auth.uid()::text = (storage.foldername(name))[1]'
) on conflict do nothing;

-- Done! Your storage schema is ready.
