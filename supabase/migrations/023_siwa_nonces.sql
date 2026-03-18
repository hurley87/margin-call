-- Supabase-backed SIWA nonce store for replay protection.
-- Replaces the in-memory nonce store which doesn't work across serverless invocations.

CREATE TABLE siwa_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_siwa_nonces_expires_at ON siwa_nonces (expires_at);

-- Enable pg_cron for scheduled cleanup
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Purge expired nonces every hour
SELECT cron.schedule(
  'cleanup-expired-siwa-nonces',
  '0 * * * *',
  $$DELETE FROM public.siwa_nonces WHERE expires_at < now()$$
);
