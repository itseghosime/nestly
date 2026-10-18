-- 0001_profiles — Staff profiles (app authorization) + fixture mapping
-- Auth owns passwords/tokens (auth.users). App owns role/capabilities.
-- Tables: profiles(id FK auth.users), fixture_id_map(fixture_id canonical_id entity)
-- Reads: auth.users by trigger. Writes: profiles on first login / invite accept.
-- User verbatim: "Complete Phase A: environment template and Supabase clients. Staff authentication and server/database authorization. Compatible migrations, RLS, storage policies, and fictional seed data."
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('Platform Admin','Operations Lead','Field Vetting Agent','Legal & Compliance','Customer Care')),
  capabilities text[] not null default '{}',
  assigned_zone text,
  created_at timestamptz not null default now()
);

create table if not exists public.fixture_id_map (
  fixture_id text primary key,
  canonical_id text not null,
  entity text not null check (entity in ('property','customer','inspection','conversation','neighborhood')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.fixture_id_map enable row level security;

create policy "profiles_self_read" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_staff_read" on public.profiles
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Platform Admin','Operations Lead'))
  );

create policy "profiles_self_update" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "fixture_map_read" on public.fixture_id_map
  for select using (true);
