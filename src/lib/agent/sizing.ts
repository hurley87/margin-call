import {
  AGENT_PRICING_UNAVAILABLE_REASON,
  agentError,
  type AgentErr,
} from "@/lib/agent/result";
import type { AgentPricing } from "@/lib/agent/market-state";
import { formatUsdcRaw } from "@/lib/protocol/amounts";

/**
 * Why a financed open cannot proceed, or null when it can.
 *
 * These are the same gates `openReadiness` applies to the site, minus the
 * wallet and chain copy an agent cannot act on: it brings its own signer and
 * Base is the only chain this surface prepares for. Refusing on stale pricing
 * is the point — the protocol will not size a loan against a price it does not
 * trust, so neither will the quote.
 */
export function financedOpenRefusal(args: {
  pricing: AgentPricing;
  estimatedPrincipal: bigint | null;
  availableCredit: bigint;
}): AgentErr | null {
  if (args.pricing !== "live" || args.estimatedPrincipal == null) {
    return agentError(
      "PRICING_UNAVAILABLE",
      `${AGENT_PRICING_UNAVAILABLE_REASON} Margin Call will not finance an open against a stale price.`
    );
  }

  if (args.estimatedPrincipal === 0n) {
    return agentError(
      "INVALID_INPUT",
      "Contribution is too small to finance at this leverage. Increase stockAmount."
    );
  }

  if (args.availableCredit < args.estimatedPrincipal) {
    return agentError(
      "INSUFFICIENT_CREDIT",
      `This open needs ${formatUsdcRaw(args.estimatedPrincipal)} USDC of credit; the pool has ${formatUsdcRaw(args.availableCredit)}.`
    );
  }

  return null;
}
