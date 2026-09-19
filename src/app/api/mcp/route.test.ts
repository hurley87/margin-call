import { describe, expect, it, vi } from "vitest";
import {
  fakeClient,
  observation,
  openSnapshotReads,
} from "@/lib/agent/__tests__/fake-client";
import { ORACLE_STATE } from "@/lib/protocol/constants";
import type { BasePublicClient } from "@/lib/protocol/public-client";

/**
 * Drives the real MCP handler over JSON-RPC so the endpoint is checked the way
 * a client uses it, rather than by asserting the tools were registered.
 */
const base = vi.hoisted(() => ({ client: null as BasePublicClient | null }));

vi.mock("@/lib/protocol/server-client", () => ({
  createBaseServerClient: () => base.client,
}));

const { POST } = await import("@/app/api/mcp/route");

const PROTOCOL_VERSION = "2025-06-18";

function rpc(method: string, params: unknown, id: number): Request {
  return new Request("https://margincall.fun/api/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
}

/** Streamable HTTP may answer as JSON or as a single SSE event. */
async function rpcResult(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  const payload = text.startsWith("event:")
    ? (text
        .split("\n")
        .find((line) => line.startsWith("data:"))
        ?.slice("data:".length) ?? "{}")
    : text;
  const parsed = JSON.parse(payload) as { result?: Record<string, unknown> };
  return parsed.result ?? {};
}

async function call(
  method: string,
  params: unknown
): Promise<Record<string, unknown>> {
  await POST(
    rpc(
      "initialize",
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      },
      1
    )
  );
  return rpcResult(await POST(rpc(method, params, 2)));
}

describe("POST /api/mcp", () => {
  it("advertises the six public tools of the agent surface", async () => {
    base.client = fakeClient({});

    const result = await call("tools/list", {});
    const names = (result.tools as { name: string }[]).map((tool) => tool.name);

    expect(names.sort()).toEqual([
      "get_assets",
      "get_credit_pool",
      "get_market_state",
      "get_position",
      "prepare_open",
      "quote_open",
    ]);
  });

  it("answers a tool call with the same payload the HTTP surface returns", async () => {
    base.client = fakeClient({
      latestObservation: () => observation(ORACLE_STATE.LIVE),
    });

    const result = await call("tools/call", {
      name: "get_market_state",
      arguments: { asset: "NVDAc" },
    });
    const text = (result.content as { text: string }[])[0]?.text ?? "{}";

    expect(JSON.parse(text)).toMatchObject({
      ok: true,
      asset: "NVDAc",
      pricing: "live",
      canOpenLeveragedPosition: true,
    });
    expect(result.isError).toBe(false);
  });

  it("does not flag an unavailable market as a tool failure", async () => {
    base.client = fakeClient(
      openSnapshotReads({ oracleState: ORACLE_STATE.HELD })
    );

    const result = await call("tools/call", {
      name: "quote_open",
      arguments: {
        asset: "NVDAc",
        stockAmount: "1000000",
        leverage: 12_500,
      },
    });
    const text = (result.content as { text: string }[])[0]?.text ?? "{}";

    expect(JSON.parse(text)).toMatchObject({
      ok: false,
      code: "PRICING_UNAVAILABLE",
    });
    expect(result.isError).toBe(false);
  });

  it("does not flag a closed-to-opens rail as a tool failure", async () => {
    base.client = fakeClient(openSnapshotReads({ openingEnabled: false }));

    const result = await call("tools/call", {
      name: "quote_open",
      arguments: {
        asset: "NVDAc",
        stockAmount: "1000000",
        leverage: 12_500,
      },
    });
    const text = (result.content as { text: string }[])[0]?.text ?? "{}";

    expect(JSON.parse(text)).toMatchObject({
      ok: false,
      code: "ASSET_OPENING_DISABLED",
    });
    expect(result.isError).toBe(false);
  });

  it("flags a caller mistake as a tool error so the model corrects it", async () => {
    base.client = fakeClient({});

    const result = await call("tools/call", {
      name: "get_market_state",
      arguments: { asset: "TSLAc" },
    });

    expect(result.isError).toBe(true);
  });
});
