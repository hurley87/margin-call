import { readBase, type AgentResult } from "@/lib/agent/result";
import {
  parseAssetSelector,
  parseLeverage,
  parseStockAmountRaw,
  type AssetSelector,
} from "@/lib/agent/input";
import {
  PRICING_NOTE,
  toPricing,
  type AgentPricing,
} from "@/lib/agent/market-state";
import { financedOpenRefusal } from "@/lib/agent/sizing";
import { stockSymbol } from "@/lib/positions/artwork";
import {
  ORACLE_STATE,
  isFinancedLeverage,
  leverageLabel,
} from "@/lib/protocol/constants";
import type { LaunchAssetName } from "@/lib/protocol/deployment";
import type { BasePublicClient } from "@/lib/protocol/public-client";
import {
  loadAvailableCredit,
  loadMarketObservation,
  loadStockValueUsdc,
} from "@/lib/protocol/reads";
import { sizePrincipal } from "@/lib/protocol/repay";

export type QuoteOpenInput = AssetSelector & {
  stockAmount: unknown;
  leverage: unknown;
};

export type QuoteOpenPayload = {
  asset: LaunchAssetName;
  symbol: string | null;
  assetId: number;
  leverage: number;
  leverageLabel: string | null;
  financed: boolean;
  pricing: AgentPricing;
  /** True whenever this payload is returned; a refusal is an error result. */
  canOpen: true;
  stockAmount: string;
  /** Oracle value of the contributed stock, or null when pricing is stale. */
  contributionValue: string | null;
  estimatedPrincipal: string;
  /** Contribution plus borrowed principal, in USDC base units. */
  estimatedExposure: string | null;
  availableCredit: string;
  pricingNote: string;
};

/**
 * Whether a requested open is possible right now, and how it would be sized.
 *
 * Wallet-free: sizing depends on price, leverage, and pool credit, not on who
 * is asking. The caller's stock balance is checked later, by `prepare_open`.
 *
 * Spot (1.0x) borrows nothing and never touches the oracle on-chain, so it
 * still quotes while pricing is stale. Financed leverage refuses instead.
 */
export async function quoteOpen(
  client: BasePublicClient,
  input: QuoteOpenInput
): Promise<AgentResult<QuoteOpenPayload>> {
  const asset = parseAssetSelector(input);
  if (!asset.ok) return asset;

  const stockAmount = parseStockAmountRaw(input.stockAmount);
  if (!stockAmount.ok) return stockAmount;

  const leverage = parseLeverage(input.leverage);
  if (!leverage.ok) return leverage;

  const reads = await readBase(async () => {
    const [observation, availableCredit] = await Promise.all([
      loadMarketObservation(client, asset.value),
      loadAvailableCredit(client),
    ]);
    const contributionValue =
      observation.state === ORACLE_STATE.LIVE
        ? await loadStockValueUsdc(client, {
            asset: asset.value,
            stockAmount: stockAmount.value,
            price: observation.price,
          })
        : null;
    return { observation, availableCredit, contributionValue };
  });
  if (!reads.ok) return reads;

  const { availableCredit, contributionValue } = reads.value;
  const pricing = toPricing(reads.value.observation.state);
  const financed = isFinancedLeverage(leverage.value);
  const sized =
    contributionValue == null
      ? null
      : sizePrincipal(contributionValue, leverage.value);

  if (financed) {
    const refusal = financedOpenRefusal({
      pricing,
      estimatedPrincipal: sized,
      availableCredit,
    });
    if (refusal) return refusal;
  }

  // Spot is the only path that reaches here unsized, and it borrows nothing.
  const estimatedPrincipal = sized ?? 0n;

  return {
    ok: true,
    asset: asset.value.name,
    symbol: stockSymbol(asset.value.assetId),
    assetId: asset.value.assetId,
    leverage: leverage.value,
    leverageLabel: leverageLabel(leverage.value),
    financed,
    pricing,
    canOpen: true,
    stockAmount: stockAmount.value.toString(),
    contributionValue: contributionValue?.toString() ?? null,
    estimatedPrincipal: estimatedPrincipal.toString(),
    estimatedExposure:
      contributionValue == null
        ? null
        : (contributionValue + estimatedPrincipal).toString(),
    availableCredit: availableCredit.toString(),
    pricingNote: PRICING_NOTE,
  };
}
