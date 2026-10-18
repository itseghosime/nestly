create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null check (role in (
    'Platform Admin',
    'Operations Lead',
    'Field Vetting Agent',
    'Legal & Compliance',
    'Customer Care'
  )),
  capabilities text[] not null default '{}',
  assigned_zone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.profiles (id, display_name, role)
select
  sp.id,
  sp.full_name,
  case when sp.role = 'admin' then 'Platform Admin' else 'Field Vetting Agent' end
from public.staff_profiles as sp
on conflict (id) do nothing;

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

drop policy if exists nestly_profiles_compat_self_read on public.profiles;
create policy nestly_profiles_compat_self_read on public.profiles
for select to authenticated
using (id = (select auth.uid()));

notify pgrst, 'reload schema';
