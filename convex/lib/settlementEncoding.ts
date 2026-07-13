/**
 * Off-chain settlement encoding for MarginCallEscrow.settleEntry.
 * Mirrors the contract's economic bounds (#206) so settleEntry never
 * reverts for extraction/available-pot/rake reasons when we clamp first.
 */

export const USDC_DECIMALS = 1_000_000;

export function usdcToRaw(amountUsdc: number): bigint {
  return BigInt(Math.max(0, Math.round(amountUsdc * USDC_DECIMALS)));
}

export function rawToUsdc(raw: bigint): number {
  return Number(raw) / USDC_DECIMALS;
}

export type SettleEntryCaps = {
  entryCostRaw: bigint;
  potAmountRaw: bigint;
  reservedAmountRaw: bigint;
  maxExtractionAmountRaw: bigint;
};

export type ClampSettleEntryInput = SettleEntryCaps & {
  entryCostUsdc: number;
  traderPnlUsdc: number;
  rakeUsdc: number;
};

export type ClampedSettleEntry = {
  grossPayoutRaw: bigint;
  rakeRaw: bigint;
  profitRaw: bigint;
  /** Net trader PnL after rake (USDC), matching on-chain paid profit − rake. */
  traderPnlUsdc: number;
  /** Rake paid on-chain (USDC). */
  rakeUsdc: number;
  /** Pot delta: −profit on wins, +|loss| on losses. */
  potChangeUsdc: number;
};

/**
 * Clamp gross payout and rake to on-chain caps:
 * - gross ≤ entryCost + maxExtractionAmount
 * - gross ≤ pot - reserved + entryCost (leave peer reserves intact)
 * - gross ≤ pot
 * - rake ≤ profit (gross - entryCost, floored at 0)
 *
 * Also returns USDC economics derived from the clamped raw values so recorded
 * outcomes match what settleEntry actually pays (#216).
 */
export function clampSettleEntryArgs(
  input: ClampSettleEntryInput
): ClampedSettleEntry {
  const {
    entryCostRaw,
    potAmountRaw,
    reservedAmountRaw,
    maxExtractionAmountRaw,
    entryCostUsdc,
    traderPnlUsdc,
    rakeUsdc,
  } = input;

  const capByExtractionRaw = entryCostRaw + maxExtractionAmountRaw;
  const availableRaw = potAmountRaw - reservedAmountRaw + entryCostRaw;

  let grossPayoutRaw = usdcToRaw(
    Math.max(0, entryCostUsdc + traderPnlUsdc + rakeUsdc)
  );
  if (grossPayoutRaw > capByExtractionRaw) grossPayoutRaw = capByExtractionRaw;
  if (grossPayoutRaw > availableRaw) grossPayoutRaw = availableRaw;
  if (grossPayoutRaw > potAmountRaw) grossPayoutRaw = potAmountRaw;

  const profitRaw =
    grossPayoutRaw > entryCostRaw ? grossPayoutRaw - entryCostRaw : BigInt(0);
  let rakeRaw = usdcToRaw(rakeUsdc);
  if (rakeRaw > profitRaw) rakeRaw = profitRaw;

  const entryFromRaw = rawToUsdc(entryCostRaw);
  const grossUsdc = rawToUsdc(grossPayoutRaw);
  const rakeUsdcClamped = rawToUsdc(rakeRaw);
  const traderPnlUsdcClamped = grossUsdc - entryFromRaw - rakeUsdcClamped;
  const potChangeUsdc = entryFromRaw - grossUsdc;

  return {
    grossPayoutRaw,
    rakeRaw,
    profitRaw,
    traderPnlUsdc: traderPnlUsdcClamped,
    rakeUsdc: rakeUsdcClamped,
    potChangeUsdc,
  };
}
