create table desk_managers (
  id uuid primary key default gen_random_uuid(),
  wallet_address text unique not null,
  display_name text,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
