-- Marketplace Characters Schema
-- Run this in Supabase SQL Editor

-- 1. Create marketplace_characters table
create table if not exists public.marketplace_characters (
  id uuid default gen_random_uuid() primary key,
  name varchar(100) not null,
  category varchar(100) not null,
  description text,
  price decimal(10,2) default 0,
  rating decimal(2,1) default 5.0,
  purchases integer default 0,
  tags text[] default '{}',
  image_url text,
  gallery_images text[] default '{}',
  lora_url text,
  trigger_word varchar(100),
  is_active boolean default true,
  sort_order integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create user_characters table to track character ownership
create table if not exists public.user_characters (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  character_id uuid references public.marketplace_characters(id) on delete cascade not null,
  purchased_at timestamp with time zone default timezone('utc'::text, now()) not null,
  amount_paid decimal(10,2) default 0,
  unique(user_id, character_id)
);

-- 3. Create indexes for performance
create index if not exists idx_marketplace_characters_active on public.marketplace_characters(is_active);
create index if not exists idx_marketplace_characters_category on public.marketplace_characters(category);
create index if not exists idx_marketplace_characters_sort on public.marketplace_characters(sort_order);
create index if not exists idx_user_characters_user_id on public.user_characters(user_id);
create index if not exists idx_user_characters_character_id on public.user_characters(character_id);

-- 4. RLS Policies for marketplace_characters
alter table public.marketplace_characters enable row level security;

create policy "Anyone can view active characters"
  on public.marketplace_characters for select
  using (is_active = true);

create policy "Admins can manage characters"
  on public.marketplace_characters for all
  using (true);

-- 5. RLS Policies for user_characters
alter table public.user_characters enable row level security;

create policy "Users can view their own characters"
  on public.user_characters for select
  using (auth.uid() = user_id);

create policy "Service role can manage character ownership"
  on public.user_characters for all
  using (true);

-- 6. Insert default characters (migrate from hardcoded data)
insert into public.marketplace_characters (name, category, description, price, rating, purchases, tags, image_url, sort_order) values
  ('Aika', 'Fitness & Athletic', 'A vibrant fitness influencer perfect for athletic content, workout posts, and healthy lifestyle imagery. Aika brings energy and motivation to every generation.', 0, 4.9, 5234, ARRAY['Fitness', 'Athletic', 'Healthy', 'Energetic'], null, 1),
  ('Jessica', 'Fashion & Lifestyle', 'Elegant and sophisticated, Jessica is your go-to for fashion editorials, lifestyle content, and luxury brand imagery. Perfect for high-end aesthetic posts.', 0, 4.8, 4892, ARRAY['Fashion', 'Elegant', 'Luxury', 'Lifestyle'], null, 2),
  ('Alexis', 'Beauty & Glamour', 'A beauty icon specializing in glamorous makeup looks, beauty product promotions, and stunning portrait photography. Alexis shines in every frame.', 0, 4.9, 6127, ARRAY['Beauty', 'Glamour', 'Makeup', 'Portrait'], null, 3),
  ('Maya', 'Travel & Adventure', 'An adventurous spirit who brings wanderlust to life. Perfect for travel content, outdoor photography, and destination highlights. Maya captures the essence of exploration.', 12.99, 4.7, 3421, ARRAY['Travel', 'Adventure', 'Outdoor', 'Nature'], null, 4),
  ('Sophia', 'Business & Professional', 'Professional and polished, Sophia excels in corporate headshots, business presentations, and professional networking content. The perfect choice for B2B marketing.', 14.99, 4.8, 2893, ARRAY['Business', 'Professional', 'Corporate', 'Headshots'], null, 5),
  ('Luna', 'Fantasy & Artistic', 'Ethereal and mystical, Luna brings fantasy and artistic visions to reality. Ideal for creative projects, fantasy art, and imaginative storytelling.', 16.99, 4.9, 4567, ARRAY['Fantasy', 'Artistic', 'Creative', 'Mystical'], null, 6),
  ('Zara', 'Streetwear & Urban', 'Bold and edgy, Zara dominates streetwear fashion and urban culture content. Perfect for contemporary street style, sneaker culture, and modern lifestyle posts.', 11.99, 4.6, 3892, ARRAY['Streetwear', 'Urban', 'Bold', 'Edgy'], null, 7),
  ('Emma', 'Wellness & Mindfulness', 'Serene and calming, Emma embodies wellness and mindfulness. Perfect for yoga content, meditation imagery, and holistic health promotions.', 13.99, 4.8, 2156, ARRAY['Wellness', 'Yoga', 'Meditation', 'Calm'], null, 8)
on conflict do nothing;
