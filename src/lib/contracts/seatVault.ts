/**
 * SeatVault client helpers — re-exports the canonical Convex policy module
 * and resolves the active vault address from the canonical deployment record.
 */
export {
  BLOW_DECIMALS,
  CORNER_OFFICE_THRESHOLD_HUMAN,
  CORNER_OFFICE_THRESHOLD_WEI,
  SEAT_THRESHOLD_HUMAN,
  SEAT_THRESHOLD_WEI,
  SEAT_TIER_NAMES,
  SEAT_VAULT_CONFIRMATION_DEPTH,
  SEAT_VAULT_EVENT_NAMES,
  SEAT_VAULT_MAX_BLOCKS_PER_TICK,
  SEAT_VAULT_V1,
  TIER_CAPACITY,
  TIER_CORNER_OFFICE,
  TIER_GALLERY,
  TIER_SEAT,
  UNSTAKE_COOLDOWN_SECONDS,
  capacityForTier,
  compareWei,
  formatBlowAmount,
  parseBlowAmount,
  seatTierNameFromOnChain,
  seatTierToOnChain,
  seatVaultAbi,
  seatVaultEventDedupeKey,
  tierFromActiveAmount,
  type SeatTierName,
  type SeatVaultEventName,
} from "../../../convex/seatVault/policy";
import { ACTIVE_BASE_SEPOLIA_DEPLOYMENT, resolveAddress } from "@/lib/network";

export const SEAT_VAULT_ADDRESS = resolveAddress(
  [
    process.env.NEXT_PUBLIC_SEAT_VAULT_ADDRESS,
    process.env.SEAT_VAULT_ADDRESS,
    process.env.ACTIVE_SEAT_VAULT_ADDRESS,
  ],
  ACTIVE_BASE_SEPOLIA_DEPLOYMENT.seatVault,
  "SEAT_VAULT_ADDRESS"
);

/** $BLOW staking token (on-chain symbol may be MARGINCALL). */
export const MARGINCALL_TOKEN_ADDRESS = resolveAddress(
  [
    process.env.NEXT_PUBLIC_MARGINCALL_TOKEN_ADDRESS,
    process.env.MARGINCALL_TOKEN_ADDRESS,
    process.env.NEXT_PUBLIC_MARGINCALL_TOKEN,
    process.env.MARGINCALL_TOKEN,
  ],
  ACTIVE_BASE_SEPOLIA_DEPLOYMENT.margincallToken,
  "MARGINCALL_TOKEN_ADDRESS"
);
