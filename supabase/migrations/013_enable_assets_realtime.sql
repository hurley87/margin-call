-- Enable Supabase Realtime for trader asset inventory updates.
-- `agent_activity_log` is already published in `007_agent_activity_log.sql`.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'assets'
  ) then
    alter publication supabase_realtime add table assets;
  end if;
end
$$;
