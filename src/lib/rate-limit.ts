import type { Ratelimit } from "@upstash/ratelimit";
import { NextRequest, NextResponse } from "next/server";

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
