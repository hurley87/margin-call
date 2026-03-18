insert into trader_transactions (trader_id, type, tx_hash, deal_id, pnl_usdc, rake_usdc, created_at)
select trader_id, 'resolve', on_chain_tx_hash, deal_id, trader_pnl_usdc, rake_usdc, created_at
from deal_outcomes
where on_chain_tx_hash is not null
on conflict do nothing;
