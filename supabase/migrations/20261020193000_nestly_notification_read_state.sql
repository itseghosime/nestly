create table public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, profile_id)
);

alter table public.notification_reads enable row level security;
revoke all on public.notification_reads from public, anon, authenticated;
grant select, insert, delete on public.notification_reads to authenticated;

create policy nestly_notification_reads_staff_read on public.notification_reads
for select to authenticated
using (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.notifications as notification
    where notification.id = notification_reads.notification_id
  )
);

create policy nestly_notification_reads_staff_insert on public.notification_reads
for insert to authenticated
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.notifications as notification
    where notification.id = notification_reads.notification_id
  )
);

create policy nestly_notification_reads_staff_delete on public.notification_reads
for delete to authenticated
using (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.notifications as notification
    where notification.id = notification_reads.notification_id
  )
);

notify pgrst, 'reload schema';
