import { BaseError, ContractFunctionRevertedError } from "viem";
import {
  AGENT_PRICING_UNAVAILABLE_REASON,
  agentError,
  readBase,
  type AgentErr,
  type AgentErrorCode,
  type AgentResult,
} from "@/lib/agent/result";
import {
  parseAssetSelector,
  parseLeverage,
  parseStockAmountRaw,
  parseThesis,
  parseWallet,
  type AssetSelector,
} from "@/lib/agent/input";
import { toPricing, type AgentPricing } from "@/lib/agent/market-state";
import { financedOpenRefusal } from "@/lib/agent/sizing";
import { stockSymbol } from "@/lib/positions/artwork";
import { marginCallAbi } from "@/lib/protocol/abi";
import { formatStockAmount } from "@/lib/protocol/amounts";
import { isFinancedLeverage, leverageLabel } from "@/lib/protocol/constants";
import {
  baseDeployment,
  type LaunchAsset,
  type LaunchAssetName,
} from "@/lib/protocol/deployment";
import { encodeApprove, encodeOpenPosition } from "@/lib/protocol/encode";
import type { BasePublicClient } from "@/lib/protocol/public-client";
import { loadOpenSnapshot } from "@/lib/protocol/reads";

export type PrepareOpenInput = AssetSelector & {
  wallet: unknown;
  stockAmount: unknown;
  leverage: unknown;
  thesis?: unknown;
};

/** One unsigned Base transaction, ready for any compatible signer. */
export type PreparedTransaction = {
  kind: "approve" | "open";
  to: `0x${string}`;
  data: `0x${string}`;
  value: "0";
  chainId: number;
  description: string;
  /** Whether Base was asked to dry-run this exact call before returning it. */
  simulated: boolean;
};

export type PrepareOpenPayload = {
  wallet: `0x${string}`;
  asset: LaunchAssetName;
  symbol: string | null;
  assetId: number;
  leverage: number;
  leverageLabel: string | null;
  financed: boolean;
  /** Null for spot, which never consults the oracle on-chain. */
  pricing: AgentPricing | null;
  stockAmount: string;
  contributionValue: string | null;
  estimatedPrincipal: string;
  estimatedExposure: string | null;
  thesis: string;
  transactions: readonly PreparedTransaction[];
  note: string;
};

const UNSIGNED_NOTE =
  "These transactions are unsigned. Submit them in order from the given wallet with any Base-capable signer. Margin Call never signs or broadcasts.";

/**
 * Named `openPosition` reverts, mapped to codes an agent can branch on.
 * Anything unlisted degrades to SIMULATION_FAILED rather than leaking raw data.
 */
const OPEN_REVERTS: Record<string, { code: AgentErrorCode; message: string }> =
  {
    OracleNotLive: {
      code: "PRICING_UNAVAILABLE",
      message: AGENT_PRICING_UNAVAILABLE_REASON,
    },
    InsufficientCredit: {
      code: "INSUFFICIENT_CREDIT",
      message: "The CreditPool cannot fund this principal right now.",
    },
    ContributionTooSmall: {
      code: "INVALID_INPUT",
      message:
        "Contribution is too small to finance at this leverage. Increase stockAmount.",
    },
    LeverageExceeded: {
      code: "SIMULATION_FAILED",
      message:
        "The swap would fill too poorly to support this leverage. Try a lower preset or a larger contribution.",
    },
    ThesisTooLong: {
      code: "THESIS_TOO_LONG",
      message: "The thesis exceeds the on-chain byte limit.",
    },
    UnsupportedLeverage: {
      code: "UNSUPPORTED_LEVERAGE",
      message: "The contract rejected this leverage preset.",
    },
    UnknownAsset: {
      code: "UNKNOWN_ASSET",
      message: "The contract does not know this assetId.",
    },
    // Not UNKNOWN_ASSET: the asset is real and the request was well formed, so
    // re-spelling the id will not help. Only time or an admin change will.
    AssetOpeningDisabled: {
      code: "SIMULATION_FAILED",
      message: "Opening is currently disabled for this asset.",
    },
    ZeroStockAmount: {
      code: "INVALID_INPUT",
      message: "stockAmount must be greater than zero.",
    },
  };

function revertName(error: unknown): string | null {
  if (!(error instanceof BaseError)) return null;
  const reverted = error.walk(
    (cause) => cause instanceof ContractFunctionRevertedError
  );
  return reverted instanceof ContractFunctionRevertedError
    ? (reverted.data?.errorName ?? null)
    : null;
}

function simulationRefusal(error: unknown): AgentErr {
  const name = revertName(error);
  if (name == null) {
    return agentError(
      "SIMULATION_FAILED",
      "Base did not confirm this open would succeed. Re-check market state and credit before retrying."
    );
  }
  const known = OPEN_REVERTS[name];
  return known
    ? agentError(known.code, known.message)
    : agentError("SIMULATION_FAILED", `Base rejected the open: ${name}.`);
}

function approveTransaction(args: {
  asset: LaunchAsset;
  stockAmount: bigint;
}): PreparedTransaction {
  return {
    kind: "approve",
    to: args.asset.stock,
    data: encodeApprove({
      spender: baseDeployment.marginCall,
      amount: args.stockAmount,
    }),
    value: "0",
    chainId: baseDeployment.chainId,
    description: `Approve MarginCall to move ${formatStockAmount(args.stockAmount)} ${args.asset.name}.`,
    simulated: false,
  };
}

function openTransaction(args: {
  asset: LaunchAsset;
  stockAmount: bigint;
  leverage: number;
  thesis: string;
  simulated: boolean;
}): PreparedTransaction {
  return {
    kind: "open",
    to: baseDeployment.marginCall,
    data: encodeOpenPosition({
      assetId: BigInt(args.asset.assetId),
      stockAmount: args.stockAmount,
      targetLeverage: BigInt(args.leverage),
      thesis: args.thesis,
    }),
    value: "0",
    chainId: baseDeployment.chainId,
    description: `Open a ${leverageLabel(args.leverage) ?? `${args.leverage}bps`} ${args.asset.name} position with ${formatStockAmount(args.stockAmount)} ${args.asset.name}.`,
    simulated: args.simulated,
  };
}

/**
 * Build the unsigned transactions that open a position for a caller's wallet.
 *
 * Never signs and never broadcasts: the output is ordinary Base calldata, so a
 * Dynamic server wallet, a Bankr agent wallet, or a bare viem account can all
 * execute the same result. Margin Call never learns which one did.
 *
 * The approve step appears only when the existing allowance is short. When it
 * does, the open is not simulated — a dry run would revert on the allowance
 * that the caller has not granted yet — and says so via `simulated: false`.
 */
export async function prepareOpen(
  client: BasePublicClient,
  input: PrepareOpenInput
): Promise<AgentResult<PrepareOpenPayload>> {
  const wallet = parseWallet(input.wallet);
  if (!wallet.ok) return wallet;

  const asset = parseAssetSelector(input);
  if (!asset.ok) return asset;

  const stockAmount = parseStockAmountRaw(input.stockAmount);
  if (!stockAmount.ok) return stockAmount;

  const leverage = parseLeverage(input.leverage);
  if (!leverage.ok) return leverage;

  const thesis = parseThesis(input.thesis);
  if (!thesis.ok) return thesis;

  const snapshot = await readBase(() =>
    loadOpenSnapshot(client, {
      address: wallet.value,
      asset: asset.value,
      leverage: leverage.value,
      stockAmount: stockAmount.value,
    })
  );
  if (!snapshot.ok) return snapshot;

  const {
    stockBalance,
    stockAllowance,
    availableCredit,
    oracleState,
    contributionValue,
  } = snapshot.value;

  if (stockBalance < stockAmount.value) {
    return agentError(
      "INSUFFICIENT_BALANCE",
      `Wallet holds ${formatStockAmount(stockBalance)} ${asset.value.name}, short of the ${formatStockAmount(stockAmount.value)} requested.`
    );
  }

  // Spot skips the oracle on-chain, so a null state means "not consulted".
  const pricing = oracleState == null ? null : toPricing(oracleState);
  const financed = isFinancedLeverage(leverage.value);

  if (financed) {
    const refusal = financedOpenRefusal({
      pricing: pricing ?? "unavailable",
      estimatedPrincipal: snapshot.value.estimatedPrincipal,
      availableCredit,
    });
    if (refusal) return refusal;
  }

  const estimatedPrincipal = snapshot.value.estimatedPrincipal ?? 0n;
  const needsApproval = stockAllowance < stockAmount.value;

  if (!needsApproval) {
    try {
      await client.simulateContract({
        address: baseDeployment.marginCall,
        abi: marginCallAbi,
        functionName: "openPosition",
        args: [
          BigInt(asset.value.assetId),
          stockAmount.value,
          BigInt(leverage.value),
          0n,
          thesis.value,
        ],
        account: wallet.value,
      });
    } catch (error) {
      return simulationRefusal(error);
    }
  }

  return {
    ok: true,
    wallet: wallet.value,
    asset: asset.value.name,
    symbol: stockSymbol(asset.value.assetId),
    assetId: asset.value.assetId,
    leverage: leverage.value,
    leverageLabel: leverageLabel(leverage.value),
    financed,
    pricing,
    stockAmount: stockAmount.value.toString(),
    contributionValue: contributionValue?.toString() ?? null,
    estimatedPrincipal: estimatedPrincipal.toString(),
    estimatedExposure:
      contributionValue == null
        ? null
        : (contributionValue + estimatedPrincipal).toString(),
    thesis: thesis.value,
    transactions: [
      ...(needsApproval
        ? [
            approveTransaction({
              asset: asset.value,
              stockAmount: stockAmount.value,
            }),
          ]
        : []),
      openTransaction({
        asset: asset.value,
        stockAmount: stockAmount.value,
        leverage: leverage.value,
        thesis: thesis.value,
        simulated: !needsApproval,
      }),
    ],
    note: UNSIGNED_NOTE,
  };
}
