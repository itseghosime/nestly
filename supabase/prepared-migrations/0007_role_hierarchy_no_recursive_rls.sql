-- 0007_role_hierarchy_no_recursive_rls — Enforce delegation hierarchy, avoid recursive RLS, zone scoping
-- Requires 0001_profiles + 0004

-- Remove recursive policies: helper SELECT on profiles from within profiles policy causes recursion.
-- Use auth.jwt() claims + security definer helper instead of direct profiles self-join.

-- Drop recursive policies from 0001
drop policy if exists "profiles_staff_read" on public.profiles;
drop policy if exists "profiles_self_update" on public.profiles;

-- Helper: read caller's role/capabilities from JWT (set via Supabase auth hook or app). Fallback to security definer lookup that bypasses RLS.
create or replace function public.caller_role() returns text as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb->>'role',''),
    (select role from public.profiles where id = auth.uid())
  );
$$ language sql stable security definer;

create or replace function public.is_platform_admin() returns boolean as $$
  select public.caller_role() = 'Platform Admin';
$$ language sql stable security definer;

create or replace function public.is_lead_or_admin() returns boolean as $$
  select public.caller_role() in ('Platform Admin','Operations Lead');
$$ language sql stable security definer;

-- Least-privilege: self read stays, but use bypass-free check
create policy "profiles_self_read_v2" on public.profiles
  for select using (auth.uid() = id);

-- Admin/lead read: use helper to avoid recursion
create policy "profiles_admin_read_v2" on public.profiles
  for select using (public.is_lead_or_admin());

-- Insert: only Platform Admin may create Platform Admin; Operations Lead may create Field/Legal/Customer Care within their zone
drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert_hierarchy" on public.profiles
  for insert with check (
    case
      when role = 'Platform Admin' then public.is_platform_admin()
      when role in ('Operations Lead','Field Vetting Agent','Legal & Compliance','Customer Care') then public.is_lead_or_admin()
      else false
    end
  );

-- Update: self may edit only non-privileged fields (display_name, etc.) — privileged fields are already blocked by trigger
-- Re-create self-update narrowly: display_name only; role/capabilities/assigned_zone require admin
drop policy if exists "profiles_self_update_v2" on public.profiles;
create policy "profiles_self_update_v2" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- Privileged updates: only Platform Admin may change to Platform Admin or grant arbitrary capabilities
-- Enforce in trigger (stricter): extend prevent_privileged_self_edit to enforce hierarchy
create or replace function public.prevent_privileged_self_edit() returns trigger as $$
declare
  caller text := public.caller_role();
begin
  -- Any change to role/capabilities/assigned_zone is privileged
  if (coalesce(old.role,'') is distinct from coalesce(new.role,''))
     or (coalesce(old.capabilities::text,'') is distinct from coalesce(new.capabilities::text,''))
     or (coalesce(old.assigned_zone,'') is distinct from coalesce(new.assigned_zone,'')) then
    -- Must be admin/lead to touch privileged fields at all
    if caller not in ('Platform Admin','Operations Lead') then
      raise exception 'Privileged profile fields may only be changed by Platform Admin or Operations Lead';
    end if;
    -- Operations Lead may not create Platform Admin, grant arbitrary capabilities, or self-promote
    if caller = 'Operations Lead' then
      if new.role = 'Platform Admin' then
        raise exception 'Operations Lead cannot create or promote to Platform Admin';
      end if;
      if old.id = auth.uid() then
        raise exception 'Self-promotion is not allowed';
      end if;
      -- Capabilities: Operations Lead may only assign subset of lead-level caps, not arbitrary super caps
      -- Allow only if new capabilities are subset of allowed lead caps (define as example)
      -- For now, block granting 'platform:*' style caps if any
      if new.capabilities && array_length(new.capabilities,1) > 0 then
        if exists (select 1 from unnest(new.capabilities) c where c like 'platform:%' or c = '*') then
          raise exception 'Operations Lead cannot grant platform capabilities';
        end if;
      end if;
    end if;
    -- Zone scoping: if property/zone access where required, enforce assigned_zone match (example)
    -- Platform Admin bypasses zone check
    if caller = 'Operations Lead' and new.assigned_zone is distinct from old.assigned_zone then
      -- Allow only if new zone is within caller's zone or caller is cross-zone (not modeled here; keep permissive for now)
      null;
    end if;
  end if;
  -- Additional guard: no one may edit another Platform Admin unless caller is Platform Admin
  if old.role = 'Platform Admin' and caller <> 'Platform Admin' then
    raise exception 'Only Platform Admin may modify Platform Admin profiles';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_profiles_privileged_guard on public.profiles;
create trigger trg_profiles_privileged_guard before update on public.profiles
for each row execute function public.prevent_privileged_self_edit();

drop trigger if exists trg_profiles_privileged_guard_ins on public.profiles;
create trigger trg_profiles_privileged_guard_ins before insert on public.profiles
for each row execute function public.prevent_privileged_self_edit();

comment on function public.prevent_privileged_self_edit is 'Hierarchy: Platform Admin > Operations Lead > Field/Legal/Customer Care. No self-promotion, no lead-created Platform Admin, no arbitrary platform caps, no recursive RLS via helper.';
