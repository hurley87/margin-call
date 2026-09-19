import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fakeClient,
  livePositionReads,
  openSnapshotReads,
  type ReadHandlers,
} from "@/lib/agent/__tests__/fake-client";
import { ERC721_NONEXISTENT_TOKEN } from "@/lib/protocol/abi";
import { ORACLE_STATE } from "@/lib/protocol/constants";
import type { BasePublicClient } from "@/lib/protocol/public-client";

/**
 * Only the RPC client is stubbed. The routes run the real agent tools, so
 * these cover the wiring — status, headers, body shape — without re-asserting
 * protocol behaviour already covered in `src/lib/agent/__tests__`.
 */
const base = vi.hoisted(() => ({ client: null as BasePublicClient | null }));

vi.mock("@/lib/protocol/server-client", () => ({
  createBaseServerClient: () => base.client,
}));

const { GET: getAssetsRoute } = await import("@/app/api/agent/assets/route");
const { GET: getMarketStateRoute, OPTIONS: marketPreflight } =
  await import("@/app/api/agent/market-state/route");
const { GET: getCreditPoolRoute } =
  await import("@/app/api/agent/credit-pool/route");
const { GET: getPositionRoute } =
  await import("@/app/api/agent/position/[tokenId]/route");
const { POST: quoteOpenRoute } =
  await import("@/app/api/agent/quote-open/route");
const { POST: prepareOpenRoute } =
  await import("@/app/api/agent/prepare-open/route");

const WALLET = "0x1234567890AbcdEF1234567890aBcdef12345678";

function stubBase(reads: ReadHandlers): void {
  base.client = fakeClient(reads);
}

function get(url: string): Request {
  return new Request(`https://margincall.fun${url}`);
}

function post(url: string, body: unknown): Request {
  return new Request(`https://margincall.fun${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function positionRoute(tokenId: string): Promise<Response> {
  return getPositionRoute(get(`/api/agent/position/${tokenId}`), {
    params: Promise.resolve({ tokenId }),
  });
}

beforeEach(() => {
  base.client = null;
});

describe("GET /api/agent/assets", () => {
  it("answers any origin without a wallet, an API key, or an RPC", async () => {
    const response = getAssetsRoute();

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toContain("max-age=300");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      chainId: 8453,
    });
  });
});

describe("GET /api/agent/market-state", () => {
  it("reports live pricing for the asset named in the query", async () => {
    stubBase(openSnapshotReads({ oracleState: ORACLE_STATE.LIVE }));

    const response = await getMarketStateRoute(
      get("/api/agent/market-state?asset=NVDAc")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      asset: "NVDAc",
      pricing: "live",
      canOpenLeveragedPosition: true,
    });
  });

  it("is 400 for an asset the protocol does not list", async () => {
    stubBase({});

    const response = await getMarketStateRoute(
      get("/api/agent/market-state?asset=TSLAc")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "UNKNOWN_ASSET",
    });
  });

  it("is 502 and uncacheable when Base cannot be reached", async () => {
    stubBase({
      latestObservation: () => {
        throw new Error("fetch failed");
      },
    });

    const response = await getMarketStateRoute(
      get("/api/agent/market-state?assetId=1")
    );

    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      code: "BASE_UNAVAILABLE",
    });
  });

  it("answers a CORS preflight so browser agents can call it", () => {
    const response = marketPreflight();

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "POST"
    );
  });
});

describe("GET /api/agent/credit-pool", () => {
  it("reports lendable credit", async () => {
    stubBase({ availableCredit: () => 20_000_000n });

    const response = await getCreditPoolRoute();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      availableCredit: "20000000",
    });
  });
});

describe("GET /api/agent/position/[tokenId]", () => {
  it("returns live financials for an open position", async () => {
    stubBase(
      livePositionReads({
        currentDebt: 560_000n,
        risk: { nav: 1_400_000n, liquidatable: false },
      })
    );

    const response = await positionRoute("42");

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=10");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      tokenId: "42",
      currentDebt: "560000",
      stage: "healthy",
    });
  });

  it("is 404 for a burned or never-minted token", async () => {
    stubBase({
      positions: () => {
        throw new Error(ERC721_NONEXISTENT_TOKEN);
      },
    });

    const response = await positionRoute("9");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "POSITION_NOT_FOUND",
    });
  });

  it("is 400 for a token id that is not a uint256", async () => {
    stubBase({});

    expect((await positionRoute("abc")).status).toBe(400);
  });
});

describe("POST /api/agent/quote-open", () => {
  it("quotes a financed open from a JSON body", async () => {
    stubBase(openSnapshotReads({ contributionValue: 2_000_000n }));

    const response = await quoteOpenRoute(
      post("/api/agent/quote-open", {
        asset: "NVDAc",
        stockAmount: "1000000",
        leverage: 12500,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      estimatedPrincipal: "495000",
    });
  });

  it("answers 200 with a refusal when pricing is unavailable, not an error status", async () => {
    stubBase(openSnapshotReads({ oracleState: ORACLE_STATE.HELD }));

    const response = await quoteOpenRoute(
      post("/api/agent/quote-open", {
        asset: "NVDAc",
        stockAmount: "1000000",
        leverage: 12500,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "PRICING_UNAVAILABLE",
    });
  });

  it("is 400 for a malformed body", async () => {
    stubBase({});

    const response = await quoteOpenRoute(
      new Request("https://margincall.fun/api/agent/quote-open", {
        method: "POST",
        body: "not json",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
});

describe("POST /api/agent/prepare-open", () => {
  it("returns unsigned transactions the caller's own wallet can sign", async () => {
    stubBase(openSnapshotReads({ contributionValue: 2_000_000n }));

    const response = await prepareOpenRoute(
      post("/api/agent/prepare-open", {
        wallet: WALLET,
        assetId: 1,
        stockAmount: "1000000",
        leverage: 12500,
        thesis: "AI infrastructure demand remains strong",
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = (await response.json()) as {
      ok: boolean;
      transactions: { kind: string; to: string; data: string; value: string }[];
    };
    expect(body.ok).toBe(true);
    expect(body.transactions.map((tx) => tx.kind)).toEqual(["approve", "open"]);
    for (const tx of body.transactions) {
      expect(tx.value).toBe("0");
      expect(tx.data.startsWith("0x")).toBe(true);
    }
  });

  it("is 400 when the wallet is not a Base address", async () => {
    stubBase({});

    const response = await prepareOpenRoute(
      post("/api/agent/prepare-open", {
        wallet: "nope",
        assetId: 1,
        stockAmount: "1000000",
        leverage: 12500,
      })
    );

    expect(response.status).toBe(400);
  });
});
