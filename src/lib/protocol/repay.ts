import {
  ADVERSE_BOUND_BPS,
  BPS_DENOMINATOR,
  REPAY_BUFFER_BPS,
  SPOT_LEVERAGE,
} from "@/lib/protocol/constants";

/**
 * Repay overpayment ceiling matching BaseMainnetHarnessBase._repayCeiling:
 * `remaining + floor(remaining * 100 / 10000) + 1`.
 * `repay` caps at min(amount, currentDebt), so overshooting is safe.
 */
export function repayCeiling(remaining: bigint): bigint {
  if (remaining === 0n) return 0n;
  return (
    remaining +
    (remaining * BigInt(REPAY_BUFFER_BPS)) / BigInt(BPS_DENOMINATOR) +
    1n
  );
}

/**
 * Financed principal estimate matching MarginCall._sizePrincipal.
 * Spot (1.0x) draws zero credit.
 */
export function sizePrincipal(
  contributionValue: bigint,
  targetLeverage: number
): bigint {
  if (targetLeverage <= SPOT_LEVERAGE) return 0n;
  const ideal =
    (contributionValue * BigInt(targetLeverage - BPS_DENOMINATOR)) /
    BigInt(BPS_DENOMINATOR);
  return (ideal * BigInt(ADVERSE_BOUND_BPS)) / BigInt(BPS_DENOMINATOR);
}
