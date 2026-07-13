import {
  CORNER_OFFICE_THRESHOLD_WEI,
  SEAT_THRESHOLD_WEI,
  compareWei,
  formatBlowAmount,
  type SeatTierName,
} from "@/lib/contracts/seatVault";

/** Floor-facing labels — never imply yield or odds. */
export const SEAT_TIER_FLOOR_LABEL: Record<SeatTierName, string> = {
  Gallery: "Gallery",
  Seat: "Seat",
  CornerOffice: "Corner Office",
};

export type NextTierTarget = {
  nextTier: SeatTierName;
  thresholdWei: string;
  deltaWei: string;
  deltaHuman: string;
};

/**
 * Principal still needed to clear the next floor tier threshold.
 * Returns null at Corner Office (no higher desk).
 */
export function amountNeededForNextTier(
  activeWei: string,
  seatThresholdWei: string = SEAT_THRESHOLD_WEI,
  cornerThresholdWei: string = CORNER_OFFICE_THRESHOLD_WEI
): NextTierTarget | null {
  if (compareWei(activeWei, cornerThresholdWei) >= 0) {
    return null;
  }
  if (compareWei(activeWei, seatThresholdWei) >= 0) {
    const delta = (BigInt(cornerThresholdWei) - BigInt(activeWei)).toString();
    return {
      nextTier: "CornerOffice",
      thresholdWei: cornerThresholdWei,
      deltaWei: delta,
      deltaHuman: formatBlowAmount(delta),
    };
  }
  const delta = (BigInt(seatThresholdWei) - BigInt(activeWei)).toString();
  return {
    nextTier: "Seat",
    thresholdWei: seatThresholdWei,
    deltaWei: delta,
    deltaHuman: formatBlowAmount(delta),
  };
}

/** True when pending principal is waiting past unlock. */
export function isCooldownComplete(
  unlockTimeSeconds: number,
  nowSeconds: number
): boolean {
  if (unlockTimeSeconds <= 0) return false;
  return nowSeconds >= unlockTimeSeconds;
}

/** True when pending principal exists but unlock has not arrived. */
export function isCooldownActive(
  unlockTimeSeconds: number,
  pendingWei: string,
  nowSeconds: number
): boolean {
  if (compareWei(pendingWei, "0") <= 0) return false;
  if (unlockTimeSeconds <= 0) return false;
  return nowSeconds < unlockTimeSeconds;
}

/**
 * Lapsed seat: active principal is below Seat while a withdrawal is still
 * pending (principal left the floor, badge capacity already Gallery).
 */
export function isLapsedSeat(
  activeWei: string,
  pendingWei: string,
  seatThresholdWei: string = SEAT_THRESHOLD_WEI
): boolean {
  return (
    compareWei(pendingWei, "0") > 0 &&
    compareWei(activeWei, seatThresholdWei) < 0
  );
}

/** Format remaining cooldown as Hh Mm Ss (or "Ready"). */
export function formatUnlockCountdown(
  unlockTimeSeconds: number,
  nowSeconds: number
): string {
  if (unlockTimeSeconds <= 0) return "—";
  const remaining = unlockTimeSeconds - nowSeconds;
  if (remaining <= 0) return "Ready";

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

/** Can this wallet post new principal on the active vault? */
export function canPostPrincipal(args: {
  walletAddress: string | null | undefined;
  depositorAddress: string | null | undefined;
  isActiveVault: boolean;
}): boolean {
  if (!args.isActiveVault) return false;
  if (!args.walletAddress || !args.depositorAddress) return false;
  return (
    args.walletAddress.toLowerCase() === args.depositorAddress.toLowerCase()
  );
}

/**
 * Can this wallet pull principal off the floor (initiate unstake)?
 * Contract: only the recorded staker may initiate.
 */
export function canInitiateUnstake(args: {
  walletAddress: string | null | undefined;
  stakerAddress: string | null | undefined;
  activeWei: string;
}): boolean {
  if (!args.walletAddress) return false;
  if (compareWei(args.activeWei, "0") <= 0) return false;
  const wallet = args.walletAddress.toLowerCase();
  const staker = args.stakerAddress?.toLowerCase();
  return wallet === staker;
}

/**
 * Former depositor / current staker may finish a withdrawal after cooldown
 * without receiving capacity on an inactive vault.
 */
export function canCompleteWithdrawal(args: {
  pendingWei: string;
  unlockTimeSeconds: number;
  nowSeconds: number;
}): boolean {
  if (compareWei(args.pendingWei, "0") <= 0) return false;
  return isCooldownComplete(args.unlockTimeSeconds, args.nowSeconds);
}
