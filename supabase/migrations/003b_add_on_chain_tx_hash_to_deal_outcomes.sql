-- Migration: add_on_chain_tx_hash_to_deal_outcomes (DB version: 20260308204329)
-- This migration was applied to the DB but was missing locally.

ALTER TABLE public.deal_outcomes
ADD COLUMN on_chain_tx_hash text;
