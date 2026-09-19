import { getAddress } from "viem";
import { describe, expect, it, vi } from "vitest";
import { baseDeployment, getAssetByName } from "@/lib/protocol/deployment";
import {
  createUniswapTradingApi,
  UNISWAP_TRADE_API_URL,
} from "@/lib/uniswap/trading-api";

const WALLET = "0xBe523e724B9Ea7D618dD093f14618D90c4B19b0c" as const;
const USDC = baseDeployment.usdc;
const NVDAC = getAssetByName("NVDAc").stock;
const WETH = "0x4200000000000000000000000000000000000006" as const;
const API_KEY = "uniswap-test-key";

const CLASSIC_QUOTE = {
  input: { token: USDC, amount: "2000000" },
  output: {
    token: NVDAC,
    amount: "1100000",
    recipient: WALLET,
    minimumAmount: "1089000",
  },
  swapper: WALLET,
  chainId: 8453,
  slippage: 1,
  tradeType: "EXACT_INPUT",
  gasUseEstimate: "150000",
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function quoteRequestBody(fetchMock: ReturnType<typeof vi.fn>) {
  const init = fetchMock.mock.calls.at(0)?.at(1) as { body: string };
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe("createUniswapTradingApi.quote", () => {
  it("quotes USDC to the canonical NVDAc address and keeps that output token", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        requestId: "req-1",
        routing: "CLASSIC",
        permitData: null,
        quote: CLASSIC_QUOTE,
      })
    );
    const api = createUniswapTradingApi({ apiKey: API_KEY, fetch: fetchMock });

    const result = await api.quote({
      swapper: WALLET,
      tokenIn: USDC,
      tokenOut: NVDAC,
      amount: 2_000_000n,
      slippageTolerance: 1,
    });

    expect(result).toMatchObject({
      ok: true,
      routing: "CLASSIC",
      outputToken: getAddress(NVDAC),
      amountOut: 1_100_000n,
      minimumAmountOut: 1_089_000n,
    });
    if (!result.ok) throw new Error("expected quote");
    expect(result.permitData).toBeNull();

    expect(fetchMock).toHaveBeenCalledWith(
      `${UNISWAP_TRADE_API_URL}/quote`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": API_KEY,
          "x-universal-router-version": "2.0",
        }),
      })
    );
    const body = quoteRequestBody(fetchMock);
    expect(body).toMatchObject({
      type: "EXACT_INPUT",
      amount: "2000000",
      tokenIn: USDC,
      tokenOut: NVDAC,
      tokenInChainId: 8453,
      tokenOutChainId: 8453,
      swapper: WALLET,
      slippageTolerance: 1,
      routingPreference: "BEST_PRICE",
      protocols: ["V2", "V3", "V4"],
      permitAmount: "EXACT",
    });
    expect(body.protocols).not.toContain("UNISWAPX");
  });

  it("refuses a quote whose output token is not the requested Margin Call stock", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        requestId: "req-2",
        routing: "CLASSIC",
        permitData: null,
        quote: {
          ...CLASSIC_QUOTE,
          output: { ...CLASSIC_QUOTE.output, token: WETH },
        },
      })
    );
    const api = createUniswapTradingApi({ apiKey: API_KEY, fetch: fetchMock });

    const result = await api.quote({
      swapper: WALLET,
      tokenIn: USDC,
      tokenOut: NVDAC,
      amount: 2_000_000n,
      slippageTolerance: 1,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "OUTPUT_MISMATCH",
    });
    if (result.ok) throw new Error("expected refusal");
    expect(result.message).toMatch(/does not match/i);
    expect(result.message).toContain(NVDAC);
    expect(result.message).not.toMatch(/will swap/i);
  });

  it("fails clearly when Uniswap has no route", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(404, {
        errorCode: "NoRouteFoundError",
        detail: "No route found",
        requestId: "req-3",
      })
    );
    const api = createUniswapTradingApi({ apiKey: API_KEY, fetch: fetchMock });

    await expect(
      api.quote({
        swapper: WALLET,
        tokenIn: USDC,
        tokenOut: NVDAC,
        amount: 2_000_000n,
        slippageTolerance: 1,
      })
    ).resolves.toMatchObject({
      ok: false,
      code: "NO_ROUTE",
    });
  });

  it("does not treat an UniswapX quote as a swap transaction", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        requestId: "req-4",
        routing: "PRIORITY",
        permitData: { domain: {}, types: {}, values: {} },
        quote: { encodedOrder: "0xabc", orderInfo: { outputs: [] } },
      })
    );
    const api = createUniswapTradingApi({ apiKey: API_KEY, fetch: fetchMock });

    const result = await api.quote({
      swapper: WALLET,
      tokenIn: USDC,
      tokenOut: NVDAC,
      amount: 2_000_000n,
      slippageTolerance: 1,
    });

    expect(result).toMatchObject({ ok: false, code: "NO_ROUTE" });
    if (result.ok) throw new Error("expected refusal");
    expect(result.message).toMatch(/CLASSIC/i);
  });
});

describe("createUniswapTradingApi.checkApproval and createSwap", () => {
  it("returns an approval transaction when Permit2 allowance is missing", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        requestId: "req-a",
        approval: {
          to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          from: WALLET,
          data: "0x095ea7b30000000000000000000000000000000000000001",
          value: "0",
          chainId: 8453,
        },
        cancel: null,
      })
    );
    const api = createUniswapTradingApi({ apiKey: API_KEY, fetch: fetchMock });

    const result = await api.checkApproval({
      walletAddress: WALLET,
      token: USDC,
      amount: 2_000_000n,
      tokenOut: NVDAC,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected approval");
    expect(result.approval).toMatchObject({
      to: getAddress(USDC),
      value: 0n,
    });
    expect(result.approval?.data.startsWith("0x")).toBe(true);
    expect(result.cancel).toBeNull();
  });

  it("builds swap calldata from the inner CLASSIC quote, not a wrapped quote envelope", async () => {
    const permitData = {
      domain: { name: "Permit2", chainId: 8453 },
      types: {
        PermitSingle: [{ name: "spender", type: "address" }],
      },
      values: { spender: WALLET },
    };
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        requestId: "req-s",
        swap: {
          to: "0x2626664c2603336E57B271c5C0b26F421741e481",
          from: WALLET,
          data: "0x3593564c0000000000000000000000000000000000000001",
          value: "0",
          chainId: 8453,
        },
      })
    );
    const api = createUniswapTradingApi({ apiKey: API_KEY, fetch: fetchMock });
    const quoted = await (async () => {
      const inner = createUniswapTradingApi({
        apiKey: API_KEY,
        fetch: vi.fn(async () =>
          jsonResponse(200, {
            requestId: "req-q",
            routing: "CLASSIC",
            permitData,
            quote: CLASSIC_QUOTE,
          })
        ),
      });
      return inner.quote({
        swapper: WALLET,
        tokenIn: USDC,
        tokenOut: NVDAC,
        amount: 2_000_000n,
        slippageTolerance: 1,
      });
    })();
    if (!quoted.ok) throw new Error("expected quote fixture");

    const result = await api.createSwap({
      quote: quoted,
      signature: "0xsignature",
    });

    expect(result.ok).toBe(true);
    const init = fetchMock.mock.calls.at(0)?.at(1) as unknown as {
      body: string;
    };
    const body = JSON.parse(init.body) as {
      quote: { output: { token: string } };
      signature: string;
      permitData: unknown;
    };
    expect(body.quote.output.token).toBe(NVDAC);
    expect(body.signature).toBe("0xsignature");
    expect(body.permitData).toEqual(permitData);
    expect(body).not.toHaveProperty("routing");
  });
});
