import {
  BASE_CHAIN_ID,
  ORACLE_STATE,
  SPOT_LEVERAGE,
  isSupportedOpeningLeverage,
  type OracleState,
} from "@/lib/protocol/constants";

export type WriteGate = { ok: true } | { ok: false; reason: string };

/**
 * Shown when a financed open cannot be priced. Oracle states are a protocol
 * detail, so HELD and INVALID read the same to the person opening a position.
 */
export const PRICING_UNAVAILABLE_REASON =
  "Market pricing is temporarily unavailable.";

/**
 * Explains the pause above. Pricing follows the U.S. equity market rather than
 * a schedule Margin Call sets, so this says "typically" instead of fixed hours.
 */
export const PRICING_AVAILABILITY_NOTE =
  "Leveraged positions are available when fresh U.S. market pricing is live, typically Monday–Friday during regular trading hours.";

export const PRICING_AVAILABILITY_CAVEAT =
  "Availability may vary on market holidays or during pricing interruptions.";

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
  stockBalance: bigint | null;
  targetLeverage: number;
  oracleState: OracleState | null;
  availableCredit: bigint | null;
  estimatedPrincipal: bigint | null;
};

/**
 * Whether the Open action should be enabled for the current form state.
 * Spot opens are oracle-free on-chain, so they skip the LIVE/credit gates and
 * stay openable while pricing is stale. Financed opens require LIVE + credit.
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

  if (input.stockBalance == null) {
    return { ok: false, reason: "Balance unread." };
  }

  if (input.stockBalance < input.stockAmount) {
    return { ok: false, reason: "Insufficient selected-stock balance." };
  }

  if (input.targetLeverage === SPOT_LEVERAGE) {
    return { ok: true };
  }

  // Unread and stale price the same for the caller: we cannot size the loan.
  if (input.oracleState !== ORACLE_STATE.LIVE) {
    return { ok: false, reason: PRICING_UNAVAILABLE_REASON };
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
 * Owner-only, matching MarginCall.closePosition.
 */
export function closeReadiness(args: {
  chainId: number | null | undefined;
  currentDebt: bigint | null;
  isOwner: boolean;
}): WriteGate {
  const chain = assertBaseChain(args.chainId);
  if (!chain.ok) return chain;

  if (!args.isOwner) {
    return { ok: false, reason: "Only the Position owner can close." };
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

/**
 * Repay all is available to the current owner or executor while debt remains.
 * Pass the latest `currentDebt(tokenId)` from Base — never a Convex cache.
 */
export function repayReadiness(args: {
  chainId: number | null | undefined;
  currentDebt: bigint | null;
  isManager: boolean;
}): WriteGate {
  const chain = assertBaseChain(args.chainId);
  if (!chain.ok) return chain;

  if (!args.isManager) {
    return {
      ok: false,
      reason: "Only the Position owner or executor can repay.",
    };
  }

  if (args.currentDebt == null) {
    return { ok: false, reason: "Debt unread." };
  }

  if (args.currentDebt === 0n) {
    return { ok: false, reason: "No outstanding debt." };
  }

  return { ok: true };
}
