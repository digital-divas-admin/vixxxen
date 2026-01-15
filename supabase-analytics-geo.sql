-- Add geolocation columns to user_sessions table
-- Run this in Supabase SQL Editor

-- Add geo columns to user_sessions
alter table public.user_sessions
add column if not exists country varchar(100),
add column if not exists country_code varchar(10),
add column if not exists city varchar(100),
add column if not exists region varchar(100),
add column if not exists latitude decimal(10, 6),
add column if not exists longitude decimal(10, 6);

-- Create index for faster queries on active sessions (sessions with recent activity)
-- Note: ended_at is used as "last seen" - it gets updated on each heartbeat
create index if not exists idx_user_sessions_ended_at
on public.user_sessions(ended_at desc);

-- Create index for country grouping
create index if not exists idx_user_sessions_country
on public.user_sessions(country_code);

comment on column public.user_sessions.country is 'Country name from IP geolocation';
comment on column public.user_sessions.country_code is 'ISO 2-letter country code';
comment on column public.user_sessions.city is 'City from IP geolocation';
comment on column public.user_sessions.region is 'Region/state from IP geolocation';
comment on column public.user_sessions.latitude is 'Latitude for map display';
comment on column public.user_sessions.longitude is 'Longitude for map display';
