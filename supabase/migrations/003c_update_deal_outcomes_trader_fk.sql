-- Migration: update_deal_outcomes_trader_fk (DB version: 20260308210152)
-- This migration was applied to the DB but was missing locally.

ALTER TABLE public.deal_outcomes
  DROP CONSTRAINT deal_outcomes_trader_id_fkey;

-- trader_id can reference either desk_managers or traders,
-- so leave it unconstrained for now. The API validates ownership.
