-- Make trader activity logs publicly readable for browser-side Realtime.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'agent_activity_log'
      and policyname = 'public_read_agent_activity_log'
  ) then
    create policy public_read_agent_activity_log
      on public.agent_activity_log
      for select
      to anon, authenticated
      using (true);
  end if;
end
$$;
