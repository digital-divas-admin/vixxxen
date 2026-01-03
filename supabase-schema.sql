-- DivaForge Database Schema
-- Run this in Supabase SQL Editor

-- 1. PROFILES TABLE (extends auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  avatar_url text,
  credits integer default 1250 not null,
  plan text default 'free' check (plan in ('free', 'basic', 'pro', 'ultimate')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. USER_CHARACTERS TABLE (owned AI characters)
create table public.user_characters (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  character_id text not null,
  purchased_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, character_id)
);

-- 3. TRANSACTIONS TABLE (credit history)
create table public.transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  type text not null check (type in ('credit', 'debit', 'purchase', 'subscription', 'refund')),
  amount integer not null,
  description text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. ENABLE ROW LEVEL SECURITY
alter table public.profiles enable row level security;
alter table public.user_characters enable row level security;
alter table public.transactions enable row level security;

-- 5. RLS POLICIES FOR PROFILES
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- 6. RLS POLICIES FOR USER_CHARACTERS
create policy "Users can view own characters"
  on public.user_characters for select
  using (auth.uid() = user_id);

create policy "Users can insert own characters"
  on public.user_characters for insert
  with check (auth.uid() = user_id);

-- 7. RLS POLICIES FOR TRANSACTIONS
create policy "Users can view own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

create policy "Users can insert own transactions"
  on public.transactions for insert
  with check (auth.uid() = user_id);

-- 8. FUNCTION: Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );

  -- Give new users the 3 free starter characters
  insert into public.user_characters (user_id, character_id) values
    (new.id, 'aika'),
    (new.id, 'jessica'),
    (new.id, 'alexis');

  -- Log the signup bonus
  insert into public.transactions (user_id, type, amount, description)
  values (new.id, 'credit', 1250, 'Welcome bonus credits');

  return new;
end;
$$ language plpgsql security definer;

-- 9. TRIGGER: Run function on new user signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 10. FUNCTION: Deduct credits (with validation)
create or replace function public.deduct_credits(
  p_user_id uuid,
  p_amount integer,
  p_description text
)
returns boolean as $$
declare
  v_current_credits integer;
begin
  -- Get current credits
  select credits into v_current_credits
  from public.profiles
  where id = p_user_id;

  -- Check if enough credits
  if v_current_credits < p_amount then
    return false;
  end if;

  -- Deduct credits
  update public.profiles
  set credits = credits - p_amount,
      updated_at = now()
  where id = p_user_id;

  -- Log transaction
  insert into public.transactions (user_id, type, amount, description)
  values (p_user_id, 'debit', -p_amount, p_description);

  return true;
end;
$$ language plpgsql security definer;

-- 11. FUNCTION: Add credits
create or replace function public.add_credits(
  p_user_id uuid,
  p_amount integer,
  p_description text
)
returns void as $$
begin
  update public.profiles
  set credits = credits + p_amount,
      updated_at = now()
  where id = p_user_id;

  insert into public.transactions (user_id, type, amount, description)
  values (p_user_id, 'credit', p_amount, p_description);
end;
$$ language plpgsql security definer;

-- 12. FUNCTION: Purchase character
create or replace function public.purchase_character(
  p_user_id uuid,
  p_character_id text,
  p_price integer
)
returns boolean as $$
declare
  v_current_credits integer;
  v_already_owned boolean;
begin
  -- Check if already owned
  select exists(
    select 1 from public.user_characters
    where user_id = p_user_id and character_id = p_character_id
  ) into v_already_owned;

  if v_already_owned then
    return false;
  end if;

  -- Get current credits
  select credits into v_current_credits
  from public.profiles
  where id = p_user_id;

  -- Check if enough credits
  if v_current_credits < p_price then
    return false;
  end if;

  -- Deduct credits
  update public.profiles
  set credits = credits - p_price,
      updated_at = now()
  where id = p_user_id;

  -- Add character to user's collection
  insert into public.user_characters (user_id, character_id)
  values (p_user_id, p_character_id);

  -- Log transaction
  insert into public.transactions (user_id, type, amount, description, metadata)
  values (
    p_user_id,
    'purchase',
    -p_price,
    'Character purchase: ' || p_character_id,
    jsonb_build_object('character_id', p_character_id)
  );

  return true;
end;
$$ language plpgsql security definer;

-- Done! Your DivaForge database is ready.
