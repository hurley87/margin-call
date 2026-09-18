/**
 * Canonical Base MarginCall pins for the Convex indexer.
 * Derived from contracts/deployments/base.json — do not hardcode separately.
 */
import baseDeploymentJson from "../../contracts/deployments/base.json";

export const BASE_CHAIN_ID = baseDeploymentJson.chainId;

export const MARGIN_CALL_ADDRESS =
  baseDeploymentJson.contracts.marginCall.toLowerCase() as `0x${string}`;

export const MARGIN_CALL_DEPLOYED_AT_BLOCK =
  baseDeploymentJson.marginCallDeployedAtBlock;

/** Inclusive last safe head is latest − this buffer. */
export const CONFIRMATION_BUFFER_BLOCKS = 8;

/** Max blocks scanned per reconcile action. */
export const RECONCILE_BLOCK_BATCH = 2000;

/** Overlap blocks re-scanned each reconcile tick for reorg safety. */
export const RECONCILE_OVERLAP_BLOCKS = 1;

export const SYNC_STATE_KEY = "base-margincall" as const;
