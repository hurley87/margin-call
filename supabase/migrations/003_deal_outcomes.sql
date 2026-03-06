create table deal_outcomes (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id),
  trader_id uuid not null references desk_managers(id),
  narrative jsonb not null default '[]',
  trader_pnl_usdc numeric not null default 0,
  pot_change_usdc numeric not null default 0,
  rake_usdc numeric not null default 0,
  assets_gained jsonb not null default '[]',
  assets_lost jsonb not null default '[]',
  trader_wiped_out boolean not null default false,
  wipeout_reason text,
  created_at timestamptz not null default now()
);
