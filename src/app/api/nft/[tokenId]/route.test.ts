import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PositionView } from "@/lib/protocol/reads";

const loadPosition = vi.hoisted(() => vi.fn());

vi.mock("@/lib/protocol/reads", () => ({ loadPosition }));
vi.mock("@/lib/protocol/server-client", () => ({
  createBaseServerClient: () => ({}),
}));

const { GET } = await import("@/app/api/nft/[tokenId]/route");

function livePosition(overrides: Partial<PositionView> = {}): PositionView {
  return {
    status: "open",
    tokenId: 42n,
    assetId: 1,
    stockAmount: 100_000_000n,
    principal: 0n,
    currentDebt: 0n,
    owner: "0x1234567890abcdef1234567890abcdef12345678",
    executor: "0x0000000000000000000000000000000000000000",
    thesis: "",
    nav: null,
    liquidatable: null,
    ...overrides,
  } as PositionView;
}

function call(tokenId: string): Promise<Response> {
  return GET(new Request(`https://margincall.fun/api/nft/${tokenId}`), {
    params: Promise.resolve({ tokenId }),
  });
}

beforeEach(() => {
  loadPosition.mockReset();
});

describe("GET /api/nft/[tokenId]", () => {
  it("serves metadata for a live token with a cross-origin marketplace header", async () => {
    loadPosition.mockResolvedValue(livePosition({ thesis: "Long the puppy." }));

    const response = await call("42");

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toContain("max-age=60");
    await expect(response.json()).resolves.toMatchObject({
      name: "Margin Call Position #42",
      description: "Long the puppy.",
      image: "https://margincall.fun/nvda/healthy.png",
    });
  });

  it("reflects live risk state in the served image", async () => {
    loadPosition.mockResolvedValue(
      livePosition({
        assetId: 4,
        currentDebt: 700_000n,
        nav: 1_000_000n,
        liquidatable: false,
      })
    );

    const response = await call("7");

    await expect(response.json()).resolves.toMatchObject({
      image: "https://margincall.fun/googl/danger.png",
    });
  });

  it("is 404 for a burned or unminted token", async () => {
    loadPosition.mockResolvedValue({ status: "burned", tokenId: 9n });

    const response = await call("9");

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=10");
  });

  it("rejects a non-numeric or padded token id without touching Base", async () => {
    for (const bad of ["abc", "1.5", "-1", "007", ""]) {
      expect((await call(bad)).status).toBe(400);
    }
    expect(loadPosition).not.toHaveBeenCalled();
  });

  it("does not cache an RPC failure as if it were an answer about the token", async () => {
    loadPosition.mockRejectedValue(new Error("HTTP request failed"));

    const response = await call("42");

    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
