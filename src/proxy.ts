import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Rate limiters for broad route groups (desk/*, trader/*)
// These run in Next.js proxy before the route handler.
// ---------------------------------------------------------------------------

const hasRedis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;

function createLimiter(prefix: string, requests: number, window: string) {
  if (!hasRedis) return null;

  return new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(
      requests,
      window as Parameters<typeof Ratelimit.slidingWindow>[1]
    ),
    prefix,
    analytics: true,
  });
}

const deskLimiter = createLimiter("rl:desk", 30, "1 m");
const traderLimiter = createLimiter("rl:trader", 30, "1 m");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getIdentifier(request: NextRequest): string {
  // Try to extract wallet from Bearer token isn't feasible in proxy
  // (Privy verification is async and heavy). Key by IP instead — the
  // per-route handlers already do wallet-level checks for sensitive routes.
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  return `ip:${ip}`;
}

function rateLimitResponse(reset: number, limit: number): NextResponse {
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

// ---------------------------------------------------------------------------
// Proxy
// ---------------------------------------------------------------------------

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const identifier = getIdentifier(request);

  let limiter: Ratelimit | null = null;

  if (pathname.startsWith("/api/desk/")) {
    limiter = deskLimiter;
  } else if (pathname.startsWith("/api/trader/")) {
    limiter = traderLimiter;
  }

  if (limiter) {
    const { success, limit, remaining, reset } =
      await limiter.limit(identifier);
    if (!success) {
      return rateLimitResponse(reset, limit);
    }

    // Attach rate limit info as headers on the forwarded request.
    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Limit", String(limit));
    response.headers.set("X-RateLimit-Remaining", String(remaining));
    response.headers.set("X-RateLimit-Reset", String(reset));
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/desk/:path*", "/api/trader/:path*"],
};
