create table deals (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references desk_managers(id),
  creator_type text not null check (creator_type in ('desk_manager', 'agent')),
  prompt text not null,
  pot_usdc numeric not null,
  entry_cost_usdc numeric not null,
  max_extraction_percentage numeric not null default 25,
  status text not null default 'open' check (status in ('open', 'closed', 'depleted')),
  entry_count integer not null default 0,
  wipeout_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
