-- Ensure trader activity events are published to Supabase Realtime.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'agent_activity_log'
  ) then
    alter publication supabase_realtime add table agent_activity_log;
  end if;
end
$$;
