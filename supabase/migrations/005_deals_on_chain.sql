-- Add on-chain deal tracking columns to deals table
alter table deals add column if not exists on_chain_deal_id integer unique;
alter table deals add column if not exists fee_usdc numeric default 0;
alter table deals add column if not exists on_chain_tx_hash text;
alter table deals add column if not exists creator_address text;

-- Allow creator_id to be nullable for on-chain synced deals
-- (on-chain deals use creator_address instead of desk_manager FK)
alter table deals alter column creator_id drop not null;

-- Index for fast lookups by on-chain deal id
create index if not exists idx_deals_on_chain_deal_id on deals(on_chain_deal_id) where on_chain_deal_id is not null;
