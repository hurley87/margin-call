/**
 * Canonical SeatVault policy, ABI, and formatting.
 *
 * Single source of truth for tiers, thresholds, capacity mappings, and the
 * SeatVault ABI used by Convex indexing and the Next.js app.
 *
 * Product name: $BLOW. On-chain Sepolia token symbol may be MARGINCALL.
 * Stake amounts are always decimal strings of 18-decimal wei (exceeds int64).
 */
import { ACTIVE_BASE_SEPOLIA_DEPLOYMENT } from "../lib/activeDeployment";

/** On-chain Tier enum: Gallery = 0, Seat = 1, CornerOffice = 2. */
export const TIER_GALLERY = 0;
export const TIER_SEAT = 1;
export const TIER_CORNER_OFFICE = 2;

export type SeatTierName = "Gallery" | "Seat" | "CornerOffice";

export const SEAT_TIER_NAMES = [
  "Gallery",
  "Seat",
  "CornerOffice",
] as const satisfies readonly SeatTierName[];

export function seatTierNameFromOnChain(tier: number): SeatTierName {
  if (tier === TIER_SEAT) return "Seat";
  if (tier === TIER_CORNER_OFFICE) return "CornerOffice";
  return "Gallery";
}

export function seatTierToOnChain(tier: SeatTierName): number {
  switch (tier) {
    case "Gallery":
      return TIER_GALLERY;
    case "Seat":
      return TIER_SEAT;
    case "CornerOffice":
      return TIER_CORNER_OFFICE;
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}

/** 18-decimal staking token. */
export const BLOW_DECIMALS = 18;

/** Human Seat threshold: 10,000 $BLOW. */
export const SEAT_THRESHOLD_HUMAN = 10_000;
/** Human Corner Office threshold: 50,000 $BLOW. */
export const CORNER_OFFICE_THRESHOLD_HUMAN = 50_000;
/** Unstake cooldown in seconds: 24 hours. */
export const UNSTAKE_COOLDOWN_SECONDS = 86_400;

/** Wei strings matching SeatVault constructor defaults / Base Sepolia v1. */
export const SEAT_THRESHOLD_WEI = "10000000000000000000000";
export const CORNER_OFFICE_THRESHOLD_WEI = "50000000000000000000000";

/** Capacity granted by each tier (PRD #187). Deal creation is unlimited. */
export const TIER_CAPACITY = {
  Gallery: {
    cycleIntervalMs: 10 * 60 * 1000,
    maxUnresolvedEntries: 1,
  },
  Seat: {
    cycleIntervalMs: 5 * 60 * 1000,
    maxUnresolvedEntries: 1,
  },
  CornerOffice: {
    cycleIntervalMs: 5 * 60 * 1000,
    maxUnresolvedEntries: 2,
  },
} as const satisfies Record<
  SeatTierName,
  { cycleIntervalMs: number; maxUnresolvedEntries: number }
>;

export function capacityForTier(tier: SeatTierName): {
  cycleIntervalMs: number;
  maxUnresolvedEntries: number;
} {
  return TIER_CAPACITY[tier];
}

/** Compare two wei decimal strings as unsigned integers. */
export function compareWei(a: string, b: string): number {
  const aa = BigInt(a);
  const bb = BigInt(b);
  if (aa < bb) return -1;
  if (aa > bb) return 1;
  return 0;
}

/**
 * Derive tier from active principal only (no depositor check).
 * Matches SeatVault threshold branches when the staker is the current depositor.
 */
export function tierFromActiveAmount(
  activeWei: string,
  seatThresholdWei: string = SEAT_THRESHOLD_WEI,
  cornerThresholdWei: string = CORNER_OFFICE_THRESHOLD_WEI
): SeatTierName {
  if (compareWei(activeWei, "0") <= 0) return "Gallery";
  if (compareWei(activeWei, cornerThresholdWei) >= 0) return "CornerOffice";
  if (compareWei(activeWei, seatThresholdWei) >= 0) return "Seat";
  return "Gallery";
}

/** Format 18-decimal wei string to a human $BLOW display (trim trailing zeros). */
export function formatBlowAmount(wei: string): string {
  const negative = wei.startsWith("-");
  const raw = negative ? wei.slice(1) : wei;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Invalid wei amount: ${wei}`);
  }
  const padded = raw.padStart(BLOW_DECIMALS + 1, "0");
  const whole = padded.slice(0, -BLOW_DECIMALS);
  const frac = padded.slice(-BLOW_DECIMALS).replace(/0+$/, "");
  const body = frac.length > 0 ? `${whole}.${frac}` : whole;
  return negative ? `-${body}` : body;
}

/** Parse a human $BLOW amount into an 18-decimal wei string. */
export function parseBlowAmount(human: string): string {
  const trimmed = human.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid $BLOW amount: ${human}`);
  }
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholePart, fracPart = ""] = unsigned.split(".");
  if (fracPart.length > BLOW_DECIMALS) {
    throw new Error(`$BLOW amount has more than ${BLOW_DECIMALS} decimals`);
  }
  const fracPadded = fracPart.padEnd(BLOW_DECIMALS, "0");
  const wei = BigInt(wholePart + fracPadded);
  return (negative ? -wei : wei).toString();
}

/** Idempotent event key: vault + block + logIndex (reorg-safe within confirmation window). */
export function seatVaultEventDedupeKey(
  vaultAddress: string,
  blockNumber: number,
  logIndex: number
): string {
  return `${vaultAddress.toLowerCase()}:${blockNumber}:${logIndex}`;
}

export const SEAT_VAULT_EVENT_NAMES = [
  "Staked",
  "UnstakeInitiated",
  "Unstaked",
] as const;

export type SeatVaultEventName = (typeof SEAT_VAULT_EVENT_NAMES)[number];

/**
 * Base Sepolia SeatVault v1 (see contracts/deployments/base-sepolia.seat-vaults.json
 * and contracts/deployments/base-sepolia.active.json).
 * Runtime activation uses env validation against the active deployment record.
 */
export const SEAT_VAULT_V1 = {
  version: ACTIVE_BASE_SEPOLIA_DEPLOYMENT.version,
  address: ACTIVE_BASE_SEPOLIA_DEPLOYMENT.seatVault,
  margincallToken: ACTIVE_BASE_SEPOLIA_DEPLOYMENT.margincallToken,
  escrow: ACTIVE_BASE_SEPOLIA_DEPLOYMENT.escrow,
  seatThresholdWei: SEAT_THRESHOLD_WEI,
  cornerOfficeThresholdWei: CORNER_OFFICE_THRESHOLD_WEI,
  unstakeCooldownSeconds: UNSTAKE_COOLDOWN_SECONDS,
} as const;

/** Blocks to lag behind tip before treating logs as confirmed (Base ~2s blocks). */
export const SEAT_VAULT_CONFIRMATION_DEPTH = 8;

/** Max blocks scanned per indexer tick. */
export const SEAT_VAULT_MAX_BLOCKS_PER_TICK = 2_000;

export const seatVaultAbi = [
  {
    type: "function",
    name: "stake",
    inputs: [
      { name: "traderId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "initiateUnstake",
    inputs: [
      { name: "traderId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "completeUnstake",
    inputs: [{ name: "traderId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "stakeOf",
    inputs: [{ name: "traderId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "staker", type: "address" },
          { name: "active", type: "uint256" },
          { name: "pending", type: "uint256" },
          { name: "unlockTime", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "tierOf",
    inputs: [{ name: "traderId", type: "uint256" }],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "seatThreshold",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "cornerOfficeThreshold",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "unstakeCooldown",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "token",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "escrow",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "Staked",
    inputs: [
      { name: "traderId", type: "uint256", indexed: true },
      { name: "staker", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "UnstakeInitiated",
    inputs: [
      { name: "traderId", type: "uint256", indexed: true },
      { name: "staker", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "unlockTime", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Unstaked",
    inputs: [
      { name: "traderId", type: "uint256", indexed: true },
      { name: "staker", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;
