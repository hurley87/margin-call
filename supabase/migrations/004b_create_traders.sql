-- Migration: create_traders_table (DB version: 20260308020955)
-- This migration was applied to the DB but was missing locally.

create table traders (
  id uuid primary key default gen_random_uuid(),
  token_id bigint unique not null,
  name text not null,
  owner_address text not null,
  tba_address text,
  status text not null default 'active',
  mandate jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_traders_owner_address on traders (owner_address);
create index idx_traders_token_id on traders (token_id);

-- Auto-update updated_at on row change
create or replace function update_traders_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_traders_updated_at
  before update on traders
  for each row
  execute function update_traders_updated_at();
