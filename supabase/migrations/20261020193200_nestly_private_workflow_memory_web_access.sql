-- Private workflow memory must not be exposed through the public Data API.
-- Preserve contents and native PostgreSQL owner / service-role access.
-- RLS behavior is unchanged to preserve native workflow consumers.
do $$
begin
  if to_regclass('public.n8n_chat_histories') is not null then
    revoke all on table public.n8n_chat_histories from public, anon, authenticated;
  end if;
end
$$;

notify pgrst, 'reload schema';
