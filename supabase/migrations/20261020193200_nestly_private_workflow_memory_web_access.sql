-- Private workflow memory must not be exposed through the public Data API.
-- Preserve contents and native PostgreSQL owner / service-role access.
-- RLS behavior is unchanged to preserve native workflow consumers.
revoke all on table public.n8n_chat_histories from public, anon, authenticated;
notify pgrst, 'reload schema';
