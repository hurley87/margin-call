import type { Network } from "@x402/core/types";

// Base chain (Ethereum L2)
export const BASE_CHAIN_ID = 8453;
export const BASE_NETWORK: Network = `eip155:${BASE_CHAIN_ID}`;

// USDC on Base
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Platform wallet (receives rake/fees)
export const PLATFORM_WALLET_ADDRESS =
  process.env.NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS ?? "";

// Fee structure
export const RAKE_PERCENTAGE = 10; // 10% of winnings
export const DEAL_CREATION_FEE_PERCENTAGE = 5; // 5% of pot
export const MAX_EXTRACTION_PERCENTAGE = 25; // 25% of pot per win

// Agent runtime
export const AGENT_LOOP_INTERVAL_MS = 30_000; // 30 seconds
