-- Migration: cdp_account_name (DB version: 20260309201312)
-- This migration was applied to the DB but was missing locally.

ALTER TABLE traders ADD COLUMN cdp_account_name TEXT;
