-- Purchasable Resources Schema
-- Run this in Supabase SQL Editor

-- 1. Add tier access columns to resources table
alter table public.resources
add column if not exists free_for_supernova boolean default true,
add column if not exists free_for_mentorship boolean default true;

-- 2. Add purchase-related columns to resources table
alter table public.resources
add column if not exists price decimal(10,2) default null,
add column if not exists sale_price decimal(10,2) default null,
add column if not exists sale_ends_at timestamp with time zone default null,
add column if not exists is_purchasable boolean default false,
add column if not exists creator_id uuid references auth.users(id) default null,
add column if not exists revenue_share_percent integer default 70;

-- 3. Create user_purchases table
create table if not exists public.user_purchases (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  resource_id uuid references public.resources(id) on delete cascade not null,
  amount_paid decimal(10,2) not null,
  original_price decimal(10,2) not null,
  purchased_at timestamp with time zone default timezone('utc'::text, now()) not null,
  credit_applied boolean default false,
  credit_amount decimal(10,2) default 0,
  payment_provider varchar(50) default 'coinbase',
  payment_id varchar(255),
  unique(user_id, resource_id)
);

-- 4. Add credit_balance to profiles table
alter table public.profiles
add column if not exists credit_balance decimal(10,2) default 0;

-- 5. Create creator_earnings table
create table if not exists public.creator_earnings (
  id uuid default gen_random_uuid() primary key,
  creator_id uuid references auth.users(id) on delete cascade not null,
  purchase_id uuid references public.user_purchases(id) on delete cascade not null,
  resource_id uuid references public.resources(id) on delete cascade not null,
  gross_amount decimal(10,2) not null,
  platform_fee decimal(10,2) not null,
  net_amount decimal(10,2) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  paid_out boolean default false,
  paid_out_at timestamp with time zone default null,
  payout_reference varchar(255) default null
);

-- 6. Create credit_transactions table for tracking credit history
create table if not exists public.credit_transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  amount decimal(10,2) not null,
  type varchar(50) not null check (type in ('earned', 'spent', 'refund', 'upgrade_credit')),
  description text,
  resource_id uuid references public.resources(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. Create indexes for performance
create index if not exists idx_user_purchases_user_id on public.user_purchases(user_id);
create index if not exists idx_user_purchases_resource_id on public.user_purchases(resource_id);
create index if not exists idx_creator_earnings_creator_id on public.creator_earnings(creator_id);
create index if not exists idx_creator_earnings_paid_out on public.creator_earnings(paid_out);
create index if not exists idx_credit_transactions_user_id on public.credit_transactions(user_id);
create index if not exists idx_resources_is_purchasable on public.resources(is_purchasable);
create index if not exists idx_resources_creator_id on public.resources(creator_id);

-- 8. RLS Policies for user_purchases
alter table public.user_purchases enable row level security;

create policy "Users can view their own purchases"
  on public.user_purchases for select
  using (auth.uid() = user_id);

create policy "Service role can manage purchases"
  on public.user_purchases for all
  using (true);

-- 9. RLS Policies for creator_earnings
alter table public.creator_earnings enable row level security;

create policy "Creators can view their own earnings"
  on public.creator_earnings for select
  using (auth.uid() = creator_id);

create policy "Service role can manage earnings"
  on public.creator_earnings for all
  using (true);

-- 10. RLS Policies for credit_transactions
alter table public.credit_transactions enable row level security;

create policy "Users can view their own credit transactions"
  on public.credit_transactions for select
  using (auth.uid() = user_id);

create policy "Service role can manage credit transactions"
  on public.credit_transactions for all
  using (true);

-- 10. Function to apply upgrade credit
create or replace function apply_upgrade_credit(p_user_id uuid, p_new_tier varchar)
returns decimal as $$
declare
  total_credit decimal(10,2) := 0;
  purchase record;
begin
  -- Find purchases for resources now included in new tier
  for purchase in
    select up.id, up.amount_paid, up.resource_id, r.title
    from user_purchases up
    join resources r on r.id = up.resource_id
    where up.user_id = p_user_id
    and up.credit_applied = false
    and (
      (p_new_tier = 'mentorship' and r.access_tier in ('supernova', 'mentorship'))
      or (p_new_tier = 'supernova' and r.access_tier = 'supernova')
    )
  loop
    -- Mark as credit applied
    update user_purchases
    set credit_applied = true, credit_amount = purchase.amount_paid
    where id = purchase.id;

    -- Add to total
    total_credit := total_credit + purchase.amount_paid;

    -- Log the transaction
    insert into credit_transactions (user_id, amount, type, description, resource_id)
    values (p_user_id, purchase.amount_paid, 'upgrade_credit',
            'Credit for ' || purchase.title || ' (included in ' || p_new_tier || ')',
            purchase.resource_id);
  end loop;

  -- Update user's credit balance
  if total_credit > 0 then
    update profiles
    set credit_balance = credit_balance + total_credit
    where id = p_user_id;
  end if;

  return total_credit;
end;
$$ language plpgsql security definer;
