create table assets (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references traders(id) on delete cascade,
  name text not null,
  value_usdc numeric not null default 0,
  source_deal_id uuid references deals(id),
  source_outcome_id uuid references deal_outcomes(id),
  acquired_at timestamptz not null default now()
);

create index idx_assets_trader_id on assets(trader_id);
