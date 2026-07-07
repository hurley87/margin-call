"use node";

/**
 * CoinGecko price poller. Runs on its own hourly cron (NOT market-hours gated,
 * so overnight/weekend moves are captured and reported at the next open) and
 * writes one snapshot per registry token.
 *
 * Endpoint: the CoinGecko onchain (GeckoTerminal-derived) token endpoint, keyed
 * by Base contract address. These are small-cap tokens that do not resolve via
 * the listed-coins endpoint. A failed fetch writes an `ok: false` snapshot with
 * the error and NO fabricated numbers, and logs a flag — the token is never
 * silently dropped.
 */

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { TOKEN_REGISTRY } from "./tokenRegistry";
import { POLL_SPACING_MS } from "./priceConfig";
import { getTodayDateNY } from "../lib/tradingHours";

const CG_BASE = "https://api.coingecko.com/api/v3";
const FETCH_TIMEOUT_MS = 15_000;

interface ParsedSnapshot {
  address: string;
  symbol: string;
  priceUsd?: number;
  volume24hUsd?: number;
  marketCapUsd?: number;
  fdvUsd?: number;
  priceChange24hPct?: number;
  source: string;
  ok: boolean;
  error?: string;
  dayKey: string;
}

function num(x: unknown): number | undefined {
  if (x == null) return undefined;
  const n = typeof x === "number" ? x : parseFloat(String(x));
  return Number.isFinite(n) ? n : undefined;
}

/** Pick the deepest (highest-reserve) included pool for a token, if any. */
function topPoolAttrs(
  included:
    | Array<{ type?: string; attributes?: Record<string, unknown> }>
    | undefined
): Record<string, unknown> | undefined {
  if (!included) return undefined;
  const pools = included.filter((i) => i.type === "pool" && i.attributes);
  if (pools.length === 0) return undefined;
  pools.sort(
    (a, b) =>
      (num(b.attributes?.reserve_in_usd) ?? 0) -
      (num(a.attributes?.reserve_in_usd) ?? 0)
  );
  return pools[0].attributes;
}

async function fetchOnchainToken(
  addressLc: string,
  symbol: string,
  apiKey: string,
  dayKey: string
): Promise<ParsedSnapshot> {
  // include=top_pools so we also get the 24h price change, which the token
  // endpoint itself does not carry (it lives on the pool).
  const url = `${CG_BASE}/onchain/networks/base/tokens/${addressLc}?include=top_pools`;
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "x-cg-demo-api-key": apiKey },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        address: addressLc,
        symbol,
        source: "none",
        ok: false,
        error: `HTTP ${res.status} ${body.slice(0, 200)}`,
        dayKey,
      };
    }
    const json = (await res.json()) as {
      data?: { attributes?: Record<string, unknown> };
      included?: Array<{ type?: string; attributes?: Record<string, unknown> }>;
    };
    const attr = json?.data?.attributes;
    const price = num(attr?.price_usd);
    if (!attr || price == null) {
      return {
        address: addressLc,
        symbol,
        source: "none",
        ok: false,
        error: "no price_usd in onchain response",
        dayKey,
      };
    }
    const vol = attr.volume_usd as Record<string, unknown> | undefined;
    const pool = topPoolAttrs(json.included);
    const poolChg = pool?.price_change_percentage as
      | Record<string, unknown>
      | undefined;
    return {
      address: addressLc,
      symbol,
      priceUsd: price,
      volume24hUsd: num(vol?.h24),
      marketCapUsd: num(attr.market_cap_usd),
      fdvUsd: num(attr.fdv_usd),
      priceChange24hPct: num(poolChg?.h24),
      source: "coingecko-onchain",
      ok: true,
      dayKey,
    };
  } catch (err) {
    return {
      address: addressLc,
      symbol,
      source: "none",
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      dayKey,
    };
  }
}

export const pollPrices = internalAction({
  args: {},
  handler: async (ctx) => {
    // Reconcile company entities from the registry first (hot-swap support).
    await ctx.runMutation(internal.wire.registrySync.syncRegistryEntities, {});

    const apiKey = process.env.COINGECKO_API_KEY;
    if (!apiKey) {
      console.error(
        "[wire/pricePoll] COINGECKO_API_KEY not set — writing failure snapshots"
      );
    }

    const now = Date.now();
    const dayKey = getTodayDateNY(now);
    const snapshots: ParsedSnapshot[] = [];

    for (const token of TOKEN_REGISTRY) {
      if (!apiKey) {
        snapshots.push({
          address: token.addressLc,
          symbol: token.symbol,
          source: "none",
          ok: false,
          error: "COINGECKO_API_KEY not set",
          dayKey,
        });
        continue;
      }
      const snap = await fetchOnchainToken(
        token.addressLc,
        token.symbol,
        apiKey,
        dayKey
      );
      if (!snap.ok) {
        console.error(
          `[wire/pricePoll] unresolved ${token.symbol} (${token.addressLc}): ${snap.error}`
        );
      }
      snapshots.push(snap);
      // Space calls to respect Demo-tier rate limits.
      await new Promise((r) => setTimeout(r, POLL_SPACING_MS));
    }

    await ctx.runMutation(internal.wire.priceStore.insertSnapshots, {
      snapshots,
    });

    const okCount = snapshots.filter((s) => s.ok).length;
    console.log(
      `[wire/pricePoll] wrote ${snapshots.length} snapshots (${okCount} ok, ${snapshots.length - okCount} failed)`
    );
    return { total: snapshots.length, ok: okCount };
  },
});
