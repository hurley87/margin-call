-- Deal approvals: when a deal exceeds the trader's approval threshold,
-- the agent pauses and creates an approval request for the desk manager.

create table if not exists deal_approvals (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references traders(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  entry_cost_usdc numeric not null,
  reason text, -- desk manager's reason for approve/reject
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast lookups by trader
create index idx_deal_approvals_trader on deal_approvals(trader_id, status);
-- Index for finding pending approvals by deal
create index idx_deal_approvals_deal on deal_approvals(deal_id, status);

-- Auto-update updated_at
create or replace function update_deal_approvals_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_deal_approvals_updated_at
  before update on deal_approvals
  for each row execute function update_deal_approvals_updated_at();
