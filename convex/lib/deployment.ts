/**
 * Canonical Base MarginCall pins for the Convex indexer.
 * Must stay in lockstep with contracts/deployments/base.json
 * (asserted by tests/convex/deployment-pin.test.ts).
 */
export const BASE_CHAIN_ID = 8453;

export const MARGIN_CALL_ADDRESS =
  "0x54bdd9b5544ac1c378b1c7c863ee8ce92dcd4158" as const;

export const MARGIN_CALL_DEPLOYED_AT_BLOCK = 51470656;

/** Inclusive last safe head is latest − this buffer. */
export const CONFIRMATION_BUFFER_BLOCKS = 8;

/** Max blocks scanned per reconcile action. */
export const RECONCILE_BLOCK_BATCH = 2000;

/** Overlap blocks re-scanned each reconcile tick for reorg safety. */
export const RECONCILE_OVERLAP_BLOCKS = 1;

export const SYNC_STATE_KEY = "base-margincall" as const;
