import type { Event } from "@sentry/nextjs";

const PRODUCTION_ENVIRONMENTS = new Set(["production", "vercel-production"]);
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Resolve a stable Sentry environment value across local, preview, and production runtimes.
 */
export function resolveSentryEnvironment(
  nodeEnv: string | undefined,
  vercelEnv: string | undefined,
): string {
  const effectiveNodeEnv = nodeEnv ?? process.env.NODE_ENV;
  const effectiveVercelEnv = vercelEnv ?? process.env.VERCEL_ENV;

  if (effectiveVercelEnv === "production") {
    return "vercel-production";
  }

  if (effectiveNodeEnv === "test") {
    return "development";
  }

  if (effectiveNodeEnv && effectiveNodeEnv.length > 0) {
    return effectiveNodeEnv;
  }

  return "development";
}

/**
 * Restrict event delivery to production-like environments.
 */
export function isSentryEnabled(environment: string): boolean {
  return PRODUCTION_ENVIRONMENTS.has(environment);
}

/**
 * Detect local URLs, including bracketed IPv6 loopback.
 */
export function isLocalUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) {
    return false;
  }

  try {
    const parsedUrl = new URL(rawUrl);
    const normalizedHostname = parsedUrl.hostname
      .replace(/^\[/, "")
      .replace(/\]$/, "");

    return LOCAL_HOSTNAMES.has(normalizedHostname);
  } catch {
    return false;
  }
}

/**
 * Drop non-production and localhost/loopback events to reduce noisy ingestion.
 */
export function beforeSendFilter(event: Event, defaultEnvironment: string): Event | null {
  const eventEnvironment = event.environment ?? defaultEnvironment;
  if (!isSentryEnabled(eventEnvironment)) {
    return null;
  }

  const requestUrl = event.request?.url;
  if (isLocalUrl(requestUrl)) {
    return null;
  }

  return event;
}
