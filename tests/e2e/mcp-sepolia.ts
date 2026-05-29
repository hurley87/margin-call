#!/usr/bin/env tsx
/**
 * Manual end-to-end smoke test for the Margin Call MCP API against a live
 * Base Sepolia deployment. NOT run in CI — invoke manually before
 * publishing `@margin-call/mcp-server` or after any significant change to
 * the `/api/mcp/*` routes, `convex/mcp/*` HTTP actions, or escrow contracts.
 *
 * Sequence (each step prints `[tool durationMs] result-snippet`):
 *   1. get_desk
 *   2. sync_wallet
 *   3. list_traders / list_deals
 *   4. create_trader (fresh idempotencyKey)
 *   5. create_trader REPEAT (same key) → asserts `cached: true`
 *   6. set_desk_wallet (if desk unbound; uses desk wallet or MARGIN_CALL_DESK_WALLET)
 *   7. fund_trader / withdraw_from_trader / create_deal / close_deal → prepare phase only
 *      (on-chain execution requires Base MCP + confirm_intent — manual)
 *
 * Hard-fails on any non-2xx. Logs but does not abort if the desk lacks
 * funds for a given step (so partial runs against a fresh testnet desk
 * surface the funding hint rather than crashing).
 *
 * Usage:
 *   MARGIN_CALL_MCP_KEY=mc_live_... \
 *   MARGIN_CALL_API_URL=https://deployment.example.com \
 *   pnpm tsx tests/e2e/mcp-sepolia.ts
 */

import { randomUUID } from "node:crypto";
import readline from "node:readline/promises";

const API_URL = (
  process.env.MARGIN_CALL_API_URL ?? "http://localhost:3000"
).replace(/\/$/, "");
const API_KEY = process.env.MARGIN_CALL_MCP_KEY ?? "";

if (!API_KEY) {
  console.error(
    "FATAL: MARGIN_CALL_MCP_KEY is required. Issue one via the operator dialog or POST /api/mcp/keys."
  );
  process.exit(1);
}

type JsonRecord = Record<string, unknown>;

function shortPreview(json: unknown): string {
  const s = JSON.stringify(json);
  if (s.length <= 120) return s;
  return `${s.slice(0, 117)}…`;
}

async function call(
  method: "GET" | "POST",
  path: string,
  body?: JsonRecord,
  opts?: { allowFail?: boolean }
): Promise<JsonRecord> {
  const started = Date.now();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: JsonRecord;
  try {
    json = JSON.parse(text) as JsonRecord;
  } catch {
    json = { raw: text };
  }
  const durationMs = Date.now() - started;
  const tool = path.replace("/api/mcp/", "");
  if (!res.ok) {
    // allowFail: surface the error but let the caller decide whether it is an
    // expected outcome (e.g. withdraw before any confirmed deposit) vs a real
    // failure. The returned envelope is tagged so the caller can branch on it.
    if (opts?.allowFail) {
      console.warn(
        `⚠️  [${tool} ${durationMs}ms] ${res.status} ${shortPreview(json)}`
      );
      return { ...json, _httpStatus: res.status, _failed: true };
    }
    console.error(
      `❌ [${tool} ${durationMs}ms] ${res.status} ${shortPreview(json)}`
    );
    throw new Error(`${tool} failed with status ${res.status}`);
  }
  console.log(`✓ [${tool} ${durationMs}ms] ${shortPreview(json)}`);
  return json;
}

async function pause(question: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  await rl.question(
    `\n⚠️  ${question}\n   Press Enter to continue, Ctrl-C to abort: `
  );
  rl.close();
}

async function main() {
  console.log(`Margin Call MCP smoke test → ${API_URL}`);
  console.log(`Key suffix: …${API_KEY.slice(-4)}\n`);

  // 1. Desk snapshot.
  const desk = (await call("GET", "/api/mcp/desks")) as JsonRecord & {
    walletAddress?: string;
    walletBalanceUsdc?: number;
    summary?: string;
  };
  const bindAddress = process.env.MARGIN_CALL_DESK_WALLET ?? desk.walletAddress;
  if (!desk.walletAddress && bindAddress) {
    await call("POST", "/api/mcp/desks/set-wallet", {
      walletAddress: bindAddress,
    });
    desk.walletAddress = bindAddress;
  }
  if (!desk.walletAddress) {
    throw new Error(
      "Desk wallet not bound — set MARGIN_CALL_DESK_WALLET or call set_desk_wallet"
    );
  }

  // 2. Refresh on-chain balance BEFORE gating. get_desk only returns the cached
  // walletBalanceUsdc (0 for a freshly-bound desk); sync-wallet performs the live
  // balanceOf read and writes it back, so it must run before the funding check.
  const sync = (await call(
    "GET",
    "/api/mcp/desks/sync-wallet"
  )) as JsonRecord & {
    balanceUsdc?: number;
  };
  const syncedBalance = sync.balanceUsdc ?? desk.walletBalanceUsdc ?? 0;
  if (syncedBalance <= 0) {
    console.warn(
      `\n⚠️  Desk balance is ${syncedBalance} USDC after sync. ${desk.summary ?? ""}`
    );
    console.warn(
      `   Send Base Sepolia USDC to ${desk.walletAddress} and re-run.`
    );
    return;
  }

  // 3. Read surfaces.
  await call("GET", "/api/mcp/traders?limit=5");
  await call("GET", "/api/mcp/deals?limit=5");
  await call("GET", "/api/mcp/activity?limit=5");
  await call("GET", "/api/mcp/outcomes?limit=5");
  await call("GET", "/api/mcp/approvals?limit=5");

  // 4. Create trader (fresh key).
  const createKey = randomUUID();
  const traderRes = (await call("POST", "/api/mcp/traders/create", {
    name: `Smoke${Date.now().toString().slice(-6)}`,
    mandate: { keywords: ["test"] },
    personality: "Cautious smoke-test trader.",
    idempotencyKey: createKey,
  })) as JsonRecord & { traderId?: string };

  // 5. Replay with the same key — must return cached: true.
  const replay = (await call("POST", "/api/mcp/traders/create", {
    name: "ignored",
    idempotencyKey: createKey,
  })) as JsonRecord & { cached?: boolean };
  if (!replay.cached) {
    throw new Error("Idempotency replay did not return cached: true");
  }
  console.log("  → Idempotency replay confirmed (cached: true).");

  const traderId = traderRes.traderId;
  if (typeof traderId !== "string") {
    throw new Error("create_trader did not return a traderId");
  }

  // 6. Treasury prepare (BYO — confirm via Base MCP is manual).
  const fundPrep = (await call("POST", `/api/mcp/traders/${traderId}/fund`, {
    amountUsdc: 1,
    idempotencyKey: randomUUID(),
  })) as JsonRecord & { phase?: string; intentId?: string };
  if (fundPrep.phase !== "prepare" && !fundPrep.cached) {
    console.warn("  → fund_trader: expected phase=prepare (or cached confirm)");
  } else {
    console.log(
      "  → fund_trader prepare OK — execute calls via Base MCP, then POST /api/mcp/intents/confirm"
    );
  }

  // withdraw_from_trader gates on the trader's escrow balance, which is only
  // non-zero after a fund intent is executed via Base MCP + confirm_intent.
  // In this prepare-only smoke run a freshly-created trader always has 0 escrow,
  // so an "Insufficient escrow balance" 400/500 here is the expected outcome,
  // not a failure — only a different error should abort.
  const withdrawPrep = (await call(
    "POST",
    `/api/mcp/traders/${traderId}/withdraw`,
    {
      amountUsdc: 0.5,
      idempotencyKey: randomUUID(),
    },
    { allowFail: true }
  )) as JsonRecord & { phase?: string; _failed?: boolean; error?: string };
  if (withdrawPrep.phase === "prepare") {
    console.log("  → withdraw_from_trader prepare OK (confirm manually)");
  } else if (withdrawPrep._failed) {
    const msg = withdrawPrep.error ?? "";
    if (/insufficient escrow balance/i.test(msg)) {
      console.log(
        "  → withdraw_from_trader skipped (no confirmed escrow deposit yet — expected in prepare-only run)"
      );
    } else {
      throw new Error(`withdraw_from_trader failed unexpectedly: ${msg}`);
    }
  }

  // create_deal is gated by assertTradingHours() (9:30 AM–4:00 PM ET, Mon–Fri).
  // Outside those hours a "Market is closed" 400/500 is the expected outcome,
  // so tolerate it here; any other error still aborts.
  const dealPrep = (await call(
    "POST",
    "/api/mcp/deals/create",
    {
      prompt: `[smoke] A distressed airline merger rumor — ${Date.now()}`,
      potUsdc: 10,
      entryCostUsdc: 1,
      idempotencyKey: randomUUID(),
    },
    { allowFail: true }
  )) as JsonRecord & {
    phase?: string;
    dealId?: string;
    _failed?: boolean;
    error?: string;
  };

  if (dealPrep._failed) {
    const msg = dealPrep.error ?? "";
    if (/market is closed/i.test(msg)) {
      console.log(
        "  → create_deal skipped (market closed — expected outside trading hours)"
      );
    } else {
      throw new Error(`create_deal failed unexpectedly: ${msg}`);
    }
  } else if (dealPrep.phase === "prepare") {
    console.log("  → create_deal prepare OK (confirm manually before close)");
  } else if (typeof dealPrep.dealId === "string") {
    const closePrep = (await call("POST", "/api/mcp/deals/close", {
      dealId: dealPrep.dealId,
      idempotencyKey: randomUUID(),
    })) as JsonRecord & { phase?: string };
    if (closePrep.phase === "prepare") {
      console.log("  → close_deal prepare OK (confirm manually)");
    }
  }

  console.log(
    "\n✓ Smoke test completed (prepare-phase treasury; full on-chain flow needs Base MCP + confirm_intent)."
  );
}

main().catch((err) => {
  console.error("\n❌ Smoke test FAILED:", err);
  process.exit(1);
});
