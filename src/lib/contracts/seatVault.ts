/**
 * SeatVault client helpers — re-exports the canonical Convex policy module
 * and resolves the active vault address from env for the Next.js app.
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
import { SEAT_VAULT_V1 } from "../../../convex/seatVault/policy";

const RESOLVED_SEAT_VAULT_ADDRESS =
  process.env.NEXT_PUBLIC_SEAT_VAULT_ADDRESS ??
  process.env.SEAT_VAULT_ADDRESS ??
  // Fallback to deployed Base Sepolia v1 so local UI can read without env.
  SEAT_VAULT_V1.address;

export const SEAT_VAULT_ADDRESS = RESOLVED_SEAT_VAULT_ADDRESS as `0x${string}`;
