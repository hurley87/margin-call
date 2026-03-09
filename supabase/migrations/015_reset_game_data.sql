-- Wipe all game data for fresh start with new contract
TRUNCATE TABLE
  deal_outcomes,
  agent_activity_log,
  deal_approvals,
  assets,
  deals,
  traders,
  desk_managers
CASCADE;
