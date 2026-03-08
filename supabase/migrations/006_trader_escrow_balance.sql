-- Add cached escrow balance column to traders table
ALTER TABLE traders
  ADD COLUMN IF NOT EXISTS escrow_balance_usdc NUMERIC DEFAULT 0;
