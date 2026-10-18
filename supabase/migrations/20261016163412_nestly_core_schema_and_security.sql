
create extension if not exists pgcrypto;
create table public.staff_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '',
 role text not null default 'agent' check(role in ('agent','admin')),
 created_at timestamptz not null default now()
);
create table public.properties (
 id uuid primary key default gen_random_uuid(),
 reference text not null unique,
 title text not null,
 description text not null default '',
 property_type text not null check (property_type in ('apartment','house','duplex','studio','land','commercial')),
 location text not null,
 neighborhood text,
 bedrooms int not null default 0 check(bedrooms>=0),
 bathrooms int not null default 0 check(bathrooms>=0),
 price_ngn numeric(15,2) not null check(price_ngn>=0),
 service_charge_ngn numeric(15,2) not null default 0 check(service_charge_ngn>=0),
 agency_fee_ngn numeric(15,2) not null default 0 check(agency_fee_ngn>=0),
 other_fees_ngn numeric(15,2) not null default 0 check(other_fees_ngn>=0),
 fee_notes text,
 features text[] not null default '{}',
 status text not null default 'draft' check(status in ('draft','available','unavailable','rented','archived')),
 verified_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.property_media (
 id uuid primary key default gen_random_uuid(),
 property_id uuid not null references public.properties(id) on delete cascade,
 media_url text not null,
 media_type text not null check(media_type in ('image','video')),
 caption text,
 sort_order int not null default 0
);
create table public.customers (
 id uuid primary key default gen_random_uuid(),
 whatsapp_phone text not null unique,
 full_name text,
 email text,
 created_at timestamptz not null default now()
);
create table public.conversations (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customers(id),
 mode text not null default 'AI_ACTIVE' check(mode in ('AI_ACTIVE','HUMAN_ACTIVE','CLOSED')),
 current_property_id uuid references public.properties(id),
 assigned_staff_id uuid references public.staff_profiles(id),
 ai_resumed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index one_open_conversation_per_customer on public.conversations(customer_id) where mode <> 'CLOSED';
create table public.messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.conversations(id),
 provider_message_id text unique,
 direction text not null check(direction in ('inbound','outbound')),
 sender_type text not null check(sender_type in ('customer','nia','agent','system')),
 content text,
 message_type text not null default 'text',
 delivery_status text not null default 'queued' check(delivery_status in ('received','queued','sent','delivered','read','failed')),
 created_at timestamptz not null default now()
);
create table public.offers (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.conversations(id),
 customer_id uuid not null references public.customers(id),
 property_id uuid not null references public.properties(id),
 proposed_amount_ngn numeric(15,2) not null check(proposed_amount_ngn>=0),
 counter_amount_ngn numeric(15,2) check(counter_amount_ngn>=0),
 status text not null default 'pending' check(status in ('pending','accepted','rejected','countered','withdrawn')),
 agent_notes text,
 reviewed_by uuid references public.staff_profiles(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.inspection_slots (
 id uuid primary key default gen_random_uuid(),
 property_id uuid not null references public.properties(id),
 agent_id uuid references public.staff_profiles(id),
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 capacity int not null default 1 check(capacity=1),
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 constraint inspection_slot_times check(ends_at>starts_at),
 unique(property_id,starts_at)
);
create table public.inspections (
 id uuid primary key default gen_random_uuid(),
 slot_id uuid not null references public.inspection_slots(id),
 property_id uuid not null references public.properties(id),
 customer_id uuid not null references public.customers(id),
 conversation_id uuid references public.conversations(id),
 status text not null default 'PENDING_CONFIRMATION' check(status in ('PENDING_CONFIRMATION','CONFIRMED','REJECTED','CANCELLED','COMPLETED','RESCHEDULED','NO_SHOW')),
 notes text,
 agent_id uuid references public.staff_profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index one_active_booking_per_slot on public.inspections(slot_id) where status in ('PENDING_CONFIRMATION','CONFIRMED');
create table public.notifications (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid references public.conversations(id),
 inspection_id uuid references public.inspections(id),
 channel text not null check(channel in ('whatsapp','email','dashboard')),
 recipient text not null,
 template_key text not null,
 idempotency_key text unique,
 provider_message_id text unique,
 status text not null default 'queued' check(status in ('queued','sent','delivered','failed','cancelled')),
 attempts int not null default 0 check(attempts>=0),
 last_error text,
 scheduled_for timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.audit_logs (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id),
 actor_type text not null check(actor_type in ('agent','admin','system','nia')),
 action text not null,
 entity_type text not null,
 entity_id uuid,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index properties_search_idx on public.properties(status,location,property_type,bedrooms,price_ngn);
create index messages_conversation_idx on public.messages(conversation_id,created_at);
create index inspections_customer_idx on public.inspections(customer_id,created_at desc);
create index notifications_status_idx on public.notifications(status,scheduled_for);
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end; $$;
create trigger properties_updated before update on public.properties for each row execute function public.touch_updated_at();
create trigger conversations_updated before update on public.conversations for each row execute function public.touch_updated_at();
create trigger inspections_updated before update on public.inspections for each row execute function public.touch_updated_at();
create trigger notifications_updated before update on public.notifications for each row execute function public.touch_updated_at();
create or replace function public.is_nestly_staff() returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.staff_profiles where id=(select auth.uid())); $$;
create or replace function public.is_nestly_admin() returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.staff_profiles where id=(select auth.uid()) and role='admin'); $$;
revoke all on function public.is_nestly_staff() from public;
revoke all on function public.is_nestly_admin() from public;
grant execute on function public.is_nestly_staff() to authenticated;
grant execute on function public.is_nestly_admin() to authenticated;
do $$ declare tbl text; begin foreach tbl in array array['staff_profiles','properties','property_media','customers','conversations','messages','offers','inspection_slots','inspections','notifications','audit_logs'] loop execute format('alter table public.%I enable row level security',tbl); end loop; end $$;
create policy staff_read_own_profile on public.staff_profiles for select to authenticated using (id=(select auth.uid()) or public.is_nestly_admin());
create policy admin_manage_staff on public.staff_profiles for all to authenticated using (public.is_nestly_admin()) with check (public.is_nestly_admin());
create policy public_view_verified_properties on public.properties for select to anon,authenticated using (status='available' and verified_at is not null or (select public.is_nestly_staff()));
create policy staff_manage_properties on public.properties for all to authenticated using (public.is_nestly_staff()) with check (public.is_nestly_staff());
create policy public_view_media on public.property_media for select to anon,authenticated using (exists(select 1 from public.properties p where p.id=property_id and p.status='available' and p.verified_at is not null) or (select public.is_nestly_staff()));
create policy staff_manage_media on public.property_media for all to authenticated using (public.is_nestly_staff()) with check (public.is_nestly_staff());
do $$ declare tbl text; begin foreach tbl in array array['customers','conversations','messages','offers','inspection_slots','inspections','notifications'] loop execute format('create policy staff_only_%I on public.%I for all to authenticated using (public.is_nestly_staff()) with check (public.is_nestly_staff())',tbl,tbl); end loop; end $$;
create policy staff_read_audit on public.audit_logs for select to authenticated using (public.is_nestly_admin());
revoke all on public.audit_logs from anon,authenticated;
grant select on public.audit_logs to authenticated;
;
