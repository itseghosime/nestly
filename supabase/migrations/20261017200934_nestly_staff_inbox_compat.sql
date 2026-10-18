alter table public.customers
  add column if not exists display_name text,
  add column if not exists phone text;

update public.customers
set display_name = coalesce(display_name, full_name, ''),
    phone = coalesce(phone, whatsapp_phone)
where display_name is null or phone is null;

alter table public.conversations
  add column if not exists channel text not null default 'whatsapp';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.conversations'::regclass
      and conname = 'conversations_channel_check'
  ) then
    alter table public.conversations add constraint conversations_channel_check
      check (channel in ('website', 'whatsapp'));
  end if;
end;
$$;
