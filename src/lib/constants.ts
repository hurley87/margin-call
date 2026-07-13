// Platform wallet (receives rake/fees)
export const PLATFORM_WALLET_ADDRESS =
  process.env.NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS ?? "";

// Fee structure
export const RAKE_PERCENTAGE = 10; // 10% of winnings
export const DEAL_CREATION_FEE_PERCENTAGE = 5; // 5% of pot
export const MAX_EXTRACTION_PERCENTAGE = 25; // 25% of pot per win

// Minimums
export const MIN_POT_AMOUNT = 5; // 5 USDC
export const MIN_ENTRY_COST = 1; // 1 USDC

// Deal seed suggested value caps (LLM-generated; kept small for low-stakes entry)
export const MAX_SUGGESTED_POT_USDC = 10;
export const MAX_SUGGESTED_ENTRY_USDC = 5;

// Agent runtime
export const AGENT_LOOP_INTERVAL_MS = 30_000; // 30 seconds (target spacing between cycles)

/** Skip deals another trader on the same desk (same owner) entered within this window. */
export const DESK_DEAL_DEDUP_HOURS = 24;

/**
 * Cron scheduler kicks traders whose last cycle started before this threshold.
 * Vercel cron minimum is ~1 minute; use ~50s so a 1-minute cron reliably picks up idle traders.
 */
export const AGENT_CRON_STALE_MS = 50_000;

/**
 * Default minimum spacing between agent cycles (UI display + aligns with server eligibility).
 * Convex cron is a 1-minute heartbeat; per-trader eligibility uses this interval.
 */
export const DEFAULT_CYCLE_INTERVAL_MS = 10 * 60_000;

/**
 * Future: interval when speed-token acceleration applies (stored flags only; no on-chain reads).
 * Matches default today — reserved for UI/server parity when speed fields exist.
 */
export const SPEED_TOKEN_CYCLE_INTERVAL_MS = 10 * 60_000;
