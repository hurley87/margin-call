import { getAddress, type Log } from "viem";
import {
  getAssets,
  getMarketState,
  getPosition,
  prepareOpen,
  quoteOpen,
  type AgentErrorCode,
  type AgentPositionPayload,
  type PreparedTransaction,
} from "@/lib/agent";
import { parseStockAmount } from "@/lib/protocol/amounts";
import { erc20Abi } from "@/lib/protocol/abi";
import { LEVERAGE_1_25X, leverageLabel } from "@/lib/protocol/constants";
import { decodePositionOpenedTokenId } from "@/lib/protocol/decode";
import type { BasePublicClient } from "@/lib/protocol/public-client";
import type { AgentWallet, UnsignedTransaction } from "@/lib/wallets/adapter";

/** Fixed financed preset for the first reference demo. Not a strategy. */
export const FINANCED_DEMO_LEVERAGE = LEVERAGE_1_25X;

/** On-chain thesis so the minted NFT metadata shows an agent-created position. */
export const FINANCED_DEMO_THESIS =
  "Opened by Margin Call agent reference demo.";

/**
 * Weekend / stale-oracle wording. This is a successful refusal, not a failed
 * request — do not fall back to 1.0x to force the demo through.
 */
export const FINANCED_OPEN_PRICING_REFUSAL =
  "Fresh U.S. equity pricing is unavailable, so I will not open a leveraged position.";

export type OpenFinancedErrorCode = AgentErrorCode | "TX_REVERTED";

export type OpenFinancedOk = {
  ok: true;
  tokenId: string;
  asset: string;
  leverage: number;
  leverageLabel: string;
  stockAmount: string;
  principal: string;
  currentDebt: string;
  thesis: string;
  owner: `0x${string}`;
  transactionHashes: readonly `0x${string}`[];
  position: AgentPositionPayload;
};

export type OpenFinancedErr = {
  ok: false;
  code: OpenFinancedErrorCode;
  message: string;
};

export type OpenFinancedResult = OpenFinancedOk | OpenFinancedErr;

export type OpenFinancedPositionArgs = {
  wallet: AgentWallet;
  client: BasePublicClient;
  asset: string;
  /** Raw 8-decimal units. Omit or pass null to use the wallet's full balance. */
  stockAmount?: bigint | null;
  thesis?: string;
};

function fail(code: OpenFinancedErrorCode, message: string): OpenFinancedErr {
  return { ok: false, code, message };
}

function asUnsigned(tx: PreparedTransaction): UnsignedTransaction {
  return { to: tx.to, data: tx.data, value: 0n };
}

async function openReceiptLogs(args: {
  walletReceipt: { logs?: readonly Log[] };
  client: BasePublicClient;
  hash: `0x${string}`;
}): Promise<readonly Log[]> {
  if (args.walletReceipt.logs && args.walletReceipt.logs.length > 0) {
    return args.walletReceipt.logs;
  }
  const mined = await args.client.waitForTransactionReceipt({
    hash: args.hash,
  });
  return mined.logs;
}

/**
 * Wallet-agnostic financed open: market gate → quote → prepare → sign/submit
 * ordinary Base transactions → read the minted Position NFT.
 *
 * The wallet is any `AgentWallet`. This module never imports a provider SDK.
 */
export async function openFinancedPosition(
  args: OpenFinancedPositionArgs
): Promise<OpenFinancedResult> {
  const thesis = args.thesis ?? FINANCED_DEMO_THESIS;
  const leverage = FINANCED_DEMO_LEVERAGE;

  const market = await getMarketState(args.client, { asset: args.asset });
  if (!market.ok) return fail(market.code, market.message);

  if (!market.canOpenLeveragedPosition) {
    if (market.pricing !== "live") {
      return fail("PRICING_UNAVAILABLE", FINANCED_OPEN_PRICING_REFUSAL);
    }
    return fail(
      "ASSET_OPENING_DISABLED",
      market.reason ??
        `Opening new positions is currently disabled for ${market.asset}.`
    );
  }

  const resolved = await resolveOpenStockAmount({
    client: args.client,
    wallet: args.wallet.address,
    asset: args.asset,
    stockAmount: args.stockAmount ?? null,
  });
  if (!resolved.ok) return resolved;

  const stockAmount = resolved.stockAmount.toString();
  const quote = await quoteOpen(args.client, {
    asset: args.asset,
    stockAmount,
    leverage,
  });
  if (!quote.ok) return fail(quote.code, quote.message);

  const prepared = await prepareOpen(args.client, {
    wallet: args.wallet.address,
    asset: args.asset,
    stockAmount,
    leverage,
    thesis,
  });
  if (!prepared.ok) return fail(prepared.code, prepared.message);

  const hashes: `0x${string}`[] = [];
  let tokenId: bigint | null = null;

  for (const tx of prepared.transactions) {
    const hash = await args.wallet.sendTransaction(asUnsigned(tx));
    hashes.push(hash);
    const receipt = await args.wallet.waitForReceipt(hash);
    if (receipt.status !== "success") {
      return fail("TX_REVERTED", `${tx.kind} transaction reverted (${hash}).`);
    }
    if (tx.kind === "open") {
      const logs = await openReceiptLogs({
        walletReceipt: receipt,
        client: args.client,
        hash,
      });
      tokenId = decodePositionOpenedTokenId(logs);
    }
  }

  if (tokenId == null) {
    return fail(
      "TX_REVERTED",
      "prepare_open did not return an open transaction."
    );
  }

  const position = await getPosition(args.client, {
    tokenId: tokenId.toString(),
  });
  if (!position.ok) return fail(position.code, position.message);

  const expectedOwner = getAddress(args.wallet.address);
  if (getAddress(position.owner) !== expectedOwner) {
    return fail(
      "TX_REVERTED",
      `Position ${tokenId} was minted to ${position.owner}, not ${expectedOwner}.`
    );
  }

  return {
    ok: true,
    tokenId: position.tokenId,
    asset: position.asset ?? prepared.asset,
    leverage: prepared.leverage,
    leverageLabel: prepared.leverageLabel ?? leverageLabel(leverage) ?? "1.25x",
    stockAmount: position.stockAmount,
    principal: position.principal,
    currentDebt: position.currentDebt,
    thesis: position.thesis,
    owner: position.owner,
    transactionHashes: hashes,
    position,
  };
}

function readFlag(argv: readonly string[], name: string): string | undefined {
  const index = argv.findIndex((arg) => arg === name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

export type OpenCliArgs = {
  requested: boolean;
  asset: string;
  /** Raw 8-decimal units when `--stock` is set; null means use the full balance. */
  stockAmount: bigint | null;
  error?: string;
};

/** `--open [--asset NVDAc] [--stock 0.01]` for the reference CLI. */
export function parseOpenCliArgs(argv: readonly string[]): OpenCliArgs {
  const requested = argv.includes("--open");
  const asset = readFlag(argv, "--asset") ?? "NVDAc";
  const stockRaw = readFlag(argv, "--stock");
  if (!stockRaw) {
    return { requested, asset, stockAmount: null };
  }
  const parsed = parseStockAmount(stockRaw);
  if (parsed == null || parsed <= 0n) {
    return {
      requested,
      asset,
      stockAmount: null,
      error:
        "--stock must be a positive decimal stock amount, for example 0.01.",
    };
  }
  return { requested, asset, stockAmount: parsed };
}

/**
 * Resolve `--stock` or the wallet's full balance of the canonical launch token.
 */
export async function resolveOpenStockAmount(args: {
  client: BasePublicClient;
  wallet: `0x${string}`;
  asset: string;
  stockAmount: bigint | null;
}): Promise<{ ok: true; stockAmount: bigint } | OpenFinancedErr> {
  const match = getAssets().assets.find(
    (candidate) =>
      candidate.name.toUpperCase() === args.asset.trim().toUpperCase()
  );
  if (!match) {
    return fail(
      "UNKNOWN_ASSET",
      `Unknown asset "${args.asset}". Call get_assets for the supported set.`
    );
  }

  if (args.stockAmount != null) {
    return { ok: true, stockAmount: args.stockAmount };
  }

  const balance = (await args.client.readContract({
    address: match.stock,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [args.wallet],
  })) as bigint;

  if (balance <= 0n) {
    return fail(
      "INSUFFICIENT_BALANCE",
      `Wallet holds 0 ${match.name}. Acquire the canonical token from get_assets first.`
    );
  }

  return { ok: true, stockAmount: balance };
}
