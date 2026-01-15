-- Landing Page Images Storage Schema
-- Run this in Supabase SQL Editor

-- ===========================================
-- 1. CREATE STORAGE BUCKET (run in Storage settings or via SQL)
-- ===========================================
-- Note: You may need to create the bucket manually in Supabase Dashboard:
-- 1. Go to Storage > Create new bucket
-- 2. Name: "landing-images"
-- 3. Make it PUBLIC (for landing page images)

-- Alternatively, use this SQL:
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'landing-images',
  'landing-images',
  true,
  5242880, -- 5MB limit
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- ===========================================
-- 2. LANDING IMAGES METADATA TABLE
-- ===========================================
create table if not exists public.landing_images (
  id uuid default gen_random_uuid() primary key,
  filename varchar(255) not null,
  original_filename varchar(255) not null,
  storage_path text not null,
  public_url text not null,
  mime_type varchar(50) not null,
  file_size integer not null,
  width integer,
  height integer,
  alt_text varchar(500),
  tags text[] default array[]::text[],
  usage_context varchar(50), -- 'character', 'showcase', 'hero', 'general'
  usage_reference_id uuid, -- optional FK to landing_characters or landing_showcase
  uploaded_by uuid references auth.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indexes for efficient queries
create index if not exists idx_landing_images_created on public.landing_images(created_at desc);
create index if not exists idx_landing_images_context on public.landing_images(usage_context);
create index if not exists idx_landing_images_tags on public.landing_images using gin(tags);

-- ===========================================
-- 3. ROW LEVEL SECURITY
-- ===========================================
alter table public.landing_images enable row level security;

-- Public read access (images are used on public landing page)
create policy "Anyone can view landing images"
  on public.landing_images for select
  using (true);

-- Admin write access (handled via service role key which bypasses RLS)
-- These policies allow admins with role='admin' to manage images
create policy "Admins can insert landing images"
  on public.landing_images for insert
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can update landing images"
  on public.landing_images for update
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can delete landing images"
  on public.landing_images for delete
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- ===========================================
-- 4. STORAGE POLICIES FOR BUCKET
-- ===========================================
-- Note: These use the new storage.objects policies format

-- Allow anyone to read images (public landing page)
create policy "Public can read landing images"
  on storage.objects for select
  using (bucket_id = 'landing-images');

-- Allow admins to upload images
create policy "Admins can upload landing images"
  on storage.objects for insert
  with check (
    bucket_id = 'landing-images'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- Allow admins to delete images
create policy "Admins can delete landing images"
  on storage.objects for delete
  using (
    bucket_id = 'landing-images'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- ===========================================
-- 5. HELPER FUNCTION FOR GENERATING UNIQUE FILENAMES
-- ===========================================
create or replace function generate_landing_image_filename(original_name text)
returns text as $$
declare
  extension text;
  base_name text;
  unique_id text;
begin
  -- Extract extension
  extension := lower(substring(original_name from '\.([^.]+)$'));
  if extension is null then
    extension := 'jpg';
  end if;

  -- Generate unique filename
  unique_id := encode(gen_random_bytes(8), 'hex');

  return unique_id || '.' || extension;
end;
$$ language plpgsql;

-- Done! Your landing images storage is ready.
