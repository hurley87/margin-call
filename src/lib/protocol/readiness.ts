import {
  BASE_CHAIN_ID,
  ORACLE_STATE,
  SPOT_LEVERAGE,
  isFinancedLeverage,
  isSupportedOpeningLeverage,
  type OracleState,
} from "@/lib/protocol/constants";

export type WriteGate = { ok: true } | { ok: false; reason: string };

/** Writes are only allowed on Base mainnet. */
export function assertBaseChain(chainId: number | null | undefined): WriteGate {
  if (chainId == null) {
    return {
      ok: false,
      reason: "Wallet chain unknown. Connect and switch to Base.",
    };
  }
  if (chainId !== BASE_CHAIN_ID) {
    return {
      ok: false,
      reason: `Wrong network (chain ${chainId}). Switch to Base (${BASE_CHAIN_ID}).`,
    };
  }
  return { ok: true };
}

export type OpenReadinessInput = {
  chainId: number | null | undefined;
  stockAmount: bigint;
  stockBalance: bigint;
  targetLeverage: number;
  oracleState: OracleState | null;
  availableCredit: bigint | null;
  estimatedPrincipal: bigint | null;
};

/**
 * Whether the Open action should be enabled for the current form state.
 * Spot opens skip LIVE/credit gates. Financed opens require LIVE + credit.
 */
export function openReadiness(input: OpenReadinessInput): WriteGate {
  const chain = assertBaseChain(input.chainId);
  if (!chain.ok) return chain;

  if (input.stockAmount <= 0n) {
    return { ok: false, reason: "Enter a stock amount greater than zero." };
  }

  if (!isSupportedOpeningLeverage(input.targetLeverage)) {
    return { ok: false, reason: "Unsupported leverage preset." };
  }

  if (input.stockBalance < input.stockAmount) {
    return { ok: false, reason: "Insufficient selected-stock balance." };
  }

  if (input.targetLeverage === SPOT_LEVERAGE) {
    return { ok: true };
  }

  if (!isFinancedLeverage(input.targetLeverage)) {
    return { ok: false, reason: "Unsupported leverage preset." };
  }

  if (input.oracleState == null) {
    return { ok: false, reason: "Oracle state unavailable." };
  }

  if (input.oracleState !== ORACLE_STATE.LIVE) {
    return {
      ok: false,
      reason: `Selected asset oracle is not LIVE (state ${input.oracleState}).`,
    };
  }

  if (input.estimatedPrincipal == null || input.availableCredit == null) {
    return { ok: false, reason: "Credit sizing unavailable." };
  }

  if (input.estimatedPrincipal === 0n) {
    return { ok: false, reason: "Contribution too small for financed open." };
  }

  if (input.availableCredit < input.estimatedPrincipal) {
    return {
      ok: false,
      reason: "CreditPool available credit is insufficient.",
    };
  }

  return { ok: true };
}

/**
 * Close stays disabled until a post-repay re-read reports zero debt.
 * Pass the latest `currentDebt(tokenId)` — never the pre-repay snapshot.
 */
export function closeReadiness(args: {
  chainId: number | null | undefined;
  currentDebt: bigint | null;
  positionExists: boolean;
}): WriteGate {
  const chain = assertBaseChain(args.chainId);
  if (!chain.ok) return chain;

  if (!args.positionExists) {
    return { ok: false, reason: "No open position." };
  }

  if (args.currentDebt == null) {
    return { ok: false, reason: "Debt unread. Refresh after repay." };
  }

  if (args.currentDebt !== 0n) {
    return {
      ok: false,
      reason: "Close enabled only when currentDebt is zero. Repay all first.",
    };
  }

  return { ok: true };
}
