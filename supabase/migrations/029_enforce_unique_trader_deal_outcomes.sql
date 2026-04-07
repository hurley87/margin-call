-- Prevent a trader from recording multiple outcomes for the same deal.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'deal_outcomes_trader_id_deal_id_unique'
  ) then
    alter table public.deal_outcomes
      add constraint deal_outcomes_trader_id_deal_id_unique
      unique (trader_id, deal_id);
  end if;
end
$$;
