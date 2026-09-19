import { getAddress, parseUnits } from "viem";
import { getAssets } from "@/lib/agent/assets";
import { formatStockAmount, formatUsdcRaw } from "@/lib/protocol/amounts";
import { STOCK_DECIMALS, USDC_DECIMALS } from "@/lib/protocol/constants";
import { baseDeployment } from "@/lib/protocol/deployment";
import type {
  AgentWallet,
  TypedDataAgentWallet,
  UnsignedTransaction,
  WalletTypedData,
} from "@/lib/wallets/adapter";
import { readWalletBalances, type BalanceClient } from "@/lib/wallets/balances";
import {
  DEFAULT_ACQUIRE_USDC,
  DEFAULT_SLIPPAGE_TOLERANCE,
  type PermitData,
  type TradingErr,
  type UnsignedSwapTx,
  type UniswapTradingApi,
} from "@/lib/uniswap/trading-api";

export type AcquireStockErrorCode =
  | "INSUFFICIENT_GAS"
  | "INSUFFICIENT_USDC"
  | "NO_ROUTE"
  | "OUTPUT_MISMATCH"
  | "SWAP_FAILED"
  | "BALANCE_UNCHANGED"
  | "UNISWAP_UNAVAILABLE"
  | "UNKNOWN_ASSET"
  | "INVALID_INPUT";

export type AcquireStockOk = {
  ok: true;
  asset: string;
  stock: `0x${string}`;
  usdcAmount: string;
  usdcAmountFormatted: string;
  stockReceived: string;
  stockReceivedFormatted: string;
  transactionHashes: readonly `0x${string}`[];
};

export type AcquireStockErr = {
  ok: false;
  code: AcquireStockErrorCode;
  message: string;
};

export type AcquireStockResult = AcquireStockOk | AcquireStockErr;

export type AcquireStockArgs = {
  wallet: TypedDataAgentWallet;
  balances: BalanceClient;
  trading: UniswapTradingApi;
  asset: string;
  usdcAmount: bigint;
  slippageTolerance?: number;
};

function readFlag(argv: readonly string[], name: string): string | undefined {
  const index = argv.findIndex((arg) => arg === name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

export type AcquireCliArgs = {
  requested: boolean;
  asset: string;
  usdcAmount: bigint;
  error?: string;
};

/** `--acquire [--asset NVDAc] [--usdc 2]` for the Dynamic reference CLI. */
export function parseAcquireCliArgs(argv: readonly string[]): AcquireCliArgs {
  const requested = argv.includes("--acquire");
  const asset = readFlag(argv, "--asset") ?? "NVDAc";
  const usdcRaw = readFlag(argv, "--usdc");
  if (!usdcRaw) {
    return { requested, asset, usdcAmount: DEFAULT_ACQUIRE_USDC };
  }
  try {
    const usdcAmount = parseUnits(usdcRaw, USDC_DECIMALS);
    if (usdcAmount <= 0n) {
      return {
        requested,
        asset,
        usdcAmount: 0n,
        error: "--usdc must be a positive decimal USDC amount, for example 2.",
      };
    }
    return { requested, asset, usdcAmount };
  } catch {
    return {
      requested,
      asset,
      usdcAmount: 0n,
      error: "--usdc must be a decimal USDC amount, for example 2.",
    };
  }
}

function fail(code: AcquireStockErrorCode, message: string): AcquireStockErr {
  return { ok: false, code, message };
}

function asSwapTx(tx: UnsignedSwapTx): UnsignedTransaction {
  return { to: tx.to, data: tx.data, value: tx.value };
}

export function permitDataToTypedData(permit: PermitData): WalletTypedData {
  const types = { ...permit.types };
  delete types.EIP712Domain;
  const primaryType = Object.prototype.hasOwnProperty.call(
    types,
    "PermitSingle"
  )
    ? "PermitSingle"
    : Object.prototype.hasOwnProperty.call(types, "PermitBatch")
      ? "PermitBatch"
      : Object.keys(types)[0];
  if (!primaryType) {
    throw new Error("Permit2 payload is missing a primary type");
  }
  return {
    domain: permit.domain,
    types: types as WalletTypedData["types"],
    primaryType,
    message: permit.values,
  };
}

function mapTradingError(error: TradingErr): AcquireStockErr {
  switch (error.code) {
    case "NO_ROUTE":
    case "OUTPUT_MISMATCH":
    case "UNISWAP_UNAVAILABLE":
      return fail(error.code, error.message);
    case "INVALID_QUOTE":
    case "INVALID_SWAP":
      return fail("SWAP_FAILED", error.message);
    default: {
      const exhaustive: never = error.code;
      return exhaustive;
    }
  }
}

async function sendAndWait(
  wallet: AgentWallet,
  tx: UnsignedSwapTx
): Promise<AcquireStockErr | { ok: true; hash: `0x${string}` }> {
  const hash = await wallet.sendTransaction(asSwapTx(tx));
  const receipt = await wallet.waitForReceipt(hash);
  if (receipt.status !== "success") {
    return fail("SWAP_FAILED", `Transaction ${hash} reverted on Base.`);
  }
  return { ok: true, hash };
}

/**
 * Dynamic reference path: USDC → a curated Margin Call stock via Uniswap.
 *
 * Stock acquisition is not a protocol step. An agent whose wallet already
 * swaps (Bankr, and so on) should skip this and continue once the wallet
 * holds the supported token from `get_assets`.
 */
export async function acquireSupportedStock(
  args: AcquireStockArgs
): Promise<AcquireStockResult> {
  if (args.usdcAmount <= 0n) {
    return fail(
      "INVALID_INPUT",
      "usdcAmount must be a positive number of USDC base units."
    );
  }

  const discovered = getAssets().assets.find(
    (asset) => asset.name.toUpperCase() === args.asset.trim().toUpperCase()
  );
  if (!discovered) {
    const names = getAssets()
      .assets.map((asset) => asset.name)
      .join(", ");
    return fail(
      "UNKNOWN_ASSET",
      `Unknown asset "${args.asset}". Supported: ${names}.`
    );
  }

  const stock = getAddress(discovered.stock);
  const usdc = getAddress(baseDeployment.usdc);
  const wallet = args.wallet.address;

  const before = await readWalletBalances(args.balances, wallet, [
    { token: usdc, symbol: "USDC", decimals: USDC_DECIMALS },
    { token: stock, symbol: discovered.name, decimals: STOCK_DECIMALS },
  ]);
  if (before.ethRaw === 0n) {
    return fail(
      "INSUFFICIENT_GAS",
      "Wallet has 0 ETH. Fund it manually with a small amount of Base ETH for gas, then retry."
    );
  }
  const usdcHeld = before.tokens[0]?.raw ?? 0n;
  if (usdcHeld < args.usdcAmount) {
    return fail(
      "INSUFFICIENT_USDC",
      `Wallet holds ${formatUsdcRaw(usdcHeld)} USDC; this swap needs ${formatUsdcRaw(args.usdcAmount)} USDC.`
    );
  }
  const stockBefore = before.tokens[1]?.raw ?? 0n;

  const approval = await args.trading.checkApproval({
    walletAddress: wallet,
    token: usdc,
    amount: args.usdcAmount,
    tokenOut: stock,
  });
  if (!approval.ok) return mapTradingError(approval);

  const hashes: `0x${string}`[] = [];
  for (const tx of [approval.cancel, approval.approval]) {
    if (!tx) continue;
    const sent = await sendAndWait(args.wallet, tx);
    if (!sent.ok) return sent;
    hashes.push(sent.hash);
  }

  const quoted = await args.trading.quote({
    swapper: wallet,
    tokenIn: usdc,
    tokenOut: stock,
    amount: args.usdcAmount,
    slippageTolerance: args.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE,
  });
  if (!quoted.ok) return mapTradingError(quoted);

  if (quoted.outputToken !== stock) {
    return fail(
      "OUTPUT_MISMATCH",
      `Quoted output token ${quoted.outputToken} does not match the selected Margin Call stock ${stock}. Refusing to substitute another asset.`
    );
  }

  let signature: `0x${string}` | undefined;
  if (quoted.permitData) {
    try {
      signature = await args.wallet.signTypedData(
        permitDataToTypedData(quoted.permitData)
      );
    } catch (error) {
      return fail(
        "SWAP_FAILED",
        error instanceof Error
          ? error.message
          : "Wallet could not sign the Permit2 message."
      );
    }
  }

  const swap = await args.trading.createSwap({
    quote: {
      routing: quoted.routing,
      outputToken: quoted.outputToken,
      amountOut: quoted.amountOut,
      minimumAmountOut: quoted.minimumAmountOut,
      permitData: quoted.permitData,
      quote: quoted.quote,
    },
    ...(signature ? { signature } : {}),
  });
  if (!swap.ok) return mapTradingError(swap);

  const sent = await sendAndWait(args.wallet, swap);
  if (!sent.ok) return sent;
  hashes.push(sent.hash);

  const after = await readWalletBalances(args.balances, wallet, [
    { token: stock, symbol: discovered.name, decimals: STOCK_DECIMALS },
  ]);
  const stockAfter = after.tokens[0]?.raw ?? 0n;
  const received = stockAfter - stockBefore;
  if (received <= 0n) {
    return fail(
      "BALANCE_UNCHANGED",
      `Swap ${sent.hash} confirmed, but the ${discovered.name} balance did not increase.`
    );
  }

  return {
    ok: true,
    asset: discovered.name,
    stock,
    usdcAmount: args.usdcAmount.toString(),
    usdcAmountFormatted: formatUsdcRaw(args.usdcAmount),
    stockReceived: received.toString(),
    stockReceivedFormatted: formatStockAmount(received),
    transactionHashes: hashes,
  };
}
