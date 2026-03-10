import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Redis client — uses Upstash in production, in-memory store for local dev
// ---------------------------------------------------------------------------

function createRedisOrMemory() {
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return Redis.fromEnv();
  }
  // No Upstash configured — fall back to ephemeral in-memory map.
  // Fine for local dev; every cold start resets counters.
  return undefined;
}

const redis = createRedisOrMemory();

/** Create a rate limiter only when Redis is configured. Returns null otherwise. */
function createLimit(
  prefix: string,
  requests: number,
  window: "30 s" | "1 m"
): Ratelimit | null {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix,
    analytics: true,
    ephemeralCache: new Map(),
  });
}

// ---------------------------------------------------------------------------
// Pre-configured rate limiters (sliding window)
// Only instantiated when Upstash Redis is configured; null in local dev.
// ---------------------------------------------------------------------------

/** /api/agent/cycle — 1 request per 30 seconds per trader */
export const agentCycleLimit = createLimit("rl:agent-cycle", 1, "30 s");

/** /api/deal/enter — 10 requests per minute per wallet */
export const dealEnterLimit = createLimit("rl:deal-enter", 10, "1 m");

/** /api/prompt/suggest — 5 requests per minute per wallet */
export const promptSuggestLimit = createLimit("rl:prompt-suggest", 5, "1 m");

/** /api/desk/* — 30 requests per minute per wallet */
export const deskLimit = createLimit("rl:desk", 30, "1 m");

/** /api/trader/* — 30 requests per minute per wallet */
export const traderLimit = createLimit("rl:trader", 30, "1 m");

// ---------------------------------------------------------------------------
// Helper: apply rate limit and return 429 if exceeded
// ---------------------------------------------------------------------------

/**
 * Check rate limit for a given limiter and identifier.
 * Returns `null` if the request is allowed, or a 429 NextResponse if limited.
 * Skips rate limiting when Redis is not configured (local dev) or limiter is null.
 *
 * Usage in a route handler:
 * ```ts
 * const limited = await checkRateLimit(dealEnterLimit, walletAddress);
 * if (limited) return limited;
 * ```
 */
export async function checkRateLimit(
  limiter: Ratelimit | null,
  identifier: string
): Promise<NextResponse | null> {
  if (!limiter) return null;

  const { success, limit, reset } = await limiter.limit(identifier);

  if (!success) {
    const retryAfter = Math.ceil((reset - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(reset),
        },
      }
    );
  }

  return null;
}

/**
 * Extract a client identifier from the request.
 * Uses wallet address when available (passed in), otherwise falls back to IP.
 */
export function getClientIdentifier(
  request: NextRequest,
  walletAddress?: string | null
): string {
  if (walletAddress) return walletAddress.toLowerCase();

  // Fall back to IP for unauthenticated routes
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  return `ip:${ip}`;
}
