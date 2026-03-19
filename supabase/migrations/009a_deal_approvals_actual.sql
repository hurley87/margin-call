-- Migration: deal_approvals (DB version: 20260309075805)
-- This is the ACTUAL schema applied to the DB.
-- NOTE: The existing 009_deal_approvals.sql has a different schema
-- (with reason/updated_at columns) that was never applied because
-- the table already existed from this migration.

CREATE TABLE deal_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  desk_manager_id UUID NOT NULL REFERENCES desk_managers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  entry_cost_usdc NUMERIC NOT NULL,
  pot_usdc NUMERIC NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_approvals_trader ON deal_approvals(trader_id);
CREATE INDEX idx_approvals_desk_manager ON deal_approvals(desk_manager_id, status);
CREATE INDEX idx_approvals_status ON deal_approvals(status) WHERE status = 'pending';
