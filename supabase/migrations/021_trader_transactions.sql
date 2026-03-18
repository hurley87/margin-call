create table trader_transactions (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references traders(id),
  type text not null check (type in ('deposit', 'withdrawal', 'enter', 'resolve')),
  tx_hash text not null,
  block_number integer,
  amount_usdc numeric,
  deal_id uuid references deals(id),
  on_chain_deal_id integer,
  pnl_usdc numeric,
  rake_usdc numeric,
  created_at timestamptz not null default now(),
  unique(trader_id, tx_hash, type)
);

create index idx_trader_txns_trader on trader_transactions(trader_id, created_at desc);
alter publication supabase_realtime add table trader_transactions;
