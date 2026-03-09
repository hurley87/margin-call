-- Add last_cycle_at for zombie loop prevention
ALTER TABLE traders
  ADD COLUMN IF NOT EXISTS last_cycle_at TIMESTAMPTZ;
