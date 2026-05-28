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
 *   6. fund_trader 1 USDC → withdraw_from_trader 0.5 USDC
 *   7. register_withdraw_address (pauses for the browser ceremony)
 *   8. withdraw_to_address 0.1 USDC (after ceremony)
 *   9. create_deal 10 USDC pot / 1 USDC entry → close_deal
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
  body?: JsonRecord
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
  if (!desk.walletAddress) {
    throw new Error("Desk has no wallet address — issue a fresh key");
  }
  if ((desk.walletBalanceUsdc ?? 0) <= 0) {
    console.warn(
      `\n⚠️  Desk balance is ${desk.walletBalanceUsdc ?? 0} USDC. ${desk.summary ?? ""}`
    );
    console.warn(
      `   Send Base Sepolia USDC to ${desk.walletAddress} and re-run.`
    );
    return;
  }

  // 2. Refresh on-chain balance.
  await call("GET", "/api/mcp/desks/sync-wallet");

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

  // 6. Fund + withdraw small amounts.
  await call("POST", `/api/mcp/traders/${traderId}/fund`, {
    amountUsdc: 1,
    idempotencyKey: randomUUID(),
  });
  await call("POST", `/api/mcp/traders/${traderId}/withdraw`, {
    amountUsdc: 0.5,
    idempotencyKey: randomUUID(),
  });

  // 7. Register a withdrawal address — pauses for the browser ceremony.
  const destAddr =
    process.env.MARGIN_CALL_SMOKE_DEST_ADDRESS ?? desk.walletAddress;
  const regRes = (await call(
    "POST",
    "/api/mcp/desks/register-withdraw-address",
    {
      address: destAddr,
      idempotencyKey: randomUUID(),
    }
  ).catch((e) => {
    console.warn(
      `(register_withdraw_address surfaced expected ceremony pause: ${(e as Error).message})`
    );
    return { ok: false, pending: true } as JsonRecord;
  })) as JsonRecord & { ok?: boolean; pending?: boolean };

  if (regRes.pending) {
    await pause(
      `Open the Margin Call web app → MCP operator dialog → confirm withdrawal address ${destAddr} for this desk.`
    );
    // Re-register after ceremony to append the address.
    await call("POST", "/api/mcp/desks/register-withdraw-address", {
      address: destAddr,
      idempotencyKey: randomUUID(),
    });
  }

  // 8. Withdraw to the now-allowlisted address.
  await call("POST", "/api/mcp/desks/withdraw-to-address", {
    address: destAddr,
    amountUsdc: 0.1,
    idempotencyKey: randomUUID(),
  });

  // 9. Create + close a deal (requires market hours).
  const dealRes = (await call("POST", "/api/mcp/deals/create", {
    prompt: `[smoke] A distressed airline merger rumor — ${Date.now()}`,
    potUsdc: 10,
    entryCostUsdc: 1,
    idempotencyKey: randomUUID(),
  })) as JsonRecord & { dealId?: string };

  if (typeof dealRes.dealId === "string") {
    await call("POST", "/api/mcp/deals/close", {
      dealId: dealRes.dealId,
      idempotencyKey: randomUUID(),
    });
  }

  console.log("\n✓ All smoke-test steps completed successfully.");
}

main().catch((err) => {
  console.error("\n❌ Smoke test FAILED:", err);
  process.exit(1);
});
