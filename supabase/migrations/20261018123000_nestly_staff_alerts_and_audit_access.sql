drop policy if exists nestly_notifications_staff_read on public.notifications;
drop policy if exists staff_only_notifications on public.notifications;
create policy nestly_notifications_staff_read on public.notifications
for select to authenticated
using (
  public.caller_role() in ('Platform Admin', 'Operations Lead', 'Customer Care')
  or recipient = (select auth.uid())::text
);

drop policy if exists staff_read_audit on public.audit_logs;
create policy nestly_audit_logs_staff_read on public.audit_logs
for select to authenticated
using (public.caller_role() in ('Platform Admin', 'Operations Lead', 'Legal & Compliance'));
