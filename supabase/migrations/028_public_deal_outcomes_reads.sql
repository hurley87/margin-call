-- Make deal outcomes publicly readable for public trader pages and Realtime.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'deal_outcomes'
      and policyname = 'public_read_deal_outcomes'
  ) then
    create policy public_read_deal_outcomes
      on public.deal_outcomes
      for select
      to anon, authenticated
      using (true);
  end if;
end
$$;
