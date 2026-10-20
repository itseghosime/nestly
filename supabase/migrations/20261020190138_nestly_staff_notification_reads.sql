-- Additive only: leaves delivery state, workflows and existing alerts untouched.
create table public.staff_notification_reads (
  staff_id uuid not null references auth.users(id) on delete cascade,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (staff_id, notification_id)
);
create index staff_notification_reads_notification_idx on public.staff_notification_reads(notification_id);
alter table public.staff_notification_reads enable row level security;
revoke all on public.staff_notification_reads from anon, authenticated;
grant select, insert, update, delete on public.staff_notification_reads to authenticated;
create policy own_staff_alert_reads_select on public.staff_notification_reads for select to authenticated
  using (staff_id = (select auth.uid()) and public.caller_role() in ('Platform Admin','Operations Lead','Field Vetting Agent','Legal & Compliance','Customer Care'));
create policy own_staff_alert_reads_insert on public.staff_notification_reads for insert to authenticated
  with check (staff_id = (select auth.uid()) and public.caller_role() in ('Platform Admin','Operations Lead','Field Vetting Agent','Legal & Compliance','Customer Care')
    and exists (select 1 from public.notifications n where n.id = notification_id));
create policy own_staff_alert_reads_update on public.staff_notification_reads for update to authenticated
  using (staff_id = (select auth.uid()))
  with check (staff_id = (select auth.uid()) and public.caller_role() in ('Platform Admin','Operations Lead','Field Vetting Agent','Legal & Compliance','Customer Care')
    and exists (select 1 from public.notifications n where n.id = notification_id));
create policy own_staff_alert_reads_delete on public.staff_notification_reads for delete to authenticated
  using (staff_id = (select auth.uid()));

create function public.staff_activity_counts()
returns table(attention_count bigint, unread_notifications bigint)
language sql stable security invoker set search_path = '' as $$
  select
    (select count(*) from public.conversations c where c.mode = 'HUMAN_ACTIVE'
      and (c.assigned_staff_id is null or c.assigned_staff_id = (select auth.uid()))),
    (select count(*) from public.notifications n where not exists (
      select 1 from public.staff_notification_reads r
      where r.notification_id = n.id and r.staff_id = (select auth.uid())
    ))
  where public.caller_role() in ('Platform Admin','Operations Lead','Field Vetting Agent','Legal & Compliance','Customer Care');
$$;
revoke all on function public.staff_activity_counts() from public, anon;
grant execute on function public.staff_activity_counts() to authenticated;
