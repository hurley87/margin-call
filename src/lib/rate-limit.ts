import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

function createRedisOrMemory() {
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return Redis.fromEnv();
  }
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

/** /api/siwa/nonce — 20 requests per minute per IP */
export const siwaNonceLimit = createLimit("rl:siwa-nonce", 20, "1 m");

/**
 * Check rate limit for a given limiter and identifier.
 * Returns `null` if the request is allowed, or a 429 NextResponse if limited.
 * Skips rate limiting when Redis is not configured (local dev) or limiter is null.
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

  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  return `ip:${ip}`;
}
