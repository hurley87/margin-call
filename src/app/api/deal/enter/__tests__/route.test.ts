/**
 * Route tests for `/api/deal/enter` — trading-hours enforcement.
 *
 * The route reads `Date.now()` via `getTradingHoursState()`, so we drive open
 * vs. closed with `vi.setSystemTime(...)`. The vitest config sets
 * `MC_FORCE_MARKET_OPEN=1` globally for the Convex-test suite; this file is
 * under `src/` and inherits that env, so we explicitly drop it at the top to
 * exercise the real clock-based code path.
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Drop the global force-open override before any module reads the env.
const ORIGINAL_FORCE_OPEN = process.env.MC_FORCE_MARKET_OPEN;
beforeAll(() => {
  delete process.env.MC_FORCE_MARKET_OPEN;
});
afterAll(() => {
  if (ORIGINAL_FORCE_OPEN !== undefined) {
    process.env.MC_FORCE_MARKET_OPEN = ORIGINAL_FORCE_OPEN;
  }
});

// ── Hoisted mocks (run before imports) ──────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/lib/siwa/verify", () => ({
  verifySIWARequest: vi.fn(async () => ({
    valid: true,
    agentId: 42,
    address: "0x1111111111111111111111111111111111111111",
    signerAddress: "0x2222222222222222222222222222222222222222",
  })),
}));

const mockConvexQuery = vi.fn();
const mockConvexMutation = vi.fn();
vi.mock("@/lib/convex/server-client", () => ({
  createConvexAdminClient: () => ({
    query: mockConvexQuery,
    mutation: mockConvexMutation,
  }),
}));

vi.mock("@/lib/contracts/operator", () => ({
  sendOperatorContractCall: vi.fn(async () => ({
    transactionHash: "0xdeadbeef",
  })),
}));
vi.mock("@/lib/contracts/balance", () => ({
  getEscrowBalance: vi.fn(async () => 1_000),
}));
vi.mock("@/lib/contracts/on-chain", () => ({
  getOnChainDeal: vi.fn(async () => ({ status: 0 })),
  getNftOwner: vi.fn(async () => "0x1111111111111111111111111111111111111111"),
  DEAL_STATUS_OPEN: 0,
}));
// Rate-limit is a no-op when Upstash isn't configured (tests), but stub it
// anyway to keep the test hermetic.
vi.mock("@/lib/rate-limit", () => ({
  dealEnterLimit: null,
  checkRateLimit: vi.fn(async () => null),
  getClientIdentifier: vi.fn(() => "test-client"),
}));

import { NextRequest } from "next/server";
import { POST } from "../route";

// ── Concrete ET timestamps ──────────────────────────────────────────────────
// Tue 2026-05-05 10:00 ET (EDT, UTC−4) → 14:00 UTC
const TUE_10AM_ET = Date.UTC(2026, 4, 5, 14, 0, 0);
// Sat 2026-05-09 12:00 ET → 16:00 UTC
const SAT_NOON_ET = Date.UTC(2026, 4, 9, 16, 0, 0);

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/deal/enter", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-siwa-message": Buffer.from("siwa-msg").toString("base64"),
      "x-siwa-signature": "0xsig",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockConvexQuery.mockReset();
  mockConvexMutation.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("/api/deal/enter trading-hours gate", () => {
  it("returns 423 + Retry-After + market_closed body when market is closed", async () => {
    vi.setSystemTime(new Date(SAT_NOON_ET));

    const req = buildRequest({
      deal_id: "deal-abc",
      trader_id: "trader-xyz",
      _agent_cycle: true,
    });

    const res = await POST(req);

    expect(res.status).toBe(423);

    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    // Must be a non-negative integer-as-string.
    expect(/^\d+$/.test(retryAfter ?? "")).toBe(true);
    expect(Number(retryAfter)).toBeGreaterThan(0);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("market_closed");
    expect(typeof body.message).toBe("string");
    expect(typeof body.next_open_at).toBe("string");

    // Should NOT have touched downstream Convex/RPC mocks.
    expect(mockConvexQuery).not.toHaveBeenCalled();
    expect(mockConvexMutation).not.toHaveBeenCalled();
  });

  it("proceeds through the normal path when market is open", async () => {
    vi.setSystemTime(new Date(TUE_10AM_ET));

    // Wire up the mock Convex client to satisfy the route's query sequence:
    //   1) loadTrader → trader doc
    //   2) loadDeal   → deal doc
    //   3) findVerifiedEntryByTraderAndDeal → existing entry (short-circuits)
    mockConvexQuery
      .mockResolvedValueOnce({
        deskManagerId: "dm1",
        tokenId: 42,
        cdpWalletAddress: "0x1111111111111111111111111111111111111111",
        cdpOwnerAddress: "0x2222222222222222222222222222222222222222",
        walletStatus: "ready",
      })
      .mockResolvedValueOnce({
        status: "open",
        prompt: "Buy IBM",
        potUsdc: 500,
        entryCostUsdc: 50,
        onChainDealId: null,
        creatorDeskManagerId: "dm2",
      })
      .mockResolvedValueOnce({ paymentId: "pay-already" });

    const req = buildRequest({
      deal_id: "deal-abc",
      trader_id: "trader-xyz",
      _agent_cycle: true,
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.agent_cycle).toBe(true);
    const entry = body.entry as Record<string, unknown>;
    expect(entry.already_entered).toBe(true);
    expect(entry.payment_id).toBe("pay-already");
  });
});
