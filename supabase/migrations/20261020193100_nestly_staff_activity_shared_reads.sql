-- Reconcile the audit with concurrently merged PR #20. Keep its read-state contract.
-- The audit-only table was never deployed to app callers. Refuse cleanup if it has data.
do $$ begin
  if exists (select 1 from public.staff_notification_reads) then
    raise exception 'Audit read-state table is not empty; reconcile markers before cleanup';
  end if;
end $$;
create index if not exists notification_reads_profile_notification_idx
  on public.notification_reads(profile_id, notification_id);
create or replace function public.staff_activity_counts()
returns table(attention_count bigint, unread_notifications bigint)
language sql stable security invoker set search_path = '' as $$
  select
    (select count(*) from public.conversations c where c.mode = 'HUMAN_ACTIVE'
      and (c.assigned_staff_id is null or c.assigned_staff_id = (select auth.uid()))),
    (select count(*) from public.notifications n where not exists (
      select 1 from public.notification_reads r
      where r.notification_id = n.id and r.profile_id = (select auth.uid())
    ))
  where public.caller_role() in ('Platform Admin','Operations Lead','Field Vetting Agent','Legal & Compliance','Customer Care');
$$;
revoke all on function public.staff_activity_counts() from public, anon;
grant execute on function public.staff_activity_counts() to authenticated;
drop table public.staff_notification_reads;
notify pgrst, 'reload schema';
