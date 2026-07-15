/**
 * Token registry — the single source of truth for which companies the wire
 * covers. Pure module: safe to import from both Node actions and V8 functions.
 *
 * The data lives in the repo-root `tokens.json` so it can be edited without
 * touching any logic. It is imported and Zod-validated AT MODULE LOAD — a
 * malformed entry throws immediately, so `pnpm build` / CI / the first cron
 * tick fails loudly rather than silently covering a broken company.
 *
 * Editing `tokens.json` (add / remove / edit an entry) takes effect on the next
 * Convex deploy — no code changes required. `registrySync.ts` reconciles the
 * `narrativeEntities` company rows from this registry each cycle.
 *
 * CONTRACT ADDRESSES ARE AUTHORITATIVE AND HUMAN-SUPPLIED. Never look up,
 * guess, or "correct" an address in code — name collisions and impersonation
 * deployments make self-service lookup a correctness/safety hazard.
 *
 * Endpoint family per token (see pricePoll.ts): all twelve seed companies are
 * small-cap Base tokens that resolve via the CoinGecko **onchain**
 * (GeckoTerminal-derived) endpoint `/onchain/networks/base/tokens/{address}`,
 * not the listed-coins `/coins/base/contract/{address}` endpoint. The poller
 * records the endpoint that resolved each address in the snapshot's `source`
 * field and flags any address that resolves via neither.
 */

import { z } from "zod";
import rawTokens from "../../tokens.json";

const TokenEntrySchema = z.object({
  /** Ticker, uppercase, e.g. "SEARXLY". Also the entity slug (lowercased). */
  symbol: z
    .string()
    .min(1)
    .regex(/^[A-Z0-9]+$/, "symbol must be uppercase alphanumeric"),
  /** Company-style display name, e.g. "Surplus Intelligence". */
  companyName: z.string().min(1),
  /** X / Twitter handle, must start with "@". */
  xHandle: z.string().regex(/^@[A-Za-z0-9_]{1,15}$/, "xHandle must be @handle"),
  /** Base contract address (human-supplied, authoritative). */
  address: z
    .string()
    .regex(
      /^0x[0-9a-fA-F]{40}$/,
      "address must be a 0x-prefixed 40-hex string"
    ),
  /** Optional editorial notes: running jokes, persona, stance. */
  notes: z.string().optional(),
  /** True for the house token (HARNESS) — coverage stance is harder. */
  isHouseToken: z.boolean().optional(),
});

export type TokenEntry = z.infer<typeof TokenEntrySchema> & {
  /** Lowercased address, the canonical key for snapshots + entities. */
  addressLc: string;
  /** Entity slug = lowercased symbol. */
  slug: string;
};

function loadRegistry(): TokenEntry[] {
  const parsed = z.array(TokenEntrySchema).min(1).safeParse(rawTokens);
  if (!parsed.success) {
    throw new Error(
      `[tokenRegistry] tokens.json failed validation: ${parsed.error.message}`
    );
  }
  const entries = parsed.data;

  // Uniqueness: symbols, slugs, and addresses must not collide.
  const seenSymbol = new Set<string>();
  const seenAddress = new Set<string>();
  for (const e of entries) {
    if (seenSymbol.has(e.symbol)) {
      throw new Error(`[tokenRegistry] duplicate symbol: ${e.symbol}`);
    }
    seenSymbol.add(e.symbol);
    const addressLc = e.address.toLowerCase();
    if (seenAddress.has(addressLc)) {
      throw new Error(`[tokenRegistry] duplicate address: ${e.address}`);
    }
    seenAddress.add(addressLc);
  }

  // At most one house token.
  const houseCount = entries.filter((e) => e.isHouseToken).length;
  if (houseCount > 1) {
    throw new Error(
      `[tokenRegistry] at most one house token allowed, found ${houseCount}`
    );
  }

  return entries.map((e) => ({
    ...e,
    addressLc: e.address.toLowerCase(),
    slug: e.symbol.toLowerCase(),
  }));
}

/** Validated registry — throws at import time if tokens.json is malformed. */
export const TOKEN_REGISTRY: TokenEntry[] = loadRegistry();

const BY_ADDRESS = new Map(TOKEN_REGISTRY.map((t) => [t.addressLc, t]));
const BY_SYMBOL = new Map(TOKEN_REGISTRY.map((t) => [t.symbol, t]));
const BY_SLUG = new Map(TOKEN_REGISTRY.map((t) => [t.slug, t]));
const BY_HANDLE = new Map(
  TOKEN_REGISTRY.map((t) => [t.xHandle.toLowerCase(), t])
);

export function tokenByAddress(address: string): TokenEntry | undefined {
  return BY_ADDRESS.get(address.toLowerCase());
}

export function tokenBySymbol(symbol: string): TokenEntry | undefined {
  return BY_SYMBOL.get(symbol.toUpperCase());
}

export function tokenBySlug(slug: string): TokenEntry | undefined {
  return BY_SLUG.get(slug.toLowerCase());
}

/** Lookup by `@handle` (case-insensitive). Accepts with or without leading `@`. */
export function tokenByHandle(handle: string): TokenEntry | undefined {
  const normalized = handle.trim().startsWith("@")
    ? handle.trim().toLowerCase()
    : `@${handle.trim().toLowerCase()}`;
  return BY_HANDLE.get(normalized);
}

export function houseToken(): TokenEntry | undefined {
  return TOKEN_REGISTRY.find((t) => t.isHouseToken);
}
