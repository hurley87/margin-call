// Base chain ID (used by Privy config and network guard)
export const BASE_CHAIN_ID = 8453;

// USDC on Base mainnet
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

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

// Agent runtime
export const AGENT_LOOP_INTERVAL_MS = 30_000; // 30 seconds (target spacing between cycles)

/** Skip deals another trader on the same desk (same owner) entered within this window. */
export const DESK_DEAL_DEDUP_HOURS = 24;

/**
 * Cron scheduler kicks traders whose last cycle started before this threshold.
 * Vercel cron minimum is ~1 minute; use ~50s so a 1-minute cron reliably picks up idle traders.
 */
export const AGENT_CRON_STALE_MS = 50_000;
