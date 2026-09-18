/** Base mainnet chain ID — the only write target for this slice. */
export const BASE_CHAIN_ID = 8453;

export const STOCK_DECIMALS = 8;
export const USDC_DECIMALS = 6;

export const BPS_DENOMINATOR = 10_000;
export const REPAY_BUFFER_BPS = 100;
/** Matches V1Config.ADVERSE_BOUND_BPS = BPS_DENOMINATOR - MAX_ORACLE_DEVIATION_BPS. */
export const ADVERSE_BOUND_BPS = 9_900;

export const SPOT_LEVERAGE = 10_000;
export const LEVERAGE_1_1X = 11_000;
export const LEVERAGE_1_25X = 12_500;
export const LEVERAGE_1_4X = 14_000;
export const LEVERAGE_1_5X = 15_000;

/** Default opening leverage for the minimal UI. */
export const DEFAULT_LEVERAGE = LEVERAGE_1_25X;

export const OPENING_LEVERAGE_PRESETS = [
  { label: "1.0x", bps: SPOT_LEVERAGE },
  { label: "1.1x", bps: LEVERAGE_1_1X },
  { label: "1.25x", bps: LEVERAGE_1_25X },
  { label: "1.4x", bps: LEVERAGE_1_4X },
  { label: "1.5x", bps: LEVERAGE_1_5X },
] as const;

export const ORACLE_STATE = {
  LIVE: 0,
  HELD: 1,
  INVALID: 2,
} as const;

export type OracleState = (typeof ORACLE_STATE)[keyof typeof ORACLE_STATE];

/** Narrow a raw on-chain oracle state byte. Returns null when out of range. */
export function parseOracleState(value: number): OracleState | null {
  if (
    value === ORACLE_STATE.LIVE ||
    value === ORACLE_STATE.HELD ||
    value === ORACLE_STATE.INVALID
  ) {
    return value;
  }
  return null;
}

export function isSupportedOpeningLeverage(targetLeverage: number): boolean {
  return OPENING_LEVERAGE_PRESETS.some(
    (preset) => preset.bps === targetLeverage
  );
}

export function isFinancedLeverage(targetLeverage: number): boolean {
  return (
    isSupportedOpeningLeverage(targetLeverage) &&
    targetLeverage !== SPOT_LEVERAGE
  );
}
