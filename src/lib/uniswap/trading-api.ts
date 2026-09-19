import { getAddress, isAddress, isHex } from "viem";
import { BASE_CHAIN_ID } from "@/lib/protocol/constants";
import { redactSecrets } from "@/lib/wallets/redact";

export const UNISWAP_TRADE_API_URL = "https://trade-api.gateway.uniswap.org/v1";
export const UNIVERSAL_ROUTER_VERSION = "2.0";
/** 1% — tokenized-stock pools are thinner than blue-chip stables. */
export const DEFAULT_SLIPPAGE_TOLERANCE = 1;
/** 2 USDC. Enough for a ~0.01 NVDAc demo size without a large inventory. */
export const DEFAULT_ACQUIRE_USDC = 2_000_000n;

export type TradingErrorCode =
  | "NO_ROUTE"
  | "OUTPUT_MISMATCH"
  | "UNISWAP_UNAVAILABLE"
  | "INVALID_QUOTE"
  | "INVALID_SWAP";

export type TradingOk<T> = { ok: true } & T;
export type TradingErr = {
  ok: false;
  code: TradingErrorCode;
  message: string;
};
export type TradingResult<T> = TradingOk<T> | TradingErr;

export type PermitData = {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  values: Record<string, unknown>;
};

export type ClassicSwapQuote = {
  routing: "CLASSIC";
  outputToken: `0x${string}`;
  amountOut: bigint;
  minimumAmountOut: bigint;
  permitData: PermitData | null;
  /** Inner CLASSIC quote object — this is what POST /swap expects as `quote`. */
  quote: Record<string, unknown>;
};

export type ApprovalPlan = {
  approval: UnsignedSwapTx | null;
  cancel: UnsignedSwapTx | null;
};

export type UnsignedSwapTx = {
  to: `0x${string}`;
  data: `0x${string}`;
  value: bigint;
};

export type QuoteArgs = {
  swapper: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amount: bigint;
  slippageTolerance?: number;
};

export type CheckApprovalArgs = {
  walletAddress: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  tokenOut: `0x${string}`;
};

export type CreateSwapArgs = {
  quote: ClassicSwapQuote;
  signature?: `0x${string}`;
};

export type UniswapTradingApi = {
  checkApproval: (
    args: CheckApprovalArgs
  ) => Promise<TradingResult<ApprovalPlan>>;
  quote: (args: QuoteArgs) => Promise<TradingResult<ClassicSwapQuote>>;
  createSwap: (args: CreateSwapArgs) => Promise<TradingResult<UnsignedSwapTx>>;
};

export type UniswapTradingApiDeps = {
  apiKey: string;
  fetch?: typeof fetch;
  baseUrl?: string;
};

function fail(code: TradingErrorCode, message: string): TradingErr {
  return { ok: false, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

function asAddress(value: unknown): `0x${string}` | null {
  if (typeof value !== "string" || !isAddress(value)) return null;
  return getAddress(value);
}

function parsePermitData(value: unknown): PermitData | null {
  if (value == null) return null;
  if (!isRecord(value)) return null;
  if (
    !isRecord(value.domain) ||
    !isRecord(value.types) ||
    !isRecord(value.values)
  ) {
    return null;
  }
  return {
    domain: value.domain,
    types: value.types,
    values: value.values,
  };
}

function parseSwapTx(value: unknown): UnsignedSwapTx | null {
  if (value == null) return null;
  if (!isRecord(value)) return null;
  const to = asAddress(value.to);
  if (!to) return null;
  if (
    typeof value.data !== "string" ||
    !isHex(value.data) ||
    value.data === "0x"
  ) {
    return null;
  }
  const chainId = Number(value.chainId);
  if (chainId !== BASE_CHAIN_ID) return null;
  const wei = asBigInt(value.value) ?? 0n;
  if (wei < 0n) return null;
  return { to, data: value.data as `0x${string}`, value: wei };
}

export function readUniswapApiKey(env: NodeJS.Dict<string>): string {
  const key = env.UNISWAP_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "UNISWAP_API_KEY is required for the Dynamic + Uniswap reference acquisition. Agents that already swap (for example Bankr) should skip this step and acquire the supported stock with their own wallet tooling."
    );
  }
  return key;
}

/**
 * Uniswap Trading API client for the Dynamic reference demo.
 *
 * Not part of Margin Call's public agent surface. A Bankr-style agent with its
 * own swap capability never needs this module — only the exact stock address.
 */
export function createUniswapTradingApi(
  deps: UniswapTradingApiDeps
): UniswapTradingApi {
  const fetchImpl = deps.fetch ?? fetch;
  const baseUrl = (deps.baseUrl ?? UNISWAP_TRADE_API_URL).replace(/\/$/, "");
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-api-key": deps.apiKey,
    "x-universal-router-version": UNIVERSAL_ROUTER_VERSION,
    "x-agent-info": JSON.stringify({
      decision_origin: "autonomous",
      integration_name: "margin-call",
    }),
  };

  async function post(
    path: string,
    body: Record<string, unknown>
  ): Promise<TradingResult<{ status: number; payload: unknown }>> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    } catch (error) {
      const message = redactSecrets(
        error instanceof Error ? error.message : String(error),
        [deps.apiKey]
      );
      return fail(
        "UNISWAP_UNAVAILABLE",
        message || "Uniswap Trading API could not be reached."
      );
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.status === 401) {
      return fail(
        "UNISWAP_UNAVAILABLE",
        "Uniswap rejected the API key. Confirm UNISWAP_API_KEY."
      );
    }
    if (response.status === 429) {
      return fail(
        "UNISWAP_UNAVAILABLE",
        "Uniswap rate-limited the request. Retry shortly."
      );
    }

    return { ok: true, status: response.status, payload };
  }

  function noRouteMessage(payload: unknown, fallback: string): string {
    if (isRecord(payload)) {
      const detail =
        typeof payload.detail === "string"
          ? payload.detail
          : typeof payload.message === "string"
            ? payload.message
            : null;
      if (detail) return detail;
    }
    return fallback;
  }

  return {
    async checkApproval(args) {
      const posted = await post("/check_approval", {
        walletAddress: getAddress(args.walletAddress),
        token: getAddress(args.token),
        amount: args.amount.toString(),
        chainId: BASE_CHAIN_ID,
        tokenOut: getAddress(args.tokenOut),
        tokenOutChainId: BASE_CHAIN_ID,
      });
      if (!posted.ok) return posted;
      if (posted.status >= 400 || !isRecord(posted.payload)) {
        return fail(
          "UNISWAP_UNAVAILABLE",
          noRouteMessage(
            posted.payload,
            "Uniswap could not check the USDC approval."
          )
        );
      }

      const approvalRaw = posted.payload.approval;
      const cancelRaw = posted.payload.cancel;
      if (approvalRaw != null && parseSwapTx(approvalRaw) == null) {
        return fail(
          "INVALID_SWAP",
          "Uniswap returned an approval transaction that is not a Base calldata payload."
        );
      }
      if (cancelRaw != null && parseSwapTx(cancelRaw) == null) {
        return fail(
          "INVALID_SWAP",
          "Uniswap returned an approval-reset transaction that is not a Base calldata payload."
        );
      }

      return {
        ok: true,
        approval: parseSwapTx(approvalRaw),
        cancel: parseSwapTx(cancelRaw),
      };
    },

    async quote(args) {
      const tokenOut = getAddress(args.tokenOut);
      const posted = await post("/quote", {
        type: "EXACT_INPUT",
        amount: args.amount.toString(),
        tokenIn: getAddress(args.tokenIn),
        tokenOut,
        tokenInChainId: BASE_CHAIN_ID,
        tokenOutChainId: BASE_CHAIN_ID,
        swapper: getAddress(args.swapper),
        slippageTolerance: args.slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE,
        routingPreference: "BEST_PRICE",
        // AMM only: UniswapX returns an order, not a swap transaction.
        protocols: ["V2", "V3", "V4"],
        permitAmount: "EXACT",
      });
      if (!posted.ok) return posted;

      if (posted.status === 404) {
        const code =
          isRecord(posted.payload) &&
          posted.payload.errorCode === "InsufficientBalance"
            ? "INVALID_QUOTE"
            : "NO_ROUTE";
        return fail(
          code,
          noRouteMessage(
            posted.payload,
            `Uniswap has no route from USDC to ${tokenOut}.`
          )
        );
      }
      if (posted.status >= 400 || !isRecord(posted.payload)) {
        return fail(
          "UNISWAP_UNAVAILABLE",
          noRouteMessage(posted.payload, "Uniswap did not return a quote.")
        );
      }

      if (
        posted.payload.routing !== "CLASSIC" ||
        !isRecord(posted.payload.quote)
      ) {
        return fail(
          "NO_ROUTE",
          "Uniswap did not return an on-chain CLASSIC swap. The Dynamic reference demo signs swap transactions, not UniswapX orders."
        );
      }

      const quote = posted.payload.quote;
      const output = isRecord(quote.output) ? quote.output : null;
      const quotedToken = output ? asAddress(output.token) : null;
      const amountOut = output ? asBigInt(output.amount) : null;
      const minimumAmountOut = output ? asBigInt(output.minimumAmount) : null;
      if (!quotedToken || amountOut == null || amountOut <= 0n) {
        return fail(
          "INVALID_QUOTE",
          "Uniswap quote is missing a CLASSIC output."
        );
      }
      if (quotedToken !== tokenOut) {
        return fail(
          "OUTPUT_MISMATCH",
          `Quoted output token ${quotedToken} does not match the selected Margin Call stock ${tokenOut}. Refusing to substitute another asset.`
        );
      }

      const permitData = parsePermitData(posted.payload.permitData);

      return {
        ok: true,
        routing: "CLASSIC",
        outputToken: quotedToken,
        amountOut,
        minimumAmountOut: minimumAmountOut ?? amountOut,
        permitData,
        quote,
      };
    },

    async createSwap(args) {
      if (args.quote.routing !== "CLASSIC") {
        return fail(
          "NO_ROUTE",
          "Only CLASSIC Uniswap quotes can be converted into a swap transaction."
        );
      }
      const body: Record<string, unknown> = {
        quote: args.quote.quote,
        refreshGasPrice: true,
      };
      if (args.signature && args.quote.permitData) {
        body.signature = args.signature;
        body.permitData = args.quote.permitData;
      }

      const posted = await post("/swap", body);
      if (!posted.ok) return posted;
      if (posted.status >= 400 || !isRecord(posted.payload)) {
        return fail(
          "INVALID_SWAP",
          noRouteMessage(
            posted.payload,
            "Uniswap could not build swap calldata. Fetch a fresh quote and retry."
          )
        );
      }

      const tx = parseSwapTx(posted.payload.swap);
      if (!tx) {
        return fail(
          "INVALID_SWAP",
          "Uniswap returned empty or non-Base swap calldata. Fetch a fresh quote and retry."
        );
      }
      return { ok: true, ...tx };
    },
  };
}
